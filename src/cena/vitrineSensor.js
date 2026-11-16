import {
  Color3,
  HemisphericLight,
  Matrix,
  MeshBuilder,
  PickingInfo,
  PointerEventTypes,
  Quaternion,
  StandardMaterial,
  TransformNode,
  Vector3,
} from "@babylonjs/core";
import { criarPainelMedida, enquadrarAoLado } from "../ui/painelMedida.js";
import { criarEmissor } from "../util/emissor.js";

// Vista de perto de um sensor dos compartimentos (velocidade, ultrassônico, corrente), como a da caixa de
// monitoramento: clicar no balão (ou no sensor) traz só o sensor para a frente da tela, com o resto escurecido
// e o painel com os dados da medição ao lado. Quem vem para a frente é uma cópia das peças do sensor (o
// original fica no lugar, com o cabo), que sai do ponto onde ele está na máquina. Arrastar gira, a roda
// aproxima, e Esc, um clique fora ou o × do painel o devolvem.

const DURACAO_ABRIR = 0.8; // s
const DURACAO_FECHAR = 0.6;
const GIRO_PADRAO = [0.3, -0.45]; // inclinação inicial (rad): em torno do eixo horizontal e do vertical da tela

/**
 * Chamar depois de criarSelecao. `mostrar(peca)` recebe a descrição do sensor (compartimentos.pecaDoSensor):
 * { id, nome, descricao, pecas (malhas), quadros (nós que dão a posição das peças no mundo), giro (rotação
 * em Y desses nós), frente (para onde a face aberta do compartimento olha, no mundo), vista ([incl., giro]) }.
 * Emite "estado" (sensor na frente da tela ou não).
 */
