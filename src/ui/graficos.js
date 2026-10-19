// Gráficos em canvas 2D. As mesmas funções desenham no HUD (canvas HTML) e no painel
// dentro do headset (DynamicTexture). Uma série por gráfico, sem legenda (o título nomeia);
// a comparação entre grandezas usa pequenos múltiplos com eixo de tempo compartilhado,
// nunca dois eixos verticais no mesmo gráfico.
import { ESTADOS, TINTA } from "../config/estados.js";

const FONTE = "Segoe UI, Roboto, system-ui, sans-serif";
const LACUNA_MS = 2500; // intervalo sem leitura acima do qual a linha é interrompida

/** Ajusta o canvas à densidade de pixels da tela e devolve o contexto em pixels CSS. */
export function prepararCanvas(canvas) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  const W = Math.max(1, Math.round(w * dpr));
  const H = Math.max(1, Math.round(h * dpr));
  if (canvas.width !== W || canvas.height !== H) {
    canvas.width = W;
    canvas.height = H;
  }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  return { ctx, w, h };
}

/** Escala vertical: a faixa configurada, ampliada se os dados saírem dela. */
export function escalaPara(pontos, escala) {
  let [min, max] = escala ?? [0, 1];
  for (const p of pontos) {
    if (p.v === null) continue;
    if (p.v < min) min = p.v;
    if (p.v > max) max = p.v;
  }
  if (max - min < 1e-6) max = min + 1;
  return [min, max];
}

function passoBonito(faixa, alvo = 4) {
  const bruto = faixa / alvo;
  const mag = Math.pow(10, Math.floor(Math.log10(bruto)));
  const n = bruto / mag;
  return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * mag;
}

const fmtNum = (v, casas = 0) => v.toLocaleString("pt-BR", { maximumFractionDigits: casas, minimumFractionDigits: 0 });

/**
 * Desenha uma série temporal.
 * o: { pontos, t0, t1, escala, limite, eixos, formatarTempo, cursorT, marcadores, fonte, boia, ultimoPonto }
 * Retorna a geometria (para dica/cursor): { x0, x1, y0, y1, xDe(t), yDe(v), tDe(x) }
 */
