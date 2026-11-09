import {
  Axis,
  Camera,
  Color3,
  Curve3,
  DynamicTexture,
  HemisphericLight,
  Matrix,
  Mesh,
  MeshBuilder,
  PBRMaterial,
  PickingInfo,
  PointerEventTypes,
  Quaternion,
  StandardMaterial,
  TransformNode,
  Vector3,
} from "@babylonjs/core";
import { GRANDEZA_POR_ID } from "../config/grandezas.js";
import { ESTADOS } from "../config/estados.js";
import { textoValor } from "../ui/sensoresUI.js";
import { desenharEtiqueta } from "./compartimentos.js";
import { svgIcone } from "../util/icones.js";
import { criarEmissor } from "../util/emissor.js";

// Caixa do sistema de monitoramento (SENAI São Carlos), apoiada no tampo do cabeçote, no canto do lado do
// painel elétrico. Modelada a partir das fotos da caixa real: corpo cinza impresso em 3D, tampa prateada com
// os dizeres em baixo-relevo e o LCD 16×2 (que mostra as leituras); dentro, a placa com o ESP32-C3 Super Mini,
// o MPU-6050, o módulo de termopar HW-550 (MAX6675), dois optoacopladores, os bornes e os cabos.
// Clicar nela traz a caixa para a frente da tela com a tampa aberta (virada para o lado, presa pelo cabo de
// 4 vias do LCD); arrastar gira, a roda aproxima, e Esc, um clique fora ou outro clique nela a devolvem.
// Coordenadas em metros; no local da caixa X = largura, Y = altura (tampa em +Y) e Z = comprimento.
// Apoiada no torno, +Z do local coincide com +Z do mundo, e os dizeres ficam legíveis para quem olha do
// lado do cabeçote (-X). Na frente da tela, Z vai para a direita e X para cima.
export const CAIXA = {
  posicao: [-1.3325, 1.328, -0.3825], // centro da base, no tampo do cabeçote (y = 1,328); canto -X / -Z
  largura: 0.095,
  altura: 0.055,
  comprimento: 0.155,
  parede: 0.0028,
  tampa: 0.003,
  anguloTampa: -0.96 * Math.PI, // aberta: vira sobre a borda +X e fica ao lado, com o lado de dentro para cima
  giroInicial: [-0.38, 0], // inclinação (rad) na frente da tela: em torno do eixo horizontal e do vertical
};

const { largura: W, altura: H, comprimento: L, parede: E, tampa: T } = CAIXA;
const DURACAO_ABRIR = 0.95; // s
const DURACAO_FECHAR = 0.75;
const PX_POR_M = 4000; // resolução das texturas desenhadas (4 px/mm)

// Posição dentro da caixa a partir da foto da caixa aberta: u = fração da largura interna (-X → +X),
// v = fração do comprimento interno (-Z, lado da entrada dos cabos → +Z).
const px = (u) => -W / 2 + E + u * (W - 2 * E);
const pz = (v) => -L / 2 + E + v * (L - 2 * E);
const Y_PLACA = E + 0.0018; // face de cima da placa branca
const MPU = { u: 0.235, v: 0.505, y: Y_PLACA + 0.0085 }; // MPU-6050 (o sensor de vibração), sobre a barra de pinos
const Z_PRENSA_CABO = -L / 2 - 0.0105; // prensa-cabo no tampo, atrás da parede -Z, alinhado com o furo dos cabos

/**
 * Caixa clicável no tampo do cabeçote. Emite "estado" (aberta na frente da tela ou não).
 * Chamar depois de criarSelecao (registra os cliques nela).
 */
