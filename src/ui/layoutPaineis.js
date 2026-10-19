import { Camera } from "@babylonjs/core";
import { svgIcone } from "../util/icones.js";

const CONSULTA_CELULAR = "(max-width: 900px)";

/**
 * Painéis recolhíveis (só interface; não muda a lógica do app).
 *
 * Doca de abas com Peças, Medições e Controles do modo atual. Cada painel tem cabeçalho com ×.
 * - Desktop: os painéis ficam nas laterais e embaixo e podem ficar abertos juntos; começam recolhidos.
 *   Esc recolhe o último aberto.
 * - Celular: os painéis viram folhas que sobem da base, uma por vez; recolhem pelo ×, pela aba,
 *   arrastando o cabeçalho para baixo ou com o Voltar do aparelho.
 * - Nos dois casos a vista 3D se desloca para o torno ficar no centro da área livre.
 *
 * Os painéis usam a classe "oculta" que o restante do código já liga e desliga,
 * então tudo continua funcionando igual (ex.: tocar num rótulo 3D abre as Medições).
 */
export function criarLayoutPaineis({ camera = null, scene = null } = {}) {
  const mq = window.matchMedia(CONSULTA_CELULAR);
  const celular = () => mq.matches;
  const $ = (s) => document.querySelector(s);

  const folhas = [
    { id: "pecas", el: $("#lateral-esquerda"), rotulo: "Peças", titulo: () => "Componentes", icone: "camadas" },
    { id: "medicoes", el: $("#lateral-direita"), rotulo: "Medições", titulo: () => "Medições", icone: "grafico" },
    {
      id: "controles",
      el: $("#rodape"),
      rotulo: "Controles",
      titulo: () => `Controles · ${$('#modos [aria-pressed="true"]')?.textContent ?? ""}`,
      icone: "controles",
    },
  ];
  const porId = (id) => folhas.find((f) => f.id === id);
  const aberta = (f) => !f.el.classList.contains("oculta");

  // ---------- cabeçalho de cada painel (título + ×)
  for (const f of folhas) {
    f.el.classList.add("folha");
    f.el.setAttribute("aria-label", f.titulo());
    const cab = document.createElement("div");
    cab.className = "cab-folha";
    cab.innerHTML = `<span class="puxador" aria-hidden="true"></span><h2></h2>
      <button type="button" class="fechar-folha" aria-label="Recolher" title="Recolher (Esc)">${svgIcone("fechar", { tamanho: 20 })}</button>`;
    f.el.prepend(cab);
    f.cab = cab;
    f.tituloEl = cab.querySelector("h2");
    cab.querySelector(".fechar-folha").addEventListener("click", () => recolher(f.id));
    habilitarArrasto(f);
  }

  // ---------- doca de abas
  const barra = document.createElement("nav");
  barra.className = "barra-abas";
  barra.setAttribute("aria-label", "Painéis");
  barra.innerHTML = folhas
    .map(
      (f) => `<button type="button" class="aba" data-folha="${f.id}" aria-controls="${f.el.id}" aria-expanded="false" title="${f.rotulo}">
        ${svgIcone(f.icone, { tamanho: 22 })}<span>${f.rotulo}</span></button>`,
    )
    .join("");
  document.body.appendChild(barra);
  barra.addEventListener("click", (e) => {
    const b = e.target.closest("[data-folha]");
    if (b) alternar(b.dataset.folha);
  });

  function mostrar(id) {
    if (celular()) for (const f of folhas) f.el.classList.toggle("oculta", f.id !== id);
    else porId(id)?.el.classList.remove("oculta");
  }
  function recolher(id) {
    porId(id)?.el.classList.add("oculta");
  }
  function alternar(id) {
    const f = porId(id);
    if (f && aberta(f)) recolher(id);
    else mostrar(id);
  }
  function recolherTodas() {
    for (const f of folhas) f.el.classList.add("oculta");
  }
  function mostrarTodas() {
    for (const f of folhas) f.el.classList.remove("oculta");
  }

  // ---------- histórico (celular): o Voltar do aparelho fecha a camada de cima
  let camadas = 0;
  let ignorarVoltas = 0;
  let fechandoPeloVoltar = false;

  function empilhar() {
    history.pushState({ labTorno: true }, "");
    camadas++;
  }
  function desempilhar() {
    if (camadas === 0) return;
    camadas--;
    ignorarVoltas++;
    history.back();
  }
  window.addEventListener("popstate", () => {
    if (ignorarVoltas > 0) {
      ignorarVoltas--;
      return;
    }
    if (camadas === 0) return;
    camadas--;
    fechandoPeloVoltar = true;
    const dialogo = [...document.querySelectorAll("dialog[open]")].pop();
    if (dialogo) dialogo.close();
    else recolherTodas();
  });

  // ---------- sincronia: abas, ordem de abertura, uma folha por vez no celular, histórico
  let ordem = []; // ids abertos, do mais antigo ao mais recente
  function sincronizar() {
    const visiveis = folhas.filter(aberta).map((f) => f.id);
    if (celular() && visiveis.length > 1) {
      // a que acabou de abrir fica; as outras recolhem (o observador chama de novo)
      const nova = visiveis.find((id) => !ordem.includes(id)) ?? visiveis[visiveis.length - 1];
      for (const id of visiveis) if (id !== nova) recolher(id);
      return;
    }
    for (const f of folhas) f.tituloEl.textContent = f.titulo();
    const antes = ordem.length;
    ordem = [...ordem.filter((id) => visiveis.includes(id)), ...visiveis.filter((id) => !ordem.includes(id))];
    for (const b of barra.querySelectorAll("[data-folha]")) b.setAttribute("aria-expanded", String(visiveis.includes(b.dataset.folha)));
    if (!celular()) return;
    if (!antes && ordem.length) empilhar();
    if (antes && !ordem.length) {
      if (fechandoPeloVoltar) fechandoPeloVoltar = false;
      else desempilhar();
    }
  }
  const observador = new MutationObserver(sincronizar);
  for (const f of folhas) observador.observe(f.el, { attributes: true, attributeFilter: ["class"] });
  // título do painel de controles acompanha o modo
  new MutationObserver(() => folhas.forEach((f) => (f.tituloEl.textContent = f.titulo()))).observe($("#modos"), {
    subtree: true,
    attributes: true,
    attributeFilter: ["aria-pressed"],
  });

  // Esc recolhe o último painel aberto (sem atrapalhar diálogos e campos de texto)
  window.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || document.querySelector("dialog[open]")) return;
    if (e.target.closest?.("input, textarea, select")) return;
    const ultimo = ordem[ordem.length - 1];
    if (ultimo) recolher(ultimo);
  });

  // celular: escolher um componente na lista recolhe a folha para mostrar a peça destacada
  $("#lista-componentes").addEventListener("click", (e) => {
    if (celular() && e.target.closest("button[data-id]")) recolherTodas();
  });

  // ---------- diálogos: botão × no cabeçalho; no celular, Voltar fecha
  for (const dialogo of document.querySelectorAll("dialog")) {
    let empilhado = false;
    new MutationObserver(() => {
      if (dialogo.open) {
        const cab = dialogo.querySelector(".cab-modo");
        if (cab && !cab.querySelector(".fechar-dialogo")) {
          const b = document.createElement("button");
          b.type = "button";
          b.className = "fechar-dialogo";
          b.setAttribute("aria-label", "Fechar");
          b.innerHTML = svgIcone("fechar", { tamanho: 20 });
          b.addEventListener("click", () => dialogo.close());
          cab.appendChild(b);
        }
        if (celular() && !empilhado) {
          empilhar();
          empilhado = true;
          // foco no × em vez do primeiro campo: o teclado virtual não abre sozinho
          dialogo.querySelector(".fechar-dialogo")?.focus({ preventScroll: true });
        }
      } else if (empilhado) {
        empilhado = false;
        if (fechandoPeloVoltar) fechandoPeloVoltar = false;
        else desempilhar();
      }
    }).observe(dialogo, { attributes: true, attributeFilter: ["open"], childList: true });
  }

  // ---------- celular: arrastar o cabeçalho para baixo recolhe a folha
  function habilitarArrasto(f) {
    let y0 = null;
    let dy = 0;
    f.cab.addEventListener("pointerdown", (e) => {
      if (!celular() || e.target.closest("button")) return;
      y0 = e.clientY;
      dy = 0;
      f.el.classList.add("arrastando");
      f.cab.setPointerCapture(e.pointerId);
    });
    f.cab.addEventListener("pointermove", (e) => {
      if (y0 === null) return;
      dy = Math.max(0, e.clientY - y0);
      f.el.style.transform = `translateY(${dy}px)`;
    });
    const soltar = () => {
      if (y0 === null) return;
      y0 = null;
      f.el.classList.remove("arrastando");
      f.el.style.transform = "";
      if (dy > 70) recolher(f.id);
    };
    f.cab.addEventListener("pointerup", soltar);
    f.cab.addEventListener("pointercancel", soltar);
  }

  // ---------- vista 3D centrada na área livre entre os painéis abertos
  // (desloca só a imagem na tela; câmera, alvo e seleção continuam iguais)
  if (camera && scene) {
    let dx = 0;
    let dy = 0;
    scene.onBeforeRenderObservable.add(() => {
      if (scene.activeCamera !== camera) return;
      const W = window.innerWidth;
      const H = window.innerHeight;
      let esquerda = 0;
      let direita = W;
      const topo = $(".topo")?.getBoundingClientRect().bottom ?? 0;
      let base = barra.getBoundingClientRect().top;
      for (const f of folhas) {
        if (!aberta(f)) continue;
        if (celular()) {
          // posição final da folha (sem depender da animação)
          base = Math.min(base, H - barra.offsetHeight - f.el.offsetHeight);
          continue;
        }
        const r = f.el.getBoundingClientRect();
        if (f.id === "pecas") esquerda = Math.max(esquerda, r.right);
        if (f.id === "medicoes") direita = Math.min(direita, r.left);
        if (f.id === "controles") base = Math.min(base, r.top);
      }
      const aspecto = scene.getEngine().getAspectRatio(camera);
      const meioV = camera.fovMode === Camera.FOVMODE_HORIZONTAL_FIXED ? Math.atan(Math.tan(camera.fov / 2) / aspecto) : camera.fov / 2;
      const alturaMundo = 2 * camera.radius * Math.tan(meioV);
      const larguraMundo = alturaMundo * aspecto;
      const alvoX = (((esquerda + direita) / 2 - W / 2) / W) * larguraMundo;
      const alvoY = ((H / 2 - (topo + base) / 2) / H) * alturaMundo;
      const k = Math.min(1, (Math.min(0.1, scene.getEngine().getDeltaTime() / 1000)) * 8);
      dx += (alvoX - dx) * k;
      dy += (alvoY - dy) * k;
      camera.targetScreenOffset.x = dx;
      camera.targetScreenOffset.y = dy;
    });
  }

  // ---------- trocar entre desktop e celular (girar tablet, redimensionar janela)
  // Os painéis começam recolhidos nos dois casos, deixando a vista 3D livre; a doca de abas os abre.
  function aplicarModo() {
    for (const f of folhas) f.el.style.transform = "";
    ordem = [];
    recolherTodas();
  }
  mq.addEventListener("change", aplicarModo);
  aplicarModo();
  sincronizar();

  return { mostrar, recolher, alternar, recolherTodas, mostrarTodas };
}
