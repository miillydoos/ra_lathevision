import { Axis, Camera, Vector3 } from "@babylonjs/core";
import { GRANDEZA_POR_ID } from "../config/grandezas.js";
import { ESTADOS } from "../config/estados.js";
import { svgIcone } from "../util/icones.js";
import { desenharSerie, prepararCanvas } from "./graficos.js";
import { htmlEstado, tempoRelativo, textoEstatisticas, textoIdade, textoLimites, textoValor } from "./sensoresUI.js";

// Painel com os dados de uma medição, ao lado do sensor trazido para a frente da tela (vitrineSensor.js e a
// caixa de monitoramento): valor atual, estado, gráfico da janela recente, mín / média / máx, o que o sensor
// faz, o ponto medido e os limites. No celular fica preso embaixo da tela, e o sensor sobe para o espaço livre.

const VAO = 20; // px entre o sensor e o painel
const celular = () => window.matchMedia("(max-width: 900px)").matches;

export function criarPainelMedida({ fluxo, config, aoFechar }) {
  const el = document.createElement("section");
  el.className = "painel painel-medida";
  el.hidden = true;
  el.innerHTML = `
    <header>
      <span class="pm-icone"></span>
      <div class="pm-titulos"><h3></h3><p class="pm-sub"></p></div>
      <button type="button" class="fechar" aria-label="Fechar">${svgIcone("fechar", { tamanho: 18 })}</button>
    </header>
    <div class="pm-leitura">
      <strong class="valor">—</strong><span class="unidade"></span>
      <span class="estado-chip"></span>
    </div>
    <small class="pm-idade"></small>
    <canvas class="pm-grafico" role="img"></canvas>
    <div class="estatisticas"></div>
    <p class="pm-desc"></p>
    <dl class="ficha">
      <dt>Ponto medido</dt><dd class="pm-local"></dd>
      <dt>Limites configurados</dt><dd class="pm-limites"></dd>
    </dl>
    <p class="sutil pm-ajuda">Arraste para girar · role para aproximar · Esc ou clique fora para fechar</p>`;
  const $ = (s) => el.querySelector(s);
  const campos = {
    icone: $(".pm-icone"),
    titulo: $("h3"),
    sub: $(".pm-sub"),
    valor: $(".valor"),
    unidade: $(".unidade"),
    chip: $(".estado-chip"),
    idade: $(".pm-idade"),
    grafico: $(".pm-grafico"),
    estatisticas: $(".estatisticas"),
    desc: $(".pm-desc"),
    local: $(".pm-local"),
    limites: $(".pm-limites"),
  };
  $(".fechar").addEventListener("click", () => aoFechar?.());
  (document.getElementById("hud") ?? document.body).appendChild(el);

  let id = null;
  function atualizar() {
    if (!id || el.hidden) return;
    const e = fluxo.estado(id);
    const est = ESTADOS[e.estado] ?? ESTADOS.semDados;
    const tv = textoValor(config, id, e.valor);
    el.dataset.estado = est.id;
    campos.valor.textContent = tv.valor;
    campos.unidade.textContent = tv.unidade;
    campos.chip.innerHTML = htmlEstado(est);
    campos.idade.textContent = e.velha ? `última leitura ${textoIdade(e.idade)}` : textoIdade(e.idade);
    const agora = fluxo.agora();
    const t0 = agora - config.janelaGraficoS * 1000;
    const lim = config.grandezas[id];
    const pontos = fluxo.janela(id, t0, agora);
    const { ctx, w, h } = prepararCanvas(campos.grafico);
    desenharSerie(ctx, w, h, {
      pontos,
      t0,
      t1: agora,
      escala: lim?.escala,
      limite: lim,
      boia: id === "oleo" && lim?.sensor === "boia",
      eixos: true,
      formatarTempo: tempoRelativo(agora),
    });
    campos.estatisticas.innerHTML = textoEstatisticas(config, id, pontos);
  }
  setInterval(atualizar, 250);

  return {
    el,
    /** Mostra a medição `id` com o título do sensor e o que ele faz. */
    mostrar({ id: novo, titulo, subtitulo, descricao }) {
      const g = GRANDEZA_POR_ID[novo];
      id = novo;
      campos.icone.innerHTML = svgIcone(g.icone, { tamanho: 20 });
      campos.titulo.textContent = titulo;
      campos.sub.textContent = subtitulo ?? g.nome;
      campos.desc.textContent = descricao ?? "";
      campos.desc.hidden = !descricao;
      campos.local.textContent = g.local;
      campos.limites.textContent = textoLimites(config, novo);
      campos.grafico.setAttribute("aria-label", `Gráfico de ${g.nome} nos últimos ${config.janelaGraficoS} s`);
      el.setAttribute("aria-label", titulo);
      el.style.left = el.style.top = "";
      el.hidden = false;
      atualizar();
    },
    esconder() {
      el.hidden = true;
      id = null;
    },
    /**
     * Põe o painel ao lado do sensor na tela (à direita; se não couber, à esquerda). `tela` vem de
     * enquadrarAoLado; `escala` = zoom aplicado ao sensor. No celular o painel fica preso embaixo (CSS).
     */
    posicionar(tela, escala = 1) {
      if (!tela || el.hidden) return;
      if (celular()) {
        el.style.left = el.style.top = "";
        return;
      }
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const r = tela.raioPx * escala;
      let left = tela.cx + r + VAO;
      if (left + w > window.innerWidth - 8) left = Math.max(8, tela.cx - r - VAO - w);
      const topo = (document.querySelector(".topo")?.getBoundingClientRect().bottom ?? 0) + 8;
      const top = Math.max(topo, Math.min(window.innerHeight - h - 8, tela.cy - h / 2));
      el.style.left = `${Math.round(left)}px`;
      el.style.top = `${Math.round(top)}px`;
    },
  };
}

