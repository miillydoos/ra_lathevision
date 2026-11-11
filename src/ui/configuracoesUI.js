import { GRANDEZAS } from "../config/grandezas.js";
import { lerAjustesLocais, limparAjustesLocais, salvarAjustesLocais, tipoConexao } from "../config/configuracao.js";
import { svgIcone } from "../util/icones.js";

const escapar = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/**
 * Configurações salvas neste navegador: conexão ao vivo (IP do ESP32 ou broker MQTT), tipo de sensor de nível e limites.
 * Os valores de fábrica ficam em public/config.json.
 */
export function criarConfiguracoesUI({ config, aoSalvar }) {
  const botao = document.getElementById("btn-config");
  botao.innerHTML = svgIcone("engrenagem", { tamanho: 16 });
  botao.hidden = false;

  const dialogo = document.createElement("dialog");
  dialogo.className = "painel dialogo";
  document.body.appendChild(dialogo);

  function abrir() {
    const m = config.mqtt ?? {};
    const w = config.websocket ?? {};
    const tipo = tipoConexao(config);
    const linhas = GRANDEZAS.map((g) => {
      const l = config.grandezas[g.id] ?? {};
      const sinal = l.sentido === "abaixo" ? "≤" : "≥";
      return `<tr>
        <th scope="row">${escapar(g.nome)} <span class="sutil">(${escapar(g.unidade)}, ${sinal})</span></th>
        <td><input type="number" step="any" name="lim_${g.id}_atencao" value="${l.atencao ?? ""}" aria-label="${escapar(g.nome)}: limite de atenção" /></td>
        <td><input type="number" step="any" name="lim_${g.id}_alarme" value="${l.alarme ?? ""}" aria-label="${escapar(g.nome)}: limite de alarme" /></td>
      </tr>`;
    }).join("");
    dialogo.innerHTML = `
      <form method="dialog" class="form-config">
        <header class="cab-modo"><h2>Configurações</h2></header>
        <fieldset class="grupo-controle">
          <legend>Conexão ao vivo</legend>
          <label class="opcao"><input type="radio" name="conexao" value="websocket" ${tipo === "websocket" ? "checked" : ""} /> WebSocket direto no ESP32 (pelo IP)</label>
          <label class="opcao"><input type="radio" name="conexao" value="mqtt" ${tipo === "mqtt" ? "checked" : ""} /> Broker MQTT (sobre WebSocket)</label>
          <div class="campos-conexao" data-conexao="websocket" ${tipo === "websocket" ? "" : "hidden"}>
            <div class="duas-colunas">
              <label>IP do ESP32 <input name="wsIp" value="${escapar(w.ip)}" placeholder="192.168.0.50" inputmode="url" spellcheck="false" autocomplete="off" /></label>
              <label>Porta <input name="wsPorta" type="number" min="1" max="65535" step="1" value="${escapar(w.porta ?? 81)}" /></label>
            </div>
            <p class="sutil">O ESP32 mostra o IP no Monitor Serial (115200) ao ligar. Este aparelho precisa estar na mesma rede Wi-Fi. Abra o app por <code>http://</code>: em páginas HTTPS (GitHub Pages, <code>npm run dev:https</code>) o navegador bloqueia <code>ws://</code>.</p>
          </div>
          <div class="campos-conexao" data-conexao="mqtt" ${tipo === "mqtt" ? "" : "hidden"}>
            <label>Endereço do broker <input name="url" value="${escapar(m.url)}" placeholder="wss://public.cloud.shiftr.io" spellcheck="false" /></label>
            <label>Tópico base <input name="topicoBase" value="${escapar(m.topicoBase)}" placeholder="tormax30/senai/torno01" spellcheck="false" /></label>
            <div class="duas-colunas">
              <label>Usuário <input name="usuario" value="${escapar(m.usuario)}" autocomplete="off" /></label>
              <label>Senha <input name="senha" type="password" value="${escapar(m.senha)}" autocomplete="off" /></label>
            </div>
            <p class="sutil">Em páginas HTTPS (necessário para RV/RA) o navegador só aceita <code>wss://</code>. Prefira brokers na porta 443: redes de escola e empresa costumam bloquear 8883, 8884 e 9001.</p>
          </div>
        </fieldset>
        <fieldset class="grupo-controle">
          <legend>Sensor de nível de óleo</legend>
          <label class="opcao"><input type="radio" name="sensorOleo" value="continuo" ${config.grandezas.oleo?.sensor !== "boia" ? "checked" : ""} /> Medição contínua (porcentagem)</label>
          <label class="opcao"><input type="radio" name="sensorOleo" value="boia" ${config.grandezas.oleo?.sensor === "boia" ? "checked" : ""} /> Boia / chave de nível (só “OK” ou “Baixo”)</label>
        </fieldset>
        <fieldset class="grupo-controle">
          <legend>Limites</legend>
          <p class="sutil">Ajuste conforme a máquina, o ponto medido e a condição de operação. Deixe em branco para não usar o limite.</p>
          <table class="tabela-limites"><thead><tr><th>Grandeza</th><th>Atenção</th><th>Alarme</th></tr></thead><tbody>${linhas}</tbody></table>
        </fieldset>
        <footer class="acoes-dialogo">
          <button type="button" class="botao" data-acao="restaurar">Restaurar config.json</button>
          <span class="espaco"></span>
          <button type="button" class="botao" data-acao="cancelar">Cancelar</button>
          <button type="submit" class="botao primario" value="salvar">Salvar</button>
        </footer>
      </form>`;
    dialogo.showModal();
  }

  dialogo.addEventListener("click", (e) => {
    const acao = e.target.closest("[data-acao]")?.dataset.acao;
    if (acao === "cancelar") dialogo.close();
    if (acao === "restaurar") {
      limparAjustesLocais();
      dialogo.close();
      location.reload();
    }
  });

  // mostra só os campos da conexão escolhida
  dialogo.addEventListener("change", (e) => {
    if (e.target.name !== "conexao") return;
    for (const campos of dialogo.querySelectorAll("[data-conexao]")) campos.hidden = campos.dataset.conexao !== e.target.value;
  });

  dialogo.addEventListener("submit", (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const num = (v) => (v === "" || v === null ? null : Number(v));
    const ajustes = lerAjustesLocais();
    ajustes.conexao = f.get("conexao") === "mqtt" ? "mqtt" : "websocket";
    ajustes.websocket = { ip: String(f.get("wsIp")).trim(), porta: Number(f.get("wsPorta")) || 81 };
    ajustes.mqtt = {
      url: String(f.get("url")).trim(),
      topicoBase: String(f.get("topicoBase")).trim().replace(/\/+$/, ""),
      usuario: String(f.get("usuario")),
      senha: String(f.get("senha")),
    };
    ajustes.grandezas = ajustes.grandezas ?? {};
    for (const g of GRANDEZAS) {
      ajustes.grandezas[g.id] = {
        ...(ajustes.grandezas[g.id] ?? {}),
        atencao: num(f.get(`lim_${g.id}_atencao`)),
        alarme: num(f.get(`lim_${g.id}_alarme`)),
      };
    }
    ajustes.grandezas.oleo.sensor = f.get("sensorOleo");
    salvarAjustesLocais(ajustes);

    // aplica sem recarregar
    config.conexao = ajustes.conexao;
    config.websocket = { ...config.websocket, ...ajustes.websocket };
    config.mqtt = { ...config.mqtt, ...ajustes.mqtt };
    for (const [id, l] of Object.entries(ajustes.grandezas)) config.grandezas[id] = { ...config.grandezas[id], ...l };
    dialogo.close();
    aoSalvar?.();
  });

  botao.addEventListener("click", abrir);
  return { abrir };
}
