import { Color3, Mesh, PointerEventTypes } from "@babylonjs/core";
import { COMPONENTES } from "../config/componentes.js";
import { calcularLimites } from "./modelo.js";
import { criarEmissor } from "../util/emissor.js";

const COR_HOVER = new Color3(0.35, 0.75, 1);
const COR_SELECAO = new Color3(0.15, 0.55, 1);

/**
 * Identificação de componentes: cada malha do GLB é associada a um componente didático.
 * Passar o ponteiro destaca; clicar (ou apontar o controle em RV e apertar o gatilho) seleciona.
 * Emite: "hover" (componente|null, evento), "selecao" (componente|null)
 */
export function criarSelecao(scene, modelo) {
  const eventos = criarEmissor();
  const porNo = new Map(COMPONENTES.filter((c) => c.no).map((c) => [c.no, c]));
  const porMalha = new Map();
  const componentes = COMPONENTES.map((c) => ({ ...c, malhas: [], regra: c.malhas }));
  const porId = new Map(componentes.map((c) => [c.id, c]));
  const estrutura = modelo.no("Estrutura");

  function resolver(malha) {
    if (malha.parent === estrutura) {
      const c = componentes.find((c) => c.regra && c.regra.test(malha.name));
      if (c) return c;
    }
    for (let n = malha; n; n = n.parent) {
      const c = porNo.get(n.name);
      if (c) return porId.get(c.id);
    }
    return null;
  }

  for (const m of modelo.malhas) {
    const c = resolver(m);
    if (!c) continue;
    c.malhas.push(m);
  }

  // Desempenho: o GLB tem 523 malhas. Dentro de cada componente, peças com o mesmo nó pai e o
  // mesmo material viram uma só malha (~5× menos chamadas de desenho, importante no headset).
  // A identificação continua por componente, e as malhas mescladas seguem o nó pai (a placa gira).
  for (const c of componentes) {
    const grupos = new Map();
    for (const m of c.malhas) {
      const chave = `${m.parent?.uniqueId}|${m.material?.uniqueId}`;
      if (!grupos.has(chave)) grupos.set(chave, []);
      grupos.get(chave).push(m);
    }
    const resultado = [];
    for (const lista of grupos.values()) {
      if (lista.length === 1) {
        resultado.push(lista[0]);
        continue;
      }
      const pai = lista[0].parent;
      const mesclada = Mesh.MergeMeshes(lista, true, true);
      if (!mesclada) {
        resultado.push(...lista);
        continue;
      }
      mesclada.name = `${c.id}__${lista[0].material?.name ?? "material"}`;
      if (pai) mesclada.setParent(pai);
      resultado.push(mesclada);
    }
    c.malhas = resultado;
    for (const m of resultado) porMalha.set(m.uniqueId, c);
  }
  const malhasFinais = componentes.flatMap((c) => c.malhas);

  // Limites calculados sob demanda (peças móveis podem mudar de lugar).
  const limitesDe = (c) => calcularLimites(c.malhas);

  let hover = null;
  let selecionado = null;

  function pintar(c, cor, alfa) {
    if (!c) return;
    for (const m of c.malhas) {
      m.renderOverlay = cor !== null;
      if (cor) {
        m.overlayColor = cor;
        m.overlayAlpha = alfa;
      }
    }
  }

  function atualizarDestaques() {
    for (const c of componentes) pintar(c, null);
    if (hover && hover !== selecionado) pintar(hover, COR_HOVER, 0.22);
    if (selecionado) pintar(selecionado, COR_SELECAO, 0.38);
  }

  function definirHover(c, evento) {
    if (c === hover) return;
    hover = c;
    atualizarDestaques();
    eventos.emitir("hover", c, evento);
  }

  function selecionar(idOuComponente) {
    const c = typeof idOuComponente === "string" ? porId.get(idOuComponente) ?? null : idOuComponente;
    selecionado = c;
    atualizarDestaques();
    eventos.emitir("selecao", c);
  }

  // Elementos extras clicáveis (marcadores e rótulos dos sensores) registram seu próprio tratamento.
  const extras = new Map();
  function registrarClicavel(malha, aoClicar, componenteHover = null) {
    extras.set(malha.uniqueId, { aoClicar, componenteHover });
  }

  scene.onPointerObservable.add((pi) => {
    if (pi.type !== PointerEventTypes.POINTERMOVE && pi.type !== PointerEventTypes.POINTERTAP) return;
    const malha = pi.pickInfo?.hit ? pi.pickInfo.pickedMesh : null;
    const extra = malha ? extras.get(malha.uniqueId) : null;
    const c = malha ? porMalha.get(malha.uniqueId) ?? null : null;

    if (pi.type === PointerEventTypes.POINTERMOVE) {
      definirHover(extra ? extra.componenteHover : c, pi.event);
      return;
    }
    // TAP
    if (extra) {
      extra.aoClicar();
      return;
    }
    if (c) selecionar(c);
    else if (!malha || malha.name === "piso") selecionar(null);
  });

  return {
    malhas: malhasFinais,
    componentes: componentes.filter((c) => !c.oculto),
    porId: (id) => porId.get(id) ?? null,
    get selecionado() {
      return selecionado;
    },
    selecionar,
    limitesDe,
    registrarClicavel,
    on: eventos.on,
  };
}
