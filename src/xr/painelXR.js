import { Mesh, Vector3 } from "@babylonjs/core";
import { criarPainel3D, quebrarTexto } from "./painel3d.js";
import { GRANDEZAS, GRANDEZA_POR_ID } from "../config/grandezas.js";
import { ESTADOS, TINTA } from "../config/estados.js";
import { desenharIcone } from "../util/icones.js";
import { desenharComparacao, desenharSerie } from "../ui/graficos.js";
import { tempoRelativo, textoIdade, textoValor } from "../ui/sensoresUI.js";

const FONTE = "Segoe UI, Roboto, Arial, sans-serif";

/**
 * Painel que acompanha o aluno dentro do headset (o HUD HTML não aparece em RV/RA):
 * as cinco leituras, o gráfico da grandeza escolhida (ou a comparação), o componente
 * selecionado e os controles. Fica ao lado da área do operador; "Aproximar" traz o
 * painel para perto do rosto para comparar curvas.
 */
export function criarPainelXR(scene, { fluxo, config, aoSair, aoAlternarRotulos, aoSelecionarGrandeza }) {
  const estado = {
    componente: null,
    grandeza: "temperatura",
    comparar: false,
    rotulosVisiveis: true,
    aproximado: false,
    extra: null, // linha de contexto (modo, etapa do ciclo, replay…)
    formatarTempo: null,
    janelaFixa: null,
    serieFixa: null,
    marcadores: [],
    controles: [], // [{ id, rotulo: () => texto, aoClicar, ativo?: () => bool }]
  };

  const painel = criarPainel3D(scene, { nome: "painelXR", largura: 0.8, altura: 0.6, desenhar });
  const malha = painel.malha;
  malha.billboardMode = Mesh.BILLBOARDMODE_Y;
  const posicaoFixa = new Vector3(0.75, 1.32, 1.12);
  malha.position.copyFrom(posicaoFixa);
  malha.setEnabled(false);

  // atualiza 4× por segundo enquanto visível
  const intervalo = setInterval(() => {
    if (malha.isEnabled()) painel.invalidar();
  }, 250);

  function desenhar(ctx, p) {
    const W = p.largura;
    const H = p.altura;
    ctx.beginPath();
    ctx.roundRect(4, 4, W - 8, H - 8, 28);
    ctx.fillStyle = "rgba(15,21,29,0.95)";
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(255,255,255,0.16)";
    ctx.stroke();

    // cabeçalho
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = TINTA.primaria;
    ctx.font = `700 32px ${FONTE}`;
    ctx.fillText("Laboratório do Torno · ROMI T 350", 32, 56);
    const c = fluxo.conexao;
    const tUlt = fluxo.ultimaLeituraGeral();
    const idade = tUlt === null ? null : (fluxo.agora() - tUlt) / 1000;
    ctx.textAlign = "right";
    ctx.font = `500 22px ${FONTE}`;
    ctx.fillStyle = TINTA.secundaria;
    ctx.fillText(`${c.texto ?? ""}${c.estado === "conectado" || c.estado === "simulacao" ? " · " + textoIdade(idade) : ""}`, W - 32, 54);
    if (estado.extra) {
      ctx.font = `400 20px ${FONTE}`;
      ctx.fillStyle = TINTA.sutil;
      ctx.fillText(estado.extra, W - 32, 80);
    }

    // leituras (cada linha escolhe a grandeza do gráfico)
    const x0 = 28;
    const largura = 452;
    GRANDEZAS.forEach((g, i) => {
      const y = 96 + i * 80;
      const e = fluxo.estado(g.id);
      const est = ESTADOS[e.estado];
      const tv = textoValor(config, g.id, e.valor);
      const selecionada = !estado.comparar && estado.grandeza === g.id;
      const hover = p.area(`g_${g.id}`, x0, y, largura, 72, () => {
        estado.grandeza = g.id;
        estado.comparar = false;
        aoSelecionarGrandeza?.(g.id);
        p.invalidar();
      });
      ctx.beginPath();
      ctx.roundRect(x0, y, largura, 72, 12);
      ctx.fillStyle = selecionada ? "rgba(10,95,168,0.55)" : hover ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.05)";
      ctx.fill();
      // faixa de estado à esquerda
      ctx.fillStyle = est.cor;
      ctx.beginPath();
      ctx.roundRect(x0, y, 8, 72, [12, 0, 0, 12]);
      ctx.fill();

      desenharIcone(ctx, g.icone, x0 + 20, y + 20, 32, "#cfe3f7", 2.2);
      ctx.textAlign = "left";
      ctx.fillStyle = TINTA.secundaria;
      ctx.font = `600 20px ${FONTE}`;
      ctx.fillText(g.nome, x0 + 64, y + 28);
      ctx.fillStyle = e.estado === "semDados" ? TINTA.sutil : TINTA.primaria;
      ctx.font = `700 32px ${FONTE}`;
      ctx.fillText(tv.valor, x0 + 64, y + 62);
      const lv = ctx.measureText(tv.valor).width;
      ctx.font = `400 19px ${FONTE}`;
      ctx.fillStyle = TINTA.sutil;
      ctx.fillText(tv.unidade, x0 + 70 + lv, y + 62);
      // estado: ícone colorido + texto neutro
      ctx.textAlign = "right";
      ctx.font = `600 21px ${FONTE}`;
      ctx.fillStyle = TINTA.primaria;
      ctx.fillText(est.texto, x0 + largura - 14, y + 46);
      const lt = ctx.measureText(est.texto).width;
      desenharIcone(ctx, est.icone, x0 + largura - 14 - lt - 32, y + 27, 26, est.cor, 2.6);
    });

    // gráfico à direita
    const gx = 500;
    const gw = W - gx - 28;
    const agora = fluxo.agora();
    const jan = (typeof estado.janelaFixa === "function" ? estado.janelaFixa() : estado.janelaFixa) ?? { t0: agora - config.janelaGraficoS * 1000, t1: agora };
    const fmt = estado.formatarTempo ?? tempoRelativo(agora);
    ctx.save();
    if (estado.comparar) {
      ctx.translate(gx, 96);
      ctx.textAlign = "left";
      ctx.fillStyle = TINTA.primaria;
      ctx.font = `600 22px ${FONTE}`;
      desenharComparacao(ctx, gw, 392, {
        linhas: GRANDEZAS.map((g) => {
          const lim = config.grandezas[g.id];
          return {
            id: g.id,
            nome: g.nome,
            pontos: estado.serieFixa ? estado.serieFixa(g.id, jan.t0, jan.t1) : fluxo.janela(g.id, jan.t0, jan.t1),
            escala: lim?.escala,
            limite: lim,
            boia: g.id === "oleo" && lim?.sensor === "boia",
          };
        }),
        t0: jan.t0,
        t1: jan.t1,
        cursorT: estado.janelaFixa ? agora : null,
        formatarTempo: fmt,
        marcadores: estado.marcadores,
        fonte: 19,
        espessura: 3,
      });
    } else {
      const g = GRANDEZA_POR_ID[estado.grandeza];
      const lim = config.grandezas[g.id];
      ctx.translate(gx, 96);
      ctx.fillStyle = TINTA.primaria;
      ctx.font = `600 24px ${FONTE}`;
      ctx.textAlign = "left";
      ctx.fillText(`${g.nome} (${g.unidade})`, 0, 24);
      ctx.translate(0, 40);
      desenharSerie(ctx, gw, 352, {
        pontos: fluxo.janela(g.id, jan.t0, jan.t1),
        t0: jan.t0,
        t1: jan.t1,
        escala: lim?.escala,
        limite: lim,
        boia: g.id === "oleo" && lim?.sensor === "boia",
        eixos: true,
        fonte: 19,
        espessura: 3.5,
        formatarTempo: fmt,
        marcadores: estado.marcadores,
        cursorT: estado.janelaFixa ? agora : null,
        superficie: "#0f151d",
      });
    }
    ctx.restore();

    // componente selecionado
    const yc = 512;
    ctx.textAlign = "left";
    ctx.fillStyle = TINTA.sutil;
    ctx.font = `600 18px ${FONTE}`;
    ctx.fillText("COMPONENTE", 32, yc + 18);
    const comp = estado.componente;
    if (comp) {
      ctx.fillStyle = TINTA.primaria;
      ctx.font = `700 26px ${FONTE}`;
      ctx.fillText(comp.nome, 32, yc + 50);
      ctx.fillStyle = "#d3dbe3";
      ctx.font = `400 20px ${FONTE}`;
      quebrarTexto(ctx, comp.descricao, W - 64)
        .slice(0, estado.controles.length ? 1 : 2)
        .forEach((linha, i) => ctx.fillText(linha, 32, yc + 80 + i * 26));
    } else {
      ctx.fillStyle = "#d3dbe3";
      ctx.font = `400 21px ${FONTE}`;
      ctx.fillText("Aponte o controle para uma parte do torno e aperte o gatilho para identificá-la.", 32, yc + 50);
    }

    // controles do modo atual (ex.: reprodução no replay)
    if (estado.controles.length) {
      const yx = H - 166;
      const n2 = estado.controles.length;
      const w2 = (W - 56 - 14 * (n2 - 1)) / n2;
      estado.controles.forEach((c, i) =>
        p.botao(ctx, `x_${c.id}`, 28 + i * (w2 + 14), yx, w2, 60, c.rotulo(), {
          ativo: c.ativo?.() ?? false,
          aoClicar: () => {
            c.aoClicar();
            p.invalidar();
          },
        }),
      );
    }

    // botões
    const y = H - 92;
    const h = 64;
    const gap = 14;
    const n = 4;
    const w = (W - 56 - gap * (n - 1)) / n;
    const xb = (i) => 28 + i * (w + gap);
    p.botao(ctx, "comparar", xb(0), y, w, h, estado.comparar ? "Uma grandeza" : "Comparar curvas", {
      ativo: estado.comparar,
      aoClicar: () => {
        estado.comparar = !estado.comparar;
        p.invalidar();
      },
    });
    p.botao(ctx, "rotulos", xb(1), y, w, h, estado.rotulosVisiveis ? "Ocultar rótulos" : "Mostrar rótulos", {
      aoClicar: () => {
        estado.rotulosVisiveis = !estado.rotulosVisiveis;
        aoAlternarRotulos?.(estado.rotulosVisiveis);
        p.invalidar();
      },
    });
    p.botao(ctx, "aproximar", xb(2), y, w, h, estado.aproximado ? "Afastar painel" : "Aproximar painel", {
      ativo: estado.aproximado,
      aoClicar: () => alternarAproximado(),
    });
    p.botao(ctx, "sair", xb(3), y, w, h, "Sair", { aoClicar: () => aoSair?.() });
  }

  function alternarAproximado() {
    estado.aproximado = !estado.aproximado;
    const cam = scene.activeCamera;
    if (estado.aproximado && cam) {
      // 60 cm à frente do rosto, um pouco abaixo da linha dos olhos
      const frente = cam.getDirection(Vector3.Forward(scene.useRightHandedSystem));
      frente.y = 0;
      frente.normalize();
      malha.position.copyFrom(cam.globalPosition.add(frente.scale(0.6)));
      malha.position.y = cam.globalPosition.y - 0.12;
    } else {
      malha.position.copyFrom(posicaoFixa);
    }
    painel.invalidar();
  }

  return {
    painel,
    estado,
    mostrar(visivel) {
      malha.setEnabled(visivel);
      if (!visivel && estado.aproximado) alternarAproximado();
      painel.invalidar();
    },
    definirComponente(c) {
      estado.componente = c;
      painel.invalidar();
    },
    definirGrandeza(id) {
      if (!id) return;
      estado.grandeza = id;
      estado.comparar = false;
      painel.invalidar();
    },
    definirRotulos(visivel) {
      estado.rotulosVisiveis = visivel;
      painel.invalidar();
    },
    definirExtra(texto) {
      estado.extra = texto;
    },
    definirContextoTempo({ formatar = null, janela = null, serie = null } = {}) {
      estado.formatarTempo = formatar;
      estado.janelaFixa = janela;
      estado.serieFixa = serie;
    },
    definirControles(lista) {
      estado.controles = lista ?? [];
      painel.invalidar();
    },
    definirMarcadores(lista) {
      estado.marcadores = lista ?? [];
    },
    destruir: () => clearInterval(intervalo),
  };
}
