import { GRANDEZAS } from "../config/grandezas.js";
import { RPM_LIMITE_ANIMACAO } from "./placa.js";
import { textoIdade, textoValor } from "../ui/sensoresUI.js";

/**
 * Leva o estado das medições para o modelo 3D: rótulos dos sensores e giro da placa.
 * (O nível de óleo aparece no reservatório da caixa de engrenagens: compartimentos.js.)
 */
export function sincronizarCena({ fluxo, config, pontos, placa }) {
  function atualizar() {
    for (const g of GRANDEZAS) {
      const e = fluxo.estado(g.id);
      const tv = textoValor(config, g.id, e.valor);
      const boia = g.id === "oleo" && config.grandezas.oleo?.sensor === "boia";
      let nota = e.velha ? `última leitura ${textoIdade(e.idade)}` : textoIdade(e.idade);
      if (g.id === "rotacao" && e.estado !== "semDados" && e.valor > RPM_LIMITE_ANIMACAO) {
        nota = `animação ilustrativa · ${nota}`;
      }
      pontos.atualizar(g.id, { valor: e.valor, estado: e.estado, texto: boia ? tv.valor : undefined, nota });

      if (g.id === "rotacao") placa.definirRpm(e.estado === "semDados" ? 0 : e.valor ?? 0);
    }
  }
  const intervalo = setInterval(atualizar, 250);
  atualizar();
  return { atualizar, parar: () => clearInterval(intervalo) };
}
