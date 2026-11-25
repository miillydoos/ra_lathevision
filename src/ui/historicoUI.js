import { GRANDEZAS, GRANDEZA_POR_ID } from "../config/grandezas.js";
import { ESTADOS } from "../config/estados.js";
import { ESCOLA } from "../config/escola.js";
import { ORIGENS, TEXTO_ESTADO, textoDuracao, totalTempo } from "../dados/historico.js";
import { htmlEstado, textoLimites, textoValor } from "./sensoresUI.js";
import { svgIcone } from "../util/icones.js";

const escapar = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const ORDEM_ESTADOS = ["normal", "atencao", "alarme", "semDados"];
const MAX_LISTA = 200;

// tipo do evento → ícone e filtro
const TIPOS = {
  alarme: { icone: "alarme", grupo: "alertas" },
  atencao: { icone: "atencao", grupo: "alertas" },
  normal: { icone: "normal", grupo: "alertas" },
  semDados: { icone: "semDados", grupo: "alertas" },
  conectado: { icone: "normal", grupo: "conexao" },
  desconectado: { icone: "alarme", grupo: "conexao" },
  modo: { icone: "controles", grupo: "sistema" },
  situacao: { icone: "atencao", grupo: "sistema" },
  gravacao: { icone: "gravar", grupo: "sistema" },
  sistema: { icone: "historico", grupo: "sistema" },
};
const FILTROS = [
  { id: "todos", texto: "Todos os eventos" },
  { id: "alertas", texto: "Atenção e alarmes" },
  { id: "conexao", texto: "Conexão" },
  { id: "sistema", texto: "Modos e anotações" },
];

const dataHora = (t, { comAno = false } = {}) =>
  new Date(t).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    ...(comAno ? { year: "numeric" } : {}),
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

/** "4,21 mm/s" (ou "OK"/"Baixo" com sensor de boia) */
function valorComUnidade(config, id, v) {
  if (v === null || v === undefined || !GRANDEZA_POR_ID[id]) return "";
  const { valor, unidade } = textoValor(config, id, v);
  return unidade === "boia" ? valor : `${valor} ${unidade}`;
}

/** mín / média / máx / última de uma estatística, já formatados. */
function numeros(config, id, s) {
  const boia = id === "oleo" && config.grandezas.oleo?.sensor === "boia";
  const f = (v) => (v === null || v === undefined ? "—" : textoValor(config, id, v).valor);
  return {
    ultima: f(s?.ultimo),
    min: f(s?.min),
    media: !s?.n || boia ? "—" : f(s.soma / s.n),
    max: f(s?.max),
  };
}

/**
 * Relatório e histórico do monitoramento: vista da aba "Histórico" (na barra dos modos, ao lado de
 * Ao vivo e Simulação). Ocupa a área abaixo da barra de cima sem trocar a fonte de dados:
 * o modo em uso continua rodando por trás e o histórico segue sendo registrado.
 * Mostra o resumo por grandeza (Ao vivo ou Simulação) e a linha do tempo de eventos,
 * e exporta o relatório (.html, pronto para imprimir ou salvar em PDF) e o histórico (.csv).
 * `aoFechar` é chamado pelo ×; Esc e o Voltar do celular chegam pelo layout (layoutPaineis.js).
 */
