// Gera as sessões de exemplo em public/sessoes/ a partir do modelo de simulação.
//   npm run sessoes
// Os títulos não revelam a causa: a turma investiga pelos sinais e pelo contexto.
// O gabarito de cada sessão fica nos desafios (src/config/desafios.js), não no arquivo.
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { criarModelo, etapaDoCiclo } from "../src/simulacao/modelo.js";
import { iniciarCenario } from "../src/simulacao/cenarios.js";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const destino = join(raiz, "public", "sessoes");
mkdirSync(destino, { recursive: true });

const ciclo = (desbaste, acabamento) => [
  { dur: 10, rpm: 0, carga: 0, rotulo: "Fixação da peça" },
  { dur: 6, rpm: desbaste.rpm, carga: 0, rotulo: "Aproximação" },
  { dur: 45, rpm: desbaste.rpm, carga: desbaste.carga, rotulo: "Desbaste" },
  { dur: 5, rpm: desbaste.rpm, carga: 0, rotulo: "Recuo" },
  { dur: 30, rpm: acabamento.rpm, carga: acabamento.carga, rotulo: "Acabamento" },
  { dur: 6, rpm: acabamento.rpm, carga: 0, rotulo: "Recuo" },
];

const SESSOES = [
  {
    id: "exemplo-01",
    titulo: "Sessão 01 · Eixo SAE 1045 (referência)",
    contexto: {
      operacao: "Torneamento cilíndrico externo de eixos, Ø 50 mm → Ø 46 mm, comprimento 180 mm",
      material: "Aço SAE 1045",
      ferramenta: "Pastilha de metal duro, raio de ponta 0,8 mm",
      observacoes: "Desbaste a 800 rpm e acabamento a 1.250 rpm. Máquina recém-revisada.",
    },
    ciclo: ciclo({ rpm: 800, carga: 0.6 }, { rpm: 1250, carga: 0.3 }),
    duracao: 6 * 60,
    cenario: "normal",
    semente: 101,
  },
  {
    id: "exemplo-02",
    titulo: "Sessão 02 · Eixo SAE 1045 (lote 2)",
    contexto: {
      operacao: "Mesma operação da Sessão 01, outro lote de peças",
      material: "Aço SAE 1045",
      ferramenta: "Pastilha de metal duro, raio de ponta 0,8 mm",
      observacoes: "Operador relatou ruído diferente perto do cabeçote no meio do turno.",
    },
    ciclo: ciclo({ rpm: 800, carga: 0.6 }, { rpm: 1250, carga: 0.3 }),
    duracao: 10 * 60,
    cenario: "vibracao",
    apos: 120,
    semente: 202,
  },
  {
    id: "exemplo-03",
    titulo: "Sessão 03 · Buchas de latão",
    contexto: {
      operacao: "Torneamento externo de buchas, Ø 30 mm",
      material: "Latão",
      ferramenta: "Ferramenta de metal duro para não ferrosos",
      observacoes: "Rotações maiores: desbaste a 1.250 rpm e acabamento a 1.800 rpm.",
    },
    ciclo: ciclo({ rpm: 1250, carga: 0.4 }, { rpm: 1800, carga: 0.2 }),
    duracao: 11 * 60,
    cenario: "oleoBaixo",
    intensidade: 0.7,
    apos: 60,
    semente: 303,
  },
  {
    id: "exemplo-04",
    titulo: "Sessão 04 · Eixo longo SAE 1020",
    contexto: {
      operacao: "Torneamento de eixo longo apoiado na luneta fixa, Ø 40 mm",
      material: "Aço SAE 1020",
      ferramenta: "Pastilha de metal duro, raio de ponta 0,4 mm",
      observacoes: "Desbaste a 630 rpm e acabamento a 1.000 rpm.",
    },
    ciclo: ciclo({ rpm: 630, carga: 0.55 }, { rpm: 1000, carga: 0.25 }),
    duracao: 10 * 60,
    cenario: "aquecimento",
    intensidade: 1.2,
    apos: 90,
    semente: 404,
  },
];

const INICIO = Date.parse("2026-09-15T13:30:00-03:00");
const PASSO = 0.1;
const AMOSTRA = 0.5;
const indice = [];

SESSOES.forEach((def, n) => {
  const modelo = criarModelo({ semente: def.semente });
  const cenario = iniciarCenario(def.cenario, { inicio: def.apos ?? 0, intensidade: def.intensidade ?? 1 });
  const series = { temperatura: [], oleo: [], corrente: [], vibracao: [], rotacao: [] };
  let desde = 0;
  for (let t = 0; t <= def.duracao + 1e-6; t += PASSO) {
    const etapa = etapaDoCiclo(def.ciclo, t);
    const leituras = modelo.passo(PASSO, { rpmAlvo: etapa.rpm, cargaAlvo: etapa.carga, falhas: cenario.falhas(t) });
    desde += PASSO;
    if (desde + 1e-6 >= AMOSTRA) {
      desde = 0;
      const ms = Math.round(t * 1000);
      for (const [id, v] of Object.entries(leituras)) series[id].push([ms, Number(v.toFixed(3))]);
    }
  }
  const inicio = INICIO + n * 86400000;
  const sessao = {
    formato: "lab-torno-sessao/1",
    id: def.id,
    titulo: def.titulo,
    maquina: "Torno ROMI T 350 — Laboratório de Usinagem",
    origem: "exemplo",
    inicio,
    fim: inicio + def.duracao * 1000,
    contexto: def.contexto,
    limites: null,
    series,
    eventos: [],
  };
  writeFileSync(join(destino, `${def.id}.json`), JSON.stringify(sessao));
  indice.push({ id: def.id, titulo: def.titulo, arquivo: `${def.id}.json`, duracaoS: def.duracao });
  console.log(`${def.id}.json  (${def.duracao / 60} min)`);
});

writeFileSync(join(destino, "index.json"), JSON.stringify(indice, null, 2));
console.log("index.json");
