// Firmware do monitor do torno (ESP32-C3 Super Mini, caixa do sistema de monitoramento).
// Lê os quatro sensores, mostra as leituras no LCD 16×2 da tampa e publica no broker MQTT, de onde a aplicação
// (tela, RV e RA no headset) recebe tudo em tempo real.
//
//   sensores ──▶ ESP32-C3 ──▶ LCD 16×2 I²C                                      (sempre, mesmo sem rede)
//                         └─▶ MQTT/TCP 1883 ──▶ broker ──▶ MQTT/WSS 443 ──▶ aplicação / RA
//
// Bibliotecas (Gerenciador de Bibliotecas da Arduino IDE):
//   - PubSubClient (Nick O'Leary)
//   - LiquidCrystal I2C (Frank de Brabander)
// O MPU-6050 é lido direto pelos registradores (Wire), sem biblioteca.
// Placa: "ESP32C3 Dev Module" com "USB CDC On Boot: Enabled" para ver o Monitor Serial (115200 baud).
//
// A cada 500 ms publica em <TOPICO_BASE>/leituras ("ts" só depois que o relógio sincronizar pela internet):
//   {"ts":1763900000000,"oleo":78.0,"corrente":12.40,"vibracao":1.15,"rotacao":800}
// e mantém <TOPICO_BASE>/status = "online" (Last Will "offline"). Uma leitura com falha fica fora do JSON
// (o app mostra "Sem dados") e aparece como "--" no LCD.
//
// No app: modo "Ao vivo", com ⚙ Configurações → Conexão ao vivo → "Broker MQTT" (padrão do config.json):
// endereço wss://public.cloud.shiftr.io, usuário e senha "public" e tópico base igual ao TOPICO_BASE abaixo.
// No headset a página é HTTPS e o navegador só aceita wss:// — por isso a RA usa o broker, não o IP do ESP32.
//
// O LCD mostra as mesmas páginas da caixa virtual do app, trocando a cada 3 s:
//   Vibr    1.15mm/s      Oleo         78%
//   Corr       12.4A      Rot       800rpm
// Enquanto o broker não estiver conectado, entra uma terceira página com o IP e o estado do MQTT.
//
// A rede roda numa tarefa separada (tarefaRede): se o Wi-Fi ou o broker caírem, o LCD continua atualizando e
// as medições não param.
//
// ATENÇÃO: os valores marcados com "ADAPTE" dependem dos sensores e da instalação.
// Instrumentar uma máquina exige avaliação de segurança (NR-10 / NR-12): use transformador de
// corrente de núcleo dividido (sem abrir circuito), fixe sensores fora da área de risco e
// não interfira nos dispositivos de segurança da máquina.

#include <WiFi.h>
#include <PubSubClient.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <time.h>
#include <sys/time.h>

// ---------- rede e broker
const char* WIFI_SSID = "WIFI_IOT_CFP601";
const char* WIFI_SENHA = "iot@senai601";
// Broker público (shiftr.io, usuário/senha "public"): qualquer pessoa pode ler e publicar nestes tópicos — use só para
// dados didáticos. Para broker local, troque pelo IP do computador (npm run broker ou Mosquitto).
const char* BROKER = "public.cloud.shiftr.io";
const uint16_t PORTA_MQTT = 1883;
const char* MQTT_USUARIO = "public";  // deixe "" em broker sem autenticação
const char* MQTT_SENHA = "public";
const char* TOPICO_BASE = "tormax30/senai/torno01";  // deve ser igual ao "Tópico base" do app
const uint32_t INTERVALO_MS = 500;                    // uma leitura completa a cada 500 ms
// Alguns ESP32-C3 Super Mini só conectam no Wi-Fi com a potência de transmissão reduzida (antena da placa).
const bool REDUZIR_POTENCIA_WIFI = false;

