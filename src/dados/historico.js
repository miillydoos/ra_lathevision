import { GRANDEZAS, GRANDEZA_POR_ID } from "../config/grandezas.js";
import { ESTADOS } from "../config/estados.js";
import { criarEmissor } from "../util/emissor.js";

const CHAVE = "lathevision.historico.v1";
const MAX_EVENTOS = 1000;
const PASSO_MS = 1000; // amostragem do estado de cada grandeza
const MAX_PASSO_S = 60; // aba em segundo plano / aparelho dormindo: não conta horas de uma vez

/** Origens que entram no histórico (o replay só reproduz o que já aconteceu). */
export const ORIGENS = { aoVivo: "Ao vivo", simulacao: "Simulação" };

const estatVazia = () => ({
  n: 0,
  soma: 0,
  min: null,
  max: null,
  ultimo: null,
  tUltimo: null,
  estado: "semDados",
  tempo: { normal: 0, atencao: 0, alarme: 0, semDados: 0 },
  alarmes: 0,
  atencoes: 0,
});
const registroVazio = () => ({ versao: 1, inicio: Date.now(), eventos: [], estat: {} });

/**
 * Histórico do monitoramento, guardado neste navegador (localStorage):
 * - eventos: mudanças de estado das grandezas (Atenção, Alarme, normalizou, sem dados), conexão,
 *   troca de modo, situações aplicadas na simulação e gravações;
 * - estatísticas por origem (Ao vivo / Simulação) e grandeza: leituras, mín/média/máx,
 *   tempo em cada estado e quantas vezes entrou em Atenção e em Alarme.
 * O replay não entra: ele só reproduz sessões já gravadas.
 */
