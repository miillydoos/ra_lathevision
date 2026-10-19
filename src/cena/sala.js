import { Color3, DynamicTexture, Mesh, MeshBuilder, StandardMaterial, TransformNode } from "@babylonjs/core";
import { ICONES } from "../util/icones.js";

/**
 * Laboratório de usinagem ao redor do torno (ambiente 360°): paredes com faixa institucional,
 * teto com vigas e luminárias, janelas, bancada, painel de ferramentas, estante, quadro branco,
 * sinalização de segurança e outras máquinas da oficina.
 *
 * - Só cenário: nada é clicável e o torno.glb não muda.
 * - Não cria luzes nem recebe o sol da cena; usa a luz ambiente e um brilho próprio,
 *   assim a aparência do torno continua a mesma.
 * - Tudo procedural (sem arquivos externos) e mesclado por material: poucas chamadas de desenho,
 *   o que importa no headset.
 * - Vista de "maquete": com a câmera fora da sala, os móveis da parede entre a câmera e o torno
 *   somem (as paredes já não aparecem por trás).
 *
 * Coordenadas como no torno.glb: X ao longo do barramento, Y para cima, operador em +Z.
 */
export function criarSala(scene, { tamanho = 14, altura = 5, luzesExcluidas = [] } = {}) {
  const h = tamanho / 2;
  const raiz = new TransformNode("sala", scene);
  const pecas = []; // { grupo, malha }
  const materiais = new Map();

  // ---------- materiais
  // Superfície comum: cor + brilho próprio (a sala fica clara por igual sem luzes extras).
  function mat(hex, brilho = 0.42) {
    const chave = `${hex}|${brilho}`;
    if (!materiais.has(chave)) {
      const m = new StandardMaterial(`sala_${hex}`, scene);
      const cor = Color3.FromHexString(hex);
      m.diffuseColor = cor;
      m.emissiveColor = cor.scale(brilho);
      m.specularColor = Color3.Black();
      materiais.set(chave, m);
    }
    return materiais.get(chave);
  }
  // Superfície que emite luz (luminárias): cor fixa, sem sombreamento.
  function emissor(hex) {
    const chave = `emissor|${hex}`;
    if (!materiais.has(chave)) {
      const m = new StandardMaterial(`sala_emissor_${hex}`, scene);
      m.disableLighting = true;
      m.emissiveColor = Color3.FromHexString(hex);
      materiais.set(chave, m);
    }
    return materiais.get(chave);
  }
  // Imagem desenhada em canvas (faixa, quadro, placas): sem sombreamento.
  function textura(nome, largura, alturaPx, desenhar, brilho = 0.9) {
    const tex = new DynamicTexture(`sala_tex_${nome}`, { width: largura, height: alturaPx }, scene, true);
    const ctx = tex.getContext();
    // na cena destra a face visível do plano mostra a imagem espelhada: desenha invertido na horizontal
    ctx.save();
    ctx.translate(largura, 0);
    ctx.scale(-1, 1);
    desenhar(ctx, largura, alturaPx);
    ctx.restore();
    tex.update();
    const m = new StandardMaterial(`sala_${nome}`, scene);
    m.diffuseTexture = tex;
    m.disableLighting = true; // sem luzes, a cor final é emissiva × textura
    m.emissiveColor = new Color3(brilho, brilho, brilho);
    m.specularColor = Color3.Black();
    return m;
  }

  // ---------- peças
  const add = (grupo, malha, material) => {
    malha.material = material;
    pecas.push({ grupo, malha });
    return malha;
  };
  const caixa = (grupo, material, largura, alt, prof) =>
    add(grupo, MeshBuilder.CreateBox("sala", { width: largura, height: alt, depth: prof }, scene), material);
  const plano = (grupo, material, largura, alt) =>
    add(grupo, MeshBuilder.CreatePlane("sala", { width: largura, height: alt }, scene), material);
  const cilindro = (grupo, material, diametro, alt, lados = 20) =>
    add(grupo, MeshBuilder.CreateCylinder("sala", { diameter: diametro, height: alt, tessellation: lados }, scene), material);
  const faixaPiso = (material, largura, prof, x, z) => {
    const m = add("piso", MeshBuilder.CreateGround("sala", { width: largura, height: prof }, scene), material);
    m.position.set(x, 0.003, z);
    return m;
  };

  // Encosta uma peça numa parede, voltada para dentro da sala.
  // `u` é a coordenada ao longo da parede (X no fundo e na frente, Z nas laterais); `d` é o afastamento.
  // (cena destra: o plano sem rotação fica visível de -Z)
  const ROTACAO = { fundo: Math.PI, frente: 0, esquerda: -Math.PI / 2, direita: Math.PI / 2 };
  function naParede(malha, lado, u, y, d = 0.01) {
    if (lado === "fundo") malha.position.set(u, y, -h + d);
    else if (lado === "frente") malha.position.set(u, y, h - d);
    else if (lado === "esquerda") malha.position.set(-h + d, y, u);
    else malha.position.set(h - d, y, u);
    malha.rotation.y = ROTACAO[lado];
    return malha;
  }

  // ---------- paredes: parte clara, faixa azul até 1,2 m e friso vermelho
  for (const lado of Object.keys(ROTACAO)) {
    naParede(plano(lado, mat("#dde2e7", 0.45), tamanho, altura), lado, 0, altura / 2, 0);
    naParede(plano(lado, mat("#0d3b85"), tamanho, 1.2), lado, 0, 0.6, 0.01);
    naParede(plano(lado, mat("#d71920"), tamanho, 0.08), lado, 0, 1.24, 0.012);
  }

  // ---------- teto, vigas e luminárias lineares penduradas
  const teto = plano("teto", mat("#30353c", 0.5), tamanho, tamanho);
  teto.rotation.x = -Math.PI / 2;
  teto.position.y = altura;
  const linhas = [-4.5, -1.5, 1.5, 4.5];
  const yViga = altura - 0.32;
  const yLuminaria = 4.3;
  for (const z of linhas) {
    caixa("teto", mat("#6b7480"), tamanho, 0.32, 0.18).position.set(0, altura - 0.16, z);
    for (const x of [-3.5, 0, 3.5]) {
      caixa("teto", mat("#9aa3ad"), 1.56, 0.06, 0.26).position.set(x, yLuminaria + 0.03, z);
      caixa("teto", emissor("#f4f8ff"), 1.5, 0.02, 0.2).position.set(x, yLuminaria - 0.005, z);
      for (const dx of [-0.6, 0.6]) {
        cilindro("teto", mat("#2b2f35"), 0.012, yViga - yLuminaria - 0.06, 6).position.set(x + dx, (yViga + yLuminaria + 0.06) / 2, z);
      }
    }
  }

  // ---------- parede direita: janelas altas
  const vidro = textura("janela", 128, 128, desenharVidro, 1);
  const caixilho = mat("#59626d");
  for (const z of linhas) {
    const y = 3.25;
    naParede(plano("direita", vidro, 2.2, 1.3), "direita", z, y, 0.015);
    naParede(caixa("direita", caixilho, 2.34, 0.07, 0.06), "direita", z, y + 0.685, 0.03);
    naParede(caixa("direita", caixilho, 2.34, 0.07, 0.06), "direita", z, y - 0.685, 0.03);
    for (const du of [-1.135, 0, 1.135]) naParede(caixa("direita", caixilho, 0.07, 1.3, 0.06), "direita", z + du, y, 0.03);
  }
  // armário de inflamáveis (óleos e fluido de corte)
  naParede(caixa("direita", mat("#f2c12e"), 0.95, 1.8, 0.5), "direita", 3.2, 0.9, 0.25);
  naParede(caixa("direita", mat("#2b2f35"), 0.012, 1.6, 0.01), "direita", 3.2, 0.92, 0.505);
  naParede(plano("direita", textura("inflamavel", 256, 128, desenharInflamavel), 0.5, 0.25), "direita", 3.2, 1.45, 0.512);

  // ---------- fundo: faixa institucional, bancada com painel de ferramentas, estante, quadro elétrico e extintor
  naParede(plano("fundo", textura("faixa", 1024, 256, desenharFaixa), 4.4, 1.1), "fundo", 0, 3.55, 0.02);

  const xBancada = -4;
  naParede(caixa("fundo", mat("#6f7b88"), 2.3, 0.82, 0.66), "fundo", xBancada, 0.47, 0.37);
  naParede(caixa("fundo", mat("#3a4048"), 2.2, 0.06, 0.6), "fundo", xBancada, 0.03, 0.37);
  naParede(caixa("fundo", mat("#a07a4f"), 2.4, 0.05, 0.75), "fundo", xBancada, 0.905, 0.38);
  for (const dx of [-0.75, 0, 0.75]) naParede(caixa("fundo", mat("#3a4048"), 0.5, 0.012, 0.01), "fundo", xBancada + dx, 0.72, 0.705);
  naParede(caixa("fundo", mat("#2f3640"), 0.2, 0.14, 0.3), "fundo", xBancada + 0.75, 1.0, 0.4); // morsa
  naParede(caixa("fundo", mat("#2f3640"), 0.22, 0.05, 0.08), "fundo", xBancada + 0.75, 1.095, 0.5);
  naParede(caixa("fundo", mat("#c92a2a"), 0.46, 0.2, 0.26), "fundo", xBancada - 0.65, 1.03, 0.3); // caixa de ferramentas
  naParede(plano("fundo", textura("ferramentas", 512, 256, desenharPainelFerramentas), 2.4, 1.2), "fundo", xBancada, 1.75, 0.02);

  const xEstante = 4.3;
  const estrutura = mat("#4f5864");
  for (const dx of [-0.9, 0.9]) for (const dz of [0.06, 0.52]) naParede(caixa("fundo", estrutura, 0.05, 2.2, 0.05), "fundo", xEstante + dx, 1.1, dz);
  const caixas = ["#1c7ed6", "#f2c12e", "#d71920", "#2f9e44"];
  for (const [n, y] of [0.15, 0.78, 1.41, 2.04].entries()) {
    naParede(caixa("fundo", estrutura, 1.85, 0.03, 0.5), "fundo", xEstante, y, 0.29);
    if (n === 3) continue;
    for (let i = 0; i < 4; i++) {
      naParede(caixa("fundo", mat(caixas[(i + n) % 4]), 0.38, 0.24, 0.4), "fundo", xEstante - 0.66 + i * 0.44, y + 0.135, 0.3);
    }
  }

  naParede(caixa("fundo", mat("#b9c0c8"), 0.8, 1.0, 0.25), "fundo", 1.9, 1.75, 0.125); // quadro elétrico
  naParede(plano("fundo", textura("tensao", 256, 256, desenharTensao), 0.3, 0.3), "fundo", 1.9, 1.85, 0.255);
  naParede(cilindro("fundo", mat("#8d96a0"), 0.05, altura - 2.25, 10), "fundo", 1.9, (altura + 2.25) / 2, 0.08);

  naParede(cilindro("fundo", mat("#d71920"), 0.18, 0.55, 20), "fundo", -1.9, 1.05, 0.12); // extintor
  naParede(cilindro("fundo", mat("#2b2f35"), 0.06, 0.1, 10), "fundo", -1.9, 1.37, 0.12);
  naParede(plano("fundo", textura("extintor", 256, 320, desenharExtintor), 0.36, 0.45), "fundo", -1.9, 1.85, 0.02);

  // ---------- esquerda: quadro branco, sinalização, porta e armário de ferramentas
  naParede(caixa("esquerda", mat("#a9b1ba"), 3.32, 1.52, 0.03), "esquerda", -0.4, 1.85, 0.015);
  naParede(plano("esquerda", textura("quadro", 1024, 448, desenharQuadro, 0.95), 3.2, 1.4), "esquerda", -0.4, 1.85, 0.032);
  naParede(caixa("esquerda", mat("#a9b1ba"), 1.2, 0.03, 0.08), "esquerda", -0.4, 1.13, 0.06);
  naParede(plano("esquerda", textura("oculos", 256, 320, desenharOculos), 0.5, 0.625), "esquerda", 2.6, 1.95, 0.02);

  naParede(caixa("esquerda", mat("#3a4048"), 1.16, 2.24, 0.06), "esquerda", 4.6, 1.12, 0.03); // porta
  naParede(caixa("esquerda", mat("#8a96a3"), 1.0, 2.1, 0.07), "esquerda", 4.6, 1.05, 0.04);
  naParede(caixa("esquerda", mat("#2b2f35"), 0.14, 0.03, 0.05), "esquerda", 4.25, 1.05, 0.09);

  naParede(caixa("esquerda", mat("#c0262d"), 1.2, 1.05, 0.55), "esquerda", -3.6, 0.525, 0.275); // armário de ferramentas
  for (let i = 0; i < 5; i++) naParede(caixa("esquerda", mat("#2b2f35"), 1.0, 0.015, 0.01), "esquerda", -3.6, 0.2 + i * 0.17, 0.555);
  naParede(caixa("esquerda", mat("#8a96a3"), 1.22, 0.04, 0.57), "esquerda", -3.6, 1.07, 0.275);

  // ---------- frente (atrás do operador): portão de acesso e saída de emergência
  naParede(plano("frente", textura("portao", 256, 256, desenharPortao), 3.8, 3.6), "frente", 2.6, 1.8, 0.02);
  for (const du of [-1.95, 1.95]) naParede(caixa("frente", mat("#3a4048"), 0.1, 3.7, 0.08), "frente", 2.6 + du, 1.85, 0.04);
  naParede(caixa("frente", mat("#3a4048"), 4.0, 0.1, 0.08), "frente", 2.6, 3.65, 0.04);
  naParede(caixa("frente", mat("#3a4048"), 1.16, 2.24, 0.06), "frente", -3.8, 1.12, 0.03);
  naParede(caixa("frente", mat("#8a96a3"), 1.0, 2.1, 0.07), "frente", -3.8, 1.05, 0.04);
  naParede(caixa("frente", mat("#2b2f35"), 0.7, 0.04, 0.05), "frente", -3.8, 1.0, 0.09);
  naParede(plano("frente", textura("saida", 512, 192, desenharSaida, 1), 0.8, 0.3), "frente", -3.8, 2.5, 0.02);

  // ---------- outras máquinas da oficina
  // centro de usinagem CNC (fundo, à direita)
  const cnc = { x: 4.6, z: -5.0 }; // fora do círculo da câmera na volta 360°
  caixa("piso", mat("#d9dde2"), 2.2, 2.1, 1.7).position.set(cnc.x, 1.05, cnc.z);
  caixa("piso", mat("#2f3640"), 2.22, 0.25, 1.72).position.set(cnc.x, 0.125, cnc.z);
  caixa("piso", mat("#0d3b85"), 2.22, 0.12, 1.72).position.set(cnc.x, 1.85, cnc.z);
  caixa("piso", mat("#25323f", 0.3), 1.0, 0.85, 0.02).position.set(cnc.x - 0.25, 1.2, cnc.z + 0.86);
  caixa("piso", mat("#2b3038"), 0.45, 0.65, 0.12).position.set(cnc.x + 1.25, 1.35, cnc.z + 0.6);

  // furadeira de coluna (fundo, à esquerda)
  const fur = { x: -5.4, z: -4.4 };
  const verde = mat("#4e6b5c");
  caixa("piso", verde, 0.55, 0.08, 0.45).position.set(fur.x, 0.04, fur.z);
  cilindro("piso", mat("#9aa0a6"), 0.09, 1.75, 16).position.set(fur.x, 0.875, fur.z - 0.12);
  cilindro("piso", verde, 0.38, 0.04, 24).position.set(fur.x, 0.85, fur.z + 0.04);
  caixa("piso", verde, 0.36, 0.38, 0.6).position.set(fur.x, 1.62, fur.z + 0.02);
  cilindro("piso", verde, 0.2, 0.32, 16).position.set(fur.x, 1.97, fur.z - 0.12);
  cilindro("piso", mat("#9aa0a6"), 0.05, 0.2, 12).position.set(fur.x, 1.33, fur.z + 0.18);

  // esmeril de pedestal (lado direito)
  const esm = { x: 5.5, z: 0.6 };
  caixa("piso", mat("#3a4048"), 0.4, 0.04, 0.4).position.set(esm.x, 0.02, esm.z);
  cilindro("piso", verde, 0.14, 0.85, 16).position.set(esm.x, 0.45, esm.z);
  const motor = cilindro("piso", verde, 0.2, 0.32, 20);
  motor.rotation.z = Math.PI / 2;
  motor.position.set(esm.x, 0.97, esm.z);
  for (const dx of [-0.21, 0.21]) {
    const rebolo = cilindro("piso", mat("#9aa0a6"), 0.22, 0.035, 24);
    rebolo.rotation.z = Math.PI / 2;
    rebolo.position.set(esm.x + dx, 0.97, esm.z);
  }

  // faixas de circulação no piso
  const amarelo = mat("#e8b400", 0.35);
  faixaPiso(amarelo, 12, 0.1, 0, -3);
  faixaPiso(amarelo, 12, 0.1, 0, 3);

  // ---------- mescla por grupo e material
  const grupos = new Map();
  for (const { grupo, malha } of pecas) {
    if (!grupos.has(grupo)) grupos.set(grupo, new Map());
    const porMaterial = grupos.get(grupo);
    if (!porMaterial.has(malha.material)) porMaterial.set(malha.material, []);
    porMaterial.get(malha.material).push(malha);
  }
  const malhasPorGrupo = new Map();
  for (const [grupo, porMaterial] of grupos) {
    const lista = [];
    for (const [material, malhas] of porMaterial) {
      const m = malhas.length > 1 ? Mesh.MergeMeshes(malhas, true, true) : malhas[0];
      m.name = `sala_${grupo}_${material.name}`;
      m.parent = raiz;
      m.isPickable = false;
      m.freezeWorldMatrix();
      for (const luz of luzesExcluidas) luz?.excludedMeshes.push(m);
      lista.push(m);
    }
    malhasPorGrupo.set(grupo, { malhas: lista, visivel: true });
  }

  // ---------- vista de maquete: esconde o que fica entre a câmera (fora da sala) e o torno
  const DENTRO = {
    fundo: (p) => p.z > -h,
    frente: (p) => p.z < h,
    esquerda: (p) => p.x > -h,
    direita: (p) => p.x < h,
    teto: (p) => p.y < altura,
    piso: () => true,
  };
  scene.onBeforeRenderObservable.add(() => {
    const cam = scene.activeCamera;
    if (!cam || !raiz.isEnabled()) return;
    const p = cam.globalPosition;
    for (const [grupo, g] of malhasPorGrupo) {
      const visivel = DENTRO[grupo](p);
      if (visivel === g.visivel) continue;
      g.visivel = visivel;
      for (const m of g.malhas) m.setEnabled(visivel);
    }
  });

  return {
    raiz,
    /** Liga/desliga a sala inteira (em RA o ambiente real a substitui). */
    mostrar(visivel) {
      raiz.setEnabled(visivel);
    },
  };
}

