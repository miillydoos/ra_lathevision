import { Color3, HemisphericLight, Matrix, PickingInfo, Quaternion, TransformNode, Vector3 } from "@babylonjs/core";
import { criarPainelMedida, enquadrarAoLado } from "../ui/painelMedida.js";
import { criarDestaque, curvas, pontoDoVoo } from "./destaque.js";
import { criarEmissor } from "../util/emissor.js";

// Vista de perto de um sensor dos compartimentos (velocidade, ultrassônico, corrente), como a da caixa de
// monitoramento: clicar no balão (ou no sensor) traz só o sensor para a frente da tela, com o resto escurecido
// e o painel com os dados da medição ao lado. Quem vem para a frente é uma cópia das peças do sensor (o
// original fica no lugar, com o cabo): ela sai do ponto onde ele está na máquina, sobe num arco dando uma volta
// em torno de si, chega com um leve pulo e uma onda de luz (destaque.js), enquanto a cena de trás se aproxima e
// escurece. Arrastar gira (com inércia), a roda aproxima, e Esc, um clique fora ou o × do painel o devolvem.

const DURACAO_ABRIR = 1.0; // s
const DURACAO_FECHAR = 0.65;
const GIRO_PADRAO = [0.3, -0.45]; // inclinação inicial (rad): em torno do eixo horizontal e do vertical da tela
const PULO = 0.07; // o sensor cresce 7% e volta, ao chegar

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

  const destaque = criarDestaque(scene, { nome: "vitrineSensor", camera, selecao, aoClicarFundo: () => fechar(), aoFechar: () => fechar() });
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
      const pode = (m) => m.isEnabled() && m.isVisible && (m === destaque.fundo || (atual?.malhas.includes(m) ?? false));
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
  scene.onPointerObservable.add((pi) => {
    tipoPonteiro = pi.event.pointerType ?? tipoPonteiro; // a roda (WheelEvent) não tem tipo
  });
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
    destaque.ativar(true, peca.vista ?? GIRO_PADRAO);
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
    destaque.ativar(false);
    restringirCliques(false);
    painel.esconder();
    refazerDica(false);
    eventos.emitir("estado", false);
  }

  // ---------- pose a cada quadro: voo em arco do lugar no torno até a frente da tela (acompanha a câmera)
  const tmp = { q: new Quaternion() };

  scene.onBeforeRenderObservable.add(() => {
    if (!atual) return;
    const dt = Math.min(0.1, engine.getDeltaTime() / 1000);
    if (k !== alvo) {
      k = alvo ? Math.min(1, k + dt / DURACAO_ABRIR) : Math.max(0, k - dt / DURACAO_FECHAR);
      if (k === alvo) refazerDica(true);
    }
    if (k === 0) {
      if (kAplicado !== 0) {
        atual.raiz.setEnabled(false);
        luz.intensity = 0;
        destaque.atualizar({ k: 0 });
        kAplicado = 0;
      }
      return;
    }
    kAplicado = k;
    destaque.passo(dt);
    atual.raiz.setEnabled(true);
    // a roda dentada da cópia gira junto com a de verdade
    for (const [original, copia] of atual.nos) {
      copia.rotation.copyFrom(original.rotation);
      if (original.rotationQuaternion) copia.rotationQuaternion.copyFrom(original.rotationQuaternion);
    }

    const kVoo = curvas.suave(k);
    const zoom = destaque.zoom;
    const q = enquadrarAoLado({ scene, camera, raio: atual.raio, painel });
    const [inclinacao, voltas] = destaque.giro;
    // face aberta do compartimento para quem olha, em pé; depois o giro do arrasto
    const r = Matrix.RotationAxis(q.direita, inclinacao).multiply(Matrix.RotationAxis(q.cima, voltas));
    const final = Quaternion.RotationQuaternionFromAxis(
      Vector3.TransformNormal(q.direita, r),
      Vector3.TransformNormal(q.cima, r),
      Vector3.TransformNormal(q.paraCamera, r),
    );

    // posição: em arco, crescendo por igual na tela até a pose final
    pontoDoVoo(scene.activeCamera.globalPosition, atual.repouso.posicao, q.centro, kVoo, q, atual.raiz.position);

    // rotação: do jeito que está no torno até a pose na tela, dando uma volta em torno do eixo vertical
    Quaternion.SlerpToRef(atual.repouso.rotacao, final, kVoo, tmp.q);
    Quaternion.RotationAxis(q.cima, 2 * Math.PI * (kVoo - 1)).multiplyToRef(tmp.q, atual.raiz.rotationQuaternion);

    const pulo = alvo === 1 ? 1 + PULO * curvas.pulo(k, 0.62) : 1;
    atual.raiz.scaling.setAll((1 + (zoom - 1) * kVoo) * pulo);
    luz.direction.copyFrom(q.paraCamera);
    luz.intensity = 0.45 * kVoo;
    destaque.atualizar({ q, raio: atual.raio * zoom, k: kVoo, abrindo: alvo === 1 });
    if (alvo === 1) {
      painel.posicionar(q.tela, zoom);
      if (k > 0.8) painel.revelar();
    }
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
