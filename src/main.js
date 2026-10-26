import "./style.css";
import { Vector3 } from "@babylonjs/core";
import { CONFIG_CENA, criarCena } from "./cena/cena.js";
import { carregarModelo, prepararMalhas } from "./cena/modelo.js";
import { criarSelecao } from "./cena/selecao.js";
import { criarPontosSensores } from "./cena/pontosSensores.js";
import { criarAnimacaoPlaca } from "./cena/placa.js";
import { criarSala } from "./cena/sala.js";
import { criarCompartimentos, separarTampas } from "./cena/compartimentos.js";
import { sincronizarCena } from "./cena/sincronizarCena.js";
import { iniciarXR } from "./xr/xr.js";
import { criarPainelXR } from "./xr/painelXR.js";
import { carregarConfiguracao } from "./config/configuracao.js";
import { GRANDEZA_POR_ID } from "./config/grandezas.js";
import { criarFluxo } from "./dados/fluxo.js";
import { criarFonteSimulada } from "./fontes/fonteSimulada.js";
import { criarComponentesUI } from "./ui/componentesUI.js";
import { criarSensoresUI } from "./ui/sensoresUI.js";
import { criarConexaoUI } from "./ui/conexaoUI.js";
import { criarFonteMQTT } from "./fontes/fonteMQTT.js";
import { criarModos } from "./modos.js";
import { criarPainelSimulacao } from "./ui/painelSimulacao.js";
import { criarPainelAoVivo } from "./ui/painelAoVivo.js";
import { criarConfiguracoesUI } from "./ui/configuracoesUI.js";
import { criarGravador } from "./dados/gravador.js";
import { criarFonteReplay } from "./fontes/fonteReplay.js";
import { criarPainelReplay } from "./ui/painelReplay.js";
import { criarGravacaoUI } from "./ui/gravacaoUI.js";
import { criarPainelDesafio } from "./ui/painelDesafio.js";
import { criarLayoutPaineis } from "./ui/layoutPaineis.js";
import { criarTour360 } from "./ui/tour360.js";
import { concluirCarregamento, erroCarregamento, progressoCarregamento } from "./ui/carregamento.js";

const parametros = new URLSearchParams(location.search);

