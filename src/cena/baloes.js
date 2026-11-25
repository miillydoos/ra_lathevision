import { Color3, DynamicTexture, Matrix, Mesh, MeshBuilder, StandardMaterial, Vector3 } from "@babylonjs/core";
import { desenharIcone } from "../util/icones.js";

// Balões com o valor das medições, presos aos sensores: vermelhos translúcidos, grandes e sempre por cima do modelo, de
// frente para a câmera, para serem vistos de longe. Na tela crescem com a distância da câmera (até ESCALA_MAX)
// e continuam legíveis na vista geral; no headset ficam no tamanho real. Em alarme, pulsam. Balões que se cobririam na
// tela (os do canto do cabeçote, na vista geral) se afastam na vertical, com uma haste até o ponto do sensor.
// O estado da medição (Normal, Atenção, Alarme, Sem dados) aparece em texto, com um ponto na cor do estado.

export const BALAO = { largura: 0.2, altura: 0.075 }; // m, tamanho base (proporção da textura, 320 × 120)
const TEX = { largura: 640, altura: 240 };
const DISTANCIA_BASE = 0.9; // m: até aqui o balão fica no tamanho base; depois cresce junto com a distância
const ESCALA_MAX = 3;

const VERMELHO = "rgba(204, 12, 15, 0.55)"; // vermelho da logo LatheVision, translúcido: o modelo aparece por trás
const VERMELHO_SEM_DADOS = "rgba(110, 30, 30, 0.5)";

const FOLGA_PX = 6; // espaço mínimo entre dois balões na tela

const registros = new WeakMap();
/** Um laço por cena ajusta o tamanho e a posição de todos os balões e afasta os que se encavalam na tela. */
function registro(scene) {
  if (registros.has(scene)) return registros.get(scene);
  const lista = [];
  let t = 0;
  scene.onBeforeRenderObservable.add(() => {
    const dt = Math.min(0.1, scene.getEngine().getDeltaTime() / 1000);
    t += dt;
    const cam = scene.activeCamera;
    if (!cam) return;
    const naTela = cam.getClassName() !== "WebXRCamera";
    for (const b of lista) b.ajustar(cam, naTela, t);
    separar(lista, cam, naTela, dt);
  });
  registros.set(scene, lista);
  return lista;
}

const _cima = new Vector3();
const _p = new Vector3();
const _q = new Vector3();
/**
 * Balões próximos (ex.: vibração e rotação, no canto do cabeçote) crescem com a distância e passam a se cobrir.
 * Aqui eles se afastam na vertical da tela, o mínimo para não se encostarem, e voltam ao lugar quando há espaço.
 * O deslocamento é suave (sem saltos ao girar a câmera); no headset não há deslocamento (tamanho real).
 */
function separar(lista, cam, naTela, dt) {
  const visiveis = lista.filter((b) => b.malha.isEnabled() && b.malha.isVisible);
  const alvo = new Map();
  if (naTela && visiveis.length > 1) {
    const engine = cam.getScene().getEngine();
    const vp = cam.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight());
    const m = cam.getTransformationMatrix();
    cam.getDirectionToRef(Vector3.UpReadOnly, _cima);
    const itens = [];
    for (const b of visiveis) {
      const meia = b.meiaAltura();
      Vector3.ProjectToRef(b.malha.position, Matrix.IdentityReadOnly, m, vp, _p);
      if (_p.z < 0 || _p.z > 1) continue; // atrás da câmera
      b.malha.position.addToRef(_cima.scale(meia), _q);
      Vector3.ProjectToRef(_q, Matrix.IdentityReadOnly, m, vp, _q);
      const hh = Math.abs(_q.y - _p.y); // meia altura na tela (px)
      if (!(hh > 0.5)) continue;
      itens.push({ b, x: _p.x, y0: _p.y, y: _p.y, hh, hw: hh * b.proporcao, pxPorM: hh / meia });
    }
    // relaxação: cada par que se cobre se afasta metade para cada lado (de cima para baixo na tela)
    for (let passo = 0; passo < 6; passo++) {
      itens.sort((a, b) => a.y - b.y);
      let mexeu = false;
      for (let i = 0; i < itens.length; i++) {
        for (let j = i + 1; j < itens.length; j++) {
          const a = itens[i];
          const c = itens[j];
          if (Math.abs(a.x - c.x) >= a.hw + c.hw + FOLGA_PX) continue;
          const falta = a.hh + c.hh + FOLGA_PX - (c.y - a.y);
          if (falta <= 0) continue;
          a.y -= falta / 2;
          c.y += falta / 2;
          mexeu = true;
        }
      }
      if (!mexeu) break;
    }
    for (const it of itens) alvo.set(it.b, (it.y0 - it.y) / it.pxPorM); // metros ao longo do "para cima" da câmera
  } else {
    cam.getDirectionToRef(Vector3.UpReadOnly, _cima);
  }
  const k = Math.min(1, dt * 10);
  for (const b of lista) b.deslocar(_cima, (alvo.get(b) ?? 0) * (naTela ? 1 : 0), k);
}

