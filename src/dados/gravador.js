import { GRANDEZAS } from "../config/grandezas.js";
import { FORMATO_SESSAO } from "./sessao.js";
import { criarEmissor } from "../util/emissor.js";

/**
 * Grava as leituras que chegam ao fluxo (ao vivo ou simulação) numa sessão reproduzível.
 * Para sozinho se a fonte de dados mudar.
 */
export function criarGravador({ fluxo, config }) {
  const eventos = criarEmissor();
  let sessao = null;
  let total = 0;

  fluxo.on("leitura", (id, v, t) => {
    if (!sessao || v === null) return;
    sessao.series[id].push([Math.round(t - sessao.inicio), Number(v.toFixed(4))]);
    total++;
  });
  fluxo.on("fonte", () => {
    if (sessao) eventos.emitir("interrompida", parar());
  });

  function iniciar({ titulo, origem, contexto = {} } = {}) {
    const inicio = fluxo.agora();
    sessao = {
      formato: FORMATO_SESSAO,
      id: `sessao-${Date.now()}`,
      titulo: titulo || `Sessão de ${new Date().toLocaleString("pt-BR")}`,
      maquina: config.maquina,
      origem,
      inicio,
      fim: inicio,
      contexto,
      limites: JSON.parse(JSON.stringify(config.grandezas)),
      series: Object.fromEntries(GRANDEZAS.map((g) => [g.id, []])),
      eventos: [],
    };
    total = 0;
    eventos.emitir("estado", true);
  }

  function parar() {
    if (!sessao) return null;
    const s = sessao;
    s.fim = fluxo.agora();
    sessao = null;
    eventos.emitir("estado", false);
    return s;
  }

  return {
    iniciar,
    parar,
    /** Registra um evento na linha do tempo (ex.: "Troca de ferramenta"). */
    anotar(texto, tipo = "sistema") {
      if (sessao) sessao.eventos.push({ t: Math.round(fluxo.agora() - sessao.inicio), texto, tipo });
    },
    get gravando() {
      return !!sessao;
    },
    get duracaoS() {
      return sessao ? (fluxo.agora() - sessao.inicio) / 1000 : 0;
    },
    get total() {
      return total;
    },
    on: eventos.on,
  };
}