// ---------- ligações no ESP32-C3 Super Mini (ADAPTE). ADC só em GPIO0–4; evite GPIO2, 8 e 9 (pinos de boot).
// LCD (módulo I²C PCF8574) e MPU-6050 dividem o barramento I²C. O LCD costuma pedir 5 V; nesse caso os pull-ups
// do módulo puxam SDA/SCL para 5 V: use um conversor de nível I²C ou retire os pull-ups do módulo do LCD
// (o MPU-6050 já tem os seus, em 3,3 V).
const int PINO_SDA = 6;
const int PINO_SCL = 7;
// SCT-013 (100 A : 50 mA) com resistor de carga e divisor de polarização (2 × 10 kΩ + 10 µF, meio da escala).
const int PINO_CORRENTE = 1;
// HC-SR04 alimentado em 5 V: o ECHO sai em 5 V e precisa de divisor (1 kΩ / 2 kΩ) antes do ESP32.
const int PINO_TRIG = 3;
const int PINO_ECHO = 5;
// Sensor de velocidade LM393 (fenda), alimentado em 3,3 V: saída DO.
const int PINO_PULSO_ROTACAO = 4;

// ---------- calibração (ADAPTE)
// Nível de óleo: distância do HC-SR04 até a superfície do óleo com o reservatório cheio e vazio.
const float DIST_CHEIO_CM = 3.0;  // o HC-SR04 não mede abaixo de ~2 cm
const float DIST_VAZIO_CM = 12.0;
// Corrente: SCT-013-000 (relação 2000:1). Ajuste FATOR_CORRENTE comparando com um alicate amperímetro.
const float R_CARGA_OHM = 33.0;
const float FATOR_CORRENTE = 1.0;
const float CORRENTE_MINIMA_A = 0.3;  // abaixo disso é ruído do ADC: mostra 0 (motor desligado)
// Rotação: roda de 20 dentes na ponta do eixo-árvore (20 pulsos por volta).
const int PULSOS_POR_VOLTA = 20;
const uint32_t DEBOUNCE_US = 150;  // a 2.000 rpm os pulsos vêm a cada 1.500 µs
// Vibração: velocidade RMS (mm/s) a partir de 10 Hz (-3 dB), no eixo do MPU-6050 que vibrar mais.
const float CORTE_HZ = 10.0;
const float CORTE_GRAVIDADE_HZ = 1.0;  // só tira a gravidade e o offset do sensor
// Barramento I²C. O PCF8574 do LCD é especificado para 100 kHz, mas costuma funcionar em 400 kHz. Se o LCD mostrar
// caracteres trocados, use 100000: o MPU-6050 passa a amostrar 500 vezes por segundo (faixa até 94 Hz).
const uint32_t I2C_HZ = 400000;

// ---------- estado compartilhado entre o laço (sensores + LCD) e a tarefa da rede
struct Leituras {
  float oleo, corrente, vibracao, rotacao;  // NAN = sem leitura
};
Leituras ultimas = {NAN, NAN, NAN, NAN};
volatile uint32_t numLeitura = 0;  // aumenta a cada leitura nova
volatile bool mqttOnline = false;
portMUX_TYPE travaLeituras = portMUX_INITIALIZER_UNLOCKED;
portMUX_TYPE travaIsr = portMUX_INITIALIZER_UNLOCKED;

WiFiClient wifi;
PubSubClient mqtt(wifi);
LiquidCrystal_I2C* lcd = nullptr;  // nullptr: LCD não encontrado

bool existeNoI2c(uint8_t endereco) {
  Wire.beginTransmission(endereco);
  return Wire.endTransmission() == 0;
}

// =====================================================================================================
// Rotação: interrupção a cada dente da roda. A rotação sai do tempo entre o último pulso da janela anterior
// e o último desta, o que dá boa resolução mesmo em rotação baixa (39 rpm no T 350).
volatile uint32_t pulsos = 0;
volatile uint32_t tUltimoPulso = 0;  // µs

void IRAM_ATTR aoPulso() {
  uint32_t t = micros();
  portENTER_CRITICAL_ISR(&travaIsr);
  if (t - tUltimoPulso >= DEBOUNCE_US) {
    pulsos = pulsos + 1;
    tUltimoPulso = t;
  }
  portEXIT_CRITICAL_ISR(&travaIsr);
}

float lerRotacao() {
  static bool temReferencia = false;
  static uint32_t tReferencia = 0;
  static float rpm = 0;
  portENTER_CRITICAL(&travaIsr);
  uint32_t n = pulsos;
  uint32_t t = tUltimoPulso;
  pulsos = 0;
  portEXIT_CRITICAL(&travaIsr);

  if (n > 0) {
    if (temReferencia && t != tReferencia) rpm = n * 60e6f / ((float)(t - tReferencia) * PULSOS_POR_VOLTA);
    tReferencia = t;
    temReferencia = true;
  } else if (temReferencia) {
    uint32_t parado = micros() - tReferencia;
    if (parado > 2000000UL) {  // 2 s sem pulso: eixo parado
      rpm = 0;
      temReferencia = false;
    } else {
      rpm = fminf(rpm, 60e6f / ((float)parado * PULSOS_POR_VOLTA));  // desacelerando: não chegou o próximo dente
    }
  } else {
    rpm = 0;
  }
  return rpm;
}

