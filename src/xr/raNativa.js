// RA no iPhone/iPad: o Safari (e todo navegador do iOS, que usa o mesmo WebKit) não tem WebXR, então o botão
// "Entrar em RA" abre o AR Quick Look da Apple com public/models/torno.usdz, quando esse arquivo existe.
// O torno aparece em tamanho real, apoiado no chão; é um modelo estático (as leituras ao vivo continuam no site).
// Sem o .usdz, a RA do iPhone é a da câmera (raCamera.js). Onde há WebXR (Chrome no Android com ARCore, Meta Quest)
// segue a RA completa de xr.js.

/**
 * Tipo de RA disponível, a partir de dados do aparelho (função pura, fácil de testar).
 * @returns {"webxr" | "quicklook" | null}
 */
export function detectarRA({ seguro, ua, plataforma = "", toques = 0, quickLook, webxrAR }) {
  if (webxrAR) return "webxr";
  // o iPadOS pede o site de computador por padrão: informa "MacIntel" com tela de toque
  const ios = /iPad|iPhone|iPod/.test(ua) || (plataforma === "MacIntel" && toques > 1);
  if (ios && quickLook && seguro !== false) return "quicklook";
  return null;
}

/** Verdadeiro onde o WebKit abre links do AR Quick Look (rel="ar"). */
export function suportaQuickLook(doc = document) {
  try {
    return Boolean(doc.createElement("a").relList?.supports?.("ar"));
  } catch {
    return false;
  }
}

/** RA do aparelho atual. */
export function raDoAparelho(webxrAR) {
  return detectarRA({
    seguro: window.isSecureContext,
    ua: navigator.userAgent,
    plataforma: navigator.platform,
    toques: navigator.maxTouchPoints,
    quickLook: suportaQuickLook(),
    webxrAR,
  });
}

/** Endereço absoluto de um arquivo de public/models (funciona em subpasta, como no GitHub Pages). */
export const urlModelo = (arquivo) => new URL(`./models/${arquivo}`, window.location.href).href;

/**
 * Abre o AR Quick Look: um link rel="ar" com uma imagem dentro, clicado durante o toque do usuário
 * (fora do gesto o iOS ignora). O torno abre em tamanho real (100 %); a pinça ainda permite reduzir.
 */
export function abrirQuickLook(urlUsdz, doc = document) {
  const a = doc.createElement("a");
  a.setAttribute("rel", "ar");
  a.setAttribute("href", urlUsdz);
  a.appendChild(doc.createElement("img"));
  a.click();
  return a;
}
