import { GRANDEZAS, GRANDEZA_POR_ID, formatarValor } from "../config/grandezas.js";
import { ESTADOS } from "../config/estados.js";
import { svgIcone } from "../util/icones.js";
import { desenharComparacao, desenharSerie, prepararCanvas } from "./graficos.js";
import { avaliar } from "../dados/fluxo.js";

const escapar = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** "há 3 s", "há 2 min" */
export function textoIdade(idadeS) {
  if (idadeS === null || idadeS === undefined) return "sem leitura";
  if (idadeS < 1) return "agora";
  if (idadeS < 60) return `há ${Math.floor(idadeS)} s`;
  if (idadeS < 3600) return `há ${Math.floor(idadeS / 60)} min`;
  return `há ${Math.floor(idadeS / 3600)} h`;
}

/** Texto do valor (boia mostra estados, não porcentagem). */
export function textoValor(config, id, valor) {
  const g = GRANDEZA_POR_ID[id];
  if (valor === null || valor === undefined) return { valor: "—", unidade: "" };
  if (id === "oleo" && config.grandezas.oleo?.sensor === "boia") return { valor: valor >= 0.5 ? "OK" : "Baixo", unidade: "boia" };
  return { valor: formatarValor(g, valor), unidade: g.unidade + (g.sufixo ? " " + g.sufixo : "") };
}

/** Formato de tempo padrão: relativo ao instante atual da fonte. */
export function tempoRelativo(agora) {
  return (t) => {
    const s = Math.round((agora - t) / 1000);
    return s <= 0 ? "agora" : `−${s} s`;
  };
}

function htmlEstado(estado) {
  return `${svgIcone(estado.icone, { tamanho: 14, espessura: 2.4 })}<span>${estado.texto}</span>`;
}

/**
 * Painel "Medições" (lateral direita): cartões das cinco grandezas com valor, estado,
 * idade da leitura e minigráfico; ao abrir um cartão, gráfico detalhado com limites,
 * cuidados de interpretação e tabela. Alternativa "Comparar": pequenos múltiplos.
 */