export function criarHistoricoUI({ historico, config, aoFechar = () => fechar() }) {
  const vista = document.createElement("section");
  vista.className = "painel vista-historico";
  vista.id = "vista-historico";
  vista.hidden = true;
  vista.setAttribute("aria-labelledby", "titulo-historico");
  vista.innerHTML = `
    <header class="vh-cab">
      <span class="vh-icone" aria-hidden="true">${svgIcone("historico", { tamanho: 20 })}</span>
      <div class="vh-titulos">
        <h2 id="titulo-historico">Relatório e histórico do monitoramento</h2>
        <p class="sutil rel-periodo"></p>
      </div>
      <div class="vh-acoes">
        <button type="button" class="botao primario" data-acao="html" title="Relatório completo em .html (abre no navegador; dá para imprimir ou salvar em PDF)">${svgIcone("documento", { tamanho: 15 })}<span>Baixar relatório</span></button>
        <button type="button" class="botao" data-acao="csv" title="Todos os eventos em .csv (abre no Excel)">${svgIcone("baixar", { tamanho: 15 })}<span>.csv</span></button>
        <button type="button" class="botao" data-acao="limpar" title="Apagar o histórico guardado neste navegador e começar um novo período">${svgIcone("lixeira", { tamanho: 15 })}<span>Limpar</span></button>
      </div>
      <button type="button" class="fechar-vista" data-acao="fechar" aria-label="Fechar o histórico" title="Fechar (Esc)">${svgIcone("fechar", { tamanho: 18 })}</button>
    </header>
    <div class="vh-corpo">
      <p class="vh-ao-vivo" role="status"></p>
      <div class="vh-origem">
        <span class="sutil">Resumo de</span>
        <div class="alternador" role="group" aria-label="Origem dos dados do resumo">
          ${Object.entries(ORIGENS)
            .map(([id, nome]) => `<button type="button" class="botao mini" data-origem="${id}" aria-pressed="false">${nome}</button>`)
            .join("")}
        </div>
      </div>
      <div class="rel-resumo" role="group" aria-label="Números do período"></div>
      <div class="vh-colunas">
        <section class="rel-secao" aria-label="Resumo por grandeza">
          <div class="rel-cab"><h3>Resumo por grandeza</h3></div>
          <div class="rel-grandezas"></div>
        </section>
        <section class="rel-secao" aria-label="Histórico de eventos">
          <div class="rel-cab">
            <h3>Histórico de eventos</h3>
            <select class="rel-filtro" aria-label="Filtrar eventos">
              ${FILTROS.map((f) => `<option value="${f.id}">${f.texto}</option>`).join("")}
            </select>
          </div>
          <ol class="rel-eventos"></ol>
          <p class="sutil rel-nota" hidden></p>
        </section>
      </div>
    </div>`;
  document.body.appendChild(vista);

  const $ = (s) => vista.querySelector(s);
  const periodoEl = $(".rel-periodo");
  const aoVivoEl = $(".vh-ao-vivo");
  const resumoEl = $(".rel-resumo");
  const grandezasEl = $(".rel-grandezas");
  const eventosEl = $(".rel-eventos");
  const notaEl = $(".rel-nota");
  const filtroEl = $(".rel-filtro");

  let origemVista = null; // origem mostrada no resumo
  let assinaturaEventos = "";
  let timer = null;

  vista.addEventListener("click", (e) => {
    const o = e.target.closest("[data-origem]");
    if (o) {
      origemVista = o.dataset.origem;
      renderizar();
      return;
    }
    const acao = e.target.closest("[data-acao]")?.dataset.acao;
    if (acao === "fechar") aoFechar();
    if (acao === "html") baixar(gerarRelatorioHTML(historico, config), "text/html", "html");
    if (acao === "csv") baixar("﻿" + gerarCSV(historico, config), "text/csv", "csv");
    if (acao === "limpar" && confirm("Apagar o histórico e as estatísticas guardados neste navegador e começar um novo período?")) {
      historico.limpar();
      renderizar(true);
    }
  });
  filtroEl.addEventListener("change", () => renderizar(true));

  function abrir() {
    // começa pela origem em uso agora (ou a que tiver dados)
    origemVista = historico.origem ?? historico.origensComDados()[0] ?? "simulacao";
    renderizar(true);
    vista.hidden = false;
    document.body.classList.add("historico-aberto");
    $(".vh-corpo").scrollTop = 0;
    $(".fechar-vista").focus({ preventScroll: true });
    clearInterval(timer);
    timer = setInterval(() => renderizar(), 2000);
  }

  function fechar() {
    if (vista.hidden) return;
    vista.hidden = true;
    document.body.classList.remove("historico-aberto");
    clearInterval(timer);
    timer = null;
  }

  function renderizar(forcarEventos = false) {
    const eventos = historico.eventos;
    periodoEl.textContent = `Desde ${dataHora(historico.inicio, { comAno: true })} · ${eventos.length.toLocaleString("pt-BR")} eventos · guardado neste navegador`;

    // o que está sendo registrado agora (a fonte do modo em uso continua rodando por trás desta aba)
    const agora = historico.origem;
    aoVivoEl.dataset.origem = agora ?? "replay";
    aoVivoEl.textContent = agora
      ? `Registrando agora: ${ORIGENS[agora]}. O monitoramento continua enquanto você vê o relatório; toque num modo acima para voltar ao torno.`
      : "Nenhum modo registrando agora. Toque em Ao vivo ou Simulação para voltar a registrar.";

    for (const b of vista.querySelectorAll("[data-origem]")) b.setAttribute("aria-pressed", String(b.dataset.origem === origemVista));

    // ---------- números do período (origem escolhida)
    const est = historico.estatisticas(origemVista);
    const lista = GRANDEZAS.map((g) => est[g.id]).filter(Boolean);
    const alarmes = lista.reduce((a, s) => a + s.alarmes, 0);
    const atencoes = lista.reduce((a, s) => a + s.atencoes, 0);
    const leituras = lista.reduce((a, s) => a + s.n, 0);
    const tempo = Math.max(0, ...lista.map(totalTempo));
    resumoEl.innerHTML = [
      { rotulo: "Tempo monitorado", valor: textoDuracao(tempo) },
      { rotulo: "Alarmes", valor: alarmes.toLocaleString("pt-BR"), estado: alarmes ? "alarme" : null },
      { rotulo: "Atenções", valor: atencoes.toLocaleString("pt-BR"), estado: atencoes ? "atencao" : null },
      { rotulo: "Leituras", valor: leituras.toLocaleString("pt-BR") },
    ]
      .map(
        (t) => `<div class="rel-numero"${t.estado ? ` data-estado="${t.estado}"` : ""}>
          <span class="rel-numero-rotulo">${t.estado ? svgIcone(ESTADOS[t.estado].icone, { tamanho: 13, espessura: 2.4 }) : ""}${t.rotulo}</span>
          <strong>${t.valor}</strong></div>`,
      )
      .join("");

    // ---------- cartões por grandeza
    const ativa = historico.origem === origemVista;
    grandezasEl.innerHTML = lista.length
      ? GRANDEZAS.map((g) => cartaoGrandeza(g, est[g.id], ativa)).join("")
      : `<p class="sutil rel-vazio">Ainda não há dados de ${ORIGENS[origemVista]} neste período. ${
          origemVista === "aoVivo" ? "Conecte o torno pelo modo Ao vivo." : "Abra o modo Simulação."
        }</p>`;

    // ---------- linha do tempo (só redesenha se mudou, para não pular a rolagem)
    const ultimo = eventos[eventos.length - 1];
    const assinatura = `${filtroEl.value}|${eventos.length}|${ultimo?.t ?? 0}`;
    if (!forcarEventos && assinatura === assinaturaEventos) return;
    assinaturaEventos = assinatura;
    const grupo = filtroEl.value;
    const filtrados = eventos.filter((e) => grupo === "todos" || TIPOS[e.tipo]?.grupo === grupo);
    const mostrados = filtrados.slice(-MAX_LISTA).reverse();
    eventosEl.innerHTML = mostrados.length
      ? mostrados.map(itemEvento).join("")
      : `<li class="rel-vazio sutil">Nenhum evento ${grupo === "todos" ? "" : "deste tipo "}no período.</li>`;
    notaEl.hidden = filtrados.length <= MAX_LISTA;
    notaEl.textContent = `Mostrando os ${MAX_LISTA} mais recentes de ${filtrados.length.toLocaleString("pt-BR")}. O relatório e o .csv trazem todos.`;
  }

  function cartaoGrandeza(g, s, ativa) {
    if (!s) s = { n: 0, tempo: {}, alarmes: 0, atencoes: 0, estado: "semDados" };
    const n = numeros(config, g.id, s);
    const total = totalTempo(s);
    const partes = ORDEM_ESTADOS.filter((e) => (s.tempo[e] ?? 0) > 0).map((e) => {
      const seg = s.tempo[e];
      const pct = total ? (seg / total) * 100 : 0;
      return { e, seg, pct, rotulo: `${TEXTO_ESTADO[e]} · ${pct.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% · ${textoDuracao(seg)}` };
    });
    const unidade = g.unidade + (g.sufixo ? ` ${g.sufixo}` : "");
    return `<article class="rel-grandeza" data-estado="${ativa ? s.estado : "semDados"}">
      <header>
        <span class="sensor-icone">${svgIcone(g.icone, { tamanho: 16 })}</span>
        <strong>${escapar(g.nome)}</strong>
        ${ativa ? `<span class="estado-chip">${htmlEstado(ESTADOS[s.estado] ?? ESTADOS.semDados)}</span>` : ""}
      </header>
      <dl class="rel-valores">
        <div><dt>Última</dt><dd>${n.ultima}</dd></div>
        <div><dt>Mín</dt><dd>${n.min}</dd></div>
        <div><dt>Média</dt><dd>${n.media}</dd></div>
        <div><dt>Máx</dt><dd>${n.max}</dd></div>
      </dl>
      <p class="rel-unidade sutil">${escapar(unidade)} · ${s.n.toLocaleString("pt-BR")} leituras</p>
      ${
        partes.length
          ? `<div class="rel-barra" role="img" aria-label="Tempo em cada estado: ${escapar(partes.map((p) => p.rotulo).join("; "))}">
              ${partes.map((p) => `<span data-estado="${p.e}" style="flex-grow:${p.pct.toFixed(3)}" title="${escapar(p.rotulo)}"></span>`).join("")}
            </div>
            <ul class="rel-legenda">${partes
              .map(
                (p) => `<li data-estado="${p.e}">${svgIcone(ESTADOS[p.e].icone, { tamanho: 12, espessura: 2.4 })}${TEXTO_ESTADO[p.e]} <b>${p.pct.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%</b></li>`,
              )
              .join("")}</ul>`
          : ""
      }
      <p class="rel-contagem">${s.alarmes} ${s.alarmes === 1 ? "alarme" : "alarmes"} · ${s.atencoes} ${s.atencoes === 1 ? "atenção" : "atenções"}</p>
    </article>`;
  }

  function itemEvento(e) {
    const tipo = TIPOS[e.tipo] ?? TIPOS.sistema;
    const valor = valorComUnidade(config, e.grandeza, e.valor);
    const meta = [dataHora(e.t), e.origem ? (ORIGENS[e.origem] ?? (e.origem === "replay" ? "Replay" : "")) : ""].filter(Boolean).join(" · ");
    return `<li data-tipo="${escapar(e.tipo)}">
      <span class="rel-ev-icone">${svgIcone(tipo.icone, { tamanho: 15, espessura: 2.2 })}</span>
      <span class="rel-ev-corpo">
        <span class="rel-ev-texto">${escapar(e.texto)}${valor ? ` <b>${escapar(valor)}</b>` : ""}</span>
        <span class="rel-ev-meta">${escapar(meta)}</span>
      </span>
    </li>`;
  }

  return {
    abrir,
    fechar,
    get aberta() {
      return !vista.hidden;
    },
    el: vista,
  };
}

