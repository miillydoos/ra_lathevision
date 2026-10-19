import { GRANDEZAS } from "../config/grandezas.js";

const IDS = new Set(GRANDEZAS.map((g) => g.id));
const TOLERANCIA_RELOGIO_MS = 60_000;

/**
 * Fonte "Ao vivo": ESP32 → broker MQTT → esta aplicação (MQTT sobre WebSocket).
 *
 * Tópicos aceitos (base configurável, ex.: "senai/torno01"):
 *   <base>/temperatura | oleo | corrente | vibracao | rotacao
 *       payload: número ("42.3") ou JSON {"v": 42.3, "ts": 1760000000000}
 *   <base>/leituras
 *       payload JSON com várias grandezas: {"ts": ..., "temperatura": 42.3, "rotacao": 800}
 *   <base>/status
 *       "online" / "offline" (use como Last Will no ESP32)
 *
 * "ts" é opcional (época em ms ou texto ISO). Se o relógio do dispositivo estiver muito
 * diferente do navegador (ESP32 sem NTP), vale a hora de chegada da mensagem.
 */
export function criarFonteMQTT({ config }) {
  let cliente = null;
  let fluxo = null;
  let statusDispositivo = null;
  const opcoes = () => config.mqtt ?? {};

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

  function aoMensagem(topico, mensagem) {
    const base = (opcoes().topicoBase ?? "").replace(/\/+$/, "");
    if (!topico.startsWith(base + "/")) return;
    const sufixo = topico.slice(base.length + 1);
    const texto = new TextDecoder().decode(mensagem).trim();

    if (sufixo === "status") {
      statusDispositivo = texto.toLowerCase();
      atualizarConexao();
      return;
    }

    let dados = null;
    try {
      dados = JSON.parse(texto);
    } catch {
      dados = texto;
    }

    if (sufixo === "leituras" && dados && typeof dados === "object") {
      const t = instante(dados.ts);
      for (const [id, v] of Object.entries(dados)) if (IDS.has(id)) fluxo.publicar(id, lerValor(id, v), t);
      return;
    }
    if (IDS.has(sufixo)) {
      if (dados && typeof dados === "object") fluxo.publicar(sufixo, lerValor(sufixo, dados.v ?? dados.valor), instante(dados.ts));
      else fluxo.publicar(sufixo, lerValor(sufixo, dados), instante(null));
    }
  }

  function atualizarConexao(estado, detalhe) {
    const o = opcoes();
    if (estado) fonte._estado = estado;
    const e = fonte._estado;
    const textos = {
      conectando: "Ao vivo · conectando ao broker…",
      conectado: statusDispositivo === "offline" ? "Ao vivo · broker conectado, ESP32 offline" : "Ao vivo",
      desconectado: "Ao vivo · sem conexão com o broker",
      erro: "Ao vivo · erro de conexão",
    };
    fluxo.definirConexao({
      estado: e === "conectado" && statusDispositivo === "offline" ? "conectando" : e,
      texto: textos[e] ?? e,
      detalhe: detalhe ?? `${o.url ?? ""} · ${o.topicoBase ?? ""}/#`,
    });
  }

  const fonte = {
    id: "aoVivo",
    nome: "Ao vivo",
    _estado: "desconectado",
    async iniciar(f) {
      fluxo = f;
      const o = opcoes();
      if (!o.url) {
        atualizarConexao("erro", "Configure o endereço do broker em Configurações.");
        return;
      }
      atualizarConexao("conectando");
      let mqtt;
      try {
        ({ default: mqtt } = await import("mqtt"));
      } catch (erro) {
        atualizarConexao("erro", `Biblioteca MQTT indisponível: ${erro.message}`);
        return;
      }
      cliente = mqtt.connect(o.url, {
        clientId: `lab-torno-${Math.random().toString(16).slice(2, 10)}`,
        username: o.usuario || undefined,
        password: o.senha || undefined,
        reconnectPeriod: 3000,
        connectTimeout: 8000,
        clean: true,
      });
      cliente.on("connect", () => {
        cliente.subscribe(`${(o.topicoBase ?? "").replace(/\/+$/, "")}/#`, { qos: 0 });
        atualizarConexao("conectado");
      });
      cliente.on("reconnect", () => atualizarConexao("conectando"));
      cliente.on("close", () => atualizarConexao("desconectado"));
      cliente.on("offline", () => atualizarConexao("desconectado"));
      cliente.on("error", (erro) => atualizarConexao("erro", erro?.message));
      cliente.on("message", aoMensagem);
    },
    async parar() {
      if (cliente) {
        const c = cliente;
        cliente = null;
        await new Promise((r) => c.end(true, {}, r));
      }
      statusDispositivo = null;
    },
    agora: () => Date.now(),
  };
  return fonte;
}
