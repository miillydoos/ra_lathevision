import { Color3, DynamicTexture, MeshBuilder, PointerEventTypes, Quaternion, StandardMaterial, Vector3 } from "@babylonjs/core";

// Efeitos da vista de perto (um sensor ou a caixa de monitoramento trazidos para a frente da tela, ver
// vitrineSensor.js e caixaMonitoramento.js): fundo escurecido com vinheta, foco de luz azul atrás do objeto,
// uma onda que se espalha quando ele chega, um leve zoom da câmera na cena de trás enquanto ele vem, e o
// arrastar / rolar com suavização e inércia (girar e aproximar o objeto).

const ZOOM_CAMERA = 0.1; // fov 10% menor no fim: a cena de trás se aproxima junto com o objeto
const DURACAO_ONDA = 1.1; // s
const GIRO_POR_PX = 0.008; // rad
const SUAVIZACAO_GIRO = 14; // 1/s: quanto mais, mais rápido o giro alcança o arrasto
const SUAVIZACAO_ZOOM = 10;
const ATRITO = 4; // 1/s: perda da inércia depois de soltar

const limitar = (v, a, b) => Math.max(a, Math.min(b, v));

/**
 * `aoClicarFundo` / `aoFechar` (Esc): devolver o objeto. `limiteInclinacao` = inclinação máxima (rad) do arrasto.
 * A cada quadro: `passo(dt)` (giro e zoom suaves) e `atualizar({ q, raio, k, abrindo })`, com `q` de
 * enquadrarAoLado, `raio` = raio do objeto na tela (m, já com o zoom) e `k` (0 a 1) = quanto ele já veio.
 */
