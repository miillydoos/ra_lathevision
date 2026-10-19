// Paradas da apresentação 360° (src/ui/tour360.js).
// `componentes` = ids de src/config/componentes.js destacados na parada (clicar numa dessas peças leva à parada);
// `medicoes` = ids de src/config/grandezas.js oferecidos no cartão; `sensoresInternos` = oferece abrir as tampas;
// `pino` = ponto numerado sobre a máquina (m, mesmo sistema do torno.glb);
// `camera` = ângulos da câmera orbital (rad) e distância (m); sem `alvo`, mira o centro das peças.
// Ajuste fino pelo console: lab.tour.irPara(n) e depois lab.camera.alpha / beta / radius / target.

const FRENTE = Math.PI / 2; // câmera do lado do operador (+Z); valores maiores vão para o cabeçote, menores para o contraponto

export const TOUR_360 = {
  transicaoMs: 1800,
  permanenciaS: 10, // tempo em cada parada no modo automático
  periodoOrbitaS: 24, // uma volta completa no giro 360°
};

export const PARADAS_360 = [
  {
    id: "laboratorio",
    titulo: "Laboratório de Usinagem",
    tag: "Visão geral · 360°",
    cor: "#3d9be9",
    orbita: true,
    permanenciaS: 24,
    camera: { alvo: [0, 0.8, 0], alfa: FRENTE + 0.38, beta: 1.22, raio: 5.6 },
    descricao:
      "O torno universal ROMI T 350 no centro do laboratório. A câmera dá uma volta completa; use ◀ ▶ para conhecer cada conjunto, toque nos números sobre a máquina ou arraste para orbitar livremente.",
    fatos: [
      ["Máquina", "Torno universal ROMI T 350"],
      ["Rotação", "39 a 2.000 rpm (20 velocidades)"],
      ["Motor principal", "7,5 cv"],
      ["Monitoramento", "5 grandezas"],
    ],
  },
  {
    id: "cabecote",
    titulo: "Cabeçote fixo",
    tag: "Transmissão · instrumentado",
    cor: "#ff6b6b",
    componentes: ["cabecote"],
    medicoes: ["temperatura", "vibracao", "oleo", "rotacao"],
    sensoresInternos: true,
    pino: [-1.2, 1.36, 0.05],
    camera: { alvo: [-0.9, 1.02, 0.1], alfa: FRENTE - 0.45, beta: 1.15, raio: 2.8 },
    descricao:
      "Aloja o eixo-árvore e a caixa de velocidades, com engrenagens e eixos temperados em banho de óleo. É o conjunto mais instrumentado: os sensores de temperatura, vibração, nível de óleo e rotação ficam na caixa lateral de engrenagens, atrás da tampa lateral.",
    fatos: [
      ["Velocidades", "20 (39 a 2.000 rpm)"],
      ["Nariz do eixo-árvore", "ASA L0, passagem Ø 52 mm"],
      ["Lubrificação", "Banho de óleo"],
      ["Porta de acesso", "Micro de segurança anti-burla"],
    ],
  },
  {
    id: "placa",
    titulo: "Placa e eixo-árvore",
    tag: "Fixação da peça · rotação",
    cor: "#ffa94d",
    componentes: ["placa", "protecao_placa"],
    medicoes: ["rotacao"],
    pino: [-0.6, 1.13, 0.17],
    camera: { alvo: [-0.62, 1.15, 0], alfa: FRENTE - 0.8, beta: 1.2, raio: 2.0 },
    descricao:
      "A placa universal de 3 castanhas prende a peça e gira com o eixo-árvore. A proteção da placa tem micro de segurança anti-burla: a máquina não liga com ela aberta.",
    fatos: [
      ["Placa", "3 castanhas, Ø 250 mm"],
      ["Montagem", "Nariz do eixo-árvore ASA L0"],
      ["Medição", "Rotação (rpm)"],
    ],
  },
  {
    id: "painel",
    titulo: "Painel de comandos",
    tag: "Comando e segurança",
    cor: "#ffd43b",
    componentes: ["painel"],
    pino: [-1.04, 0.84, 0.42],
    camera: { alfa: FRENTE + 0.25, beta: 1.3, raio: 2.0 },
    descricao:
      "Concentra a parada de emergência, os botões de comando e as alavancas seletoras de velocidade, avanços e roscas.",
    fatos: [
      ["Segurança", "Parada de emergência"],
      ["Seletores", "Velocidades, avanços e roscas"],
    ],
  },
  {
    id: "carros",
    titulo: "Carros e porta-ferramentas",
    tag: "Movimento da ferramenta",
    cor: "#69db7c",
    componentes: [
      "carro_longitudinal",
      "volante_longitudinal",
      "carro_transversal",
      "volante_transversal",
      "carro_superior",
      "manivela_superior",
      "porta_ferramentas",
    ],
    pino: [0.04, 0.8, 0.46],
    camera: { alfa: FRENTE - 0.35, beta: 1.05, raio: 2.4 },
    descricao:
      "O carro longitudinal leva a ferramenta ao longo do barramento; o transversal, na direção radial; o superior pode ser inclinado para tornear cones. O avental tem engrenagens em banho de óleo e bomba manual de lubrificação das guias.",
    fatos: [
      ["Curso transversal", "300 mm"],
      ["Curso do carro superior", "120 mm"],
      ["Porta-ferramentas", "4 posições, cabo 20 × 20 mm"],
    ],
  },
  {
    id: "barramento",
    titulo: "Barramento, fuso e vara",
    tag: "Estrutura e guias",
    cor: "#4dabf7",
    componentes: ["barramento", "fuso_vara"],
    pino: [0.45, 0.9, 0.16],
    camera: { alfa: FRENTE - 0.2, beta: 1.1, raio: 3.6 },
    descricao:
      "As guias do barramento sustentam e alinham o carro e o cabeçote móvel. O fuso de guia e a vara de avanços ficam enclausurados por proteção em aço inox, que afasta o operador e protege contra cavacos e fluido de corte.",
    fatos: [
      ["Largura do barramento", "305 mm"],
      ["Altura do barramento", "334 mm"],
      ["Passo do fuso de guia", "6 mm"],
    ],
  },
  {
    id: "contraponto",
    titulo: "Cabeçote móvel e luneta",
    tag: "Apoio de peças longas",
    cor: "#b197fc",
    componentes: ["contraponto", "volante_contraponto", "luneta"],
    pino: [1.04, 1.28, 0],
    camera: { alfa: FRENTE - 0.6, beta: 1.15, raio: 2.4 },
    descricao:
      "O cabeçote móvel apoia peças longas com ponto rotativo; a manga é graduada em mm e polegada. A luneta fixa apoia eixos e tubos longos, reduzindo flexão e vibração durante a usinagem.",
    fatos: [
      ["Cone do ponto", "CM 4"],
      ["Manga", "Ø 60 mm, curso de 125 mm"],
    ],
  },
  {
    id: "base",
    titulo: "Base e motor principal",
    tag: "Acionamento · instrumentado",
    cor: "#f783ac",
    componentes: ["base", "bandeja"],
    medicoes: ["corrente"],
    sensoresInternos: true,
    pino: [-1.0, 0.3, 0.44],
    camera: { alvo: [-0.6, 0.45, 0.1], alfa: FRENTE + 0.45, beta: 1.2, raio: 3.2 },
    descricao:
      "O motor principal fica no pedestal do lado do cabeçote e transmite o movimento por correias e polias multi-V. O sensor de corrente fica no painel elétrico, na alimentação do motor. A bandeja recolhe cavacos e fluido de corte.",
    fatos: [
      ["Motor", "AC assíncrono, 7,5 cv"],
      ["Freio", "Eletromagnético"],
      ["Transmissão", "Correias e polias multi-V"],
      ["Sensor de corrente", "Painel elétrico"],
    ],
  },
  {
    id: "protecoes",
    titulo: "Proteções e acessórios",
    tag: "Segurança (NR-12)",
    cor: "#38d9a9",
    componentes: ["protecao_cavacos", "protecao_traseira", "acessorios"],
    pino: [0.05, 1.55, -0.07],
    camera: { alfa: FRENTE - 0.1, beta: 0.95, raio: 3.2 },
    descricao:
      "O visor de policarbonato contra cavacos tem micro anti-burla: a máquina não liga com a proteção aberta. A proteção traseira reduz a projeção de cavacos e respingos. A luminária ilumina a área de trabalho e a tubulação leva o fluido de corte.",
    fatos: [
      ["Visor", "Policarbonato com micro anti-burla"],
      ["Refrigeração de corte", "Bomba de 0,125 cv"],
    ],
  },
  {
    id: "monitoramento",
    titulo: "Monitoramento e diagnóstico",
    tag: "Sensores e dados",
    cor: "#e599f7",
    camera: { alvo: [-0.6, 1.05, 0.3], alfa: FRENTE + 0.1, beta: 1.22, raio: 3.4 },
    medicoes: ["temperatura", "oleo", "corrente", "vibracao", "rotacao"],
    sensoresInternos: true,
    descricao:
      "O sensor de corrente fica no painel elétrico; os de temperatura, vibração, nível de óleo e rotação, na caixa lateral de engrenagens. As leituras chegam por um ESP32 e um broker MQTT e aparecem como Normal, Atenção, Alarme ou Sem dados. Sem sensores, a Simulação reproduz a operação.",
    fatos: [
      ["Painel elétrico", "Corrente"],
      ["Caixa de engrenagens", "Temperatura, vibração, óleo e rotação"],
      ["Comunicação", "ESP32 → MQTT (WebSocket)"],
      ["Modos", "Ao vivo, Simulação, Replay e Desafio"],
    ],
  },
];