// =====================================================================================================
// Nível de óleo (HC-SR04): um disparo a cada 100 ms; a interrupção do ECHO mede a largura do pulso sem
// travar o laço. Mediana das últimas 5 distâncias válidas para descartar ecos falsos.
volatile uint32_t ecoInicio = 0, ecoDuracao = 0;
volatile bool ecoPronto = false;
float distancias[5];
uint8_t nDistancias = 0, posDistancia = 0;
uint32_t tUltimaDistancia = 0;

void IRAM_ATTR aoEco() {
  uint32_t t = micros();
  bool alto = digitalRead(PINO_ECHO);
  portENTER_CRITICAL_ISR(&travaIsr);
  if (alto) {
    ecoInicio = t;
  } else if (ecoInicio) {
    ecoDuracao = t - ecoInicio;
    ecoPronto = true;
    ecoInicio = 0;
  }
  portEXIT_CRITICAL_ISR(&travaIsr);
}

void cuidarDoUltrassom() {
  static uint32_t tDisparo = 0;
  uint32_t agora = millis();
  if (agora - tDisparo < 100) return;  // ≥ 60 ms entre disparos para os ecos do anterior sumirem
  tDisparo = agora;

  portENTER_CRITICAL(&travaIsr);
  bool pronto = ecoPronto;
  uint32_t duracao = ecoDuracao;
  ecoPronto = false;
  portEXIT_CRITICAL(&travaIsr);
  if (pronto) {
    float cm = duracao * 0.0343f / 2;  // som a ~20 °C: 343 m/s, ida e volta
    if (cm >= 2 && cm <= 100) {
      distancias[posDistancia] = cm;
      posDistancia = (posDistancia + 1) % 5;
      if (nDistancias < 5) nDistancias++;
      tUltimaDistancia = agora;
    }
  }
  digitalWrite(PINO_TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(PINO_TRIG, LOW);
}

float nivelOleo() {
  if (nDistancias == 0 || millis() - tUltimaDistancia > 3000) return NAN;  // sem eco: sensor solto ou desligado
  float o[5];
  memcpy(o, distancias, sizeof o);
  for (uint8_t i = 1; i < nDistancias; i++) {  // ordena (são no máximo 5)
    for (uint8_t j = i; j > 0 && o[j - 1] > o[j]; j--) {
      float x = o[j];
      o[j] = o[j - 1];
      o[j - 1] = x;
    }
  }
  float d = o[nDistancias / 2];
  return constrain((DIST_VAZIO_CM - d) * 100.0f / (DIST_VAZIO_CM - DIST_CHEIO_CM), 0.0f, 100.0f);
}

// =====================================================================================================
// Corrente (SCT-013): mede por 100 ms (6 ciclos de 60 Hz) e tira o RMS da parte alternada (sem a polarização).
float lerCorrente() {
  uint32_t n = 0;
  int64_t soma = 0, soma2 = 0;
  uint32_t inicio = micros();
  while (micros() - inicio < 100000) {
    int32_t mv = analogReadMilliVolts(PINO_CORRENTE);
    soma += mv;
    soma2 += (int64_t)mv * mv;
    n++;
  }
  if (n < 100) return NAN;
  double media = (double)soma / n;
  double variancia = (double)soma2 / n - media * media;
  double vrms = variancia > 0 ? sqrt(variancia) / 1000.0 : 0;  // V no resistor de carga
  float amperes = vrms / R_CARGA_OHM * 2000.0 * FATOR_CORRENTE;  // relação 2000:1 do SCT-013-000
  return amperes < CORRENTE_MINIMA_A ? 0 : amperes;
}

// =====================================================================================================
// Vibração (MPU-6050): o sensor amostra sozinho a 1 kHz e guarda no FIFO interno (1024 bytes ≈ 170 ms), e o laço
// esvazia o FIFO. Para cada eixo: passa-altas tira a gravidade, a integração dá a velocidade e um segundo
// passa-altas tira a deriva. O valor publicado é o RMS da velocidade (mm/s) na janela de 500 ms, no eixo maior.
const int AMOSTRAS_HZ = I2C_HZ >= 400000 ? 1000 : 500;
const float M_S2_POR_LSB = 9.80665f / 8192.0f;  // escala de ±4 g
uint8_t mpuEndereco = 0;                         // 0 = MPU-6050 não encontrado
float alfaGravidade, alfaHp, dtVibracao;

struct Eixo {
  float aAnterior, aHp, v, vAnterior, vHp, soma2;
};
Eixo eixos[3];
bool filtrosIniciados = false;
int amostrasDescartar = 0;
uint32_t amostrasJanela = 0;
float ultimaVibracao = NAN;

bool escreverMpu(uint8_t registrador, uint8_t valor) {
  Wire.beginTransmission(mpuEndereco);
  Wire.write(registrador);
  Wire.write(valor);
  return Wire.endTransmission() == 0;
}

bool lerMpu(uint8_t registrador, uint8_t* destino, uint8_t n) {
  Wire.beginTransmission(mpuEndereco);
  Wire.write(registrador);
  if (Wire.endTransmission(false) != 0) return false;
  if (Wire.requestFrom((int)mpuEndereco, (int)n) != n) return false;
  for (uint8_t i = 0; i < n; i++) destino[i] = Wire.read();
  return true;
}

void reiniciarFiltros() {
  filtrosIniciados = false;
  amostrasDescartar = AMOSTRAS_HZ / 4;  // 250 ms para os filtros acomodarem
  amostrasJanela = 0;
  for (Eixo& e : eixos) e.soma2 = 0;
}

void reiniciarFifo() {
  escreverMpu(0x6A, 0x00);  // USER_CTRL: desliga o FIFO
  escreverMpu(0x6A, 0x04);  //           esvazia
  escreverMpu(0x6A, 0x40);  //           liga
  reiniciarFiltros();
}

bool iniciarMpu() {
  for (uint8_t endereco : {0x68, 0x69}) {
    if (!existeNoI2c(endereco)) continue;
    mpuEndereco = endereco;
    escreverMpu(0x6B, 0x80);  // PWR_MGMT_1: reinicia o sensor
    delay(100);
    bool ok = escreverMpu(0x6B, 0x01)                             // acorda, relógio do giroscópio (mais estável)
              && escreverMpu(0x1A, AMOSTRAS_HZ == 1000 ? 1 : 2)   // CONFIG: filtro em 184 Hz (ou 94 Hz)
              && escreverMpu(0x19, AMOSTRAS_HZ == 1000 ? 0 : 1)   // SMPLRT_DIV: 1 kHz (ou 500 Hz)
              && escreverMpu(0x1C, 0x08)                          // ACCEL_CONFIG: ±4 g
              && escreverMpu(0x38, 0x10)                          // INT_ENABLE: marca o transbordo do FIFO
              && escreverMpu(0x23, 0x08);                         // FIFO_EN: só o acelerômetro (6 bytes/amostra)
    if (!ok) break;
    reiniciarFifo();
    Serial.printf("MPU-6050 no endereço 0x%02X, %d amostras/s\n", endereco, AMOSTRAS_HZ);
    return true;
  }
  mpuEndereco = 0;
  return false;
}

void processarAmostra(const int16_t bruto[3]) {
  for (int i = 0; i < 3; i++) {
    Eixo& e = eixos[i];
    float a = bruto[i] * M_S2_POR_LSB;  // m/s²
    if (!filtrosIniciados) e = {a, 0, 0, 0, 0, e.soma2};
    e.aHp = alfaGravidade * (e.aHp + a - e.aAnterior);  // passa-altas: tira a gravidade
    e.aAnterior = a;
    e.v += e.aHp * dtVibracao;                    // integra: aceleração → velocidade (m/s)
    e.vHp = alfaHp * (e.vHp + e.v - e.vAnterior);  // passa-altas: tira a deriva da integração
    e.vAnterior = e.v;
    if (amostrasDescartar == 0) {
      float mms = e.vHp * 1000.0f;
      e.soma2 += mms * mms;
    }
  }
  filtrosIniciados = true;
  if (amostrasDescartar > 0) amostrasDescartar--;
  else amostrasJanela++;
}

void falhaMpu() {
  Serial.println("MPU-6050 parou de responder; tentando de novo a cada 5 s");
  mpuEndereco = 0;
}

void lerFifoMpu() {
  if (!mpuEndereco) return;
  uint8_t status, b[2];
  if (!lerMpu(0x3A, &status, 1) || !lerMpu(0x72, b, 2)) return falhaMpu();  // INT_STATUS e FIFO_COUNT
  uint16_t bytes = (b[0] << 8) | b[1];
  if ((status & 0x10) || bytes >= 1020) {  // transbordou (laço ficou parado): amostras perdidas, recomeça
    reiniciarFifo();
    return;
  }
  uint16_t restantes = bytes / 6;
  uint8_t buf[120];  // até 20 amostras por leitura (o buffer do Wire tem 128 bytes)
  while (restantes > 0) {
    uint8_t n = restantes > 20 ? 20 : restantes;
    if (!lerMpu(0x74, buf, n * 6)) return falhaMpu();  // FIFO_R_W
    for (uint8_t i = 0; i < n; i++) {
      int16_t a[3];
      for (int k = 0; k < 3; k++) a[k] = (int16_t)((buf[i * 6 + 2 * k] << 8) | buf[i * 6 + 2 * k + 1]);
      processarAmostra(a);
    }
    restantes -= n;
  }
}

float fecharJanelaVibracao() {
  if (!mpuEndereco) return NAN;
  if (amostrasJanela >= (uint32_t)AMOSTRAS_HZ / 10) {  // janela curta (logo após reiniciar): mantém a anterior
    float maior = 0;
    for (Eixo& e : eixos) maior = fmaxf(maior, sqrtf(e.soma2 / amostrasJanela));
    ultimaVibracao = maior;
  }
  for (Eixo& e : eixos) e.soma2 = 0;
  amostrasJanela = 0;
  return ultimaVibracao;
}

// =====================================================================================================
// LCD 16×2: só reescreve os caracteres que mudaram (menos tráfego no I²C e nada de piscar).
char tela[2][17];

void iniciarLcd() {
  for (uint8_t endereco : {0x27, 0x3F}) {
    if (!existeNoI2c(endereco)) continue;
    lcd = new LiquidCrystal_I2C(endereco, 16, 2);
    lcd->init();  // também limpa a tela
    lcd->backlight();
    memset(tela, ' ', sizeof tela);
    tela[0][16] = tela[1][16] = 0;
    Serial.printf("LCD no endereço 0x%02X\n", endereco);
    return;
  }
  Serial.println("LCD não encontrado (0x27 / 0x3F): confira SDA, SCL e a alimentação");
}

void escreverLinha(uint8_t linha, const char* texto) {
  if (!lcd) return;
  char nova[17];
  snprintf(nova, sizeof nova, "%-16s", texto);
  for (uint8_t c = 0; c < 16; c++) {
    if (nova[c] == tela[linha][c]) continue;
    lcd->setCursor(c, linha);
    while (c < 16 && nova[c] != tela[linha][c]) {
      lcd->write((uint8_t)nova[c]);
      tela[linha][c] = nova[c];
      c++;
    }
  }
}

// Mesmo formato do LCD virtual do app: rótulo à esquerda, valor e unidade à direita ("--" sem leitura).
void linhaMedida(char* destino, const char* rotulo, float valor, int casas, const char* unidade) {
  char fim[16];
  if (isnan(valor)) snprintf(fim, sizeof fim, "--");
  else snprintf(fim, sizeof fim, "%.*f%s", casas, valor, unidade);
  snprintf(destino, 17, "%s%*s", rotulo, (int)(16 - strlen(rotulo)), fim);
}

void atualizarLcd(const Leituras& l) {
  int paginas = mqttOnline ? 2 : 3;
  int pagina = (millis() / 3000) % paginas;
  char a[17], b[17];
  if (pagina == 0) {
    linhaMedida(a, "Vibr", l.vibracao, 2, "mm/s");
    linhaMedida(b, "Corr", l.corrente, 1, "A");
  } else if (pagina == 1) {
    linhaMedida(a, "Oleo", l.oleo, 0, "%");
    linhaMedida(b, "Rot", l.rotacao, 0, "rpm");
  } else if (WiFi.status() == WL_CONNECTED) {
    snprintf(a, sizeof a, "MQTT: conectando");
    snprintf(b, sizeof b, "%.16s", WiFi.localIP().toString().c_str());
  } else {
    snprintf(a, sizeof a, "Wi-Fi: sem rede");
    snprintf(b, sizeof b, "MQTT: offline");
  }
  escreverLinha(0, a);
  escreverLinha(1, b);
}

// =====================================================================================================
// Rede: Wi-Fi, relógio (NTP) e MQTT numa tarefa própria. Enquanto ela espera a rede, o laço segue medindo.
uint64_t agoraMs() {
  struct timeval tv;
  gettimeofday(&tv, nullptr);
  if (tv.tv_sec < 1700000000) return 0;  // relógio ainda não sincronizou: o app usa a hora de chegada
  return (uint64_t)tv.tv_sec * 1000ULL + tv.tv_usec / 1000;
}

void anexarCampo(char* msg, size_t tamanho, int& n, const char* nome, float valor, int casas) {
  if (isnan(valor) || n >= (int)tamanho) return;
  n += snprintf(msg + n, tamanho - n, "\"%s\":%.*f,", nome, casas, valor);
}

void publicarLeituras(const Leituras& l) {
  char msg[192];
  int n = snprintf(msg, sizeof msg, "{");
  uint64_t ts = agoraMs();
  if (ts) n += snprintf(msg + n, sizeof msg - n, "\"ts\":%llu,", ts);
  anexarCampo(msg, sizeof msg, n, "oleo", l.oleo, 1);
  anexarCampo(msg, sizeof msg, n, "corrente", l.corrente, 2);
  anexarCampo(msg, sizeof msg, n, "vibracao", l.vibracao, 2);
  anexarCampo(msg, sizeof msg, n, "rotacao", l.rotacao, 0);
  if (n >= (int)sizeof msg || msg[n - 1] != ',') return;  // nenhum sensor respondeu
  msg[n - 1] = '}';
  char topico[96];
  snprintf(topico, sizeof topico, "%s/leituras", TOPICO_BASE);
  mqtt.publish(topico, msg);
}

bool conectarMqtt() {
  uint64_t mac = ESP.getEfuseMac();
  char id[40], status[96];
  snprintf(id, sizeof id, "esp32-torno-%04X%08lX", (uint16_t)(mac >> 32), (unsigned long)(uint32_t)mac);
  snprintf(status, sizeof status, "%s/status", TOPICO_BASE);
  Serial.printf("Conectando ao broker %s:%u...\n", BROKER, PORTA_MQTT);
  const char* usuario = *MQTT_USUARIO ? MQTT_USUARIO : nullptr;
  const char* senha = *MQTT_SENHA ? MQTT_SENHA : nullptr;
  if (!mqtt.connect(id, usuario, senha, status, 1, true, "offline")) {
    Serial.printf("Broker não aceitou a conexão (estado %d); nova tentativa em instantes\n", mqtt.state());
    return false;
  }
  mqtt.publish(status, "online", true);
  Serial.printf("MQTT conectado: publicando em %s/leituras\n", TOPICO_BASE);
  return true;
}

void tarefaRede(void*) {
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_SENHA);
  if (REDUZIR_POTENCIA_WIFI) WiFi.setTxPower(WIFI_POWER_8_5dBm);
  Serial.printf("Conectando ao Wi-Fi %s...\n", WIFI_SSID);
  mqtt.setServer(BROKER, PORTA_MQTT);
  mqtt.setBufferSize(512);
  mqtt.setKeepAlive(15);
  mqtt.setSocketTimeout(5);

  bool wifiAntes = false, relogioIniciado = false;
  uint32_t tWifi = millis(), tMqtt = 0, esperaMqtt = 0, enviada = numLeitura;
  for (;;) {
    bool wifiOk = WiFi.status() == WL_CONNECTED;
    if (wifiOk != wifiAntes) {
      wifiAntes = wifiOk;
      if (wifiOk) Serial.printf("Wi-Fi conectado: IP %s\n", WiFi.localIP().toString().c_str());
      else Serial.println("Wi-Fi desconectado; tentando de novo...");
    }
    if (!wifiOk) {
      mqttOnline = false;
      if (millis() - tWifi > 20000) {  // a reconexão automática não voltou: recomeça
        tWifi = millis();
        WiFi.disconnect();
        WiFi.begin(WIFI_SSID, WIFI_SENHA);
      }
      vTaskDelay(pdMS_TO_TICKS(250));
      continue;
    }
    tWifi = millis();
    if (!relogioIniciado) {
      configTime(0, 0, "pool.ntp.org", "a.st1.ntp.br");  // hora para o campo "ts"
      relogioIniciado = true;
    }

    if (!mqtt.connected()) {
      mqttOnline = false;
      if (millis() - tMqtt >= esperaMqtt) {
        tMqtt = millis();
        // espera 2 s, 4 s, 8 s... (até 30 s) entre tentativas se o broker não responder
        esperaMqtt = conectarMqtt() ? 0 : (esperaMqtt < 2000 ? 2000 : (esperaMqtt >= 15000 ? 30000 : esperaMqtt * 2));
      }
      if (!mqtt.connected()) {
        vTaskDelay(pdMS_TO_TICKS(100));
        continue;
      }
      enviada = numLeitura;  // não reenvia leitura antiga ao reconectar
    }
    mqttOnline = true;
    mqtt.loop();

    if (numLeitura != enviada) {
      Leituras l;
      portENTER_CRITICAL(&travaLeituras);
      l = ultimas;
      enviada = numLeitura;
      portEXIT_CRITICAL(&travaLeituras);
      publicarLeituras(l);
    }
    vTaskDelay(pdMS_TO_TICKS(20));
  }
}

