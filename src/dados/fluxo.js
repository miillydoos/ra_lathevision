import { GRANDEZAS } from "../config/grandezas.js";
import { criarEmissor } from "../util/emissor.js";

const RETENCAO_MS = 60 * 60 * 1000; // uma hora de histórico em memória
const GRAVIDADE = { normal: 0, semDados: 0, atencao: 1, alarme: 2 };

/**
 * Centro dos dados: recebe leituras da fonte ativa (ao vivo, simulação ou replay),
 * guarda o histórico de cada grandeza e avalia o estado (Normal / Atenção / Alarme / Sem dados).
 *
 * Uma fonte implementa: { id, nome, iniciar(fluxo), parar(), agora() }
 * e chama fluxo.publicar(grandeza, valor, t) e fluxo.definirConexao({...}).
 */
export function criarFluxo(config) {
  const eventos = criarEmissor();
  const series = Object.fromEntries(GRANDEZAS.map((g) => [g.id, []]));
  let fonte = null;
  let conexao = { estado: "parado", texto: "Sem fonte de dados" };

  const agora = () => fonte?.agora?.() ?? Date.now();

  function publicar(id, valor, t = agora()) {
    const serie = series[id];
    if (!serie) return;
    const v = valor === null || valor === undefined ? null : Number(valor);
    if (v !== null && !Number.isFinite(v)) return;
    // leituras fora de ordem (rede) são inseridas no lugar certo
    if (serie.length && t < serie[serie.length - 1].t) {
      const i = indiceAntes(serie, t) + 1;
      serie.splice(i, 0, { t, v });
    } else {
      serie.push({ t, v });
    }
    const corte = t - RETENCAO_MS;
    if (serie.length > 50 && serie[0].t < corte) serie.splice(0, indiceAntes(serie, corte) + 1);
    eventos.emitir("leitura", id, v, t);
  }

  function ultima(id) {
    const serie = series[id];
    const tAgora = agora();
    // no replay, "agora" pode estar no passado: pega a última leitura até esse instante
    for (let i = serie.length - 1; i >= 0; i--) if (serie[i].t <= tAgora + 1) return serie[i];
    return null;
  }

  /** Pontos entre t0 e t1 (inclui um ponto antes de t0 para a linha começar na borda). */
  function janela(id, t0, t1) {
    const serie = series[id];
    if (!serie.length) return [];
    const i0 = Math.max(0, indiceAntes(serie, t0));
    const i1 = indiceAntes(serie, t1);
    return serie.slice(i0, i1 + 1);
  }

  function estado(id) {
    const g = config.grandezas[id];
    const u = ultima(id);
    const idade = u ? (agora() - u.t) / 1000 : null;
    const velha = idade !== null && idade > config.leituraVelhaS;
    let est = velha || !u ? "semDados" : avaliar(g, u.v);
    // Persistência: só muda para Atenção/Alarme se o limite foi ultrapassado durante
    // todo o intervalo configurado (ex.: o pico de partida do motor não dispara alarme).
    if ((est === "atencao" || est === "alarme") && g?.persistenciaS > 0) {
      const desde = u.t - g.persistenciaS * 1000;
      const anteriores = janela(id, desde, u.t);
      const cobre = anteriores.length && anteriores[0].t <= desde + 600;
      let gravidade = cobre ? GRAVIDADE[est] : 0;
      for (const p of anteriores) if (p.t >= desde) gravidade = Math.min(gravidade, GRAVIDADE[avaliar(g, p.v)] ?? 0);
      est = gravidade === 2 ? "alarme" : gravidade === 1 ? "atencao" : "normal";
    }
    return {
      valor: u?.v ?? null,
      t: u?.t ?? null,
      idade,
      velha,
      estado: est,
    };
  }

  async function usarFonte(nova) {
    if (fonte) await fonte.parar();
    limpar();
    fonte = nova;
    eventos.emitir("fonte", nova);
    if (nova) await nova.iniciar(api);
  }

  function limpar() {
    for (const id of Object.keys(series)) series[id].length = 0;
    eventos.emitir("limpar");
  }

  /** Substitui todo o histórico (usado pelo replay ao voltar no tempo). */
  function substituirSeries(novas) {
    for (const id of Object.keys(series)) {
      series[id].length = 0;
      if (novas[id]) series[id].push(...novas[id]);
    }
    eventos.emitir("limpar");
  }

  function definirConexao(c) {
    conexao = { ...conexao, ...c };
    eventos.emitir("conexao", conexao);
  }

  const api = {
    config,
    series,
    agora,
    publicar,
    ultima,
    janela,
    estado,
    usarFonte,
    limpar,
    substituirSeries,
    definirConexao,
    get conexao() {
      return conexao;
    },
    get fonte() {
      return fonte;
    },
    /** Instante da leitura mais recente entre todas as grandezas. */
    ultimaLeituraGeral() {
      let t = null;
      for (const id of Object.keys(series)) {
        const u = ultima(id);
        if (u && (t === null || u.t > t)) t = u.t;
      }
      return t;
    },
    on: eventos.on,
  };
  return api;
}

/** Avalia o estado de um valor frente aos limites configurados. */
export function avaliar(limite, valor) {
  if (valor === null || valor === undefined) return "semDados";
  if (!limite) return "normal";
  if (limite.sensor === "boia") return valor >= 0.5 ? "normal" : "alarme";
  const { atencao, alarme } = limite;
  if (limite.sentido === "abaixo") {
    if (alarme !== null && alarme !== undefined && valor <= alarme) return "alarme";
    if (atencao !== null && atencao !== undefined && valor <= atencao) return "atencao";
    return "normal";
  }
  if (alarme !== null && alarme !== undefined && valor >= alarme) return "alarme";
  if (atencao !== null && atencao !== undefined && valor >= atencao) return "atencao";
  return "normal";
}

/** Índice do último ponto com t <= alvo (-1 se nenhum). */
function indiceAntes(serie, alvo) {
  let lo = 0;
  let hi = serie.length - 1;
  let r = -1;
  while (lo <= hi) {
    const m = (lo + hi) >> 1;
    if (serie[m].t <= alvo) {
      r = m;
      lo = m + 1;
    } else {
      hi = m - 1;
    }
  }
  return r;
}
