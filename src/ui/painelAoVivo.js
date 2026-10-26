const escapar = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/**
 * Rodapé do modo Ao vivo: de onde vêm os dados e como configurar.
 * (A gravação da sessão entra neste painel na etapa de registro/replay.)
 */
export function criarPainelAoVivo({ config, fluxo, aoConfigurar, aoReconectar }) {
  const el = document.createElement("section");
  el.className = "painel painel-modo painel-aovivo";
  el.setAttribute("aria-label", "Conexão ao vivo");
  el.innerHTML = `
    <header class="cab-modo">
      <h2>Ao vivo · torno real</h2>
      <div class="acoes-modo">
        <button type="button" class="botao mini" data-acao="reconectar">Reconectar</button>
        <button type="button" class="botao mini" data-acao="configurar">Configurar conexão</button>
      </div>
    </header>
    <div class="corpo-modo">
      <p class="detalhe-conexao"></p>
      <div class="slot-gravacao"></div>
    </div>`;
  const detalhe = el.querySelector(".detalhe-conexao");

  function atualizar() {
    const m = config.mqtt ?? {};
    const c = fluxo.conexao;
    detalhe.innerHTML = `Broker <code>${escapar(m.url || "não configurado")}</code> · tópicos <code>${escapar(m.topicoBase || "?")}/#</code>${
      c.detalhe && c.estado === "erro" ? ` · <span class="erro">${escapar(c.detalhe)}</span>` : ""
    }`;
  }

  el.addEventListener("click", (e) => {
    const acao = e.target.closest("[data-acao]")?.dataset.acao;
    if (acao === "configurar") aoConfigurar?.();
    if (acao === "reconectar") aoReconectar?.();
  });
  fluxo.on("conexao", atualizar);
  atualizar();

  return { el, atualizar, slotGravacao: el.querySelector(".slot-gravacao") };
}
