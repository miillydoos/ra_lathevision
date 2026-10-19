# Laboratório de Monitoramento e Diagnóstico — Torno ROMI T 350

Aplicação Babylon.js (tela, RV e RA) em que o aluno explora o torno em 3D, acompanha cinco grandezas medidas
(temperatura, nível de óleo, corrente, vibração e rotação) e resolve situações de manutenção.

Reúne os projetos 1, 2 e 4 da proposta em quatro modos:

| Modo | Para que serve |
|---|---|
| **Ao vivo** | Acompanha o torno real (ESP32 → broker MQTT → app), mostra a idade da última leitura e grava a sessão. |
| **Simulação** | Funciona sem sensores. O professor controla a operação (ciclo típico ou manual), aplica situações, simula falha de sensor e acelera o tempo. |
| **Replay** | Reproduz uma sessão gravada: pausar, voltar, ir a um instante clicando no gráfico, marcar instantes e comparar curvas. |
| **Desafio** | O professor escolhe ou sorteia uma situação oculta; a turma registra evidências (também no headset), responde e recebe a avaliação. |

## Como rodar

Requer Node.js 20 ou mais recente.

```bash
npm install
npm run dev          # http://localhost:5173
```

- **Headset na rede local** (Quest etc.): `npm run dev:https` e abra `https://<ip-do-computador>:5173` no navegador do
  headset, aceitando o certificado autoassinado. O WebXR só funciona em HTTPS (ou em `localhost`).
- **Publicar**: `npm run build` gera `dist/` com caminhos relativos (serve em qualquer servidor estático).
  No GitHub, o workflow `.github/workflows/deploy.yml` faz o build e publica o `dist/` a cada push na `main`.
  Configuração única no repositório: **Settings → Pages → Build and deployment → Source → “GitHub Actions”**.
  Publicar a raiz do repositório (“Deploy from a branch”) serve o código-fonte cru e causa o erro
  `Failed to resolve module specifier "@babylonjs/core"`.

## As cinco etapas

| Etapa | Entrega | Arquivos principais |
|---|---|---|
| 1. Base 3D | GLB carregado (15 conjuntos, pivôs originais), identificação de componentes por clique/lista, pontos instrumentados com rótulos, visor de óleo virtual, placa girando, RV/RA com painel 3D. Malhas mescladas por componente e material (547 → 114) para o headset. | `src/cena/*`, `src/xr/*`, `src/config/componentes.js`, `src/config/grandezas.js` |
| 2. Indicadores | Estados Normal / Atenção / Alarme / Sem dados (cor + ícone + texto), cartões com minigráfico, detalhe com limites, estatísticas, cuidados de interpretação e tabela; comparação em pequenos múltiplos; indicador de conexão. | `src/dados/fluxo.js`, `src/ui/sensoresUI.js`, `src/ui/graficos.js`, `public/config.json` |
| 3. Fontes de dados | MQTT sobre WebSocket, modelo de simulação, painel do professor, configurações (broker, limites, tipo de sensor de nível). | `src/fontes/*`, `src/simulacao/*`, `src/ui/painelSimulacao.js`, `src/ui/configuracoesUI.js` |
| 4. Registro e replay | Gravação de sessões (IndexedDB + download .json), quatro sessões de exemplo, reprodução sincronizada com o modelo, marcadores do aluno. | `src/dados/gravador.js`, `src/fontes/fonteReplay.js`, `src/ui/painelReplay.js`, `public/sessoes/` |
| 5. Desafios | Aquecimento, nível baixo de óleo e vibração elevada, com situação oculta, registro de evidências, resposta, avaliação por critérios e relatório. | `src/config/desafios.js`, `src/ui/painelDesafio.js` |

## Conexão ao vivo

```
ESP32 ──MQTT/TCP 1883──▶ broker ──MQTT/WebSocket 9001──▶ aplicação
```

Tópicos (base configurável, padrão `senai/torno01`):

| Tópico | Conteúdo |
|---|---|
| `<base>/temperatura`, `/oleo`, `/corrente`, `/vibracao`, `/rotacao` | número (`42.3`) ou JSON `{"v": 42.3, "ts": 1760000000000}` |
| `<base>/leituras` | várias grandezas: `{"ts": …, "temperatura": 42.3, "rotacao": 800}` |
| `<base>/status` | `online` / `offline` (Last Will do ESP32) |

