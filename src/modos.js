import { criarEmissor } from "./util/emissor.js";

/**
 * Modos da aplicação (Ao vivo / Simulação / Replay). Cada modo traz sua fonte de dados,
 * o painel do rodapé e um texto curto de contexto.
 */
export function criarModos({ fluxo, sensoresUI, painelXR }) {
  const eventos = criarEmissor();
  const nav = document.getElementById("modos");
  const rodape = document.getElementById("rodape");
  const modos = [];
  let atual = null;
  let trocando = false;

  function registrar(modo) {
    modos.push(modo);
    const b = document.createElement("button");
    b.type = "button";
    b.className = "botao";
    b.dataset.modo = modo.id;
    b.textContent = modo.nome;
    b.title = modo.dica ?? "";
    b.setAttribute("aria-pressed", "false");
    b.addEventListener("click", () => ativar(modo.id));
    nav.appendChild(b);
    if (modo.painel) {
      modo.painel.hidden = true;
      rodape.appendChild(modo.painel);
    }
  }

  async function ativar(id, opcoes = {}) {
    const modo = modos.find((m) => m.id === id);
    if (!modo || trocando) return;
    if (modo === atual && !opcoes.forcar) return;
    trocando = true;
    try {
      await atual?.aoSair?.();
      if (atual?.painel) atual.painel.hidden = true;
      atual = modo;
      for (const b of nav.querySelectorAll("[data-modo]")) b.setAttribute("aria-pressed", String(b.dataset.modo === id));
      sensoresUI.definirContextoTempo({});
      sensoresUI.definirMarcadores([]);
      painelXR?.definirContextoTempo({});
      painelXR?.definirMarcadores([]);
      if (modo.painel) modo.painel.hidden = false;
      if (modo.fonte !== undefined) await fluxo.usarFonte(modo.fonte);
      await modo.aoEntrar?.(opcoes);
      atualizarInfo();
      eventos.emitir("modo", modo.id);
    } finally {
      trocando = false;
    }
  }

  function atualizarInfo() {
    const texto = atual?.info?.() ?? "";
    sensoresUI.definirInfoFonte(texto);
    painelXR?.definirExtra(texto);
  }
  setInterval(atualizarInfo, 500);

  return {
    registrar,
    ativar,
    get atual() {
      return atual?.id ?? null;
    },
    atualizarInfo,
    on: eventos.on,
  };
}