// =====================================================================================================
void setup() {
  Serial.begin(115200);
  analogReadResolution(12);
  pinMode(PINO_TRIG, OUTPUT);
  digitalWrite(PINO_TRIG, LOW);
  pinMode(PINO_ECHO, INPUT);
  pinMode(PINO_PULSO_ROTACAO, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(PINO_PULSO_ROTACAO), aoPulso, FALLING);
  attachInterrupt(digitalPinToInterrupt(PINO_ECHO), aoEco, CHANGE);

  Wire.begin(PINO_SDA, PINO_SCL, I2C_HZ);
  iniciarLcd();
  escreverLinha(0, "SENAI Sao Carlos");
  escreverLinha(1, "Monitor do torno");

  // a rede começa a conectar enquanto a abertura aparece no LCD
  xTaskCreate(tarefaRede, "rede", 8192, nullptr, 1, nullptr);

  // passa-altas de 1ª ordem: alfa = RC / (RC + dt), com RC = 1 / (2π · corte)
  dtVibracao = 1.0f / AMOSTRAS_HZ;
  const float rcGravidade = 1.0f / (2.0f * PI * CORTE_GRAVIDADE_HZ), rc = 1.0f / (2.0f * PI * CORTE_HZ);
  alfaGravidade = rcGravidade / (rcGravidade + dtVibracao);
  alfaHp = rc / (rc + dtVibracao);
  delay(1500);
  if (!iniciarMpu()) Serial.println("MPU-6050 não encontrado (0x68 / 0x69): a vibração fica sem dados");
}

