import { GRANDEZAS } from "../config/grandezas.js";
import { CENARIOS, CENARIO_POR_ID, iniciarCenario } from "../simulacao/cenarios.js";
import { svgIcone } from "../util/icones.js";

const CARGAS = [
  { valor: 0, texto: "Sem corte" },
  { valor: 0.3, texto: "Leve (acabamento)" },
  { valor: 0.6, texto: "Média (desbaste)" },
  { valor: 0.9, texto: "Pesada" },
];

export function formatarMinSeg(s) {
  const t = Math.max(0, Math.floor(s));
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

/**
 * Painel do professor no modo Simulação: operação (ciclo típico ou manual),
 * cenário de falha com intensidade, falha de sensor e velocidade da simulação.
 */
export function criarPainelSimulacao({ simulacao, aoMudar, aoAplicarCenario }) {
  const el = document.createElement("section");
  el.className = "painel painel-modo painel-simulacao";
  el.setAttribute("aria-label", "Controles da simulação");
  el.innerHTML = `
    <header class="cab-modo">
      <h2>Simulação · painel do professor</h2>
      <button type="button" class="botao mini" data-acao="recolher" aria-expanded="true">Recolher</button>
    </header>
    <div class="corpo-modo">
      <fieldset class="grupo-controle">
        <legend>Operação</legend>
        <div class="alternador" role="group" aria-label="Modo de operação">
          <button type="button" class="botao mini" data-operacao="ciclo" aria-pressed="true">Ciclo típico</button>
          <button type="button" class="botao mini" data-operacao="manual" aria-pressed="false">Manual</button>
        </div>
        <label class="controle-manual">Rotação <output data-saida="rpm">800 rpm</output>
          <input type="range" min="0" max="2000" step="10" value="800" data-campo="rpm" />
        </label>
        <label class="controle-manual">Carga de corte
          <select data-campo="carga">${CARGAS.map((c) => `<option value="${c.valor}">${c.texto}</option>`).join("")}</select>
        </label>
      </fieldset>

      <fieldset class="grupo-controle">
        <legend>Situação simulada</legend>
        <select data-campo="cenario" aria-label="Cenário">${CENARIOS.map((c) => `<option value="${c.id}">${c.nome}</option>`).join("")}</select>
        <label>Intensidade <output data-saida="intensidade">100%</output>
          <input type="range" min="0.3" max="1.5" step="0.1" value="1" data-campo="intensidade" />
        </label>
        <button type="button" class="botao primario" data-acao="aplicar">Aplicar agora</button>
        <p class="sutil descricao-cenario" data-saida="descricao"></p>
      </fieldset>

      <fieldset class="grupo-controle">
        <legend>Falha de sensor</legend>
        <div class="chips">${GRANDEZAS.map(
          (g) => `<button type="button" class="chip" data-sensor="${g.id}" aria-pressed="false" title="Para de publicar ${g.nome} (o indicador passa para Sem dados)">${svgIcone(g.icone, { tamanho: 14 })}${g.nome.split(" ")[0]}</button>`,
        ).join("")}</div>
      </fieldset>

      <fieldset class="grupo-controle">
        <legend>Velocidade</legend>
        <div class="alternador" role="group" aria-label="Velocidade da simulação">
          ${[1, 2, 5, 10].map((v) => `<button type="button" class="botao mini" data-velocidade="${v}" aria-pressed="${v === 1}">${v}×</button>`).join("")}
        </div>
        <button type="button" class="botao" data-acao="reiniciar">Reiniciar</button>
        <p class="sutil">Tempo simulado: <output data-saida="tempo">00:00</output></p>
      </fieldset>
    </div>`;

  const $ = (s) => el.querySelector(s);
  const ctrl = simulacao.controle;
  let cenarioAtivo = null;

  function sincronizarOperacao() {
    for (const b of el.querySelectorAll("[data-operacao]")) b.setAttribute("aria-pressed", String(b.dataset.operacao === ctrl.modo));
    for (const l of el.querySelectorAll(".controle-manual")) l.classList.toggle("desabilitado", ctrl.modo !== "manual");
    for (const i of el.querySelectorAll(".controle-manual input, .controle-manual select")) i.disabled = ctrl.modo !== "manual";
  }

  function mostrarDescricao() {
    const c = CENARIO_POR_ID[$('[data-campo="cenario"]').value];
    $('[data-saida="descricao"]').textContent = c?.descricao ?? "";
  }

  el.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.operacao) {
      ctrl.modo = b.dataset.operacao;
      sincronizarOperacao();
      aoMudar?.();
    } else if (b.dataset.sensor) {
      const id = b.dataset.sensor;
      const desligar = !ctrl.sensoresDesligados.has(id);
      if (desligar) ctrl.sensoresDesligados.add(id);
      else ctrl.sensoresDesligados.delete(id);
      b.setAttribute("aria-pressed", String(desligar));
      aoMudar?.();
    } else if (b.dataset.velocidade) {
      ctrl.aceleracao = Number(b.dataset.velocidade);
      for (const x of el.querySelectorAll("[data-velocidade]")) x.setAttribute("aria-pressed", String(x === b));
    } else if (b.dataset.acao === "aplicar") {
      aplicarCenario($('[data-campo="cenario"]').value, Number($('[data-campo="intensidade"]').value));
    } else if (b.dataset.acao === "reiniciar") {
      aplicarCenario("normal", 1);
      simulacao.reiniciar();
    } else if (b.dataset.acao === "recolher") {
      const recolher = !el.classList.contains("recolhido");
      el.classList.toggle("recolhido", recolher);
      b.setAttribute("aria-expanded", String(!recolher));
      b.textContent = recolher ? "Expandir" : "Recolher";
    }
  });

  el.addEventListener("input", (e) => {
    const campo = e.target.dataset.campo;
    if (campo === "rpm") {
      ctrl.rpm = Number(e.target.value);
      $('[data-saida="rpm"]').textContent = `${ctrl.rpm.toLocaleString("pt-BR")} rpm`;
    } else if (campo === "carga") {
      ctrl.carga = Number(e.target.value);
    } else if (campo === "intensidade") {
      $('[data-saida="intensidade"]').textContent = `${Math.round(Number(e.target.value) * 100)}%`;
    } else if (campo === "cenario") {
      mostrarDescricao();
    }
  });

  function aplicarCenario(id, intensidade) {
    cenarioAtivo = id === "normal" ? null : iniciarCenario(id, { inicio: simulacao.tempo, intensidade });
    simulacao.definirCenario(cenarioAtivo);
    aoAplicarCenario?.(cenarioAtivo);
    $('[data-campo="cenario"]').value = id;
    mostrarDescricao();
    aoMudar?.();
  }

  setInterval(() => {
    $('[data-saida="tempo"]').textContent = formatarMinSeg(simulacao.tempo);
  }, 500);

  sincronizarOperacao();
  mostrarDescricao();
  $('[data-campo="carga"]').value = String(ctrl.carga === 0.4 ? 0.6 : ctrl.carga);
  ctrl.carga = Number($('[data-campo="carga"]').value);

  return {
    el,
    get cenarioAtivo() {
      return cenarioAtivo;
    },
    aplicarCenario,
    /** No desafio, o professor esconde este painel dos alunos. */
    ocultar(v) {
      el.hidden = v;
    },
  };
}