async function iniciar() {
  const canvas = document.getElementById("cena");
  const { scene, camera, sombras, piso, ceu, sol, focar, vistaInicial } = criarCena(canvas);
  window.lab = { scene };

  // laboratório ao redor do torno (ambiente 360°): só cenário, sem luzes próprias nem peças clicáveis
  const sala = criarSala(scene, { tamanho: CONFIG_CENA.tamanhoPiso, luzesExcluidas: [sol] });

  const [config, modelo] = await Promise.all([
    carregarConfiguracao(),
    carregarModelo(scene, { url: "./models/torno.glb", aoProgresso: progressoCarregamento }),
  ]);

  const tampas = separarTampas(modelo); // painel elétrico e tampa lateral não se fundem com o corpo
  const selecao = criarSelecao(scene, modelo);
  prepararMalhas(modelo, selecao.malhas, sombras);
  const placa = criarAnimacaoPlaca(scene, modelo.no("Placa_rotativa"));

  // ---------- dados
  const fluxo = criarFluxo(config);

  // abrir uma grandeza: cartão no HUD, gráfico no painel de RV e câmera no ponto medido
  let sensoresUI = null;
  let painelXR = null;
  let mostrarMedicoes = null; // definido pelo layout dos painéis
  const abrirGrandeza = (id, { focarCamera = true } = {}) => {
    mostrarMedicoes?.();
    sensoresUI?.abrir(id);
    painelXR?.definirGrandeza(id);
    const g = GRANDEZA_POR_ID[id];
    if (focarCamera && g) focar(new Vector3(...g.marcador), 1.6);
  };

  const pontos = criarPontosSensores(scene, { selecao, aoAbrirGrandeza: (id) => abrirGrandeza(id, { focarCamera: false }) });
  criarComponentesUI({ selecao, focar, aoAbrirGrandeza: (id) => abrirGrandeza(id) });
  sensoresUI = criarSensoresUI({ fluxo, config, aoSelecionarGrandeza: (id) => id && painelXR?.definirGrandeza(id) });
  criarConexaoUI({ fluxo });
  sincronizarCena({ fluxo, config, pontos, placa });
  // botão Sensores: abre o painel elétrico (corrente) e a tampa da caixa de engrenagens (demais sensores)
  const compartimentos = criarCompartimentos({
    scene,
    camera,
    selecao,
    tampas,
    fluxo,
    config,
    focar,
    aoAbrirGrandeza: (id) => abrirGrandeza(id, { focarCamera: false }),
  });

  // ---------- RV / RA
  const xr = await iniciarXR(scene, { piso, ceu, posicaoOperador: CONFIG_CENA.posicaoOperador });
  painelXR = criarPainelXR(scene, {
    fluxo,
    config,
    aoSair: () => xr.sair(),
    aoAlternarRotulos: (v) => pontos.mostrarRotulos(v),
    aoSelecionarGrandeza: (id) => sensoresUI.abrir(id),
  });
  selecao.on("selecao", (c) => painelXR.definirComponente(c));
  xr.on("estado", (emXR) => painelXR.mostrar(emXR || parametros.has("painelxr")));
  // em RA o ambiente real substitui a sala (como já acontece com piso e céu)
  xr.on("estado", (emXR, modo) => sala.mostrar(modo !== "immersive-ar"));
  if (parametros.has("painelxr")) painelXR.mostrar(true);

  const btnVR = document.getElementById("btn-vr");
  const btnAR = document.getElementById("btn-ar");
  btnVR.hidden = !xr.suportaVR;
  btnAR.hidden = !xr.suportaAR;
  btnVR.addEventListener("click", () => xr.entrar("immersive-vr"));
  btnAR.addEventListener("click", () => xr.entrar("immersive-ar"));

  // ---------- modos e fontes de dados
  const modos = criarModos({ fluxo, sensoresUI, painelXR });

  const aoVivo = criarFonteMQTT({ config });
  const configuracoes = criarConfiguracoesUI({
    config,
    aoSalvar: () => {
      sensoresUI.atualizarLimites();
      painelAoVivo.atualizar();
      if (modos.atual === "aoVivo") modos.ativar("aoVivo", { forcar: true });
    },
  });
  const painelAoVivo = criarPainelAoVivo({
    config,
    fluxo,
    aoConfigurar: () => configuracoes.abrir(),
    aoReconectar: () => modos.ativar("aoVivo", { forcar: true }),
  });
  modos.registrar({
    id: "aoVivo",
    nome: "Ao vivo",
    dica: "Acompanha o torno real pelos sensores (ESP32 → MQTT)",
    fonte: aoVivo,
    painel: painelAoVivo.el,
    info: () => `Torno real · ${config.mqtt?.topicoBase ?? ""}`,
  });

  const gravador = criarGravador({ fluxo, config });
  const simulacao = criarFonteSimulada({ config });
  const painelSimulacao = criarPainelSimulacao({
    simulacao,
    aoMudar: () => modos.atualizarInfo(),
    // a situação aplicada entra na linha do tempo da gravação
    aoAplicarCenario: (c) => gravador.anotar(c ? `Situação aplicada: ${c.nome}` : "Situação removida"),
  });
  modos.registrar({
    id: "simulacao",
    nome: "Simulação",
    dica: "Funciona sem sensores; o professor controla a operação e as situações",
    fonte: simulacao,
    painel: painelSimulacao.el,
    info: () => {
      const etapa = simulacao.etapa?.rotulo ?? "";
      const c = painelSimulacao.cenarioAtivo;
      const situacao = c ? `situação: ${c.nome}` : "sem falhas inseridas";
      return `Simulação · ${etapa} · ${situacao}`;
    },
  });

  const replay = criarFonteReplay();
  const painelReplay = criarPainelReplay({ replay, sensoresUI, painelXR });
  modos.registrar({
    id: "replay",
    nome: "Replay",
    dica: "Reproduz uma sessão gravada: pausar, voltar, marcar instantes e comparar curvas",
    fonte: replay,
    painel: painelReplay.el,
    aoEntrar: () => painelReplay.aoEntrar(),
    aoSair: () => painelReplay.aoSair(),
    info: () => painelReplay.info(),
  });

  const painelDesafio = criarPainelDesafio({ simulacao, fluxo, config, sensoresUI, painelXR });
  modos.registrar({
    id: "desafio",
    nome: "Desafio",
    dica: "O professor aplica uma situação oculta; a turma coleta evidências e propõe a inspeção",
    fonte: simulacao,
    painel: painelDesafio.el,
    aoEntrar: () => painelDesafio.aoEntrar(),
    aoSair: () => painelDesafio.aoSair(painelSimulacao.cenarioAtivo),
    info: () => painelDesafio.info(),
  });

  // gravação nos modos Ao vivo e Simulação
  const abrirNoReplay = async (sessao) => {
    await modos.ativar("replay");
    await painelReplay.abrirSessao(sessao);
  };
  painelAoVivo.slotGravacao.appendChild(criarGravacaoUI({ gravador, origem: () => "aoVivo", aoAbrirReplay: abrirNoReplay }).el);
  painelSimulacao.el
    .querySelector(".corpo-modo")
    .appendChild(criarGravacaoUI({ gravador, origem: () => "simulacao", aoAbrirReplay: abrirNoReplay }).el);

  await modos.ativar(parametros.get("modo") ?? "simulacao");

  // painéis recolhíveis com doca de abas, no desktop e no celular (só interface)
  const layout = criarLayoutPaineis({ camera, scene });
  mostrarMedicoes = () => layout.mostrar("medicoes");

  // apresentação 360° (botão no topo; ?tour abre direto). Abrir uma medição pelo cartão sai da apresentação.
  const tour = criarTour360({
    scene,
    camera,
    focar,
    selecao,
    layout,
    aoAbrirGrandeza: (id) => abrirGrandeza(id),
    aoMostrarSensores: () => compartimentos.abrir(),
  });
  xr.on("estado", (emXR) => emXR && tour.fechar());
  compartimentos.on("estado", (aberto) => aberto && tour.pararGiro()); // o giro 360° tiraria a câmera das tampas

  // Compila os shaders antes de revelar a cena (evita peças surgindo aos poucos).
  await scene.whenReadyAsync();
  concluirCarregamento();
  if (parametros.has("tour")) tour.abrir();

  // parâmetros de teste: ?selecionar=cabecote&grandeza=temperatura&vista=comparar&camera=...&painelxr
  if (parametros.has("selecionar")) selecao.selecionar(parametros.get("selecionar"));
  if (parametros.has("grandeza")) abrirGrandeza(parametros.get("grandeza"), { focarCamera: false });
  if (parametros.has("vista")) sensoresUI.definirVista(parametros.get("vista"));
  if (parametros.has("camera")) {
    // ?camera=alfa,beta,raio,alvoX,alvoY,alvoZ (ângulos em graus)
    const [a, b, r, x, y, z] = parametros.get("camera").split(",").map(Number);
    camera.alpha = (a * Math.PI) / 180;
    camera.beta = (b * Math.PI) / 180;
    camera.radius = r;
    if (Number.isFinite(x)) camera.target.set(x, y, z);
  }

  // ---------- auxiliares de console para ajustes finos sem recompilar
  Object.assign(window.lab, {
    camera,
    modelo,
    selecao,
    placa,
    pontos,
    xr,
    fluxo,
    config,
    simulacao,
    modos,
    painelSimulacao,
    gravador,
    replay,
    painelReplay,
    painelDesafio,
    layout,
    sala,
    tour,
    compartimentos,
    vistaInicial,
    moverRotulo: (id, x, y, z) => pontos.mover(id, x, y, z),
  });
  window.__pronto = true;
}

iniciar().catch((erro) => {
  console.error(erro);
  erroCarregamento(erro?.message ?? String(erro));
});
