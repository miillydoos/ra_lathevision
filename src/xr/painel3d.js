import { DynamicTexture, Mesh, MeshBuilder, PointerEventTypes, StandardMaterial } from "@babylonjs/core";

/**
 * Painel 3D desenhado em canvas (DynamicTexture) com botões clicáveis.
 * O clique vem do ponteiro do mouse ou do raio do controle em RV: a coordenada de textura
 * do ponto atingido é convertida em pixels e comparada com a área de cada botão.
 */
export function criarPainel3D(scene, { nome, largura, altura, resolucao = 1024, desenhar }) {
  const W = resolucao;
  const H = Math.round((resolucao * altura) / largura);
  const malha = MeshBuilder.CreatePlane(nome, { width: largura, height: altura }, scene);
  malha.renderingGroupId = 1;
  const tex = new DynamicTexture(`tex_${nome}`, { width: W, height: H }, scene, true);
  tex.hasAlpha = true;
  const mat = new StandardMaterial(`mat_${nome}`, scene);
  mat.diffuseTexture = tex;
  mat.emissiveTexture = tex;
  mat.useAlphaFromDiffuseTexture = true;
  mat.disableLighting = true;
  mat.backFaceCulling = false;
  malha.material = mat;

  let botoes = [];
  let botaoHover = null;
  let sujo = true;

  const painel = {
    malha,
    largura: W,
    altura: H,
    get hover() {
      return botaoHover;
    },
    /** Redesenha no próximo quadro. */
    invalidar() {
      sujo = true;
    },
    /** Durante o desenho: registra uma área clicável sem desenhar nada (conteúdo livre). */
    area(id, x, y, w, h, aoClicar) {
      botoes.push({ id, x, y, w, h, aoClicar, desabilitado: false });
      return botaoHover === id;
    },
    /** Durante o desenho: registra um botão e desenha seu fundo. */
    botao(ctx, id, x, y, w, h, rotulo, { ativo = false, desabilitado = false, aoClicar } = {}) {
      botoes.push({ id, x, y, w, h, aoClicar, desabilitado });
      const hover = botaoHover === id && !desabilitado;
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, 12);
      ctx.fillStyle = ativo ? "#0a5fa8" : hover ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.09)";
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = ativo ? "#3d9be9" : "rgba(255,255,255,0.18)";
      ctx.stroke();
      ctx.fillStyle = desabilitado ? "rgba(255,255,255,0.35)" : "#eef2f6";
      ctx.font = "600 26px Segoe UI, Roboto, Arial, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(rotulo, x + w / 2, y + h / 2 + 1);
    },
  };

  function redesenhar() {
    const ctx = tex.getContext();
    botoes = [];
    ctx.clearRect(0, 0, W, H);
    desenhar(ctx, painel);
    tex.update();
    sujo = false;
  }

  function botaoEm(pickInfo) {
    const uv = pickInfo.getTextureCoordinates();
    if (!uv) return null;
    const x = uv.x * W;
    const y = (1 - uv.y) * H;
    return botoes.find((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) ?? null;
  }

  scene.onPointerObservable.add((pi) => {
    if (!malha.isEnabled()) return;
    const atingiu = pi.pickInfo?.hit && pi.pickInfo.pickedMesh === malha;
    if (pi.type === PointerEventTypes.POINTERMOVE) {
      const b = atingiu ? botaoEm(pi.pickInfo) : null;
      const id = b && !b.desabilitado ? b.id : null;
      if (id !== botaoHover) {
        botaoHover = id;
        sujo = true;
      }
    } else if (pi.type === PointerEventTypes.POINTERTAP && atingiu) {
      const b = botaoEm(pi.pickInfo);
      if (b && !b.desabilitado) b.aoClicar?.();
    }
  });

  scene.onBeforeRenderObservable.add(() => {
    if (sujo && malha.isEnabled()) redesenhar();
  });

  malha.billboardMode = Mesh.BILLBOARDMODE_NONE;
  // Desenha uma vez já na criação: uma DynamicTexture nunca atualizada deixa a cena "não pronta".
  queueMicrotask(redesenhar);
  return painel;
}

/** Quebra um texto em linhas que cabem na largura dada. */
export function quebrarTexto(ctx, texto, largura) {
  const palavras = texto.split(/\s+/);
  const linhas = [];
  let atual = "";
  for (const p of palavras) {
    const teste = atual ? atual + " " + p : p;
    if (ctx.measureText(teste).width > largura && atual) {
      linhas.push(atual);
      atual = p;
    } else {
      atual = teste;
    }
  }
  if (atual) linhas.push(atual);
  return linhas;
}
