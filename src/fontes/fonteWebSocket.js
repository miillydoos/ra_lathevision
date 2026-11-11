import { enderecoWebSocket } from "../config/configuracao.js";
import { criarLeitor } from "./leituras.js";

const RECONECTAR_MS = 3000;
const TEMPO_LIMITE_MS = 8000;

/**
 * Fonte "Ao vivo" sem broker: o ESP32 é um servidor WebSocket na rede local e esta aplicação
 * conecta direto no IP dele (ws://<ip>:81/).
 *
 * Cada mensagem é um JSON com as grandezas lidas (as que faltarem ficam sem leitura nova):
 *   {"temperatura": 41.2, "oleo": 78, "corrente": 12.4, "vibracao": 1.15, "rotacao": 800}
 * "ts" é opcional (ver leituras.js); sem ele vale a hora de chegada.
 */
export function criarFonteWebSocket({ config }) {
  let fluxo = null;
  let socket = null;
  let ativo = false;
  let timerReconexao = null;
  let timerLimite = null;
  const { publicarLeituras } = criarLeitor(config);
  const endereco = () => enderecoWebSocket(config.websocket);

  function definir(estado, detalhe) {
    const textos = {
      conectando: "Ao vivo · conectando ao ESP32…",
      conectado: "Ao vivo",
      desconectado: "Ao vivo · sem conexão com o ESP32",
      erro: "Ao vivo · erro de conexão",
    };
    fluxo.definirConexao({ estado, texto: textos[estado], detalhe: detalhe ?? endereco() });
  }

  // Páginas HTTPS (GitHub Pages, npm run dev:https) não podem abrir ws:// — só localhost é exceção.
  function bloqueadoPeloNavegador(url) {
    if (location.protocol !== "https:" || !url.startsWith("ws://")) return false;
    const host = new URL(url).hostname;
    return !(host === "localhost" || host.startsWith("127."));
  }

  function aoMensagem(evento) {
    if (typeof evento.data !== "string") return;
    let dados;
    try {
      dados = JSON.parse(evento.data);
    } catch {
      return;
    }
    if (dados && typeof dados === "object" && !Array.isArray(dados)) publicarLeituras(fluxo, dados);
  }

  function conectar() {
    if (!ativo) return;
    const url = endereco();
    if (bloqueadoPeloNavegador(url)) {
      definir(
        "erro",
        `Esta página está em HTTPS e o navegador bloqueia ws://${new URL(url).host}. Abra o app por http:// na rede local (npm run dev → http://<ip-do-computador>:5173).`,
      );
      return;
    }
    definir("conectando");
    let s;
    try {
      s = new WebSocket(url);
    } catch (erro) {
      definir("erro", `Endereço inválido (${url}): ${erro.message}`);
      return;
    }
    socket = s;
    // IP errado ou ESP32 desligado pode demorar muito para falhar: desiste e tenta de novo
    timerLimite = setTimeout(() => s.readyState === WebSocket.CONNECTING && s.close(), TEMPO_LIMITE_MS);
    s.onopen = () => {
      clearTimeout(timerLimite);
      if (socket === s) definir("conectado");
    };
    s.onmessage = (e) => {
      if (socket === s) aoMensagem(e);
    };
    s.onclose = () => {
      clearTimeout(timerLimite);
      if (socket !== s) return;
      socket = null;
      if (!ativo) return;
      definir("desconectado", `${url} · nova tentativa em ${RECONECTAR_MS / 1000} s`);
      timerReconexao = setTimeout(conectar, RECONECTAR_MS);
    };
  }

  return {
    id: "aoVivo",
    nome: "Ao vivo",
    async iniciar(f) {
      fluxo = f;
      ativo = true;
      if (!endereco()) {
        definir("erro", "Informe o IP do ESP32 em Configurações.");
        return;
      }
      conectar();
    },
    async parar() {
      ativo = false;
      clearTimeout(timerReconexao);
      clearTimeout(timerLimite);
      const s = socket;
      socket = null;
      s?.close();
    },
    agora: () => Date.now(),
  };
}
