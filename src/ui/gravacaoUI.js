import { salvarSessao, baixarSessao } from "../dados/armazenamento.js";
import { svgIcone } from "../util/icones.js";
import { formatarMinSeg } from "./painelSimulacao.js";

/**
 * Bloco "Gravar sessão" (usado nos modos Ao vivo e Simulação).
 * Ao parar, a sessão fica salva neste navegador e pode ser baixada como .json.
 */
export function criarGravacaoUI({ gravador, origem, aoSalvar, aoAbrirReplay }) {
  const el = document.createElement("fieldset");
  el.className = "grupo-controle gravacao";
  el.innerHTML = `
    <legend>Registro da sessão</legend>
    <div class="linha-gravacao">
      <button type="button" class="botao" data-acao="gravar">${svgIcone("gravar", { tamanho: 12 })} Gravar</button>
      <span class="estado-gravacao" role="status"></span>
    </div>
    <label>Título <input data-campo="titulo" placeholder="ex.: Turma B · eixo SAE 1045" /></label>
    <label>Operação (material, ferramenta, rotação) <input data-campo="operacao" placeholder="ex.: desbaste Ø 50 → 46 mm, metal duro, 800 rpm" /></label>
    <div class="resultado-gravacao" hidden></div>`;

  const btn = el.querySelector('[data-acao="gravar"]');
  const estadoEl = el.querySelector(".estado-gravacao");
  const resultado = el.querySelector(".resultado-gravacao");
  const titulo = el.querySelector('[data-campo="titulo"]');
  const operacao = el.querySelector('[data-campo="operacao"]');
  let ultima = null;
  let iniciadaAqui = false; // há um bloco destes em cada modo; só quem iniciou salva

  function atualizar() {
    const g = gravador.gravando;
    btn.innerHTML = g ? `${svgIcone("parar", { tamanho: 12 })} Parar e salvar` : `${svgIcone("gravar", { tamanho: 12 })} Gravar`;
    btn.classList.toggle("gravando", g);
    titulo.disabled = g;
    operacao.disabled = g;
    estadoEl.textContent = g ? `Gravando ${formatarMinSeg(gravador.duracaoS)} · ${gravador.total.toLocaleString("pt-BR")} leituras` : "";
  }

  async function concluir(sessao) {
    if (!sessao) return;
    ultima = sessao;
    const ok = await salvarSessao(sessao);
    resultado.hidden = false;
    resultado.innerHTML = `${ok ? "Sessão salva neste navegador." : "Não foi possível salvar no navegador; baixe o arquivo."}
      <button type="button" class="botao mini" data-acao="replay">Abrir no Replay</button>
      <button type="button" class="botao mini" data-acao="baixar">Baixar .json</button>`;
    aoSalvar?.(sessao);
    atualizar();
  }

  el.addEventListener("click", (e) => {
    const acao = e.target.closest("[data-acao]")?.dataset.acao;
    if (acao === "gravar") {
      if (gravador.gravando) {
        iniciadaAqui = false;
        concluir(gravador.parar());
      } else {
        iniciadaAqui = true;
        resultado.hidden = true;
        gravador.iniciar({ titulo: titulo.value.trim(), origem: origem(), contexto: { operacao: operacao.value.trim() } });
      }
      atualizar();
    }
    if (acao === "baixar" && ultima) baixarSessao(ultima);
    if (acao === "replay" && ultima) aoAbrirReplay?.(ultima);
  });

  gravador.on("estado", atualizar);
  gravador.on("interrompida", (sessao) => {
    if (!iniciadaAqui) return;
    iniciadaAqui = false;
    concluir(sessao);
  });
  setInterval(() => gravador.gravando && atualizar(), 500);
  atualizar();
  return { el };
}