// ---------------------------------------------------------------- exportação

function baixar(conteudo, tipo, extensao) {
  const blob = new Blob([conteudo], { type: `${tipo};charset=utf-8` });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  const carimbo = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
  a.download = `${extensao === "csv" ? "historico" : "relatorio"}-monitoramento-${carimbo}.${extensao}`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 1000);
}

/** Histórico completo em CSV (ponto e vírgula, como o Excel em português espera). */
export function gerarCSV(historico, config) {
  const campo = (v) => {
    const s = String(v ?? "");
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const linhas = [["data_hora", "origem", "tipo", "grandeza", "valor", "unidade", "descricao"]];
  for (const e of historico.eventos) {
    const g = GRANDEZA_POR_ID[e.grandeza];
    const valor = g && e.valor !== null && e.valor !== undefined ? textoValor(config, e.grandeza, e.valor) : null;
    linhas.push([
      dataHora(e.t, { comAno: true }),
      ORIGENS[e.origem] ?? (e.origem === "replay" ? "Replay" : ""),
      e.tipo,
      g?.nome ?? "",
      valor?.valor ?? "",
      valor && valor.unidade !== "boia" ? valor.unidade : "",
      e.texto,
    ]);
  }
  return linhas.map((l) => l.map(campo).join(";")).join("\r\n");
}

/** Relatório completo num .html autônomo (claro, pronto para imprimir / salvar em PDF). */
export function gerarRelatorioHTML(historico, config) {
  const agora = Date.now();
  const origens = historico.origensComDados();
  const pct = (s, e) => {
    const t = totalTempo(s);
    return t ? `${((s.tempo[e] / t) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%` : "—";
  };

  const tabelas = origens.length
    ? origens
        .map((o) => {
          const est = historico.estatisticas(o);
          const linhas = GRANDEZAS.map((g) => {
            const s = est[g.id];
            if (!s) return "";
            const n = numeros(config, g.id, s);
            const un = escapar(g.unidade + (g.sufixo ? ` ${g.sufixo}` : ""));
            return `<tr><th scope="row">${escapar(g.nome)}<small>${un}</small></th>
              <td>${n.ultima}</td><td>${n.min}</td><td>${n.media}</td><td>${n.max}</td>
              <td>${pct(s, "normal")}</td><td>${pct(s, "atencao")}</td><td>${pct(s, "alarme")}</td><td>${pct(s, "semDados")}</td>
              <td>${s.atencoes}</td><td>${s.alarmes}</td><td>${s.n.toLocaleString("pt-BR")}</td></tr>`;
          }).join("");
          const tempo = Math.max(0, ...Object.values(est).map(totalTempo));
          return `<h2>${ORIGENS[o]} <small>· ${textoDuracao(tempo)} monitorados</small></h2>
            <table><thead><tr><th>Grandeza</th><th>Última</th><th>Mín</th><th>Média</th><th>Máx</th>
              <th>Normal</th><th>Atenção</th><th>Alarme</th><th>Sem dados</th><th>Nº atenções</th><th>Nº alarmes</th><th>Leituras</th></tr></thead>
            <tbody>${linhas}</tbody></table>`;
        })
        .join("")
    : `<p>Sem leituras registradas neste período.</p>`;

  const limites = GRANDEZAS.map((g) => `<li><b>${escapar(g.nome)}:</b> ${escapar(textoLimites(config, g.id))}</li>`).join("");

  const eventos = [...historico.eventos]
    .reverse()
    .map((e) => {
      const valor = valorComUnidade(config, e.grandeza, e.valor);
      return `<tr data-tipo="${escapar(e.tipo)}"><td>${escapar(dataHora(e.t, { comAno: true }))}</td>
        <td>${escapar(ORIGENS[e.origem] ?? (e.origem === "replay" ? "Replay" : "—"))}</td>
        <td>${escapar(e.texto)}</td><td>${escapar(valor)}</td></tr>`;
    })
    .join("");

  const totalAlarmes = origens.reduce((a, o) => a + Object.values(historico.estatisticas(o)).reduce((b, s) => b + s.alarmes, 0), 0);
  const totalAtencoes = origens.reduce((a, o) => a + Object.values(historico.estatisticas(o)).reduce((b, s) => b + s.atencoes, 0), 0);

  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Relatório de monitoramento · ${escapar(config.maquina ?? "Torno")}</title>
<style>
  :root { --texto: #1d232b; --sutil: #5c6672; --borda: #d9dee4; --marca: #cc0c0f; --atencao: #b07800; --alarme: #c22d2d; --normal: #0a7f0a; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 24px 16px 40px; font: 14px/1.45 "Segoe UI", Roboto, Arial, sans-serif; color: var(--texto); background: #fff; }
  main { max-width: 1040px; margin: 0 auto; }
  header { border-bottom: 3px solid var(--marca); padding-bottom: 10px; margin-bottom: 16px; display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; align-items: end; }
  h1 { margin: 0; font-size: 22px; } h1 span { color: var(--marca); }
  h2 { font-size: 16px; margin: 22px 0 8px; } h2 small { color: var(--sutil); font-weight: 400; }
  .meta { color: var(--sutil); margin: 4px 0 0; }
  .numeros { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px; margin: 12px 0; }
  .numeros div { border: 1px solid var(--borda); border-radius: 8px; padding: 8px 10px; }
  .numeros span { display: block; color: var(--sutil); font-size: 12px; } .numeros strong { font-size: 20px; }
  .tabela { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 12.5px; font-variant-numeric: tabular-nums; }
  th, td { text-align: left; padding: 5px 6px; border-bottom: 1px solid var(--borda); vertical-align: top; }
  thead th { color: var(--sutil); font-weight: 600; white-space: nowrap; }
  tbody th small { display: block; color: var(--sutil); font-weight: 400; }
  tr[data-tipo="alarme"] td:nth-child(3), tr[data-tipo="desconectado"] td:nth-child(3) { color: var(--alarme); font-weight: 600; }
  tr[data-tipo="atencao"] td:nth-child(3) { color: var(--atencao); font-weight: 600; }
  tr[data-tipo="normal"] td:nth-child(3), tr[data-tipo="conectado"] td:nth-child(3) { color: var(--normal); }
  ul { padding-left: 18px; margin: 6px 0; }
  .nota { color: var(--sutil); font-size: 12px; margin-top: 24px; }
  button { font: inherit; padding: 7px 14px; border-radius: 8px; border: 1px solid var(--marca); background: var(--marca); color: #fff; cursor: pointer; }
  @media print { body { padding: 0; } button { display: none; } h2 { break-after: avoid; } tr { break-inside: avoid; } }
</style></head>
<body><main>
  <header>
    <div>
      <h1><span>LatheVision</span> · Relatório de monitoramento</h1>
      <p class="meta">${escapar(config.maquina ?? "")} · ${escapar(ESCOLA.unidade)} · ${escapar(ESCOLA.ambiente)}</p>
      <p class="meta">Período: ${escapar(dataHora(historico.inicio, { comAno: true }))} → ${escapar(dataHora(agora, { comAno: true }))} · gerado em ${escapar(dataHora(agora, { comAno: true }))}</p>
    </div>
    <button type="button" onclick="print()">Imprimir / salvar PDF</button>
  </header>
  <div class="numeros">
    <div><span>Alarmes</span><strong>${totalAlarmes}</strong></div>
    <div><span>Atenções</span><strong>${totalAtencoes}</strong></div>
    <div><span>Eventos registrados</span><strong>${historico.eventos.length.toLocaleString("pt-BR")}</strong></div>
    <div><span>Origens</span><strong>${origens.map((o) => ORIGENS[o]).join(" e ") || "—"}</strong></div>
  </div>
  <h2>Resumo por grandeza</h2>
  <div class="tabela">${tabelas}</div>
  <h2>Limites configurados</h2>
  <ul>${limites}</ul>
  <h2>Histórico de eventos <small>· mais recentes primeiro</small></h2>
  <div class="tabela"><table><thead><tr><th>Data e hora</th><th>Origem</th><th>Evento</th><th>Valor</th></tr></thead>
  <tbody>${eventos || `<tr><td colspan="4">Nenhum evento.</td></tr>`}</tbody></table></div>
  <p class="nota">Porcentagens = parte do tempo monitorado em cada estado (amostrado a cada segundo). Dados da Simulação são gerados pelo modelo do torno e não representam a máquina real. O histórico fica guardado no navegador do aparelho que gerou este relatório.</p>
</main></body></html>`;
}