export function desenharSerie(ctx, w, h, o) {
  const fonte = o.fonte ?? 11;
  const eixos = !!o.eixos;
  const margem =
    o.margem ??
    (eixos ? { esq: fonte * 3.4, dir: 8, topo: 6, base: fonte * 1.9 } : { esq: 2, dir: o.ultimoPonto === false ? 2 : 6, topo: 4, base: 3 });
  const x0 = margem.esq;
  const x1 = w - margem.dir;
  const y0 = margem.topo;
  const y1 = h - margem.base;
  const [vmin, vmax] = o.boia ? [-0.15, 1.15] : escalaPara(o.pontos, o.escala);
  const xDe = (t) => x0 + ((t - o.t0) / (o.t1 - o.t0)) * (x1 - x0);
  const yDe = (v) => y1 - ((v - vmin) / (vmax - vmin)) * (y1 - y0);
  const tDe = (x) => o.t0 + ((x - x0) / (x1 - x0)) * (o.t1 - o.t0);

  // grade e eixo vertical
  ctx.lineWidth = 1;
  ctx.font = `400 ${fonte}px ${FONTE}`;
  if (eixos) {
    ctx.strokeStyle = TINTA.grade;
    ctx.fillStyle = TINTA.sutil;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    const ticks = o.boia ? [0, 1] : ticksY(vmin, vmax);
    for (const v of ticks) {
      const y = Math.round(yDe(v)) + 0.5;
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.lineTo(x1, y);
      ctx.stroke();
      const rotulo = o.boia ? (v === 1 ? "OK" : "Baixo") : fmtNum(v, Math.abs(vmax - vmin) < 5 ? 1 : 0);
      ctx.fillText(rotulo, x0 - 5, y);
    }
    // eixo do tempo
    ctx.strokeStyle = TINTA.eixo;
    ctx.beginPath();
    ctx.moveTo(x0, Math.round(y1) + 0.5);
    ctx.lineTo(x1, Math.round(y1) + 0.5);
    ctx.stroke();
    if (o.formatarTempo) {
      ctx.fillStyle = TINTA.sutil;
      ctx.textBaseline = "top";
      const n = Math.max(2, Math.min(5, Math.floor((x1 - x0) / (fonte * 6))));
      for (let i = 0; i <= n; i++) {
        const t = o.t0 + ((o.t1 - o.t0) * i) / n;
        ctx.textAlign = i === 0 ? "left" : i === n ? "right" : "center";
        ctx.fillText(o.formatarTempo(t), xDe(t), y1 + 4);
      }
    }
  }

  // limites (linhas de referência finas na cor do estado; o texto fica em tinta neutra)
  if (o.limite && !o.boia) {
    for (const [chave, est] of [["atencao", ESTADOS.atencao], ["alarme", ESTADOS.alarme]]) {
      const v = o.limite[chave];
      if (v === null || v === undefined || v < vmin || v > vmax) continue;
      const y = Math.round(yDe(v)) + 0.5;
      ctx.strokeStyle = est.cor;
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.lineTo(x1, y);
      ctx.stroke();
      ctx.globalAlpha = 1;
      if (eixos) {
        // rótulo à esquerda, sobre um fundo da cor da superfície para não brigar com a linha
        const texto = `${est.texto} ${fmtNum(v, 1)}`;
        const lt = ctx.measureText(texto).width;
        ctx.fillStyle = o.superficie ?? TINTA.superficie;
        ctx.globalAlpha = 0.85;
        ctx.fillRect(x0 + 2, y - fonte - 3, lt + 6, fonte + 2);
        ctx.globalAlpha = 1;
        ctx.fillStyle = TINTA.secundaria;
        ctx.textAlign = "left";
        ctx.textBaseline = "bottom";
        ctx.fillText(texto, x0 + 5, y - 2);
      }
    }
  }

  // marcadores de evento (replay)
  for (const m of o.marcadores ?? []) {
    if (m.t < o.t0 || m.t > o.t1) continue;
    const x = Math.round(xDe(m.t)) + 0.5;
    ctx.strokeStyle = TINTA.secundaria;
    ctx.globalAlpha = 0.6;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(x, y0);
    ctx.lineTo(x, y1);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }

  // série: área (~12 %) + linha de 2 px, interrompida nas lacunas de leitura
  const pts = o.pontos.filter((p) => p.v !== null && p.t >= o.t0 - LACUNA_MS && p.t <= o.t1);
  const trechos = [];
  let atual = [];
  for (let i = 0; i < pts.length; i++) {
    if (i > 0 && pts[i].t - pts[i - 1].t > LACUNA_MS) {
      trechos.push(atual);
      atual = [];
    }
    atual.push(pts[i]);
  }
  if (atual.length) trechos.push(atual);

  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, y0 - 2, x1 - x0, y1 - y0 + 4);
  ctx.clip();
  for (const trecho of trechos) {
    if (trecho.length < 2) continue;
    ctx.beginPath();
    trecho.forEach((p, i) => {
      const x = xDe(Math.max(p.t, o.t0));
      const y = yDe(p.v);
      if (i === 0) ctx.moveTo(x, y);
      else if (o.boia) {
        ctx.lineTo(x, yDe(trecho[i - 1].v));
        ctx.lineTo(x, y);
      } else ctx.lineTo(x, y);
    });
    const ultimo = trecho[trecho.length - 1];
    ctx.lineTo(xDe(ultimo.t), y1);
    ctx.lineTo(xDe(Math.max(trecho[0].t, o.t0)), y1);
    ctx.closePath();
    ctx.fillStyle = TINTA.serieArea;
    ctx.fill();

    ctx.beginPath();
    trecho.forEach((p, i) => {
      const x = xDe(Math.max(p.t, o.t0));
      const y = yDe(p.v);
      if (i === 0) ctx.moveTo(x, y);
      else if (o.boia) {
        ctx.lineTo(x, yDe(trecho[i - 1].v));
        ctx.lineTo(x, y);
      } else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = TINTA.serie;
    ctx.lineWidth = o.espessura ?? 2;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.stroke();
  }
  ctx.restore();

  // ponto final com anel na cor da superfície
  if (o.ultimoPonto !== false && pts.length) {
    const p = pts[pts.length - 1];
    if (p.t >= o.t0) {
      const x = xDe(p.t);
      const y = yDe(p.v);
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fillStyle = TINTA.serie;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = o.superficie ?? TINTA.superficie;
      ctx.stroke();
    }
  }

  // cursor (posição do replay ou da dica)
  if (o.cursorT !== undefined && o.cursorT !== null && o.cursorT >= o.t0 && o.cursorT <= o.t1) {
    const x = Math.round(xDe(o.cursorT)) + 0.5;
    ctx.strokeStyle = TINTA.primaria;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y0);
    ctx.lineTo(x, y1);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  return { x0, x1, y0, y1, xDe, yDe, tDe };
}

function ticksY(min, max) {
  const passo = passoBonito(max - min, 3);
  const ticks = [];
  for (let v = Math.ceil(min / passo) * passo; v <= max + 1e-9; v += passo) ticks.push(Number(v.toFixed(6)));
  return ticks;
}

/**
 * Pequenos múltiplos: uma faixa por grandeza, todas com o mesmo eixo de tempo,
 * para ver quais sinais mudaram juntos.
 * o: { linhas: [{ id, nome, unidade, pontos, escala, limite, boia, valorTexto }], t0, t1, cursorT, formatarTempo, marcadores, fonte }
 */
export function desenharComparacao(ctx, w, h, o) {
  const fonte = o.fonte ?? 11;
  const base = fonte * 1.9;
  const alturaLinha = (h - base) / o.linhas.length;
  const margemEsq = fonte * 3.4;
  let geo = null;
  o.linhas.forEach((linha, i) => {
    const yTopo = i * alturaLinha;
    ctx.save();
    ctx.translate(0, yTopo);
    // título da faixa em tinta neutra
    ctx.fillStyle = TINTA.secundaria;
    ctx.font = `600 ${fonte}px ${FONTE}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(linha.nome, margemEsq, 2);
    if (linha.valorTexto) {
      ctx.textAlign = "right";
      ctx.fillStyle = TINTA.primaria;
      ctx.fillText(linha.valorTexto, w - 8, 2);
    }
    const g = desenharSerie(ctx, w, alturaLinha, {
      pontos: linha.pontos,
      t0: o.t0,
      t1: o.t1,
      escala: linha.escala,
      limite: linha.limite,
      boia: linha.boia,
      eixos: false,
      margem: { esq: margemEsq, dir: 8, topo: fonte * 1.7, base: 4 },
      cursorT: o.cursorT,
      marcadores: o.marcadores,
      ultimoPonto: false,
      espessura: o.espessura ?? 1.6,
    });
    // separador fino entre faixas
    ctx.strokeStyle = TINTA.grade;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(margemEsq, Math.round(alturaLinha) - 0.5);
    ctx.lineTo(w - 8, Math.round(alturaLinha) - 0.5);
    ctx.stroke();
    ctx.restore();
    geo = g;
  });
  // eixo de tempo comum
  if (o.formatarTempo && geo) {
    ctx.fillStyle = TINTA.sutil;
    ctx.font = `400 ${fonte}px ${FONTE}`;
    ctx.textBaseline = "top";
    const n = Math.max(2, Math.min(5, Math.floor(w / (fonte * 7))));
    for (let i = 0; i <= n; i++) {
      const t = o.t0 + ((o.t1 - o.t0) * i) / n;
      ctx.textAlign = i === 0 ? "left" : i === n ? "right" : "center";
      ctx.fillText(o.formatarTempo(t), geo.xDe(t), h - base + 5);
    }
  }
  return { alturaLinha, xDe: geo?.xDe, tDe: geo?.tDe, x0: geo?.x0, x1: geo?.x1 };
}
