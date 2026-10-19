import { DESAFIOS, EVIDENCIAS, GRANDEZAS_PRIMEIRO_SINAL, HIPOTESES, INSPECOES, avaliarResposta } from "../config/desafios.js";
import { GRANDEZAS, GRANDEZA_POR_ID } from "../config/grandezas.js";
import { ESTADOS } from "../config/estados.js";
import { iniciarCenario } from "../simulacao/cenarios.js";
import { svgIcone } from "../util/icones.js";
import { formatarMinSeg } from "./painelSimulacao.js";
import { textoValor } from "./sensoresUI.js";

const escapar = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const ANTES_S = 60; // quanto da linha de base aparece antes do início do desafio

/**
 * Desafio de manutenção: o professor escolhe ou sorteia a situação, que fica oculta.
 * A turma registra evidências (inclusive dentro do headset), responde e recebe a avaliação.
 */
export function criarPainelDesafio({ simulacao, fluxo, config, sensoresUI, painelXR }) {
  const el = document.createElement("section");
  el.className = "painel painel-modo painel-desafio";
  el.setAttribute("aria-label", "Desafio de diagnóstico");
  const dialogo = document.createElement("dialog");
  dialogo.className = "painel dialogo dialogo-resposta";
  document.body.appendChild(dialogo);

  let fase = "escolha"; // escolha | andamento | avaliado
  let desafio = null;
  let inicio = 0; // s de simulação
  let inicioMs = 0;
  let registros = [];
  let resposta = null;
  let avaliacao = null;
  let revelado = false;
  let velocidade = 5;
  let salvo = null; // controles da simulação antes do desafio

  function render() {
    if (fase === "escolha") {
      el.innerHTML = `
        <header class="cab-modo"><h2>Desafio de diagnóstico</h2></header>
        <div class="corpo-modo">
          <fieldset class="grupo-controle">
            <legend>Professor</legend>
            <label>Situação
              <select data-campo="desafio">
                <option value="sortear">Sortear (ninguém vê qual)</option>
                ${DESAFIOS.map((d) => `<option value="${d.id}">${d.codinome} — ${escapar(d.nomeProfessor)}</option>`).join("")}
              </select>
            </label>
            <label>Velocidade da simulação
              <select data-campo="velocidade">${[2, 5, 10].map((v) => `<option value="${v}" ${v === velocidade ? "selected" : ""}>${v}×</option>`).join("")}</select>
            </label>
            <button type="button" class="botao primario" data-acao="iniciar">Iniciar desafio</button>
          </fieldset>
          <div class="texto-desafio">
            <p>A máquina começa em operação normal. Em algum momento uma condição anormal se inicia, sem aviso. A turma deve:</p>
            <ol>
              <li>acompanhar as medições no modelo, nos cartões e na vista <b>Comparar</b>;</li>
              <li>registrar evidências (antes e depois da alteração) — também pelo painel no headset;</li>
              <li>indicar a sequência dos sinais, uma hipótese e a inspeção que confirmaria a causa.</li>
            </ol>
            <p class="sutil">A avaliação considera principalmente as evidências e a inspeção proposta: uma combinação de sinais é compatível com uma hipótese, mas não a prova.</p>
          </div>
        </div>`;
    } else {
      const decorrido = simulacao.tempo - inicio;
      el.innerHTML = `
        <header class="cab-modo">
          <h2>${escapar(desafio.codinome)} · <span data-saida="tempo">${formatarMinSeg(decorrido)}</span></h2>
          <div class="acoes-modo">
            ${fase === "andamento" ? `<button type="button" class="botao primario" data-acao="responder">Responder</button>` : `<button type="button" class="botao" data-acao="relatorio">${svgIcone("baixar", { tamanho: 13 })} Baixar relatório</button>`}
            <button type="button" class="botao" data-acao="revelar">${revelado ? "Situação revelada" : "Revelar situação (professor)"}</button>
            <button type="button" class="botao" data-acao="novo">Novo desafio</button>
          </div>
        </header>
        <div class="corpo-modo corpo-desafio">
          <div class="texto-desafio">
            <p><b>Contexto:</b> ${escapar(desafio.contexto)}</p>
            ${revelado ? `<p class="revelacao"><b>Situação inserida: ${escapar(desafio.nomeProfessor)}.</b> ${escapar(desafio.explicacao)}</p>` : ""}
            ${avaliacao ? htmlAvaliacao() : ""}
          </div>
          <fieldset class="grupo-controle registros">
            <legend>Evidências registradas (${registros.length})</legend>
            ${
              fase === "andamento"
                ? `<div class="linha-marcar"><input data-campo="nota" placeholder="O que você observou agora?" />
                   <button type="button" class="botao" data-acao="registrar">${svgIcone("marcador", { tamanho: 13 })} Registrar evidência</button></div>`
                : ""
            }
            <ol class="lista-registros">${registros.map(htmlRegistro).join("")}</ol>
          </fieldset>
        </div>`;
    }
  }

  function htmlRegistro(r, i) {
    const valores = GRANDEZAS.map((g) => {
      const v = r.valores[g.id];
      const tv = textoValor(config, g.id, v.valor);
      return `<span class="valor-registro" data-estado="${v.estado}">${svgIcone(ESTADOS[v.estado].icone, { tamanho: 11 })}${escapar(g.nome.split(" ")[0])} ${tv.valor}${tv.unidade ? " " + tv.unidade : ""}</span>`;
    }).join("");
    return `<li><b>${formatarMinSeg(r.tRel)}</b> ${r.nota ? `· ${escapar(r.nota)}` : ""}${fase === "andamento" ? `<button type="button" class="fechar" data-remover="${i}" aria-label="Remover registro">×</button>` : ""}<div class="valores-registro">${valores}</div></li>`;
  }

  function htmlAvaliacao() {
    const a = avaliacao;
    return `<div class="avaliacao">
      <p class="nota-final"><b>Avaliação: ${a.pontos} / ${a.total}</b></p>
      <ul>${a.itens.map((i) => `<li><b>${escapar(i.titulo)} (${i.pontos}/${i.max}):</b> ${escapar(i.comentario)}</li>`).join("")}</ul>
      ${a.mensagens.map((m) => `<p class="sutil">${escapar(m)}</p>`).join("")}
    </div>`;
  }

  function iniciar() {
    const escolha = el.querySelector('[data-campo="desafio"]').value;
    velocidade = Number(el.querySelector('[data-campo="velocidade"]').value);
    desafio = escolha === "sortear" ? DESAFIOS[Math.floor(Math.random() * DESAFIOS.length)] : DESAFIOS.find((d) => d.id === escolha);
    simulacao.reiniciar();
    simulacao.controle.modo = "ciclo";
    simulacao.controle.aceleracao = velocidade;
    simulacao.controle.sensoresDesligados.clear();
    inicio = simulacao.tempo;
    inicioMs = simulacao.agora();
    // a alteração começa sem aviso, entre 40 s e 90 s de simulação depois do início
    const atraso = 40 + Math.random() * 50;
    simulacao.definirCenario(iniciarCenario(desafio.situacao, { inicio: inicio + atraso }));
    registros = [];
    resposta = null;
    avaliacao = null;
    revelado = false;
    fase = "andamento";
    aplicarContexto();
    render();
  }

  /** Gráficos mostram o desafio inteiro (com um minuto de linha de base antes). */
  function aplicarContexto() {
    if (fase === "escolha") {
      sensoresUI.definirContextoTempo({});
      painelXR?.definirContextoTempo({});
      painelXR?.definirControles([]);
      return;
    }
    const formatar = (t) => {
      const s = (t - inicioMs) / 1000;
      return s < 0 ? `−${formatarMinSeg(-s)}` : formatarMinSeg(s);
    };
    const janela = () => ({ t0: inicioMs - ANTES_S * 1000, t1: Math.max(fluxo.agora(), inicioMs + 30000) });
    sensoresUI.definirContextoTempo({ formatar, janela });
    painelXR?.definirContextoTempo({ formatar, janela });
    painelXR?.definirControles(
      fase === "andamento" ? [{ id: "registrar", rotulo: () => `Registrar evidência (${registros.length})`, aoClicar: () => registrar("Registrada no headset") }] : [],
    );
    atualizarMarcadores();
  }

  function atualizarMarcadores() {
    const lista = registros.map((r) => ({ t: r.t, texto: r.nota }));
    sensoresUI.definirMarcadores(lista);
    painelXR?.definirMarcadores(lista);
  }

  function registrar(nota) {
    if (fase !== "andamento") return;
    const t = fluxo.agora();
    registros.push({
      t,
      tRel: simulacao.tempo - inicio,
      nota,
      valores: Object.fromEntries(GRANDEZAS.map((g) => [g.id, (({ valor, estado }) => ({ valor, estado }))(fluxo.estado(g.id))])),
    });
    atualizarMarcadores();
    render();
  }

  function abrirResposta() {
    const opcoes = (lista, nome, tipo, marcados = []) =>
      lista
        .map((o) => `<label class="opcao"><input type="${tipo}" name="${nome}" value="${o.id}" ${marcados.includes(o.id) ? "checked" : ""} /> ${escapar(o.texto)}</label>`)
        .join("");
    dialogo.innerHTML = `
      <form method="dialog" class="form-config form-resposta">
        <header class="cab-modo"><h2>${escapar(desafio.codinome)} · resposta da turma</h2></header>
        <fieldset class="grupo-controle"><legend>1. Qual grandeza mudou primeiro?</legend>
          <div class="opcoes-linha">${opcoes(GRANDEZAS_PRIMEIRO_SINAL.map((id) => ({ id, texto: GRANDEZA_POR_ID[id].nome })), "primeiroSinal", "radio")}</div>
        </fieldset>
        <fieldset class="grupo-controle"><legend>2. O que os gráficos mostraram? (marque tudo que observou)</legend>${opcoes(EVIDENCIAS, "evidencias", "checkbox")}</fieldset>
        <fieldset class="grupo-controle"><legend>3. Hipótese mais compatível com os sinais</legend>${opcoes(HIPOTESES, "hipotese", "radio")}</fieldset>
        <fieldset class="grupo-controle"><legend>4. Inspeções antes de intervir</legend>${opcoes(INSPECOES, "inspecoes", "checkbox")}</fieldset>
        <fieldset class="grupo-controle"><legend>5. Justificativa</legend>
          <textarea name="justificativa" rows="4" placeholder="Como os sinais levaram à hipótese? Em que ordem mudaram? O que a inspeção deve confirmar?"></textarea>
          <p class="sutil">${registros.length} evidência(s) registrada(s) serão enviadas junto.</p>
        </fieldset>
        <footer class="acoes-dialogo"><span class="espaco"></span>
          <button type="button" class="botao" data-acao="cancelar">Voltar</button>
          <button type="submit" class="botao primario">Enviar para avaliação</button>
        </footer>
      </form>`;
    dialogo.showModal();
  }

  dialogo.addEventListener("click", (e) => {
    if (e.target.closest('[data-acao="cancelar"]')) dialogo.close();
  });
  dialogo.addEventListener("submit", (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    resposta = {
      primeiroSinal: f.get("primeiroSinal"),
      evidencias: f.getAll("evidencias"),
      hipotese: f.get("hipotese"),
      inspecoes: f.getAll("inspecoes"),
      justificativa: String(f.get("justificativa") ?? ""),
      registros,
    };
    avaliacao = avaliarResposta(desafio, resposta);
    fase = "avaliado";
    dialogo.close();
    aplicarContexto();
    render();
  });

  el.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    const acao = b.dataset.acao;
    if (acao === "iniciar") iniciar();
    if (acao === "registrar") {
      const nota = el.querySelector('[data-campo="nota"]');
      registrar(nota.value.trim());
    }
    if (acao === "responder") abrirResposta();
    if (acao === "revelar" && !revelado) {
      if (fase === "avaliado" || confirm("Revelar a situação para a turma? Use depois que todos responderem.")) {
        revelado = true;
        render();
      }
    }
    if (acao === "novo") {
      fase = "escolha";
      simulacao.definirCenario(null);
      aplicarContexto();
      render();
    }
    if (acao === "relatorio") baixarRelatorio();
    if (b.dataset.remover) {
      registros.splice(Number(b.dataset.remover), 1);
      atualizarMarcadores();
      render();
    }
  });
  el.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.dataset.campo === "nota") registrar(e.target.value.trim());
  });

  setInterval(() => {
    const tempo = el.querySelector('[data-saida="tempo"]');
    if (tempo && fase !== "escolha") tempo.textContent = formatarMinSeg(simulacao.tempo - inicio);
  }, 500);

  function baixarRelatorio() {
    const linhas = [
      `Laboratório de Monitoramento e Diagnóstico — ${config.maquina}`,
      `${desafio.codinome} · ${new Date().toLocaleString("pt-BR")} · duração ${formatarMinSeg(simulacao.tempo - inicio)}`,
      "",
      `Contexto: ${desafio.contexto}`,
      "",
      "EVIDÊNCIAS REGISTRADAS",
      ...registros.map(
        (r) =>
          `- ${formatarMinSeg(r.tRel)} ${r.nota ? `(${r.nota}) ` : ""}` +
          GRANDEZAS.map((g) => {
            const v = r.valores[g.id];
            const tv = textoValor(config, g.id, v.valor);
            return `${g.nome}: ${tv.valor} ${tv.unidade} [${ESTADOS[v.estado].texto}]`;
          }).join("; "),
      ),
      "",
      "RESPOSTA",
      `Primeiro sinal: ${GRANDEZA_POR_ID[resposta?.primeiroSinal]?.nome ?? "—"}`,
      `Observações: ${(resposta?.evidencias ?? []).map((id) => EVIDENCIAS.find((x) => x.id === id)?.texto).join("; ") || "—"}`,
      `Hipótese: ${HIPOTESES.find((h) => h.id === resposta?.hipotese)?.texto ?? "—"}`,
      `Inspeções: ${(resposta?.inspecoes ?? []).map((id) => INSPECOES.find((x) => x.id === id)?.texto).join("; ") || "—"}`,
      `Justificativa: ${resposta?.justificativa || "—"}`,
      "",
      `AVALIAÇÃO: ${avaliacao?.pontos ?? "—"} / 100`,
      ...(avaliacao?.itens ?? []).map((i) => `- ${i.titulo} (${i.pontos}/${i.max}): ${i.comentario}`),
      ...(avaliacao?.mensagens ?? []).map((m) => `* ${m}`),
      ...(revelado ? ["", `SITUAÇÃO INSERIDA: ${desafio.nomeProfessor}`, desafio.explicacao] : []),
    ];
    const blob = new Blob([linhas.join("\n")], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `relatorio-${desafio.codinome.replace(/\s+/g, "-").toLowerCase()}.txt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  render();

  return {
    el,
    aoEntrar() {
      const c = simulacao.controle;
      salvo = { modo: c.modo, aceleracao: c.aceleracao, desligados: new Set(c.sensoresDesligados) };
      if (fase !== "escolha") {
        // voltar ao modo reinicia a simulação: o desafio recomeça do zero
        fase = "escolha";
      }
      simulacao.definirCenario(null);
      aplicarContexto();
      render();
    },
    aoSair(cenarioDoProfessor) {
      const c = simulacao.controle;
      if (salvo) {
        c.modo = salvo.modo;
        c.aceleracao = salvo.aceleracao;
        c.sensoresDesligados.clear();
        for (const id of salvo.desligados) c.sensoresDesligados.add(id);
      }
      simulacao.definirCenario(cenarioDoProfessor ?? null);
      painelXR?.definirControles([]);
    },
    info: () =>
      fase === "escolha"
        ? "Desafio · aguardando o professor iniciar"
        : `${desafio.codinome} · situação ${revelado ? `revelada: ${desafio.nomeProfessor}` : "oculta"} · ${simulacao.etapa?.rotulo ?? ""}`,
    get emAndamento() {
      return fase !== "escolha" && !revelado;
    },
  };
}
