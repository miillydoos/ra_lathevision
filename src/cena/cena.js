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
  RawTexture,
  Scene,
  ShadowGenerator,
  Texture,
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

  // ---------- piso de taco com demarcações pintadas (desenhado em canvas, sem imagens externas)
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

  // taco envernizado, como o da oficina real (foto 360°): a textura de 1,2 m se repete; o verniz brilha
  const taco = criarTexturaTaco(scene);
  taco.uScale = taco.vScale = tamanho / 1.2;
  taco.wAng = Math.PI / 2; // as réguas correm ao longo do corredor (a sala está girada em relação ao torno)
  const mat = new PBRMaterial("matPiso", scene);
  mat.albedoTexture = taco;
  mat.metallic = 0;
  mat.roughness = 0.28;
  mat.environmentIntensity = 0.6;
  // mapa de detalhe: pequenas variações de brilho e relevo do verniz, vistas de perto
  const detalhe = criarDetalhePiso(scene);
  detalhe.uScale = detalhe.vScale = tamanho / 0.6;
  mat.detailMap.texture = detalhe;
  mat.detailMap.isEnabled = true;
  mat.detailMap.diffuseBlendLevel = 0.12;
  mat.detailMap.roughnessBlendLevel = 0.6;
  mat.detailMap.bumpLevel = 0.3;
  piso.material = mat;

  // demarcações pintadas sobre o taco: camada transparente logo acima do piso (filha dele, some junto em RA)
  const marcas = MeshBuilder.CreateGround("pisoDemarcacoes", { width: tamanho, height: tamanho }, scene);
  marcas.parent = piso;
  marcas.position.y = 0.0015;
  marcas.isPickable = false;
  marcas.receiveShadows = true;
  marcas.alphaIndex = 0; // desenhada antes das manchas de luz e das sombras de contato da sala
  const res = 2048;
  const pxPorM = res / tamanho;
  const tex = new DynamicTexture("texPiso", { width: res, height: res }, scene, true);
  tex.hasAlpha = true;
  const ctx = tex.getContext();
  ctx.clearRect(0, 0, res, res);
  // O topo do canvas corresponde a +Z (lado do operador). Inverte o eixo vertical para que
  // o texto fique legível para quem está na frente da máquina olhando para o barramento.
  ctx.translate(0, res);
  ctx.scale(1, -1);

  // conversão metro → pixel (com o canvas já invertido)
  const px = (x) => (x + tamanho / 2) * pxPorM;
  const pz = (z) => (z + tamanho / 2) * pxPorM;

  // faixa branca pintada delimitando a área da máquina, como as da oficina real
  // (o tapete de borracha da área do operador fica na sala: src/cena/sala.js)
  const area = { x0: -1.8, x1: 1.85, z0: -0.8, z1: 0.8 };
  const larg = 0.08 * pxPorM;
  ctx.strokeStyle = "rgba(246,246,242,0.96)";
  ctx.lineWidth = larg;
  ctx.strokeRect(px(area.x0) + larg / 2, pz(area.z0) + larg / 2, px(area.x1) - px(area.x0) - larg, pz(area.z1) - pz(area.z0) - larg);
  tex.update();
  tex.anisotropicFilteringLevel = 8;

  const matMarcas = new PBRMaterial("matPisoDemarcacoes", scene);
  matMarcas.albedoTexture = tex;
  matMarcas.useAlphaFromAlbedoTexture = true;
  matMarcas.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
  matMarcas.useRadianceOverAlpha = false; // o reflexo fica por conta do verniz do taco, embaixo
  matMarcas.useSpecularOverAlpha = false;
  matMarcas.metallic = 0;
  matMarcas.roughness = 0.5;
  matMarcas.environmentIntensity = 0.5;
  matMarcas.zOffset = -2; // sem "briga" de profundidade com o piso
  marcas.material = matMarcas;
  return piso;
}

/**
 * Taco como o da oficina real (foto 360°): réguas de 7 × 30 cm ao longo do corredor (X), em fiadas desencontradas,
 * com tons bem variados (do mel ao castanho-escuro). A textura cobre 1,2 m e se repete sem emenda.
 */
