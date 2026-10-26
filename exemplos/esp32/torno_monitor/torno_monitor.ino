// Exemplo de firmware: ESP32 publicando as cinco grandezas do torno via MQTT.
// Bibliotecas (Gerenciador de Bibliotecas da Arduino IDE): PubSubClient, OneWire, DallasTemperature.
//
// Publica a cada 500 ms em <TOPICO_BASE>/leituras:
//   {"ts":1760000000000,"temperatura":41.2,"oleo":78,"corrente":12.4,"vibracao":1.15,"rotacao":800}
// e mantém <TOPICO_BASE>/status = "online" (Last Will "offline").
//
// ATENÇÃO: as funções marcadas com "ADAPTE" dependem do sensor escolhido e da instalação.
// Instrumentar uma máquina exige avaliação de segurança (NR-10 / NR-12): use transformador de
// corrente de núcleo dividido (sem abrir circuito), fixe sensores fora da área de risco e
// não interfira nos dispositivos de segurança da máquina.

#include <WiFi.h>
#include <PubSubClient.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <time.h>

// ---------- rede e broker
const char* WIFI_SSID = "SUA_REDE";
const char* WIFI_SENHA = "SUA_SENHA";
const char* BROKER = "192.168.0.10";  // IP do computador com o broker (npm run broker ou Mosquitto)
const uint16_t PORTA = 1883;
const char* TOPICO_BASE = "senai/torno01";

// ---------- pinos (ADAPTE)
const int PINO_DS18B20 = 4;        // temperatura da carcaça do cabeçote
const int PINO_NIVEL = 34;         // sensor de nível analógico (0–3,3 V) ou chave de boia
const int PINO_CORRENTE = 35;      // saída do condicionador do TC (ex.: SCT-013 + circuito de polarização)
const int PINO_VIBRACAO = 32;      // transmissor de vibração com saída proporcional a mm/s RMS
const int PINO_PULSO_ROTACAO = 27; // sensor indutivo/hall: 1 pulso por volta do eixo-árvore

WiFiClient wifi;
PubSubClient mqtt(wifi);
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
  double soma = 0, media = 0;
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
  WiFi.begin(WIFI_SSID, WIFI_SENHA);
  while (WiFi.status() != WL_CONNECTED) delay(300);
  configTime(-3 * 3600, 0, "pool.ntp.org");  // horário para o campo "ts"
}

void conectarMqtt() {
  String status = String(TOPICO_BASE) + "/status";
  while (!mqtt.connected()) {
    String id = "esp32-torno-" + String((uint32_t)ESP.getEfuseMac(), HEX);
    if (mqtt.connect(id.c_str(), status.c_str(), 1, true, "offline")) {
      mqtt.publish(status.c_str(), "online", true);
    } else {
      delay(2000);
    }
  }
}

uint64_t agoraMs() {
  struct timeval tv;
  gettimeofday(&tv, nullptr);
  if (tv.tv_sec < 1700000000) return 0;  // NTP ainda não sincronizou: o app usa a hora de chegada
  return (uint64_t)tv.tv_sec * 1000ULL + tv.tv_usec / 1000;
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
  mqtt.setServer(BROKER, PORTA);
  mqtt.setBufferSize(512);
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) conectarWifi();
  if (!mqtt.connected()) conectarMqtt();
  mqtt.loop();

  static uint32_t ultimo = millis();
  uint32_t agora = millis();
  if (agora - ultimo < 500) return;
  uint32_t intervalo = agora - ultimo;
  ultimo = agora;

  char msg[256];
  char ts[24];
  uint64_t t = agoraMs();
  if (t) snprintf(ts, sizeof ts, "\"ts\":%llu,", t);
  else ts[0] = 0;
  float temp = lerTemperatura();
  snprintf(msg, sizeof msg,
           "{%s\"temperatura\":%s,\"oleo\":%.1f,\"corrente\":%.2f,\"vibracao\":%.2f,\"rotacao\":%.0f}",
           ts, isnan(temp) ? "null" : String(temp, 1).c_str(), lerNivelOleo(), lerCorrente(), lerVibracao(),
           lerRotacao(intervalo));
  String topico = String(TOPICO_BASE) + "/leituras";
  mqtt.publish(topico.c_str(), msg);
}