void loop() {
  static uint32_t tJanela = millis(), tFifo = 0, tMpu = millis(), tSerial = 0;
  uint32_t agora = millis();
  if (agora - tFifo >= 20) {  // ~20 amostras por leitura do FIFO
    tFifo = agora;
    lerFifoMpu();
  }
  cuidarDoUltrassom();

  if (!mpuEndereco && agora - tMpu > 5000) {  // MPU-6050 sumiu ou não foi achado: tenta de novo
    tMpu = agora;
    iniciarMpu();
  }
  if (agora - tJanela < INTERVALO_MS) {
    delay(1);  // dá vez à tarefa da rede
    return;
  }
  tJanela = agora;

  Leituras l;
  l.vibracao = fecharJanelaVibracao();
  l.corrente = lerCorrente();  // ~100 ms; o FIFO do MPU-6050 guarda as amostras enquanto isso
  lerFifoMpu();
  l.rotacao = lerRotacao();
  l.oleo = nivelOleo();

  portENTER_CRITICAL(&travaLeituras);
  ultimas = l;
  numLeitura = numLeitura + 1;
  portEXIT_CRITICAL(&travaLeituras);

  atualizarLcd(l);

  if (agora - tSerial >= 2000) {
    tSerial = agora;
    Serial.printf("oleo %.0f %% | corrente %.1f A | vibracao %.2f mm/s | rotacao %.0f rpm | MQTT %s\n", l.oleo,
                  l.corrente, l.vibracao, l.rotacao, mqttOnline ? "online" : "offline");
  }
}
