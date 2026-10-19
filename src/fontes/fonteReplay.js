import { GRANDEZAS } from "../config/grandezas.js";
import { indiceDepois } from "../dados/sessao.js";
import { criarEmissor } from "../util/emissor.js";

/**
 * Fonte "Replay": reproduz uma sessão gravada. O "agora" do fluxo passa a ser a posição
 * da reprodução, então modelo 3D, rótulos e gráficos ficam sincronizados com ela.
 */
export function criarFonteReplay() {
  const eventos = criarEmissor();
  let sessao = null;
  let fluxo = null;
  let pos = 0; // ms desde o início da sessão
  let tocando = false;
  let velocidade = 1;
  let timer = null;
  let tReal = 0;
  const proximo = {}; // próximo índice a publicar por grandeza

  const duracao = () => (sessao ? sessao.fim - sessao.inicio : 0);

  function reconstruir() {
    if (!fluxo || !sessao) return;
    const novas = {};
    for (const g of GRANDEZAS) {
      const serie = sessao.series[g.id] ?? [];
      const i = indiceDepois(serie, pos);
      proximo[g.id] = i;
      novas[g.id] = serie.slice(0, i).map(([t, v]) => ({ t: sessao.inicio + t, v }));
    }
    fluxo.substituirSeries(novas);
  }

  function irPara(novaPos) {
    if (!sessao) return;
    const alvo = Math.max(0, Math.min(duracao(), novaPos));
    if (alvo < pos || alvo - pos > 20000) {
      pos = alvo;
      reconstruir();
    } else {
      pos = alvo;
      for (const g of GRANDEZAS) {
        const serie = sessao.series[g.id] ?? [];
        while (proximo[g.id] < serie.length && serie[proximo[g.id]][0] <= pos) {
          const [t, v] = serie[proximo[g.id]++];
          fluxo.publicar(g.id, v, sessao.inicio + t);
        }
      }
    }
    eventos.emitir("posicao", pos);
  }

  function tick() {
    const agoraReal = performance.now();
    const dt = Math.min(1000, agoraReal - tReal);
    tReal = agoraReal;
    if (!tocando || !sessao) return;
    irPara(pos + dt * velocidade);
    if (pos >= duracao()) pausar();
  }

  function tocar() {
    if (!sessao) return;
    if (pos >= duracao()) irPara(0);
    tocando = true;
    tReal = performance.now();
    eventos.emitir("tocando", true);
  }
  function pausar() {
    tocando = false;
    eventos.emitir("tocando", false);
  }

  return {
    id: "replay",
    nome: "Replay",
    on: eventos.on,
    async iniciar(f) {
      fluxo = f;
      tReal = performance.now();
      timer = setInterval(tick, 100);
      atualizarConexao();
      if (sessao) reconstruir();
    },
    async parar() {
      clearInterval(timer);
      pausar();
    },
    agora: () => (sessao ? sessao.inicio + pos : Date.now()),
    carregar(s) {
      sessao = s;
      pos = 0;
      pausar();
      reconstruir();
      atualizarConexao();
      eventos.emitir("sessao", s);
      eventos.emitir("posicao", pos);
    },
    get sessao() {
      return sessao;
    },
    get posicao() {
      return pos;
    },
    get duracao() {
      return duracao();
    },
    get tocando() {
      return tocando;
    },
    get velocidade() {
      return velocidade;
    },
    definirVelocidade(v) {
      velocidade = v;
    },
    irPara,
    tocar,
    pausar,
    alternar: () => (tocando ? pausar() : tocar()),
    /** Série completa (para a comparação mostrar a sessão inteira com o cursor). */
    serieCompleta(id, t0, t1) {
      if (!sessao) return [];
      const serie = sessao.series[id] ?? [];
      const i0 = Math.max(0, indiceDepois(serie, t0 - sessao.inicio) - 1);
      const i1 = indiceDepois(serie, t1 - sessao.inicio);
      return serie.slice(i0, i1).map(([t, v]) => ({ t: sessao.inicio + t, v }));
    },
  };

  function atualizarConexao() {
    fluxo?.definirConexao({ estado: "replay", texto: sessao ? `Replay · ${sessao.titulo}` : "Replay · nenhuma sessão" });
  }
}
