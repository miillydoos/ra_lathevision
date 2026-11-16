import {
  Color3,
  Curve3,
  DynamicTexture,
  Matrix,
  Mesh,
  MeshBuilder,
  PBRMaterial,
  PointerEventTypes,
  Quaternion,
  StandardMaterial,
  TransformNode,
  Vector3,
} from "@babylonjs/core";
import { GRANDEZA_POR_ID } from "../config/grandezas.js";
import { ESTADOS } from "../config/estados.js";
import { svgIcone } from "../util/icones.js";
import { criarBalao } from "./baloes.js";
import { textoValor } from "../ui/sensoresUI.js";
import { criarEmissor } from "../util/emissor.js";
import { PRENSA_CABO_TAMPO } from "./caixaMonitoramento.js"; // só usado em tempo de execução (importação circular)

// Compartimentos com sensores: o sensor de corrente fica no painel elétrico (traseira do gabinete do cabeçote);
// nível de óleo (ultrassônico) e rotação (sensor de velocidade) ficam na caixa lateral de engrenagens; o de
// vibração (MPU-6050) fica na caixa de monitoramento, no tampo do cabeçote (caixaMonitoramento.js).
// Os balões das medições ficam só nos sensores: azuis, grandes e sempre à mostra, mesmo com as tampas
// fechadas (baloes.js).
// As tampas são as do próprio torno.glb, giradas em dobradiças em tempo de execução (o arquivo não muda).
// Coordenadas em metros, como no torno.glb; `dobradica` = eixo vertical (x, z); `sensores[].pos` = (z, y)
// na face aberta e `etiqueta` = deslocamento (z, y) da borda do balão voltada para o sensor; `angulo` em graus (negativo abre para -X,
// positivo para -Z). `giro` monta o interior girado em Y (face traseira: x local = z do mundo, z local = -x do
// mundo); `vista` = câmera do botão Sensores, que vai ao compartimento do lado em que a câmera já está.
// Olhando a lateral do cabeçote, -Z fica à esquerda (lado das dobradiças) e +Z à direita (lado do operador).
// Os interiores estão modelados no torno.glb, seguindo as fotos da máquina real: na caixa de engrenagens, a
// fundição com o ressalto do eixo-árvore, polia laranja em cima à esquerda, lira com o trem de engrenagens
// à direita e placa guardada embaixo; no painel elétrico, placa de montagem, disjuntores, contatores,
// borneira, canaletas e fiação. Aqui eles só ganham os sensores (montados na face do ressalto e no cabo do
// motor). O reservatório quadrado do torno.glb (no canto de baixo) e a mangueira azul que descia até ele
// saem de cena (removerReservatorioQuadrado): o reservatório cilíndrico, com o sensor ultrassônico de nível
// na tampa, fica em cima à esquerda, abaixo da polia.
// Cabos (`chicote`, coordenadas do mundo): cada sensor tem a `rota` do cabo, da saída dele até dentro de uma
// canaleta. Na caixa de engrenagens, a canaleta fica no alto da fundição e o feixe sai pela ponta do lado do
// operador, subindo pelo prensa-cabo do tampo até a caixa do sistema de monitoramento. No painel elétrico,
// o cabo do motor entra pelo piso, as três fases sobem (a preta pela janela do SCT-013) até os bornes, e o
// cabo do SCT-013 vai pela canaleta do canto e atravessa a parede do fundo até a caixa de engrenagens.
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
    // reservatório cilíndrico de óleo, em pé logo abaixo da polia (centro em x, z): fica entre a placa guardada
    // (y ≤ 0,932) e a polia (y ≥ 1,07), na frente da correia (x ≥ -1,33) e fora de trás da porta aberta
    reservatorio: { x: -1.366, z: -0.165, base: 0.937, altura: 0.1, diametro: 0.06 },
    sensores: [
      // sensor de velocidade óptico (módulo LM393 com chave de fenda) em cima da roda dentada presa na ponta do
      // eixo-árvore (`pos` = centro do eixo); o cabo sai pelo conector do lado da fundição, passa ao lado da
      // cantoneira e sobe até a canaleta
      {
        grandeza: "rotacao",
        tipo: "velocidade",
        nome: "Sensor de velocidade",
        pos: [0, 1.132],
        etiqueta: [0.15, 0.1],
        rota: [[-1.3405, 1.1912, 0.006], [-1.341, 1.1965, 0.0135], [-1.342, 1.215, 0.0145], [-1.344, 1.238, 0.0145], [-1.348, 1.258, 0.0145]],
      },
      // HC-SR04 na tampa do reservatório cilíndrico, transdutores voltados para baixo medindo a distância até
      // o óleo; `pos` = centro da placa (y = base + altura do reservatório + 0,015). O cabo passa por baixo
      // da polia e sobe pelo canto da dobradiça.
      {
        grandeza: "oleo",
        tipo: "ultrassonico",
        nome: "Nível de óleo (ultrassom)",
        pos: [-0.165, 1.052],
        afastamento: 0.015,
        etiqueta: [-0.1, -0.12],
        rota: [[-1.359, 1.069, -0.196], [-1.36, 1.0685, -0.218], [-1.362, 1.074, -0.238], [-1.362, 1.1, -0.245], [-1.361, 1.235, -0.245], [-1.356, 1.258, -0.245]],
      },
    ],
    chicote: {
      // canaleta no alto da fundição, de ponta a ponta (a tampa voltada para a porta)
      canaletas: [{ min: [-1.37, 1.249, -0.272], max: [-1.335, 1.273, 0.19], tampa: "-x" }], // abaixo da borda da janela
      // prensa-cabos: na parede do fundo (o cabo do SCT-013, vindo do painel) e no teto (sobe para a caixa)
      prensas: [
        { pos: [-1.365, 1.261, -0.295], normal: [0, 0, 1] },
        { tampo: true, normal: [0, -1, 0] },
      ],
      cabos: [
        { pontos: [[-1.365, 1.261, -0.3], [-1.365, 1.261, -0.282], [-1.365, 1.261, -0.262]] },
        // feixe: da ponta da canaleta do lado do operador, sobe pelo prensa-cabo do tampo até a caixa
        { pontos: [[-1.3525, 1.261, 0.175], [-1.357, 1.266, 0.212], [-1.361, 1.283, 0.25]], ateTampo: true, raio: 0.0048 },
      ],
    },
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
    // sensor de corrente não invasivo (núcleo dividido, YHDC SCT-013) em uma das fases da alimentação do motor;
    // o cabo dele passa na frente das fases e entra por baixo na canaleta do canto
    sensores: [
      {
        grandeza: "corrente",
        tipo: "tc",
        nome: "Corrente (SCT-013)",
        pos: [1.178, 0.825],
        etiqueta: [0, 0.06],
        raioCabo: 0.0021,
        rota: [[-1.181, 0.818, -0.455], [-1.2, 0.806, -0.456], [-1.3, 0.79, -0.452], [-1.345, 0.783, -0.418], [-1.365, 0.778, -0.38], [-1.365, 0.784, -0.357], [-1.365, 0.81, -0.351]],
      },
    ],
    chicote: {
      // canaleta no canto do lado do cabeçote, do SCT-013 até o alto (a tampa voltada para a porta)
      canaletas: [{ min: [-1.38, 0.79, -0.366], max: [-1.35, 1.245, -0.336], tampa: "-z" }],
      prensas: [{ pos: [-1.365, 1.27, -0.336], normal: [0, 0, -1] }], // na parede do fundo, para a caixa de engrenagens
      cabos: [{ pontos: [[-1.365, 1.232, -0.351], [-1.365, 1.255, -0.35], [-1.365, 1.268, -0.343], [-1.365, 1.27, -0.33]], raio: 0.0021 }],
      // cabo do motor entrando pelo piso; as fases chegam nos bornes cinza (x de cada uma, na frente da régua)
      alimentacao: { piso: 0.64, bornes: [-1.17, -1.182, -1.194], yBorne: 0.93, zBorne: -0.387 },
    },
  },
];
/** Antes de criarSelecao: tira de cena o reservatório quadrado (e o óleo dele) e a mangueira do torno.glb. */
export function removerReservatorioQuadrado(modelo) {
  const quadrado = /^Cabecote_fixo_engrenagens_(reservatorio|oleo|mangueira)/;
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
export function criarCompartimentos({ scene, camera, selecao, tampas, fluxo, config, focar, aoAbrirGrandeza, placa }) {
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
    // a roda dentada do sensor de velocidade está no mesmo eixo-árvore da placa: gira junto com ela
    for (const s of sensores) if (s.roda) s.roda.rotation.x = placa?.angulo ?? 0;
  });

  // ---------- estado das medições nos sensores (LED e etiqueta)
  function atualizarSensores() {
    for (const s of sensores) {
      const e = fluxo.estado(s.id);
      const tv = textoValor(config, s.id, e.valor);
      s.atualizar(ESTADOS[e.estado] ?? ESTADOS.semDados, tv, e.valor);
    }
  }
  setInterval(atualizarSensores, 250); // os balões aparecem sempre, mesmo com as tampas fechadas

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
    /** Mostra ou esconde as etiquetas (balões) dos sensores, como o botão de rótulos do painel de RV. */
    mostrarEtiquetas(visivel) {
      for (const s of sensores) for (const m of s.balao) m.setEnabled(visivel);
    },
    /** Câmera para ver o sensor da grandeza `id` com a tampa aberta, ou null se ele não fica num compartimento. */
    vistaDoSensor(id) {
      const c = comps.find((c) => c.interior.sensores.some((s) => s.id === id));
      if (!c) return null;
      const s = c.interior.sensores.find((s) => s.id === id);
      return { alvo: s.alvo, alfa: c.vista.alfa, beta: c.vista.beta, raio: 0.85 };
    },
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
  if (c.chicote) criarChicote(scene, sensoresRaiz, c, sensores);
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
/** PVC das canaletas: PBR, iluminado pelo ambiente como as canaletas do torno.glb. */
function plastico(scene, hex) {
  const chave = `pbr|${hex}`;
  if (!coresCache.has(chave)) {
    const m = new PBRMaterial(`canaleta_${hex}`, scene);
    m.albedoColor = Color3.FromHexString(hex).toLinearSpace();
    m.metallic = 0;
    m.roughness = 0.6;
    coresCache.set(chave, m);
  }
  return coresCache.get(chave);
}
/** Metal (PBR) iluminado pelo ambiente, para peças usinadas que ficam viradas para longe do sol. */
function metalPBR(scene, hex, rugosidade) {
  const chave = `metal|${hex}|${rugosidade}`;
  if (!coresCache.has(chave)) {
    const m = new PBRMaterial(`metal_${hex}`, scene);
    m.albedoColor = Color3.FromHexString(hex).toLinearSpace();
    m.metallic = 1;
    m.roughness = rugosidade;
    coresCache.set(chave, m);
  }
  return coresCache.get(chave);
}
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
  let saidaCabo = null; // de onde o cabo do sensor sai (o resto do cabo é do chicote)
  let fases = null;
  let rodaGirando = null; // nó que gira com o eixo-árvore (roda dentada do sensor de velocidade)
  if (s.tipo === "indutivo") {
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
    // YHDC SCT-013 (núcleo dividido, não invasivo) fechado em volta de uma só das três fases que alimentam
    // o motor (preta, cinza e marrom), a preta: bloco azul com a janela quadrada atravessada pelo cabo,
    // deitado com o rótulo para cima e o cabo preto de saída pela ponta voltada para fora. As fases e o resto
    // do cabo são do chicote; aqui fica só onde cada fase passa (`fases`).
    const xc = x - 0.02; // eixo das fases
    const azul = cor(scene, "#2f8fd8", 0.35);
    const azulEscuro = cor(scene, "#1f6fb0", 0.3);
    const J = 0.013; // janela (13 mm)
    const T = 0.026; // espessura do bloco (no sentido do cabo)
    const W = 0.031; // largura
    const traseira = 0.0055; // barra atrás da janela
    const frente = 0.024; // bloco da frente, com o rótulo
    const xFrente = xc - J / 2 - frente; // ponta voltada para fora
    // as três fases passam pelo eixo xc, lado a lado; só a primeira (preta) atravessa a janela do sensor
    fases = [0, 1, 2].map((i) => new Vector3(xc, y, z + i * 0.036));
    const bloco = (w, d, material, cx, cz, h = T, cy = y) => {
      const m = peca(MeshBuilder.CreateBox("sensorCorrente", { width: w, height: h, depth: d }, scene), material);
      m.position.set(cx, cy, cz);
      return m;
    };
    bloco(traseira, W, azul, xc + J / 2 + traseira / 2, z); // atrás da janela
    for (const lado of [-1, 1]) bloco(J, (W - J) / 2, azul, xc, z + (lado * (W + J)) / 4); // laterais da janela
    bloco(frente, W, azul, xc - J / 2 - frente / 2, z); // frente (rótulo)
    // a parte que abre (dobradiça e trava) fica um pouco saliente num dos lados, como na foto
    bloco(J + traseira + 0.006, 0.003, azulEscuro, xc + traseira / 2 - 0.003, z - W / 2 - 0.0015, T - 0.004);
    bloco(0.006, 0.004, azulEscuro, xc - J / 2 - 0.003, z - W / 2 - 0.002, T - 0.008);
    // núcleo de ferrite aparecendo nas bordas da janela
    for (const lado of [-1, 1]) bloco(0.0015, J - 0.003, escuro, xc + (lado * (J - 0.0015)) / 2, z, T + 0.0004);
    const rotulo = planoDesenhado(scene, "rotuloSCT013", frente - 0.003, W - 0.006, desenharRotuloSCT, 256);
    rotulo.rotation.set(Math.PI / 2, Math.PI / 2, 0);
    rotulo.position.set(xc - J / 2 - frente / 2 - 0.0005, y + T / 2 + 0.0004, z);
    rotulo.parent = raiz;
    malhas.push(rotulo);
    // cabo preto de saída pela ponta (segue pelo chicote até a canaleta)
    const prensa = peca(MeshBuilder.CreateCylinder("caboTC", { diameter: 0.0065, height: 0.005 }, scene), azulEscuro);
    prensa.rotation.z = Math.PI / 2;
    prensa.position.set(xFrente - 0.0025, y - 0.004, z);
    saidaCabo = new Vector3(xFrente - 0.004, y - 0.004, z);
    ponta = new Vector3(xFrente + 0.004, y + T / 2 + 0.004, z + W / 2 - 0.005);
  } else if (s.tipo === "velocidade") {
    // Sensor de velocidade óptico (módulo LM393 com a chave de fenda MOCH22A) lendo uma roda dentada de 20
    // dentes presa na ponta do eixo-árvore (x = -1,378, ressalto de Ø 80 mm): cada dente passa pela fenda do
    // garfo e corta o feixe infravermelho (20 pulsos por volta). A roda gira com o eixo (`roda`). A placa fica
    // deitada em cima da roda, com o garfo virado para baixo e os componentes para a roda, presa por uma
    // cantoneira no parafuso de cima do flange; a barra de pinos (90°) e o conector ficam do lado da fundição.
    const R = 0.055; // raio externo da roda (passa da borda do ressalto, onde o garfo encaixa)
    const pe = 0.0485; // raio do pé dos dentes
    const E = 0.0015; // espessura da roda
    const xr = x - 0.043 - 0.006 - E / 2; // plano da roda, na frente do cubo de 6 mm
    const aluminio = metalPBR(scene, "#c9ced4", 0.35); // usinado: reflete o ambiente mesmo virado para a porta
    const pretoFosco = cor(scene, "#17191c", 0.15);
    const caixa = (w, h, d, material, px, py, pz) => {
      const m = peca(MeshBuilder.CreateBox("sensorVelocidade", { width: w, height: h, depth: d }, scene), material);
      m.position.set(px, py, pz);
      return m;
    };
    // ---- parte que gira, montada em volta do eixo X local de `roda` (centro no plano da roda)
    const roda = new TransformNode("rodaSensorVelocidade", scene);
    roda.parent = raiz;
    roda.position.set(xr, y, z);
    const girando = (malha, material, px, py = 0, pz = 0) => {
      peca(malha, material).parent = roda;
      malha.position.set(px, py, pz);
      return malha;
    };
    const deitado = (d, h, lados) => {
      const m = MeshBuilder.CreateCylinder("sensorVelocidade", { diameter: d, height: h, tessellation: lados }, scene);
      m.rotation.z = Math.PI / 2;
      return m;
    };
    const DENTES = 20;
    const largura = (Math.PI * (R + pe)) / DENTES / 2; // dente e vão com a mesma largura no meio do dente
    const partes = [deitado(2 * pe, E, 64)];
    for (let i = 0; i < DENTES; i++) {
      const a = (i / DENTES) * 2 * Math.PI;
      const dente = MeshBuilder.CreateBox("sensorVelocidade", { width: E, height: R - pe + 0.001, depth: largura }, scene);
      const r = (R + pe - 0.001) / 2;
      dente.rotation.x = a; // Y local (comprimento do dente) → radial
      dente.position.set(0, r * Math.cos(a), r * Math.sin(a));
      partes.push(dente);
    }
    girando(Mesh.MergeMeshes(partes, true, true), aluminio, 0);
    girando(deitado(0.032, 0.006, 32), aluminio, E / 2 + 0.003); // cubo entre o eixo e a roda
    girando(deitado(0.022, 0.0025, 32), metal, -E / 2 - 0.00125); // arruela de aperto
    girando(deitado(0.009, 0.004, 6), escuro, -E / 2 - 0.0045); // parafuso central
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + (i * Math.PI) / 2;
      girando(deitado(0.005, 0.0015, 12), escuro, -E / 2 - 0.00075, 0.031 * Math.cos(a), 0.031 * Math.sin(a));
    }

    // ---- módulo, parado: garfo embaixo da placa, abraçando os dentes do alto da roda
    const yB = y + R + 0.0015; // fundo da fenda (1,5 mm de folga sobre os dentes)
    const yP = yB + 0.0033; // face de baixo da placa (lado dos componentes)
    caixa(0.0124, 0.0033, 0.0062, pretoFosco, xr, yB + 0.00165, z); // base do garfo
    for (const lado of [-1, 1]) caixa(0.0037, 0.0075, 0.0062, pretoFosco, xr + lado * 0.00435, yB - 0.00375, z); // braços (fenda de 5 mm)
    const u = (mm) => xr - 0.0075 + mm / 1000; // ao longo da placa, a partir da ponta do lado do garfo
    caixa(0.032, 0.0016, 0.014, cor(scene, "#2468b4", 0.35), u(16), yP + 0.0008, z); // placa de 32 × 14 mm
    caixa(0.005, 0.0015, 0.004, pretoFosco, u(18), yP - 0.00075, z); // LM393
    for (const [mm, dz] of [[14.5, -0.0045], [14.5, 0.0045], [21.5, -0.0045], [21.5, 0.0045]]) {
      caixa(0.002, 0.0006, 0.00125, escuro, u(mm), yP - 0.0003, z + dz); // resistores
    }
    const ledPlaca = new StandardMaterial("ledPwrSensorVelocidade", scene); // PWR aceso
    ledPlaca.emissiveColor = Color3.FromHexString("#ff3b30");
    ledPlaca.disableLighting = true;
    caixa(0.002, 0.0008, 0.00125, ledPlaca, u(27.5), yP - 0.0004, z - 0.0045);
    caixa(0.002, 0.0008, 0.00125, cor(scene, "#dfe3e8", 0.5), u(27.5), yP - 0.0004, z + 0.0045); // OUT
    // barra de pinos de 90° (VCC, GND, D0, A0) e o conector do cabo
    const yPinos = yP - 0.00125;
    caixa(0.0025, 0.0025, 0.0102, pretoFosco, u(31.25), yPinos, z);
    for (const dz of [-0.00381, -0.00127, 0.00127, 0.00381]) caixa(0.006, 0.0006, 0.0006, cor(scene, "#d8b45a", 0.7), u(35), yPinos, z + dz);
    caixa(0.012, 0.0026, 0.0104, pretoFosco, u(42), yPinos, z);
    saidaCabo = new Vector3(u(48), yPinos, z);
    // cantoneira de alumínio: espaçador sextavado no furo da placa, braço por cima até a fundição e aba
    // presa pelo parafuso de cima do flange do eixo-árvore (o do torno.glb, que fica na frente da aba)
    const cantoneira = metalPBR(scene, "#b4bac1", 0.5);
    const yBraco = yP + 0.0016 + 0.004; // 4 mm de espaçador acima da placa
    const espacador = peca(MeshBuilder.CreateCylinder("sensorVelocidade", { diameter: 0.005, height: 0.004, tessellation: 6 }, scene), metal);
    espacador.position.set(u(24), yBraco - 0.002, z);
    const fimBraco = x - 0.0027; // frente da aba
    caixa(fimBraco - u(20), 0.002, 0.01, cantoneira, (u(20) + fimBraco) / 2, yBraco + 0.001, z);
    caixa(0.0025, 0.0346, 0.016, cantoneira, x - 0.00145, yBraco + 0.0173, z);
    const cabeca = peca(MeshBuilder.CreateCylinder("sensorVelocidade", { diameter: 0.0055, height: 0.0018, tessellation: 12 }, scene), escuro);
    cabeca.position.set(u(24), yBraco + 0.0029, z);
    ponta = new Vector3(xr - 0.004, yP + 0.006, z); // em cima da placa, sobre o garfo (sem escondê-lo)
    rodaGirando = roda;
  } else if (s.tipo === "ultrassonico") {
    // HC-SR04 deitado na tampa do reservatório: placa azul na horizontal sobre quatro espaçadores, os dois
    // transdutores atravessando a tampa e apontando para o óleo, e o conector do cabo
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
    const plugue = peca(MeshBuilder.CreateBox("sensorUltrassom", { width: 0.009, height: 0.014, depth: 0.009 }, scene), escuro);
    plugue.position.set(xp - 0.009, y + 0.0073, z - 0.018);
    saidaCabo = new Vector3(xp - 0.009, y + 0.0135, z - 0.018);
    ponta = new Vector3(xp + 0.004, y + 0.006, z + 0.006);
  }

  // LED de estado
  const matLed = new StandardMaterial(`ledSensor_${nome}`, scene);
  matLed.disableLighting = true;
  const led = peca(MeshBuilder.CreateSphere(`ledSensor_${nome}`, { diameter: 0.009, segments: 8 }, scene), matLed);
  led.position.copyFrom(ponta);

  // balão com o valor (baloes.js): fica fora da tampa e aparece sempre, mesmo com ela fechada; `etiqueta` =
  // (z, y) da borda voltada para o sensor, de onde ele cresce para cima (y ≥ 0) ou para baixo
  const [dz, dy] = s.etiqueta ?? [0, 0.07];
  const borda = new Vector3(x - 0.09, y + dy, z + dz);
  const balao = criarBalao(scene, {
    nome,
    ancora: paraMundo(c, borda),
    sentido: dy >= 0 ? 1 : -1,
    normal: paraMundo(c, new Vector3(-1, 0, 0)), // face aberta do compartimento (a tampa abre para -X do local)
  });
  malhas.push(balao.malha);

  // linha de chamada: da borda do balão até o LED (só com a tampa aberta, junto com o sensor)
  const linha = MeshBuilder.CreateLines(`linhaSensor_${nome}`, { points: [borda, ponta] }, scene);
  linha.color = new Color3(0.55, 0.8, 1);
  linha.isPickable = false;
  linha.parent = raiz;

  let anterior = "";
  const sensor = {
    id: g.id,
    malhas,
    // para o chicote, em coordenadas do mundo (o interior pode estar girado)
    saidaCabo: saidaCabo && paraMundo(c, saidaCabo),
    fases: fases?.map((f) => paraMundo(c, f)),
    alvo: paraMundo(c, ponta), // LED do sensor, no mundo: a câmera vai até ele ao abrir a medição
    balao: [balao.malha, linha],
    roda: rodaGirando,
    rota: s.rota,
    raioCabo: s.raioCabo,
    atualizar(estado, tv) {
      balao.atualizar(g, estado, tv, s.nome);
      if (estado.id === anterior) return;
      anterior = estado.id;
      matLed.emissiveColor = Color3.FromHexString(estado.cor);
    },
  };
  // desenha já na criação: textura nunca atualizada deixa a cena "não pronta" (whenReadyAsync não termina)
  sensor.atualizar(ESTADOS.semDados, { valor: "—", unidade: "" });
  return sensor;
}

