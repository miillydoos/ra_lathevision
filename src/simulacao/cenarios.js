// Situações simuladas que o professor aplica à máquina virtual.
// Cada cenário devolve, para t segundos após o início, os parâmetros de falha do modelo.
// O comportamento é ilustrativo: a mesma combinação de sinais pode ter outras causas na máquina real.

import { FALHAS_NULAS } from "./modelo.js";

const rampa = (t, inicio, duracao) => Math.max(0, Math.min(1, (t - inicio) / duracao));

export const CENARIOS = [
  {
    id: "normal",
    nome: "Operação normal",
    descricao: "Sem falhas inseridas.",
    falhas: () => ({}),
  },
  {
    id: "aquecimento",
    nome: "Aquecimento do cabeçote",
    descricao:
      "Atrito interno crescente no cabeçote. A temperatura sobe lentamente acima do habitual e a corrente fica um pouco maior; nível de óleo e vibração quase não mudam.",
    falhas: (t, k = 1) => ({ atrito: 1.0 * k * rampa(t, 0, 60) }),
  },
  {
    id: "oleoBaixo",
    nome: "Nível baixo de óleo",
    descricao:
      "Vazamento lento no reservatório. O nível cai durante a operação; quando fica baixo, a lubrificação piora e a temperatura começa a subir depois.",
    falhas: (t, k = 1) => ({ vazamento: 12 * k }),
  },
  {
    id: "vibracao",
    nome: "Vibração elevada",
    descricao:
      "Desbalanceamento crescente no conjunto girante. A vibração aumenta (mais em rotação alta), a corrente passa a oscilar e, mais tarde, a temperatura sobe.",
    falhas: (t, k = 1) => ({
      desbalanceamento: 0.95 * k * rampa(t, 0, 90),
      oscilacaoCorrente: 0.8 * k * rampa(t, 30, 90),
      atrito: 0.35 * k * rampa(t, 150, 120),
    }),
  },
];

export const CENARIO_POR_ID = Object.fromEntries(CENARIOS.map((c) => [c.id, c]));

/** Instancia um cenário a partir de um instante da simulação. */
export function iniciarCenario(id, { inicio, intensidade = 1 }) {
  const c = CENARIO_POR_ID[id] ?? CENARIO_POR_ID.normal;
  return {
    id: c.id,
    nome: c.nome,
    inicio,
    intensidade,
    // nada antes do início; depois, sempre todos os parâmetros (os ausentes ficam em zero)
    falhas: (tSeg) => (tSeg < inicio ? { ...FALHAS_NULAS } : { ...FALHAS_NULAS, ...c.falhas(tSeg - inicio, intensidade) }),
  };
}