export function criarCaixaMonitoramento({ scene, camera, selecao, fluxo, config }) {
  const eventos = criarEmissor();
  const engine = scene.getEngine();
  const canvas = engine.getRenderingCanvas();

  const raiz = new TransformNode("caixaMonitoramento", scene);
  const dobradica = new TransformNode("caixaMonitoramento_dobradica", scene);
  dobradica.parent = raiz;
  dobradica.position.set(W / 2, H, 0);

  const pecas = criarPecas(scene);
  montarCorpo(pecas, raiz);
  const lcd = montarTampa(pecas, dobradica);
  dobradica.computeWorldMatrix(true); // a mescla grava as peças na posição do mundo
  mesclarPorMaterial(raiz);
  mesclarPorMaterial(dobradica);
  const cabo = criarCaboLcd(scene, raiz, pecas);

  raiz.position.set(...CAIXA.posicao);
  raiz.rotationQuaternion = Quaternion.Identity();
  const malhas = raiz.getChildMeshes(false);
  const chamada = criarChamadaVibracao(scene, raiz); // fora de `malhas`: não é clicável nem muda de grupo

  // prensa-cabo no tampo do cabeçote, por onde os cabos descem até os sensores (fica no torno)
  const [cx, cy, cz] = CAIXA.posicao;
  const pretoPrensa = pecas.material("#1b1d20", { rugosidade: 0.45 });
  pecas.cilindro(null, 0.016, 0.003, pretoPrensa, [cx + px(0.41), cy + 0.0015, cz + Z_PRENSA_CABO], "y", 6).isPickable = false;
  pecas.cilindro(null, 0.0125, 0.0075, pretoPrensa, [cx + px(0.41), cy + 0.00375, cz + Z_PRENSA_CABO]).isPickable = false;

  // luz só da caixa, vinda do lado de quem olha: acende enquanto ela está na frente da tela
  const luz = new HemisphericLight("luzCaixaMonitoramento", new Vector3(0, 1, 0), scene);
  luz.includedOnlyMeshes = malhas;
  luz.specular = Color3.Black();
  luz.intensity = 0;

  // fundo escurecido atrás da caixa aberta; clicar nele fecha
  const fundo = MeshBuilder.CreatePlane("caixaMonitoramento_fundo", { size: 1 }, scene);
  const matFundo = new StandardMaterial("matCaixaMonitoramento_fundo", scene);
  matFundo.diffuseColor = Color3.Black();
  matFundo.specularColor = Color3.Black();
  matFundo.disableLighting = true;
  matFundo.backFaceCulling = false;
  matFundo.alpha = 0;
  fundo.material = matFundo;
  fundo.renderingGroupId = 2;
  fundo.rotationQuaternion = Quaternion.Identity();
  fundo.setEnabled(false);

  // ---------- legenda (HTML) enquanto a caixa está aberta
  const legenda = document.createElement("section");
  legenda.className = "painel legenda-caixa";
  legenda.hidden = true;
  legenda.setAttribute("aria-label", "Sistema de monitoramento");
  legenda.innerHTML = `
    <header>
      <h3>Sistema de monitoramento</h3>
      <button type="button" class="fechar" aria-label="Fechar">${svgIcone("fechar", { tamanho: 18 })}</button>
    </header>
    <p>ESP32-C3 com o acelerômetro MPU-6050 (o sensor de vibração, a placa azul de baixo), o módulo de termopar HW-550 (MAX6675), dois optoacopladores e os bornes dos sensores. Na tampa, o LCD 16×2 mostra as leituras.</p>
    <p class="sutil">Arraste para girar · role para aproximar · Esc ou clique fora para fechar</p>`;
  legenda.querySelector(".fechar").addEventListener("click", () => fechar());
  (document.getElementById("hud") ?? document.body).appendChild(legenda);

  // ---------- estado: k = 0 apoiada no torno, 1 aberta na frente da tela
  let k = 0;
  let alvo = 0;
  let kAplicado = -1;
  let grupo = 0;
  let cameraSolta = false;
  const giro = [...CAIXA.giroInicial];
  let zoom = 1;
  const repouso = { posicao: raiz.position.clone(), rotacao: Quaternion.Identity() };

  const dica = {
    id: "caixaMonitoramento",
    get nome() {
      return alvo ? "Sistema de monitoramento: clique para fechar" : "Sistema de monitoramento: clique para abrir";
    },
    malhas,
  };
  for (const m of malhas) {
    m.enablePointerMoveEvents = true; // sem isto o "move" atravessa a caixa e mostra a dica da porta do painel atrás
    selecao.registrarClicavel(m, () => alternar(), dica);
  }
  fundo.enablePointerMoveEvents = true; // com a caixa aberta, nada atrás do fundo mostra dica
  selecao.registrarClicavel(fundo, () => fechar(), null);

  // o ponteiro parado não gera "move": a dica some quando a caixa sai do lugar e, no fim do voo,
  // é refeita para o que ficou sob o ponteiro (o texto dela muda entre abrir e fechar)
  let tipoPonteiro = "";
  function refazerDica(repicar) {
    if (tipoPonteiro !== "mouse" && tipoPonteiro !== "pen") return;
    const init = { pointerType: tipoPonteiro };
    scene.simulatePointerMove(new PickingInfo(), init);
    if (repicar) scene.simulatePointerMove(scene.pick(scene.pointerX, scene.pointerY, scene.pointerMovePredicate), init);
  }

  function abrir() {
    if (alvo === 1) return;
    alvo = 1;
    giro.splice(0, 2, ...CAIXA.giroInicial);
    zoom = 1;
    // a câmera orbital fica parada; arrastar passa a girar a caixa
    if (scene.activeCamera === camera && camera.inputs.attachedToElement) {
      camera.inertialAlphaOffset = camera.inertialBetaOffset = camera.inertialRadiusOffset = 0;
      camera.detachControl();
      cameraSolta = true;
    }
    legenda.hidden = false;
    refazerDica(false);
    eventos.emitir("estado", true);
  }

  function fechar({ imediato = false } = {}) {
    if (alvo === 0 && (!imediato || k === 0)) return;
    alvo = 0;
    if (imediato) k = 0;
    if (cameraSolta) {
      camera.attachControl(canvas, true); // como em cena.js
      cameraSolta = false;
    }
    arrasto = null;
    legenda.hidden = true;
    refazerDica(false);
    eventos.emitir("estado", false);
  }

  const alternar = () => (alvo === 1 ? fechar() : abrir());

  // ---------- arrastar gira a caixa, a roda aproxima (só com ela aberta)
  let arrasto = null;
  scene.onPointerObservable.add((pi) => {
    tipoPonteiro = pi.event.pointerType ?? tipoPonteiro; // a roda (WheelEvent) não tem tipo
    if (alvo !== 1) return;
    const e = pi.event;
    if (pi.type === PointerEventTypes.POINTERDOWN) {
      arrasto = { id: e.pointerId, x: e.clientX, y: e.clientY };
    } else if (pi.type === PointerEventTypes.POINTERMOVE && arrasto && e.pointerId === arrasto.id) {
      giro[1] += (e.clientX - arrasto.x) * 0.008;
      giro[0] = Math.max(-1.3, Math.min(1.3, giro[0] + (e.clientY - arrasto.y) * 0.008));
      arrasto.x = e.clientX;
      arrasto.y = e.clientY;
    } else if (pi.type === PointerEventTypes.POINTERUP) {
      arrasto = null;
    }
  });
  canvas.addEventListener(
    "wheel",
    (e) => {
      if (alvo === 1) zoom = Math.max(0.6, Math.min(2.4, zoom * Math.exp(-e.deltaY * 0.0012)));
    },
    { passive: true },
  );
  // Esc fecha a caixa antes de recolher painéis ou sair da apresentação
  window.addEventListener(
    "keydown",
    (e) => {
      if (e.key !== "Escape" || alvo !== 1 || document.querySelector("dialog[open]")) return;
      fechar();
      e.preventDefault();
      e.stopImmediatePropagation();
    },
    true,
  );

  // ---------- pose na frente da tela, recalculada a cada quadro (acompanha a câmera)
  const suave = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const limitar = (t) => Math.max(0, Math.min(1, t));
  const tmp = { centro: Vector3.Zero(), deslocamento: Vector3.Zero() };

  function poseNaTela(kTampa) {
    const cam = scene.activeCamera;
    const inversa = cam.getWorldMatrix(); // inversa da matriz de vista
    const direita = Vector3.TransformNormal(Axis.X, inversa).normalize();
    const cima = Vector3.TransformNormal(Axis.Y, inversa).normalize();
    const paraCamera = Vector3.TransformNormal(Axis.Z, inversa).normalize(); // cena destra: a câmera olha para -Z

    // distância em que a caixa com a tampa aberta ocupa ~60% da altura (ou ~75% da largura) da vista
    let d = 0.45;
    if (cam === camera) {
      const aspecto = engine.getAspectRatio(cam);
      const t = Math.tan(cam.fov / 2);
      const tanV = cam.fovMode === Camera.FOVMODE_HORIZONTAL_FIXED ? t / aspecto : t;
      const tanH = tanV * aspecto;
      d = Math.max((2.1 * W) / (2 * tanV * 0.6), (1.15 * L) / (2 * tanH * 0.75));
    }
    // centro na direção em que o alvo da câmera aparece (os painéis deslocam a vista com targetScreenOffset)
    let c = new Vector3(0, 0, -d);
    if (cam === camera) {
      const t = Vector3.TransformCoordinates(camera.target, camera.getViewMatrix());
      if (t.z < -0.05) c = t.scale(d / -t.z);
    }
    Vector3.TransformCoordinatesToRef(c, inversa, tmp.centro);

    // eixos da caixa: X para cima, Y (tampa) para quem olha, Z para a direita; depois o giro do arrasto
    const r = Matrix.RotationAxis(direita, giro[0]).multiply(Matrix.RotationAxis(cima, giro[1]));
    const rotacao = Quaternion.RotationQuaternionFromAxis(
      Vector3.TransformNormal(cima, r),
      Vector3.TransformNormal(paraCamera, r),
      Vector3.TransformNormal(direita, r),
    );
    // gira em torno do centro do conjunto (caixa + tampa aberta), não da base
    const escala = zoom;
    new Vector3((W / 2) * kTampa, H / 2, 0).scale(escala).rotateByQuaternionToRef(rotacao, tmp.deslocamento);
    const posicao = tmp.centro.subtract(tmp.deslocamento);

    // fundo: mais atrás no mesmo raio, cobrindo a vista inteira
    const df = d + 0.3 * escala;
    fundo.position.copyFrom(Vector3.TransformCoordinates(c.scale(df / d), inversa));
    fundo.rotationQuaternion = Quaternion.RotationQuaternionFromAxis(direita, cima, paraCamera);
    fundo.scaling.setAll(df * 8);
    luz.direction.copyFrom(paraCamera);
    return { posicao, rotacao, escala };
  }

  scene.onBeforeRenderObservable.add(() => {
    if (k !== alvo) {
      const dt = Math.min(0.1, engine.getDeltaTime() / 1000);
      k = alvo ? Math.min(1, k + dt / DURACAO_ABRIR) : Math.max(0, k - dt / DURACAO_FECHAR);
      if (k === alvo) refazerDica(true);
    }
    if (k === kAplicado && k === 0) return;
    kAplicado = k;

    // sobre o torno: desenho normal; fora dele, por cima de tudo (inclusive dos rótulos)
    const g = k > 0 ? 2 : 0;
    if (g !== grupo) {
      grupo = g;
      for (const m of malhas) m.renderingGroupId = g;
      fundo.setEnabled(g === 2);
    }
    // voo de ida até 70% do tempo; a tampa abre a partir da metade (na volta, fecha antes de voar)
    const kVoo = suave(limitar(k / 0.7));
    const kTampa = suave(limitar((k - 0.5) / 0.5));
    chamada.raiz.setEnabled(kTampa === 1); // a etiqueta só aparece com a caixa parada na frente da tela
    if (k === 0) {
      raiz.position.copyFrom(repouso.posicao);
      raiz.rotationQuaternion.copyFrom(repouso.rotacao);
      raiz.scaling.setAll(1);
    } else {
      const p = poseNaTela(kTampa);
      Vector3.LerpToRef(repouso.posicao, p.posicao, kVoo, raiz.position);
      Quaternion.SlerpToRef(repouso.rotacao, p.rotacao, kVoo, raiz.rotationQuaternion);
      raiz.scaling.setAll(1 + (p.escala - 1) * kVoo);
    }
    matFundo.alpha = 0.55 * kVoo;
    fundo.isPickable = alvo === 1;
    luz.intensity = 0.45 * kVoo;
    const angulo = CAIXA.anguloTampa * kTampa;
    if (dobradica.rotation.z !== angulo) {
      dobradica.rotation.z = angulo;
      cabo.atualizar(angulo);
    }
  });

  // ---------- LCD: leituras atuais, em páginas (como no firmware)
  const PAGINAS = [
    [["Temp", "temperatura", "°C"], ["Vibr", "vibracao", "mm/s"]],
    [["Corr", "corrente", "A"], ["Oleo", "oleo", "%"]],
    [["Rot", "rotacao", "rpm"], null],
  ];
  function textoLcd(id) {
    const e = fluxo.estado(id);
    if (e.estado === "semDados" || e.valor === null || e.valor === undefined) return "--";
    if (id === "oleo" && config.grandezas.oleo?.sensor === "boia") return e.valor >= 0.5 ? "OK" : "BAIXO";
    return e.valor.toFixed(GRANDEZA_POR_ID[id].casas);
  }
  function linhaLcd(item) {
    if (!item) return "SENAI Sao Carlos";
    const [rotulo, id, unidade] = item;
    const valor = textoLcd(id);
    const fim = valor + (valor === "--" || valor === "OK" || valor === "BAIXO" ? "" : unidade);
    return rotulo.padEnd(Math.max(rotulo.length + 1, 16 - fim.length)) + fim;
  }
  const atualizarLcd = () => {
    const pagina = PAGINAS[Math.floor(performance.now() / 3000) % PAGINAS.length];
    lcd.escrever(pagina.map(linhaLcd));
  };
  setInterval(atualizarLcd, 500);

  // ---------- etiqueta do sensor de vibração (MPU-6050) com a leitura atual, como as dos compartimentos
  const atualizarChamada = () => {
    const e = fluxo.estado("vibracao");
    chamada.atualizar(ESTADOS[e.estado] ?? ESTADOS.semDados, textoValor(config, "vibracao", e.valor));
  };
  setInterval(() => alvo === 1 && atualizarChamada(), 250);
  atualizarChamada();
  atualizarLcd();

  return {
    raiz,
    abrir,
    fechar,
    alternar,
    get aberta() {
      return alvo === 1;
    },
    on: eventos.on,
  };
}

