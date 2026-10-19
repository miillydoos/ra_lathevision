import {
  Color3,
  DynamicTexture,
  Mesh,
  MeshBuilder,
  StandardMaterial,
  TransformNode,
  Vector3,
} from "@babylonjs/core";
import { GRANDEZAS, formatarValor } from "../config/grandezas.js";
import { ESTADOS } from "../config/estados.js";
import { desenharIcone } from "../util/icones.js";

const LARGURA_ROTULO = 0.34; // m
const ALTURA_ROTULO = 0.117; // m
const TEX_L = 512;
const TEX_A = 176;

/**
 * Pontos instrumentados no modelo: marcador no local do sensor, linha de chamada e
 * rótulo flutuante com valor e estado. Funciona igual na tela e dentro do headset
 * (é geometria da cena, não HTML).
 */
export function criarPontosSensores(scene, { selecao, aoAbrirGrandeza }) {
  const raiz = new TransformNode("pontosSensores", scene);
  const pontos = new Map();

  for (const g of GRANDEZAS) {
    const ponto = criarPonto(scene, g, raiz);
    pontos.set(g.id, ponto);
    const abrir = () => {
      selecao.selecionar(g.componente);
      aoAbrirGrandeza?.(g.id);
    };
    selecao.registrarClicavel(ponto.marcador, abrir, selecao.porId(g.componente));
    selecao.registrarClicavel(ponto.rotulo, abrir, selecao.porId(g.componente));
    ponto.desenhar({ valor: null, estado: "semDados" });
  }

  // Pulso do marcador em alarme. Na tela, os rótulos crescem com a distância para continuarem
  // legíveis na vista geral; no headset ficam no tamanho real (34 cm).
  let t = 0;
  scene.onBeforeRenderObservable.add(() => {
    t += scene.getEngine().getDeltaTime() / 1000;
    const cam = scene.activeCamera;
    const naTela = cam && cam.getClassName() !== "WebXRCamera";
    for (const p of pontos.values()) {
      const s = p.estado === "alarme" ? 1 + 0.35 * Math.abs(Math.sin(t * 4)) : 1;
      p.marcador.scaling.setAll(s);
      const escala = naTela ? Math.min(2, Math.max(1, Vector3.Distance(cam.globalPosition, p.base) / 1.9)) : 1;
      p.aplicarEscala(escala);
    }
  });

  return {
    raiz,
    /** dados: { valor, estado, texto?, nota? } */
    atualizar(id, dados) {
      pontos.get(id)?.desenhar(dados);
    },
    nivelVisor(fracao, cor) {
      pontos.get("oleo")?.visor?.definirNivel(fracao, cor);
    },
    mostrarRotulos(visivel) {
      for (const p of pontos.values()) {
        p.rotulo.setEnabled(visivel);
        p.linha.setEnabled(visivel);
      }
    },
    mover(id, x, y, z) {
      const p = pontos.get(id);
      if (!p) return;
      p.base.set(x, y - ALTURA_ROTULO / 2, z);
      p.aplicarEscala(p.escala, true);
      p.refazerLinha();
    },
  };
}

