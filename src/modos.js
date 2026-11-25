import { criarEmissor } from "./util/emissor.js";

/**
 * Modos da aplicação (Ao vivo / Simulação / Replay). Cada modo traz sua fonte de dados,
 * o painel do rodapé e um texto curto de contexto.
 *
 * Abas (ex.: Histórico) ficam na mesma barra, mas não trocam a fonte: abrem uma vista por cima
 * e o modo em uso continua rodando por trás (o botão dele fica com a marca "em-uso").
 * Tocar num modo fecha a aba aberta.
 */
export function criarModos({ fluxo, sensoresUI, painelXR }) {
  const eventos = criarEmissor();
  const nav = document.getElementById("modos");
  const rodape = document.getElementById("rodape");
  const modos = [];
  const abas = [];
  let atual = null;
  let abaAberta = null;
  let trocando = false;

  function criarBotao({ nome, dica }, dados, aoClicar) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "botao";
    Object.assign(b.dataset, dados);
    b.textContent = nome;
    b.title = dica ?? "";
    b.setAttribute("aria-pressed", "false");
    b.addEventListener("click", aoClicar);
    nav.appendChild(b);
    return b;
  }

  function registrar(modo) {
    modos.push(modo);
    criarBotao(modo, { modo: modo.id }, () => {
      fecharAba();
      ativar(modo.id);
    });
    if (modo.painel) {
      modo.painel.hidden = true;
      rodape.appendChild(modo.painel);
    }
  }

  /** Aba que abre uma vista sem trocar a fonte: { id, nome, dica, abrir(), fechar() }. */
  function registrarAba(aba) {
    abas.push(aba);
    criarBotao(aba, { aba: aba.id }, () => abrirAba(aba.id));
  }

  function abrirAba(id) {
    const aba = abas.find((a) => a.id === id);
    if (!aba || aba === abaAberta) return;
    abaAberta?.fechar();
    abaAberta = aba;
    aba.abrir();
    atualizarBotoes();
    eventos.emitir("aba", id);
  }

  function fecharAba() {
    if (!abaAberta) return;
    const aba = abaAberta;
    abaAberta = null;
    aba.fechar();
    atualizarBotoes();
    eventos.emitir("aba", null);
  }

  // pressionado: a aba aberta ou, sem aba, o modo em uso; "em-uso" marca sempre o modo cuja fonte está rodando
  function atualizarBotoes() {
    for (const b of nav.querySelectorAll("button")) {
      const emUso = b.dataset.modo !== undefined && b.dataset.modo === atual?.id;
      b.classList.toggle("em-uso", emUso);
      b.setAttribute("aria-pressed", String(abaAberta ? b.dataset.aba === abaAberta.id : emUso));
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
      atualizarBotoes();
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
    registrarAba,
    ativar,
    abrirAba,
    fecharAba,
    get atual() {
      return atual?.id ?? null;
    },
    /** Nome do modo em uso (o da fonte que está rodando), mesmo com uma aba aberta. */
    get nomeAtual() {
      return atual?.nome ?? "";
    },
    get abaAberta() {
      return abaAberta?.id ?? null;
    },
    atualizarInfo,
    on: eventos.on,
  };
}
