// Sessões gravadas guardadas no IndexedDB deste navegador.
// Para levar uma sessão a outro computador, use "Baixar" (arquivo .json) e "Abrir arquivo".

const BANCO = "lab-torno";
const LOJA = "sessoes";
let promessa = null;

function abrirBanco() {
  if (promessa) return promessa;
  promessa = new Promise((resolve, reject) => {
    try {
      const req = indexedDB.open(BANCO, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(LOJA, { keyPath: "id" });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    } catch (erro) {
      reject(erro);
    }
  });
  return promessa;
}

async function transacao(modo, fn) {
  const db = await abrirBanco();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(LOJA, modo);
    const resultado = fn(tx.objectStore(LOJA));
    tx.oncomplete = () => resolve(resultado?.result ?? resultado);
    tx.onerror = () => reject(tx.error);
  });
}

export async function salvarSessao(sessao) {
  try {
    await transacao("readwrite", (loja) => loja.put(sessao));
    return true;
  } catch (erro) {
    console.warn("não foi possível salvar a sessão no navegador", erro);
    return false;
  }
}

export async function listarSessoes() {
  try {
    const todas = await transacao("readonly", (loja) => loja.getAll());
    return (todas ?? [])
      .map((s) => ({ id: s.id, titulo: s.titulo, inicio: s.inicio, fim: s.fim, origem: s.origem }))
      .sort((a, b) => b.inicio - a.inicio);
  } catch {
    return [];
  }
}

export async function lerSessao(id) {
  try {
    return await transacao("readonly", (loja) => loja.get(id));
  } catch {
    return null;
  }
}

export async function excluirSessao(id) {
  try {
    await transacao("readwrite", (loja) => loja.delete(id));
  } catch (erro) {
    console.warn(erro);
  }
}

/** Oferece a sessão como arquivo .json para download. */
export function baixarSessao(sessao) {
  const blob = new Blob([JSON.stringify(sessao)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  const data = new Date(sessao.inicio).toISOString().slice(0, 16).replace(/[:T]/g, "-");
  a.download = `sessao-torno-${data}.json`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 1000);
}
