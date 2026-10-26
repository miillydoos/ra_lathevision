import { baixarSessao, excluirSessao, lerSessao, listarSessoes, salvarSessao } from "../dados/armazenamento.js";
import { normalizarSessao } from "../dados/sessao.js";
import { svgIcone } from "../util/icones.js";
import { formatarMinSeg } from "./painelSimulacao.js";
import { criarEmissor } from "../util/emissor.js";

const escapar = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/**
 * Rodapé do modo Replay: escolha da sessão, contexto da operação, controles de reprodução,
 * linha do tempo e marcadores do aluno ("aqui a vibração começou a subir").
 */
export function criarPainelReplay({ replay, sensoresUI, painelXR }) {
  const eventos = criarEmissor();
  const el = document.createElement("section");
  el.className = "painel painel-modo painel-replay";
  el.setAttribute("aria-label", "Reprodução de sessão");
  el.innerHTML = `
    <header class="cab-modo">
      <h2>Replay</h2>
      <div class="acoes-modo">
        <select data-campo="sessao" aria-label="Sessão"></select>
        <button type="button" class="botao mini" data-acao="arquivo">${svgIcone("abrir", { tamanho: 13 })} Abrir arquivo</button>
        <button type="button" class="botao mini" data-acao="baixar">${svgIcone("baixar", { tamanho: 13 })} Baixar</button>
        <button type="button" class="botao mini" data-acao="excluir" hidden>Excluir</button>
        <input type="file" accept=".json,application/json" hidden />
      </div>
    </header>
    <div class="corpo-modo corpo-replay">
      <div class="contexto-sessao"></div>
      <div class="transporte">
        <div class="botoes-transporte">
          <button type="button" class="botao icone" data-acao="inicio" title="Ir para o início" aria-label="Ir para o início">${svgIcone("voltar", { tamanho: 15 })}</button>
          <button type="button" class="botao" data-acao="menos">−10 s</button>
          <button type="button" class="botao primario icone" data-acao="tocar" aria-label="Reproduzir">${svgIcone("play", { tamanho: 16 })}</button>
          <button type="button" class="botao" data-acao="mais">+10 s</button>
          <select data-campo="velocidade" aria-label="Velocidade">
            ${[0.5, 1, 2, 5, 10, 20].map((v) => `<option value="${v}" ${v === 5 ? "selected" : ""}>${String(v).replace(".", ",")}×</option>`).join("")}
          </select>
          <span class="tempo-replay" aria-live="off">00:00 / 00:00</span>
        </div>
        <div class="trilha">
          <div class="marcas"></div>
          <input type="range" min="0" max="1000" step="100" value="0" data-campo="posicao" aria-label="Posição na sessão" />
        </div>
      </div>
      <div class="marcadores-aluno">
        <div class="linha-marcar">
          <input data-campo="nota" placeholder="O que você observou neste instante?" />
          <button type="button" class="botao" data-acao="marcar">${svgIcone("marcador", { tamanho: 13 })} Marcar instante</button>
        </div>
        <ol class="lista-marcadores"></ol>
      </div>
    </div>`;

  const $ = (s) => el.querySelector(s);
  const selSessao = $('[data-campo="sessao"]');
  const inputArquivo = $('input[type="file"]');
  const posicao = $('[data-campo="posicao"]');
  const tempo = $(".tempo-replay");
  const btnTocar = $('[data-acao="tocar"]');
  const contexto = $(".contexto-sessao");
  const marcas = $(".marcas");
  const lista = $(".lista-marcadores");
  const nota = $('[data-campo="nota"]');
  let exemplos = [];
  let salvas = [];
  let marcadoresAluno = [];
  let arrastando = false;

  replay.definirVelocidade(5);

  async function atualizarLista(selecionar) {
    try {
      const r = await fetch("./sessoes/index.json", { cache: "no-cache" });
      exemplos = r.ok ? await r.json() : [];
    } catch {
      exemplos = [];
    }
    salvas = await listarSessoes();
    const atual = selecionar ?? selSessao.value;
    selSessao.innerHTML = `
      <optgroup label="Sessões de exemplo">${exemplos.map((s) => `<option value="ex:${escapar(s.id)}">${escapar(s.titulo)}</option>`).join("")}</optgroup>
      ${salvas.length ? `<optgroup label="Gravadas neste navegador">${salvas.map((s) => `<option value="db:${escapar(s.id)}">${escapar(s.titulo)}</option>`).join("")}</optgroup>` : ""}
      ${replay.sessao?.origem === "arquivo" ? `<option value="arquivo">${escapar(replay.sessao.titulo)} (arquivo)</option>` : ""}`;
    if (atual) selSessao.value = atual;
  }

  async function abrirSelecionada() {
    const v = selSessao.value;
    let bruta = null;
    if (v.startsWith("ex:")) {
      const ex = exemplos.find((s) => `ex:${s.id}` === v);
      const r = await fetch(`./sessoes/${ex.arquivo}`);
      bruta = await r.json();
    } else if (v.startsWith("db:")) {
      bruta = await lerSessao(v.slice(3));
    }
    if (bruta) carregar(normalizarSessao(bruta));
  }

  function carregar(sessao) {
    marcadoresAluno = (sessao.eventos ?? []).filter((e) => e.tipo === "aluno");
    replay.carregar(sessao);
    $('[data-acao="excluir"]').hidden = !salvas.some((s) => s.id === sessao.id);
    const c = sessao.contexto ?? {};
    const itens = [
      ["Operação", c.operacao],
      ["Material", c.material],
      ["Ferramenta", c.ferramenta],
      ["Observações", c.observacoes],
    ].filter(([, v]) => v);
    contexto.innerHTML = `<strong>${escapar(sessao.titulo)}</strong>
      <span class="sutil"> · ${new Date(sessao.inicio).toLocaleString("pt-BR")} · ${formatarMinSeg((sessao.fim - sessao.inicio) / 1000)}</span>
      ${itens.length ? `<dl>${itens.map(([k, v]) => `<dt>${k}</dt><dd>${escapar(v)}</dd>`).join("")}</dl>` : `<p class="sutil">Sem descrição da operação.</p>`}`;
    posicao.max = String(Math.max(1000, sessao.fim - sessao.inicio));
    aplicarContexto();
    desenharMarcadores();
    atualizarTempo();
    eventos.emitir("sessao", sessao);
  }

  /** Configura gráficos e painel de RV para a sessão (chamado também ao entrar no modo). */
  function aplicarContexto() {
    const s = replay.sessao;
    if (!s) return;
    const formatar = (t) => formatarMinSeg((t - s.inicio) / 1000);
    const janela = { t0: s.inicio, t1: s.fim };
    const serie = (id, t0, t1) => replay.serieCompleta(id, t0, t1);
    sensoresUI.definirContextoTempo({ formatar, janela, serie, aoClicar: (t) => replay.irPara(t - s.inicio) });
    painelXR?.definirContextoTempo({ formatar, janela, serie });
    painelXR?.definirControles([
      { id: "menos", rotulo: () => "−10 s", aoClicar: () => replay.irPara(replay.posicao - 10000) },
      { id: "tocar", rotulo: () => (replay.tocando ? "Pausar" : "Reproduzir"), aoClicar: () => replay.alternar(), ativo: () => replay.tocando },
      { id: "mais", rotulo: () => "+10 s", aoClicar: () => replay.irPara(replay.posicao + 10000) },
      { id: "marcar", rotulo: () => "Marcar instante", aoClicar: () => marcar("Marcado no headset") },
    ]);
    atualizarMarcadoresGraficos();
  }

  function todosEventos() {
    const s = replay.sessao;
    return [...(s?.eventos ?? []).filter((e) => e.tipo !== "aluno"), ...marcadoresAluno].sort((a, b) => a.t - b.t);
  }

  function atualizarMarcadoresGraficos() {
    const s = replay.sessao;
    if (!s) return;
    const lista = todosEventos().map((e) => ({ t: s.inicio + e.t, texto: e.texto }));
    sensoresUI.definirMarcadores(lista);
    painelXR?.definirMarcadores(lista);
  }

  function desenharMarcadores() {
    const s = replay.sessao;
    if (!s) return;
    const dur = Math.max(1, s.fim - s.inicio);
    marcas.innerHTML = todosEventos()
      .map((e) => `<span class="tique-tempo ${e.tipo === "aluno" ? "aluno" : ""}" style="left:${((e.t / dur) * 100).toFixed(2)}%" title="${escapar(formatarMinSeg(e.t / 1000) + " · " + e.texto)}"></span>`)
      .join("");
    lista.innerHTML = marcadoresAluno
      .map(
        (m, i) => `<li><button type="button" class="botao mini" data-ir="${m.t}">${formatarMinSeg(m.t / 1000)}</button>
          <span>${escapar(m.texto)}</span><button type="button" class="fechar" data-remover="${i}" aria-label="Remover marcador">×</button></li>`,
      )
      .join("");
    atualizarMarcadoresGraficos();
    eventos.emitir("marcadores", marcadoresAluno);
  }

  function marcar(texto) {
    if (!replay.sessao) return;
    marcadoresAluno.push({ t: Math.round(replay.posicao), texto: texto || "Instante marcado", tipo: "aluno" });
    marcadoresAluno.sort((a, b) => a.t - b.t);
    desenharMarcadores();
  }

  function atualizarTempo() {
    const pos = replay.posicao;
    tempo.textContent = `${formatarMinSeg(pos / 1000)} / ${formatarMinSeg(replay.duracao / 1000)}`;
    if (!arrastando) posicao.value = String(pos);
    btnTocar.innerHTML = svgIcone(replay.tocando ? "pausa" : "play", { tamanho: 16 });
    btnTocar.setAttribute("aria-label", replay.tocando ? "Pausar" : "Reproduzir");
  }

  replay.on("posicao", atualizarTempo);
  replay.on("tocando", atualizarTempo);

  el.addEventListener("click", async (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    const acao = b.dataset.acao;
    if (acao === "tocar") replay.alternar();
    if (acao === "inicio") replay.irPara(0);
    if (acao === "menos") replay.irPara(replay.posicao - 10000);
    if (acao === "mais") replay.irPara(replay.posicao + 10000);
    if (acao === "marcar") {
      marcar(nota.value.trim());
      nota.value = "";
    }
    if (acao === "arquivo") inputArquivo.click();
    if (acao === "baixar" && replay.sessao) baixarSessao({ ...replay.sessao, eventos: todosEventos() });
    if (acao === "excluir" && replay.sessao && confirm(`Excluir “${replay.sessao.titulo}” deste navegador?`)) {
      await excluirSessao(replay.sessao.id);
      await atualizarLista();
      await abrirSelecionada();
    }
    if (b.dataset.ir) replay.irPara(Number(b.dataset.ir));
    if (b.dataset.remover) {
      marcadoresAluno.splice(Number(b.dataset.remover), 1);
      desenharMarcadores();
    }
  });

  nota.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      marcar(nota.value.trim());
      nota.value = "";
    }
  });
  selSessao.addEventListener("change", abrirSelecionada);
  $('[data-campo="velocidade"]').addEventListener("change", (e) => replay.definirVelocidade(Number(e.target.value)));
  posicao.addEventListener("input", () => {
    arrastando = true;
    replay.irPara(Number(posicao.value));
  });
  posicao.addEventListener("change", () => (arrastando = false));
  inputArquivo.addEventListener("change", async () => {
    const arquivo = inputArquivo.files?.[0];
    if (!arquivo) return;
    try {
      const sessao = normalizarSessao(JSON.parse(await arquivo.text()));
      sessao.origem = sessao.origem === "exemplo" ? "arquivo" : sessao.origem;
      if (await salvarSessao(sessao)) await atualizarLista(`db:${sessao.id}`);
      carregar(sessao);
    } catch (erro) {
      alert(`Não foi possível abrir o arquivo: ${erro.message}`);
    } finally {
      inputArquivo.value = "";
    }
  });

  return {
    el,
    on: eventos.on,
    async aoEntrar() {
      await atualizarLista();
      if (!replay.sessao) await abrirSelecionada();
      else aplicarContexto();
    },
    aoSair() {
      replay.pausar();
      painelXR?.definirControles([]);
    },
    /** Abre uma sessão recém-gravada. */
    async abrirSessao(sessao) {
      await atualizarLista(`db:${sessao.id}`);
      carregar(normalizarSessao(sessao));
    },
    /** Carrega uma sessão de exemplo pelo id (usado pelos desafios). */
    async abrirExemplo(id) {
      await atualizarLista(`ex:${id}`);
      selSessao.value = `ex:${id}`;
      await abrirSelecionada();
    },
    get marcadores() {
      return marcadoresAluno;
    },
    marcar,
    info: () => {
      const s = replay.sessao;
      return s ? `Replay · ${formatarMinSeg(replay.posicao / 1000)} de ${formatarMinSeg(replay.duracao / 1000)}${replay.tocando ? ` · ${replay.velocidade}×` : " · pausado"}` : "Replay · escolha uma sessão";
    },
  };
}
