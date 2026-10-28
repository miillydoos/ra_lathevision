import { Color3, DynamicTexture, Mesh, MeshBuilder, PointerEventTypes, StandardMaterial, TransformNode, Vector3 } from "@babylonjs/core";
import { GRANDEZA_POR_ID } from "../config/grandezas.js";
import { ESTADOS } from "../config/estados.js";
import { desenharIcone, svgIcone } from "../util/icones.js";
import { textoValor } from "../ui/sensoresUI.js";
import { criarEmissor } from "../util/emissor.js";

// Compartimentos com sensores: o sensor de corrente fica no painel elétrico (traseira do gabinete do cabeçote);
// temperatura, vibração, nível de óleo e rotação ficam na caixa lateral de engrenagens do cabeçote.
// As tampas são as do próprio torno.glb, giradas em dobradiças em tempo de execução (o arquivo não muda).
// Coordenadas em metros, como no torno.glb; `dobradica` = eixo vertical (x, z); `sensores[].pos` = (z, y)
// na face aberta e `etiqueta` = deslocamento (z, y) da etiqueta; `angulo` em graus (negativo abre para -X,
// positivo para -Z). `giro` monta o interior girado em Y (face traseira: x local = z do mundo, z local = -x do
// mundo); `vista` = câmera do botão Sensores, que vai ao compartimento do lado em que a câmera já está.
// Olhando a lateral do cabeçote, -Z fica à esquerda (lado das dobradiças) e +Z à direita (lado do operador).
// Os interiores estão modelados no torno.glb, seguindo as fotos da máquina real: na caixa de engrenagens, a
// fundição com o ressalto do eixo-árvore, polia laranja em cima à esquerda (sensor de rotação logo abaixo),
// lira com o trem de engrenagens à direita, placa guardada embaixo e a mangueira azul que desce até o canto
// do reservatório; no painel elétrico, placa de montagem, disjuntores, contatores, borneira, canaletas e
// fiação. Aqui eles só ganham os sensores (montados na face do ressalto e no cabo do motor). O reservatório
// quadrado do torno.glb sai de cena (removerReservatorioQuadrado): no lugar dele fica um reservatório
// cilíndrico com o sensor ultrassônico de nível na tampa, onde a mangueira chega.
export const COMPARTIMENTOS = [
  {
    id: "caixaEngrenagens",
    nome: "Caixa lateral de engrenagens",
    componente: "cabecote",
    tampa: /^(Porta_lateral_cabecote|Fecho_lateral)/,
    dobradica: [-1.4205, -0.2495], // as dobradiças do modelo (Dobradica_porta)
    angulo: -105,
    face: -1.335, // face do ressalto do eixo-árvore, dentro da janela do cabeçote (x = -1,400)
    porta: desenharDocumento, // folha de manutenção no lado de dentro da tampa
    vista: { alvo: [-1.42, 1.0, 0], alfa: Math.PI - 0.5, beta: 1.3, raio: 2.0 },
    // reservatório cilíndrico de óleo, em pé no fundo da caixa (centro em x, z)
    reservatorio: { x: -1.35, z: 0.216, base: 0.7, altura: 0.13, diametro: 0.078 },
    sensores: [
      { grandeza: "temperatura", tipo: "termometro", pos: [0.045, 1.215], etiqueta: [0.1, 0.075] },
      { grandeza: "vibracao", tipo: "acelerometro", pos: [-0.055, 1.215], etiqueta: [-0.1, 0.08] },
      { grandeza: "rotacao", tipo: "indutivo", pos: [-0.2, 1.03], etiqueta: [0.02, -0.12] },
      // encoder rotativo acoplado na ponta do eixo-árvore (centro do ressalto)
      { grandeza: "rotacao", tipo: "encoder", nome: "Encoder (rotação)", pos: [0, 1.132], etiqueta: [0.02, -0.105] },
      // HC-SR04 na tampa do reservatório cilíndrico (no canto onde ficava o quadrado), transdutores voltados
      // para baixo medindo a distância até o óleo; `pos` = centro da placa
      { grandeza: "oleo", tipo: "ultrassonico", nome: "Nível de óleo (ultrassom)", pos: [0.216, 0.845], afastamento: 0.015, etiqueta: [-0.07, 0.1] },
    ],
  },
  {
    id: "painelEletrico",
    nome: "Painel elétrico",
    componente: "base",
    tampa: /^Gabinete_motor_eletrico_porta/,
    dobradica: [-1.395, -0.5], // borda da porta do lado do cabeçote, face externa
    angulo: 105,
    giro: -Math.PI / 2,
    face: -0.385, // z do mundo, à frente da régua de bornes
    vista: { alvo: [-1.07, 0.96, -0.46], alfa: -Math.PI / 2 + 0.35, beta: 1.33, raio: 1.75 },
    // sensores de corrente não invasivos (núcleo dividido, YHDC SCT-013), um em cada fase da alimentação do motor
    sensores: [{ grandeza: "corrente", tipo: "tc", nome: "Corrente (SCT-013)", pos: [1.178, 0.825], etiqueta: [0, 0.075] }],
  },
];
const LARGURA_ETIQUETA = 0.15; // m
const ALTURA_ETIQUETA = 0.056;
/** Antes de criarSelecao: tira de cena o reservatório quadrado (e o óleo dele) do torno.glb. */
export function removerReservatorioQuadrado(modelo) {
  const quadrado = /^Cabecote_fixo_engrenagens_(reservatorio|oleo)/;
  for (const m of modelo.malhas) if (quadrado.test(m.name)) m.dispose();
  modelo.malhas = modelo.malhas.filter((m) => !quadrado.test(m.name));
}

