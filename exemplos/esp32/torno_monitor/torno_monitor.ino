// Exemplo de firmware: ESP32 como servidor WebSocket enviando as cinco grandezas do torno, sem broker.
// O app conecta direto no IP do ESP32: ⚙ Configurações → "WebSocket direto no ESP32" → IP e porta 81.
// Bibliotecas (Gerenciador de Bibliotecas da Arduino IDE): WebSockets (Markus Sattler), OneWire, DallasTemperature.
//
// Envia a cada 500 ms, para todos os navegadores conectados:
//   {"temperatura":41.2,"oleo":78.0,"corrente":12.40,"vibracao":1.15,"rotacao":800}
// Sem campo "ts": o app usa a hora de chegada (na rede local o atraso é desprezível).
//
// O IP aparece no Monitor Serial (115200 baud) ao conectar no Wi-Fi. Para ele não mudar entre uma aula e outra,
// ligue IP_FIXO (escolha um endereço livre da faixa da rede) ou reserve o IP do ESP32 no roteador.
// Sem o ESP32 em mãos, "npm run esp32-falso" simula este firmware no computador.
//
// ATENÇÃO: as funções marcadas com "ADAPTE" dependem do sensor escolhido e da instalação.
// Instrumentar uma máquina exige avaliação de segurança (NR-10 / NR-12): use transformador de
// corrente de núcleo dividido (sem abrir circuito), fixe sensores fora da área de risco e
// não interfira nos dispositivos de segurança da máquina.

#include <WiFi.h>
#include <WebSocketsServer.h>
#include <OneWire.h>
#include <DallasTemperature.h>

// ---------- rede
const char* WIFI_SSID = "WIFI_IOT_CFP601";
const char* WIFI_SENHA = "iot@senai601";
const uint16_t PORTA_WS = 81;  // deve ser igual à "Porta" do app

// IP fixo (opcional). Com false, o roteador escolhe o IP (DHCP) e ele aparece no Monitor Serial.
const bool IP_FIXO = false;
IPAddress IP_ESP32(192, 168, 0, 50);  // ADAPTE à faixa da sua rede
IPAddress GATEWAY(192, 168, 0, 1);    // IP do roteador
IPAddress MASCARA(255, 255, 255, 0);

// ---------- pinos para ESP32-C3 Mini (ADAPTE). No C3 só GPIO0–4 têm ADC1; evite GPIO2, 8 e 9 (boot).
const int PINO_DS18B20 = 5;        // temperatura da carcaça do cabeçote
const int PINO_NIVEL = 0;          // sensor de nível analógico (0–3,3 V) ou chave de boia
const int PINO_CORRENTE = 1;       // saída do condicionador do TC (ex.: SCT-013 + circuito de polarização)
const int PINO_VIBRACAO = 3;       // transmissor de vibração com saída proporcional a mm/s RMS
const int PINO_PULSO_ROTACAO = 4;  // sensor indutivo/hall: 1 pulso por volta do eixo-árvore

WebSocketsServer servidor(PORTA_WS);
OneWire barramento(PINO_DS18B20);
DallasTemperature termometro(&barramento);

volatile uint32_t pulsos = 0;
void IRAM_ATTR aoPulso() { pulsos++; }

// ---------- leituras (ADAPTE à calibração dos seus sensores)
float lerTemperatura() {
  // leitura assíncrona: pega a conversão pedida no ciclo anterior e já pede a próxima
  float t = termometro.getTempCByIndex(0);
  termometro.requestTemperatures();
  return t == DEVICE_DISCONNECTED_C ? NAN : t;
}

float lerNivelOleo() {
  // Sensor contínuo: converte a tensão em porcentagem (calibre vazio/cheio no reservatório).
  // Com chave de boia, retorne 1 (nível OK) ou 0 (baixo) e configure "sensor": "boia" no app.
  const float vazio = 300, cheio = 3500;  // leituras do ADC (ADAPTE)
  float bruto = analogRead(PINO_NIVEL);
  return constrain((bruto - vazio) * 100.0 / (cheio - vazio), 0, 100);
}

