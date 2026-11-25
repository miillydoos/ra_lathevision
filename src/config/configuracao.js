// Configuração em tempo de execução: public/config.json (editável sem recompilar)
// + ajustes salvos neste navegador (tela de Configurações).

const PADRAO = {
  maquina: "Torno ROMI T 350",
  leituraVelhaS: 10,
  janelaGraficoS: 120,
  // "mqtt": passa por um broker (funciona em HTTPS e na RA) · "websocket": direto no IP do ESP32 (rede local, só http://)
  conexao: "mqtt",
  websocket: { ip: "", porta: 81 },
  mqtt: { url: "wss://public.cloud.shiftr.io", topicoBase: "tormax30/senai/torno01", usuario: "public", senha: "public" },
  grandezas: {
    oleo: { sensor: "continuo", sentido: "abaixo", atencao: 40, alarme: 25, escala: [0, 100] },
    corrente: { sentido: "acima", atencao: 18, alarme: 22, escala: [0, 30], nominal: 20, persistenciaS: 2 },
    vibracao: { sentido: "acima", atencao: 2.8, alarme: 4.5, escala: [0, 8] },
    rotacao: { sentido: "acima", atencao: 2000, alarme: null, escala: [0, 2100] },
  },
};

const CHAVE_LOCAL = "lab-torno:config";

// WebSocket só quando o IP do ESP32 foi preenchido; sem ele, o "Ao vivo" vai pelo broker MQTT e já conecta ao clicar
export const tipoConexao = (config) =>
  config.conexao === "websocket" && String(config.websocket?.ip ?? "").trim() ? "websocket" : "mqtt";

/**
 * Endereço do servidor WebSocket do ESP32 a partir do que foi digitado:
 * "192.168.0.50" → ws://192.168.0.50:81/ · "192.168.0.50:8080" → ws://192.168.0.50:8080/ · "ws://…" fica como está.
 */
export function enderecoWebSocket({ ip, porta } = {}) {
  const texto = String(ip ?? "").trim();
  if (!texto) return "";
  if (/^wss?:\/\//i.test(texto)) return texto;
  const [host, ...caminho] = texto.replace(/^https?:\/\//i, "").split("/");
  const comPorta = /:\d+$/.test(host) ? host : `${host}:${Number(porta) || 81}`;
  return `ws://${comPorta}/${caminho.join("/")}`;
}

function mesclar(base, extra) {
  if (!extra || typeof extra !== "object" || Array.isArray(extra)) return extra ?? base;
  const saida = { ...base };
  for (const [k, v] of Object.entries(extra)) {
    saida[k] = base && typeof base[k] === "object" && !Array.isArray(base[k]) && v && typeof v === "object" && !Array.isArray(v) ? mesclar(base[k], v) : v;
  }
  return saida;
}

function lerLocal() {
  try {
    return JSON.parse(localStorage.getItem(CHAVE_LOCAL) ?? "null");
  } catch {
    return null;
  }
}

export async function carregarConfiguracao() {
  let arquivo = null;
  try {
    const r = await fetch("./config.json", { cache: "no-cache" });
    if (r.ok) arquivo = await r.json();
  } catch (erro) {
    console.warn("config.json não carregado; usando valores padrão", erro);
  }
  const base = mesclar(PADRAO, arquivo);
  const config = mesclar(base, lerLocal());
  // usuário e senha do MQTT em branco (ajuste antigo salvo no navegador) voltam a "public", a do broker público
  for (const k of ["usuario", "senha"]) if (!config.mqtt[k]) config.mqtt[k] = PADRAO.mqtt[k];
  config.__base = base;
  return config;
}

/** Salva só o que o usuário alterou nesta máquina/navegador. */
export function salvarAjustesLocais(ajustes) {
  try {
    localStorage.setItem(CHAVE_LOCAL, JSON.stringify(ajustes));
  } catch (erro) {
    console.warn("não foi possível salvar as configurações", erro);
  }
}

export function lerAjustesLocais() {
  return lerLocal() ?? {};
}

export function limparAjustesLocais() {
  try {
    localStorage.removeItem(CHAVE_LOCAL);
  } catch {
    /* sem armazenamento disponível */
  }
}