// ---------- peças

function criarPecas(scene) {
  // PBR, como as peças do torno.glb: a iluminação do ambiente vale também para a caixa
  const materiais = new Map();
  const material = (hex, { metal = 0, rugosidade = 0.6 } = {}) => {
    const chave = `${hex}|${metal}|${rugosidade}`;
    if (!materiais.has(chave)) {
      const m = new PBRMaterial(`caixaMonitoramento_${hex}`, scene);
      m.albedoColor = Color3.FromHexString(hex).toLinearSpace();
      m.metallic = metal;
      m.roughness = rugosidade;
      materiais.set(chave, m);
    }
    return materiais.get(chave);
  };
  const posicionar = (m, pai, mat, [x, y, z]) => {
    m.material = mat;
    m.parent = pai;
    m.position.set(x, y, z);
    return m;
  };
  return {
    scene,
    material,
    bloco: (pai, [w, h, d], mat, pos) =>
      posicionar(MeshBuilder.CreateBox("caixaMonitoramento_peca", { width: w, height: h, depth: d }, scene), pai, mat, pos),
    /** cilindro com o eixo em x, y ou z */
    cilindro(pai, d, h, mat, pos, eixo = "y", lados = 20) {
      const m = MeshBuilder.CreateCylinder("caixaMonitoramento_peca", { diameter: d, height: h, tessellation: lados }, scene);
      if (eixo === "x") m.rotation.z = Math.PI / 2;
      if (eixo === "z") m.rotation.x = Math.PI / 2;
      return posicionar(m, pai, mat, pos);
    },
    /** cabo passando pelos pontos (curva suave) */
    cabo(pai, pontos, raio, mat) {
      const caminho = Curve3.CreateCatmullRomSpline(pontos.map((p) => new Vector3(...p)), 8).getPoints();
      const m = MeshBuilder.CreateTube("caixaMonitoramento_cabo", { path: caminho, radius: raio, tessellation: 10, cap: Mesh.CAP_ALL }, scene);
      m.material = mat;
      m.parent = pai;
      return m;
    },
    /** imagem desenhada em canvas numa face voltada para +Y: topo do desenho em +X, direita em +Z */
    adesivo(pai, nome, [comprimento, largura], pos, desenhar, { brilho = false, metal = 0, rugosidade = 0.55 } = {}) {
      const w = Math.round(comprimento * PX_POR_M);
      const h = Math.round(largura * PX_POR_M);
      const tex = new DynamicTexture(`tex_${nome}`, { width: w, height: h }, scene, true);
      const ctx = tex.getContext();
      // o plano fica com a largura em -Z: desenha invertido na horizontal para a direita do desenho cair em +Z
      ctx.save();
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
      desenhar(ctx, w, h);
      ctx.restore();
      tex.update();
      let mat;
      if (brilho) {
        mat = new StandardMaterial(`mat_${nome}`, scene);
        mat.diffuseTexture = tex;
        mat.emissiveTexture = tex;
        mat.disableLighting = true; // tela com luz de fundo: a cor final é a da textura
      } else {
        mat = new PBRMaterial(`mat_${nome}`, scene);
        mat.albedoTexture = tex;
        mat.metallic = metal;
        mat.roughness = rugosidade;
      }
      const plano = MeshBuilder.CreatePlane(nome, { width: comprimento, height: largura }, scene);
      // face visível do plano (-Z local) para +Y; altura do plano em +X
      plano.rotationQuaternion = Quaternion.RotationQuaternionFromAxis(new Vector3(0, 0, -1), Axis.X, new Vector3(0, -1, 0));
      plano.unicoNaMescla = true;
      posicionar(plano, pai, mat, pos);
      return { plano, tex, ctx, w, h };
    },
  };
}

