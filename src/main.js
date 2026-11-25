import "./style.css";
import { CONFIG_CENA, criarCena } from "./cena/cena.js";
import { carregarModelo, prepararMalhas } from "./cena/modelo.js";
import { criarSelecao } from "./cena/selecao.js";
import { criarAnimacaoPlaca } from "./cena/placa.js";
import { criarSala } from "./cena/sala.js";
import { criarCompartimentos, removerReservatorioQuadrado, separarTampas } from "./cena/compartimentos.js";
import { criarCaixaMonitoramento } from "./cena/caixaMonitoramento.js";
import { criarVitrineSensor } from "./cena/vitrineSensor.js";
import { sincronizarCena } from "./cena/sincronizarCena.js";
import { iniciarXR } from "./xr/xr.js";
import { abrirQuickLook, raDoAparelho, urlModelo } from "./xr/raNativa.js";
import { criarRACamera, suportaCamera } from "./xr/raCamera.js";
import { criarAndar } from "./cena/andar.js";
import { svgIcone } from "./util/icones.js";
import { criarPainelXR } from "./xr/painelXR.js";
import { carregarConfiguracao } from "./config/configuracao.js";
import { GRANDEZA_POR_ID } from "./config/grandezas.js";
import { criarFluxo } from "./dados/fluxo.js";
import { criarFonteSimulada } from "./fontes/fonteSimulada.js";
import { criarComponentesUI } from "./ui/componentesUI.js";
import { criarSensoresUI } from "./ui/sensoresUI.js";
import { criarConexaoUI } from "./ui/conexaoUI.js";
import { criarFonteAoVivo } from "./fontes/fonteAoVivo.js";
import { tipoConexao } from "./config/configuracao.js";
import { criarModos } from "./modos.js";
import { criarPainelSimulacao } from "./ui/painelSimulacao.js";
import { criarPainelAoVivo } from "./ui/painelAoVivo.js";
import { criarConfiguracoesUI } from "./ui/configuracoesUI.js";
import { criarLayoutPaineis } from "./ui/layoutPaineis.js";
import { criarTour360 } from "./ui/tour360.js";
import { criarHistorico } from "./dados/historico.js";
import { criarHistoricoUI } from "./ui/historicoUI.js";
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

  removerReservatorioQuadrado(modelo); // e a mangueira; o reservatório cilíndrico com o sensor ultrassônico fica abaixo da polia
  const tampas = separarTampas(modelo); // painel elétrico e tampa lateral não se fundem com o corpo
  const selecao = criarSelecao(scene, modelo);
  prepararMalhas(modelo, selecao.malhas, sombras);
  const placa = criarAnimacaoPlaca(scene, modelo.no("Placa_rotativa"));

  // ---------- dados
  const fluxo = criarFluxo(config);
  // histórico do monitoramento (eventos e estatísticas guardados no navegador); antes de qualquer fonte começar
  const historico = criarHistorico({ fluxo, config });

  // abrir uma grandeza: cartão no HUD, gráfico no painel de RV e o sensor dela na frente da tela
  let sensoresUI = null;
  let painelXR = null;
  let mostrarMedicoes = null; // definido pelo layout dos painéis
  let mostrarSensor = null; // definido depois dos compartimentos e da caixa de monitoramento
  let andar = null; // modo Andar (primeira pessoa); a vista de perto dos sensores é da câmera orbital
  const abrirGrandeza = (id, { focarCamera = true } = {}) => {
    mostrarMedicoes?.();
    sensoresUI?.abrir(id);
    painelXR?.definirGrandeza(id);
    if (focarCamera && GRANDEZA_POR_ID[id]) mostrarSensor?.(id);
  };

  criarComponentesUI({ selecao, focar, aoAbrirGrandeza: (id) => abrirGrandeza(id) });
  sensoresUI = criarSensoresUI({ fluxo, config, aoSelecionarGrandeza: (id) => id && painelXR?.definirGrandeza(id) });
  criarConexaoUI({ fluxo });
  sincronizarCena({ fluxo, placa });
  // botão Sensores: abre o painel elétrico (corrente) e a tampa da caixa de engrenagens (demais sensores);
  // clicar num sensor ou no balão dele traz o sensor para a frente da tela
  const compartimentos = criarCompartimentos({
    scene,
    camera,
    selecao,
    tampas,
    fluxo,
    config,
    focar,
    aoClicarSensor: (id) => mostrarSensor?.(id),
    placa, // a roda do sensor de velocidade gira com o eixo-árvore
  });
  // caixa do sistema de monitoramento no tampo do cabeçote: clicar traz para a frente da tela, aberta
  const caixa = criarCaixaMonitoramento({ scene, camera, selecao, fluxo, config });
  // vista de perto: o sensor vem para a frente da tela, com os dados da medição ao lado (o de vibração,
  // MPU-6050, vem com a caixa de monitoramento; os outros, sozinhos, de dentro dos compartimentos)
  const vitrine = criarVitrineSensor({ scene, camera, selecao, fluxo, config });
  mostrarSensor = (id) => {
    andar?.sair();
    painelXR?.definirGrandeza(id);
    if (caixa.sensores.includes(id)) {
      vitrine.fechar({ imediato: true });
      return caixa.abrir();
    }
    const peca = compartimentos.pecaDoSensor(id);
    if (!peca) return;
    caixa.fechar({ imediato: true });
    vitrine.mostrar(peca);
  };

  // ---------- RV / RA
  const xr = await iniciarXR(scene, { piso, ceu, posicaoOperador: CONFIG_CENA.posicaoOperador });
  painelXR = criarPainelXR(scene, {
    fluxo,
    config,
    aoSair: () => xr.sair(),
    aoAlternarRotulos: (v) => {
      compartimentos.mostrarEtiquetas(v);
      caixa.mostrarEtiqueta(v);
    },
    aoSelecionarGrandeza: (id) => sensoresUI.abrir(id),
  });
  selecao.on("selecao", (c) => painelXR.definirComponente(c));
  xr.on("estado", (emXR) => painelXR.mostrar(emXR || parametros.has("painelxr")));
  // em RA o ambiente real substitui a sala (como já acontece com piso e céu)
  xr.on("estado", (emXR, modo) => sala.mostrar(modo !== "immersive-ar"));
  if (parametros.has("painelxr")) painelXR.mostrar(true);

  const btnVR = document.getElementById("btn-vr");
  btnVR.hidden = !xr.suportaVR;
  btnVR.addEventListener("click", () => xr.entrar("immersive-vr"));

  // ---------- Andar pelo laboratório (computador e celular): câmera em primeira pessoa com colisão
  const btnAndar = document.getElementById("btn-andar");
  btnAndar.insertAdjacentHTML("afterbegin", svgIcone("andar"));
  andar = criarAndar(scene, camera, canvas, {
    limite: CONFIG_CENA.tamanhoPiso / 2,
    posicaoInicial: CONFIG_CENA.posicaoOperador,
    aoMudar: (ligado) => btnAndar.setAttribute("aria-pressed", String(ligado)),
  });
  btnAndar.addEventListener("click", () => andar.alternar());
  xr.on("estado", (emXR) => emXR && andar.sair());

  // ---------- RA: WebXR onde existe (Android com ARCore, Quest); no iPhone/iPad, o AR Quick Look quando há
  // models/torno.usdz; nos outros celulares (e no iPhone sem o .usdz), a câmera do aparelho por trás do torno
  const btnAR = document.getElementById("btn-ar");
  btnAR.insertAdjacentHTML("afterbegin", svgIcone("ra"));
  const raCamera = criarRACamera({
    scene,
    camera,
    sala,
    piso,
    ceu,
    aoMudar: (ligado) => btnAR.setAttribute("aria-pressed", String(ligado)),
  });
  const tocavel = matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0;
  let tipoRA = xr.suportaAR ? "webxr" : tocavel && suportaCamera() ? "camera" : null;
  const atualizarBotaoRA = () => {
    btnAR.hidden = !tipoRA;
    btnAR.title =
      tipoRA === "quicklook"
        ? "Abre a câmera com o torno em tamanho real, apoiado no chão (AR Quick Look)"
        : tipoRA === "camera"
          ? "Abre a câmera do aparelho com o torno 3D e as medições por cima"
          : "Realidade aumentada: o torno em tamanho real no seu ambiente";
  };
  atualizarBotaoRA();
  if (!xr.suportaAR && raDoAparelho(false) === "quicklook") {
    fetch(urlModelo("torno.usdz"), { method: "HEAD" })
      .then((r) => {
        if (!r.ok) return;
        tipoRA = "quicklook";
        atualizarBotaoRA();
      })
      .catch(() => {});
  }
  btnAR.addEventListener("click", () => {
    andar.sair();
    if (tipoRA === "quicklook") abrirQuickLook(urlModelo("torno.usdz")); // dentro do toque, senão o iOS ignora
    else if (tipoRA === "camera") raCamera.ativo ? raCamera.sair() : raCamera.entrar();
    else xr.entrar("immersive-ar");
  });

  // ---------- modos e fontes de dados
  const modos = criarModos({ fluxo, sensoresUI, painelXR });

  const aoVivo = criarFonteAoVivo({ config });
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
    dica: "Acompanha o torno real pelos sensores (ESP32 → WebSocket pelo IP, ou broker MQTT)",
    fonte: aoVivo,
    painel: painelAoVivo.el,
    info: () =>
      tipoConexao(config) === "mqtt"
        ? `Torno real · ${config.mqtt?.topicoBase ?? ""}`
        : `Torno real · ESP32 ${config.websocket?.ip || "(sem IP)"}`,
  });

  const simulacao = criarFonteSimulada({ config });
  const painelSimulacao = criarPainelSimulacao({
    simulacao,
    aoMudar: () => modos.atualizarInfo(),
    // a situação aplicada entra no histórico do monitoramento
    aoAplicarCenario: (c) => {
      const texto = c ? `Situação aplicada: ${c.nome}` : "Situação removida";
      historico.anotar(texto, "situacao");
    },
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

  // relatório e histórico do monitoramento: aba "Histórico" ao lado de Ao vivo e Simulação.
  // (O modo Replay e a aba Controles foram retirados: os painéis dos modos ficam no #rodape, escondido.)
  // Não troca a fonte: o modo em uso continua rodando por trás e o histórico segue registrando.
  const historicoUI = criarHistoricoUI({ historico, config, aoFechar: () => modos.fecharAba() });
  modos.registrarAba({
    id: "historico",
    nome: "Histórico",
    dica: "Relatório e histórico do monitoramento: alarmes, atenções, tempo em cada estado e eventos (o modo atual continua rodando)",
    abrir: () => historicoUI.abrir(),
    fechar: () => historicoUI.fechar(),
  });

  const modoInicial = parametros.get("modo") ?? "simulacao";
  await modos.ativar(modoInicial === "historico" ? "simulacao" : modoInicial);
  if (!modos.atual) await modos.ativar("simulacao"); // ?modo= com um modo que não existe (ex.: o antigo desafio)

  // painéis recolhíveis com doca de abas, no desktop e no celular (só interface)
  const layout = criarLayoutPaineis({
    camera,
    scene,
    vistas: [{ el: historicoUI.el, fechar: () => modos.fecharAba() }],
  });
  mostrarMedicoes = () => {
    modos.fecharAba(); // tocar num rótulo 3D / cartão leva de volta ao torno
    layout.mostrar("medicoes");
  };

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
  xr.on("estado", (emXR) => emXR && modos.fecharAba());
  // a aba Histórico cobre a área do torno: abrir ela encerra o que mexe na vista; Sensores e 360° voltam ao torno
  modos.on("aba", (id) => {
    if (!id) return;
    tour.fechar();
    vitrine.fechar({ imediato: true });
    caixa.fechar({ imediato: true });
  });
  document.getElementById("btn-tour").addEventListener("click", () => {
    modos.fecharAba();
    andar.sair(); // a apresentação 360° usa a câmera orbital
    raCamera.sair();
  });
  // Andar e RA pela câmera também mexem na vista: fecham a apresentação, a aba Histórico e a vista de perto
  const limparVista = () => {
    tour.fechar();
    modos.fecharAba();
    vitrine.fechar({ imediato: true });
    caixa.fechar({ imediato: true });
  };
  btnAndar.addEventListener("click", () => {
    if (!andar.ativo) return;
    limparVista();
    raCamera.sair();
  });
  btnAR.addEventListener("click", limparVista);
  compartimentos.on("estado", (aberto) => aberto && andar.sair());
  caixa.on("estado", (aberta) => aberta && andar.sair());
  modos.on("aba", (id) => id && raCamera.sair());
  compartimentos.on("estado", (aberto) => aberto && modos.fecharAba());
  caixa.on("estado", (aberta) => aberta && modos.fecharAba());
  xr.on("estado", () => caixa.fechar({ imediato: true })); // volta ao torno ao entrar ou sair do headset
  compartimentos.on("estado", (aberto) => aberto && tour.pararGiro()); // o giro 360° tiraria a câmera das tampas
  caixa.on("estado", (aberta) => aberta && tour.pararGiro());

  // Compila os shaders antes de revelar a cena (evita peças surgindo aos poucos).
  await scene.whenReadyAsync();
  concluirCarregamento();
  if (parametros.has("tour")) tour.abrir();
  if (parametros.has("historico") || parametros.get("modo") === "historico") modos.abrirAba("historico");

  // parâmetros de teste: ?selecionar=cabecote&grandeza=vibracao&vista=comparar&camera=...&painelxr&caixa&sensores
  if (parametros.has("selecionar")) selecao.selecionar(parametros.get("selecionar"));
  if (parametros.has("caixa")) caixa.abrir();
  if (parametros.has("sensores")) compartimentos.abrir({ focarCamera: false });
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
    xr,
    fluxo,
    config,
    simulacao,
    modos,
    painelSimulacao,
    historico,
    historicoUI,
    layout,
    sala,
    andar,
    raCamera,
    tour,
    compartimentos,
    caixa,
    vitrine,
    mostrarSensor,
    vistaInicial,
  });
  window.__pronto = true;
}

iniciar().catch((erro) => {
  console.error(erro);
  erroCarregamento(erro?.message ?? String(erro));
});
