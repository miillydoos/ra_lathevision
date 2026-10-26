import { ImportMeshAsync, Vector3 } from "@babylonjs/core";
import "@babylonjs/loaders/glTF";

/**
 * Carrega o torno.glb e devolve acesso aos nós (conjuntos) pelo nome.
 * O modelo já vem em metros, com Y para cima e pivôs corretos (a placa gira no eixo do eixo-árvore),
 * então não há correção de orientação.
 */
export async function carregarModelo(scene, { url, aoProgresso }) {
  const resultado = await ImportMeshAsync(url, scene, {
    onProgress: (e) => aoProgresso?.(e.lengthComputable ? e.loaded / e.total : null),
  });

  const raiz = resultado.meshes[0];
  const malhas = resultado.meshes.filter((m) => m !== raiz && m.getTotalVertices() > 0);

  const nos = new Map();
  for (const n of resultado.transformNodes) if (!nos.has(n.name)) nos.set(n.name, n);
  for (const m of malhas) if (!nos.has(m.name)) nos.set(m.name, m);

  const limites = calcularLimites(malhas);

  return {
    raiz,
    malhas,
    limites,
    no: (nome) => nos.get(nome) ?? null,
  };
}

/** Sombras e congelamento das peças fixas. Chamar depois de mesclar as malhas. */
export function prepararMalhas(modelo, malhas, sombras) {
  modelo.malhas = malhas;
  const estrutura = modelo.no("Estrutura");
  for (const m of malhas) {
    m.receiveShadows = true;
    // só peças com tamanho relevante projetam sombra (parafusos e venezianas não)
    const raio = m.getBoundingInfo().boundingSphere.radiusWorld;
    if (raio > 0.04) sombras?.addShadowCaster(m, false);
    // peças fixas não precisam recalcular a matriz de mundo a cada quadro
    if (m.parent === estrutura) m.freezeWorldMatrix();
  }
}

export function calcularLimites(malhas) {
  let min = new Vector3(Infinity, Infinity, Infinity);
  let max = new Vector3(-Infinity, -Infinity, -Infinity);
  for (const m of malhas) {
    m.computeWorldMatrix(true);
    const bb = m.getBoundingInfo().boundingBox;
    min = Vector3.Minimize(min, bb.minimumWorld);
    max = Vector3.Maximize(max, bb.maximumWorld);
  }
  const centro = Vector3.Center(min, max);
  const tamanho = max.subtract(min);
  return { min, max, centro, tamanho, raio: tamanho.length() / 2 };
}
