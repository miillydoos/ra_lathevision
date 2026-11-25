import { DynamicTexture, Mesh, MeshBuilder, StandardMaterial, Vector3 } from "@babylonjs/core";
import { desenharIcone } from "../util/icones.js";

// Balões com o valor das medições, presos aos sensores: vermelhos translúcidos, grandes e sempre por cima do modelo, de
// frente para a câmera, para serem vistos de longe. Na tela crescem com a distância da câmera (até ESCALA_MAX)
// e continuam legíveis na vista geral; no headset ficam no tamanho real. Em alarme, pulsam.
// O estado da medição (Normal, Atenção, Alarme, Sem dados) aparece em texto, com um ponto na cor do estado.

export const BALAO = { largura: 0.2, altura: 0.075 }; // m, tamanho base (proporção da textura, 320 × 120)
const TEX = { largura: 640, altura: 240 };
const DISTANCIA_BASE = 0.9; // m: até aqui o balão fica no tamanho base; depois cresce junto com a distância
const ESCALA_MAX = 3;

const VERMELHO = "rgba(204, 12, 15, 0.55)"; // vermelho da logo LatheVision, translúcido: o modelo aparece por trás
const VERMELHO_SEM_DADOS = "rgba(110, 30, 30, 0.5)";

const registros = new WeakMap();
/** Um laço por cena ajusta o tamanho e a posição de todos os balões. */
function registro(scene) {
  if (registros.has(scene)) return registros.get(scene);
  const lista = [];
  let t = 0;
  scene.onBeforeRenderObservable.add(() => {
    t += scene.getEngine().getDeltaTime() / 1000;
    const cam = scene.activeCamera;
    if (!cam) return;
    const naTela = cam.getClassName() !== "WebXRCamera";
    for (const b of lista) b.ajustar(cam, naTela, t);
  });
  registros.set(scene, lista);
  return lista;
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
  let estadoAtual = "semDados";
  let anterior = "";
  const balao = {
    malha,
    ancora: ancora.clone(),
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