function montarCorpo(p, raiz) {
  const cinza = p.material("#83888e", { rugosidade: 0.62 });
  const furo = p.material("#141618", { rugosidade: 0.9 });
  const branco = p.material("#e8e6df", { rugosidade: 0.7 });
  const verde = p.material("#2aa64b", { rugosidade: 0.45 });
  const metal = p.material("#c4c8cd", { metal: 1, rugosidade: 0.35 });
  const preto = p.material("#1b1d20", { rugosidade: 0.45 });
  const azul = p.material("#1f56b8", { rugosidade: 0.45 });
  const bege = p.material("#cfae7c", { rugosidade: 0.6 });
  const caboBranco = p.material("#eceae4", { rugosidade: 0.5 });
  const caboPreto = p.material("#141619", { rugosidade: 0.5 });
  const cores = ["#d23b2a", "#141619", "#f0c419", "#2e9e48"].map((c) => p.material(c, { rugosidade: 0.5 }));

  // corpo: fundo, paredes e torres dos parafusos da tampa nos cantos
  p.bloco(raiz, [W, E, L], cinza, [0, E / 2, 0]);
  for (const s of [-1, 1]) {
    p.bloco(raiz, [E, H - E, L], cinza, [s * (W / 2 - E / 2), E + (H - E) / 2, 0]);
    p.bloco(raiz, [W - 2 * E, H - E, E], cinza, [0, E + (H - E) / 2, s * (L / 2 - E / 2)]);
    for (const t of [-1, 1]) {
      const x = s * (W / 2 - 0.0058);
      const z = t * (L / 2 - 0.0058);
      p.cilindro(raiz, 0.0078, H - E, cinza, [x, E + (H - E) / 2, z]);
      p.cilindro(raiz, 0.0026, 0.0004, furo, [x, H + 0.0001, z]);
    }
  }
  // furos nas paredes: entrada dos cabos (-Z), lateral (+X) e fundo (+Z)
  p.cilindro(raiz, 0.011, E + 0.0006, furo, [px(0.41), 0.03, -L / 2 + E / 2], "z");
  p.cilindro(raiz, 0.0085, E + 0.0006, furo, [W / 2 - E / 2, 0.035, pz(0.41)], "x");
  p.cilindro(raiz, 0.01, E + 0.0006, furo, [px(0.5), 0.022, L / 2 - E / 2], "z");

  // placa branca (com a aba por onde chegam os cabos) e dois parafusos
  const retangulo = (u0, u1, v0, v1, y, h, mat) =>
    p.bloco(raiz, [px(u1) - px(u0), h, pz(v1) - pz(v0)], mat, [(px(u0) + px(u1)) / 2, y + h / 2, (pz(v0) + pz(v1)) / 2]);
  retangulo(0.21, 0.68, 0.17, 0.64, E, Y_PLACA - E, branco);
  retangulo(0.25, 0.55, 0.03, 0.17, E, Y_PLACA - E, branco);
  for (const [u, v] of [[0.25, 0.615], [0.4, 0.06]]) p.cilindro(raiz, 0.0052, 0.0012, metal, [px(u), Y_PLACA + 0.0006, pz(v)]);

  // bornes de 2 vias (passo de 5,08 mm); `sentido` = lado por onde entram os fios. Devolve as duas entradas.
  const SENTIDOS = { "-x": [-1, 0, 0], "+x": [1, 0, 0], "-z": [0, 0, -1], "+z": [0, 0, 1] };
  function borne(u, v, sentido, { passo = 0.00508, altura = 0.0098, y0 = Y_PLACA } = {}) {
    const x = px(u);
    const z = pz(v);
    const emX = sentido[1] === "x";
    const fundura = 0.0076;
    p.bloco(raiz, emX ? [fundura, altura, 2 * passo] : [2 * passo, altura, fundura], verde, [x, y0 + altura / 2, z]);
    const [sx, , sz] = SENTIDOS[sentido];
    return [-0.5, 0.5].map((i) => {
      const [xi, zi] = emX ? [x, z + i * passo] : [x + i * passo, z];
      p.cilindro(raiz, passo * 0.62, 0.0006, metal, [xi, y0 + altura + 0.0003, zi]);
      const ponto = [xi + sx * (fundura / 2 + 0.0002), y0 + 0.003, zi + sz * (fundura / 2 + 0.0002)];
      p.bloco(raiz, emX ? [0.0006, 0.0032, passo * 0.62] : [passo * 0.62, 0.0032, 0.0006], furo, ponto);
      return ponto;
    });
  }
  const topo = [...borne(0.365, 0.2, "-z"), ...borne(0.515, 0.2, "-z")];
  const esquerda = [...borne(0.27, 0.285, "-x"), ...borne(0.27, 0.355, "-x")];
  borne(0.62, 0.29, "+x");
  borne(0.62, 0.36, "+x");
  const alimentacao = borne(0.6, 0.585, "+z");

  // optoacopladores (DIP-4) com o resistor de cada um e os jumpers
  for (const v of [0.265, 0.34]) {
    p.bloco(raiz, [0.0065, 0.0035, 0.0046], preto, [px(0.385), Y_PLACA + 0.0021, pz(v)]);
    for (const s of [-1, 1]) for (const t of [-1, 1]) p.bloco(raiz, [0.0006, 0.0012, 0.0012], metal, [px(0.385) + s * 0.00127, Y_PLACA + 0.0006, pz(v) + t * 0.0026]);
    p.cilindro(raiz, 0.0022, 0.0062, bege, [px(0.385), Y_PLACA + 0.0013, pz(v - 0.035)], "x", 12);
  }
  for (const u of [0.462, 0.478]) p.cilindro(raiz, 0.0007, 0.009, metal, [px(u), Y_PLACA + 0.0004, pz(0.305)], "z", 6);

  // ESP32-C3 Super Mini (USB-C para +X)
  const yEsp = Y_PLACA + 0.0026;
  p.bloco(raiz, [0.0225, 0.0012, 0.018], preto, [px(0.505), yEsp, pz(0.435)]);
  for (const s of [-1, 1]) p.bloco(raiz, [0.0203, 0.0022, 0.0025], preto, [px(0.505), Y_PLACA + 0.0011, pz(0.435) + s * 0.0075]);
  p.adesivo(raiz, "caixaMonitoramento_esp32", [0.018, 0.0225], [px(0.505), yEsp + 0.00061, pz(0.435)], desenharEsp32);
  p.bloco(raiz, [0.0074, 0.0032, 0.009], metal, [px(0.505) + 0.0225 / 2 - 0.0027, yEsp + 0.0022, pz(0.435)]);
  for (const s of [-1, 1]) p.bloco(raiz, [0.0034, 0.0014, 0.0024], branco, [px(0.505) + 0.0045, yEsp + 0.0013, pz(0.435) + s * 0.005]);

  // MPU-6050 (GY-521), sobre a barra de pinos na borda +X; passa da borda da placa
  const yMpu = MPU.y;
  p.bloco(raiz, [0.016, 0.0016, 0.021], azul, [px(MPU.u), yMpu, pz(MPU.v)]);
  p.bloco(raiz, [0.0025, yMpu - Y_PLACA, 0.0203], preto, [px(MPU.u) + 0.0065, Y_PLACA + (yMpu - Y_PLACA) / 2, pz(MPU.v)]);
  p.adesivo(raiz, "caixaMonitoramento_mpu6050", [0.021, 0.016], [px(MPU.u), yMpu + 0.00081, pz(MPU.v)], desenharMpu6050);

  // HW-550 (MAX6675) com o borne grande do termopar na ponta +Z
  const yHw = Y_PLACA + 0.0062;
  p.bloco(raiz, [0.0158, 0.0016, 0.0245], azul, [px(0.45), yHw, pz(0.555)]);
  p.bloco(raiz, [0.0128, yHw - Y_PLACA, 0.0025], preto, [px(0.45), Y_PLACA + (yHw - Y_PLACA) / 2, pz(0.555) - 0.0095]);
  p.adesivo(raiz, "caixaMonitoramento_hw550", [0.0245, 0.0158], [px(0.45), yHw + 0.00081, pz(0.555)], desenharHw550);
  borne(0.45, 0.665, "+z", { passo: 0.0065, altura: 0.012, y0: yHw + 0.0008 });

  // resistores e capacitor eletrolítico ao lado do HW-550
  for (const u of [0.565, 0.6, 0.635]) p.cilindro(raiz, 0.0022, 0.0062, bege, [px(u), Y_PLACA + 0.0013, pz(0.49)], "z", 12);
  p.cilindro(raiz, 0.0052, 0.0085, preto, [px(0.665), Y_PLACA + 0.0028, pz(0.5)], "z", 16);

  // cabos que entram pelo furo da parede -Z: dois brancos (sensores) e um preto (alimentação)
  const yFuro = 0.03;
  // do prensa-cabo no tampo do cabeçote (atrás da caixa) sobe até o furo e entra
  const entrada = (x) => [[x, -0.006, Z_PRENSA_CABO], [x, 0.007, Z_PRENSA_CABO + 0.001], [x, yFuro, -L / 2 - 0.004], [x, yFuro, -L / 2 + 0.006]];
  // fios coloridos da ponta do cabo até a entrada de cada borne (chegando de frente, 4 mm antes)
  const condutores = (de, ate, sentido) =>
    ate.forEach((pt, i) => {
      const frente = pt.map((c, j) => c + SENTIDOS[sentido][j] * 0.004);
      p.cabo(raiz, [de, [(de[0] + frente[0]) / 2, de[1] + 0.002, (de[2] + frente[2]) / 2], frente, pt], 0.0007, cores[i % cores.length]);
    });

  const fimA = [px(0.43), Y_PLACA + 0.004, pz(0.12)];
  p.cabo(raiz, [...entrada(px(0.38)), [px(0.4), 0.014, pz(0.07)], fimA], 0.0023, caboBranco);
  condutores(fimA, topo, "-z");

  const fimB = [px(0.13), Y_PLACA + 0.005, pz(0.31)];
  p.cabo(raiz, [...entrada(px(0.41)), [px(0.24), 0.02, pz(0.09)], [px(0.1), 0.012, pz(0.2)], fimB], 0.0023, caboBranco);
  condutores(fimB, esquerda, "-x");

  const fimC = [px(0.66), Y_PLACA + 0.004, pz(0.64)];
  p.cabo(raiz, [...entrada(px(0.44)), [px(0.62), 0.022, pz(0.1)], [px(0.75), 0.012, pz(0.24)], [px(0.76), Y_PLACA + 0.004, pz(0.5)], fimC], 0.0019, caboPreto);
  condutores(fimC, alimentacao, "+z");

  // abraçadeira prendendo os três cabos logo depois da parede
  p.bloco(raiz, [0.0125, 0.0058, 0.0022], caboPreto, [px(0.41), yFuro, -L / 2 + E + 0.003]);
}