`ts` é opcional. Se o relógio do dispositivo estiver mais de 60 s diferente do navegador (ESP32 sem NTP), vale a hora de chegada.

Para testar sem hardware:

```bash
npm run broker                                    # broker local: TCP 1883 + WebSocket 9001
npm run publicador -- --cenario vibracao --apos 30   # faz o papel do ESP32 (usa o modelo da simulação)
```

Depois, no app: **Ao vivo** → endereço `ws://localhost:9001` (padrão). Para outro broker use ⚙ **Configurações**.
Há um exemplo de firmware em `exemplos/esp32/torno_monitor/` e de configuração do Mosquitto em `exemplos/mosquitto.conf`.
Em páginas HTTPS o navegador só aceita `wss://`.

## Limites e estados

`public/config.json` traz limites **de exemplo** — ajuste conforme a máquina, o ponto medido e a condição de operação.
Ajustes feitos em ⚙ Configurações ficam salvos só naquele navegador (“Restaurar config.json” desfaz).

- `sentido`: `acima` (alarme quando sobe) ou `abaixo` (quando desce, como o nível de óleo).
- `persistenciaS`: o limite precisa ser ultrapassado durante esse tempo para mudar o estado (a corrente usa 2 s para
  o pico de partida não disparar alarme).
- `oleo.sensor`: `continuo` (porcentagem) ou `boia` (só “OK” / “Baixo”; a leitura 1 é OK e 0 é baixo).
- `leituraVelhaS`: depois desse tempo sem leitura, o indicador passa a **Sem dados** e mostra a idade da última.

## Sessões

Formato `lab-torno-sessao/1` (descrito em `src/dados/sessao.js`). As sessões de exemplo em `public/sessoes/` são geradas
pelo modelo de simulação (`npm run sessoes`) e têm títulos neutros; a causa de cada uma não está no arquivo:

| Sessão | Situação (para o professor) |
|---|---|
| 01 · Eixo SAE 1045 (referência) | operação normal |
| 02 · Eixo SAE 1045 (lote 2) | vibração aumenta a partir de 2:00, corrente oscila, temperatura sobe depois |
| 03 · Buchas de latão | vazamento de óleo a partir de 1:00; temperatura sobe quando o nível fica baixo |
| 04 · Eixo longo SAE 1020 | aquecimento do cabeçote a partir de 1:30 |

A Sessão 02 é a atividade da proposta: localizar quando a vibração começou, o que mudou junto e propor inspeções.

## Desafio em aula

1. Professor: **Desafio** → escolha a situação ou “Sortear” → velocidade (5× é um bom ponto de partida) → **Iniciar**.
2. A máquina começa normal; a alteração se inicia sem aviso entre 40 s e 90 s de simulação.
3. A turma registra evidências (botão no rodapé ou no painel do headset) e clica em **Responder**.
4. A avaliação (100 pontos) pesa evidências (40), sequência dos sinais (15), hipótese (20), inspeção (20) e registros (5).
   Citar algo que não aconteceu desconta; propor troca de peça antes de confirmar a causa também.
5. **Revelar situação** mostra a explicação; **Baixar relatório** gera um .txt com evidências, respostas e avaliação.

## Painéis recolhíveis (desktop e celular)

Uma doca de abas embaixo abre e recolhe os painéis **Peças**, **Medições** e **Controles** (painel do modo atual).
Ao carregar a aplicação os três começam recolhidos, deixando a vista 3D livre; abrir uma medição (rótulo 3D, sensor
ou `?grandeza=`) abre as Medições sozinha. Cada painel tem **×** no cabeçalho, e a vista 3D se desloca para o torno
ficar no centro da área livre.

- **Desktop:** os painéis podem ficar abertos juntos. Recolhem para as laterais e para baixo pelo ×, pela aba da
  doca ou com **Esc** (o último aberto).
- **Celular (até 900 px):** topo compacto (título, conexão e os quatro modos); os painéis viram folhas que sobem
  da base, uma por vez, e recolhem pelo ×, tocando de novo na aba, arrastando o cabeçalho para baixo ou com o
  **Voltar** do aparelho. Configurações e a resposta do desafio abrem em tela cheia, com × e botões fixos no rodapé.

Tudo isso está em `src/ui/layoutPaineis.js` e no fim de `src/style.css`; a lógica do app é a mesma em qualquer tela.
Para ver o layout de celular no computador: F12 → Ctrl+Shift+M (modo dispositivo).

