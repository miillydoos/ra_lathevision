import { Camera, UniversalCamera, Vector3 } from "@babylonjs/core";
import { svgIcone } from "../util/icones.js";

/**
 * Andar pelo laboratório em primeira pessoa (computador e celular), com os olhos a 1,65 m.
 * - Computador: WASD ou setas para andar (Shift corre), arrastar o mouse para olhar, Esc sai.
 * - Celular: arrastar para cima/baixo anda, para os lados vira.
 * Colisão simples: paredes da sala, vidro do escritório, torno, máquinas e móveis, para não atravessar nada.
 * Só a câmera muda: o torno, os sensores, os balões e os dados continuam os mesmos.
 */
const ALTURA_OLHOS = 1.65;

// Áreas bloqueadas no piso [x0, x1, z0, z1] (m).
// No referencial do torno (o do mundo): o Tormax 30 com a faixa de operação, o segundo Tormax 30 e os Centur.
const OBSTACULOS_MUNDO = [
  [-1.85, 1.9, -0.9, 0.9], // torno ROMI T 350
  [-1.9, 1.95, -2.75, -1.45], // segundo Tormax 30 (só o modelo)
  [-1.65, 1.65, 2.1, 3.9], // Centur 30D nº 1
  [-1.65, 1.65, 4.7, 6.55], // Centur 30D nº 2
];
// No referencial da sala (girado −90° em torno do torno: x_sala = z_mundo, z_sala = −x_mundo); ver sala.js.
const OBSTACULOS_SALA = [
  [2.2, 6.9, -6.9, -4.1], // centro de usinagem D 800 e transportador
  [2.55, 3.45, -2.95, -2.05], // carrinho de ferramentas
  [-4.3, -0.8, -4.15, -3.05], // bancadas de ajustagem
  [-6.95, -5.6, -5.2, -3.75], // furadeira de coluna e tapete
  [1.25, 1.75, -5.5, -4.3], // banner de chão
];
// retângulo da sala → mundo: x = −z_sala, z = x_sala
const OBSTACULOS = [...OBSTACULOS_MUNDO, ...OBSTACULOS_SALA.map(([x0, x1, z0, z1]) => [-z1, -z0, x0, x1])];

/** Mantém (x, z) dentro da sala e fora das máquinas. Só mexe em x e z. */
export function ajustarXZ(p, { limite = 7, escritorioZ = 4.9 } = {}) {
  // a sala está girada: o vidro do escritório fica em −X e a bancada do fundo em +X
  p.x = Math.max(-(escritorioZ - 0.15), Math.min(limite - 0.9, p.x));
  p.z = Math.max(-limite + 0.5, Math.min(limite - 0.5, p.z));
  for (const [x0, x1, z0, z1] of OBSTACULOS) {
    if (p.x <= x0 || p.x >= x1 || p.z <= z0 || p.z >= z1) continue;
    // empurra para fora pela borda mais próxima
    const saidas = [
      [p.x - x0, () => (p.x = x0)],
      [x1 - p.x, () => (p.x = x1)],
      [p.z - z0, () => (p.z = z0)],
      [z1 - p.z, () => (p.z = z1)],
    ];
    saidas.sort((a, b) => a[0] - b[0])[0][1]();
  }
}

export function criarAndar(scene, cameraOrbital, canvas, { limite = 7, posicaoInicial = [-0.3, 1.45], aoMudar } = {}) {
  const camera = new UniversalCamera("cameraAndar", new Vector3(posicaoInicial[0], ALTURA_OLHOS, posicaoInicial[1]), scene);
  camera.minZ = 0.05;
  camera.maxZ = 120;
  camera.speed = 0.07;
  camera.angularSensibility = 2200;
  camera.inertia = 0.8;
  camera.keysUp = [87, 38]; // W, ↑
  camera.keysDown = [83, 40]; // S, ↓
  camera.keysLeft = [65, 37]; // A, ←
  camera.keysRight = [68, 39]; // D, →
  camera.touchAngularSensibility = 9000;
  camera.touchMoveSensibility = 450;

  const toque = matchMedia("(pointer: coarse)").matches;
  const dica = document.createElement("div");
  dica.className = "dica-andar painel";
  dica.hidden = true;
  dica.innerHTML = `
    <span class="dica-andar-icone" aria-hidden="true">${svgIcone("andar", { tamanho: 18 })}</span>
    <span class="dica-andar-texto">${
      toque ? "Arraste para cima ou para baixo para andar e para os lados para virar" : "WASD ou setas: andar · Shift: correr · arraste: olhar · Esc: sair"
    }</span>
    <button type="button" class="botao primario">Sair</button>`;
  dica.querySelector("button").addEventListener("click", () => sair());
  document.body.appendChild(dica);

  // em tela retrato o campo de visão horizontal fica fixo (senão o corredor vira um túnel estreito)
  const ajustarCampo = () => {
    const retrato = scene.getEngine().getAspectRatio(camera) < 1;
    camera.fovMode = retrato ? Camera.FOVMODE_HORIZONTAL_FIXED : Camera.FOVMODE_VERTICAL_FIXED;
    camera.fov = retrato ? 1.4 : 1.05;
  };

  let ativo = false;
  let shift = false;
  scene.onBeforeRenderObservable.add(() => {
    if (!ativo) return;
    camera.speed = (shift ? 0.14 : 0.07) * (scene.getEngine().getDeltaTime() / 16.7);
    camera.position.y = ALTURA_OLHOS;
    ajustarXZ(camera.position, { limite });
    ajustarCampo();
  });
  window.addEventListener("keydown", (e) => {
    if (e.key === "Shift") shift = true;
    if (e.key === "Escape" && ativo) sair();
  });
  window.addEventListener("keyup", (e) => {
    if (e.key === "Shift") shift = false;
  });

  function entrar() {
    if (ativo) return;
    ativo = true;
    // começa na posição do operador, olhando para o barramento
    camera.position.set(posicaoInicial[0], ALTURA_OLHOS, posicaoInicial[1]);
    camera.setTarget(new Vector3(posicaoInicial[0], 1.2, 0));
    cameraOrbital.detachControl();
    scene.activeCamera = camera;
    camera.attachControl(canvas, true);
    canvas.focus?.();
    dica.hidden = false;
    document.body.classList.add("andando");
    aoMudar?.(true);
  }
  function sair() {
    if (!ativo) return;
    ativo = false;
    camera.detachControl();
    scene.activeCamera = cameraOrbital;
    cameraOrbital.attachControl(canvas, true);
    dica.hidden = true;
    document.body.classList.remove("andando");
    aoMudar?.(false);
  }

  return {
    camera,
    get ativo() {
      return ativo;
    },
    entrar,
    sair,
    alternar: () => (ativo ? sair() : entrar()),
  };
}