/** Tampa com LCD, filha da dobradiça (borda +X do topo). Devolve o LCD. */
function montarTampa(p, dobradica) {
  const prata = p.material("#b7bbc0", { metal: 0.35, rugosidade: 0.45 }); // PLA "silk" prateado
  const preto = p.material("#141619", { rugosidade: 0.4 });
  const metal = p.material("#cfd3d8", { metal: 1, rugosidade: 0.3 });
  const verdePcb = p.material("#1e7a3c", { rugosidade: 0.45 });
  const azul = p.material("#2058c9", { rugosidade: 0.4 });
  const xCentro = -W / 2; // a dobradiça fica na borda +X da tampa
  const xLcd = -0.0275; // centro da janela do LCD: 27,5 mm da borda +X

  p.bloco(dobradica, [W, T, L], prata, [xCentro, T / 2, 0]);
  p.adesivo(dobradica, "caixaMonitoramento_tampa", [L, W], [xCentro, T + 0.00012, 0], desenharTampa, { metal: 0.35, rugosidade: 0.45 });
  for (const sx of [-0.0058, -(W - 0.0058)]) {
    for (const sz of [-1, 1]) p.cilindro(dobradica, 0.0056, 0.0009, metal, [sx, T + 0.00045, sz * (L / 2 - 0.0058)]);
  }
  // LCD: moldura preta saliente e o vidro com a imagem
  p.bloco(dobradica, [0.025, 0.0014, 0.0715], preto, [xLcd, T + 0.0007, 0]);
  const tela = p.adesivo(dobradica, "caixaMonitoramento_lcd", [0.0645, 0.0165], [xLcd, T + 0.00145, 0], () => {}, { brilho: true });

  // lado de dentro: corpo do LCD, placa verde, módulo I²C com o trimpot e a barra de 4 pinos do cabo
  p.bloco(dobradica, [0.0245, 0.0062, 0.0712], preto, [xLcd, -0.0031, 0]);
  p.bloco(dobradica, [0.036, 0.0016, 0.08], verdePcb, [xLcd, -0.007, 0]);
  p.bloco(dobradica, [0.019, 0.0016, 0.042], preto, [xLcd + 0.0062, -0.0118, -0.012]);
  p.bloco(dobradica, [0.0026, 0.0032, 0.04], preto, [xLcd + 0.0158, -0.0094, -0.012]);
  p.bloco(dobradica, [0.0066, 0.0045, 0.0066], azul, [xLcd + 0.0062, -0.0148, 0.0035]);
  p.bloco(dobradica, [0.0105, 0.0026, 0.0026], preto, [xLcd + 0.0062, -0.0139, -0.0315]);

  return {
    escrever(linhas) {
      const chave = linhas.join("\n");
      if (chave === tela.ultimo) return;
      tela.ultimo = chave;
      const { ctx, w, h } = tela;
      ctx.save();
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
      desenharLcd(ctx, w, h, linhas);
      ctx.restore();
      tela.tex.update();
    },
  };
}