export function criarSensoresUI({ fluxo, config, aoSelecionarGrandeza }) {
  const lateral = document.getElementById("lateral-direita");
  lateral.innerHTML = `
    <section class="painel painel-sensores" aria-label="Medições">
      <header class="cab-sensores">
        <h2>Medições</h2>
        <div class="alternador" role="group" aria-label="Visualização">
          <button type="button" class="botao mini" data-vista="cartoes" aria-pressed="true">Cartões</button>
          <button type="button" class="botao mini" data-vista="comparar" aria-pressed="false">Comparar</button>
        </div>
      </header>
      <p class="sutil info-fonte" id="info-fonte"></p>
      <div class="lista-sensores" id="lista-sensores"></div>
      <div class="comparacao" id="comparacao" hidden>
        <canvas class="grafico-comparacao" aria-label="Pequenos múltiplos das cinco grandezas no mesmo eixo de tempo"></canvas>
        <p class="sutil">Mesma janela de tempo para todas as grandezas. Passe o mouse para ler os valores no mesmo instante.</p>
      </div>
    </section>`;

  const lista = lateral.querySelector("#lista-sensores");
  const comparacao = lateral.querySelector("#comparacao");
  const canvasComparacao = comparacao.querySelector("canvas");
  const infoFonte = lateral.querySelector("#info-fonte");
  const dica = criarDica();

  let vista = "cartoes";
  let aberta = null;
  let formatoTempo = null; // definido pela fonte (replay usa mm:ss)
  let janelaFixa = null; // replay: { t0, t1 } da sessão inteira na comparação
  let serieFixa = null; // replay: (id, t0, t1) => pontos da sessão completa
  let aoClicarTempo = null; // replay: clicar no gráfico leva àquele instante
  let marcadores = [];
  const cartoes = new Map();

  for (const g of GRANDEZAS) {
    const el = document.createElement("article");
    el.className = "sensor";
    el.dataset.id = g.id;
    el.innerHTML = `
      <button type="button" class="sensor-cab" aria-expanded="false">
        <span class="sensor-icone">${svgIcone(g.icone, { tamanho: 18 })}</span>
        <span class="sensor-nome">${escapar(g.nome)}</span>
        <span class="estado-chip"></span>
      </button>
      <div class="sensor-valor"><strong class="valor">—</strong><span class="unidade"></span><small class="idade"></small></div>
      <canvas class="sparkline" aria-hidden="true"></canvas>
      <div class="sensor-detalhe" hidden>
        <canvas class="grafico-detalhe" role="img" aria-label="Gráfico de ${escapar(g.nome)} na janela recente"></canvas>
        <div class="estatisticas"></div>
        <dl class="ficha">
          <dt>Ponto medido</dt><dd>${escapar(g.local)}</dd>
          <dt>Representação</dt><dd>${escapar(g.representacao)}</dd>
          <dt>Cuidado na interpretação</dt><dd>${escapar(g.cuidado)}</dd>
          <dt>Limites configurados</dt><dd class="limites"></dd>
        </dl>
        <button type="button" class="botao mini" data-acao="tabela" aria-expanded="false">Ver tabela</button>
        <div class="tabela" hidden></div>
      </div>`;
    lista.appendChild(el);
    const c = {
      el,
      cab: el.querySelector(".sensor-cab"),
      chip: el.querySelector(".estado-chip"),
      valor: el.querySelector(".valor"),
      unidade: el.querySelector(".unidade"),
      idade: el.querySelector(".idade"),
      spark: el.querySelector(".sparkline"),
      detalhe: el.querySelector(".sensor-detalhe"),
      grafico: el.querySelector(".grafico-detalhe"),
      estatisticas: el.querySelector(".estatisticas"),
      limites: el.querySelector(".limites"),
      tabela: el.querySelector(".tabela"),
      btnTabela: el.querySelector('[data-acao="tabela"]'),
      geo: null,
    };
    c.limites.textContent = textoLimites(config, g.id);
    cartoes.set(g.id, c);

    c.cab.addEventListener("click", () => abrir(aberta === g.id ? null : g.id, true));
    c.btnTabela.addEventListener("click", () => {
      const mostrar = c.tabela.hidden;
      c.tabela.hidden = !mostrar;
      c.btnTabela.setAttribute("aria-expanded", String(mostrar));
      c.btnTabela.textContent = mostrar ? "Ocultar tabela" : "Ver tabela";
      if (mostrar) atualizarTabela(g.id);
    });
    c.grafico.addEventListener("pointermove", (e) => dicaSerie(e, g.id, c));
    c.grafico.addEventListener("pointerleave", () => dica.esconder());
  }

  lateral.querySelector(".alternador").addEventListener("click", (e) => {
    const b = e.target.closest("[data-vista]");
    if (b) definirVista(b.dataset.vista);
  });
  canvasComparacao.addEventListener("pointermove", dicaComparacao);
  canvasComparacao.addEventListener("pointerleave", () => dica.esconder());

  function definirVista(v) {
    vista = v;
    for (const b of lateral.querySelectorAll("[data-vista]")) b.setAttribute("aria-pressed", String(b.dataset.vista === v));
    lista.hidden = v !== "cartoes";
    comparacao.hidden = v !== "comparar";
    atualizar();
  }

  function abrir(id, doUsuario = false) {
    aberta = id;
    for (const [gid, c] of cartoes) {
      const sim = gid === id;
      c.el.classList.toggle("aberto", sim);
      c.cab.setAttribute("aria-expanded", String(sim));
      c.detalhe.hidden = !sim;
      c.spark.hidden = sim;
    }
    if (id && vista !== "cartoes") definirVista("cartoes");
    // rola até o início do cartão aberto (com "nearest", um cartão alto mostrava só o fim)
    if (id) cartoes.get(id).el.scrollIntoView({ block: "start", behavior: "smooth" });
    if (doUsuario) aoSelecionarGrandeza?.(id);
    atualizar();
  }

  function janelaAtual() {
    const agora = fluxo.agora();
    return { t0: agora - config.janelaGraficoS * 1000, t1: agora, agora };
  }

  function formatador(agora) {
    return formatoTempo ?? tempoRelativo(agora);
  }

  function atualizar() {
    const { t0, t1, agora } = janelaAtual();
    for (const g of GRANDEZAS) {
      const c = cartoes.get(g.id);
      const e = fluxo.estado(g.id);
      const est = ESTADOS[e.estado];
      const tv = textoValor(config, g.id, e.valor);
      c.el.dataset.estado = est.id;
      c.chip.innerHTML = htmlEstado(est);
      c.valor.textContent = tv.valor;
      c.unidade.textContent = tv.unidade;
      c.idade.textContent = e.velha ? `última leitura ${textoIdade(e.idade)}` : textoIdade(e.idade);
      if (vista !== "cartoes") continue;
      const lim = config.grandezas[g.id];
      const boia = g.id === "oleo" && lim?.sensor === "boia";
      const pontos = fluxo.janela(g.id, t0, t1);
      if (!c.spark.hidden) {
        const { ctx, w, h } = prepararCanvas(c.spark);
        desenharSerie(ctx, w, h, { pontos, t0, t1, escala: lim?.escala, limite: lim, boia, marcadores });
      }
      if (aberta === g.id) {
        const { ctx, w, h } = prepararCanvas(c.grafico);
        c.geo = desenharSerie(ctx, w, h, {
          pontos,
          t0,
          t1,
          escala: lim?.escala,
          limite: lim,
          boia,
          eixos: true,
          formatarTempo: formatador(agora),
          marcadores,
          cursorT: c.cursorT,
        });
        c.estatisticas.innerHTML = textoEstatisticas(config, g.id, pontos);
        if (!c.tabela.hidden) atualizarTabela(g.id);
      }
    }
    if (vista === "comparar") desenharComparacaoAtual();
  }

  let geoComparacao = null;
  let cursorComparacao = null;
  function desenharComparacaoAtual() {
    const jan = (typeof janelaFixa === "function" ? janelaFixa() : janelaFixa) ?? janelaAtual();
    const agora = fluxo.agora();
    const { ctx, w, h } = prepararCanvas(canvasComparacao);
    geoComparacao = desenharComparacao(ctx, w, h, {
      linhas: GRANDEZAS.map((g) => {
        const lim = config.grandezas[g.id];
        const e = fluxo.estado(g.id);
        const tv = textoValor(config, g.id, e.valor);
        return {
          id: g.id,
          nome: g.nome,
          pontos: serieFixa ? serieFixa(g.id, jan.t0, jan.t1) : fluxo.janela(g.id, jan.t0, jan.t1),
          escala: lim?.escala,
          limite: lim,
          boia: g.id === "oleo" && lim?.sensor === "boia",
          valorTexto: `${tv.valor} ${tv.unidade}`.trim(),
        };
      }),
      t0: jan.t0,
      t1: jan.t1,
      cursorT: cursorComparacao ?? (janelaFixa ? agora : null),
      formatarTempo: formatador(agora),
      marcadores,
      fonte: 11,
    });
  }

  function atualizarTabela(id) {
    const c = cartoes.get(id);
    const { t0, t1, agora } = janelaAtual();
    const pontos = fluxo.janela(id, t0, t1).slice(-12).reverse();
    const fmt = formatador(agora);
    c.tabela.innerHTML = `<table><thead><tr><th>Instante</th><th>Valor</th><th>Estado</th></tr></thead><tbody>${pontos
      .map((p) => {
        const tv = textoValor(config, id, p.v);
        return `<tr><td>${fmt(p.t)}</td><td>${tv.valor} ${tv.unidade}</td><td>${ESTADOS[avaliar(config.grandezas[id], p.v)].texto}</td></tr>`;
      })
      .join("")}</tbody></table>`;
  }

  // ---- dicas (crosshair + valor)
  function pontoMaisProximo(pontos, t) {
    let melhor = null;
    for (const p of pontos) if (!melhor || Math.abs(p.t - t) < Math.abs(melhor.t - t)) melhor = p;
    return melhor;
  }

  function dicaSerie(e, id, c) {
    if (!c.geo) return;
    const r = c.grafico.getBoundingClientRect();
    const x = e.clientX - r.left;
    if (x < c.geo.x0 || x > c.geo.x1) return dica.esconder();
    const t = c.geo.tDe(x);
    const { t0, t1, agora } = janelaAtual();
    const p = pontoMaisProximo(fluxo.janela(id, t0, t1), t);
    if (!p) return dica.esconder();
    c.cursorT = p.t;
    const tv = textoValor(config, id, p.v);
    dica.mostrar(e.clientX, e.clientY, `<strong>${tv.valor} ${tv.unidade}</strong><br><span>${formatador(agora)(p.t)}</span>`);
    atualizar();
  }

  function dicaComparacao(e) {
    if (!geoComparacao?.tDe) return;
    const r = canvasComparacao.getBoundingClientRect();
    const x = e.clientX - r.left;
    if (x < geoComparacao.x0 || x > geoComparacao.x1) return dica.esconder();
    const t = geoComparacao.tDe(x);
    const jan = (typeof janelaFixa === "function" ? janelaFixa() : janelaFixa) ?? janelaAtual();
    cursorComparacao = t;
    const linhas = GRANDEZAS.map((g) => {
      const perto = (a, b) => (serieFixa ? serieFixa(g.id, a, b) : fluxo.janela(g.id, a, b));
      const p = pontoMaisProximo(perto(Math.max(jan.t0, t - 3000), Math.min(jan.t1, t + 3000)), t);
      const tv = p ? textoValor(config, g.id, p.v) : { valor: "—", unidade: "" };
      return `<tr><td>${escapar(g.nome)}</td><td>${tv.valor} ${tv.unidade}</td></tr>`;
    }).join("");
    dica.mostrar(e.clientX, e.clientY, `<span>${formatador(fluxo.agora())(t)}</span><table>${linhas}</table>`);
    desenharComparacaoAtual();
  }

  for (const c of cartoes.values()) c.grafico.addEventListener("pointerleave", () => (c.cursorT = null));
  canvasComparacao.addEventListener("pointerleave", () => (cursorComparacao = null));
  canvasComparacao.addEventListener("click", (e) => {
    if (!aoClicarTempo || !geoComparacao?.tDe) return;
    const r = canvasComparacao.getBoundingClientRect();
    aoClicarTempo(geoComparacao.tDe(e.clientX - r.left));
  });
  for (const c of cartoes.values()) {
    c.grafico.addEventListener("click", (e) => {
      if (!aoClicarTempo || !c.geo) return;
      const r = c.grafico.getBoundingClientRect();
      aoClicarTempo(c.geo.tDe(e.clientX - r.left));
    });
  }

  const intervalo = setInterval(atualizar, 250);
  atualizar();

  return {
    abrir: (id) => abrir(id),
    get aberta() {
      return aberta;
    },
    definirVista,
    atualizar,
    /** Informação curta sobre a fonte ("Simulação · Desbaste"). */
    definirInfoFonte(texto) {
      infoFonte.textContent = texto ?? "";
    },
    /** O replay troca o formato do tempo e fixa a janela da comparação na sessão inteira. */
    definirContextoTempo({ formatar = null, janela = null, serie = null, aoClicar = null } = {}) {
      formatoTempo = formatar;
      janelaFixa = janela;
      serieFixa = serie;
      aoClicarTempo = aoClicar;
      for (const el of [canvasComparacao, ...[...cartoes.values()].map((c) => c.grafico)]) el.classList.toggle("navegavel", !!aoClicar);
    },
    definirMarcadores(lista) {
      marcadores = lista ?? [];
    },
    /** Depois de mudar limites ou o tipo de sensor nas Configurações. */
    atualizarLimites() {
      for (const g of GRANDEZAS) cartoes.get(g.id).limites.textContent = textoLimites(config, g.id);
      atualizar();
    },
    destruir: () => clearInterval(intervalo),
  };
}

