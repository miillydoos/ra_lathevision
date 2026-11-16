// As quatro grandezas monitoradas. Os sensores (e as etiquetas com o valor de cada medição) ficam no modelo:
// corrente no painel elétrico, nível de óleo e rotação na caixa lateral de engrenagens (compartimentos.js) e
// vibração na caixa de monitoramento do tampo do cabeçote (caixaMonitoramento.js).

export const GRANDEZAS = [
  {
    id: "oleo",
    nome: "Nível de óleo",
    unidade: "%",
    casas: 0,
    icone: "gota",
    componente: "cabecote",
    local: "Reservatório do cabeçote (banho de óleo)",
    representacao: "Reservatório na caixa lateral de engrenagens, com o óleo acompanhando a medição.",
    cuidado:
      "Exibir porcentagem somente se o sensor permitir medição contínua; com boia, mostrar apenas os estados disponíveis.",
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
  },
  {
    id: "vibracao",
    nome: "Vibração",
    unidade: "mm/s",
    sufixo: "RMS",
    casas: 2,
    icone: "onda",
    componente: "cabecote",
    local: "Acelerômetro MPU-6050 na caixa de monitoramento, no tampo do cabeçote",
    representacao: "Etiqueta junto ao sensor e tendência; análise de frequência se a aquisição permitir.",
    cuidado: "O diagnóstico depende do sensor, da montagem e da qualidade da aquisição.",
  },
  {
    id: "rotacao",
    nome: "Rotação do eixo-árvore",
    unidade: "rpm",
    casas: 0,
    icone: "rotacao",
    componente: "placa",
    local: "Eixo-árvore (sensor de velocidade óptico na roda dentada da ponta do eixo)",
    representacao: "Etiqueta junto ao sensor, giro da placa e da roda dentada.",
    cuidado: "Em alta rotação a animação da placa é ilustrativa; a leitura numérica é a referência.",
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