function criarPonto(scene, g, raiz) {
  const posMarcador = new Vector3(...g.marcador);
  const posRotulo = new Vector3(...g.rotulo);

  // marcador
  const marcador = MeshBuilder.CreateSphere(`marcador_${g.id}`, { diameter: 0.026, segments: 12 }, scene);
  marcador.position.copyFrom(posMarcador);
  marcador.parent = raiz;
  const matMarcador = new StandardMaterial(`matMarcador_${g.id}`, scene);
  matMarcador.disableLighting = true;
  marcador.material = matMarcador;

  // rótulo
  const rotulo = MeshBuilder.CreatePlane(`rotulo_${g.id}`, { width: LARGURA_ROTULO, height: ALTURA_ROTULO }, scene);
  rotulo.position.copyFrom(posRotulo);
  rotulo.parent = raiz;
  rotulo.billboardMode = Mesh.BILLBOARDMODE_ALL;
  rotulo.renderingGroupId = 1; // sempre visível sobre a máquina
  const tex = new DynamicTexture(`texRotulo_${g.id}`, { width: TEX_L, height: TEX_A }, scene, true);
  tex.hasAlpha = true;
  const matRotulo = new StandardMaterial(`matRotulo_${g.id}`, scene);
  matRotulo.diffuseTexture = tex;
  matRotulo.emissiveTexture = tex;
  matRotulo.useAlphaFromDiffuseTexture = true;
  matRotulo.disableLighting = true;
  matRotulo.backFaceCulling = false;
  rotulo.material = matRotulo;

  // linha de chamada: do marcador até a base do rótulo (a base não muda com a escala)
  const base = posRotulo.subtract(new Vector3(0, ALTURA_ROTULO / 2, 0));
  let linha = null;
  const refazerLinha = () => {
    linha?.dispose();
    linha = MeshBuilder.CreateLines(`linha_${g.id}`, { points: [base.clone(), marcador.position.clone()] }, scene);
    linha.color = new Color3(0.85, 0.9, 0.95);
    linha.alpha = 0.85;
    linha.isPickable = false;
    linha.parent = raiz;
    linha.setEnabled(rotulo.isEnabled());
    ponto.linha = linha;
  };

  const ponto = {
    marcador,
    rotulo,
    linha,
    base,
    escala: 1,
    estado: "semDados",
    refazerLinha,
    visor: null,
    desenhar: null,
    aplicarEscala(s, forcar = false) {
      if (!forcar && Math.abs(s - ponto.escala) < 0.01) return;
      ponto.escala = s;
      rotulo.scaling.setAll(s);
      rotulo.position.set(base.x, base.y + (ALTURA_ROTULO * s) / 2, base.z);
    },
  };
  refazerLinha();
  ponto.aplicarEscala(1, true);

  if (g.id === "oleo") ponto.visor = criarVisorOleo(scene, posMarcador, raiz);

  ponto.desenhar = (dados) => {
    const estado = ESTADOS[dados.estado] ?? ESTADOS.semDados;
    ponto.estado = estado.id;
    const cor = Color3.FromHexString(estado.cor);
    matMarcador.emissiveColor = cor;
    matMarcador.diffuseColor = cor;
    desenharRotulo(tex.getContext(), g, dados, estado);
    tex.update();
  };

  return ponto;
}

function desenharRotulo(ctx, g, dados, estado) {
  ctx.clearRect(0, 0, TEX_L, TEX_A);
  const r = 22;
  const borda = 6;
  // fundo
  ctx.beginPath();
  ctx.roundRect(borda / 2, borda / 2, TEX_L - borda, TEX_A - borda, r);
  ctx.fillStyle = "rgba(17,24,33,0.93)";
  ctx.fill();
  ctx.lineWidth = borda;
  ctx.strokeStyle = estado.cor;
  ctx.stroke();

  // cabeçalho
  desenharIcone(ctx, g.icone, 22, 18, 38, "#cfe3f7", 2.2);
  ctx.fillStyle = "#e9eef3";
  ctx.font = "600 29px Segoe UI, Roboto, Arial, sans-serif";
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillText(g.nome, 72, 38);

  // valor
  const texto = dados.texto ?? formatarValor(g, dados.valor);
  ctx.font = "700 62px Segoe UI, Roboto, Arial, sans-serif";
  ctx.fillStyle = estado.id === "semDados" ? "#8f99a3" : "#ffffff"; // valor antigo fica apagado
  ctx.textBaseline = "alphabetic";
  ctx.fillText(texto, 24, 132);
  if (!dados.texto && dados.valor !== null && dados.valor !== undefined) {
    const largura = ctx.measureText(texto).width;
    ctx.font = "500 28px Segoe UI, Roboto, Arial, sans-serif";
    ctx.fillStyle = "#b9c4cf";
    ctx.fillText(g.unidade + (g.sufixo ? " " + g.sufixo : ""), 24 + largura + 8, 132);
  }

  // estado: ícone na cor do estado + texto em tinta neutra (nunca só cor)
  ctx.font = "600 27px Segoe UI, Roboto, Arial, sans-serif";
  ctx.textAlign = "right";
  const larguraEstado = ctx.measureText(estado.texto).width;
  const xTexto = TEX_L - 22;
  ctx.fillStyle = "#e9eef3";
  ctx.fillText(estado.texto, xTexto, 128);
  desenharIcone(ctx, estado.icone, xTexto - larguraEstado - 38, 104, 30, estado.cor, 2.6);

  // nota (idade da leitura, animação ilustrativa…)
  if (dados.nota) {
    ctx.font = "400 21px Segoe UI, Roboto, Arial, sans-serif";
    ctx.fillStyle = "#9fb0c0";
    ctx.textAlign = "right";
    ctx.fillText(dados.nota, xTexto, 160);
  }
}