export function criarHistorico({ fluxo, config }) {
  const emissor = criarEmissor();
  let dados = ler();
  let origem = null; // "aoVivo" | "simulacao" enquanto monitora; null no replay
  let anteriores = {}; // último estado visto de cada grandeza (desde a troca de fonte)
  let conexaoAnterior = null;
  let tPasso = Date.now();
  let sujo = false;

  function ler() {
    try {
      const s = JSON.parse(localStorage.getItem(CHAVE) ?? "null");
      if (s?.versao === 1 && Array.isArray(s.eventos) && s.estat) return s;
    } catch {
      /* sem armazenamento: começa vazio */
    }
    return registroVazio();
  }
  function salvar() {
    if (!sujo) return;
    sujo = false;
    try {
      localStorage.setItem(CHAVE, JSON.stringify(dados));
    } catch {
      /* armazenamento cheio ou bloqueado: o histórico segue só nesta aba */
    }
  }

  function estat(o, id) {
    dados.estat[o] ??= {};
    return (dados.estat[o][id] ??= estatVazia());
  }

  function registrar(tipo, texto, extra = {}) {
    const e = { t: Date.now(), tipo, texto, origem: origem ?? null, ...extra };
    dados.eventos.push(e);
    if (dados.eventos.length > MAX_EVENTOS) dados.eventos.splice(0, dados.eventos.length - MAX_EVENTOS);
    sujo = true;
    emissor.emitir("evento", e);
    return e;
  }

  // ---------- troca de fonte (emitida antes de a nova fonte começar a publicar)
  fluxo.on("fonte", (f) => {
    const nova = f && ORIGENS[f.id] ? f.id : null;
    anteriores = {};
    conexaoAnterior = null;
    tPasso = Date.now();
    origem = nova;
    registrar("modo", `Modo ${f?.nome ?? "—"}`, { origem: f?.id ?? null });
  });

  // ---------- leituras: estatísticas por origem
  fluxo.on("leitura", (id, v) => {
    if (!origem || v === null || !GRANDEZA_POR_ID[id]) return;
    const s = estat(origem, id);
    s.n++;
    s.soma += v;
    s.min = s.min === null ? v : Math.min(s.min, v);
    s.max = s.max === null ? v : Math.max(s.max, v);
    s.ultimo = v;
    s.tUltimo = Date.now();
    sujo = true;
  });

  // ---------- conexão (só no Ao vivo: é lá que ela pode cair)
  fluxo.on("conexao", (c) => {
    if (origem !== "aoVivo" || c.estado === conexaoAnterior) return;
    const antes = conexaoAnterior;
    conexaoAnterior = c.estado;
    if (antes === null && c.estado === "conectando") return; // início normal, sem ruído
    const tipo = c.estado === "conectado" ? "conectado" : c.estado === "conectando" ? "sistema" : "desconectado";
    registrar(tipo, `Conexão: ${c.texto ?? c.estado}`, { detalhe: c.detalhe ?? "" });
  });

  // ---------- estado de cada grandeza, a cada segundo
  function passo() {
    const agora = Date.now();
    const dt = Math.min(MAX_PASSO_S, Math.max(0, (agora - tPasso) / 1000));
    tPasso = agora;
    if (!origem) return;
    for (const g of GRANDEZAS) {
      const e = fluxo.estado(g.id);
      const s = estat(origem, g.id);
      s.tempo[e.estado] = (s.tempo[e.estado] ?? 0) + dt;
      s.estado = e.estado;
      const antes = anteriores[g.id];
      anteriores[g.id] = e.estado;
      if (antes === undefined || antes === e.estado) continue;
      const valor = e.valor;
      if (e.estado === "alarme") {
        s.alarmes++;
        registrar("alarme", `${g.nome}: Alarme`, { grandeza: g.id, valor, de: antes });
      } else if (e.estado === "atencao") {
        if (antes !== "alarme") s.atencoes++;
        registrar("atencao", `${g.nome}: ${antes === "alarme" ? "baixou para Atenção" : "Atenção"}`, { grandeza: g.id, valor, de: antes });
      } else if (e.estado === "normal" && (antes === "atencao" || antes === "alarme")) {
        registrar("normal", `${g.nome}: voltou ao Normal`, { grandeza: g.id, valor, de: antes });
      } else if (e.estado === "semDados" && antes !== "semDados") {
        registrar("semDados", `${g.nome}: sem dados (o sensor parou de enviar)`, { grandeza: g.id, de: antes });
      } else if (antes === "semDados" && e.estado === "normal" && origem === "aoVivo") {
        registrar("normal", `${g.nome}: recebendo leituras`, { grandeza: g.id, valor, de: antes });
      }
    }
    sujo = true;
  }
  setInterval(passo, PASSO_MS);
  setInterval(salvar, 5000);
  window.addEventListener("pagehide", salvar);
  document.addEventListener("visibilitychange", () => document.visibilityState === "hidden" && salvar());

  registrar("sistema", "LatheVision aberto neste aparelho", { origem: null });

  return {
    /** Anotação livre na linha do tempo (situação aplicada, gravação, …). */
    anotar(texto, tipo = "sistema") {
      return registrar(tipo, texto);
    },
    /** Apaga eventos e estatísticas e começa um novo período. */
    limpar() {
      dados = registroVazio();
      anteriores = {};
      sujo = true;
      registrar("sistema", "Histórico limpo: novo período de monitoramento", { origem: null });
      salvar();
      emissor.emitir("limpo");
    },
    get inicio() {
      return dados.inicio;
    },
    get eventos() {
      return dados.eventos;
    },
    get origem() {
      return origem;
    },
    /** Estatísticas de uma origem: { [grandeza]: {...} } (vazio se ainda não monitorou nela). */
    estatisticas(o) {
      return dados.estat[o] ?? {};
    },
    /** Origens com alguma leitura ou tempo registrado. */
    origensComDados() {
      return Object.keys(ORIGENS).filter((o) => Object.values(dados.estat[o] ?? {}).some((s) => s.n > 0 || totalTempo(s) > 0));
    },
    config,
    on: emissor.on,
  };
}

export const totalTempo = (s) => Object.values(s?.tempo ?? {}).reduce((a, b) => a + b, 0);

/** Texto curto de duração: "45 s", "12 min", "3 h 20 min". */
export function textoDuracao(seg) {
  const s = Math.round(seg ?? 0);
  if (s < 60) return `${s} s`;
  const min = Math.floor(s / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return `${h} h${min % 60 ? ` ${min % 60} min` : ""}`;
}

export const TEXTO_ESTADO = Object.fromEntries(Object.values(ESTADOS).map((e) => [e.id, e.texto]));
