// ESP32 falso para o modo "WebSocket direto": servidor ws://<ip-do-pc>:81 que envia as leituras
// do mesmo modelo da simulação, no formato do firmware exemplos/esp32/torno_monitor_websocket.
//   npm run esp32-falso -- --cenario vibracao --apos 30
// Opções:
//   --porta     porta do servidor (padrão 81; no Linux/macOS portas abaixo de 1024 exigem root: use 8081)
//   --cenario   normal | aquecimento | oleoBaixo | vibracao (padrão normal)
//   --apos      segundos até aplicar o cenário (padrão 30)
//   --acelerar  fator de tempo da simulação (padrão 1)
import os from "node:os";
import { WebSocketServer } from "ws";
import { CICLO_TIPICO, criarModelo, etapaDoCiclo } from "../src/simulacao/modelo.js";
import { iniciarCenario } from "../src/simulacao/cenarios.js";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((pares, a, i, lista) => (a.startsWith("--") ? [...pares, [a.slice(2), lista[i + 1]]] : pares), []),
);
const porta = Number(args.porta ?? 81);
const acelerar = Number(args.acelerar ?? 1);
const cenario = iniciarCenario(args.cenario ?? "normal", { inicio: Number(args.apos ?? 30) });

const servidor = new WebSocketServer({ port: porta });

servidor.on("listening", () => {
  const ips = Object.values(os.networkInterfaces())
    .flat()
    .filter((i) => i && i.family === "IPv4" && !i.internal)
    .map((i) => i.address);
  console.log(`ESP32 falso ouvindo na porta ${porta} (cenário: ${cenario.nome}, a partir de ${cenario.inicio} s)`);
  console.log("No app: ⚙ Configurações → WebSocket direto no ESP32 → IP:");
  for (const ip of ["localhost", ...ips]) console.log(`  ${ip}   porta ${porta}`);
});
servidor.on("error", (e) => {
  console.error(`erro: ${e.message}`);
  if (e.code === "EACCES" || e.code === "EADDRINUSE") console.error("Tente outra porta: npm run esp32-falso -- --porta 8081");
  process.exit(1);
});
servidor.on("connection", (socket, req) => {
  const quem = req.socket.remoteAddress;
  console.log(`+ navegador conectado (${quem})`);
  socket.on("close", () => console.log(`- navegador desconectado (${quem})`));
});

const modelo = criarModelo({ semente: 11 });
let t = 0;
const PASSO = 0.1;
const AMOSTRA_MS = 500;

setInterval(() => {
  let leituras;
  const passos = Math.round(((AMOSTRA_MS / 1000) * acelerar) / PASSO);
  for (let i = 0; i < passos; i++) {
    t += PASSO;
    const etapa = etapaDoCiclo(CICLO_TIPICO, t);
    leituras = modelo.passo(PASSO, { rpmAlvo: etapa.rpm, cargaAlvo: etapa.carga, falhas: cenario.falhas(t) });
  }
  const msg = JSON.stringify(Object.fromEntries(Object.entries(leituras).map(([k, v]) => [k, Number(v.toFixed(2))])));
  for (const c of servidor.clients) if (c.readyState === c.OPEN) c.send(msg);
}, AMOSTRA_MS);

setInterval(() => {
  const e = modelo.estado;
  console.log(`t=${t.toFixed(0)} s · ${servidor.clients.size} navegador(es) · ${e.rpm.toFixed(0)} rpm · ${e.temperatura.toFixed(1)} °C · óleo ${e.oleo.toFixed(0)} %`);
}, 5000);
