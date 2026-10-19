/** Emissor de eventos mínimo: on(nome, fn) devolve a função para cancelar a inscrição. */
export function criarEmissor() {
  const ouvintes = new Map();
  return {
    on(nome, fn) {
      if (!ouvintes.has(nome)) ouvintes.set(nome, new Set());
      ouvintes.get(nome).add(fn);
      return () => ouvintes.get(nome)?.delete(fn);
    },
    emitir(nome, ...args) {
      for (const fn of ouvintes.get(nome) ?? []) {
        try {
          fn(...args);
        } catch (erro) {
          console.error(`[evento ${nome}]`, erro);
        }
      }
    },
  };
}