/**
 * Onde pôr na frente da tela um objeto de raio `raio` (m) com o painel de dados ao lado: no computador, o par
 * objeto + painel fica centrado onde o alvo da câmera aparece (os painéis laterais deslocam a vista com
 * targetScreenOffset) e o objeto ocupa ~58% da altura; no celular, o objeto fica no espaço entre o topo e o
 * painel. No headset, meio metro à frente. Devolve o centro no mundo, a distância, os eixos da câmera e, na
 * tela, o centro e o raio do objeto em px (para posicionar o painel).
 */
export function enquadrarAoLado({ scene, camera, raio, painel }) {
  const cam = scene.activeCamera;
  const inversa = cam.getWorldMatrix(); // inversa da matriz de vista
  const direita = Vector3.TransformNormal(Axis.X, inversa).normalize();
  const cima = Vector3.TransformNormal(Axis.Y, inversa).normalize();
  const paraCamera = Vector3.TransformNormal(Axis.Z, inversa).normalize(); // cena destra: a câmera olha para -Z
  if (cam !== camera) {
    const c = new Vector3(0, 0, -0.45);
    return { centro: Vector3.TransformCoordinates(c, inversa), c, d: 0.45, inversa, direita, cima, paraCamera, tela: null };
  }
  const engine = scene.getEngine();
  const ret = engine.getRenderingCanvas().getBoundingClientRect();
  const cw = ret.width;
  const ch = ret.height;
  const aspecto = engine.getAspectRatio(cam);
  const t = Math.tan(cam.fov / 2);
  const tanV = cam.fovMode === Camera.FOVMODE_HORIZONTAL_FIXED ? t / aspecto : t;
  const tanH = tanV * aspecto;

  let cx = cw / 2;
  let cy = ch / 2;
  const alvo = Vector3.TransformCoordinates(camera.target, camera.getViewMatrix());
  if (alvo.z < -0.05) {
    cx = (cw / 2) * (1 + alvo.x / -alvo.z / tanH);
    cy = (ch / 2) * (1 - alvo.y / -alvo.z / tanV);
  }
  let diametro = Math.min(0.58 * ch, 0.42 * cw);
  if (painel && !painel.el.hidden) {
    const r = painel.el.getBoundingClientRect();
    if (celular()) {
      const topo = (document.querySelector(".topo")?.getBoundingClientRect().bottom ?? 0) - ret.top;
      const base = r.top - ret.top;
      cx = cw / 2;
      cy = (topo + base) / 2;
      diametro = Math.max(80, Math.min(0.85 * (base - topo), 0.8 * cw));
    } else {
      cx -= (r.width + VAO) / 2;
    }
  }
  const d = (raio * ch) / (diametro * tanV); // o raio do objeto ocupa diametro / 2 px
  const c = new Vector3(((cx / cw) * 2 - 1) * tanH * d, (1 - (cy / ch) * 2) * tanV * d, -d);
  return {
    centro: Vector3.TransformCoordinates(c, inversa),
    c,
    d,
    inversa,
    direita,
    cima,
    paraCamera,
    tela: { cx: cx + ret.left, cy: cy + ret.top, raioPx: diametro / 2 },
  };
}