/**
 * Cabo de 4 vias (marrom, vermelho, laranja, amarelo) do borne +X da placa até a barra de pinos do módulo
 * I²C na tampa. É refeito quando a tampa gira, para continuar preso nas duas pontas.
 */
function criarCaboLcd(scene, raiz, p) {
  const cores = ["#6d4022", "#c62828", "#ef7d1a", "#f2c51c"];
  const PASSO = 0.00508;
  const xBorne = px(0.62) + 0.0038 + 0.0003;
  const inicio = [pz(0.29) - PASSO / 2, pz(0.29) + PASSO / 2, pz(0.36) - PASSO / 2, pz(0.36) + PASSO / 2].map(
    (z) => new Vector3(xBorne, Y_PLACA + 0.003, z),
  );
  // pinos da barra no módulo I²C (coordenadas da dobradiça, com a tampa fechada)
  const pinosBarra = [0, 1, 2, 3].map((i) => new Vector3(-0.0275 + 0.0062 + (i - 1.5) * 0.00254, -0.0152, -0.0315));
  const dobradica = new Vector3(W / 2, H, 0);
  const fios = cores.map((hex, i) => {
    const fio = MeshBuilder.CreateTube(
      "caixaMonitoramento_fioLcd",
      { path: caminho(i, 0), radius: 0.00065, tessellation: 8, updatable: true },
      scene,
    );
    fio.material = p.material(hex, { rugosidade: 0.5 });
    fio.parent = raiz;
    return fio;
  });

  function caminho(i, angulo) {
    const giro = Matrix.RotationZ(angulo);
    const fim = Vector3.TransformCoordinates(pinosBarra[i], giro).addInPlace(dobradica);
    const baixo = Vector3.TransformNormal(new Vector3(0, -1, 0), giro); // sai do pino para longe da tampa
    const a = inicio[i];
    return Curve3.CreateCubicBezier(
      a,
      a.add(new Vector3(0.012, 0.03, 0)),
      fim.add(baixo.scale(0.03)),
      fim,
      18,
    ).getPoints();
  }

  return {
    atualizar(angulo) {
      fios.forEach((fio, i) => MeshBuilder.CreateTube(fio.name, { path: caminho(i, angulo), instance: fio }));
    },
  };
}