## Dentro do headset

O HUD HTML não aparece em RV/RA. O painel 3D ao lado da área do operador mostra as cinco leituras, o gráfico (toque numa
linha para trocar a grandeza), **Comparar curvas**, **Aproximar painel** (traz para perto do rosto) e os controles do modo
(reprodução no Replay, registro de evidência no Desafio). Aponte o controle para o cabeçote, a placa ou os rótulos para
abrir as medições.

## Ambiente 360°, apresentação e sensores

- **Laboratório ao redor do torno:** paredes com a faixa institucional, teto com vigas e luminárias, janelas, bancada,
  painel de ferramentas, estante, quadro branco, sinalização de segurança e outras máquinas. É todo feito em código
  (`src/cena/sala.js`), sem arquivos externos e sem luzes próprias, então a aparência do torno não muda. Em RA a sala
  some, como o piso; com a câmera fora da sala, a parede do lado da câmera some (vista de maquete).
- **Apresentação 360°** (botão **360°** no topo ou `?tour` na URL): dez paradas com câmera, destaque das peças, cartão
  com descrição e dados e pinos numerados sobre a máquina. ◀ ▶ (ou ← →), pontos, **Auto** (espaço), **360°** gira a
  câmera (O), tela cheia (F) e **Esc** sai. Clicar numa peça leva à parada dela; arrastar a vista assume a câmera.
  Paradas em `src/config/tour360.js`, interface em `src/ui/tour360.js`.
- **Painel elétrico e caixa lateral de engrenagens:** as tampas abrem com a mão. Arraste a tampa (mouse ou dedo; no
  headset, aponte e faça a pinça ou aperte o gatilho, ou pegue a tampa de perto) e ela gira na dobradiça
  acompanhando o movimento; ao soltar, termina de abrir ou fechar no sentido em que vinha. Um clique ou toque na tampa
  abre ou fecha. O botão **Sensores** no topo (ou "Abrir tampas e ver sensores" no tour) abre as duas e leva a câmera
  até a do lado em que ela está: a caixa de engrenagens fica na lateral esquerda do cabeçote e o painel elétrico na
  traseira do gabinete do cabeçote (porta com dobradiça do lado do cabeçote). No painel fica o sensor de corrente, no
  cabo do motor; na caixa, temperatura, vibração, nível de óleo e rotação, cada um com LED e etiqueta na cor do estado
  (clicar abre a medição). Tampas e interiores (fundição, polia, trem de engrenagens, placa guardada; disjuntores,
  contatores, borneira, canaletas e fiação) estão no `torno.glb`, modelados a partir das fotos em `public/fotos/`; as
  tampas giram em tempo de execução (o arquivo não muda). Posições dos sensores e das dobradiças em
  `src/cena/compartimentos.js`.

## Ajustes finos pelo console

```js
lab.moverRotulo("temperatura", -1.15, 1.62, 0.2)   // posição (m) de um rótulo, sem recompilar
lab.simulacao.controle.aceleracao = 10              // velocidade da simulação
lab.replay.irPara(120000)                           // replay: ir para 2:00
lab.tour.irPara(3)                                  // apresentação 360°: ir para a 4ª parada
lab.compartimentos.abrir()                          // abrir painel elétrico e tampa lateral
```

Quando chegar a uma posição boa, copie os valores para `src/config/grandezas.js`.

## Cuidados de interpretação (também exibidos no app)

- Temperatura: uma medição pontual não representa a temperatura de toda a máquina.
- Nível de óleo: porcentagem só com sensor contínuo; com boia, apenas os estados.
- Corrente: sozinha, não determina potência nem identifica a causa de uma sobrecarga.
- Vibração: o diagnóstico depende do sensor, da montagem e da qualidade da aquisição.
- Rotação: acima de 90 rpm a animação da placa é ilustrativa; a leitura numérica é a referência.

O modelo de simulação é didático (coeficientes plausíveis, evolução térmica acelerada para caber na aula), não um gêmeo
digital calibrado.

## Próximos passos possíveis

- Serviço de histórico no servidor (hoje o histórico fica no navegador e nas sessões exportadas).
- Movimentos didáticos dos carros, contraponto e proteções, identificados como simulados quando não houver sensor de posição.
- Análise de frequência da vibração, se a aquisição permitir.
- Projetos 3 (inspeção guiada com checklist) e 5 (comparador de condições de usinagem) reaproveitando sessões e painéis.