function criarTexturaTaco(scene) {
  const n = 1024;
  const tex = new DynamicTexture("texTaco", { width: n, height: n }, scene, true);
  const ctx = tex.getContext();
  const tons = ["#7a3420", "#86391f", "#6a2a17", "#94462a", "#5a2214", "#7f3b24", "#a35a32", "#4e1d10", "#733222"];
  const alturaFiada = n / 16; // 7,5 cm
  const comprimento = n / 4; // 30 cm
  // desenha a régua também deslocada de ±n para a textura repetir sem emenda
  const regua = (x, y, w, h) => {
    // sorteia uma vez: as cópias da emenda ficam iguais
    const tom = tons[Math.floor(Math.random() * tons.length)];
    const [escuro, claro] = [(Math.random() * 0.12).toFixed(3), (Math.random() * 0.07).toFixed(3)];
    const veios = Array.from({ length: 6 }, () => [Math.random() < 0.55, Math.random() * h, 0.8 + Math.random() * 1.4]);
    for (const dx of [-n, 0, n]) {
      if (x + dx + w < 0 || x + dx > n) continue;
      const rx = x + dx;
      ctx.fillStyle = tom;
      ctx.fillRect(rx, y, w, h);
      const g = ctx.createLinearGradient(rx, 0, rx + w, 0); // tom que varia ao longo da régua
      g.addColorStop(0, `rgba(30,8,2,${escuro})`);
      g.addColorStop(1, `rgba(255,205,160,${claro})`);
      ctx.fillStyle = g;
      ctx.fillRect(rx, y, w, h);
      for (const [escuroVeio, off, esp] of veios) {
        ctx.fillStyle = escuroVeio ? "rgba(40,12,4,0.18)" : "rgba(255,190,140,0.08)";
        ctx.fillRect(rx, y + off, w, esp);
      }
      ctx.strokeStyle = "rgba(30,9,3,0.6)"; // fresta
      ctx.lineWidth = 1.5;
      ctx.strokeRect(rx + 0.75, y + 0.75, w - 1.5, h - 1.5);
    }
  };
  for (let f = 0; f < 16; f++) {
    const deslocamento = Math.floor(Math.random() * 4) * (comprimento / 4);
    for (let x = -deslocamento; x < n; x += comprimento) regua(x, f * alturaFiada, comprimento, alturaFiada);
  }
  tex.update();
  tex.wrapU = tex.wrapV = Texture.WRAP_ADDRESSMODE;
  tex.anisotropicFilteringLevel = 8;
  return tex;
}

/**
 * Mapa de detalhe do piso (gerado, repetível): R = leve variação de cor, G/A = normal do microrrelevo do verniz,
 * B = variação de rugosidade (partes mais e menos brilhantes). 0,5 é neutro em todos os canais.
 */
function criarDetalhePiso(scene) {
  const n = 256;
  const relevo = ruidoPeriodico(n, [8, 16, 32, 64]);
  const aspereza = ruidoPeriodico(n, [4, 8, 16]);
  const em = (x, y) => relevo[((y + n) % n) * n + ((x + n) % n)];
  const byte = (v) => Math.max(0, Math.min(255, Math.round(v)));
  const dados = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const i = (y * n + x) * 4;
      const grao = (Math.random() - 0.5) * 12;
      dados[i] = byte(128 + (em(x, y) - 0.5) * 50 + grao);
      dados[i + 1] = byte(128 + (em(x, y - 1) - em(x, y + 1)) * 4 * 127);
      dados[i + 2] = byte(128 + (aspereza[y * n + x] - 0.5) * 110);
      dados[i + 3] = byte(128 + (em(x - 1, y) - em(x + 1, y)) * 4 * 127);
    }
  const tex = RawTexture.CreateRGBATexture(dados, n, n, scene, true, false, Texture.TRILINEAR_SAMPLINGMODE);
  tex.wrapU = tex.wrapV = Texture.WRAP_ADDRESSMODE;
  tex.anisotropicFilteringLevel = 8;
  return tex;
}

/** Ruído de valor que se repete nas bordas (soma de oitavas com `celulas` por lado), normalizado em 0…1. */
function ruidoPeriodico(n, celulas) {
  const saida = new Float32Array(n * n);
  const suave = (t) => t * t * (3 - 2 * t);
  let amp = 1;
  for (const g of celulas) {
    const grade = Float32Array.from({ length: g * g }, () => Math.random());
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const fx = (x / n) * g;
        const fy = (y / n) * g;
        const x0 = Math.floor(fx);
        const y0 = Math.floor(fy);
        const tx = suave(fx - x0);
        const ty = suave(fy - y0);
        const [x1, y1] = [(x0 + 1) % g, (y0 + 1) % g];
        const a = grade[y0 * g + x0] * (1 - tx) + grade[y0 * g + x1] * tx;
        const b = grade[y1 * g + x0] * (1 - tx) + grade[y1 * g + x1] * tx;
        saida[y * n + x] += amp * (a * (1 - ty) + b * ty);
      }
    amp *= 0.5;
  }
  let min = Infinity;
  let max = -Infinity;
  for (const v of saida) {
    min = Math.min(min, v);
    max = Math.max(max, v);
  }
  return saida.map((v) => (v - min) / (max - min || 1));
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
