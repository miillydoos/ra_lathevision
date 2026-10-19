import {
  ArcRotateCamera,
  Camera,
  Color3,
  Color4,
  CubeTexture,
  DirectionalLight,
  DynamicTexture,
  Engine,
  HemisphericLight,
  MeshBuilder,
  PBRMaterial,
  Scene,
  ShadowGenerator,
  Vector3,
} from "@babylonjs/core";

export const CONFIG_CENA = {
  // Vista inicial: de frente, levemente pelo lado do cabeçote.
  camera: { alfa: Math.PI / 2 + 0.38, beta: 1.18, raio: 3.9, alvo: [0, 0.95, 0.05] },
  tamanhoPiso: 14,
  // Posição do operador (em pé, de frente para o barramento) usada na entrada em RV.
  posicaoOperador: [-0.3, 1.45],
};

export function criarCena(canvas) {
  const engine = new Engine(canvas, true, { stencil: true, xrCompatible: true }, true);
  const scene = new Scene(engine);
  // O glTF é destro (right-handed); usar o mesmo sistema evita conversões de coordenadas.
  scene.useRightHandedSystem = true;
  scene.clearColor = new Color4(0.8, 0.84, 0.88, 1);

  // Mapa de ambiente local (funciona sem internet). Sem ele, peças metálicas ficam pretas.
  const ambiente = CubeTexture.CreateFromPrefilteredData("./env/ambiente.env", scene);
  scene.environmentTexture = ambiente;
  scene.environmentIntensity = 0.85;
  const ceu = scene.createDefaultSkybox(ambiente, true, 60, 0.45, false);
  if (ceu) ceu.isPickable = false;

  // ---------- câmera
  const c = CONFIG_CENA.camera;
  const camera = new ArcRotateCamera("camera", c.alfa, c.beta, c.raio, new Vector3(...c.alvo), scene);
  camera.attachControl(canvas, true);
  camera.minZ = 0.02;
  camera.maxZ = 120;
  camera.lowerRadiusLimit = 0.45;
  camera.upperRadiusLimit = 9;
  camera.upperBetaLimit = Math.PI / 2 - 0.03; // não atravessa o piso
  camera.wheelDeltaPercentage = 0.015;
  camera.pinchDeltaPercentage = 0.004;
  camera.panningSensibility = 1400;
  camera.useNaturalPinchZoom = true;

  // ---------- luzes
  const hemi = new HemisphericLight("luzAmbiente", new Vector3(0.2, 1, 0.3), scene);
  hemi.intensity = 0.55;
  hemi.groundColor = new Color3(0.32, 0.33, 0.36);

  const sol = new DirectionalLight("luzPrincipal", new Vector3(-0.45, -1, -0.55), scene);
  sol.position = new Vector3(3, 6, 4);
  sol.intensity = 1.5;
  sol.shadowMinZ = 0.5;
  sol.shadowMaxZ = 14;

  const sombras = new ShadowGenerator(2048, sol);
  sombras.useBlurExponentialShadowMap = true;
  sombras.blurKernel = 16;
  sombras.darkness = 0.4;
  sombras.depthScale = 60;

  // ---------- piso industrial com demarcações (desenhado em canvas, sem imagens externas)
  const piso = criarPiso(scene, CONFIG_CENA.tamanhoPiso);
  piso.receiveShadows = true;

  // ---------- transição suave de câmera
  const tween = criarTweenCamera(scene, camera);

  // Em tela retrato (celular) fixa o campo de visão horizontal para a máquina inteira caber na largura.
  const ajustarCampoDeVisao = () => {
    camera.fovMode = engine.getAspectRatio(camera) < 1 ? Camera.FOVMODE_HORIZONTAL_FIXED : Camera.FOVMODE_VERTICAL_FIXED;
  };
  ajustarCampoDeVisao();

  engine.runRenderLoop(() => scene.render());
  window.addEventListener("resize", () => {
    engine.resize();
    ajustarCampoDeVisao();
  });

  return { engine, scene, camera, sombras, piso, ceu, sol, focar: tween.focar, vistaInicial: tween.vistaInicial };
}

