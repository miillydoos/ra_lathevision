import {
  Color3,
  DracoDecoder,
  DynamicTexture,
  LoadAssetContainerAsync,
  Mesh,
  MeshBuilder,
  StandardMaterial,
  Texture,
  TransformNode,
  VertexData,
} from "@babylonjs/core";
import "@babylonjs/loaders/glTF";
import { ICONES } from "../util/icones.js";
import { ESCOLA } from "../config/escola.js";

// Decodificador Draco local (o maquina.glb é comprimido com Draco): funciona sem internet.
// URLs absolutas porque o decodificador roda num worker.
const absoluta = (caminho) => new URL(caminho, window.location.href).href;
DracoDecoder.DefaultConfiguration = {
  wasmUrl: absoluta("./draco/draco_wasm_wrapper_gltf.js"),
  wasmBinaryUrl: absoluta("./draco/draco_decoder_gltf.wasm"),
  fallbackUrl: absoluta("./draco/draco_decoder_gltf.js"),
};

/**
 * Laboratório de Mecânica de Usinagem do SENAI São Carlos ao redor do torno (ambiente 360°), modelado em 3D a
 * partir da foto 360° da oficina real (Lathevision): galpão com cobertura em abóbada creme, treliça metálica,
 * claraboia e fileiras de luminárias penduradas; piso de taco envernizado com corredor demarcado por faixas
 * brancas; escritório envidraçado com faixa vermelha e logos SENAI; placa suspensa "Mecânica de Usinagem" e
 * bandeira; centro de usinagem ROMI D 800 com transportador de cavacos, torno CNC, fresadora e furadeiras sobre
 * tapetes de borracha, bancadas brancas com tampo de madeira, armários azuis, banner, hidrante e sinalização.
 * No piso, manchas de luz sob as luminárias e sombras de contato sob o torno e os móveis.
 *
 * - Só cenário: nada é clicável e o torno.glb não muda.
 * - Não cria luzes nem recebe o sol da cena; usa a luz ambiente e um brilho próprio,
 *   assim a aparência do torno continua a mesma.
 * - Tudo procedural e mesclado em lotes por grupo (casca, abóbada, sólidos, imagens, vidro, LEDs e efeitos do
 *   piso): poucas chamadas de desenho, o que importa no headset.
 * - Vista de "maquete": com a câmera fora da sala (ou dentro do escritório), o que fica entre ela e o torno some.
 *
 * Coordenadas como no torno.glb: X ao longo do barramento, Y para cima, operador em +Z.
 */