export function textoLimites(config, id) {
  const lim = config.grandezas[id];
  const g = GRANDEZA_POR_ID[id];
  if (!lim) return "não configurados";
  if (id === "oleo" && lim.sensor === "boia") return "Sensor de boia: OK = Normal; Baixo = Alarme.";
  const sinal = lim.sentido === "abaixo" ? "≤" : "≥";
  const partes = [];
  if (lim.atencao !== null && lim.atencao !== undefined) partes.push(`Atenção ${sinal} ${formatarValor(g, lim.atencao)} ${g.unidade}`);
  if (lim.alarme !== null && lim.alarme !== undefined) partes.push(`Alarme ${sinal} ${formatarValor(g, lim.alarme)} ${g.unidade}`);
  if (lim.persistenciaS) partes.push(`persistência ${String(lim.persistenciaS).replace(".", ",")} s`);
  return (partes.join(" · ") || "sem limites de alarme") + (lim.observacao ? `. ${lim.observacao}` : "");
}

function textoEstatisticas(config, id, pontos) {
  const vals = pontos.map((p) => p.v).filter((v) => v !== null);
  if (!vals.length) return "";
  if (id === "oleo" && config.grandezas.oleo?.sensor === "boia") return "";
  const g = GRANDEZA_POR_ID[id];
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const media = vals.reduce((s, v) => s + v, 0) / vals.length;
  const f = (v) => formatarValor(g, v);
  return `<span>mín <b>${f(min)}</b></span><span>média <b>${f(media)}</b></span><span>máx <b>${f(max)}</b></span><span class="sutil">${g.unidade} na janela</span>`;
}

function criarDica() {
  const el = document.createElement("div");
  el.className = "dica dica-grafico";
  el.hidden = true;
  document.body.appendChild(el);
  return {
    mostrar(x, y, html) {
      el.innerHTML = html;
      el.hidden = false;
      const r = el.getBoundingClientRect();
      const left = x + 14 + r.width > window.innerWidth ? x - r.width - 14 : x + 14;
      el.style.left = left + "px";
      el.style.top = Math.min(window.innerHeight - r.height - 8, y + 10) + "px";
    },
    esconder() {
      el.hidden = true;
    },
  };
}
