// Broker MQTT local para testes em sala, sem instalar o Mosquitto.
//   npm run broker
// TCP 1883 (ESP32 / publicador de teste) e WebSocket 9001 (navegador: ws://<ip-do-pc>:9001)
import net from "node:net";
import http from "node:http";
import { WebSocketServer, createWebSocketStream } from "ws";
import { Aedes } from "aedes";

const PORTA_TCP = Number(process.env.PORTA_TCP ?? 1883);
const PORTA_WS = Number(process.env.PORTA_WS ?? 9001);

const broker = await Aedes.createBroker();

net.createServer(broker.handle).listen(PORTA_TCP, () => console.log(`MQTT (TCP)       mqtt://localhost:${PORTA_TCP}`));

const servidorHttp = http.createServer((_, res) => {
  res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
  res.end("Broker MQTT do Laboratório do Torno — conecte via WebSocket neste endereço.\n");
});
new WebSocketServer({ server: servidorHttp }).on("connection", (socket, req) => {
  broker.handle(createWebSocketStream(socket), req);
});
servidorHttp.listen(PORTA_WS, () => console.log(`MQTT (WebSocket) ws://localhost:${PORTA_WS}`));

broker.on("client", (c) => console.log(`+ cliente ${c.id}`));
broker.on("clientDisconnect", (c) => console.log(`- cliente ${c.id}`));