// ---------- desenhos (canvas 2D)
const FONTE = "Segoe UI, Roboto, Arial, sans-serif";

function desenharFaixa(ctx, w, h) {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#d71920";
  ctx.fillRect(0, 0, w, h * 0.16);
  ctx.fillStyle = "#0d3b85";
  ctx.fillRect(0, h * 0.84, w, h * 0.16);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#0d3b85";
  ctx.font = `800 96px ${FONTE}`;
  ctx.fillText("SENAI", w / 2, h * 0.41);
  ctx.fillStyle = "#3a4048";
  ctx.font = `700 34px ${FONTE}`;
  ctx.fillText("LABORATÓRIO DE USINAGEM", w / 2, h * 0.7);
}

function desenharVidro(ctx, w, h) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "#9cc4ec");
  g.addColorStop(1, "#e3eff9");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "rgba(255,255,255,0.45)";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(w * 0.15, h);
  ctx.lineTo(w * 0.55, 0);
  ctx.stroke();
}

function desenharPainelFerramentas(ctx, w, h) {
  ctx.fillStyle = "#c8a46a";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "rgba(70,48,24,0.45)";
  for (let x = 10; x < w; x += 18) for (let y = 10; y < h; y += 18) ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
  ctx.lineCap = "round";
  ctx.strokeStyle = "#3a4048";
  // chaves combinadas
  for (let i = 0; i < 6; i++) {
    const x = 34 + i * 24;
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(x, 40);
    ctx.lineTo(x, 130 + i * 12);
    ctx.stroke();
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(x, 34, 9, 0, Math.PI * 2);
    ctx.stroke();
  }
  // martelo
  ctx.fillStyle = "#8a5a2b";
  ctx.fillRect(232, 64, 14, 150);
  ctx.fillStyle = "#3a4048";
  ctx.fillRect(204, 44, 70, 26);
  // chaves de fenda
  for (const [i, cor] of ["#d71920", "#f2c12e", "#1c7ed6"].entries()) {
    const x = 310 + i * 32;
    ctx.fillStyle = cor;
    ctx.fillRect(x - 8, 40, 16, 56);
    ctx.strokeStyle = "#9aa0a6";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(x, 96);
    ctx.lineTo(x, 170);
    ctx.stroke();
  }
  // paquímetro
  ctx.fillStyle = "#c9ced4";
  ctx.fillRect(420, 34, 12, 190);
  ctx.fillRect(432, 34, 40, 12);
  ctx.fillRect(432, 90, 36, 22);
}

