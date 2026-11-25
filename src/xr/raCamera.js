import { Color4 } from "@babylonjs/core";
import { svgIcone } from "../util/icones.js";

/** Verdadeiro onde o navegador deixa a página usar a câmera (HTTPS ou localhost). */
export const suportaCamera = () => Boolean(navigator.mediaDevices?.getUserMedia) && window.isSecureContext !== false;

/**
 * RA pela câmera do aparelho (para celulares sem WebXR, como o iPhone): a imagem da câmera traseira fica por trás
 * do torno 3D, sem a sala. O torno continua vivo: placa girando, balões com as medições e cores de estado.
 * Arrastar gira o torno e a pinça aproxima/afasta (a câmera orbital de sempre). O botão redondo tira uma foto
 * (câmera + torno + balões) que pode ser salva ou compartilhada. Não há rastreamento do piso:
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

  // ---------- foto: imagem da câmera + torno 3D (com os balões das medições), do jeito que aparece na tela
  const obturador = document.createElement("button");
  obturador.type = "button";
  obturador.className = "obturador-ra";
  obturador.hidden = true;
  obturador.setAttribute("aria-label", "Tirar foto");
  obturador.title = "Tirar foto";
  obturador.innerHTML = `<span aria-hidden="true">${svgIcone("camera", { tamanho: 26 })}</span>`;
  obturador.addEventListener("click", () => tirarFoto());
  document.body.appendChild(obturador);

  const foto = document.createElement("div");
  foto.className = "foto-ra";
  foto.hidden = true;
  foto.setAttribute("role", "dialog");
  foto.setAttribute("aria-label", "Foto da RA");
  foto.innerHTML = `
    <img alt="Foto do torno em RA" />
    <div class="foto-ra-acoes">
      <button type="button" class="botao" data-acao="outra">Tirar outra</button>
      <button type="button" class="botao primario" data-acao="salvar">${svgIcone("baixar", { tamanho: 16 })}<span>Salvar foto</span></button>
    </div>`;
  document.body.appendChild(foto);
  const flash = document.createElement("div");
  flash.className = "flash-ra";
  document.body.appendChild(flash);

  let ultimaFoto = null; // { blob, url, nome }
  function fecharFoto() {
    foto.hidden = true;
    if (ultimaFoto) URL.revokeObjectURL(ultimaFoto.url);
    ultimaFoto = null;
  }
  foto.addEventListener("click", async (e) => {
    const acao = e.target.closest("[data-acao]")?.dataset.acao;
    if (acao === "outra") fecharFoto();
    if (acao === "salvar" && ultimaFoto) await salvarFoto(ultimaFoto);
  });

  function tirarFoto() {
    const engine = scene.getEngine();
    const tela = engine.getRenderingCanvas();
    // logo depois de desenhar o quadro o buffer do WebGL ainda está inteiro: dá para copiar
    scene.onAfterRenderObservable.addOnce(() => {
      const w = tela.width;
      const h = tela.height;
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const ctx = c.getContext("2d");
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (vw && vh) {
        // mesmo recorte do object-fit: cover da tela
        const s = Math.max(w / vw, h / vh);
        ctx.drawImage(video, (w - vw * s) / 2, (h - vh * s) / 2, vw * s, vh * s);
      }
      ctx.drawImage(tela, 0, 0, w, h);
      c.toBlob(
        (blob) => {
          if (!blob) return;
          if (ultimaFoto) URL.revokeObjectURL(ultimaFoto.url);
          const d = new Date();
          const p = (n) => String(n).padStart(2, "0");
          const nome = `torno-ra-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.jpg`;
          ultimaFoto = { blob, url: URL.createObjectURL(blob), nome };
          foto.querySelector("img").src = ultimaFoto.url;
          foto.hidden = false;
        },
        "image/jpeg",
        0.92,
      );
    });
    flash.classList.remove("ativo");
    void flash.offsetWidth; // reinicia a animação
    flash.classList.add("ativo");
  }

  // no celular abre o "Compartilhar" do aparelho (lá tem "Salvar imagem"); no computador, baixa o arquivo
  async function salvarFoto({ blob, url, nome }) {
    const arquivo = new File([blob], nome, { type: "image/jpeg" });
    if (navigator.canShare?.({ files: [arquivo] })) {
      try {
        await navigator.share({ files: [arquivo], title: "Torno em RA" });
        return;
      } catch (erro) {
        if (erro?.name === "AbortError") return; // a pessoa fechou o compartilhar
      }
    }
    const a = document.createElement("a");
    a.href = url;
    a.download = nome;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

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
    obturador.hidden = false;
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
    obturador.hidden = true;
    fecharFoto();
    aoMudar?.(false);
  }

  window.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || !ativo) return;
    if (!foto.hidden) fecharFoto();
    else sair();
  });
  // aba em segundo plano: a câmera desliga (o iOS a corta de qualquer jeito)
  document.addEventListener("visibilitychange", () => document.visibilityState === "hidden" && sair());

  return {
    entrar,
    sair,
    tirarFoto,
    get ativo() {
      return ativo;
    },
  };
}