/**
 * Etiqueta "Sensor de vibração" com o valor e o estado da medição, ligada por uma linha a um LED sobre o
 * MPU-6050. Fica no grupo de desenho 3, por cima da caixa aberta (grupo 2), e sempre de frente para a câmera.
 */
function criarChamadaVibracao(scene, raiz) {
  const no = new TransformNode("caixaMonitoramento_chamada", scene);
  no.parent = raiz;
  no.setEnabled(false);
  const g = GRANDEZA_POR_ID.vibracao;
  const largura = 0.075;
  const ponta = new Vector3(px(MPU.u), MPU.y + 0.002, pz(MPU.v));

  // o billboard não gira a própria posição com o pai: ela vem de uma âncora (abaixo da caixa na tela, onde
  // o X da caixa aponta para cima) e a etiqueta fica na origem dela
  const ancora = new TransformNode("caixaMonitoramento_ancoraEtiqueta", scene);
  ancora.parent = no;
  ancora.position.set(-W / 2 - 0.024, H, 0.03);
  const etiqueta = MeshBuilder.CreatePlane("caixaMonitoramento_etiquetaVibracao", { width: largura, height: (largura * 120) / 320 }, scene);
  etiqueta.billboardMode = Mesh.BILLBOARDMODE_ALL;
  const tex = new DynamicTexture("tex_caixaMonitoramento_etiquetaVibracao", { width: 320, height: 120 }, scene, true);
  tex.hasAlpha = true;
  const matEtiqueta = new StandardMaterial("mat_caixaMonitoramento_etiquetaVibracao", scene);
  matEtiqueta.diffuseTexture = tex;
  matEtiqueta.emissiveTexture = tex;
  matEtiqueta.useAlphaFromDiffuseTexture = true;
  matEtiqueta.disableLighting = true;
  matEtiqueta.backFaceCulling = false;
  etiqueta.material = matEtiqueta;

  const matLed = new StandardMaterial("mat_caixaMonitoramento_ledVibracao", scene);
  matLed.disableLighting = true;
  const led = MeshBuilder.CreateSphere("caixaMonitoramento_ledVibracao", { diameter: 0.004, segments: 8 }, scene);
  led.material = matLed;
  led.position.copyFrom(ponta);
  // do centro da etiqueta (ela cobre o pedaço de dentro) até o LED
  const linha = MeshBuilder.CreateLines("caixaMonitoramento_linhaVibracao", { points: [ancora.position.clone(), ponta] }, scene);
  linha.color = new Color3(0.85, 0.9, 0.95);
  for (const m of [linha, led, etiqueta]) {
    m.parent = m === etiqueta ? ancora : no;
    m.renderingGroupId = 3;
    m.isPickable = false;
  }

  let anterior = "";
  return {
    raiz: no,
    atualizar(estado, tv) {
      const chave = `${estado.id}|${tv.valor}|${tv.unidade}`;
      if (chave === anterior) return;
      anterior = chave;
      matLed.emissiveColor = Color3.FromHexString(estado.cor);
      desenharEtiqueta(tex.getContext(), g, estado, tv);
      tex.update();
    },
  };
}

/** Junta as peças de mesmo material do mesmo nó (menos chamadas de desenho, importante no headset). */
function mesclarPorMaterial(no) {
  const grupos = new Map();
  for (const m of no.getChildMeshes(true)) {
    if (m.unicoNaMescla) continue;
    if (!grupos.has(m.material)) grupos.set(m.material, []);
    grupos.get(m.material).push(m);
  }
  for (const lista of grupos.values()) {
    if (lista.length < 2) continue;
    const mesclada = Mesh.MergeMeshes(lista, true, true);
    if (!mesclada) continue;
    mesclada.name = `caixaMonitoramento__${lista[0].material.name}`;
    mesclada.setParent(no);
  }
}

// ---------- desenhos (topo do canvas = +X, direita = +Z)

function ruido(ctx, w, h, n, cores) {
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = cores[i % cores.length];
    ctx.fillRect(Math.random() * w, Math.random() * h, 1.6, 1.6);
  }
}

