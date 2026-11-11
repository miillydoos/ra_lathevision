import { tipoConexao } from "../config/configuracao.js";
import { criarFonteMQTT } from "./fonteMQTT.js";
import { criarFonteWebSocket } from "./fonteWebSocket.js";

/**
 * Modo "Ao vivo": usa a conexão escolhida em Configurações a cada vez que o modo é ativado —
 * WebSocket direto no IP do ESP32 (padrão) ou broker MQTT.
 */
export function criarFonteAoVivo({ config }) {
  const conexoes = { websocket: criarFonteWebSocket({ config }), mqtt: criarFonteMQTT({ config }) };
  let atual = null;
  return {
    id: "aoVivo",
    nome: "Ao vivo",
    async iniciar(fluxo) {
      atual = conexoes[tipoConexao(config)];
      await atual.iniciar(fluxo);
    },
    async parar() {
      const a = atual;
      atual = null;
      await a?.parar();
    },
    agora: () => Date.now(),
  };
}