/** Ponto do interior (montado girado `giro` em Y) em coordenadas do mundo. */
const paraMundo = (c, v) => Vector3.TransformCoordinates(v, Matrix.RotationY(c.giro ?? 0));

/** Curva suave passando pelos pontos (com dois pontos, uma reta). */
function caminhoSuave(pontos) {
  if (pontos.length < 3) return pontos;
  return Curve3.CreateCatmullRomSpline(pontos, 10).getPoints();
}

/**
 * Cabos do compartimento, arrumados (config `chicote`, em coordenadas do mundo): canaletas, prensa-cabos,
 * o cabo de cada sensor (da saída dele pela `rota` até dentro da canaleta), os trechos entre canaletas e
 * prensa-cabos e, no painel elétrico, a alimentação do motor (cabo pelo piso e fases até os bornes).
 * Fica junto dos sensores (aparece com a tampa bem aberta) e não é clicável.
 */
function criarChicote(scene, pai, c, sensores) {
  const ch = c.chicote;
  const no = new TransformNode(`chicote_${c.id}`, scene);
  no.parent = pai;
  no.rotation.y = -(c.giro ?? 0); // desfaz o giro do interior: aqui as coordenadas são as do mundo
  const pretoCabo = cor(scene, "#16191d", 0.1);
  const v3 = (p) => (p instanceof Vector3 ? p : new Vector3(...p));
  const fixar = (m, material) => {
    m.material = material;
    m.parent = no;
    m.isPickable = false;
    return m;
  };
  const tubo = (pontos, raio, material = pretoCabo) =>
    fixar(MeshBuilder.CreateTube(`cabo_${c.id}`, { path: caminhoSuave(pontos.map(v3)), radius: raio, tessellation: 10, cap: Mesh.CAP_ALL }, scene), material);
  const [gx, gy, gz] = PRENSA_CABO_TAMPO;

  for (const k of ch.canaletas ?? []) criarCanaleta(scene, no, k);
  for (const p of ch.prensas ?? []) {
    const pos = p.tampo ? [gx, gy - 0.028, gz] : p.pos; // teto da caixa de engrenagens, embaixo da caixa de monitoramento
    criarPrensaCabo(scene, no, pos, p.normal, p.cor);
  }
  for (const s of sensores) {
    if (s.saidaCabo && s.rota) tubo([s.saidaCabo, ...s.rota], s.raioCabo ?? 0.0025);
  }
  for (const cb of ch.cabos ?? []) {
    const pontos = cb.pontos.map(v3);
    // sobe reto pelo prensa-cabo do teto e pelo tampo até o prensa-cabo da caixa de monitoramento
    if (cb.ateTampo) pontos.push(new Vector3(gx, gy - 0.034, gz), new Vector3(gx, gy - 0.02, gz), new Vector3(gx, gy + 0.004, gz));
    tubo(pontos, cb.raio ?? 0.0025);
  }

  // alimentação do motor: o cabo (capa preta) entra pelo prensa-cabo do piso; as três fases saem da capa,
  // passam lado a lado por onde o SCT-013 está (`fases`) e sobem até os bornes cinza
  const a = ch.alimentacao;
  const fases = sensores.find((s) => s.fases)?.fases;
  if (a && fases) {
    const meio = fases[1];
    const topoCapa = a.piso + 0.075;
    tubo([[meio.x, a.piso - 0.05, meio.z], [meio.x, topoCapa, meio.z]], 0.0095, cor(scene, "#202327", 0.15));
    criarPrensaCabo(scene, no, [meio.x, a.piso, meio.z], [0, 1, 0], "#9ea4ab", 1.6);
    ["#16191d", "#7d838a", "#6b4426"].forEach((hex, i) => {
      const f = fases[i];
      const xb = a.bornes[i];
      const dx = (i - 1) * 0.0045; // saída de cada fase na ponta da capa
      tubo(
        [
          [meio.x + dx, topoCapa - 0.01, meio.z],
          [meio.x + dx * 1.6, topoCapa + 0.012, meio.z],
          [f.x, f.y - 0.05, f.z],
          [f.x, f.y, f.z],
          [f.x, f.y + 0.035, f.z],
          [xb, a.yBorne - 0.03, f.z + 0.006],
          [xb, a.yBorne - 0.004, a.zBorne - 0.008],
          [xb, a.yBorne, a.zBorne + 0.002],
        ],
        0.0045,
        cor(scene, hex, 0.1),
      );
    });
  }
}

