// Formato de sessão gravada (JSON):
// {
//   formato: "lab-torno-sessao/1",
//   id, titulo, maquina, origem: "aoVivo" | "simulacao" | "exemplo",
//   inicio: época em ms, fim: época em ms,
//   contexto: { operacao, material, ferramenta, observacoes },   // informado pelo professor
//   limites: { <grandeza>: { atencao, alarme, sentido, escala, sensor } },
//   series: { <grandeza>: [[ms desde o início, valor], ...] },
//   eventos: [{ t: ms desde o início, texto, tipo: "sistema" | "aluno" }]
// }
import { GRANDEZAS } from "../config/grandezas.js";

export const FORMATO_SESSAO = "lab-torno-sessao/1";

/** Valida e normaliza uma sessão lida de arquivo. Lança erro com mensagem amigável. */
export function normalizarSessao(bruta) {
  if (!bruta || typeof bruta !== "object") throw new Error("Arquivo não é uma sessão válida.");
  if (bruta.formato && bruta.formato !== FORMATO_SESSAO) throw new Error(`Formato não suportado: ${bruta.formato}`);
  if (!bruta.series || typeof bruta.series !== "object") throw new Error("A sessão não tem séries de dados.");
  const series = {};
  let fimRel = 0;
  for (const g of GRANDEZAS) {
    const s = Array.isArray(bruta.series[g.id]) ? bruta.series[g.id] : [];
    series[g.id] = s
      .filter((p) => Array.isArray(p) && Number.isFinite(p[0]))
      .map(([t, v]) => [t, v === null ? null : Number(v)])
      .sort((a, b) => a[0] - b[0]);
    if (series[g.id].length) fimRel = Math.max(fimRel, series[g.id][series[g.id].length - 1][0]);
  }
  const inicio = Number.isFinite(bruta.inicio) ? bruta.inicio : Date.now();
  return {
    formato: FORMATO_SESSAO,
    id: bruta.id ?? `sessao-${inicio}`,
    titulo: bruta.titulo ?? "Sessão sem título",
    maquina: bruta.maquina ?? "",
    origem: bruta.origem ?? "arquivo",
    inicio,
    fim: Number.isFinite(bruta.fim) ? Math.max(bruta.fim, inicio + fimRel) : inicio + fimRel,
    contexto: bruta.contexto ?? {},
    limites: bruta.limites ?? null,
    series,
    eventos: Array.isArray(bruta.eventos) ? bruta.eventos.filter((e) => Number.isFinite(e.t)).sort((a, b) => a.t - b.t) : [],
  };
}

/** Índice do primeiro ponto com t > alvo. */
export function indiceDepois(serie, alvo) {
  let lo = 0;
  let hi = serie.length;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (serie[m][0] <= alvo) lo = m + 1;
    else hi = m;
  }
  return lo;
}
