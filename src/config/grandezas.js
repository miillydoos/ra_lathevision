// As cinco grandezas monitoradas e onde aparecem no modelo.
// Coordenadas em metros, no mesmo sistema do torno.glb (X ao longo do barramento,
// cabeçote em -X, Y para cima, frente do operador em +Z).
// `marcador` = ponto instrumentado; `rotulo` = onde o painel flutuante fica.
// Ajuste fino ao vivo pelo console: lab.moverRotulo("temperatura", x, y, z)

export const GRANDEZAS = [
  {
    id: "temperatura",
    nome: "Temperatura",
    unidade: "°C",
    casas: 1,
    icone: "termometro",
    componente: "cabecote",
    local: "Carcaça do cabeçote, junto ao rolamento dianteiro",
    representacao: "Marcador no ponto instrumentado e gráfico de evolução.",
    cuidado: "Uma medição pontual não representa a temperatura de toda a máquina.",
    marcador: [-0.8, 1.336, 0.12],
    rotulo: [-1.15, 1.62, 0.2],
  },
  {
    id: "oleo",
    nome: "Nível de óleo",
    unidade: "%",
    casas: 0,
    icone: "gota",
    componente: "cabecote",
    local: "Reservatório do cabeçote (banho de óleo)",
    representacao: "Visor virtual associado ao reservatório monitorado.",
    cuidado:
      "Exibir porcentagem somente se o sensor permitir medição contínua; com boia, mostrar apenas os estados disponíveis.",
    marcador: [-0.704, 0.8, 0.2],
    rotulo: [-0.3, 0.84, 0.66],
  },
  {
    id: "corrente",
    nome: "Corrente do motor",
    unidade: "A",
    casas: 1,
    icone: "raio",
    componente: "base",
    local: "Alimentação do motor principal (pedestal do cabeçote)",
    representacao: "Painel do motor com corrente e histórico durante a operação.",
    cuidado: "Corrente isolada não determina potência elétrica nem identifica a causa de uma sobrecarga.",
    marcador: [-1.065, 0.33, 0.305],
    rotulo: [-1.065, 0.42, 0.8],
  },
  {
    id: "vibracao",
    nome: "Vibração",
    unidade: "mm/s",
    sufixo: "RMS",
    casas: 2,
    icone: "onda",
    componente: "cabecote",
    local: "Carcaça do cabeçote, próximo ao rolamento dianteiro (radial)",
    representacao: "Indicador junto ao sensor e tendência; análise de frequência se a aquisição permitir.",
    cuidado: "O diagnóstico depende do sensor, da montagem e da qualidade da aquisição.",
    marcador: [-0.702, 1.02, 0.27],
    rotulo: [-0.3, 1.18, 0.66],
  },
  {
    id: "rotacao",
    nome: "Rotação do eixo-árvore",
    unidade: "rpm",
    casas: 0,
    icone: "rotacao",
    componente: "placa",
    local: "Eixo-árvore",
    representacao: "Indicador de RPM e movimento da placa.",
    cuidado: "Em alta rotação a animação da placa é ilustrativa; a leitura numérica é a referência.",
    marcador: [-0.6, 1.262, 0.1],
    rotulo: [-0.45, 1.66, 0.25],
  },
];

export const GRANDEZA_POR_ID = Object.fromEntries(GRANDEZAS.map((g) => [g.id, g]));

/** Formata um número no padrão brasileiro com o número de casas da grandeza. */
export function formatarValor(grandeza, valor) {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return "—";
  return valor.toLocaleString("pt-BR", {
    minimumFractionDigits: grandeza.casas,
    maximumFractionDigits: grandeza.casas,
  });
}
