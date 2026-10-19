// Modelo didático do torno: gera as cinco grandezas a partir da rotação, da carga de corte
// e de parâmetros de falha. Não é um gêmeo digital calibrado: os coeficientes produzem
// comportamentos plausíveis e coerentes entre si para fins de ensino.
// A evolução térmica é acelerada (constante de tempo de minutos, não de horas) para caber na aula.

export function criarGerador(semente = 1) {
  // mulberry32: aleatório reprodutível (mesma semente → mesma sessão)
  let a = semente >>> 0;
  const rnd = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const gauss = () => {
    let u = 0;
    let v = 0;
    while (u === 0) u = rnd();
    while (v === 0) v = rnd();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  return { rnd, gauss };
}

export const FALHAS_NULAS = Object.freeze({
  atrito: 0, // 0..1 — atrito extra no cabeçote (lubrificação deficiente, rolamento com pré-carga excessiva…)
  vazamento: 0, // % do nível por minuto
  desbalanceamento: 0, // 0..1 — vibração proporcional ao quadrado da rotação
  oscilacaoCorrente: 0, // 0..1 — oscilação periódica da corrente
  folga: 0, // 0..1 — vibração com picos (impactos), pouco dependente da rotação
});

export function criarModelo({ semente = 1, correnteNominal = 20, oleoInicial = 86, temperaturaAmbiente = 24 } = {}) {
  const { rnd, gauss } = criarGerador(semente);
  const In = correnteNominal;
  const s = {
    t: 0,
    rpm: 0,
    rpmAnterior: 0,
    carga: 0,
    temperatura: temperaturaAmbiente + 1.5,
    tempAmbiente: temperaturaAmbiente,
    oleo: oleoInicial,
    fase: 0,
  };

  /**
   * Avança dt segundos.
   * entradas: { rpmAlvo, cargaAlvo, falhas, tauTermico }
   * Retorna as leituras de sensor (com ruído) — o estado interno fica em `estado`.
   */
  function passo(dt, { rpmAlvo = 0, cargaAlvo = 0, falhas = FALHAS_NULAS, tauTermico = 240 } = {}) {
    s.t += dt;

    // rotação: rampa de aceleração/frenagem (freio eletromagnético para mais rápido)
    const taxa = rpmAlvo > s.rpm ? 650 : 900; // rpm/s
    const delta = rpmAlvo - s.rpm;
    s.rpmAnterior = s.rpm;
    s.rpm += Math.sign(delta) * Math.min(Math.abs(delta), taxa * dt);
    if (s.rpm < 0.5 && rpmAlvo === 0) s.rpm = 0;
    const aceleracao = (s.rpm - s.rpmAnterior) / Math.max(dt, 1e-3);
    const girando = s.rpm > 1;
    const motorLigado = girando || rpmAlvo > 0;

    // carga de corte com resposta suave
    const cargaEfetiva = girando ? cargaAlvo : 0;
    s.carga += (cargaEfetiva - s.carga) * Math.min(1, dt / 0.8);

    // óleo: vazamento lento; abaixo de ~30 % a lubrificação piora e o atrito cresce
    s.oleo = Math.max(0, s.oleo - (falhas.vazamento / 60) * dt);
    const faltaOleo = Math.max(0, (30 - s.oleo) / 30);
    const atritoTotal = falhas.atrito + faltaOleo * 0.7;

    // temperatura: primeira ordem rumo ao equilíbrio
    const r = s.rpm / 2000;
    const deltaEquilibrio = 13 * Math.pow(r, 1.2) + 5 * s.carga + atritoTotal * 34 * (0.35 + r);
    const tEquilibrio = s.tempAmbiente + deltaEquilibrio;
    s.temperatura += ((tEquilibrio - s.temperatura) * dt) / tauTermico;

    // corrente do motor
    let corrente = 0;
    if (motorLigado) {
      const vazio = 0.36 * In + 0.05 * In * r;
      const corte = 0.55 * In * s.carga;
      const extraAtrito = 0.22 * In * atritoTotal * (0.4 + r);
      // pico de partida (a amostra de 0,5 s é uma média: o pico instantâneo real é maior e mais curto)
      const partida = aceleracao > 50 ? Math.min(1.1 * In, (aceleracao / 650) * 1.1 * In) : 0;
      s.fase += dt * 2 * Math.PI * 0.42; // ~2,4 s por ciclo de oscilação
      const oscilacao = falhas.oscilacaoCorrente * 0.16 * In * Math.sin(s.fase) * (girando ? 1 : 0);
      corrente = vazio + corte + extraAtrito + partida + oscilacao + gauss() * 0.012 * In;
    }

    // vibração (velocidade RMS, mm/s)
    let vibracao = 0.03 + Math.abs(gauss()) * 0.01;
    if (girando) {
      const rr = s.rpm / 1200;
      vibracao =
        0.22 +
        0.62 * Math.pow(r, 1.5) +
        0.55 * s.carga +
        falhas.desbalanceamento * 4.6 * rr * rr +
        falhas.folga * (1.3 + (rnd() < 0.12 ? 2.2 : 0)) +
        atritoTotal * 0.5 +
        gauss() * 0.05 * (1 + s.carga);
    }

    // nível: o óleo em movimento faz a leitura oscilar e baixar um pouco com a máquina girando
    const leituraOleo = s.oleo - (girando ? 2.5 * r : 0) + gauss() * (girando ? 0.9 : 0.15);

    return {
      temperatura: s.temperatura + gauss() * 0.06,
      oleo: Math.max(0, Math.min(100, leituraOleo)),
      corrente: Math.max(0, corrente),
      vibracao: Math.max(0, vibracao),
      rotacao: girando ? Math.max(0, s.rpm + gauss() * 2) : 0,
    };
  }

  return {
    passo,
    estado: s,
  };
}

// Ciclo típico de usinagem usado quando ninguém controla a máquina manualmente.
export const CICLO_TIPICO = [
  { dur: 8, rpm: 0, carga: 0, rotulo: "Preparação (máquina parada)" },
  { dur: 6, rpm: 800, carga: 0, rotulo: "Aproximação da ferramenta" },
  { dur: 40, rpm: 800, carga: 0.6, rotulo: "Desbaste" },
  { dur: 5, rpm: 800, carga: 0, rotulo: "Recuo" },
  { dur: 30, rpm: 1250, carga: 0.3, rotulo: "Acabamento" },
  { dur: 5, rpm: 1250, carga: 0, rotulo: "Recuo" },
];

/** Etapa do ciclo no instante t (s). */
export function etapaDoCiclo(ciclo, t) {
  const total = ciclo.reduce((s, e) => s + e.dur, 0);
  let x = ((t % total) + total) % total;
  for (const e of ciclo) {
    if (x < e.dur) return e;
    x -= e.dur;
  }
  return ciclo[0];
}