float lerCorrente() {
  // RMS em janela de ~100 ms (6 ciclos de 60 Hz). Ganho depende do TC e do resistor de carga.
  const float ganho = 0.0123;  // A por unidade de ADC (ADAPTE na calibração com alicate amperímetro)
  const int amostras = 1000;
  double soma = 0;
  static float offset = 2048;
  uint32_t inicio = micros();
  for (int i = 0; i < amostras; i++) {
    float v = analogRead(PINO_CORRENTE);
    offset += (v - offset) / 1024.0;  // acompanha o nível médio (polarização)
    float c = v - offset;
    soma += c * c;
    while (micros() - inicio < (uint32_t)(i + 1) * 100) {}
  }
  return sqrt(soma / amostras) * ganho;
}

float lerVibracao() {
  // Mais simples e confiável: transmissor que já entrega velocidade RMS (mm/s), ex. 4–20 mA
  // convertido para tensão. Calcular RMS de velocidade a partir de um acelerômetro exige
  // filtragem e integração — tema para uma etapa futura.
  const float mmsPorVolt = 10.0 / 3.3;  // ADAPTE à faixa do transmissor
  return analogRead(PINO_VIBRACAO) * 3.3 / 4095.0 * mmsPorVolt;
}

float lerRotacao(uint32_t intervaloMs) {
  noInterrupts();
  uint32_t n = pulsos;
  pulsos = 0;
  interrupts();
  return n * 60000.0 / intervaloMs;  // 1 pulso por volta
}

// ---------- conexão
void conectarWifi() {
  WiFi.mode(WIFI_STA);
  if (IP_FIXO && !WiFi.config(IP_ESP32, GATEWAY, MASCARA)) Serial.println("Falha ao aplicar o IP fixo; usando DHCP");
  WiFi.begin(WIFI_SSID, WIFI_SENHA);
  Serial.print("Conectando ao Wi-Fi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(300);
    Serial.print(".");
  }
  Serial.println();
  Serial.print("Conectado. No app, use o IP ");
  Serial.print(WiFi.localIP());
  Serial.print(" e a porta ");
  Serial.println(PORTA_WS);
}

void aoEventoWebSocket(uint8_t cliente, WStype_t tipo, uint8_t* dados, size_t tamanho) {
  if (tipo == WStype_CONNECTED) {
    Serial.printf("+ navegador %u conectado (%s)\n", cliente, servidor.remoteIP(cliente).toString().c_str());
  } else if (tipo == WStype_DISCONNECTED) {
    Serial.printf("- navegador %u desconectado\n", cliente);
  }
}

void setup() {
  Serial.begin(115200);
  analogReadResolution(12);
  pinMode(PINO_PULSO_ROTACAO, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(PINO_PULSO_ROTACAO), aoPulso, FALLING);
  termometro.begin();
  termometro.setResolution(10);            // ~190 ms por conversão
  termometro.setWaitForConversion(false);  // não bloqueia o laço de 500 ms
  termometro.requestTemperatures();
  conectarWifi();
  servidor.begin();
  servidor.onEvent(aoEventoWebSocket);
  servidor.enableHeartbeat(15000, 3000, 2);  // derruba navegadores que sumiram sem fechar a conexão
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) conectarWifi();
  servidor.loop();

  static uint32_t ultimo = millis();
  uint32_t agora = millis();
  if (agora - ultimo < 500) return;
  uint32_t intervalo = agora - ultimo;
  ultimo = agora;

  char msg[200];
  float temp = lerTemperatura();
  snprintf(msg, sizeof msg, "{\"temperatura\":%s,\"oleo\":%.1f,\"corrente\":%.2f,\"vibracao\":%.2f,\"rotacao\":%.0f}",
           isnan(temp) ? "null" : String(temp, 1).c_str(), lerNivelOleo(), lerCorrente(), lerVibracao(),
           lerRotacao(intervalo));
  servidor.broadcastTXT(msg);
}
