import { Color3, HighlightLayer, Matrix, Vector3 } from "@babylonjs/core";
import { PARADAS_360, TOUR_360 } from "../config/tour360.js";
import { GRANDEZA_POR_ID } from "../config/grandezas.js";
import { svgIcone } from "../util/icones.js";

// Painéis do layout recolhidos durante a apresentação e reabertos ao sair.
const PAINEIS = [
  ["pecas", "#lateral-esquerda"],
  ["medicoes", "#lateral-direita"],
  ["controles", "#rodape"],
];

/**
 * Apresentação 360° do laboratório: percorre o torno parada a parada (câmera, destaque das peças,
 * cartão com descrição e dados, pinos numerados sobre a máquina), com giro 360° contínuo,
 * reprodução automática, tela cheia e atalhos de teclado (← → espaço O F Esc).
 *
 * Só interface: modos, fontes de dados e simulação continuam funcionando por trás.
 * Clicar numa peça leva à parada dela; arrastar a vista assume o controle da câmera.
 */
export function criarTour360({ scene, camera, focar, selecao, layout = null, aoAbrirGrandeza = null, aoMostrarSensores = null }) {
  const canvas = scene.getEngine().getRenderingCanvas();
  const reduzirMovimento = window.matchMedia("(prefers-reduced-motion: reduce)");
  const paradas = PARADAS_360.map((p, indice) => ({
    ...p,
    indice,
    malhas: (p.componentes ?? []).flatMap((id) => selecao.porId(id)?.malhas ?? []),
  }));

  let ativo = false;
  let atual = 0;
  let auto = false;
  let orbita = false;
  let arrastando = false;
  let permanencia = 0;
  let fimTransicao = 0;
  let paineisAbertos = [];
  let destaque = null; // HighlightLayer criada só na primeira abertura

  // ---------- botão no topo
  const botao = document.getElementById("btn-tour");
  botao.insertAdjacentHTML("afterbegin", svgIcone("orbita"));
  botao.addEventListener("click", () => (ativo ? fechar() : abrir()));

  // ---------- cartão da parada
  const cartao = document.createElement("aside");
  cartao.className = "tour-cartao painel";
  cartao.hidden = true;
  cartao.setAttribute("aria-label", "Apresentação 360°");
  cartao.innerHTML = `
    <button type="button" class="tour-cab" aria-expanded="true" title="Recolher ou expandir">
      <span class="tour-num"></span><span class="tour-tag"></span><span class="tour-chev" aria-hidden="true">▾</span>
    </button>
    <h3 class="tour-titulo" aria-live="polite"></h3>
    <div class="tour-corpo">
      <p class="tour-descricao"></p>
      <dl class="tour-fatos"></dl>
      <div class="tour-medicoes chips" aria-label="Medições e sensores desta parada"></div>
    </div>
    <div class="tour-progresso" aria-hidden="true"></div>`;
  document.body.appendChild(cartao);
  const $c = (s) => cartao.querySelector(s);
  const el = {
    cab: $c(".tour-cab"),
    num: $c(".tour-num"),
    tag: $c(".tour-tag"),
    titulo: $c(".tour-titulo"),
    descricao: $c(".tour-descricao"),
    fatos: $c(".tour-fatos"),
    medicoes: $c(".tour-medicoes"),
    progresso: $c(".tour-progresso"),
  };
  el.cab.addEventListener("click", () => {
    const minimizado = cartao.classList.toggle("minimizado");
    el.cab.setAttribute("aria-expanded", String(!minimizado));
  });
  el.medicoes.addEventListener("click", (e) => {
    if (e.target.closest("[data-sensores]")) {
      // abre o painel elétrico e a tampa lateral sem sair da apresentação
      definirOrbita(false);
      aoMostrarSensores?.();
      return;
    }
    const chip = e.target.closest("[data-grandeza]");
    if (!chip) return;
    fechar();
    aoAbrirGrandeza?.(chip.dataset.grandeza);
  });

  // ---------- controles
  const controles = document.createElement("nav");
  controles.className = "tour-controles painel";
  controles.hidden = true;
  controles.setAttribute("aria-label", "Navegação da apresentação 360°");
  controles.innerHTML = `
    <button type="button" class="botao icone" data-acao="anterior" aria-label="Parada anterior" title="Anterior (←)">${svgIcone("anterior", { tamanho: 18 })}</button>
    <div class="tour-pontos"></div>
    <button type="button" class="botao icone" data-acao="proxima" aria-label="Próxima parada" title="Próxima (→)">${svgIcone("proxima", { tamanho: 18 })}</button>
    <button type="button" class="botao" data-acao="auto" aria-pressed="false" aria-label="Reprodução automática" title="Reprodução automática (espaço)"></button>
    <button type="button" class="botao" data-acao="orbita" aria-pressed="false" aria-label="Girar 360°" title="Girar 360° (O)">${svgIcone("orbita")}<span>360°</span></button>
    <button type="button" class="botao icone" data-acao="telaCheia" aria-pressed="false" aria-label="Tela cheia" title="Tela cheia (F)">${svgIcone("telaCheia")}</button>
    <button type="button" class="botao icone" data-acao="sair" aria-label="Sair da apresentação" title="Sair (Esc)">${svgIcone("fechar")}</button>`;
  document.body.appendChild(controles);
  const btn = (acao) => controles.querySelector(`[data-acao="${acao}"]`);
  const pontos = controles.querySelector(".tour-pontos");
  for (const p of paradas) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "tour-ponto";
    b.style.setProperty("--cor-ponto", p.cor);
    b.title = p.titulo;
    b.setAttribute("aria-label", `${p.indice + 1}. ${p.titulo}`);
    b.addEventListener("click", () => irPara(p.indice));
    pontos.appendChild(b);
  }
  const podeTelaCheia = Boolean(document.fullscreenEnabled && document.documentElement.requestFullscreen);
  btn("telaCheia").hidden = !podeTelaCheia;

  controles.addEventListener("click", (e) => {
    const acao = e.target.closest("[data-acao]")?.dataset.acao;
    if (acao === "anterior") irPara(atual - 1);
    else if (acao === "proxima") irPara(atual + 1);
    else if (acao === "auto") definirAuto(!auto);
    else if (acao === "orbita") definirOrbita(!orbita);
    else if (acao === "telaCheia") alternarTelaCheia();
    else if (acao === "sair") fechar();
  });

  // ---------- pinos numerados sobre a máquina (abaixo do HUD)
  const camadaPinos = document.createElement("div");
  camadaPinos.className = "tour-pinos";
  camadaPinos.hidden = true;
  document.getElementById("hud").before(camadaPinos);
  const pinos = paradas
    .filter((p) => p.pino)
    .map((p) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "tour-pino";
      b.style.setProperty("--cor-pino", p.cor);
      b.setAttribute("aria-label", `${p.indice + 1}. ${p.titulo}`);
      b.textContent = String(p.indice + 1);
      const rotulo = document.createElement("span");
      rotulo.className = "rotulo";
      rotulo.textContent = p.titulo;
      b.appendChild(rotulo);
      b.addEventListener("click", () => irPara(p.indice));
      camadaPinos.appendChild(b);
      return { el: b, parada: p, pos: new Vector3(...p.pino) };
    });

  // ---------- estados
  function definirAuto(v) {
    auto = v;
    permanencia = 0;
    const b = btn("auto");
    b.setAttribute("aria-pressed", String(v));
    b.innerHTML = `${svgIcone(v ? "pausa" : "play")}<span>Auto</span>`;
    el.progresso.style.width = "0";
  }
  function definirOrbita(v) {
    orbita = v;
    btn("orbita").setAttribute("aria-pressed", String(v));
  }
  function alternarTelaCheia() {
    if (!podeTelaCheia) return;
    if (document.fullscreenElement) document.exitFullscreen?.();
    else document.documentElement.requestFullscreen().catch(() => {});
  }
  document.addEventListener("fullscreenchange", () => {
    btn("telaCheia").setAttribute("aria-pressed", String(Boolean(document.fullscreenElement)));
  });
  definirAuto(false);

  // ---------- ir para uma parada
  function irPara(i) {
    if (!ativo) return;
    atual = (i + paradas.length) % paradas.length;
    const p = paradas[atual];
    permanencia = 0;
    definirOrbita(Boolean(p.orbita) && !reduzirMovimento.matches);
    if (selecao.selecionado) selecao.selecionar(null); // o destaque da parada substitui a seleção

    // câmera pelo caminho mais curto em volta do torno
    const c = p.camera;
    const alvo = c.alvo ? new Vector3(...c.alvo) : p.malhas.length ? selecao.limitesDe(p).centro : camera.target.clone();
    const giro = c.alfa - camera.alpha;
    const alfa = camera.alpha + ((((giro + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI;
    camera.inertialAlphaOffset = 0;
    camera.inertialBetaOffset = 0;
    camera.inertialRadiusOffset = 0;
    focar(alvo, c.raio, { alfa, beta: c.beta, duracao: TOUR_360.transicaoMs });
    fimTransicao = performance.now() + TOUR_360.transicaoMs;

    destaque.removeAllMeshes();
    const cor = Color3.FromHexString(p.cor);
    for (const m of p.malhas) destaque.addMesh(m, cor);

    // cartão
    cartao.style.setProperty("--cor-parada", p.cor);
    el.num.textContent = `${atual + 1}/${paradas.length}`;
    el.tag.textContent = p.tag;
    el.titulo.textContent = p.titulo;
    el.descricao.textContent = p.descricao;
    el.fatos.replaceChildren(
      ...p.fatos.flatMap(([rotulo, valor]) => {
        const dt = document.createElement("dt");
        dt.textContent = rotulo;
        const dd = document.createElement("dd");
        dd.textContent = valor;
        return [dt, dd];
      }),
    );
    const medicoes = (p.medicoes ?? []).map((id) => GRANDEZA_POR_ID[id]).filter(Boolean);
    const sensores = Boolean(p.sensoresInternos && aoMostrarSensores);
    el.medicoes.hidden = !medicoes.length && !sensores;
    el.medicoes.innerHTML =
      medicoes
        .map((g) => `<button type="button" class="chip" data-grandeza="${g.id}" title="Abrir a medição">${svgIcone(g.icone, { tamanho: 14 })}${g.nome}</button>`)
        .join("") +
      (sensores
        ? `<button type="button" class="chip" data-sensores title="Abrir o painel elétrico e a tampa da caixa de engrenagens">${svgIcone("porta", { tamanho: 14 })}Abrir tampas e ver sensores</button>`
        : "");
    el.progresso.style.width = "0";
    pontos.querySelectorAll(".tour-ponto").forEach((b, j) => b.setAttribute("aria-current", String(j === atual)));
    for (const pino of pinos) pino.el.classList.toggle("atual", pino.parada.indice === atual);
  }

  // ---------- abrir / fechar
  function abrir() {
    if (ativo) return;
    ativo = true;
    paineisAbertos = PAINEIS.filter(([, sel]) => aberto(sel)).map(([id]) => id);
    layout?.recolherTodas();
    if (!destaque) {
      // só o contorno brilhante (as peças continuam visíveis) e por baixo dos rótulos 3D (grupo 1)
      destaque = new HighlightLayer("destaqueTour360", scene, { camera, renderingGroupId: 0 });
      destaque.innerGlow = false;
      destaque.blurHorizontalSize = 0.8;
      destaque.blurVerticalSize = 0.8;
    }
    destaque.isEnabled = true;
    document.body.classList.add("tour-360-ativo");
    cartao.hidden = false;
    controles.hidden = false;
    camadaPinos.hidden = false;
    botao.setAttribute("aria-pressed", "true");
    definirAuto(false);
    irPara(0);
  }

  function fechar() {
    if (!ativo) return;
    ativo = false;
    definirAuto(false);
    definirOrbita(false);
    destaque.removeAllMeshes();
    destaque.isEnabled = false;
    document.body.classList.remove("tour-360-ativo");
    cartao.hidden = true;
    controles.hidden = true;
    camadaPinos.hidden = true;
    botao.setAttribute("aria-pressed", "false");
    for (const id of paineisAbertos) layout?.mostrar(id);
  }

  const aberto = (seletor) => {
    const painel = document.querySelector(seletor);
    return Boolean(painel) && !painel.classList.contains("oculta");
  };

  // ---------- a cada quadro: giro 360°, avanço automático e posição dos pinos
  scene.onBeforeRenderObservable.add(() => {
    if (!ativo) return;
    const dt = Math.min(0.05, scene.getEngine().getDeltaTime() / 1000);
    const livre = !arrastando && performance.now() >= fimTransicao;
    if (orbita && livre) camera.alpha -= (dt * 2 * Math.PI) / TOUR_360.periodoOrbitaS;
    if (auto && livre) {
      permanencia += dt;
      const total = paradas[atual].permanenciaS ?? TOUR_360.permanenciaS;
      el.progresso.style.width = `${Math.min(100, (permanencia / total) * 100)}%`;
      if (permanencia >= total) irPara(atual + 1);
    }
  });

  scene.onAfterRenderObservable.add(() => {
    if (!ativo || scene.activeCamera !== camera) return;
    const engine = scene.getEngine();
    const largura = engine.getRenderWidth();
    const altura = engine.getRenderHeight();
    const viewport = camera.viewport.toGlobal(largura, altura);
    const transformacao = camera.getTransformationMatrix();
    const sx = canvas.clientWidth / largura;
    const sy = canvas.clientHeight / altura;
    for (const pino of pinos) {
      const q = Vector3.Project(pino.pos, Matrix.IdentityReadOnly, transformacao, viewport);
      const visivel = q.z > 0 && q.z < 1;
      pino.el.style.visibility = visivel ? "" : "hidden";
      if (visivel) pino.el.style.transform = `translate(${q.x * sx}px, ${q.y * sy}px) translate(-50%, -50%)`;
    }
  });

  // ---------- arrastar a vista assume a câmera (para o giro e a transição em curso)
  canvas.addEventListener("pointerdown", () => {
    if (!ativo) return;
    arrastando = true;
    definirOrbita(false);
    if (performance.now() < fimTransicao) {
      focar(camera.target.clone(), camera.radius, { duracao: 1 });
      fimTransicao = 0;
    }
  });
  const soltar = () => (arrastando = false);
  window.addEventListener("pointerup", soltar);
  window.addEventListener("pointercancel", soltar);

  // clicar numa peça (ou no ponto de um sensor) leva à parada dela
  selecao.on("selecao", (c) => {
    if (!ativo || !c) return;
    const p = paradas.find((p) => p.componentes?.includes(c.id));
    if (p) irPara(p.indice);
  });

  // ---------- teclado (na captura: decide o Esc antes de o layout recolher um painel)
  window.addEventListener("keydown", (e) => {
    if (!ativo || e.ctrlKey || e.metaKey || e.altKey) return;
    if (document.querySelector("dialog[open]") || e.target.closest?.("input, textarea, select, [contenteditable]")) return;
    switch (e.key) {
      case "ArrowRight":
      case "PageDown":
        irPara(atual + 1);
        break;
      case "ArrowLeft":
      case "PageUp":
        irPara(atual - 1);
        break;
      case "Home":
        irPara(0);
        break;
      case "End":
        irPara(paradas.length - 1);
        break;
      case " ":
        if (e.target.closest?.("button")) return; // o botão focado trata o espaço
        definirAuto(!auto);
        break;
      case "o":
      case "O":
        definirOrbita(!orbita);
        break;
      case "f":
      case "F":
        alternarTelaCheia();
        break;
      case "Escape":
        if (PAINEIS.some(([, sel]) => aberto(sel))) return; // o Esc do layout recolhe o painel primeiro
        fechar();
        e.stopPropagation(); // senão o Esc do layout recolheria o painel que acabou de voltar
        break;
      default:
        return;
    }
    e.preventDefault();
  }, true);

  return {
    abrir,
    fechar,
    irPara,
    pararGiro: () => definirOrbita(false),
    get ativo() {
      return ativo;
    },
    get atual() {
      return atual;
    },
  };
}