export function criarDestaque(scene, { nome, camera, selecao, aoClicarFundo, aoFechar, limiteInclinacao = 1.4 }) {
  const canvas = scene.getEngine().getRenderingCanvas();

  function plano(sufixo, tamanho, desenhar, ordem) {
    const malha = MeshBuilder.CreatePlane(`${nome}_${sufixo}`, { size: 1 }, scene);
    const tex = new DynamicTexture(`tex_${nome}_${sufixo}`, { width: tamanho, height: tamanho }, scene, true);
    tex.hasAlpha = true;
    desenhar(tex.getContext(), tamanho);
    tex.update();
    const mat = new StandardMaterial(`mat_${nome}_${sufixo}`, scene);
    mat.diffuseTexture = tex;
    mat.useAlphaFromDiffuseTexture = true;
    mat.disableLighting = true;
    mat.emissiveColor = Color3.White(); // sem luzes, a cor final é emissiva × textura
    mat.backFaceCulling = false;
    mat.alpha = 0;
    malha.material = mat;
    malha.renderingGroupId = 2; // por cima da cena, atrás do objeto (que está no mesmo grupo, mais perto)
    malha.alphaIndex = ordem; // fundo, depois o foco, depois a onda
    malha.rotationQuaternion = Quaternion.Identity();
    malha.isPickable = false;
    malha.setEnabled(false);
    return { malha, mat };
  }
  const radial = (ctx, t, paradas) => {
    const g = ctx.createRadialGradient(t / 2, t / 2, 0, t / 2, t / 2, t / 2);
    for (const [p, cor] of paradas) g.addColorStop(p, cor);
    ctx.clearRect(0, 0, t, t);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, t, t);
  };

  // fundo: escuro, mais ainda nas bordas (vinheta); clicar nele devolve o objeto
  const fundo = plano("fundo", 256, (ctx, t) =>
    radial(ctx, t, [[0, "rgba(4,8,14,0.5)"], [0.35, "rgba(4,8,14,0.62)"], [1, "rgba(2,4,8,0.88)"]]),
  0);
  fundo.malha.enablePointerMoveEvents = true; // nada atrás do fundo mostra dica
  selecao.registrarClicavel(fundo.malha, () => aoClicarFundo?.(), null);
  // foco de luz atrás do objeto, no azul de destaque do app
  const foco = plano("foco", 256, (ctx, t) =>
    radial(ctx, t, [[0, "rgba(110,175,250,0.42)"], [0.32, "rgba(61,155,233,0.22)"], [0.62, "rgba(10,95,168,0.08)"], [1, "rgba(10,95,168,0)"]]),
  1);
  // onda: um anel que se abre e some quando o objeto chega
  const onda = plano("onda", 256, (ctx, t) =>
    radial(ctx, t, [[0, "rgba(150,205,255,0)"], [0.72, "rgba(150,205,255,0)"], [0.86, "rgba(170,215,255,0.85)"], [0.93, "rgba(150,205,255,0.25)"], [1, "rgba(150,205,255,0)"]]),
  2);

  let fovBase = null;
  let tOnda = -1; // < 0: parada
  let ondaDisparada = false;
  const tmp = new Vector3();

  function atualizar({ q, raio, k, abrindo }) {
    const ligado = k > 0;
    for (const p of [fundo, foco, onda]) p.malha.setEnabled(ligado && (p !== onda || tOnda >= 0));
    fundo.malha.isPickable = ligado && abrindo;
    // zoom da câmera na cena de trás (só a câmera orbital; no headset, não)
    if (scene.activeCamera === camera) {
      if (ligado && fovBase === null) fovBase = camera.fov;
      if (fovBase !== null) camera.fov = fovBase * (1 - ZOOM_CAMERA * k);
    }
    if (!ligado) {
      if (fovBase !== null) camera.fov = fovBase;
      fovBase = null;
      tOnda = -1;
      ondaDisparada = false;
      return;
    }
    // os três planos ficam logo atrás do objeto, de frente para a câmera
    const df = q.d + raio * 1.5 + 0.05;
    Vector3.TransformCoordinatesToRef(q.c.scale(df / q.d), q.inversa, tmp);
    const rotacao = Quaternion.RotationQuaternionFromAxis(q.direita, q.cima, q.paraCamera);
    const raioAtras = (raio * df) / q.d; // raio do objeto visto na distância dos planos
    const lado = q.tanV ? 2.6 * df * Math.max(q.tanV, q.tanH) * 2 : df * 8; // cobre a vista inteira
    for (const p of [fundo, foco, onda]) {
      p.malha.position.copyFrom(tmp);
      p.malha.rotationQuaternion.copyFrom(rotacao);
    }
    fundo.malha.scaling.setAll(lado);
    fundo.mat.alpha = k;
    foco.malha.scaling.setAll(raioAtras * 5.5);
    foco.mat.alpha = k * k;
    // a onda sai quando o objeto termina de chegar
    if (abrindo && k > 0.9 && !ondaDisparada) {
      ondaDisparada = true;
      tOnda = 0;
    }
    if (!abrindo) ondaDisparada = false;
    if (tOnda >= 0) {
      tOnda += Math.min(0.1, scene.getEngine().getDeltaTime() / 1000) / DURACAO_ONDA;
      if (tOnda >= 1) {
        tOnda = -1;
        onda.malha.setEnabled(false);
      } else {
        const s = 1 - Math.pow(1 - tOnda, 3); // abre rápido e desacelera
        onda.malha.scaling.setAll(raioAtras * (2.2 + 3.2 * s));
        onda.mat.alpha = 0.9 * Math.pow(1 - tOnda, 1.6);
      }
    }
  }

  // ---------- girar (arrastar) e aproximar (roda), com suavização e inércia
  const giro = [0, 0];
  const giroAlvo = [0, 0];
  const velocidade = [0, 0]; // rad/s, depois de soltar
  let zoom = 1;
  let zoomAlvo = 1;
  let arrasto = null;
  let ativo = false;

  scene.onPointerObservable.add((pi) => {
    if (!ativo) return;
    const e = pi.event;
    const agora = performance.now();
    if (pi.type === PointerEventTypes.POINTERDOWN) {
      arrasto = { id: e.pointerId, x: e.clientX, y: e.clientY, t: agora };
      velocidade[0] = velocidade[1] = 0;
    } else if (pi.type === PointerEventTypes.POINTERMOVE && arrasto && e.pointerId === arrasto.id) {
      const d0 = (e.clientY - arrasto.y) * GIRO_POR_PX;
      const d1 = (e.clientX - arrasto.x) * GIRO_POR_PX;
      giroAlvo[0] = limitar(giroAlvo[0] + d0, -limiteInclinacao, limiteInclinacao);
      giroAlvo[1] += d1;
      const dt = Math.max(0.008, (agora - arrasto.t) / 1000);
      velocidade[0] = velocidade[0] * 0.5 + (d0 / dt) * 0.5;
      velocidade[1] = velocidade[1] * 0.5 + (d1 / dt) * 0.5;
      Object.assign(arrasto, { x: e.clientX, y: e.clientY, t: agora });
    } else if (pi.type === PointerEventTypes.POINTERUP && arrasto) {
      // parado antes de soltar: sem inércia
      if (agora - arrasto.t > 90) velocidade[0] = velocidade[1] = 0;
      arrasto = null;
    }
  });
  canvas.addEventListener(
    "wheel",
    (e) => {
      if (ativo) zoomAlvo = limitar(zoomAlvo * Math.exp(-e.deltaY * 0.0012), 0.6, 2.6);
    },
    { passive: true },
  );
  // Esc devolve o objeto antes de recolher painéis ou sair da apresentação
  window.addEventListener(
    "keydown",
    (e) => {
      if (e.key !== "Escape" || !ativo || document.querySelector("dialog[open]")) return;
      aoFechar?.();
      e.preventDefault();
      e.stopImmediatePropagation();
    },
    true,
  );

  function passo(dt) {
    if (!arrasto && (velocidade[0] || velocidade[1])) {
      giroAlvo[0] = limitar(giroAlvo[0] + velocidade[0] * dt, -limiteInclinacao, limiteInclinacao);
      giroAlvo[1] += velocidade[1] * dt;
      const perda = Math.exp(-ATRITO * dt);
      velocidade[0] *= perda;
      velocidade[1] *= perda;
      if (Math.abs(velocidade[0]) + Math.abs(velocidade[1]) < 0.01) velocidade[0] = velocidade[1] = 0;
    }
    const a = 1 - Math.exp(-SUAVIZACAO_GIRO * dt);
    giro[0] += (giroAlvo[0] - giro[0]) * a;
    giro[1] += (giroAlvo[1] - giro[1]) * a;
    zoom += (zoomAlvo - zoom) * (1 - Math.exp(-SUAVIZACAO_ZOOM * dt));
  }

  return {
    fundo: fundo.malha,
    atualizar,
    passo,
    /** Liga ou desliga o arrastar, a roda e o Esc; ao ligar, volta ao giro `inicial` e ao zoom 1. */
    ativar(sim, inicial = null) {
      ativo = sim;
      arrasto = null;
      velocidade[0] = velocidade[1] = 0;
      if (sim && inicial) {
        giro.splice(0, 2, ...inicial);
        giroAlvo.splice(0, 2, ...inicial);
        zoom = zoomAlvo = 1;
      }
    },
    giro,
    get zoom() {
      return zoom;
    },
  };
}