/**
 * Antes de criarSelecao: dá às tampas uma cópia própria de cada material, para a mescla de malhas
 * (que junta peças do mesmo componente e material) não fundir a tampa com o corpo da máquina.
 * A aparência não muda.
 */
export function separarTampas(modelo) {
  return COMPARTIMENTOS.map((c) => {
    const copias = new Map();
    for (const m of modelo.malhas) {
      if (!c.tampa.test(m.name) || !m.material) continue;
      if (!copias.has(m.material)) copias.set(m.material, m.material.clone(`${m.material.name}__${c.id}`));
      m.material = copias.get(m.material);
    }
    return { ...c, materiais: new Set(copias.values()) };
  });
}

/**
 * Painel elétrico e tampa da caixa de engrenagens que se abrem com a mão: arrastar a tampa (mouse, dedo ou,
 * no headset, pinça / gatilho apontando para ela) gira na dobradiça; clicar ou tocar abre ou fecha; o botão
 * Sensores abre ou fecha as duas e leva a câmera até elas. Dentro aparecem os sensores instalados, com LED e
 * etiqueta na cor do estado da medição; clicar num sensor abre a medição dele.
 * Chamar depois de prepararMalhas (que congela as peças fixas). Emite "estado" (alguma tampa aberta).
 */
export function criarCompartimentos({ scene, camera, selecao, tampas, fluxo, config, focar, aoAbrirGrandeza }) {
  const eventos = criarEmissor();
  const botao = document.getElementById("btn-sensores");
  botao?.insertAdjacentHTML("afterbegin", svgIcone("porta"));
  const rad = (graus) => (graus * Math.PI) / 180;
  let abertoAntes = false;

  const comps = tampas.map((c) => {
    // tampa presa a uma dobradiça (as malhas continuam identificadas pelo componente de antes)
    const eixo = new TransformNode(`dobradica_${c.id}`, scene);
    eixo.position.set(c.dobradica[0], 0, c.dobradica[1]);
    const malhasTampa = selecao.malhas.filter((m) => c.materiais.has(m.material));
    for (const m of malhasTampa) {
      m.unfreezeWorldMatrix();
      m.setParent(eixo);
    }
    const interior = criarInterior(scene, c, config);
    if (c.porta) {
      // lado de dentro da tampa (voltado para +X com a tampa fechada): gira junto com ela
      const doc = planoDesenhado(scene, `documento_${c.id}`, 0.2, 0.27, c.porta, 256);
      doc.parent = eixo; // posição relativa à dobradiça (ainda sem rotação)
      doc.rotation.y = -Math.PI / 2;
      doc.position.set(-1.3985 - c.dobradica[0], 0.95, 0.02 - c.dobradica[1]);
      interior.extras.push(doc);
    }
    interior.raiz.setEnabled(false);
    for (const m of interior.extras) m.setEnabled(false);
    const abrirMedicao = (id) => () => {
      selecao.selecionar(c.componente);
      aoAbrirGrandeza?.(id);
    };
    for (const s of interior.sensores) {
      for (const m of s.malhas) selecao.registrarClicavel(m, abrirMedicao(s.id), selecao.porId(c.componente));
    }
    // k = quanto está aberta (0 fechada, 1 aberta); alvo = para onde vai quando ninguém está segurando
    return { ...c, eixo, interior, malhasTampa, k: 0, kAplicado: -1, alvo: 0, segurando: false };
  });
  const sensores = comps.flatMap((c) => c.interior.sensores);

  // ---------- clicar / tocar na tampa abre ou fecha; passar o mouse destaca só a tampa
  for (const c of comps) {
    const dica = { id: `tampa_${c.id}`, nome: `${c.nome}: clique ou arraste a tampa`, malhas: c.malhasTampa };
    for (const m of c.malhasTampa) {
      selecao.registrarClicavel(m, () => definirTampa(c, c.alvo === 1 ? 0 : 1), dica);
    }
  }

  // ---------- arrastar (mouse, dedo, pinça ou gatilho no headset): a tampa acompanha o ponto agarrado,
  // girando na dobradiça. O ponto é a interseção do raio do ponteiro com o plano horizontal na altura
  // em que a tampa foi agarrada. (O PointerDragBehavior do Babylon põe esse plano na origem da malha,
  // que aqui fica longe da tampa, por isso o arrasto é feito à mão.)
  const anguloDe = (c, x, z) => Math.atan2(x - c.dobradica[0], z - c.dobradica[1]); // com a tampa a θ, um ponto dela está a θ
  let arrasto = null; // { c, pointerId, y, phi0, theta0, velocidade, moveu, cameraLigada }
  for (const c of comps) {
    for (const m of c.malhasTampa) {
      m.isNearGrabbable = true; // pegar com a mão no headset
      m.enablePointerMoveEvents = true; // destaque e dica ao passar o mouse sobre a tampa
    }
  }

  function pontoNoPlano(pi, y) {
    const raio = pi.pickInfo?.ray;
    if (raio && Math.abs(raio.direction.y) > 1e-4) {
      const t = (y - raio.origin.y) / raio.direction.y;
      if (t > 0) return [raio.origin.x + raio.direction.x * t, raio.origin.z + raio.direction.z * t];
    }
    const p = pi.pickInfo?.pickedPoint; // pegar de perto (mão) não traz raio, mas traz o ponto
    return p ? [p.x, p.z] : null;
  }

  scene.onPointerObservable.add((pi) => {
    if (pi.type === PointerEventTypes.POINTERDOWN && !arrasto) {
      const malha = pi.pickInfo?.hit ? pi.pickInfo.pickedMesh : null;
      const c = malha && comps.find((c) => c.malhasTampa.includes(malha));
      if (!c || !pi.pickInfo.pickedPoint) return;
      const p = pi.pickInfo.pickedPoint;
      // a câmera orbital para enquanto a tampa está sendo arrastada
      const cameraLigada = scene.activeCamera === camera && camera.inputs.attachedToElement;
      if (cameraLigada) camera.detachControl();
      arrasto = { c, pointerId: pi.event.pointerId, y: p.y, phi0: anguloDe(c, p.x, p.z), theta0: rad(c.angulo) * c.k, velocidade: 0, moveu: false, cameraLigada };
      c.segurando = true;
    } else if (pi.type === PointerEventTypes.POINTERMOVE && arrasto && pi.event.pointerId === arrasto.pointerId) {
      const a = arrasto;
      const xz = pontoNoPlano(pi, a.y);
      // com o raio quase rasante ao plano o ponto cai longe e o ângulo fica instável: ignora
      if (!xz || Math.hypot(xz[0] - a.c.dobradica[0], xz[1] - a.c.dobradica[1]) > 1.5) return;
      let d = anguloDe(a.c, xz[0], xz[1]) - a.phi0;
      d = ((((d + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI;
      const k = Math.min(1, Math.max(0, (a.theta0 + d) / rad(a.c.angulo)));
      a.velocidade = a.velocidade * 0.6 + (k - a.c.k) * 0.4;
      if (Math.abs(d) > rad(2)) a.moveu = true;
      a.c.k = k;
    } else if (pi.type === PointerEventTypes.POINTERUP && arrasto && pi.event.pointerId === arrasto.pointerId) {
      const a = arrasto;
      arrasto = null;
      a.c.segurando = false;
      if (a.cameraLigada) camera.attachControl(scene.getEngine().getRenderingCanvas(), true); // como em cena.js
      if (!a.moveu) return; // foi um clique: quem decide é o toque (abre ou fecha)
      // soltou: termina o movimento no sentido em que vinha; parada, vai para o lado mais próximo
      let alvo = a.c.k > 0.5 ? 1 : 0;
      if (a.velocidade > 0.002) alvo = a.c.k > 0.1 ? 1 : 0;
      else if (a.velocidade < -0.002) alvo = a.c.k < 0.9 ? 0 : 1;
      definirTampa(a.c, alvo);
    }
  });

  // ---------- a cada quadro: tampa vai até o alvo (sem ninguém segurando) e mostra o interior
  scene.onBeforeRenderObservable.add(() => {
    const dt = Math.min(0.25, scene.getEngine().getDeltaTime() / 1000);
    for (const c of comps) {
      if (!c.segurando && c.k !== c.alvo) {
        c.k += (c.alvo - c.k) * Math.min(1, dt * 7);
        if (Math.abs(c.alvo - c.k) < 0.002) c.k = c.alvo;
      }
      if (c.k === c.kAplicado) continue;
      c.kAplicado = c.k;
      c.eixo.rotation.y = rad(c.angulo) * c.k;
      c.interior.raiz.setEnabled(c.k > 0);
      // sensores e etiquetas só com a tampa bem aberta (antes disso atravessariam a tampa)
      c.interior.sensoresRaiz.setEnabled(c.k > 0.3);
      for (const m of c.interior.extras) m.setEnabled(c.k > 0);
    }
  });

  // ---------- estado das medições nos sensores (LED e etiqueta)
  function atualizarSensores() {
    for (const s of sensores) {
      const e = fluxo.estado(s.id);
      const tv = textoValor(config, s.id, e.valor);
      s.atualizar(ESTADOS[e.estado] ?? ESTADOS.semDados, tv, e.valor);
    }
  }
  setInterval(() => comps.some((c) => c.k > 0) && atualizarSensores(), 250);

  // ---------- abrir / fechar
  const algumaAberta = () => comps.some((c) => c.alvo === 1);
  function definirTampa(c, alvo) {
    c.alvo = alvo;
    if (alvo) atualizarSensores();
    sincronizar();
  }
  function sincronizar() {
    const aberto = algumaAberta();
    botao?.setAttribute("aria-pressed", String(aberto));
    if (botao) botao.title = aberto ? "Fechar o painel elétrico e a tampa da caixa de engrenagens" : "Abrir o painel elétrico e a tampa da caixa de engrenagens e mostrar os sensores";
    if (aberto !== abertoAntes) eventos.emitir("estado", aberto);
    abertoAntes = aberto;
  }
  function definir(v, { focarCamera = v } = {}) {
    for (const c of comps) c.alvo = v ? 1 : 0;
    if (v) atualizarSensores();
    if (focarCamera && scene.activeCamera === camera) {
      // pelo caminho mais curto em volta do torno, até o compartimento do lado em que a câmera já está
      const giroAte = (a) => ((((a - camera.alpha + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI;
      const vista = comps.map((c) => c.vista).reduce((m, v) => (Math.abs(giroAte(v.alfa)) < Math.abs(giroAte(m.alfa)) ? v : m));
      const alfa = camera.alpha + giroAte(vista.alfa);
      focar(new Vector3(...vista.alvo), vista.raio, { alfa, beta: vista.beta, duracao: 1100 });
    }
    sincronizar();
  }
  botao?.addEventListener("click", () => definir(!algumaAberta()));

  return {
    abrir: (opcoes) => definir(true, opcoes),
    fechar: () => definir(false),
    alternar: () => definir(!algumaAberta()),
    get aberto() {
      return algumaAberta();
    },
    on: eventos.on,
  };
}

// ---------- interior: sensores (o resto do interior está no torno.glb)
function criarInterior(scene, c, config) {
  const raiz = new TransformNode(`interior_${c.id}`, scene);
  raiz.rotation.y = c.giro ?? 0; // compartimento na traseira: o interior é montado girado
  const sensoresRaiz = new TransformNode(`sensores_${c.id}`, scene);
  sensoresRaiz.parent = raiz;
  const sensores = c.sensores.map((s) => criarSensor(scene, sensoresRaiz, c, s));
  if (c.reservatorio) {
    // o reservatório fica visível com a tampa entreaberta (como as peças do torno.glb); o óleo dentro
    // sobe e desce com a medição de nível, e clicar nele abre a medição
    const tanque = criarReservatorio(scene, raiz, c.reservatorio);
    const nivel = sensores.find((s) => s.id === "oleo");
    if (nivel) {
      nivel.malhas.push(...tanque.malhas);
      const atualizar = nivel.atualizar;
      nivel.atualizar = (estado, tv, valor) => {
        atualizar(estado, tv);
        // com boia a leitura é 0 / 1 (baixo / ok), como no visor de nível
        const boia = config.grandezas.oleo?.sensor === "boia";
        tanque.definirNivel(boia && valor != null ? (valor >= 0.5 ? 80 : 15) : valor);
      };
    }
  }
  return { raiz, sensoresRaiz, sensores, extras: [] };
}

/** Reservatório cilíndrico transparente com tampa e óleo; `definirNivel` recebe o nível em % (0 a 100). */
function criarReservatorio(scene, raiz, r) {
  const malhas = [];
  const peca = (malha, material) => {
    malha.material = material;
    malha.parent = raiz;
    malhas.push(malha);
    return malha;
  };
  const plastico = new StandardMaterial("matReservatorioCilindrico", scene);
  plastico.diffuseColor = new Color3(0.86, 0.9, 0.94);
  plastico.specularColor = new Color3(0.5, 0.5, 0.5);
  plastico.alpha = 0.28;
  const oleo = new StandardMaterial("matOleoReservatorio", scene);
  oleo.diffuseColor = Color3.FromHexString("#c98a1a");
  oleo.emissiveColor = Color3.FromHexString("#c98a1a").scale(0.25);
  oleo.alpha = 0.88;
  const parede = peca(MeshBuilder.CreateCylinder("reservatorioCilindrico", { diameter: r.diametro, height: r.altura, tessellation: 40 }, scene), plastico);
  parede.position.set(r.x, r.base + r.altura / 2, r.z);
  const fundo = peca(MeshBuilder.CreateCylinder("reservatorioCilindrico", { diameter: r.diametro + 0.004, height: 0.006, tessellation: 40 }, scene), cor(scene, "#2b2f35"));
  fundo.position.set(r.x, r.base + 0.003, r.z);
  const tampa = peca(MeshBuilder.CreateCylinder("reservatorioCilindrico", { diameter: r.diametro + 0.006, height: 0.008, tessellation: 40 }, scene), cor(scene, "#2b2f35"));
  tampa.position.set(r.x, r.base + r.altura + 0.004, r.z);
  // marcas de mínimo e máximo na parede, do lado de fora (voltado para -X)
  for (const [frac, hex] of [[0.25, "#e05555"], [0.85, "#4cc27a"]]) {
    const marca = peca(MeshBuilder.CreateBox("reservatorioCilindrico", { width: 0.002, height: 0.003, depth: 0.018 }, scene), cor(scene, hex));
    marca.position.set(r.x - r.diametro / 2 - 0.001, r.base + r.altura * frac, r.z);
  }
  const liquido = peca(MeshBuilder.CreateCylinder("oleoReservatorio", { diameter: r.diametro - 0.006, height: 1, tessellation: 40 }, scene), oleo);
  const util = r.altura - 0.012; // entre o fundo e a tampa
  function definirNivel(valor) {
    const f = Math.max(0.02, Math.min(1, (valor ?? 60) / 100));
    liquido.scaling.y = util * f;
    liquido.position.set(r.x, r.base + 0.006 + (util * f) / 2, r.z);
  }
  definirNivel(null);
  return { malhas, definirNivel };
}

/** Plano com imagem desenhada em canvas, sem sombreamento. */
function planoDesenhado(scene, nome, largura, altura, desenhar, px = 512) {
  const py = Math.round((px * altura) / largura);
  const tex = new DynamicTexture(`tex_${nome}`, { width: px, height: py }, scene, true);
  const ctx = tex.getContext();
  // na cena destra a face visível do plano mostra a imagem espelhada: desenha invertido na horizontal
  ctx.save();
  ctx.translate(px, 0);
  ctx.scale(-1, 1);
  desenhar(ctx, px, py);
  ctx.restore();
  tex.update();
  const mat = new StandardMaterial(`mat_${nome}`, scene);
  mat.diffuseTexture = tex;
  mat.disableLighting = true; // sem luzes, a cor final é emissiva × textura
  mat.emissiveColor = new Color3(0.92, 0.92, 0.92);
  const plano = MeshBuilder.CreatePlane(nome, { width: largura, height: altura }, scene);
  plano.material = mat;
  plano.isPickable = false;
  return plano;
}

const coresCache = new Map();
function cor(scene, hex, especular = 0.25) {
  const chave = `${hex}|${especular}`;
  if (!coresCache.has(chave)) {
    const m = new StandardMaterial(`sensor_${hex}`, scene);
    m.diffuseColor = Color3.FromHexString(hex);
    m.specularColor = new Color3(especular, especular, especular);
    coresCache.set(chave, m);
  }
  return coresCache.get(chave);
}

/** Corpo do sensor (geometria simples), LED de estado e etiqueta flutuante com valor. */
function criarSensor(scene, raiz, c, s) {
  const g = GRANDEZA_POR_ID[s.grandeza];
  const nome = `${g.id}_${s.tipo}`;
  const [z, y] = s.pos;
  const x = c.face;
  const metal = cor(scene, "#b8bec6", 0.6);
  const escuro = cor(scene, "#2b2f35");
  const cabo = cor(scene, "#16191d", 0.1);
  const malhas = [];
  const peca = (malha, material) => {
    malha.material = material;
    malha.parent = raiz;
    malhas.push(malha);
    return malha;
  };
  // cilindro deitado no eixo X (saindo da face), com a base em x
  const saindo = (nome, d, h, material, lados = 20, recuo = 0) => {
    const m = peca(MeshBuilder.CreateCylinder(nome, { diameter: d, height: h, tessellation: lados }, scene), material);
    m.rotation.z = Math.PI / 2;
    m.position.set(x - recuo - h / 2, y, z);
    return m;
  };

  let ponta = new Vector3(x - 0.04, y, z); // onde fica o LED
  if (s.tipo === "termometro") {
    saindo("sensorTemp", 0.026, 0.012, metal, 6);
    saindo("sensorTemp", 0.016, 0.034, cor(scene, "#d9dde2", 0.5), 20, 0.012);
    const fio = peca(MeshBuilder.CreateCylinder("caboTemp", { diameter: 0.007, height: 0.09 }, scene), cabo);
    fio.position.set(x - 0.04, y + 0.045, z);
    ponta = new Vector3(x - 0.047, y, z);
  } else if (s.tipo === "acelerometro") {
    saindo("sensorVib", 0.032, 0.008, metal, 6);
    saindo("sensorVib", 0.026, 0.034, cor(scene, "#cfd4da", 0.7), 24, 0.008);
    const conector = peca(MeshBuilder.CreateCylinder("sensorVib", { diameter: 0.012, height: 0.02 }, scene), escuro);
    conector.position.set(x - 0.025, y + 0.022, z);
    const fio = peca(MeshBuilder.CreateCylinder("caboVib", { diameter: 0.006, height: 0.07 }, scene), cabo);
    fio.position.set(x - 0.025, y + 0.065, z);
    ponta = new Vector3(x - 0.043, y, z);
  } else if (s.tipo === "indutivo") {
    // sensor cilíndrico em pé, logo abaixo da polia, com a face voltada para ela (como na máquina real)
    const xs = x - 0.026;
    const corpo = peca(MeshBuilder.CreateCylinder("sensorRot", { diameter: 0.034, height: 0.065, tessellation: 24 }, scene), metal);
    corpo.position.set(xs, y, z);
    const face = peca(MeshBuilder.CreateCylinder("sensorRot", { diameter: 0.03, height: 0.004, tessellation: 24 }, scene), cor(scene, "#d9822b", 0.2));
    face.position.set(xs, y + 0.0345, z);
    const porca = peca(MeshBuilder.CreateCylinder("sensorRot", { diameter: 0.044, height: 0.008, tessellation: 6 }, scene), metal);
    porca.position.set(xs, y + 0.018, z);
    const suporte = peca(MeshBuilder.CreateBox("sensorRot", { width: 0.026, height: 0.012, depth: 0.05 }, scene), escuro);
    suporte.position.set(x - 0.013, y + 0.018, z);
    const fio = peca(MeshBuilder.CreateCylinder("caboRot", { diameter: 0.008, height: 0.1 }, scene), cor(scene, "#2b7bd6", 0.2));
    fio.position.set(xs, y - 0.08, z);
    ponta = new Vector3(xs - 0.018, y - 0.012, z);
  } else if (s.tipo === "tc") {
    // YHDC SCT-013 (núcleo dividido, não invasivo) fechado em volta de cada uma das três fases que alimentam
    // o motor (preta, cinza e marrom): bloco azul com a janela quadrada atravessada pelo cabo, deitado com o
    // rótulo para cima e o cabo preto de saída descendo pela ponta voltada para fora
    const xc = x - 0.02; // eixo das fases
    const azul = cor(scene, "#2f8fd8", 0.35);
    const azulEscuro = cor(scene, "#1f6fb0", 0.3);
    const J = 0.013; // janela (13 mm)
    const T = 0.026; // espessura do bloco (no sentido do cabo)
    const W = 0.031; // largura
    const traseira = 0.0055; // barra atrás da janela
    const frente = 0.024; // bloco da frente, com o rótulo
    const xFrente = xc - J / 2 - frente; // ponta voltada para fora
    const rotulo = planoDesenhado(scene, "rotuloSCT013", frente - 0.003, W - 0.006, desenharRotuloSCT, 256);
    rotulo.rotation.set(Math.PI / 2, Math.PI / 2, 0);
    ["#16191d", "#7d838a", "#6b4426"].forEach((hex, i) => {
      const zf = z + i * 0.036;
      const fase = peca(MeshBuilder.CreateCylinder("caboMotor", { diameter: 0.011, height: 0.32 }, scene), cor(scene, hex, 0.1));
      fase.position.set(xc, y + 0.04, zf);
      const bloco = (w, d, material, cx, cz, h = T, cy = y) => {
        const m = peca(MeshBuilder.CreateBox("sensorCorrente", { width: w, height: h, depth: d }, scene), material);
        m.position.set(cx, cy, cz);
        return m;
      };
      bloco(traseira, W, azul, xc + J / 2 + traseira / 2, zf); // atrás da janela
      for (const lado of [-1, 1]) bloco(J, (W - J) / 2, azul, xc, zf + (lado * (W + J)) / 4); // laterais da janela
      bloco(frente, W, azul, xc - J / 2 - frente / 2, zf); // frente (rótulo)
      // a parte que abre (dobradiça e trava) fica um pouco saliente num dos lados, como na foto
      bloco(J + traseira + 0.006, 0.003, azulEscuro, xc + traseira / 2 - 0.003, zf - W / 2 - 0.0015, T - 0.004);
      bloco(0.006, 0.004, azulEscuro, xc - J / 2 - 0.003, zf - W / 2 - 0.002, T - 0.008);
      // núcleo de ferrite aparecendo nas bordas da janela
      for (const lado of [-1, 1]) bloco(0.0015, J - 0.003, escuro, xc + (lado * (J - 0.0015)) / 2, zf, T + 0.0004);
      const r = rotulo.clone("rotuloSCT013");
      r.position.set(xc - J / 2 - frente / 2 - 0.0005, y + T / 2 + 0.0004, zf);
      r.parent = raiz;
      malhas.push(r);
      // cabo preto de saída pela ponta, descendo até o ESP32
      const prensa = peca(MeshBuilder.CreateCylinder("caboTC", { diameter: 0.0065, height: 0.005 }, scene), azulEscuro);
      prensa.rotation.z = Math.PI / 2;
      prensa.position.set(xFrente - 0.0025, y - 0.004, zf);
      const saida = peca(MeshBuilder.CreateCylinder("caboTC", { diameter: 0.0042, height: 0.012 }, scene), cabo);
      saida.rotation.z = Math.PI / 2;
      saida.position.set(xFrente - 0.008, y - 0.004, zf);
      const desce = peca(MeshBuilder.CreateCylinder("caboTC", { diameter: 0.0042, height: 0.13 }, scene), cabo);
      desce.position.set(xFrente - 0.014, y - 0.004 - 0.065, zf);
    });
    rotulo.dispose();
    ponta = new Vector3(xFrente + 0.004, y + T / 2 + 0.004, z + W / 2 - 0.005);
  } else if (s.tipo === "encoder") {
    // encoder de eixo (tipo E40S): acoplamento na ponta do eixo-árvore (x = -1,378), flange de alumínio
    // e corpo preto voltados para fora, cabo saindo pela lateral
    saindo("sensorEncoder", 0.014, 0.008, escuro, 20, 0.043);
    saindo("sensorEncoder", 0.04, 0.006, cor(scene, "#d4d8dd", 0.7), 32, 0.051);
    const corpo = saindo("sensorEncoder", 0.04, 0.022, cor(scene, "#1c1f23", 0.35), 32, 0.057);
    const plaqueta = peca(MeshBuilder.CreateBox("sensorEncoder", { width: 0.016, height: 0.002, depth: 0.026 }, scene), cor(scene, "#eceff2", 0.2));
    plaqueta.position.set(corpo.position.x, y + 0.0198, z);
    const prensaCabo = peca(MeshBuilder.CreateCylinder("sensorEncoder", { diameter: 0.009, height: 0.008 }, scene), escuro);
    prensaCabo.position.set(corpo.position.x, y - 0.022, z);
    const fio = peca(MeshBuilder.CreateCylinder("caboEncoder", { diameter: 0.005, height: 0.09 }, scene), cabo);
    fio.position.set(corpo.position.x, y - 0.07, z);
    ponta = new Vector3(x - 0.08, y, z);
  } else if (s.tipo === "ultrassonico") {
    // HC-SR04 deitado na tampa do reservatório: placa azul na horizontal sobre quatro espaçadores, os dois
    // transdutores atravessando a tampa e apontando para o óleo, e a mangueira azul chegando no conector
    const xp = x - (s.afastamento ?? 0); // centro da placa (20 mm de largura em X)
    const placa = peca(MeshBuilder.CreateBox("sensorUltrassom", { width: 0.02, height: 0.0016, depth: 0.045 }, scene), cor(scene, "#1f5fae", 0.3));
    placa.position.set(xp, y, z);
    for (const lado of [-1, 1]) {
      const transdutor = peca(MeshBuilder.CreateCylinder("sensorUltrassom", { diameter: 0.016, height: 0.012, tessellation: 28 }, scene), metal);
      transdutor.position.set(xp, y - 0.0068, z + lado * 0.0135);
      const tela = peca(MeshBuilder.CreateCylinder("sensorUltrassom", { diameter: 0.013, height: 0.001, tessellation: 28 }, scene), escuro);
      tela.position.set(xp, y - 0.0133, z + lado * 0.0135);
      for (const canto of [-1, 1]) {
        const espacador = peca(MeshBuilder.CreateCylinder("sensorUltrassom", { diameter: 0.003, height: 0.0062 }, scene), metal);
        espacador.position.set(xp + canto * 0.0075, y - 0.0039, z + lado * 0.0205);
      }
    }
    const cristal = peca(MeshBuilder.CreateBox("sensorUltrassom", { width: 0.004, height: 0.003, depth: 0.01 }, scene), metal);
    cristal.position.set(xp + 0.0065, y + 0.0023, z);
    const conector = peca(MeshBuilder.CreateBox("sensorUltrassom", { width: 0.003, height: 0.003, depth: 0.011 }, scene), escuro);
    conector.position.set(xp - 0.0085, y + 0.0023, z);
    // plugue onde termina a mangueira do torno.glb (x = -1,359; y = 0,859; z = 0,198)
    const plugue = peca(MeshBuilder.CreateBox("sensorUltrassom", { width: 0.009, height: 0.014, depth: 0.009 }, scene), escuro);
    plugue.position.set(xp - 0.009, y + 0.0073, z - 0.018);
    ponta = new Vector3(xp + 0.004, y + 0.006, z + 0.006);
  }

  // LED de estado
  const matLed = new StandardMaterial(`ledSensor_${nome}`, scene);
  matLed.disableLighting = true;
  const led = peca(MeshBuilder.CreateSphere(`ledSensor_${nome}`, { diameter: 0.009, segments: 8 }, scene), matLed);
  led.position.copyFrom(ponta);

  // etiqueta (como os rótulos dos pontos instrumentados: sempre de frente para a câmera e por cima)
  const etiqueta = MeshBuilder.CreatePlane(`etiquetaSensor_${nome}`, { width: LARGURA_ETIQUETA, height: ALTURA_ETIQUETA }, scene);
  etiqueta.parent = raiz;
  const [dz, dy] = s.etiqueta ?? [0, 0.07];
  etiqueta.position.set(x - 0.09, y + dy, z + dz);
  etiqueta.billboardMode = Mesh.BILLBOARDMODE_ALL;
  etiqueta.renderingGroupId = 1;
  const tex = new DynamicTexture(`texEtiquetaSensor_${nome}`, { width: 320, height: 120 }, scene, true);
  tex.hasAlpha = true;
  const matEtiqueta = new StandardMaterial(`matEtiquetaSensor_${nome}`, scene);
  matEtiqueta.diffuseTexture = tex;
  matEtiqueta.emissiveTexture = tex;
  matEtiqueta.useAlphaFromDiffuseTexture = true;
  matEtiqueta.disableLighting = true;
  matEtiqueta.backFaceCulling = false;
  etiqueta.material = matEtiqueta;
  malhas.push(etiqueta);

  // linha de chamada: da borda da etiqueta voltada para o sensor até o LED
  const borda = etiqueta.position.add(new Vector3(0, ((dy >= 0 ? -1 : 1) * ALTURA_ETIQUETA) / 2, 0));
  const linha = MeshBuilder.CreateLines(`linhaSensor_${nome}`, { points: [borda, ponta] }, scene);
  linha.color = new Color3(0.85, 0.9, 0.95);
  linha.isPickable = false;
  linha.parent = raiz;

  let anterior = "";
  const sensor = {
    id: g.id,
    malhas,
    atualizar(estado, tv) {
      const chave = `${estado.id}|${tv.valor}|${tv.unidade}`;
      if (chave === anterior) return;
      anterior = chave;
      matLed.emissiveColor = Color3.FromHexString(estado.cor);
      desenharEtiqueta(tex.getContext(), g, estado, tv, s.nome);
      tex.update();
    },
  };
  // desenha já na criação: textura nunca atualizada deixa a cena "não pronta" (whenReadyAsync não termina)
  sensor.atualizar(ESTADOS.semDados, { valor: "—", unidade: "" });
  return sensor;
}

function desenharEtiqueta(ctx, g, estado, tv, nome = `Sensor de ${g.nome.toLowerCase()}`) {
  const W = 320;
  const H = 120;
  ctx.clearRect(0, 0, W, H);
  ctx.beginPath();
  ctx.roundRect(3, 3, W - 6, H - 6, 18);
  ctx.fillStyle = "rgba(17,24,33,0.93)";
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = estado.cor;
  ctx.stroke();
  desenharIcone(ctx, g.icone, 16, 12, 30, "#cfe3f7", 2.2);
  ctx.fillStyle = "#e9eef3";
  ctx.font = "600 24px Segoe UI, Roboto, Arial, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(nome, 56, 28);
  ctx.textBaseline = "alphabetic";
  ctx.font = "700 44px Segoe UI, Roboto, Arial, sans-serif";
  ctx.fillStyle = estado.id === "semDados" ? "#8f99a3" : "#ffffff";
  ctx.fillText(tv.valor, 18, 98);
  const largura = ctx.measureText(tv.valor).width;
  ctx.font = "500 22px Segoe UI, Roboto, Arial, sans-serif";
  ctx.fillStyle = "#b9c4cf";
  ctx.fillText(tv.unidade, 18 + largura + 8, 98);
  ctx.font = "600 21px Segoe UI, Roboto, Arial, sans-serif";
  ctx.textAlign = "right";
  ctx.fillStyle = "#e9eef3";
  ctx.fillText(estado.texto, W - 16, 96);
  const larguraEstado = ctx.measureText(estado.texto).width;
  desenharIcone(ctx, estado.icone, W - 16 - larguraEstado - 30, 76, 24, estado.cor, 2.6);
}

// ---------- desenho no lado de dentro da tampa (z → x do canvas, y → y do canvas)
/** Folha de manutenção no lado de dentro da tampa (como na foto). */
function desenharDocumento(ctx, w, h) {
  ctx.fillStyle = "#4a525c";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#efe6c8";
  ctx.fillRect(12, 12, w - 24, h - 24);
  ctx.fillStyle = "#3a4048";
  ctx.font = "700 17px Segoe UI, Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("PLANO DE MANUTENÇÃO", w / 2, 40);
  ctx.strokeStyle = "rgba(58,64,72,0.7)";
  ctx.lineWidth = 1.5;
  for (let y = 58; y < h - 24; y += 18) {
    ctx.beginPath();
    ctx.moveTo(24, y);
    ctx.lineTo(w - 24, y);
    ctx.stroke();
  }
  for (const x of [24, 110, 170, w - 24]) {
    ctx.beginPath();
    ctx.moveTo(x, 58);
    ctx.lineTo(x, h - 30);
    ctx.stroke();
  }
}

/** Rótulo do SCT-013 no bloco azul (como no sensor real). */
function desenharRotuloSCT(ctx, w, h) {
  ctx.fillStyle = "#2f8fd8";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#14243a";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `italic 900 ${Math.round(h * 0.2)}px Arial Black, Arial, sans-serif`;
  ctx.fillText("YHDC®", w / 2, h * 0.17);
  ctx.font = `700 ${Math.round(h * 0.12)}px Arial, sans-serif`;
  ctx.fillText("CE", w / 2, h * 0.36);
  ctx.font = `500 ${Math.round(h * 0.13)}px Arial, sans-serif`;
  ctx.fillText("SCT013", w / 2, h * 0.53);
  ctx.fillText("100A:50mA", w / 2, h * 0.7);
  ctx.font = `600 ${Math.round(h * 0.1)}px Arial, sans-serif`;
  ctx.fillText("www.yhdc.com", w / 2, h * 0.87);
}
