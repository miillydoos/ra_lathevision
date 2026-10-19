// Ícones em traço, desenhados num quadro de 24×24.
// O mesmo caminho SVG serve para o HUD (HTML) e para as texturas 3D (Path2D no canvas).

export const ICONES = {
  termometro: "M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z",
  gota: "M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z",
  raio: "M13 2L3 14h9l-1 8 10-12h-9l1-8z",
  onda: "M22 12h-4l-3 9L9 3l-3 9H2",
  rotacao: "M23 4v6h-6M20.49 15a9 9 0 1 1-2.12-9.36L23 10",
  // estados
  normal: "M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4L12 14.01l-3-3",
  atencao: "M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01",
  alarme: "M7.86 2h8.28L22 7.86v8.28L16.14 22H7.86L2 16.14V7.86L7.86 2zM15 9l-6 6M9 9l6 6",
  semDados: "M12 2a10 10 0 1 0 0 20a10 10 0 1 0 0-20zM8 12h8",
  // interface
  engrenagem: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z",
  play: "M5 3l14 9-14 9V3z",
  pausa: "M6 4h4v16H6zM14 4h4v16h-4z",
  voltar: "M11 19l-9-7 9-7v14zM22 19l-9-7 9-7v14z",
  avancar: "M13 19l9-7-9-7v14zM2 19l9-7-9-7v14z",
  gravar: "M12 2a10 10 0 1 0 0 20a10 10 0 1 0 0-20z",
  parar: "M5 5h14v14H5z",
  marcador: "M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z",
  baixar: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3",
  abrir: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12",
  // navegação no celular
  camadas: "M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5",
  grafico: "M3 3v18h18M7 14l4-4 4 4 5-6",
  controles: "M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6",
  fechar: "M18 6L6 18M6 6l12 12",
  // apresentação 360°
  orbita: "M21 12c0 2.5-4 4.5-9 4.5S3 14.5 3 12s4-4.5 9-4.5c2.3 0 4.4.4 6 1.1M15.6 6.4l2.6 2.2-2 2.6M12 12h.01",
  anterior: "M15 18l-6-6 6-6",
  proxima: "M9 18l6-6-6-6",
  telaCheia: "M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3",
  // tampas abertas (painel elétrico e caixa de engrenagens)
  porta: "M4 21V3h10v18M14 3l6 2.5v13L14 21M2 21h20M10.5 12h.01",
};

/** Retorna um <svg> em texto, para usar em innerHTML. */
export function svgIcone(nome, { tamanho = 16, espessura = 2, classe = "" } = {}) {
  const d = ICONES[nome];
  if (!d) return "";
  return `<svg class="${classe}" width="${tamanho}" height="${tamanho}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${espessura}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
}

const cachePath2D = new Map();

/** Desenha o ícone num contexto 2D de canvas (para DynamicTexture). */
export function desenharIcone(ctx, nome, x, y, tamanho, cor, espessura = 2) {
  const d = ICONES[nome];
  if (!d) return;
  let caminho = cachePath2D.get(nome);
  if (!caminho) {
    caminho = new Path2D(d);
    cachePath2D.set(nome, caminho);
  }
  const escala = tamanho / 24;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(escala, escala);
  ctx.strokeStyle = cor;
  ctx.lineWidth = espessura;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke(caminho);
  ctx.restore();
}
