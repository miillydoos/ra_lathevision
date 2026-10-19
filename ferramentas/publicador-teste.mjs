// Publicador de teste: faz o papel do ESP32 usando o mesmo modelo da simulação.
//   npm run publicador -- --url mqtt://localhost:1883 --base senai/torno01 --cenario vibracao
// Opções:
//   --url       broker (padrão mqtt://localhost:1883)
//   --base      tópico base (padrão senai/torno01)
//   --cenario   normal | aquecimento | oleoBaixo | vibracao (padrão normal)
//   --apos      segundos até aplicar o cenário (padrão 30)
//   --formato   topicos (um tópico por grandeza) | json (tudo em <base>/leituras)
//   --acelerar  fator de tempo da simulação (padrão 1)
import mqtt from "mqtt";
import { CICLO_TIPICO, criarModelo, etapaDoCiclo } from "../src/simulacao/modelo.js";
import { iniciarCenario } from "../src/simulacao/cenarios.js";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((pares, a, i, lista) => (a.startsWith("--") ? [...pares, [a.slice(2), lista[i + 1]]] : pares), []),
);
const url = args.url ?? "mqtt://localhost:1883";
const base = (args.base ?? "senai/torno01").replace(/\/+$/, "");
const formato = args.formato ?? "topicos";
const acelerar = Number(args.acelerar ?? 1);
const cenario = iniciarCenario(args.cenario ?? "normal", { inicio: Number(args.apos ?? 30) });

const cliente = mqtt.connect(url, {
  clientId: `publicador-teste-${process.pid}`,
  will: { topic: `${base}/status`, payload: "offline", retain: true, qos: 1 },
});

const modelo = criarModelo({ semente: 11 });
let t = 0;
const PASSO = 0.1;
const AMOSTRA_MS = 500;

cliente.on("connect", () => {
  console.log(`conectado a ${url} — publicando em ${base}/… (cenário: ${cenario.nome}, a partir de ${cenario.inicio} s)`);
  cliente.publish(`${base}/status`, "online", { retain: true, qos: 1 });
  setInterval(() => {
    let leituras;
    const passos = Math.round(((AMOSTRA_MS / 1000) * acelerar) / PASSO);
    for (let i = 0; i < passos; i++) {
      t += PASSO;
      const etapa = etapaDoCiclo(CICLO_TIPICO, t);
      leituras = modelo.passo(PASSO, { rpmAlvo: etapa.rpm, cargaAlvo: etapa.carga, falhas: cenario.falhas(t) });
    }
    const ts = Date.now();
    const arred = Object.fromEntries(Object.entries(leituras).map(([k, v]) => [k, Number(v.toFixed(3))]));
    if (formato === "json") {
      cliente.publish(`${base}/leituras`, JSON.stringify({ ts, ...arred }));
    } else {
      for (const [k, v] of Object.entries(arred)) cliente.publish(`${base}/${k}`, JSON.stringify({ v, ts }));
    }
  }, AMOSTRA_MS);
  setInterval(() => {
    const e = modelo.estado;
    console.log(`t=${t.toFixed(0)} s · ${e.rpm.toFixed(0)} rpm · ${e.temperatura.toFixed(1)} °C · óleo ${e.oleo.toFixed(0)} %`);
  }, 5000);
});
cliente.on("error", (e) => console.error("erro:", e.message));

process.on("SIGINT", () => {
  cliente.publish(`${base}/status`, "offline", { retain: true, qos: 1 }, () => cliente.end(false, {}, () => process.exit(0)));
});
