import { CICLO_TIPICO, FALHAS_NULAS, criarModelo, etapaDoCiclo } from "../simulacao/modelo.js";
import { criarEmissor } from "../util/emissor.js";

const PASSO_S = 0.1; // integração do modelo
const AMOSTRA_S = 0.5; // período de publicação de cada sensor (2 Hz)
const AQUECIMENTO_S = 90; // histórico gerado ao iniciar, para os gráficos não começarem vazios

/**
 * Fonte de dados simulada: funciona sem sensores.
 * controle.modo = "ciclo" (ciclo típico de usinagem) ou "manual" (rotação e carga definidas pelo professor).
 */
export function criarFonteSimulada({ config, semente = 7 }) {
  const eventos = criarEmissor();
  const controle = {
    modo: "ciclo",
    rpm: 800,
    carga: 0.4,
    aceleracao: 1,
    falhas: { ...FALHAS_NULAS },
    sensoresDesligados: new Set(),
  };
  let modelo = null;
  let fluxo = null;
  let timer = null;
  let tSim = 0; // ms (época)
  let tInicio = 0;
  let tReal = 0;
  let acumulador = 0;
  let desdeAmostra = 0;
  let etapaAtual = null;
  // gancho para cenários (etapa 3): (tSegundos, controle) => falhas
  let cenario = null;

  function entradas(tSeg) {
    let rpmAlvo;
    let cargaAlvo;
    if (controle.modo === "manual") {
      rpmAlvo = controle.rpm;
      cargaAlvo = controle.carga;
      etapaAtual = { rotulo: rpmAlvo > 0 ? "Operação manual" : "Máquina parada" };
    } else {
      etapaAtual = etapaDoCiclo(CICLO_TIPICO, tSeg);
      rpmAlvo = etapaAtual.rpm;
      cargaAlvo = etapaAtual.carga;
    }
    const falhas = cenario ? { ...FALHAS_NULAS, ...cenario.falhas(tSeg) } : controle.falhas;
    return { rpmAlvo, cargaAlvo, falhas, tauTermico: 240 };
  }

  function avancar(dt, publicarAgora) {
    tSim += dt * 1000;
    const tSeg = (tSim - tInicio) / 1000;
    const leituras = modelo.passo(dt, entradas(tSeg));
    desdeAmostra += dt;
    if (desdeAmostra + 1e-6 < AMOSTRA_S && !publicarAgora) return;
    desdeAmostra = 0;
    const lim = config.grandezas.oleo;
    if (lim?.sensor === "boia") leituras.oleo = leituras.oleo > (lim.alarme ?? 25) ? 1 : 0;
    for (const [id, v] of Object.entries(leituras)) {
      if (!controle.sensoresDesligados.has(id)) fluxo.publicar(id, v, tSim);
    }
    eventos.emitir("amostra", { t: tSim, tSeg, etapa: etapaAtual, estado: modelo.estado });
  }

  function tick() {
    const agoraReal = performance.now();
    const dtReal = Math.min(1, (agoraReal - tReal) / 1000);
    tReal = agoraReal;
    acumulador += dtReal * controle.aceleracao;
    let n = 0;
    while (acumulador >= PASSO_S && n < 400) {
      acumulador -= PASSO_S;
      avancar(PASSO_S);
      n++;
    }
  }

  function reiniciarModelo() {
    modelo = criarModelo({ semente, correnteNominal: config.grandezas.corrente?.nominal ?? 20 });
    tInicio = Date.now() - AQUECIMENTO_S * 1000;
    tSim = tInicio;
    desdeAmostra = 0;
    for (let i = 0; i < AQUECIMENTO_S / PASSO_S; i++) avancar(PASSO_S);
    tReal = performance.now();
    acumulador = 0;
  }

  const fonte = {
    id: "simulacao",
    nome: "Simulação",
    controle,
    eventos,
    on: eventos.on,
    async iniciar(f) {
      fluxo = f;
      reiniciarModelo();
      fluxo.definirConexao({ estado: "simulacao", texto: "Simulação" });
      timer = setInterval(tick, 100);
    },
    async parar() {
      clearInterval(timer);
      timer = null;
    },
    agora: () => tSim,
    /** Segundos desde o início da simulação. */
    get tempo() {
      return (tSim - tInicio) / 1000;
    },
    get etapa() {
      return etapaAtual;
    },
    get estadoModelo() {
      return modelo?.estado ?? null;
    },
    definirCenario(c) {
      cenario = c;
    },
    reiniciar() {
      fluxo.limpar();
      reiniciarModelo();
    },
  };
  return fonte;
}
