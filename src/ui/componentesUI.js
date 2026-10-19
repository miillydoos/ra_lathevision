import { GRANDEZAS } from "../config/grandezas.js";
import { svgIcone } from "../util/icones.js";

const $ = (sel) => document.querySelector(sel);

const escapar = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/**
 * Lista de componentes (lateral esquerda), cartão do componente selecionado e dica ao passar o mouse.
 * aoAbrirGrandeza(id) é chamado ao clicar num sensor do componente.
 */
export function criarComponentesUI({ selecao, focar, aoAbrirGrandeza }) {
  const lista = $("#lista-componentes");
  const cartao = $("#cartao-info");
  const dica = $("#dica");

  const sensoresDe = (c) => GRANDEZAS.filter((g) => g.componente === c.id);

  // ---- lista agrupada
  let grupoAtual = null;
  let html = "";
  for (const c of selecao.componentes) {
    if (c.grupo !== grupoAtual) {
      grupoAtual = c.grupo;
      html += `<li class="grupo">${escapar(c.grupo)}</li>`;
    }
    const icones = sensoresDe(c)
      .map((g) => svgIcone(g.icone, { tamanho: 13 }))
      .join("");
    html += `<li><button type="button" data-id="${c.id}"><span>${escapar(c.nome)}</span><span class="sensores-mini" title="Pontos instrumentados">${icones}</span></button></li>`;
  }
  lista.innerHTML = html;
  lista.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-id]");
    if (!b) return;
    const c = selecao.porId(b.dataset.id);
    selecao.selecionar(c);
    focarComponente(c);
  });

  function focarComponente(c) {
    if (!c || !c.malhas.length) return;
    const lim = selecao.limitesDe(c);
    focar(lim.centro, Math.max(0.55, lim.raio * 3.2));
  }

  // ---- cartão de informação
  selecao.on("selecao", (c) => {
    for (const b of lista.querySelectorAll("button[data-id]")) {
      b.setAttribute("aria-current", String(c?.id === b.dataset.id));
    }
    if (!c) {
      cartao.hidden = true;
      return;
    }
    const sensores = sensoresDe(c);
    const chips = sensores
      .map((g) => `<button type="button" class="chip" data-grandeza="${g.id}">${svgIcone(g.icone, { tamanho: 14 })}${escapar(g.nome)}</button>`)
      .join("");
    cartao.innerHTML = `
      <header>
        <h3>${escapar(c.nome)}</h3>
        <button type="button" class="fechar" aria-label="Fechar">×</button>
      </header>
      <p>${escapar(c.descricao)}</p>
      ${sensores.length ? `<div class="chips" aria-label="Medições deste componente">${chips}</div>` : ""}
      <div class="chips" style="margin-top:8px"><button type="button" class="chip" data-acao="focar">Aproximar a câmera</button></div>`;
    cartao.hidden = false;
  });

  cartao.addEventListener("click", (e) => {
    if (e.target.closest(".fechar")) selecao.selecionar(null);
    const chip = e.target.closest("[data-grandeza]");
    if (chip) aoAbrirGrandeza?.(chip.dataset.grandeza);
    if (e.target.closest('[data-acao="focar"]')) focarComponente(selecao.selecionado);
  });

  // ---- dica ao passar o mouse
  selecao.on("hover", (c, evento) => {
    if (!c || !evento || evento.pointerType === "touch") {
      dica.hidden = true;
      document.body.style.cursor = "";
      return;
    }
    dica.textContent = c.nome;
    dica.hidden = false;
    document.body.style.cursor = "pointer";
  });
  window.addEventListener("pointermove", (e) => {
    dica.style.left = e.clientX + "px";
    dica.style.top = e.clientY + "px";
  });

  return { focarComponente };
}