/**
 * Balão de uma medição. `ancora` (no mundo: billboard não gira a posição com um pai) é o ponto fixo na borda
 * voltada para o sensor, onde chega a linha de chamada; o balão cresce a partir dela para cima (`sentido` 1) ou
 * para baixo (-1). `normal` (opcional) = para onde a face do compartimento do sensor está virada: com a câmera
 * claramente do outro lado, o balão some (não cobre o que se vê do lado oposto da máquina).
 */
export function criarBalao(scene, { nome, ancora, sentido = 1, normal = null, grupo = 1, largura = BALAO.largura }) {
  const altura = (largura * TEX.altura) / TEX.largura;
  const malha = MeshBuilder.CreatePlane(`balao_${nome}`, { width: largura, height: altura }, scene);
  malha.billboardMode = Mesh.BILLBOARDMODE_ALL;
  malha.renderingGroupId = grupo;
  const tex = new DynamicTexture(`tex_balao_${nome}`, { width: TEX.largura, height: TEX.altura }, scene, true);
  tex.hasAlpha = true;
  const mat = new StandardMaterial(`mat_balao_${nome}`, scene);
  mat.diffuseTexture = tex;
  mat.emissiveTexture = tex;
  mat.useAlphaFromDiffuseTexture = true;
  mat.disableLighting = true;
  mat.backFaceCulling = false;
  malha.material = mat;

  const direcao = new Vector3();
  const tmp = new Vector3();
  let estadoAtual = "semDados";
  let anterior = "";
  let desvio = 0; // m ao longo do "para cima" da câmera (separar(): afasta balões que se cobrem)
  let haste = null; // liga o ponto do sensor ao balão quando ele foi afastado

  function atualizarHaste(cima) {
    const ligado = malha.isEnabled() && malha.isVisible && Math.abs(desvio) > 0.003;
    let u = 0;
    let meia = 0;
    if (ligado) {
      meia = (altura * malha.scaling.y) / 2;
      balao.ancora.subtractToRef(malha.position, tmp);
      u = Vector3.Dot(tmp, cima);
    }
    // âncora atrás do próprio balão: não precisa de haste
    if (!ligado || Math.abs(u) <= meia) {
      if (haste) haste.isVisible = false;
      return;
    }
    const borda = malha.position.add(cima.scale(Math.sign(u) * meia));
    if (!haste) {
      haste = MeshBuilder.CreateLines(`hasteBalao_${nome}`, { points: [balao.ancora.clone(), borda], updatable: true }, scene);
      haste.color = new Color3(1, 0.62, 0.62);
      haste.isPickable = false;
      haste.renderingGroupId = grupo;
    } else {
      MeshBuilder.CreateLines(`hasteBalao_${nome}`, { points: [balao.ancora, borda], instance: haste });
    }
    haste.isVisible = true;
  }

  const balao = {
    malha,
    ancora: ancora.clone(),
    proporcao: TEX.largura / TEX.altura, // meia largura ÷ meia altura
    meiaAltura: () => (altura * malha.scaling.y) / 2,
    /** Aplica (suavemente) o afastamento calculado em separar(); chamado depois de ajustar(), a cada quadro. */
    deslocar(cima, alvo, k) {
      desvio += (alvo - desvio) * k;
      if (Math.abs(desvio) < 1e-4 && alvo === 0) desvio = 0;
      if (desvio && malha.isEnabled()) malha.position.addInPlace(cima.scale(desvio));
      atualizarHaste(cima);
    },
    /** Redesenha só quando o texto ou o estado mudam. */
    atualizar(g, estado, tv, titulo) {
      estadoAtual = estado.id;
      const chave = `${estado.id}|${tv.valor}|${tv.unidade}|${titulo}`;
      if (chave === anterior) return;
      anterior = chave;
      desenharEtiqueta(tex.getContext(), g, estado, tv, titulo);
      tex.update();
    },
    mostrar(visivel) {
      malha.setEnabled(visivel);
    },
    ajustar(cam, naTela, t) {
      if (!malha.isEnabled()) return;
      cam.globalPosition.subtractToRef(balao.ancora, direcao);
      const distancia = direcao.length();
      malha.isVisible = !normal || Vector3.Dot(direcao, normal) / distancia > -0.25;
      let s = naTela ? Math.min(ESCALA_MAX, Math.max(1, distancia / DISTANCIA_BASE)) : 1;
      if (estadoAtual === "alarme") s *= 1 + 0.12 * Math.abs(Math.sin(t * 4));
      malha.scaling.setAll(s);
      malha.position.set(balao.ancora.x, balao.ancora.y + (sentido * altura * s) / 2, balao.ancora.z);
    },
  };
  registro(scene).push(balao);
  return balao;
}