const vooTmp = { de: new Vector3(), ate: new Vector3(), dir: new Vector3() };

/**
 * Ponto do voo de `de` (no torno) até `ate` (na frente da tela), visto de `olho` (posição da câmera), em t de
 * 0 a 1. Interpola o inverso da distância até a câmera, e não a posição: o tamanho na tela cresce por igual
 * durante o voo (em linha reta, o objeto ficaria pequeno quase o caminho todo e cresceria de repente no fim).
 * A direção vai de uma à outra, com um arco para cima de ~12% da altura da tela no meio.
 */
export function pontoDoVoo(olho, de, ate, t, q, saida) {
  de.subtractToRef(olho, vooTmp.de);
  ate.subtractToRef(olho, vooTmp.ate);
  const zDe = Math.max(1e-4, vooTmp.de.length());
  const zAte = Math.max(1e-4, vooTmp.ate.length());
  const z = 1 / ((1 - t) / zDe + t / zAte);
  Vector3.LerpToRef(vooTmp.de.scaleInPlace(1 / zDe), vooTmp.ate.scaleInPlace(1 / zAte), t, vooTmp.dir);
  vooTmp.dir.normalize();
  const arco = 4 * t * (1 - t) * 0.25 * z * (q.tanV ?? 0.4);
  return saida.copyFrom(olho).addInPlace(vooTmp.dir.scaleInPlace(z)).addInPlace(q.cima.scale(arco));
}

/** Curvas de animação (t de 0 a 1). */
export const curvas = {
  suave: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  /** "Pulo" na chegada: 0 até `inicio`, sobe e volta a 0 em t = 1. */
  pulo: (t, inicio = 0.6) => Math.sin(Math.PI * limitar((t - inicio) / (1 - inicio), 0, 1)),
};