/**
 * Canaleta cinza (como as do painel da foto): corpo, tampa na face `tampa` (voltada para quem olha) e as
 * fendas nas duas laterais por onde os cabos entram. Corre ao longo do maior lado de min → max.
 */
function criarCanaleta(scene, pai, { min, max, tampa }) {
  const tam = [0, 1, 2].map((i) => max[i] - min[i]);
  const centro = [0, 1, 2].map((i) => (max[i] + min[i]) / 2);
  const eixoTampa = { x: 0, y: 1, z: 2 }[tampa[1]];
  const sinalTampa = tampa[0] === "-" ? -1 : 1;
  const comprido = tam.indexOf(Math.max(...tam));
  const lateral = [0, 1, 2].find((i) => i !== comprido && i !== eixoTampa); // eixo das faces com fendas
  const caixa = (t, p, material) => {
    const m = MeshBuilder.CreateBox("canaleta", { width: t[0], height: t[1], depth: t[2] }, scene);
    m.position.set(...p);
    m.material = material;
    return m;
  };
  const corpo = caixa(tam, centro, plastico(scene, "#868c93"));
  // tampa um pouco maior que o corpo na seção, na face voltada para quem olha
  const tTampa = tam.map((t, i) => (i === eixoTampa ? 0.0025 : i === comprido ? t : t + 0.002));
  const pTampa = centro.map((p, i) => (i === eixoTampa ? p + sinalTampa * (tam[i] / 2 + 0.001) : p));
  const tampaM = caixa(tTampa, pTampa, plastico(scene, "#989ea5"));
  // fendas: a cada 8 mm nas duas faces laterais, quase da largura toda
  const fendas = [];
  const escuro = plastico(scene, "#3d4248");
  for (const lado of [-1, 1]) {
    for (let d = min[comprido] + 0.006; d < max[comprido] - 0.004; d += 0.008) {
      const t = [0, 0, 0];
      const p = [...centro];
      t[comprido] = 0.003;
      t[eixoTampa] = tam[eixoTampa] - 0.006;
      t[lateral] = 0.0008;
      p[comprido] = d;
      p[eixoTampa] = centro[eixoTampa] + sinalTampa * 0.002; // abertas do lado da tampa
      p[lateral] = centro[lateral] + lado * (tam[lateral] / 2 + 0.0003);
      fendas.push(caixa(t, p, escuro));
    }
  }
  const fendasM = Mesh.MergeMeshes(fendas, true, true);
  for (const m of [corpo, tampaM, fendasM]) {
    m.parent = pai;
    m.isPickable = false;
  }
}

/** Prensa-cabo preso numa parede: porca sextavada e cúpula saindo para o lado de `normal`. */
function criarPrensaCabo(scene, pai, pos, normal, hex = "#1d2024", escala = 1) {
  const material = cor(scene, hex, 0.2);
  const n = v3n(normal);
  const peca = (d, h, lados, afastamento) => {
    const m = MeshBuilder.CreateCylinder("prensaCabo", { diameter: d * escala, height: h * escala, tessellation: lados }, scene);
    // eixo Y do cilindro → normal
    if (Math.abs(n.y) < 0.99) m.rotationQuaternion = Quaternion.FromUnitVectorsToRef(Vector3.Up(), n, new Quaternion());
    else if (n.y < 0) m.rotation.x = Math.PI;
    m.position = new Vector3(...pos).add(n.scale(afastamento * escala));
    m.material = material;
    m.parent = pai;
    m.isPickable = false;
    return m;
  };
  peca(0.017, 0.003, 6, 0.0015);
  peca(0.0135, 0.007, 20, 0.0065);
}
const v3n = (p) => new Vector3(...p).normalize();


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