/**
 * Desenha o balão num canvas de proporção 320 × 120, em qualquer resolução: vermelho translúcido (o modelo
 * aparece por trás), borda fina, título pequeno, valor grande e o estado com um ponto na cor dele (nunca só a
 * cor: o texto do estado vai ao lado). `nome` é o título (padrão: "Sensor de <grandeza>").
 */
export function desenharEtiqueta(ctx, g, estado, tv, nome = `Sensor de ${g.nome.toLowerCase()}`) {
  const W = 320;
  const H = 120;
  const k = ctx.canvas.width / W;
  const FONTE = "Segoe UI, Roboto, Arial, sans-serif";
  const semDados = estado.id === "semDados";
  ctx.save();
  ctx.setTransform(k, 0, 0, k, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.beginPath();
  ctx.roundRect(3, 3, W - 6, H - 6, 16);
  ctx.fillStyle = semDados ? VERMELHO_SEM_DADOS : VERMELHO;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(255, 205, 205, 0.85)";
  ctx.stroke();

  // sombra leve no texto: continua legível com o fundo claro aparecendo pelo balão
  ctx.shadowColor = "rgba(0, 0, 0, 0.55)";
  ctx.shadowBlur = 4;
  ctx.shadowOffsetY = 1;

  // título (diminui até caber)
  desenharIcone(ctx, g.icone, 16, 14, 24, "rgba(255,255,255,0.9)", 2.2);
  ctx.fillStyle = "rgba(255, 255, 255, 0.92)";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  let tam = 21;
  do ctx.font = `700 ${tam}px ${FONTE}`;
  while (ctx.measureText(nome).width > W - 48 - 14 && --tam > 13);
  ctx.fillText(nome, 48, 27);

  // valor e unidade
  ctx.textBaseline = "alphabetic";
  ctx.font = `700 46px ${FONTE}`;
  ctx.fillStyle = semDados ? "rgba(255, 255, 255, 0.6)" : "#ffffff";
  ctx.fillText(tv.valor, 16, 98);
  const largura = ctx.measureText(tv.valor).width;
  ctx.font = `500 16px ${FONTE}`;
  ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
  ctx.fillText(tv.unidade, 16 + largura + 6, 98);

  // estado: texto à direita e um ponto na cor do estado (com aro branco, visível sobre o vermelho)
  ctx.font = `700 16px ${FONTE}`;
  ctx.textAlign = "right";
  ctx.fillStyle = "#ffffff";
  ctx.fillText(estado.texto, W - 16, 96);
  const xp = W - 16 - ctx.measureText(estado.texto).width - 12;
  ctx.shadowColor = "transparent";
  ctx.beginPath();
  ctx.arc(xp, 90.5, 5.5, 0, Math.PI * 2);
  ctx.fillStyle = semDados ? "#9aa3ad" : estado.cor;
  ctx.fill();
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = "#ffffff";
  ctx.stroke();
  ctx.restore();
}