export function criarVitrineSensor({ scene, camera, selecao, fluxo, config }) {
  const eventos = criarEmissor();
  const engine = scene.getEngine();
  const canvas = engine.getRenderingCanvas();

  // fundo escurecido atrás do sensor; clicar nele fecha
  const fundo = MeshBuilder.CreatePlane("vitrineSensor_fundo", { size: 1 }, scene);
  const matFundo = new StandardMaterial("matVitrineSensor_fundo", scene);
  matFundo.diffuseColor = Color3.Black();
  matFundo.specularColor = Color3.Black();
  matFundo.disableLighting = true;
  matFundo.backFaceCulling = false;
  matFundo.alpha = 0;
  fundo.material = matFundo;
  fundo.renderingGroupId = 2;
  fundo.rotationQuaternion = Quaternion.Identity();
  fundo.enablePointerMoveEvents = true;
  fundo.setEnabled(false);
  selecao.registrarClicavel(fundo, () => fechar(), null);

  const painel = criarPainelMedida({ fluxo, config, aoFechar: () => fechar() });

  // luz só das cópias, vinda do lado de quem olha (criada com a primeira cópia: sem malhas incluídas,
  // uma luz valeria para a cena toda)
  let luz = null;
  const todasCopias = [];

  const montagens = new Map(); // id do sensor → cópia montada (feita na primeira vez)
  let atual = null;
  let k = 0; // 0 no lugar, 1 na frente da tela
  let alvo = 0;
  let kAplicado = 0;
  let cameraSolta = false;
  const giro = [...GIRO_PADRAO];
  let zoom = 1;

  /**
   * Cópia das peças: raiz (pose na tela) → alinhar (face aberta do compartimento para +Z, centro na origem)
   * → conteudo (= o nó do interior do compartimento) → peças, com os nós intermediários (a roda dentada,
   * que gira) copiados também.
   */
  function montar(peca) {
    const raiz = new TransformNode(`vitrine_${peca.id}`, scene);
    raiz.rotationQuaternion = Quaternion.Identity();
    const alinhar = new TransformNode(`vitrine_${peca.id}_alinhar`, scene);
    alinhar.parent = raiz;
    const conteudo = new TransformNode(`vitrine_${peca.id}_conteudo`, scene);
    conteudo.parent = alinhar;
    conteudo.rotation.y = peca.giro ?? 0;
    const frente = peca.frente.clone().normalize();
    const lateral = Vector3.Cross(Vector3.Up(), frente).normalize();
    const rotacaoNoTorno = Quaternion.RotationQuaternionFromAxis(lateral, Vector3.Up(), frente);
    alinhar.rotationQuaternion = Quaternion.Inverse(rotacaoNoTorno);

    const nos = []; // [original, cópia]: a cópia acompanha a rotação do original a cada quadro
    const copiaDe = new Map();
    const paiDaCopia = (pai) => {
      if (!pai || peca.quadros.has(pai)) return conteudo;
      if (!copiaDe.has(pai)) {
        const n = new TransformNode(`vitrine_${pai.name}`, scene);
        n.parent = paiDaCopia(pai.parent);
        n.position.copyFrom(pai.position);
        n.rotation.copyFrom(pai.rotation);
        if (pai.rotationQuaternion) n.rotationQuaternion = pai.rotationQuaternion.clone();
        n.scaling.copyFrom(pai.scaling);
        copiaDe.set(pai, n);
        nos.push([pai, n]);
      }
      return copiaDe.get(pai);
    };
    const malhas = peca.pecas.map((m) => {
      const c = m.clone(`vitrine_${m.name}`, paiDaCopia(m.parent), true);
      c.setEnabled(true);
      c.isVisible = true;
      c.isPickable = true;
      c.enablePointerMoveEvents = true;
      c.receiveShadows = false;
      c.renderOverlay = false;
      c.renderingGroupId = 2; // por cima de tudo, como a caixa aberta
      return c;
    });

    // centro e raio das peças, com a raiz na origem (coordenadas de `raiz`)
    for (const n of [raiz, alinhar, conteudo, ...nos.map(([, n]) => n)]) n.computeWorldMatrix(true);
    const min = new Vector3(Infinity, Infinity, Infinity);
    const max = new Vector3(-Infinity, -Infinity, -Infinity);
    for (const c of malhas) {
      c.computeWorldMatrix(true);
      const bb = c.getBoundingInfo().boundingBox;
      min.minimizeInPlace(bb.minimumWorld);
      max.maximizeInPlace(bb.maximumWorld);
    }
    const centro = min.add(max).scaleInPlace(0.5);
    alinhar.position.copyFrom(centro.negate());
    raiz.setEnabled(false);

    todasCopias.push(...malhas);
    if (!luz) {
      luz = new HemisphericLight("luzVitrineSensor", new Vector3(0, 1, 0), scene);
      luz.specular = Color3.Black();
      luz.intensity = 0;
    }
    luz.includedOnlyMeshes = [...todasCopias];

    return {
      id: peca.id,
      raiz,
      malhas,
      nos,
      raio: Math.max(0.02, max.subtract(min).length() / 2),
      // no lugar: a raiz no centro das peças no mundo, girada de volta para a posição delas no torno
      repouso: { posicao: centro.rotateByQuaternionToRef(rotacaoNoTorno, new Vector3()), rotacao: rotacaoNoTorno },
    };
  }

  // ---------- cliques: com o sensor na frente da tela só ele e o fundo respondem (nada atrás do fundo, como
  // a tampa ou a caixa de monitoramento, é agarrado ou aberto por engano)
  let predicados = null;
  function restringirCliques(sim) {
    if (sim && !predicados) {
      predicados = { down: scene.pointerDownPredicate, up: scene.pointerUpPredicate, move: scene.pointerMovePredicate };
      const pode = (m) => m.isEnabled() && m.isVisible && (m === fundo || (atual?.malhas.includes(m) ?? false));
      scene.pointerDownPredicate = pode;
      scene.pointerUpPredicate = pode;
      scene.pointerMovePredicate = pode;
    } else if (!sim && predicados) {
      scene.pointerDownPredicate = predicados.down;
      scene.pointerUpPredicate = predicados.up;
      scene.pointerMovePredicate = predicados.move;
      predicados = null;
    }
  }

  // o ponteiro parado não gera "move": a dica do balão some quando o sensor vem para a frente e, na volta,
  // é refeita para o que ficou sob o ponteiro
  let tipoPonteiro = "";
  function refazerDica(repicar) {
    if (tipoPonteiro !== "mouse" && tipoPonteiro !== "pen") return;
    const init = { pointerType: tipoPonteiro };
    scene.simulatePointerMove(new PickingInfo(), init);
    if (repicar) scene.simulatePointerMove(scene.pick(scene.pointerX, scene.pointerY, scene.pointerMovePredicate), init);
  }

  function mostrar(peca) {
    if (alvo === 1 && atual?.id === peca.id) return;
    if (atual && atual.id !== peca.id) {
      // troca direta de um sensor para outro: o anterior volta para o lugar sem animação
      atual.raiz.setEnabled(false);
      k = 0;
    }
    if (!montagens.has(peca.id)) montagens.set(peca.id, montar(peca));
    atual = montagens.get(peca.id);
    alvo = 1;
    giro.splice(0, 2, ...(peca.vista ?? GIRO_PADRAO));
    zoom = 1;
    // a câmera orbital fica parada; arrastar passa a girar o sensor
    if (!cameraSolta && scene.activeCamera === camera && camera.inputs.attachedToElement) {
      camera.inertialAlphaOffset = camera.inertialBetaOffset = camera.inertialRadiusOffset = 0;
      camera.detachControl();
      cameraSolta = true;
    }
    restringirCliques(true);
    painel.mostrar({ id: peca.id, titulo: peca.nome, descricao: peca.descricao });
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
    restringirCliques(false);
    painel.esconder();
    refazerDica(false);
    eventos.emitir("estado", false);
  }

  // ---------- arrastar gira o sensor, a roda aproxima (só com ele na frente da tela)
  let arrasto = null;
  scene.onPointerObservable.add((pi) => {
    tipoPonteiro = pi.event.pointerType ?? tipoPonteiro; // a roda (WheelEvent) não tem tipo
    if (alvo !== 1) return;
    const e = pi.event;
    if (pi.type === PointerEventTypes.POINTERDOWN) {
      arrasto = { id: e.pointerId, x: e.clientX, y: e.clientY };
    } else if (pi.type === PointerEventTypes.POINTERMOVE && arrasto && e.pointerId === arrasto.id) {
      giro[1] += (e.clientX - arrasto.x) * 0.008;
      giro[0] = Math.max(-1.4, Math.min(1.4, giro[0] + (e.clientY - arrasto.y) * 0.008));
      arrasto.x = e.clientX;
      arrasto.y = e.clientY;
    } else if (pi.type === PointerEventTypes.POINTERUP) {
      arrasto = null;
    }
  });
  canvas.addEventListener(
    "wheel",
    (e) => {
      if (alvo === 1) zoom = Math.max(0.6, Math.min(2.6, zoom * Math.exp(-e.deltaY * 0.0012)));
    },
    { passive: true },
  );
  // Esc devolve o sensor antes de recolher painéis ou sair da apresentação
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

  // ---------- pose na frente da tela, recalculada a cada quadro (acompanha a câmera e o painel)
  const suave = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  function poseNaTela() {
    const q = enquadrarAoLado({ scene, camera, raio: atual.raio, painel });
    // face aberta do compartimento para quem olha, em pé; depois o giro do arrasto
    const r = Matrix.RotationAxis(q.direita, giro[0]).multiply(Matrix.RotationAxis(q.cima, giro[1]));
    const rotacao = Quaternion.RotationQuaternionFromAxis(
      Vector3.TransformNormal(q.direita, r),
      Vector3.TransformNormal(q.cima, r),
      Vector3.TransformNormal(q.paraCamera, r),
    );
    // fundo: logo atrás do sensor, cobrindo a vista inteira
    const df = q.d + atual.raio * zoom * 1.5 + 0.05;
    fundo.position.copyFrom(Vector3.TransformCoordinates(q.c.scale(df / q.d), q.inversa));
    fundo.rotationQuaternion = Quaternion.RotationQuaternionFromAxis(q.direita, q.cima, q.paraCamera);
    fundo.scaling.setAll(df * 8);
    luz.direction.copyFrom(q.paraCamera);
    return { posicao: q.centro, rotacao, tela: q.tela };
  }

  scene.onBeforeRenderObservable.add(() => {
    if (!atual) return;
    if (k !== alvo) {
      const dt = Math.min(0.1, engine.getDeltaTime() / 1000);
      k = alvo ? Math.min(1, k + dt / DURACAO_ABRIR) : Math.max(0, k - dt / DURACAO_FECHAR);
      if (k === alvo) refazerDica(true);
    }
    if (k === 0) {
      if (kAplicado !== 0) {
        atual.raiz.setEnabled(false);
        fundo.setEnabled(false);
        luz.intensity = 0;
        kAplicado = 0;
      }
      return;
    }
    kAplicado = k;
    atual.raiz.setEnabled(true);
    fundo.setEnabled(true);
    // a roda dentada da cópia gira junto com a de verdade
    for (const [original, copia] of atual.nos) {
      copia.rotation.copyFrom(original.rotation);
      if (original.rotationQuaternion) copia.rotationQuaternion.copyFrom(original.rotationQuaternion);
    }
    const kVoo = suave(k);
    const p = poseNaTela();
    Vector3.LerpToRef(atual.repouso.posicao, p.posicao, kVoo, atual.raiz.position);
    Quaternion.SlerpToRef(atual.repouso.rotacao, p.rotacao, kVoo, atual.raiz.rotationQuaternion);
    atual.raiz.scaling.setAll(1 + (zoom - 1) * kVoo);
    matFundo.alpha = 0.55 * kVoo;
    fundo.isPickable = alvo === 1;
    luz.intensity = 0.45 * kVoo;
    if (alvo === 1) painel.posicionar(p.tela, zoom);
  });

  return {
    mostrar,
    fechar,
    get aberta() {
      return alvo === 1;
    },
    on: eventos.on,
  };
}
