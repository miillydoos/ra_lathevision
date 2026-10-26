import { textoIdade } from "./sensoresUI.js";

/**
 * Indicador no topo: de onde vêm os dados e a idade da última leitura.
 * Ao vivo, a idade mostra se o sensor/broker parou de enviar mesmo com a conexão aberta.
 */
export function criarConexaoUI({ fluxo }) {
  const el = document.getElementById("conexao");
  el.hidden = false;
  el.setAttribute("role", "status");

  function atualizar() {
    const c = fluxo.conexao;
    const tUltima = fluxo.ultimaLeituraGeral();
    const idade = tUltima === null ? null : (fluxo.agora() - tUltima) / 1000;
    let texto = c.texto ?? "";
    if (c.estado === "conectado" || c.estado === "simulacao") {
      texto += ` · última leitura ${textoIdade(idade)}`;
    }
    el.dataset.estado = c.estado;
    el.textContent = texto;
    el.title = c.detalhe ?? texto;
  }

  fluxo.on("conexao", atualizar);
  setInterval(atualizar, 500);
  atualizar();
  return { atualizar };
}
