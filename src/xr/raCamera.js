import { Color4 } from "@babylonjs/core";
import { svgIcone } from "../util/icones.js";

/** Verdadeiro onde o navegador deixa a página usar a câmera (HTTPS ou localhost). */
export const suportaCamera = () => Boolean(navigator.mediaDevices?.getUserMedia) && window.isSecureContext !== false;

/**
 * RA pela câmera do aparelho (para celulares sem WebXR, como o iPhone): a imagem da câmera traseira fica por trás
 * do torno 3D, sem a sala. O torno continua vivo: placa girando, balões com as medições e cores de estado.
 * Arrastar gira o torno e a pinça aproxima/afasta (a câmera orbital de sempre). Não há rastreamento do piso:
 * para pôr o torno no chão em tamanho real use a RA completa (WebXR no Android ou AR Quick Look no iPhone).
 */
export function criarRACamera({ scene, camera, sala, piso, ceu, aoMudar }) {
  let ativo = false;
  let stream = null;
  let corAntes = null;
  let vistaAntes = null;

  const video = document.createElement("video");
  video.className = "video-ra";
  video.setAttribute("playsinline", "");
  video.setAttribute("aria-hidden", "true");
  video.muted = true;
  video.hidden = true;
  document.body.prepend(video);

  const barra = document.createElement("div");
  barra.className = "barra-ra painel";
  barra.hidden = true;
  barra.innerHTML = `
    <span class="barra-ra-icone" aria-hidden="true">${svgIcone("ra", { tamanho: 18 })}</span>
    <span class="barra-ra-texto"><strong>RA pela câmera</strong> Arraste para girar o torno; dois dedos aproximam ou afastam.</span>
    <button type="button" class="botao primario">Sair</button>`;
  barra.querySelector("button").addEventListener("click", () => sair());
  document.body.appendChild(barra);

  async function entrar() {
    if (ativo) return;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
    } catch (erro) {
      console.warn("Câmera indisponível para a RA:", erro);
      alert(
        erro?.name === "NotAllowedError"
          ? "Para ver o torno em RA, permita o uso da câmera para este site (nas configurações do navegador) e tente de novo."
          : "Não foi possível abrir a câmera deste aparelho.",
      );
      return;
    }
    ativo = true;
    video.srcObject = stream;
    video.hidden = false;
    video.play().catch(() => {});

    // só o torno sobre a imagem da câmera: fundo transparente, sem sala, piso e céu
    corAntes = scene.clearColor.clone();
    scene.clearColor = new Color4(0, 0, 0, 0);
    sala.mostrar(false);
    piso.setEnabled(false);
    ceu?.setEnabled(false);

    // torno inteiro na tela, visto um pouco de cima
    vistaAntes = { alpha: camera.alpha, beta: camera.beta, radius: camera.radius, target: camera.target.clone() };
    camera.target.set(0, 0.8, 0);
    camera.radius = 4.4;
    camera.beta = 1.15;

    document.body.classList.add("ra-camera");
    barra.hidden = false;
    aoMudar?.(true);
  }

  function sair() {
    if (!ativo) return;
    ativo = false;
    for (const t of stream?.getTracks() ?? []) t.stop();
    stream = null;
    video.srcObject = null;
    video.hidden = true;
    scene.clearColor = corAntes;
    sala.mostrar(true);
    piso.setEnabled(true);
    ceu?.setEnabled(true);
    if (vistaAntes) {
      camera.alpha = vistaAntes.alpha;
      camera.beta = vistaAntes.beta;
      camera.radius = vistaAntes.radius;
      camera.target.copyFrom(vistaAntes.target);
    }
    document.body.classList.remove("ra-camera");
    barra.hidden = true;
    aoMudar?.(false);
  }

  window.addEventListener("keydown", (e) => e.key === "Escape" && sair());
  // aba em segundo plano: a câmera desliga (o iOS a corta de qualquer jeito)
  document.addEventListener("visibilitychange", () => document.visibilityState === "hidden" && sair());

  return {
    entrar,
    sair,
    get ativo() {
      return ativo;
    },
  };
}