/** Visor de nível virtual: tubo transparente com o óleo subindo ou descendo. */
function criarVisorOleo(scene, pos, raiz) {
  const altura = 0.1;
  const diametro = 0.026;
  const base = new TransformNode("visorOleo", scene);
  base.parent = raiz;
  // fica saliente na face do cabeçote voltada para a placa (+X)
  base.position.set(pos.x + 0.018, pos.y, pos.z);

  const moldura = MeshBuilder.CreateBox("molduraVisor", { width: 0.012, height: altura + 0.024, depth: diametro + 0.02 }, scene);
  moldura.parent = base;
  moldura.position.x = -0.008;
  const matMoldura = new StandardMaterial("matMolduraVisor", scene);
  matMoldura.diffuseColor = new Color3(0.12, 0.13, 0.15);
  matMoldura.specularColor = new Color3(0.3, 0.3, 0.3);
  moldura.material = matMoldura;

  const tubo = MeshBuilder.CreateCylinder("tuboVisor", { height: altura, diameter: diametro, tessellation: 20 }, scene);
  tubo.parent = base;
  const matTubo = new StandardMaterial("matTuboVisor", scene);
  matTubo.diffuseColor = new Color3(0.8, 0.9, 1);
  matTubo.alpha = 0.22;
  matTubo.specularPower = 64;
  tubo.material = matTubo;

  const oleo = MeshBuilder.CreateCylinder("oleoVisor", { height: 1, diameter: diametro * 0.8, tessellation: 20 }, scene);
  oleo.parent = base;
  const matOleo = new StandardMaterial("matOleoVisor", scene);
  matOleo.diffuseColor = new Color3(0.85, 0.55, 0.08);
  matOleo.emissiveColor = new Color3(0.35, 0.2, 0.02);
  oleo.material = matOleo;

  // marcas de mínimo e máximo
  for (const [nome, frac, cor] of [["min", 0.2, new Color3(0.9, 0.3, 0.3)], ["max", 0.9, new Color3(0.3, 0.8, 0.45)]]) {
    const marca = MeshBuilder.CreateBox(`marca_${nome}`, { width: 0.004, height: 0.0025, depth: diametro + 0.012 }, scene);
    marca.parent = base;
    marca.position.set(0.002, -altura / 2 + altura * frac, 0);
    const m = new StandardMaterial(`matMarca_${nome}`, scene);
    m.emissiveColor = cor;
    m.disableLighting = true;
    marca.material = m;
  }

  for (const m of [moldura, tubo, oleo]) m.isPickable = false;

  function definirNivel(fracao, cor) {
    const f = Math.max(0.001, Math.min(1, fracao ?? 0));
    oleo.scaling.y = altura * f;
    oleo.position.y = -altura / 2 + (altura * f) / 2;
    oleo.setEnabled(fracao !== null && fracao !== undefined);
    if (cor) {
      matOleo.diffuseColor = Color3.FromHexString(cor);
      matOleo.emissiveColor = Color3.FromHexString(cor).scale(0.4);
    }
  }
  definirNivel(null);
  return { definirNivel };
}
