import { Axis, Camera, Vector3 } from "@babylonjs/core";
import { GRANDEZA_POR_ID } from "../config/grandezas.js";
import { ESTADOS } from "../config/estados.js";
import { svgIcone } from "../util/icones.js";
import { desenharSerie, prepararCanvas } from "./graficos.js";
import { htmlEstado, tempoRelativo, textoEstatisticas, textoIdade, textoLimites, textoValor } from "./sensoresUI.js";

// Painel com os dados de uma medição, ao lado do sensor trazido para a frente da tela (vitrineSensor.js e a
// caixa de monitoramento): valor atual, estado, gráfico da janela recente, mín / média / máx, o que o sensor
// faz, o ponto medido e os limites. No celular fica preso embaixo da tela, e o sensor sobe para o espaço livre.
// O painel entra deslizando quando o objeto termina de chegar (revelar) e sai do mesmo jeito.

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
  el.classList.add("chegando");
  (document.getElementById("hud") ?? document.body).appendChild(el);

  // medidas guardadas (ler o layout a cada quadro, logo depois de mudar a posição, trava a animação)
  const medidas = { largura: 300, altura: 400, topoLivre: 0, baseInferior: 0 };
  function medir() {
    medidas.largura = el.offsetWidth || medidas.largura;
    medidas.altura = el.offsetHeight || medidas.altura;
    medidas.topoLivre = document.querySelector(".topo")?.getBoundingClientRect().bottom ?? 0;
    medidas.baseInferior = parseFloat(getComputedStyle(el).bottom) || 0;
  }
  new ResizeObserver(medir).observe(el);
  window.addEventListener("resize", medir);
  let ultimo = "";
  let saida = null;

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
      clearTimeout(saida);
      el.classList.add("chegando");
      el.hidden = false;
      atualizar();
      medir();
    },
    /** Entra deslizando (quando o objeto termina de chegar na frente da tela). */
    revelar() {
      if (!el.hidden) el.classList.remove("chegando");
    },
    get revelado() {
      return !el.hidden && !el.classList.contains("chegando");
    },
    esconder() {
      id = null;
      el.classList.add("chegando");
      clearTimeout(saida);
      saida = setTimeout(() => {
        el.hidden = true;
        el.style.left = el.style.top = "";
        ultimo = "";
      }, 260);
    },
    get visivel() {
      return !el.hidden && id !== null;
    },
    medidas,
    /**
     * Põe o painel ao lado do sensor na tela (à direita; se não couber, à esquerda). `tela` vem de
     * enquadrarAoLado; `escala` = zoom aplicado ao sensor. No celular o painel fica preso embaixo (CSS).
     */
    posicionar(tela, escala = 1) {
      if (!tela || el.hidden || id === null) return;
      if (celular()) {
        if (ultimo) el.style.left = el.style.top = ultimo = "";
        return;
      }
      const { largura: w, altura: h } = medidas;
      const r = tela.raioPx * escala;
      let left = tela.cx + r + VAO;
      if (left + w > window.innerWidth - 8) left = Math.max(8, tela.cx - r - VAO - w);
      const top = Math.max(medidas.topoLivre + 8, Math.min(window.innerHeight - h - 8, tela.cy - h / 2));
      const pos = `${Math.round(left)}|${Math.round(top)}`;
      if (pos === ultimo) return; // só mexe no estilo quando muda
      ultimo = pos;
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
  const cw = window.innerWidth; // o canvas ocupa a janela inteira (#cena é fixo)
  const ch = window.innerHeight;
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
  if (painel?.visivel) {
    const m = painel.medidas;
    if (celular()) {
      const topo = m.topoLivre;
      const base = ch - m.baseInferior - m.altura; // topo do painel, preso embaixo
      cx = cw / 2;
      cy = (topo + base) / 2;
      diametro = Math.max(80, Math.min(0.85 * (base - topo), 0.8 * cw));
    } else {
      cx -= (m.largura + VAO) / 2;
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
    tanV,
    tanH,
    tela: { cx, cy, raioPx: diametro / 2 },
  };
}