function desenharQuadro(ctx, w, h) {
  ctx.fillStyle = "#f7f9fb";
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#0d3b85";
  ctx.font = `700 46px ${FONTE}`;
  ctx.fillText("Monitoramento e diagnóstico", 48, 80);
  ctx.strokeStyle = "#0d3b85";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(48, 98);
  ctx.lineTo(700, 98);
  ctx.stroke();
  ctx.fillStyle = "#2b3138";
  ctx.font = `500 32px ${FONTE}`;
  ["Temperatura", "Nível de óleo", "Corrente", "Vibração", "Rotação"].forEach((t, i) => ctx.fillText(`• ${t}`, 56, 160 + i * 54));
  // gráfico de tendência com limites de atenção e alarme
  const x0 = 520;
  const x1 = 970;
  const y0 = 400;
  const y1 = 140;
  ctx.strokeStyle = "#3a4048";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(x0, y1);
  ctx.lineTo(x0, y0);
  ctx.lineTo(x1, y0);
  ctx.stroke();
  ctx.setLineDash([14, 10]);
  ctx.lineWidth = 3;
  for (const [y, cor] of [[230, "#e8a400"], [180, "#d03b3b"]]) {
    ctx.strokeStyle = cor;
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.lineTo(x1, y);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.strokeStyle = "#1c7ed6";
  ctx.lineWidth = 5;
  ctx.beginPath();
  for (let i = 0; i <= 45; i++) {
    const x = x0 + 10 + i * 9.6;
    const subida = i > 25 ? (i - 25) ** 1.6 * 2.4 : 0;
    const y = 330 - subida + Math.sin(i * 1.7) * 8;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

function desenharOculos(ctx, w, h) {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#1565c0";
  ctx.beginPath();
  ctx.arc(w / 2, 118, 96, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 9;
  ctx.lineJoin = "round";
  for (const x of [w / 2 - 38, w / 2 + 38]) {
    ctx.beginPath();
    ctx.ellipse(x, 122, 30, 22, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(w / 2 - 8, 116);
  ctx.quadraticCurveTo(w / 2, 106, w / 2 + 8, 116);
  ctx.moveTo(w / 2 - 68, 116);
  ctx.lineTo(w / 2 - 84, 104);
  ctx.moveTo(w / 2 + 68, 116);
  ctx.lineTo(w / 2 + 84, 104);
  ctx.stroke();
  ctx.fillStyle = "#0d3b85";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `800 25px ${FONTE}`;
  ctx.fillText("USO OBRIGATÓRIO", w / 2, 252);
  ctx.font = `700 21px ${FONTE}`;
  ctx.fillText("ÓCULOS DE PROTEÇÃO", w / 2, 286);
}

function desenharExtintor(ctx, w, h) {
  ctx.fillStyle = "#d71920";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.roundRect(98, 80, 60, 150, 22);
  ctx.fill();
  ctx.fillRect(118, 52, 20, 30);
  ctx.fillRect(138, 56, 46, 12);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `800 40px ${FONTE}`;
  ctx.fillText("EXTINTOR", w / 2, 280);
}

function desenharTensao(ctx, w, h) {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.beginPath();
  ctx.moveTo(w / 2, 16);
  ctx.lineTo(w - 16, h - 28);
  ctx.lineTo(16, h - 28);
  ctx.closePath();
  ctx.fillStyle = "#f2c12e";
  ctx.fill();
  ctx.lineWidth = 12;
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#111111";
  ctx.stroke();
  ctx.save();
  ctx.translate(w / 2 - 54, 82);
  ctx.scale(4.5, 4.5);
  ctx.fillStyle = "#111111";
  ctx.fill(new Path2D(ICONES.raio));
  ctx.restore();
}

function desenharInflamavel(ctx, w, h) {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#d71920";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `800 40px ${FONTE}`;
  ctx.fillText("INFLAMÁVEL", w / 2, h * 0.38);
  ctx.fillStyle = "#2b3138";
  ctx.font = `600 22px ${FONTE}`;
  ctx.fillText("óleos e fluido de corte", w / 2, h * 0.74);
}

function desenharPortao(ctx, w, h) {
  ctx.fillStyle = "#a7b0ba";
  ctx.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 16) {
    ctx.fillStyle = "rgba(40,46,54,0.35)";
    ctx.fillRect(0, y, w, 3);
    ctx.fillStyle = "rgba(255,255,255,0.25)";
    ctx.fillRect(0, y + 3, w, 2);
  }
  ctx.fillStyle = "#3a4048";
  ctx.fillRect(w / 2 - 20, h - 26, 40, 8);
}

function desenharSaida(ctx, w, h) {
  ctx.fillStyle = "#0a8a3a";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.font = `800 96px ${FONTE}`;
  ctx.fillText("SAÍDA", 40, h / 2 + 4);
  ctx.beginPath();
  ctx.moveTo(380, 70);
  ctx.lineTo(430, 70);
  ctx.lineTo(430, 44);
  ctx.lineTo(480, 96);
  ctx.lineTo(430, 148);
  ctx.lineTo(430, 122);
  ctx.lineTo(380, 122);
  ctx.closePath();
  ctx.fill();
}