export function criarSala(scene, { tamanho = 14, altura = 5, luzesExcluidas = [] } = {}) {
  const h = tamanho / 2;
  const H = altura; // altura das paredes compridas (fundo e frente)
  const FLECHA = 1.8; // a abóbada sobe mais 1,8 m no meio do vão
  const yTeto = (z) => H + FLECHA * (1 - (Math.min(h, Math.abs(z)) / h) ** 2);
  const raiz = new TransformNode("sala", scene);
  // A caixa de engrenagens (cabeçote, em −X) do Tormax 30 e do Centur fica de frente para a fachada de vidro do UpLab.
  // Em vez de girar o torno.glb (sensores, tampas, câmera e tour dependem das coordenadas dele), gira-se a sala
  // inteira −90° em torno dele: o grupo "mundo" (o Centur, o tapete do operador e as sombras do torno) fica no
  // mesmo referencial do torno; o resto (paredes, vidro, corredor, outras máquinas) vai no nó girado.
  const salaGiro = new TransformNode("sala_giro", scene);
  salaGiro.parent = raiz;
  salaGiro.rotation.y = GIRO_SALA;

  // ---------- lotes: uma malha por grupo e tipo
  const lotes = new Map();
  const lote = (grupo, tipo) => {
    const chave = `${grupo}|${tipo}`;
    if (!lotes.has(chave)) lotes.set(chave, { grupo, tipo, geo: criarLote() });
    return lotes.get(chave).geo;
  };

  // ---------- posicionamento
  // Nas paredes, `a` é a coordenada ao longo da parede (X no fundo e na frente, Z nas laterais),
  // `y` a altura e `d` o afastamento da parede para dentro da sala.
  const LADOS = ["fundo", "frente", "esquerda", "direita"];
  const PARA_DENTRO = { fundo: [0, 0, 1], frente: [0, 0, -1], esquerda: [1, 0, 0], direita: [-1, 0, 0] };
  // direção "para a direita" de quem olha a parede de dentro da sala (a imagem aparece sem espelhar)
  const AO_LONGO = { fundo: [1, 0, 0], frente: [-1, 0, 0], esquerda: [0, 0, -1], direita: [0, 0, 1] };
  const lateral = (lado) => lado === "esquerda" || lado === "direita";
  function ponto(lado, a, y, d) {
    if (lado === "fundo") return [a, y, -h + d];
    if (lado === "frente") return [a, y, h - d];
    if (lado === "esquerda") return [-h + d, y, a];
    return [h - d, y, a];
  }

  /** Caixa encostada na parede, centrada em (a, y, d): largura ao longo da parede, profundidade para dentro. */
  function caixa(lado, a, y, d, larg, alt, prof, cor, grupo = lado) {
    const [x, yy, z] = ponto(lado, a, y, d);
    const [sx, sz] = lateral(lado) ? [prof, larg] : [larg, prof];
    lote(grupo, "solido").caixa(x - sx / 2, x + sx / 2, yy - alt / 2, yy + alt / 2, z - sz / 2, z + sz / 2, cor);
  }
  /** Bloco solto, centrado em (x, y, z). */
  function bloco(grupo, x, y, z, sx, sy, sz, cor) {
    lote(grupo, "solido").caixa(x - sx / 2, x + sx / 2, y - sy / 2, y + sy / 2, z - sz / 2, z + sz / 2, cor);
  }
  const tubo = (grupo, a, b, r, cor, lados = 10) => lote(grupo, "solido").cilindro(a, b, r, cor, lados);
  const tuboParede = (lado, a0, y0, d0, a1, y1, d1, r, cor, lados = 10, grupo = lado) =>
    tubo(grupo, ponto(lado, a0, y0, d0), ponto(lado, a1, y1, d1), r, cor, lados);

  /** Retângulo texturizado na parede, centrado em (a, y), afastado `d` e voltado para dentro da sala. */
  function naParede(lado, tipo, uv, a, y, d, larg, alt, brilho, grupo = lado) {
    const c = ponto(lado, a, y, d);
    const u = AO_LONGO[lado].map((v) => v * larg);
    lote(grupo, tipo).quad([c[0] - u[0] / 2, c[1] - alt / 2, c[2] - u[2] / 2], u, [0, alt, 0], cinza(brilho), uv);
  }
  /** Imagem do atlas na parede. */
  const imagem = (lado, reg, a, y, d, larg, alt, brilho = 0.88, grupo = lado) =>
    naParede(lado, "imagem", uvAtlas(reg), a, y, d, larg, alt, brilho, grupo);
  /** Imagem do atlas num plano vertical solto, voltada para +z (sentido = 1) ou −z (sentido = −1). */
  function imagemZ(grupo, reg, x, y, z, larg, alt, sentido = 1, brilho = 0.9) {
    const u = [sentido * larg, 0, 0];
    lote(grupo, "imagem").quad([x - u[0] / 2, y - alt / 2, z], u, [0, alt, 0], cinza(brilho), uvAtlas(reg));
  }
  /** Imagem do atlas num plano vertical solto, voltada para +x (sentido = 1) ou −x (sentido = −1). */
  function imagemX(grupo, reg, x, y, z, larg, alt, sentido = 1, brilho = 0.9) {
    const u = [0, 0, -sentido * larg];
    lote(grupo, "imagem").quad([x, y - alt / 2, z - u[2] / 2], u, [0, alt, 0], cinza(brilho), uvAtlas(reg));
  }
  /** Retângulo no piso (ou logo acima dele), voltado para cima. */
  function noPiso(grupo, tipo, x0, x1, z0, z1, y, cor, uv) {
    lote(grupo, tipo).quad([x0, y, z1], [x1 - x0, 0, 0], [0, 0, -(z1 - z0)], typeof cor === "string" ? rgb(cor) : cor, uv);
  }
  /** Área ocupada no piso por uma peça encostada na parede: [x0, x1, z0, z1]. */
  function pegada(lado, a, d, larg, prof) {
    const [x, , z] = ponto(lado, a, 0, d);
    const [sx, sz] = lateral(lado) ? [prof, larg] : [larg, prof];
    return [x - sx / 2, x + sx / 2, z - sz / 2, z + sz / 2];
  }
  /** Sombra de contato (mancha escura e suave) sob uma peça. */
  const sombra = (grupo, [x0, x1, z0, z1], forca = 0.55, cresce = 0.14, y = 0.004) =>
    noPiso(grupo, "efeito", x0 - cresce, x1 + cresce, z0 - cresce, z1 + cresce, y, [1, 1, 1, forca], uvEfeito(EFEITO.sombra));
  /** Tapete de borracha perfurado (antifadiga), como na frente das máquinas da oficina real. */
  function tapete(grupo, x0, x1, z0, z1) {
    bloco(grupo, (x0 + x1) / 2, 0.006, (z0 + z1) / 2, x1 - x0, 0.012, z1 - z0, "#26292c");
    noPiso(grupo, "imagem", x0, x1, z0, z1, 0.0125, cinza(0.62), uvAtlas(REG.tapete));
  }

  // ---------- casca: paredes e abóbada com sombreamento suave nos cantos (oclusão "assada" nas cores)
  const oclusao = (dist) => 1 - 0.3 * Math.exp(-dist / 0.45);
  {
    const CLARO = rgb("#f1f2ef");
    const BAIXO = rgb("#e0e3e1");
    const BANDA = 1.1;
    const cortes = (L, extras = []) => {
      const c = new Set([0, L, ...extras]);
      for (const d of [0.06, 0.15, 0.28, 0.45, 0.7, 1.0, 1.4]) {
        c.add(d);
        c.add(+(L - d).toFixed(4));
      }
      for (let x = 2; x < L - 1.4; x += 1) c.add(x);
      return [...c].sort((p, q) => p - q);
    };
    const corParede = (y) => (y < BANDA ? BAIXO : CLARO);
    const ORIGEM = { fundo: [-h, 0, -h], frente: [h, 0, h], esquerda: [-h, 0, h], direita: [h, 0, -h] };
    for (const lado of LADOS) {
      const geo = lote(lado, "casca");
      const o = ORIGEM[lado];
      const eu = AO_LONGO[lado];
      const ca = cortes(tamanho);
      const cy = cortes(H, [BANDA]);
      // parte retangular (até a altura das paredes compridas)
      const topoEm = (a) => (lateral(lado) ? yTeto(o[2] + a * eu[2]) : H);
      for (let i = 0; i < ca.length - 1; i++) {
        const [a0, a1] = [ca[i], ca[i + 1]];
        const ladoA = (a) => oclusao(a) * oclusao(tamanho - a);
        for (let j = 0; j < cy.length - 1; j++) {
          const [y0, y1] = [cy[j], cy[j + 1]];
          const base = corParede((y0 + y1) / 2);
          const cor = (a, y) => base.map((v) => v * ladoA(a) * oclusao(y) * oclusao(topoEm(a) - y));
          const p = [o[0] + a0 * eu[0], y0, o[2] + a0 * eu[2]];
          geo.quad(p, eu.map((v) => v * (a1 - a0)), [0, y1 - y0, 0], [cor(a0, y0), cor(a1, y0), cor(a1, y1), cor(a0, y1)]);
        }
        // empena (paredes das pontas): da altura das paredes até a curva da abóbada
        if (lateral(lado)) {
          const [t0, t1] = [topoEm(a0), topoEm(a1)];
          const fr = [0, 0.5, 0.82, 1];
          for (let k = 0; k < fr.length - 1; k++) {
            const y = (t, f) => H + (t - H) * f;
            const pt = (a, t, f) => [o[0] + a * eu[0], y(t, f), o[2] + a * eu[2]];
            const cor = (a, t, f) => CLARO.map((v) => v * ladoA(a) * oclusao(t - y(t, f)));
            geo.quad4(
              [pt(a0, t0, fr[k]), pt(a1, t1, fr[k]), pt(a1, t1, fr[k + 1]), pt(a0, t0, fr[k + 1])],
              [cor(a0, t0, fr[k]), cor(a1, t1, fr[k]), cor(a1, t1, fr[k + 1]), cor(a0, t0, fr[k + 1])],
            );
          }
        }
      }
      caixa(lado, 0, 0.05, 0.008, tamanho, 0.1, 0.016, "#3a3f45"); // rodapé
      // junção parede-piso: faixa escura e suave no chão, junto à parede
      const dentro = PARA_DENTRO[lado];
      const ao = cruz(dentro, [0, 1, 0]).map((v) => v * tamanho);
      const c = ponto(lado, 0, 0.0032, 0);
      lote(lado, "efeito").quad([c[0] - ao[0] / 2, c[1], c[2] - ao[2] / 2], ao, dentro.map((v) => v * 0.7), [1, 1, 1, 0.45], uvEfeito(EFEITO.borda));
    }
    // abóbada (painéis creme), com a textura repetindo a cada 2,4 m
    const geo = lote("teto", "abobada");
    const cx = cortes(tamanho).map((v) => v - h);
    const cz = cortes(tamanho).map((v) => v - h);
    const k = (x, z) => oclusao(x + h) * oclusao(h - x) * oclusao(z + h) * oclusao(h - z);
    const P = (x, z) => [x, yTeto(z), z];
    const T = 2.4;
    for (let i = 0; i < cx.length - 1; i++)
      for (let j = 0; j < cz.length - 1; j++) {
        const [x0, x1, z0, z1] = [cx[i], cx[i + 1], cz[j], cz[j + 1]];
        geo.quad4(
          [P(x0, z0), P(x1, z0), P(x1, z1), P(x0, z1)],
          [cinza(k(x0, z0)), cinza(k(x1, z0)), cinza(k(x1, z1)), cinza(k(x0, z1))],
          [[x0 / T, z0 / T], [x1 / T, z0 / T], [x1 / T, z1 / T], [x0 / T, z1 / T]],
        );
      }
  }

  // ---------- cobertura: claraboia, treliça metálica, luminárias, eletrocalhas e sprinklers
  const TRELICA = "#3d434a";
  const abaixo = 0.12; // a treliça corre um pouco abaixo dos painéis
  const arcoZ = [];
  for (let i = 0; i <= 14; i++) arcoZ.push(-h + (i / 14) * tamanho);
  // claraboia: placas translúcidas e claras ao longo da cumeeira, entre os arcos
  const arcosX = [-7, -4.67, -2.33, 0, 2.33, 4.67, 7];
  for (let i = 0; i < arcosX.length - 1; i++) {
    const [x0, x1] = [arcosX[i] + 0.12, arcosX[i + 1] - 0.12];
    for (const [z0, z1] of [[-0.9, -0.3], [-0.3, 0.3], [0.3, 0.9]]) {
      const P = (x, z) => [x, yTeto(z) - 0.015, z];
      lote("teto", "led").quad4([P(x0, z0), P(x1, z0), P(x1, z1), P(x0, z1)], [[0.93, 0.96, 1], [0.93, 0.96, 1], [0.93, 0.96, 1], [0.93, 0.96, 1]]);
    }
  }
  // arcos da treliça (acompanham a curva) e terças ao longo do galpão
  for (const x of arcosX) {
    for (let i = 0; i < arcoZ.length - 1; i++) {
      const [z0, z1] = [arcoZ[i], arcoZ[i + 1]];
      tubo("teto", [x, yTeto(z0) - abaixo, z0], [x, yTeto(z1) - abaixo, z1], 0.035, TRELICA, 6);
      tubo("teto", [x, yTeto(z0) - abaixo - 0.32, z0], [x, yTeto(z1) - abaixo - 0.32, z1], 0.025, TRELICA, 6);
    }
    for (let i = 0; i < arcoZ.length - 1; i += 2) {
      const z = arcoZ[i];
      tubo("teto", [x, yTeto(z) - abaixo, z], [x, yTeto(z + 1) - abaixo - 0.32, z + 1], 0.012, TRELICA, 5);
    }
  }
  const tercas = [-5.6, -3.2, -1.1, 1.1, 3.2, 5.6];
  for (const z of tercas) tubo("teto", [-h, yTeto(z) - abaixo, z], [h, yTeto(z) - abaixo, z], 0.03, TRELICA, 6);
  // contraventamento em X (o desenho em losango da foto)
  for (let i = 0; i < arcosX.length - 1; i++)
    for (let j = 0; j < tercas.length - 1; j++) {
      const [xa, xb, za, zb] = [arcosX[i], arcosX[i + 1], tercas[j], tercas[j + 1]];
      tubo("teto", [xa, yTeto(za) - abaixo, za], [xb, yTeto(zb) - abaixo, zb], 0.012, TRELICA, 5);
      tubo("teto", [xa, yTeto(zb) - abaixo, zb], [xb, yTeto(za) - abaixo, za], 0.012, TRELICA, 5);
    }

  // luminárias lineares de LED penduradas em fileiras ao longo do galpão, com a mancha de luz no piso
  const yLuminaria = 4.4;
  for (const z of [-4.6, -1.6, 1.4, 4.1])
    for (const x of [-4.8, -1.6, 1.6, 4.8]) {
      bloco("teto", x, yLuminaria + 0.03, z, 1.5, 0.06, 0.16, "#e3e6e8");
      lote("teto", "led").quad([x - 0.72, yLuminaria - 0.001, z - 0.06], [1.44, 0, 0], [0, 0, 0.12], [1, 1, 1]);
      for (const dx of [-0.6, 0.6]) tubo("teto", [x + dx, yLuminaria + 0.06, z], [x + dx, yTeto(z) - abaixo, z], 0.004, "#2b2f35", 5);
      noPiso("piso", "efeito", x - 1.6, x + 1.6, z - 0.75, z + 0.75, 0.003, [1, 1, 1, 0.3], uvEfeito(EFEITO.luz));
    }
  // eletrocalhas perfuradas ao longo do galpão, penduradas por tirantes
  const yCalha = 4.75;
  for (const z of [-3.1, 2.9]) {
    bloco("teto", 0, yCalha, z, tamanho, 0.012, 0.3, "#8d96a0");
    for (const s of [-0.15, 0.15]) bloco("teto", 0, yCalha + 0.04, z + s, tamanho, 0.08, 0.012, "#8d96a0");
    for (const x of [-6, -3, 0, 3, 6]) for (const s of [-0.19, 0.19]) tubo("teto", [x, yCalha - 0.03, z + s], [x, yTeto(z + s) - abaixo, z + s], 0.005, "#59626d", 5);
  }
  // rede de sprinklers (tubo vermelho) junto às paredes compridas
  for (const lado of ["fundo", "frente"]) {
    tuboParede(lado, -h, 4.85, 0.25, h, 4.85, 0.25, 0.035, "#c8102e", 10);
    for (const a of [-5, -2, 1, 4]) tuboParede(lado, a, 4.85, 0.25, a, 4.7, 0.25, 0.012, "#c8102e", 6);
  }

  // ---------- placa suspensa "Mecânica de Usinagem" e bandeira sobre o corredor, de frente para quem anda nele
  // (o corredor corre ao longo do galpão, em X, entre o torno e o escritório envidraçado)
  const CORREDOR = { z0: 2.45, z1: 4.65 };
  // escritório UpLab: fachada de vidro em toda a extensão do corredor, de parede a parede, até a parede da frente
  const ESCRITORIO = { x0: -h, x1: h, z0: CORREDOR.z1 + 0.25 };
  {
    const [x, y, z] = [2.6, 3.7, (CORREDOR.z0 + CORREDOR.z1) / 2];
    bloco("teto", x, y, z, 0.03, 0.42, 1.72, "#4a1d1f");
    bloco("teto", x, y + 0.2, z, 0.032, 0.04, 1.72, "#d71920");
    imagemX("teto", REG.placaUsinagem, x + 0.017, y - 0.01, z, 1.68, 0.38, 1, 0.95);
    imagemX("teto", REG.placaUsinagem, x - 0.017, y - 0.01, z, 1.68, 0.38, -1, 0.95);
    for (const dz of [-0.7, 0.7]) tubo("teto", [x, y + 0.21, z + dz], [x, yTeto(z + dz) - abaixo, z + dz], 0.004, "#2b2f35", 5);
    const [bx, bz] = [-2.6, z];
    tubo("teto", [bx, 4.95, bz - 0.55], [bx, 4.95, bz + 0.55], 0.012, "#c9ced4", 6);
    tubo("teto", [bx, 4.95, bz], [bx, yTeto(bz) - abaixo, bz], 0.005, "#2b2f35", 5);
    imagemX("teto", REG.bandeira, bx + 0.004, 4.6, bz, 1.0, 0.7, 1, 0.95);
    imagemX("teto", REG.bandeira, bx - 0.004, 4.6, bz, 1.0, 0.7, -1, 0.95);
  }

  // ---------- janelas altas (basculantes) nas paredes compridas
  for (const [lado, posicoes] of [["fundo", [-5.0, 5.0]], ["frente", [-4.6, -1.6, 1.6, 4.6]]]) {
    for (const a of posicoes) {
      const y = 4.2;
      caixa(lado, a, y, 0.006, 2.36, 0.96, 0.012, "#cfd5da");
      imagem(lado, REG.janela, a, y, 0.016, 2.2, 0.8, 1);
      for (const dy of [-0.4, 0, 0.4]) caixa(lado, a, y + dy, 0.03, 2.26, 0.05, 0.05, "#59626d");
      for (const du of [-1.1, 0, 1.1]) caixa(lado, a, y, 0.03, 0.05, 0.85, 0.05, "#59626d");
      caixa(lado, a, y - 0.47, 0.07, 2.36, 0.04, 0.14, "#d3d8dd");
    }
    // ventiladores de parede
    for (const a of lado === "fundo" ? [-3.5, 3.5] : [-3.1, 3.1, 6.2]) {
      caixa(lado, a, 4.15, 0.05, 0.16, 0.2, 0.1, "#2b2f35");
      tuboParede(lado, a, 4.15, 0.1, a, 4.15, 0.3, 0.04, "#2b2f35", 10);
      imagem(lado, REG.ventilador, a, 4.15, 0.31, 0.55, 0.55, 0.9);
    }
  }

  // ---------- fundo: placa da escola, bancada com painel de ferramentas, quadro elétrico, extintor e armários azuis
  caixa("fundo", 0, 3.55, 0.015, 4.5, 1.2, 0.03, "#c4cbd2"); // moldura de alumínio
  naParede("fundo", "placa", [0, 0, 1, 1], 0, 3.55, 0.031, 4.4, 1.1, 0.96);
  {
    const zb = -h + 0.45;
    bancadaBranca("fundo", 0, zb, 2.0, 0.75);
    morsa("fundo", 0.55, 0.93, zb + 0.08);
    caixa("fundo", 0, 1.75, 0.012, 2.46, 1.26, 0.024, "#b08a5a"); // chapa perfurada
    imagem("fundo", REG.ferramentas, 0, 1.75, 0.026, 2.4, 1.2, 0.9);
    bloco("fundo", -0.6, 1.03, zb - 0.05, 0.46, 0.2, 0.26, "#c92a2a"); // caixa de ferramentas
    bloco("fundo", -0.6, 1.14, zb - 0.05, 0.47, 0.008, 0.27, "#8e1d1d");
  }
  {
    const a = -2.9; // quadro elétrico com eletrodutos até a eletrocalha
    caixa("fundo", a, 1.75, 0.125, 0.8, 1.0, 0.25, "#b9c0c8");
    imagem("fundo", REG.quadroEletrico, a, 1.75, 0.252, 0.76, 0.96, 0.9);
    for (const da of [-0.18, 0, 0.18]) tuboParede("fundo", a + da, 2.25, 0.07, a + da, 4.6, 0.07, 0.022, "#8d96a0", 10);
  }
  {
    const a = -3.95; // extintor com placa e demarcação no piso
    const d = 0.13;
    caixa("fundo", a, 1.02, 0.05, 0.17, 0.05, 0.1, "#59626d");
    tuboParede("fundo", a, 0.78, d, a, 1.26, d, 0.085, "#c8102e", 16);
    tuboParede("fundo", a, 0.96, d, a, 1.1, d, 0.0865, "#f1f1ee", 16);
    tuboParede("fundo", a, 1.26, d, a, 1.31, d, 0.06, "#c8102e", 14);
    tuboParede("fundo", a, 1.31, d, a, 1.38, d, 0.02, "#2b2f35", 8);
    caixa("fundo", a + 0.035, 1.39, d, 0.12, 0.016, 0.03, "#2b2f35");
    tuboParede("fundo", a + 0.03, 1.36, d, a + 0.1, 1.1, d + 0.03, 0.009, "#1d1f22", 6);
    tuboParede("fundo", a + 0.1, 1.1, d + 0.03, a + 0.1, 0.92, d + 0.03, 0.012, "#1d1f22", 6);
    imagem("fundo", REG.extintor, a, 1.85, 0.012, 0.36, 0.45, 0.9);
    const [x0, x1, z0, z1] = pegada("fundo", a, 0.42, 0.7, 0.7);
    noPiso("piso", "solido", x0, x1, z0, z1, 0.0025, "#e8b400");
    noPiso("piso", "solido", x0 + 0.07, x1 - 0.07, z0 + 0.07, z1 - 0.07, 0.003, "#c8102e");
  }
  // armários azuis afastados do armário de inflamáveis (no canto eles se encostavam): ~30 cm de folga dos dois lados
  for (const a of [-5.8, -5.0]) armarioAzul("fundo", a, 0.8, 1.0);

  // ---------- frente: escritório envidraçado (UpLab) ao longo de todo o corredor
  escritorio(ESCRITORIO.x0, ESCRITORIO.x1, ESCRITORIO.z0);
  // bancadas de ajustagem no fundo, à esquerda do torno
  bancadaBranca("piso", -3.4, -3.6, 1.6, 0.8);
  bancadaBranca("piso", -1.7, -3.6, 1.6, 0.8);
  morsa("piso", -3.9, 0.93, -3.5);
  morsa("piso", -1.2, 0.93, -3.5);

  // ---------- esquerda: quadro branco, cartaz 5S, armário de inflamáveis e sinalização
  {
    caixa("esquerda", -1.4, 1.85, 0.015, 3.32, 1.52, 0.03, "#a9b1ba");
    imagem("esquerda", REG.quadro, -1.4, 1.85, 0.032, 3.2, 1.4, 0.95);
    caixa("esquerda", -1.4, 1.12, 0.05, 1.2, 0.025, 0.07, "#a9b1ba");
    for (const [i, cor] of ["#1c4fb8", "#c62828", "#1d1f22"].entries()) {
      const a = -1.85 + i * 0.16;
      tuboParede("esquerda", a - 0.065, 1.145, 0.055, a + 0.065, 1.145, 0.055, 0.009, cor, 8);
    }
    imagem("esquerda", REG.cartaz5S, 2.7, 1.7, 0.012, 1.04, 0.8, 0.9);
    imagem("esquerda", REG.oculos, 1.0, 1.95, 0.012, 0.4, 0.5, 0.9);
    const a = -6.2; // armário de inflamáveis
    caixa("esquerda", a, 0.95, 0.25, 0.95, 1.8, 0.5, "#f2c12e");
    caixa("esquerda", a, 0.025, 0.25, 0.9, 0.05, 0.46, "#2b2f35");
    caixa("esquerda", a, 0.95, 0.502, 0.008, 1.7, 0.006, "#7a5f12");
    for (const da of [-0.05, 0.05]) caixa("esquerda", a + da, 1.0, 0.515, 0.02, 0.22, 0.022, "#2b2f35");
    for (const da of [-0.25, 0.25]) for (let i = 0; i < 4; i++) caixa("esquerda", a + da, 0.22 + i * 0.045, 0.503, 0.26, 0.014, 0.008, "#9c7a17");
    imagem("esquerda", REG.inflamavel, a, 1.5, 0.507, 0.5, 0.25, 0.92);
    sombra("esquerda", pegada("esquerda", a, 0.25, 0.95, 0.5));
  }

  // ---------- direita: saída no fim do corredor, hidrante, relógio e sinalização
  {
    const a = (CORREDOR.z0 + CORREDOR.z1) / 2;
    porta("direita", a, REG.portaSaida);
    caixa("direita", a, 2.5, 0.03, 0.86, 0.34, 0.06, "#f4f6f8");
    imagem("direita", REG.saida, a, 2.5, 0.061, 0.8, 0.3, 1);
    caixa("direita", a, 2.86, 0.04, 0.36, 0.1, 0.08, "#eef0f2"); // luminária de emergência
    tuboParede("direita", 1.6, 2.75, 0.004, 1.6, 2.75, 0.04, 0.17, "#2b2f35", 24); // relógio
    imagem("direita", REG.relogio, 1.6, 2.75, 0.042, 0.24, 0.24, 0.95);
    imagem("direita", REG.auricular, 1.6, 1.8, 0.012, 0.4, 0.5, 0.9);
    // abrigo de mangueira (hidrante) alimentado pela rede vermelha
    caixa("direita", -3.2, 1.45, 0.13, 0.76, 0.92, 0.26, "#c8102e");
    imagem("direita", REG.hidrante, -3.2, 1.45, 0.262, 0.7, 0.86, 0.92);
    imagem("direita", REG.extintor, -3.2, 2.2, 0.012, 0.3, 0.36, 0.9);
    tuboParede("direita", -3.2, 1.91, 0.1, -3.2, 4.85, 0.1, 0.03, "#c8102e", 10);
    tuboParede("direita", -3.2, 4.85, 0.1, -h + 0.25, 4.85, 0.1, 0.03, "#c8102e", 10);
  }

  // ---------- máquinas da oficina
  // centro de usinagem ROMI D 800: o modelo CAD public/models/maquina.glb, carregado à parte.
  // O arquivo vem do CAD com Z para cima (deitado, frente para o chão): −90° em X o põe de pé, frente para a sala.
  const D800 = { x: 4.55, z: -5.5, rx: -Math.PI / 2, larg: 4.7, prof: 2.77 };
  // O CAD traz "D 125…" gravado na frente; é um D800: esconde os dígitos vermelhos e põe "800" (a letra "D" já serve).
  carregarMaquinaGLB(scene, raiz, salaGiro, "./models/maquina.glb", D800, luzesExcluidas, (c) => {
    const digitos = c.meshes.find((m) => /ENCLOSURE/.test(m.name) && /primitive4$/.test(m.name));
    digitos?.setEnabled(false);
    if (digitos) criarRotuloD800(scene, salaGiro);
  });
  sombra("piso", [D800.x - D800.larg / 2 + 0.3, D800.x + D800.larg / 2 - 0.2, D800.z - D800.prof / 2 + 0.15, D800.z + D800.prof / 2 - 0.25], 0.55, 0.2);
  // Dois tornos CNC Centur 30D: public/models/centur.glb (Y para cima; comprimento ao longo de Z no arquivo → gira 90°
  // para ficar ao longo de X). Em fila, depois do Tormax 30 (o espaço do operador fica entre eles), com 1 m entre os
  // dois, alinhados no referencial do torno (cabeçote para o vidro do UpLab).
  for (const z of [3.0, 5.62]) {
    const CENTUR = { x: 0, z, ry: -Math.PI / 2, larg: 3.07, prof: 1.62 };
    carregarMaquinaGLB(scene, raiz, raiz, "./models/centur.glb", CENTUR, luzesExcluidas);
    sombra("mundo", [CENTUR.x - CENTUR.larg / 2, CENTUR.x + CENTUR.larg / 2, CENTUR.z - CENTUR.prof / 2, CENTUR.z + CENTUR.prof / 2], 0.5, 0.15);
  }
  // Segundo Tormax 30 (ROMI T 350), só o modelo: o mesmo torno.glb, parado e sem sensores, rótulos, tampas, animação
  // nem interação, na fila à frente do primeiro, no referencial do torno (cabeçote para o vidro do UpLab).
  const TORNO_EXTRA = { x: 0.013, z: -2.1, larg: 2.9, prof: 1.07 };
  carregarMaquinaGLB(scene, raiz, raiz, "./models/torno.glb", TORNO_EXTRA, luzesExcluidas);
  sombra("mundo", [TORNO_EXTRA.x - TORNO_EXTRA.larg / 2, TORNO_EXTRA.x + TORNO_EXTRA.larg / 2, TORNO_EXTRA.z - TORNO_EXTRA.prof / 2, TORNO_EXTRA.z + TORNO_EXTRA.prof / 2], 0.42, 0.22);
  // furadeira junto à parede esquerda, com 1,5 m livre até a ponta das bancadas (vista de cima ela parecia em cima delas)
  furadeira(-6.25, -4.6);
  armarioAzul("piso", 0, 0, 0, { x: 3.0, z: -2.5 }); // carrinho de ferramentas ao lado do D 800
  // banner ao lado esquerdo do D 800 (o modelo ocupa x 2,2…6,9 e z −6,88…−4,12: em (6,3; −4,6) ele atravessava a máquina)
  banner(1.5, -4.9);

  // ---------- piso: corredor com faixas brancas (ao longo do vidro do escritório), tapete do operador
  // e sombra de contato do torno
  for (const z of [CORREDOR.z0, CORREDOR.z1]) noPiso("piso", "solido", -h + 0.3, h, z - 0.04, z + 0.04, 0.0025, "#f2f2ee");
  tapete("mundo", -1.25, 0.55, 0.95, 1.75); // área do operador
  // limites do torno.glb (x −1,43…1,46; z −0,52…0,55): a sombra do sol continua vindo do próprio modelo
  sombra("mundo", [-1.43, 1.46, -0.52, 0.55], 0.42, 0.22);

  // ---------- peças reutilizáveis
  function porta(lado, a, reg) {
    const BATENTE = "#3a4048";
    for (const da of [-0.55, 0.55]) caixa(lado, a + da, 1.08, 0.04, 0.08, 2.16, 0.08, BATENTE);
    caixa(lado, a, 2.2, 0.04, 1.18, 0.08, 0.08, BATENTE);
    caixa(lado, a, 1.05, 0.02, 1.02, 2.1, 0.04, "#7d8794");
    imagem(lado, reg, a, 1.05, 0.0415, 1.0, 2.1, 0.9);
    tuboParede(lado, a - 0.38, 1.0, 0.1, a + 0.38, 1.0, 0.1, 0.016, "#c9ced4", 10); // barra antipânico
    for (const da of [-0.41, 0.41]) caixa(lado, a + da, 1.0, 0.07, 0.06, 0.08, 0.06, "#9aa0a6");
  }

  /** Bancada com estrutura branca, tampo de madeira e prateleira (como as da oficina real). */
  function bancadaBranca(grupo, cx, cz, larg, prof) {
    const ESTRUTURA = "#e9ebea";
    const yt = 0.9;
    bloco(grupo, cx, yt + 0.02, cz, larg + 0.04, 0.05, prof + 0.04, "#a8754a"); // tampo
    bloco(grupo, cx, yt + 0.02, cz + prof / 2 + 0.021, larg + 0.04, 0.05, 0.004, "#8a5d38");
    bloco(grupo, cx, yt - 0.04, cz, larg, 0.06, prof, ESTRUTURA); // quadro
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) bloco(grupo, cx + sx * (larg / 2 - 0.03), (yt - 0.07) / 2, cz + sz * (prof / 2 - 0.03), 0.05, yt - 0.07, 0.05, ESTRUTURA);
    bloco(grupo, cx, 0.2, cz, larg - 0.04, 0.025, prof - 0.04, "#2f3338"); // prateleira
    sombra(grupo, [cx - larg / 2, cx + larg / 2, cz - prof / 2, cz + prof / 2], 0.45, 0.12);
  }

  function morsa(grupo, x, yt, z) {
    const COR = "#2b5c8a";
    bloco(grupo, x, yt + 0.02, z, 0.22, 0.04, 0.24, COR);
    bloco(grupo, x, yt + 0.1, z - 0.05, 0.14, 0.12, 0.1, COR);
    bloco(grupo, x, yt + 0.09, z + 0.09, 0.14, 0.1, 0.08, COR);
    bloco(grupo, x, yt + 0.165, z + 0.006, 0.17, 0.05, 0.012, "#9aa0a6");
    bloco(grupo, x, yt + 0.165, z + 0.044, 0.17, 0.05, 0.012, "#9aa0a6");
    tubo(grupo, [x, yt + 0.08, z + 0.13], [x, yt + 0.08, z + 0.26], 0.011, "#9aa0a6", 8);
    tubo(grupo, [x - 0.11, yt + 0.08, z + 0.25], [x + 0.11, yt + 0.08, z + 0.25], 0.007, "#9aa0a6", 6);
  }

  /** Armário de ferramentas azul com gavetas (na parede: `a` = posição ao longo dela; solto: `pos`). */
  function armarioAzul(grupo, a, larg, alt, pos = null) {
    const AZUL = "#2e5f86";
    const prof = 0.55;
    const [cx, cz] = pos ? [pos.x, pos.z] : [a, -h + prof / 2 + 0.02];
    const larguraX = pos ? 0.55 : larg;
    const altura = pos ? 0.95 : alt;
    bloco(grupo, cx, 0.1 + altura / 2, cz, larguraX, altura, prof, AZUL);
    const n = 5;
    for (let i = 0; i < n; i++) {
      const y = 0.18 + (i + 0.5) * ((altura - 0.12) / n);
      bloco(grupo, cx, y, cz + prof / 2 + 0.006, larguraX - 0.06, (altura - 0.12) / n - 0.02, 0.012, "#3a71a0");
      bloco(grupo, cx, y + 0.03, cz + prof / 2 + 0.018, larguraX * 0.6, 0.016, 0.018, "#c9ced4");
    }
    bloco(grupo, cx, 0.1 + altura + 0.015, cz, larguraX + 0.02, 0.03, prof + 0.02, "#8a96a3");
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) tubo(grupo, [cx + sx * (larguraX / 2 - 0.06), 0.05, cz + sz * (prof / 2 - 0.06) - 0.03], [cx + sx * (larguraX / 2 - 0.06), 0.05, cz + sz * (prof / 2 - 0.06) + 0.03], 0.045, "#1d1f22", 10);
    sombra(grupo, [cx - larguraX / 2, cx + larguraX / 2, cz - prof / 2, cz + prof / 2], 0.5, 0.1);
  }

  /** Furadeira de coluna (cabeçote azul) sobre tapete de borracha. */
  function furadeira(fx, fz) {
    const G = "piso";
    const AZUL = "#2c63a8";
    const ACO = "#9aa0a6";
    tapete(G, fx - 0.55, fx + 0.55, fz - 0.45, fz + 0.75);
    bloco(G, fx, 0.06, fz, 0.5, 0.09, 0.44, "#dcdfdc");
    tubo(G, [fx, 0.1, fz - 0.12], [fx, 1.75, fz - 0.12], 0.045, ACO, 16);
    bloco(G, fx, 0.83, fz - 0.04, 0.12, 0.1, 0.2, "#dcdfdc");
    tubo(G, [fx, 0.83, fz + 0.04], [fx, 0.87, fz + 0.04], 0.19, "#dcdfdc", 24);
    bloco(G, fx, 1.6, fz + 0.02, 0.34, 0.4, 0.58, "#dcdfdc"); // cabeçote
    bloco(G, fx, 1.86, fz + 0.04, 0.36, 0.12, 0.5, AZUL); // capa das polias
    tubo(G, [fx, 1.92, fz - 0.14], [fx, 2.22, fz - 0.14], 0.1, AZUL, 16); // motor
    bloco(G, fx - 0.2, 1.55, fz + 0.22, 0.06, 0.16, 0.12, "#f2c12e"); // botoeira
    tubo(G, [fx, 1.4, fz + 0.18], [fx, 1.23, fz + 0.18], 0.025, ACO, 12);
    tubo(G, [fx, 1.23, fz + 0.18], [fx, 1.15, fz + 0.18], 0.03, "#2b2f35", 12);
    tubo(G, [fx, 1.15, fz + 0.18], [fx, 1.03, fz + 0.18], 0.005, ACO, 6);
    for (let i = 0; i < 3; i++) {
      const t = Math.PI / 2 + (i * 2 * Math.PI) / 3;
      const p = [fx + 0.24, 1.55 + 0.18 * Math.sin(t), fz + 0.1 + 0.18 * Math.cos(t)];
      tubo(G, [fx + 0.2, 1.55, fz + 0.1], p, 0.008, ACO, 6);
      tubo(G, p, [p[0] + 0.03, p[1], p[2]], 0.018, "#1d1f22", 8);
    }
    sombra(G, [fx - 0.25, fx + 0.25, fz - 0.22, fz + 0.22], 0.5, 0.12);
  }

  /** Fresadora ferramenteira (corpo claro, cabeçote azul), de frente para o corredor. */
  function fresadora(cx, cz) {
    const G = "piso";
    const CORPO = "#e4e6e3";
    const AZUL = "#2c63a8";
    const ACO = "#9aa0a6";
    tapete(G, cx - 0.75, cx + 0.75, cz + 0.55, cz + 1.25);
    bloco(G, cx, 0.05, cz - 0.1, 0.9, 0.1, 1.1, "#3a4048");
    bloco(G, cx, 0.85, cz - 0.35, 0.62, 1.6, 0.56, CORPO); // coluna
    bloco(G, cx, 0.6, cz + 0.12, 0.5, 0.42, 0.42, CORPO); // console
    bloco(G, cx, 0.86, cz + 0.16, 0.6, 0.06, 0.4, CORPO); // sela
    bloco(G, cx, 0.94, cz + 0.16, 1.3, 0.1, 0.34, ACO); // mesa
    for (const sx of [-1, 1]) {
      tubo(G, [cx + sx * 0.65, 0.94, cz + 0.16], [cx + sx * 0.72, 0.94, cz + 0.16], 0.01, ACO, 6);
      tubo(G, [cx + sx * 0.72, 0.94, cz + 0.16], [cx + sx * 0.75, 0.94, cz + 0.16], 0.075, ACO, 16);
    }
    bloco(G, cx, 1.78, cz - 0.1, 0.42, 0.26, 1.0, CORPO); // torpedo
    bloco(G, cx, 1.45, cz + 0.34, 0.3, 0.46, 0.3, AZUL); // cabeçote
    tubo(G, [cx, 1.91, cz + 0.34], [cx, 2.18, cz + 0.34], 0.11, AZUL, 16);
    tubo(G, [cx, 1.22, cz + 0.34], [cx, 1.06, cz + 0.34], 0.03, ACO, 10);
    bloco(G, cx + 0.38, 1.35, cz - 0.2, 0.1, 0.32, 0.24, "#f2c12e"); // painel de comando
    sombra(G, [cx - 0.45, cx + 0.45, cz - 0.65, cz + 0.45], 0.5, 0.15);
  }

  /** Torno CNC de carenagem branca, como os da fila da oficina real. */
  function tornoCNC(cx, cz) {
    const G = "piso";
    const BRANCO = "#eceeed";
    bloco(G, cx, 0.18, cz, 2.5, 0.36, 1.45, "#2e5f86");
    bloco(G, cx, 1.0, cz - 0.03, 2.5, 1.3, 1.38, BRANCO);
    bloco(G, cx - 0.1, 1.72, cz - 0.2, 2.2, 0.14, 0.9, BRANCO);
    lote(G, "imagem").quad([cx - 1.25, 0.38, cz + 0.662], [2.0, 0, 0], [0, 1.08, 0], cinza(0.93), uvAtlas(REG.tornoCNC));
    bloco(G, cx + 1.02, 1.15, cz + 0.72, 0.42, 0.75, 0.14, "#2b3038");
    lote(G, "imagem").quad([cx + 1.02 - 0.19, 0.8, cz + 0.791], [0.38, 0, 0], [0, 0.66, 0], cinza(0.95), uvAtlas(REG.cncPainel));
    sombra(G, [cx - 1.25, cx + 1.25, cz - 0.72, cz + 0.72], 0.55, 0.18);
  }

  /** Banner de chão (roll-up). */
  function banner(x, z) {
    const G = "piso";
    bloco(G, x, 0.04, z, 0.2, 0.08, 0.9, "#c9ced4");
    tubo(G, [x, 0.08, z], [x, 2.08, z], 0.01, "#c9ced4", 6);
    imagemX(G, REG.banner, x - 0.012, 1.08, z, 0.85, 2.0, -1, 0.92);
    imagemX(G, REG.banner, x + 0.012, 1.08, z, 0.85, 2.0, 1, 0.6);
  }

  /**
   * Escritório envidraçado (UpLab) junto à parede da frente: ocupa x ∈ [x0, x1] e z ∈ [zv, parede].
   * Fachada de vidro em z = zv (voltada para o corredor) com porta, lateral de vidro em x = x1, faixa vermelha,
   * forro, mesas, cadeiras, armários e placas UpLab na parede, vistas através das portas de vidro.
   */
  function escritorio(x0, x1, zv) {
    const G = "escritorio";
    const zp = h; // parede da frente
    const xc = (x0 + x1) / 2;
    const zc = (zv + zp) / 2;
    const alt = 3.0;
    const MONTANTE = "#f4f5f4";
    const VERMELHO = "#e30613";
    // forro: some na vista de cima, para ver o escritório como numa maquete
    bloco("forro", xc, alt + 0.06, zc, x1 - x0, 0.12, zp - zv, "#eceeed");
    for (const x of [-5.6, -2.8, 0, 2.8, 5.6]) lote("forro", "led").quad([x - 0.3, alt - 0.002, zc - 0.3], [0.6, 0, 0], [0, 0, 0.6], [1, 1, 1]);
    // fachada de vidro em z = zv, com montantes a cada ~1,3 m
    const vidro = lote(G, "vidro");
    const n = Math.round((x1 - x0) / 1.3);
    const passo = (x1 - x0) / n;
    for (let i = 0; i <= n; i++) bloco(G, x0 + i * passo, alt / 2, zv, 0.05, alt, 0.07, MONTANTE);
    bloco(G, xc, 0.03, zv, x1 - x0, 0.06, 0.07, MONTANTE);
    bloco(G, xc, alt - 0.03, zv, x1 - x0, 0.06, 0.07, MONTANTE);
    vidro.quad([x0, 0.06, zv], [x1 - x0, 0, 0], [0, alt - 0.12, 0], [1, 1, 1]);
    // lateral de vidro em x = x1, até a parede (só quando o escritório não vai de parede a parede)
    const lateralVidro = x1 < h - 0.01;
    if (lateralVidro) {
      for (const z of [zv, zc]) bloco(G, x1, alt / 2, z, 0.07, alt, 0.05, MONTANTE);
      bloco(G, x1, 0.03, zc, 0.07, 0.06, zp - zv, MONTANTE);
      vidro.quad([x1, 0.06, zv], [0, 0, zp - zv], [0, alt - 0.12, 0], [1, 1, 1]);
    }
    // faixa vermelha (adesivo) com um friso fino, dos dois lados do vidro
    for (const s of [-1, 1]) {
      bloco(G, xc, 2.13, zv + s * 0.004, x1 - x0, 0.22, 0.002, VERMELHO);
      bloco(G, xc, 1.2, zv + s * 0.004, x1 - x0, 0.03, 0.002, VERMELHO);
      if (!lateralVidro) continue;
      bloco(G, x1 + s * 0.004, 2.13, zc, 0.002, 0.22, zp - zv, VERMELHO);
      bloco(G, x1 + s * 0.004, 1.2, zc, 0.002, 0.03, zp - zv, VERMELHO);
    }
    // portas de vidro com puxador, perto das duas pontas
    for (const xPorta of [x0 + passo / 2 + 0.45, x1 - passo / 2 - 0.45]) {
      tubo(G, [xPorta, 0.9, zv + 0.06], [xPorta, 1.5, zv + 0.06], 0.014, "#c9ced4", 8);
      bloco(G, xPorta, 0.25, zv, 0.05, 0.1, 0.09, "#c9ced4");
    }
    // placas UpLab na parede (onde ficavam as do SENAI), entre as mesas, vistas através das portas de vidro
    for (const x of [-3.7, 2.3]) {
      bloco(G, x, 1.62, zp - 0.012, 0.86, 0.82, 0.02, "#2b2b2b");
      imagemZ(G, REG.uplab, x, 1.62, zp - 0.023, 0.8, 0.78, -1, 0.95);
    }
    // armários brancos baixos junto à parede
    bloco(G, 5.6, 0.45, zp - 0.3, 2.6, 0.9, 0.55, "#eef0ef");
    for (let i = 0; i < 4; i++) bloco(G, 4.6 + i * 0.65, 0.62, zp - 0.585, 0.012, 0.16, 0.02, "#59626d");
    // mesas com monitor e cadeiras pretas
    for (const x of [-5.2, -2.2, 0.8, 3.8]) {
      bloco(G, x, 0.74, 5.75, 1.4, 0.04, 0.7, "#6d5844");
      for (const sx of [-0.65, 0.65]) bloco(G, x + sx, 0.37, 5.75, 0.05, 0.72, 0.6, "#3a3f45");
      bloco(G, x, 1.0, 5.95, 0.56, 0.34, 0.03, "#1d1f22");
      bloco(G, x, 0.79, 5.95, 0.06, 0.1, 0.06, "#1d1f22");
      cadeira(G, x, 5.25, [0, -1]);
    }
    for (const x of [-6.5, -0.7, 6.2]) cadeira(G, x, 5.4, [0, 1]);
    sombra(G, [x0, x1, zv, zp], 0.25, 0, 0.0045);
  }

  /** Cadeira preta; `encosto` = direção [dx, dz] em que fica o encosto. */
  function cadeira(G, x, z, [ex, ez]) {
    const PRETO = "#1d1f22";
    bloco(G, x, 0.47, z, 0.5, 0.08, 0.48, PRETO);
    bloco(G, x + ex * 0.24, 0.78, z + ez * 0.24, ex ? 0.06 : 0.48, 0.55, ex ? 0.48 : 0.06, PRETO);
    tubo(G, [x, 0.08, z], [x, 0.44, z], 0.025, "#59626d", 8);
    bloco(G, x, 0.06, z, 0.56, 0.03, 0.05, "#59626d");
    bloco(G, x, 0.06, z, 0.05, 0.03, 0.56, "#59626d");
  }

  // ---------- materiais e malhas
  const matCasca = new StandardMaterial("sala_casca", scene);
  matCasca.diffuseColor = new Color3(0.35, 0.35, 0.35);
  matCasca.emissiveColor = new Color3(0.72, 0.72, 0.72);
  matCasca.specularColor = Color3.Black();
  const matAbobada = new StandardMaterial("sala_abobada", scene);
  matAbobada.diffuseTexture = criarPaineisAbobada(scene);
  matAbobada.diffuseColor = new Color3(0.35, 0.35, 0.35);
  matAbobada.emissiveColor = new Color3(0.74, 0.74, 0.74);
  matAbobada.specularColor = Color3.Black();
  // sólidos: iluminados pela luz ambiente (o sol fica de fora) com brilho próprio
  const matSolido = new StandardMaterial("sala_solidos", scene);
  matSolido.diffuseColor = new Color3(1, 1, 1);
  matSolido.emissiveColor = new Color3(0.38, 0.38, 0.38);
  matSolido.specularColor = new Color3(0.1, 0.1, 0.1);
  matSolido.specularPower = 40;
  // imagens (atlas), placa da escola e efeitos do piso: sem sombreamento, cor = textura × cor do vértice
  const semLuz = (nome, textura) => {
    const m = new StandardMaterial(nome, scene);
    m.diffuseTexture = textura;
    m.diffuseColor = Color3.Black();
    m.emissiveColor = Color3.White();
    m.specularColor = Color3.Black();
    m.disableLighting = true;
    return m;
  };
  const matImagem = semLuz("sala_imagens", criarAtlas(scene));
  const matPlaca = semLuz("sala_placaEscola", criarPlacaEscola(scene));
  const matEfeito = semLuz("sala_efeitos", criarTexturaEfeitos(scene));
  matEfeito.useAlphaFromDiffuseTexture = true;
  matEfeito.disableDepthWrite = true;
  const matVidro = new StandardMaterial("sala_vidro", scene);
  matVidro.diffuseColor = new Color3(0.78, 0.88, 0.92);
  matVidro.emissiveColor = new Color3(0.3, 0.34, 0.36);
  matVidro.specularColor = new Color3(0.7, 0.7, 0.7);
  matVidro.specularPower = 96;
  matVidro.alpha = 0.13;
  matVidro.backFaceCulling = false;
  const matLed = new StandardMaterial("sala_led", scene);
  matLed.emissiveColor = new Color3(1, 1, 1);
  matLed.disableLighting = true;
  const MATERIAL = {
    casca: matCasca,
    abobada: matAbobada,
    solido: matSolido,
    imagem: matImagem,
    placa: matPlaca,
    efeito: matEfeito,
    vidro: matVidro,
    led: matLed,
  };

  const malhasPorGrupo = new Map();
  for (const { grupo, tipo, geo } of lotes.values()) {
    if (geo.vazio) continue;
    const m = geo.construir(scene, `sala_${grupo}_${tipo}`, MATERIAL[tipo]);
    if (tipo === "efeito") m.hasVertexAlpha = true;
    m.parent = grupo === "mundo" ? raiz : salaGiro;
    m.isPickable = false;
    m.freezeWorldMatrix();
    for (const luz of luzesExcluidas) luz?.excludedMeshes.push(m);
    if (!malhasPorGrupo.has(grupo)) malhasPorGrupo.set(grupo, { malhas: [], visivel: true });
    malhasPorGrupo.get(grupo).malhas.push(m);
  }
  // casca e imagens só por dentro; sólidos dos dois lados (peças finas vistas de qualquer ângulo)
  matSolido.backFaceCulling = false;

  // ---------- vista de maquete: esconde o que fica entre a câmera (fora da sala ou no escritório) e o torno
  const DENTRO = {
    fundo: (p) => p.z > -h,
    frente: (p) => p.z < h,
    esquerda: (p) => p.x > -h,
    direita: (p) => p.x < h,
    teto: (p) => p.y < yTeto(p.z),
    piso: () => true,
    mundo: () => true,
    escritorio: (p) => p.z < ESCRITORIO.z0 || p.x > ESCRITORIO.x1 || p.y > 3.2,
    forro: (p) => p.y < 3.1 && (p.z < ESCRITORIO.z0 || p.x > ESCRITORIO.x1),
  };
  scene.onBeforeRenderObservable.add(() => {
    const cam = scene.activeCamera;
    if (!cam || !raiz.isEnabled()) return;
    // posição da câmera no referencial da sala (girada −90° em relação ao do torno)
    const g = cam.globalPosition;
    const p = { x: g.z, y: g.y, z: -g.x };
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

/** Giro da sala em torno do torno (rad): leva o lado "frente" da sala (vidro do UpLab) para −X, onde fica o cabeçote. */
export const GIRO_SALA = -Math.PI / 2;

// ---------- utilitários
const CORES = new Map();
function rgb(hex) {
  if (!CORES.has(hex)) {
    const c = Color3.FromHexString(hex);
    CORES.set(hex, [c.r, c.g, c.b]);
  }
  return CORES.get(hex);
}
const cinza = (v) => [v, v, v];
const cruz = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const menos = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

/**
 * Lote de geometria: quadriláteros, caixas e prismas com cor por vértice (e UV opcional) → uma malha.
 * Um quadrilátero o + s·u + t·v (s, t ∈ [0, 1]) fica visível do lado para onde aponta n = u × v.
 */
function criarLote() {
  const P = [];
  const N = [];
  const C = [];
  const UV = [];
  const I = [];
  const api = {
    quad(o, u, v, cor, uv = [0, 0, 1, 1]) {
      const p = [o, [o[0] + u[0], o[1] + u[1], o[2] + u[2]], [o[0] + u[0] + v[0], o[1] + u[1] + v[1], o[2] + u[2] + v[2]], [o[0] + v[0], o[1] + v[1], o[2] + v[2]]];
      const uvs = [[uv[0], uv[1]], [uv[2], uv[1]], [uv[2], uv[3]], [uv[0], uv[3]]];
      return api.quad4(p, cor, uvs);
    },
    /** Quadrilátero por 4 cantos (p0 → p1 → p2 → p3); visível do lado de (p1 − p0) × (p3 − p0). */
    quad4(p, cor, uvs = [[0, 0], [1, 0], [1, 1], [0, 1]]) {
      const n = cruz(menos(p[1], p[0]), menos(p[3], p[0]));
      const len = Math.hypot(...n) || 1;
      const base = P.length / 3;
      const cores = Array.isArray(cor[0]) ? cor : [cor, cor, cor, cor];
      for (let k = 0; k < 4; k++) {
        P.push(...p[k]);
        N.push(n[0] / len, n[1] / len, n[2] / len);
        const c = cores[k];
        C.push(c[0], c[1], c[2], c[3] ?? 1);
        UV.push(...uvs[k]);
      }
      I.push(base, base + 2, base + 1, base, base + 3, base + 2);
      return api;
    },
    caixa(x0, x1, y0, y1, z0, z1, hex) {
      return api.prisma([x0, y0, z0], [x1 - x0, 0, 0], [0, y1 - y0, 0], [0, 0, z1 - z0], hex);
    },
    /** Paralelepípedo com canto `o` e arestas a, b, c (faces voltadas para fora). */
    prisma(o, a, b, c, hex) {
      const cor = typeof hex === "string" ? rgb(hex) : hex;
      if (cruz(a, b)[0] * c[0] + cruz(a, b)[1] * c[1] + cruz(a, b)[2] * c[2] < 0) [a, b] = [b, a];
      const mais = (...v) => v.reduce((s, w) => [s[0] + w[0], s[1] + w[1], s[2] + w[2]]);
      api.quad(o, b, a, cor);
      api.quad(mais(o, c), a, b, cor);
      api.quad(o, c, b, cor);
      api.quad(mais(o, a), b, c, cor);
      api.quad(o, a, c, cor);
      api.quad(mais(o, b), c, a, cor);
      return api;
    },
    /** Prisma (cilindro) do ponto a ao ponto b, com tampas. */
    cilindro(a, b, r, hex, lados = 10) {
      const c = rgb(hex);
      const eixo = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const L = Math.hypot(...eixo);
      const d = eixo.map((v) => v / L);
      const ref = Math.abs(d[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
      const e1 = cruz(d, ref).map((v, _, arr) => v / Math.hypot(...arr));
      const e2 = cruz(d, e1);
      const anel = (k) => {
        const t = (k / lados) * Math.PI * 2;
        return [0, 1, 2].map((i) => r * (Math.cos(t) * e1[i] + Math.sin(t) * e2[i]));
      };
      for (let k = 0; k < lados; k++) {
        const p = anel(k);
        const q = anel(k + 1);
        const base = P.length / 3;
        for (const [off, fim] of [[p, a], [q, a], [q, b], [p, b]]) {
          P.push(fim[0] + off[0], fim[1] + off[1], fim[2] + off[2]);
          N.push(off[0] / r, off[1] / r, off[2] / r);
          C.push(...c, 1);
          UV.push(0, 0);
        }
        I.push(base, base + 1, base + 2, base, base + 2, base + 3, base, base + 2, base + 1, base, base + 3, base + 2);
        for (const fim of [a, b]) {
          const cb = P.length / 3;
          for (const off of [[0, 0, 0], p, q]) {
            P.push(fim[0] + off[0], fim[1] + off[1], fim[2] + off[2]);
            N.push(...(fim === a ? d.map((v) => -v) : d));
            C.push(...c, 1);
            UV.push(0, 0);
          }
          I.push(cb, cb + 1, cb + 2, cb, cb + 2, cb + 1);
        }
      }
      return api;
    },
    get vazio() {
      return I.length === 0;
    },
    construir(scene, nome, material) {
      const malha = new Mesh(nome, scene);
      const vd = new VertexData();
      vd.positions = P;
      vd.normals = N;
      vd.colors = C;
      vd.uvs = UV;
      vd.indices = I;
      vd.applyToMesh(malha);
      malha.material = material;
      return malha;
    },
  };
  return api;
}

/** "800" em vermelho, no lugar dos dígitos gravados no CAD ("125…"): mesma posição, fundo transparente. Referencial da sala. */
function criarRotuloD800(scene, padre) {
  const L = 512;
  const A = 214;
  const tex = new DynamicTexture("sala_d800Tex", { width: L, height: A }, scene, true);
  tex.hasAlpha = true;
  const ctx = tex.getContext();
  ctx.clearRect(0, 0, L, A);
  ctx.save();
  ctx.translate(L, 0); // plano visto de +z na cena destra: a imagem sai espelhada, então desenha invertida
  ctx.scale(-1, 1);
  ctx.fillStyle = "#e5382a";
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.font = `700 ${Math.round(A * 1.0)}px Arial, "Helvetica Neue", Helvetica, sans-serif`;
  ctx.fillText("800", L / 2, A * 0.9, L * 0.98);
  ctx.restore();
  tex.update();
  const plano = MeshBuilder.CreatePlane("sala_d800", { width: 0.233, height: 0.097 }, scene);
  plano.parent = padre;
  plano.position.set(4.1915, 1.5375, -4.546); // onde ficavam os dígitos "125" (peça fina na face da frente)
  plano.rotation.y = Math.PI; // voltado para +z da sala (a frente da máquina)
  plano.isPickable = false;
  const mat = new StandardMaterial("sala_d800Mat", scene);
  mat.diffuseColor = Color3.Black();
  mat.emissiveTexture = tex;
  mat.opacityTexture = tex;
  mat.disableLighting = true;
  mat.specularColor = Color3.Black();
  plano.material = mat;
  plano.freezeWorldMatrix();
}

/**
 * Máquina da oficina vinda de um modelo CAD (GLB), carregada em segundo plano: girada `rx` rad em X e `ry` em Y,
 * apoiada no piso e centrada em (x, z). As luzes e câmeras do arquivo são descartadas (não mudam a iluminação
 * do torno); as peças não são clicáveis nem projetam sombra do sol (o custo do mapa de sombras não muda).
 * Fica dentro da sala: some em RA junto com ela. Se o arquivo faltar, a oficina continua sem ela.
 */
async function carregarMaquinaGLB(scene, raiz, padre, url, { x, z, rx = 0, ry = 0 }, luzesExcluidas, aoCarregar = null) {
  try {
    const c = await LoadAssetContainerAsync(url, scene, {
      pluginOptions: { gltf: { extensionOptions: { KHR_lights_punctual: { enabled: false } } } },
    });
    for (const cam of [...c.cameras]) cam.dispose();
    for (const luz of [...c.lights]) luz.dispose();
    c.addAllToScene();
    const pivo = new TransformNode("sala_maquinaGLB", scene);
    c.meshes[0].parent = pivo;
    pivo.rotation.set(rx, ry, 0);
    // limites medidos fora do nó pai (que pode estar girado); depois encaixa no pai com (x, z) no referencial dele
    const { min, max } = pivo.getHierarchyBoundingVectors(true, (m) => m.getTotalVertices?.() > 0);
    pivo.position.set(x - (min.x + max.x) / 2, -min.y, z - (min.z + max.z) / 2);
    pivo.parent = padre;
    const malhas = c.meshes.filter((m) => m.getTotalVertices() > 0);
    for (const m of malhas) {
      m.isPickable = false;
      for (const luz of luzesExcluidas) luz?.excludedMeshes.push(m);
    }
    // peças paradas: congela as matrizes depois do primeiro quadro já posicionado
    scene.onAfterRenderObservable.addOnce(() => {
      for (const m of malhas) m.freezeWorldMatrix();
      for (const mat of c.materials) mat.freeze();
    });
    aoCarregar?.(c);
    raiz.metadata = { ...raiz.metadata, maquinaGLB: { url, pecas: malhas.length }, carregadas: (raiz.metadata?.carregadas ?? 0) + 1 };
  } catch (erro) {
    console.warn(`Não foi possível carregar ${url}: a oficina segue sem essa máquina.`, erro);
  }
}

// ---------- atlas: todas as imagens da sala numa textura só (uma chamada de desenho por grupo)
const ATLAS = 2048;
const REG = {
  placaUsinagem: [0, 0, 1024, 240],
  quadro: [1032, 0, 1016, 448],
  janela: [0, 264, 512, 302],
  saida: [520, 264, 256, 96],
  inflamavel: [520, 376, 256, 128],
  ferramentas: [0, 576, 768, 384],
  bandeira: [776, 520, 480, 336],
  uplab: [776, 864, 232, 224],
  portaSaida: [1572, 456, 300, 630],
  cncPainel: [1880, 456, 160, 232],
  relogio: [1880, 696, 160, 160],
  extintor: [0, 1096, 256, 320],
  oculos: [264, 1096, 256, 320],
  quadroEletrico: [528, 1096, 320, 400],
  ventilador: [1504, 1096, 256, 256],
  auricular: [1768, 1096, 256, 320],
  cartaz5S: [0, 1624, 520, 400],
  tornoCNC: [528, 1624, 640, 346],
  banner: [1176, 1624, 170, 400],
  tapete: [1356, 1624, 512, 228],
  hidrante: [1876, 1624, 160, 196],
};
// recorte de uma região, 1,5 px para dentro (evita pegar a vizinha na filtragem)
const uvDe = (W, Hh) => ([x, y, w, hh]) => [(x + 1.5) / W, 1 - (y + hh - 1.5) / Hh, (x + w - 1.5) / W, 1 - (y + 1.5) / Hh];
const uvAtlas = uvDe(ATLAS, ATLAS);

function criarAtlas(scene) {
  const tex = new DynamicTexture("sala_atlas", { width: ATLAS, height: ATLAS }, scene, true);
  const ctx = tex.getContext();
  ctx.fillStyle = "#808080";
  ctx.fillRect(0, 0, ATLAS, ATLAS);
  const regiao = (reg, desenhar, escala = 1) => {
    const [x, y, w, hh] = reg;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, hh);
    ctx.clip();
    ctx.translate(x, y);
    ctx.scale(escala, escala);
    desenhar(ctx, w / escala, hh / escala);
    ctx.restore();
  };
  regiao(REG.placaUsinagem, desenharPlacaUsinagem);
  regiao(REG.quadro, desenharQuadro);
  regiao(REG.janela, desenharJanela);
  regiao(REG.saida, desenharSaida, 0.5);
  regiao(REG.inflamavel, desenharInflamavel);
  regiao(REG.ferramentas, desenharPainelFerramentas, 1.5);
  regiao(REG.bandeira, desenharBandeira);
  regiao(REG.uplab, desenharUpLab);
  regiao(REG.portaSaida, (c, w, hh) => desenharPorta(c, w, hh, true));
  regiao(REG.cncPainel, desenharPainelCNC);
  regiao(REG.relogio, desenharRelogio);
  regiao(REG.extintor, desenharExtintor);
  regiao(REG.oculos, desenharOculos);
  regiao(REG.quadroEletrico, desenharQuadroEletrico);
  regiao(REG.ventilador, desenharVentilador);
  regiao(REG.auricular, desenharAuricular);
  regiao(REG.cartaz5S, desenharCartaz5S);
  regiao(REG.tornoCNC, desenharTornoCNC);
  regiao(REG.banner, desenharBanner);
  regiao(REG.tapete, desenharTapete);
  regiao(REG.hidrante, desenharHidrante);
  tex.update();
  tex.anisotropicFilteringLevel = 4;
  return tex;
}

let promessaLogo = null;
function carregarLogo(aoCarregar) {
  promessaLogo ??= new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = `./${ESCOLA.logoUrl}`;
  });
  promessaLogo.then(aoCarregar, () => console.warn(`Logo não encontrada: ${ESCOLA.logoUrl} (fica "SENAI" em texto)`));
}

// ---------- placa da escola: textura própria (mais nítida que o atlas), redesenhada quando a logo carrega
function criarPlacaEscola(scene) {
  const tex = new DynamicTexture("sala_placaEscola", { width: 2048, height: 512 }, scene, true);
  const desenhar = (logo) => {
    desenharPlacaEscola(tex.getContext(), 2048, 512, logo);
    tex.update();
  };
  desenhar(null);
  carregarLogo(desenhar);
  tex.anisotropicFilteringLevel = 4;
  return tex;
}

// ---------- painéis da abóbada: creme, com juntas em losango (repete a cada 2,4 m)
function criarPaineisAbobada(scene) {
  const n = 512;
  const tex = new DynamicTexture("sala_paineisAbobada", { width: n, height: n }, scene, true);
  const ctx = tex.getContext();
  ctx.fillStyle = "#ddd0b6";
  ctx.fillRect(0, 0, n, n);
  // cada losango com um leve degradê (os painéis não ficam perfeitamente no mesmo plano)
  const m = n / 2;
  for (let i = -1; i <= 2; i++)
    for (let j = -1; j <= 2; j++) {
      const cx = i * m + (j % 2 ? m / 2 : 0);
      const cy = j * (m / 2);
      const g = ctx.createLinearGradient(cx - m / 2, cy, cx + m / 2, cy);
      g.addColorStop(0, "rgba(120,100,70,0.06)");
      g.addColorStop(1, "rgba(255,250,235,0.06)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(cx, cy - m / 2);
      ctx.lineTo(cx + m / 2, cy);
      ctx.lineTo(cx, cy + m / 2);
      ctx.lineTo(cx - m / 2, cy);
      ctx.closePath();
      ctx.fill();
    }
  ctx.strokeStyle = "rgba(110,95,70,0.35)";
  ctx.lineWidth = 2;
  for (let k = -n; k <= 2 * n; k += m / 2) {
    ctx.beginPath();
    ctx.moveTo(k, 0);
    ctx.lineTo(k + n, n);
    ctx.moveTo(k, n);
    ctx.lineTo(k + n, 0);
    ctx.stroke();
  }
  tex.update();
  tex.wrapU = tex.wrapV = Texture.WRAP_ADDRESSMODE;
  tex.anisotropicFilteringLevel = 4;
  return tex;
}

// ---------- efeitos do piso: mancha de luz, sombra de contato e escurecimento junto às paredes
const EFEITO = { luz: [0, 0, 256, 256], sombra: [256, 0, 256, 256], borda: [512, 0, 256, 256] };
const uvEfeito = uvDe(768, 256);

function criarTexturaEfeitos(scene) {
  const W = 768;
  const S = 256;
  const tex = new DynamicTexture("sala_efeitos", { width: W, height: S }, scene, true);
  tex.hasAlpha = true;
  const ctx = tex.getContext();
  const img = ctx.createImageData(W, S);
  const suave = (t) => {
    const k = Math.min(1, Math.max(0, t));
    return k * k * (3 - 2 * k);
  };
  const por = (x, y, [r, g, b], a) => {
    const i = (y * W + x) * 4;
    img.data[i] = r;
    img.data[i + 1] = g;
    img.data[i + 2] = b;
    img.data[i + 3] = Math.round(255 * Math.min(1, Math.max(0, a)));
  };
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const px = (x + 0.5) / S - 0.5;
      const py = (y + 0.5) / S - 0.5;
      const r = Math.hypot(px, py) / 0.5;
      por(x, y, [255, 249, 238], Math.pow(1 - suave(r), 1.6));
      const dx = Math.max(Math.abs(px) - 0.26, 0);
      const dy = Math.max(Math.abs(py) - 0.26, 0);
      por(x + S, y, [14, 12, 10], 1 - suave(Math.hypot(dx, dy) / 0.22));
      const t = 1 - (y + 0.5) / S;
      por(x + 2 * S, y, [14, 12, 10], Math.pow(1 - t, 2.2));
    }
  ctx.putImageData(img, 0, 0);
  tex.update();
  return tex;
}

// ---------- desenhos (canvas 2D, coordenadas locais de cada região)
const FONTE = "Segoe UI, Roboto, Arial, sans-serif";

/** Maior fonte (px) até `max` em que o texto cabe em `largura`. */
function ajustarFonte(ctx, texto, peso, max, largura) {
  let tam = max;
  do ctx.font = `${peso} ${tam}px ${FONTE}`;
  while (ctx.measureText(texto).width > largura && --tam > 10);
  return tam;
}

function desenharPlacaEscola(ctx, w, h, logo) {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#0d3b85";
  ctx.fillRect(0, h - 44, w, 12);
  ctx.fillStyle = ESCOLA.destaque;
  ctx.fillRect(0, h - 32, w, 32);
  const logoH = Math.round(h * 0.44);
  const logoW = Math.round(logoH * ESCOLA.logoAspecto);
  const logoX = 70;
  const logoY = Math.round((h - 44 - logoH) / 2);
  desenharLogoEm(ctx, logo, logoX, logoY, logoW, logoH);
  const x0 = logoX + logoW + 90;
  const largura = w - x0 - 60;
  ctx.fillStyle = "#d5dae0";
  ctx.fillRect(x0 - 46, 70, 6, h - 44 - 140);
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#4a5866";
  ajustarFonte(ctx, ESCOLA.unidade, 600, 76, largura);
  ctx.fillText(ESCOLA.unidade, x0, h * 0.23);
  ctx.fillStyle = "#16202b";
  ajustarFonte(ctx, ESCOLA.nome, 800, 112, largura);
  ctx.fillText(ESCOLA.nome, x0, h * 0.47);
  ctx.fillStyle = "#0d3b85";
  ajustarFonte(ctx, ESCOLA.ambiente, 700, 64, largura);
  ctx.fillText(ESCOLA.ambiente, x0, h * 0.7);
}

/** Logo oficial (ou "SENAI" em texto sobre o vermelho enquanto carrega). */
function desenharLogoEm(ctx, logo, x, y, w, h) {
  if (logo) {
    ctx.drawImage(logo, x, y, w, h);
    return;
  }
  ctx.fillStyle = ESCOLA.destaque;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `italic 900 ${Math.round(h * 0.78)}px ${FONTE}`;
  ctx.fillText(ESCOLA.rede, x + w / 2, y + h / 2 + 4);
}

/** Placa do UpLab (fundo grafite, "Up" vermelho e "Lab" branco, selo SENAI embaixo), como no escritório real. */
function desenharUpLab(ctx, w, h) {
  ctx.fillStyle = "#2b2b2b";
  ctx.fillRect(0, 0, w, h);
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.font = `800 ${Math.round(h * 0.29)}px ${FONTE}`;
  const [lu, ll] = [ctx.measureText("Up").width, ctx.measureText("Lab").width];
  const x0 = (w - lu - ll) / 2;
  ctx.fillStyle = "#e4252d";
  ctx.fillText("Up", x0, h * 0.38);
  ctx.fillStyle = "#f4f4f4";
  ctx.fillText("Lab", x0 + lu, h * 0.38);
  // selo SENAI: branco com letras pretas e frisos nas laterais
  const [bw, bh] = [w * 0.48, h * 0.15];
  const [bx, by] = [(w - bw) / 2, h * 0.64];
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(bx, by, bw, bh);
  ctx.fillStyle = "#1d1d1d";
  ctx.textAlign = "center";
  ctx.font = `italic 900 ${Math.round(bh * 0.8)}px ${FONTE}`;
  ctx.fillText("SENAI", w / 2, by + bh / 2 + 1);
  for (let i = 0; i < 4; i++) {
    const y = by + 4 + i * ((bh - 8) / 3);
    ctx.fillRect(bx + 3, y, bw * 0.07, 1.5);
    ctx.fillRect(bx + bw - 3 - bw * 0.07, y, bw * 0.07, 1.5);
  }
}

function desenharPlacaUsinagem(ctx, w, h) {
  ctx.fillStyle = "#4a1d1f";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#d71920";
  ctx.fillRect(0, 0, w, 18);
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ajustarFonte(ctx, "Mecânica de Usinagem", 700, 104, w - 90);
  ctx.fillText("Mecânica de Usinagem", w / 2, h / 2 + 12);
}

function desenharBandeira(ctx, w, h) {
  ctx.fillStyle = "#009c3b";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#ffdf00";
  ctx.beginPath();
  ctx.moveTo(w / 2, h * 0.08);
  ctx.lineTo(w * 0.92, h / 2);
  ctx.lineTo(w / 2, h * 0.92);
  ctx.lineTo(w * 0.08, h / 2);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#002776";
  ctx.beginPath();
  ctx.arc(w / 2, h / 2, h * 0.25, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  ctx.arc(w / 2, h / 2, h * 0.25, 0, Math.PI * 2);
  ctx.clip();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = h * 0.045;
  ctx.beginPath();
  ctx.arc(w / 2 - h * 0.06, h * 0.95, h * 0.5, Math.PI * 1.33, Math.PI * 1.8);
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  for (let i = 0; i < 18; i++) ctx.fillRect(w / 2 - h * 0.2 + ((i * 37) % (h * 0.4)), h / 2 + 4 + ((i * 23) % (h * 0.18)), 3, 3);
  ctx.restore();
}

function desenharJanela(ctx, w, h) {
  const ceu = ctx.createLinearGradient(0, 0, 0, h);
  ceu.addColorStop(0, "#8dbbe6");
  ceu.addColorStop(0.6, "#cfe3f2");
  ceu.addColorStop(1, "#e4edf2");
  ctx.fillStyle = ceu;
  ctx.fillRect(0, 0, w, h);
  const mancha = (x, y, r, cor, a) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${cor},${a})`);
    g.addColorStop(1, `rgba(${cor},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
  };
  for (let i = 0; i < 7; i++) mancha(Math.random() * w, h * (0.12 + Math.random() * 0.3), 40 + Math.random() * 50, "255,255,255", 0.55);
  for (let i = 0; i < 70; i++) {
    const g = 95 + Math.random() * 60;
    mancha(Math.random() * w, h * (0.7 + Math.random() * 0.32), 18 + Math.random() * 34, `${40 + Math.random() * 40},${g},${50 + Math.random() * 30}`, 0.7);
  }
  ctx.fillStyle = "rgba(255,255,255,0.16)";
  ctx.beginPath();
  ctx.moveTo(w * 0.08, 0);
  ctx.lineTo(w * 0.4, 0);
  ctx.lineTo(w * 0.2, h);
  ctx.lineTo(0, h);
  ctx.lineTo(0, h * 0.4);
  ctx.closePath();
  ctx.fill();
  const borda = ctx.createLinearGradient(0, 0, 0, 16);
  borda.addColorStop(0, "rgba(30,40,50,0.35)");
  borda.addColorStop(1, "rgba(30,40,50,0)");
  ctx.fillStyle = borda;
  ctx.fillRect(0, 0, w, 16);
}

function desenharPainelFerramentas(ctx, w, h) {
  ctx.fillStyle = "#c8a46a";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "rgba(70,48,24,0.45)";
  for (let x = 10; x < w; x += 18) for (let y = 10; y < h; y += 18) ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
  const ferramentas = (sombra) => {
    const cor = (c) => (sombra ? "rgba(40,28,14,0.35)" : c);
    ctx.lineCap = "round";
    for (let i = 0; i < 6; i++) {
      const x = 34 + i * 24;
      const fim = 130 + i * 12;
      ctx.strokeStyle = cor("#8d959d");
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(x, 44);
      ctx.lineTo(x, fim);
      ctx.stroke();
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(x, 36, 9, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(x, fim + 8, 9, Math.PI * 1.25, Math.PI * 1.75, true);
      ctx.stroke();
    }
    ctx.fillStyle = cor("#8a5a2b");
    ctx.fillRect(232, 64, 14, 150);
    ctx.fillStyle = cor("#3a4048");
    ctx.fillRect(204, 44, 70, 26);
    for (const [i, c] of ["#d71920", "#f2c12e", "#1c7ed6"].entries()) {
      const x = 300 + i * 30;
      ctx.fillStyle = cor(c);
      ctx.beginPath();
      ctx.roundRect(x - 8, 40, 16, 56, 6);
      ctx.fill();
      ctx.strokeStyle = cor("#9aa0a6");
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(x, 96);
      ctx.lineTo(x, 170 - i * 10);
      ctx.stroke();
    }
    ctx.strokeStyle = cor("#5c636b");
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(392, 40);
    ctx.lineTo(400, 92);
    ctx.moveTo(408, 40);
    ctx.lineTo(400, 92);
    ctx.stroke();
    ctx.strokeStyle = cor("#d71920");
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.moveTo(400, 92);
    ctx.lineTo(390, 180);
    ctx.moveTo(400, 92);
    ctx.lineTo(412, 180);
    ctx.stroke();
    ctx.fillStyle = cor("#c9ced4");
    ctx.fillRect(446, 40, 7, 190);
    ctx.beginPath();
    ctx.moveTo(446, 40);
    ctx.lineTo(474, 40);
    ctx.lineTo(482, 70);
    ctx.lineTo(453, 58);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(441, 96, 17, 34);
    ctx.beginPath();
    ctx.moveTo(458, 100);
    ctx.lineTo(476, 104);
    ctx.lineTo(482, 128);
    ctx.lineTo(458, 112);
    ctx.closePath();
    ctx.fill();
    if (!sombra) {
      ctx.fillStyle = "#59626d";
      for (let y = 136; y < 226; y += 6) ctx.fillRect(447, y, y % 30 === 16 ? 5 : 3, 1);
    }
    for (let i = 0; i < 2; i++) {
      ctx.fillStyle = cor("#6a7178");
      ctx.fillRect(26 + i * 30, 182, 9, 60);
      ctx.fillStyle = cor("#3a2a1a");
      ctx.fillRect(24 + i * 30, 160, 13, 24);
    }
  };
  ctx.save();
  ctx.translate(3, 4);
  ferramentas(true);
  ctx.restore();
  ferramentas(false);
}

function desenharQuadro(ctx, w, h) {
  const fundo = ctx.createLinearGradient(0, 0, w, h);
  fundo.addColorStop(0, "#f9fbfc");
  fundo.addColorStop(0.5, "#f1f4f6");
  fundo.addColorStop(1, "#f8fafb");
  ctx.fillStyle = fundo;
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

function desenharAuricular(ctx, w, h) {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#1565c0";
  ctx.beginPath();
  ctx.arc(w / 2, 118, 96, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#ffffff";
  ctx.fillStyle = "#ffffff";
  ctx.lineWidth = 12;
  ctx.beginPath();
  ctx.arc(w / 2, 128, 52, Math.PI * 1.05, Math.PI * 1.95);
  ctx.stroke();
  for (const x of [w / 2 - 56, w / 2 + 56]) {
    ctx.beginPath();
    ctx.roundRect(x - 16, 112, 32, 56, 12);
    ctx.fill();
  }
  ctx.fillStyle = "#0d3b85";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `800 25px ${FONTE}`;
  ctx.fillText("USO OBRIGATÓRIO", w / 2, 252);
  ctx.font = `700 21px ${FONTE}`;
  ctx.fillText("PROTETOR AURICULAR", w / 2, 286);
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

function desenharHidrante(ctx, w, h) {
  ctx.fillStyle = "#c8102e";
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "#8e0b20";
  ctx.lineWidth = 6;
  ctx.strokeRect(6, 6, w - 12, h - 12);
  ctx.fillStyle = "rgba(220,235,240,0.85)"; // visor
  ctx.fillRect(18, 18, w - 36, h * 0.5);
  ctx.strokeStyle = "#c8102e";
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.arc(w / 2, 18 + h * 0.25, h * 0.17, 0, Math.PI * 2); // mangueira enrolada
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `900 46px ${FONTE}`;
  ctx.fillText("H", w / 2, h * 0.8);
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

function desenharQuadroEletrico(ctx, w, h) {
  const g = ctx.createLinearGradient(0, 0, w, 0);
  g.addColorStop(0, "#c6ccd3");
  g.addColorStop(1, "#b2b9c1");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "#8f98a2";
  ctx.lineWidth = 6;
  ctx.strokeRect(12, 12, w - 24, h - 24);
  ctx.save();
  ctx.translate(w / 2 - 56, 44);
  ctx.scale(112 / 256, 112 / 256);
  desenharTensao(ctx, 256, 256);
  ctx.restore();
  ctx.fillStyle = "#1d2026";
  ctx.fillRect(w / 2 - 80, 180, 160, 52);
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `700 24px ${FONTE}`;
  ctx.fillText("QDF-01", w / 2, 198);
  ctx.font = `600 16px ${FONTE}`;
  ctx.fillText("380 V · 60 Hz", w / 2, 220);
  ctx.fillStyle = "#2b2f35";
  ctx.beginPath();
  ctx.roundRect(w - 48, h / 2 - 34, 20, 68, 6);
  ctx.fill();
  for (const y of [60, h - 90]) ctx.fillRect(14, y, 10, 30);
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

function desenharPorta(ctx, w, h, saida) {
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, "#8a95a1");
  g.addColorStop(1, "#76808c");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "rgba(40,46,54,0.35)";
  ctx.lineWidth = 6;
  ctx.strokeRect(6, 6, w - 12, h - 12);
  const [vx, vy, vw, vh] = [w * 0.3, h * 0.1, w * 0.4, h * 0.3];
  const vidro = ctx.createLinearGradient(0, vy, 0, vy + vh);
  vidro.addColorStop(0, "#d4e3ec");
  vidro.addColorStop(1, "#9cb3c2");
  ctx.fillStyle = vidro;
  ctx.fillRect(vx, vy, vw, vh);
  ctx.strokeStyle = "rgba(70,80,90,0.25)";
  ctx.lineWidth = 1;
  for (let i = -vh; i < vw; i += 14) {
    ctx.beginPath();
    ctx.moveTo(vx + i, vy);
    ctx.lineTo(vx + i + vh, vy + vh);
    ctx.stroke();
  }
  ctx.strokeStyle = "#3f464e";
  ctx.lineWidth = 8;
  ctx.strokeRect(vx, vy, vw, vh);
  const inox = ctx.createLinearGradient(0, h - 80, 0, h - 14);
  inox.addColorStop(0, "#d3d8dd");
  inox.addColorStop(1, "#a7aeb5");
  ctx.fillStyle = inox;
  ctx.fillRect(12, h - 80, w - 24, 66);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if (saida) {
    ctx.fillStyle = "#0a8a3a";
    ctx.fillRect(w / 2 - 90, h * 0.47, 180, 46);
    ctx.fillStyle = "#ffffff";
    ctx.font = `800 18px ${FONTE}`;
    ctx.fillText("SAÍDA DE", w / 2, h * 0.47 + 15);
    ctx.fillText("EMERGÊNCIA", w / 2, h * 0.47 + 33);
  }
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

function desenharPainelCNC(ctx, w, h) {
  ctx.fillStyle = "#2b3038";
  ctx.fillRect(0, 0, w, h);
  const tela = ctx.createLinearGradient(0, 12, 0, 100);
  tela.addColorStop(0, "#2a6fb3");
  tela.addColorStop(1, "#174a7c");
  ctx.fillStyle = tela;
  ctx.fillRect(12, 12, w - 24, 88);
  ctx.fillStyle = "#e8f1fb";
  for (let i = 0; i < 3; i++) for (let j = 0; j < 4; j++) ctx.fillRect(22 + j * 31, 24 + i * 24, 20, 14);
  ctx.fillStyle = "#c9ced4";
  for (let r = 0; r < 4; r++) for (let c = 0; c < 6; c++) ctx.fillRect(14 + c * 22, 112 + r * 18, 16, 12);
  ctx.fillStyle = "#d71920";
  ctx.beginPath();
  ctx.arc(34, 204, 16, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#2f9e44";
  ctx.beginPath();
  ctx.arc(82, 204, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#9aa0a6";
  ctx.beginPath();
  ctx.arc(126, 204, 15, 0, Math.PI * 2);
  ctx.fill();
}

/** Frente do torno CNC: porta com visor, etiquetas amarelas de advertência e plaqueta. */
function desenharTornoCNC(ctx, w, h) {
  ctx.fillStyle = "#eef0ef";
  ctx.fillRect(0, 0, w, h);
  const [jx, jy, jw, jh] = [w * 0.28, h * 0.12, w * 0.5, h * 0.55];
  ctx.fillStyle = "#d3d7da";
  ctx.fillRect(jx - 14, jy - 14, jw + 28, jh + 28);
  const fundo = ctx.createLinearGradient(0, jy, 0, jy + jh);
  fundo.addColorStop(0, "#2a3540");
  fundo.addColorStop(1, "#46535f");
  ctx.fillStyle = fundo;
  ctx.fillRect(jx, jy, jw, jh);
  ctx.fillStyle = "#8d959d";
  ctx.fillRect(jx + 10, jy + jh * 0.35, jw * 0.18, jh * 0.4); // placa
  ctx.fillStyle = "rgba(255,255,255,0.14)";
  ctx.beginPath();
  ctx.moveTo(jx, jy);
  ctx.lineTo(jx + jw * 0.3, jy);
  ctx.lineTo(jx + jw * 0.12, jy + jh);
  ctx.lineTo(jx, jy + jh);
  ctx.fill();
  ctx.strokeStyle = "#2b2f35";
  ctx.lineWidth = 8;
  ctx.strokeRect(jx, jy, jw, jh);
  ctx.fillStyle = "#59626d";
  ctx.fillRect(jx + jw - 30, jy + jh * 0.3, 12, jh * 0.4); // puxador
  // etiquetas de advertência amarelas (como na foto)
  ctx.fillStyle = "#f2c12e";
  ctx.fillRect(w * 0.06, h * 0.2, w * 0.12, h * 0.22);
  ctx.fillRect(w * 0.84, h * 0.2, w * 0.1, h * 0.18);
  ctx.fillStyle = "#1d1f22";
  ctx.font = `800 22px ${FONTE}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("!", w * 0.12, h * 0.31);
  ctx.fillText("!", w * 0.89, h * 0.29);
  ctx.fillStyle = "#e3e5e4";
  ctx.fillRect(0, h * 0.82, w, h * 0.18);
  ctx.fillStyle = "#2e5f86";
  ctx.font = `800 26px ${FONTE}`;
  ctx.fillText("CNC", w * 0.12, h * 0.9);
}

function desenharBanner(ctx, w, h) {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  const topo = ctx.createLinearGradient(0, 0, 0, 90);
  topo.addColorStop(0, "#2a6fb3");
  topo.addColorStop(1, "#5cb85c");
  ctx.fillStyle = topo;
  ctx.fillRect(0, 0, w, 10);
  ctx.fillStyle = "#1d3c6e";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `800 15px ${FONTE}`;
  ["Você faz parte", "do ciclo de", "reciclagem do aço!"].forEach((t, i) => ctx.fillText(t, w / 2, 34 + i * 18));
  ctx.strokeStyle = "#2a6fb3";
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.arc(w / 2, 170, 46, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "#5cb85c";
  for (let i = 0; i < 5; i++) {
    const t = (i / 5) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(w / 2 + Math.cos(t) * 46, 170 + Math.sin(t) * 46, 13, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "#59626d";
  for (let i = 0; i < 7; i++) ctx.fillRect(16, 246 + i * 12, w - 32 - (i % 3) * 18, 5);
  ctx.fillStyle = ESCOLA.destaque;
  ctx.fillRect(18, h - 48, 66, 26);
  ctx.fillStyle = "#ffffff";
  ctx.font = `italic 900 17px ${FONTE}`;
  ctx.fillText("SENAI", 51, h - 34);
}

/** Tapete de borracha perfurado: furos deixam ver o taco. */
function desenharTapete(ctx, w, h) {
  ctx.fillStyle = "#2a2d30";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#5a2a18";
  for (let y = 8; y < h; y += 15)
    for (let x = 8 + ((y / 15) % 2) * 7; x < w; x += 15) {
      ctx.beginPath();
      ctx.arc(x, y, 4.2, 0, Math.PI * 2);
      ctx.fill();
    }
  ctx.strokeStyle = "#1c1e20";
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, w - 6, h - 6);
}

function desenharRelogio(ctx, w, h) {
  const c = w / 2;
  ctx.fillStyle = "#2b2f35";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#fbfbf8";
  ctx.beginPath();
  ctx.arc(c, c, w * 0.47, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#1d1f22";
  ctx.lineCap = "round";
  for (let i = 0; i < 12; i++) {
    const t = (i / 12) * Math.PI * 2;
    ctx.lineWidth = i % 3 === 0 ? 6 : 3;
    ctx.beginPath();
    ctx.moveTo(c + Math.sin(t) * w * 0.36, c - Math.cos(t) * w * 0.36);
    ctx.lineTo(c + Math.sin(t) * w * 0.43, c - Math.cos(t) * w * 0.43);
    ctx.stroke();
  }
  const ponteiro = (ang, comp, larg, cor) => {
    ctx.strokeStyle = cor;
    ctx.lineWidth = larg;
    ctx.beginPath();
    ctx.moveTo(c, c);
    ctx.lineTo(c + Math.sin(ang) * comp, c - Math.cos(ang) * comp);
    ctx.stroke();
  };
  ponteiro((10 / 12) * Math.PI * 2 + 0.05, w * 0.22, 7, "#1d1f22");
  ponteiro((2 / 12) * Math.PI * 2, w * 0.33, 5, "#1d1f22");
  ponteiro((7 / 12) * Math.PI * 2, w * 0.36, 2, "#d71920");
}

/** Ventilador de parede (grade preta). */
function desenharVentilador(ctx, w, h) {
  const c = w / 2;
  ctx.fillStyle = "#f1f2ef";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#3a3f45";
  ctx.beginPath();
  ctx.arc(c, c, w * 0.47, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#56606a";
  for (let i = 0; i < 3; i++) {
    const t = (i / 3) * Math.PI * 2 + 0.4;
    ctx.beginPath();
    ctx.ellipse(c + Math.cos(t) * w * 0.2, c + Math.sin(t) * w * 0.2, w * 0.2, w * 0.09, t, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = "#16181b";
  ctx.lineWidth = 3;
  for (let r = w * 0.1; r < w * 0.47; r += w * 0.06) {
    ctx.beginPath();
    ctx.arc(c, c, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = "#16181b";
  ctx.beginPath();
  ctx.arc(c, c, w * 0.08, 0, Math.PI * 2);
  ctx.fill();
}

function desenharCartaz5S(ctx, w, h) {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#0d3b85";
  ctx.fillRect(0, 0, w, 64);
  ctx.fillStyle = "#d71920";
  ctx.fillRect(0, 64, w, 6);
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.font = `900 38px ${FONTE}`;
  ctx.fillText("PROGRAMA 5S", 26, 34);
  const linhas = [
    ["Seiri", "Utilização"],
    ["Seiton", "Organização"],
    ["Seiso", "Limpeza"],
    ["Seiketsu", "Padronização"],
    ["Shitsuke", "Disciplina"],
  ];
  linhas.forEach(([jp, pt], i) => {
    const y = 112 + i * 60;
    ctx.fillStyle = "#0d3b85";
    ctx.beginPath();
    ctx.arc(50, y, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.font = `900 26px ${FONTE}`;
    ctx.fillText(String(i + 1), 50, y + 1);
    ctx.textAlign = "left";
    ctx.fillStyle = "#16202b";
    ctx.font = `800 28px ${FONTE}`;
    ctx.fillText(jp, 90, y - 10);
    ctx.fillStyle = "#4a5866";
    ctx.font = `500 22px ${FONTE}`;
    ctx.fillText(`Senso de ${pt.toLowerCase()}`, 90, y + 16);
  });
}