function criarPiso(scene, tamanho) {
  const piso = MeshBuilder.CreateGround("piso", { width: tamanho, height: tamanho }, scene);
  piso.isPickable = true; // usado como chão para teletransporte em RV
  const res = 2048;
  const pxPorM = res / tamanho;
  const tex = new DynamicTexture("texPiso", { width: res, height: res }, scene, true);
  const ctx = tex.getContext();
  // O topo do canvas corresponde a +Z (lado do operador). Inverte o eixo vertical para que
  // o texto fique legível para quem está na frente da máquina olhando para o barramento.
  ctx.translate(0, res);
  ctx.scale(1, -1);

  // concreto
  ctx.fillStyle = "#9da3a8";
  ctx.fillRect(0, 0, res, res);
  for (let i = 0; i < 26000; i++) {
    const v = 140 + Math.floor(Math.random() * 40);
    ctx.fillStyle = `rgba(${v},${v + 3},${v + 6},0.35)`;
    ctx.fillRect(Math.random() * res, Math.random() * res, 2, 2);
  }
  // juntas a cada 2 m
  ctx.strokeStyle = "rgba(70,74,78,0.55)";
  ctx.lineWidth = 2;
  for (let m = 0; m <= tamanho; m += 2) {
    const p = m * pxPorM;
    ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, res); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(res, p); ctx.stroke();
  }

  // conversão metro → pixel (com o canvas já invertido)
  const px = (x) => (x + tamanho / 2) * pxPorM;
  const pz = (z) => (z + tamanho / 2) * pxPorM;

  // faixa zebrada amarela/preta delimitando a área da máquina
  const area = { x0: -1.8, x1: 1.85, z0: -0.8, z1: 0.8 };
  const larg = 0.09 * pxPorM;
  const ret = (a) => [px(a.x0), pz(a.z0), px(a.x1) - px(a.x0), pz(a.z1) - pz(a.z0)];
  ctx.save();
  ctx.beginPath();
  const [ax, ay, aw, ah] = ret(area);
  ctx.rect(ax, ay, aw, ah);
  ctx.rect(ax + larg, ay + larg, aw - 2 * larg, ah - 2 * larg);
  ctx.clip("evenodd");
  ctx.fillStyle = "#e8b400";
  ctx.fillRect(0, 0, res, res);
  ctx.strokeStyle = "#1d1d1d";
  ctx.lineWidth = larg * 0.55;
  for (let d = -res; d < res * 2; d += larg * 1.6) {
    ctx.beginPath(); ctx.moveTo(d, 0); ctx.lineTo(d + res, res); ctx.stroke();
  }
  ctx.restore();

  // área do operador
  const op = { x0: -1.25, x1: 0.55, z0: 0.95, z1: 1.75 };
  ctx.fillStyle = "rgba(40,140,90,0.25)";
  ctx.fillRect(...ret(op));
  ctx.strokeStyle = "#2f8f5b";
  ctx.lineWidth = 0.04 * pxPorM;
  ctx.strokeRect(...ret(op));
  ctx.save();
  ctx.translate(px((op.x0 + op.x1) / 2), pz((op.z0 + op.z1) / 2));
  ctx.fillStyle = "rgba(25,90,58,0.9)";
  ctx.font = `bold ${Math.round(0.11 * pxPorM)}px Segoe UI, Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("ÁREA DO OPERADOR", 0, 0);
  ctx.restore();
  tex.update();

  const mat = new PBRMaterial("matPiso", scene);
  mat.albedoTexture = tex;
  mat.metallic = 0;
  mat.roughness = 0.88;
  mat.environmentIntensity = 0.6;
  piso.material = mat;
  return piso;
}

/** Move alvo e distância da câmera orbital mantendo o ângulo de visão. */
function criarTweenCamera(scene, camera) {
  let animacao = null;
  const suave = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  scene.onBeforeRenderObservable.add(() => {
    if (!animacao) return;
    const a = animacao;
    a.t = Math.min(1, a.t + scene.getEngine().getDeltaTime() / a.duracao);
    const k = suave(a.t);
    camera.target.copyFrom(Vector3.Lerp(a.alvo0, a.alvo1, k));
    camera.radius = a.raio0 + (a.raio1 - a.raio0) * k;
    if (a.alfa1 !== undefined) camera.alpha = a.alfa0 + (a.alfa1 - a.alfa0) * k;
    if (a.beta1 !== undefined) camera.beta = a.beta0 + (a.beta1 - a.beta0) * k;
    if (a.t >= 1) animacao = null;
  });

  function focar(alvo, raio, { alfa, beta, duracao = 700 } = {}) {
    animacao = {
      t: 0,
      duracao,
      alvo0: camera.target.clone(),
      alvo1: alvo.clone(),
      raio0: camera.radius,
      raio1: raio,
      alfa0: camera.alpha,
      alfa1: alfa,
      beta0: camera.beta,
      beta1: beta,
    };
  }

  function vistaInicial() {
    const c = CONFIG_CENA.camera;
    // normaliza alfa para não dar voltas desnecessárias
    const doisPi = Math.PI * 2;
    camera.alpha = ((camera.alpha % doisPi) + doisPi) % doisPi;
    focar(new Vector3(...c.alvo), c.raio, { alfa: c.alfa, beta: c.beta });
  }

  return { focar, vistaInicial };
}
