import { GRANDEZAS } from "../config/grandezas.js";

export const IDS_GRANDEZAS = new Set(GRANDEZAS.map((g) => g.id));
const TOLERANCIA_RELOGIO_MS = 60_000;

/**
 * Interpretação das leituras que chegam do ESP32, comum às conexões MQTT e WebSocket.
 *
 * "ts" é opcional (época em ms, em s ou texto ISO). Se o relógio do dispositivo estiver muito
 * diferente do navegador (ESP32 sem NTP), vale a hora de chegada da mensagem.
 */
export function criarLeitor(config) {
  function instante(ts) {
    const agora = Date.now();
    if (ts === undefined || ts === null) return agora;
    const t = typeof ts === "string" ? Date.parse(ts) : Number(ts) < 1e11 ? Number(ts) * 1000 : Number(ts);
    return Number.isFinite(t) && Math.abs(t - agora) < TOLERANCIA_RELOGIO_MS ? t : agora;
  }

  function lerValor(id, bruto) {
    if (id === "oleo" && config.grandezas.oleo?.sensor === "boia") {
      if (typeof bruto === "string") return /^(ok|alto|normal|1|true)$/i.test(bruto.trim()) ? 1 : 0;
      return Number(bruto) >= 0.5 ? 1 : 0;
    }
    return Number(bruto);
  }

  /** Objeto com várias grandezas: {"ts": ..., "temperatura": 42.3, "rotacao": 800}. */
  function publicarLeituras(fluxo, dados) {
    const t = instante(dados.ts);
    for (const [id, v] of Object.entries(dados)) if (IDS_GRANDEZAS.has(id)) fluxo.publicar(id, lerValor(id, v), t);
  }

  return { instante, lerValor, publicarLeituras };
}