/** Tampa prateada impressa em 3D, com os dizeres em baixo-relevo (como na foto). */
function desenharTampa(ctx, w, h) {
  const mm = h / (W * 1000);
  ctx.fillStyle = "#b3b7bc";
  ctx.fillRect(0, 0, w, h);
  // linhas de impressão em diagonal e o brilho do filamento "silk"
  ctx.strokeStyle = "rgba(255,255,255,0.07)";
  ctx.lineWidth = 1;
  for (let d = -h; d < w; d += 3) {
    ctx.beginPath();
    ctx.moveTo(d, h);
    ctx.lineTo(d + h, 0);
    ctx.stroke();
  }
  ruido(ctx, w, h, 5000, ["rgba(255,255,255,0.55)", "rgba(90,95,102,0.35)", "rgba(255,255,255,0.3)"]);

  const gravar = (texto, yMm, larguraFracao, alturaMaxMm) => {
    let tamanho = alturaMaxMm * mm * 1.38;
    ctx.font = `900 ${tamanho}px "Arial Black", "Segoe UI Black", Arial, sans-serif`;
    const largura = ctx.measureText(texto).width;
    tamanho = Math.min(tamanho, (tamanho * larguraFracao * w) / largura);
    ctx.font = `900 ${tamanho}px "Arial Black", "Segoe UI Black", Arial, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const y = yMm * mm;
    // baixo-relevo: sombra na borda de cima, luz na de baixo
    ctx.fillStyle = "rgba(60,64,70,0.75)";
    ctx.fillText(texto, w / 2 - 1, y - 1.5);
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.fillText(texto, w / 2 + 1, y + 1.5);
    ctx.fillStyle = "#8f949a";
    ctx.fillText(texto, w / 2, y);
  };
  gravar("SENAI SÃO CARLOS", 8, 0.66, 7);
  gravar("SISTEMA DE", 50, 0.44, 7.5);
  gravar("MONITORAMENTO", 62, 0.82, 8.5);
}

/** LCD 16×2 com luz de fundo azul e caracteres em matriz de pontos 5×8. */
function desenharLcd(ctx, w, h, linhas) {
  ctx.fillStyle = "#1d3fe0";
  ctx.fillRect(0, 0, w, h);
  const margemX = w * 0.035;
  const margemY = h * 0.12;
  const cw = (w - 2 * margemX) / 16;
  const ch = (h - 2 * margemY) / 2;
  const dx = cw / 6; // 5 pontos + espaço
  const dy = (ch * 0.92) / 8;
  ctx.font = `700 ${ch * 0.92}px Consolas, "Courier New", monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (let l = 0; l < 2; l++) {
    const texto = (linhas[l] ?? "").padEnd(16).slice(0, 16);
    for (let c = 0; c < 16; c++) {
      const x0 = margemX + c * cw;
      const y0 = margemY + l * ch;
      ctx.fillStyle = "rgba(120,150,255,0.18)"; // pontos apagados
      ctx.fillRect(x0 + dx * 0.15, y0, dx * 5, dy * 8);
      ctx.fillStyle = "#eef3ff";
      ctx.fillText(texto[c], x0 + dx * 2.65, y0 + dy * 4.2);
    }
  }
  // separa os pontos da matriz
  ctx.fillStyle = "#1d3fe0";
  for (let c = 0; c < 16; c++) {
    for (let i = 0; i <= 5; i++) ctx.fillRect(margemX + c * cw + dx * 0.15 + i * dx - 0.6, 0, 1.2, h);
  }
  for (let l = 0; l < 2; l++) {
    for (let j = 0; j <= 8; j++) ctx.fillRect(0, margemY + l * ch + j * dy - 0.6, w, 1.2);
  }
}

function pinos(ctx, x0, y, n, passo, raio = 2.6) {
  for (let i = 0; i < n; i++) {
    ctx.beginPath();
    ctx.arc(x0 + i * passo, y, raio, 0, 2 * Math.PI);
    ctx.fillStyle = "#d9b75a";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x0 + i * passo, y, raio * 0.45, 0, 2 * Math.PI);
    ctx.fillStyle = "#3a3a3a";
    ctx.fill();
  }
}

function desenharEsp32(ctx, w, h) {
  ctx.fillStyle = "#16181b";
  ctx.fillRect(0, 0, w, h);
  pinos(ctx, w * 0.1, h * 0.08, 8, w * 0.115, 3);
  pinos(ctx, w * 0.1, h * 0.92, 8, w * 0.115, 3);
  ctx.fillStyle = "#2b2e33";
  ctx.fillRect(w * 0.36, h * 0.28, w * 0.26, h * 0.44);
  ctx.fillStyle = "#9aa1aa";
  ctx.font = `600 ${h * 0.09}px Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText("ESP32-C3", w * 0.49, h * 0.52);
  ctx.fillStyle = "#3b3f46"; // antena cerâmica
  ctx.fillRect(w * 0.04, h * 0.3, w * 0.1, h * 0.4);
  ctx.fillStyle = "#e23b2e"; // LED
  ctx.fillRect(w * 0.3, h * 0.2, w * 0.05, h * 0.06);
  ctx.fillStyle = "#c9ccd1";
  ctx.font = `700 ${h * 0.11}px Arial, sans-serif`;
  ctx.fillText("C3", w * 0.2, h * 0.2);
}

function desenharMpu6050(ctx, w, h) {
  ctx.fillStyle = "#1f56b8";
  ctx.fillRect(0, 0, w, h);
  // pinos na borda +X (topo do desenho)
  pinos(ctx, w * 0.08, h * 0.1, 8, w * 0.12, 3.4);
  ctx.fillStyle = "#eef3ff";
  ctx.font = `600 ${h * 0.075}px Arial, sans-serif`;
  ctx.textAlign = "center";
  ["VCC", "GND", "SCL", "SDA", "XDA", "XCL", "AD0", "INT"].forEach((t, i) => ctx.fillText(t, w * 0.08 + i * w * 0.12, h * 0.25));
  ctx.fillStyle = "#121417";
  ctx.fillRect(w * 0.44, h * 0.42, w * 0.17, h * 0.22);
  ctx.fillStyle = "#e0a32a"; // capacitor amarelo
  ctx.fillRect(w * 0.18, h * 0.5, w * 0.08, h * 0.12);
  ctx.fillStyle = "#eef3ff";
  ctx.font = `700 ${h * 0.12}px Arial, sans-serif`;
  ctx.fillText("MPU-6050", w * 0.5, h * 0.84);
  ctx.strokeStyle = "#eef3ff";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(w * 0.08, h * 0.88, h * 0.06, 0, 2 * Math.PI);
  ctx.arc(w * 0.92, h * 0.88, h * 0.06, 0, 2 * Math.PI);
  ctx.stroke();
}

function desenharHw550(ctx, w, h) {
  ctx.fillStyle = "#1f56b8";
  ctx.fillRect(0, 0, w, h);
  // pinos na ponta -Z (esquerda do desenho)
  for (let i = 0; i < 5; i++) pinos(ctx, w * 0.07, h * 0.14 + i * h * 0.18, 1, 0, 3.4);
  ctx.fillStyle = "#eef3ff";
  ctx.font = `600 ${h * 0.09}px Arial, sans-serif`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ["SO", "CS", "SCK", "VCC", "GND"].forEach((t, i) => ctx.fillText(t, w * 0.13, h * 0.14 + i * h * 0.18));
  ctx.fillStyle = "#121417"; // MAX6675 (SOIC-8)
  ctx.fillRect(w * 0.42, h * 0.32, w * 0.2, h * 0.36);
  ctx.fillStyle = "#9aa1aa";
  for (let i = 0; i < 4; i++) {
    ctx.fillRect(w * 0.44 + i * w * 0.045, h * 0.27, w * 0.02, h * 0.05);
    ctx.fillRect(w * 0.44 + i * w * 0.045, h * 0.68, w * 0.02, h * 0.05);
  }
  ctx.fillStyle = "#eef3ff";
  ctx.font = `700 ${h * 0.13}px Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText("HW-550", w * 0.52, h * 0.88);
  ctx.fillText("+  −", w * 0.86, h * 0.5);
}
