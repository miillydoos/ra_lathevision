// Desafios de diagnóstico. O professor escolhe (ou sorteia) a situação, que fica oculta;
// a turma acompanha os sinais, registra evidências, formula uma hipótese e propõe a inspeção.
// A avaliação pesa evidências e inspeção mais do que "acertar a causa": uma combinação de
// sinais é compatível com uma hipótese, mas não a prova.

export const HIPOTESES = [
  { id: "lubrificacao", texto: "Deficiência de lubrificação ou atrito interno no cabeçote" },
  { id: "vazamento", texto: "Perda de óleo (vazamento) no reservatório do cabeçote" },
  { id: "desbalanceamento", texto: "Desbalanceamento no conjunto girante (placa, peça ou fixação)" },
  { id: "rolamento", texto: "Desgaste de rolamento do eixo-árvore" },
  { id: "sobrecargaCorte", texto: "Parâmetros de corte excessivos (sobrecarga de usinagem)" },
  { id: "falhaSensor", texto: "Falha ou mau contato de um sensor" },
];

export const EVIDENCIAS = [
  { id: "tempSobe", texto: "A temperatura subiu acima do habitual para a mesma operação" },
  { id: "tempSobeDepois", texto: "A temperatura só começou a subir depois que outro sinal mudou" },
  { id: "oleoCai", texto: "O nível de óleo caiu ao longo da operação" },
  { id: "oleoEstavel", texto: "O nível de óleo permaneceu estável" },
  { id: "vibSobe", texto: "A vibração aumentou, mais nas rotações altas" },
  { id: "vibEstavel", texto: "A vibração permaneceu na faixa habitual" },
  { id: "correnteOscila", texto: "A corrente passou a oscilar de forma periódica" },
  { id: "correnteSobe", texto: "A corrente ficou um pouco maior nas mesmas etapas do ciclo" },
  { id: "rotacaoInstavel", texto: "A rotação ficou instável ou fora do valor programado" },
  { id: "semDados", texto: "Um sensor parou de enviar dados" },
];

export const INSPECOES = [
  { id: "nivelVazamento", texto: "Verificar o nível pelo visor e procurar vazamentos (retentores, juntas, bujão de dreno)" },
  { id: "lubrificacao", texto: "Verificar a lubrificação do cabeçote (óleo especificado, contaminação, circulação)" },
  { id: "rolamentos", texto: "Inspecionar os rolamentos do eixo-árvore (folga, ruído, aquecimento localizado)" },
  { id: "balanceamento", texto: "Verificar fixação e balanceamento da peça, das castanhas e da placa" },
  { id: "fixacaoSensor", texto: "Conferir a fixação e o cabo do sensor antes de concluir" },
  { id: "termometro", texto: "Confirmar a temperatura com um termômetro de referência" },
  { id: "correia", texto: "Verificar tensão e estado da correia multi-V" },
  { id: "trocarMotor", texto: "Substituir o motor principal imediatamente" },
  { id: "aumentarRotacao", texto: "Aumentar a rotação para compensar e continuar produzindo" },
];

export const GRANDEZAS_PRIMEIRO_SINAL = ["temperatura", "oleo", "corrente", "vibracao", "rotacao"];

const CONTEXTO_PADRAO =
  "Produção de eixos de aço SAE 1045: desbaste a 800 rpm e acabamento a 1.250 rpm, ferramenta de metal duro. Em algum momento uma condição anormal começa.";

export const DESAFIOS = [
  {
    id: "A",
    codinome: "Desafio A",
    situacao: "aquecimento",
    nomeProfessor: "Aquecimento do cabeçote",
    contexto: CONTEXTO_PADRAO,
    hipoteseCorreta: "lubrificacao",
    hipotesesAceitaveis: ["rolamento"],
    primeiroSinal: ["temperatura", "corrente"],
    evidenciasEssenciais: ["tempSobe", "correnteSobe"],
    evidenciasCompativeis: ["oleoEstavel", "vibEstavel"],
    evidenciasContraditorias: ["oleoCai", "vibSobe", "correnteOscila", "rotacaoInstavel", "semDados", "tempSobeDepois"],
    inspecoesEsperadas: ["lubrificacao", "rolamentos", "termometro"],
    explicacao:
      "Foi inserido atrito crescente no cabeçote, como em lubrificação deficiente ou rolamento com pré-carga excessiva. A temperatura subiu acima do habitual para o mesmo ciclo e a corrente aumentou um pouco, enquanto nível de óleo e vibração ficaram estáveis. Esses sinais são compatíveis com atrito interno, mas não provam a causa: a confirmação vem da inspeção da lubrificação e dos rolamentos, e a leitura pontual deve ser conferida com um termômetro de referência.",
  },
  {
    id: "B",
    codinome: "Desafio B",
    situacao: "oleoBaixo",
    nomeProfessor: "Nível baixo de óleo",
    contexto: CONTEXTO_PADRAO,
    hipoteseCorreta: "vazamento",
    hipotesesAceitaveis: ["lubrificacao"],
    primeiroSinal: ["oleo"],
    evidenciasEssenciais: ["oleoCai", "tempSobeDepois"],
    evidenciasCompativeis: ["tempSobe", "vibEstavel", "correnteSobe"],
    evidenciasContraditorias: ["oleoEstavel", "vibSobe", "correnteOscila", "rotacaoInstavel", "semDados"],
    inspecoesEsperadas: ["nivelVazamento", "lubrificacao"],
    explicacao:
      "Foi inserido um vazamento lento no reservatório do cabeçote. O nível caiu primeiro; quando ficou baixo, a lubrificação piorou e a temperatura começou a subir depois. A sequência (óleo antes, temperatura depois) é a evidência principal. A confirmação vem da verificação do visor e da procura do ponto de vazamento; reabastecer sem achar a causa só adia o problema.",
  },
  {
    id: "C",
    codinome: "Desafio C",
    situacao: "vibracao",
    nomeProfessor: "Vibração elevada",
    contexto: CONTEXTO_PADRAO,
    hipoteseCorreta: "desbalanceamento",
    hipotesesAceitaveis: ["rolamento"],
    primeiroSinal: ["vibracao"],
    evidenciasEssenciais: ["vibSobe", "correnteOscila"],
    evidenciasCompativeis: ["tempSobeDepois", "tempSobe", "oleoEstavel"],
    evidenciasContraditorias: ["oleoCai", "vibEstavel", "rotacaoInstavel", "semDados"],
    inspecoesEsperadas: ["balanceamento", "rolamentos", "fixacaoSensor"],
    explicacao:
      "Foi inserido um desbalanceamento crescente no conjunto girante. A vibração aumentou (mais nas rotações altas, porque cresce com o quadrado da rotação), a corrente passou a oscilar e, mais tarde, a temperatura subiu. A combinação é compatível com desbalanceamento, mas também poderia vir de rolamento danificado ou de um sensor mal fixado: por isso a inspeção da fixação da peça e da placa, dos rolamentos e do próprio sensor vem antes de qualquer conclusão.",
  },
];

/**
 * Avalia a resposta da turma.
 * resposta: { hipotese, primeiroSinal, evidencias: [], inspecoes: [], justificativa, registros: [] }
 * Retorna { pontos, total: 100, itens: [{ titulo, pontos, max, comentario }], mensagens: [] }
 */
export function avaliarResposta(desafio, resposta) {
  const itens = [];
  const nomeEv = (id) => EVIDENCIAS.find((e) => e.id === id)?.texto ?? id;
  const nomeInsp = (id) => INSPECOES.find((e) => e.id === id)?.texto ?? id;

  // evidências (40)
  const citadas = new Set(resposta.evidencias ?? []);
  const essenciaisCitadas = desafio.evidenciasEssenciais.filter((e) => citadas.has(e));
  const contraditorias = [...citadas].filter((e) => desafio.evidenciasContraditorias.includes(e));
  let ptsEv = (40 * essenciaisCitadas.length) / desafio.evidenciasEssenciais.length - 10 * contraditorias.length;
  ptsEv = Math.max(0, Math.round(ptsEv));
  const faltando = desafio.evidenciasEssenciais.filter((e) => !citadas.has(e));
  let comEv = `${essenciaisCitadas.length} de ${desafio.evidenciasEssenciais.length} evidências principais citadas.`;
  if (faltando.length) comEv += ` Faltou observar: ${faltando.map((e) => `“${nomeEv(e)}”`).join("; ")}.`;
  if (contraditorias.length)
    comEv += ` Não se confirmam nos gráficos: ${contraditorias.map((e) => `“${nomeEv(e)}”`).join("; ")} — volte às curvas.`;
  itens.push({ titulo: "Evidências", pontos: ptsEv, max: 40, comentario: comEv });

  // primeiro sinal (15)
  const okPrimeiro = desafio.primeiroSinal.includes(resposta.primeiroSinal);
  itens.push({
    titulo: "Sequência dos sinais",
    pontos: okPrimeiro ? 15 : 0,
    max: 15,
    comentario: okPrimeiro
      ? "A sequência indicada é compatível com os registros."
      : "Reveja qual grandeza mudou primeiro: use a vista Comparar e o cursor para localizar o início da alteração.",
  });

  // hipótese (20)
  let ptsHip = 0;
  let comHip = "A hipótese não é a mais compatível com o conjunto de sinais.";
  if (resposta.hipotese === desafio.hipoteseCorreta) {
    ptsHip = 20;
    comHip = "Hipótese compatível com os sinais observados.";
  } else if (desafio.hipotesesAceitaveis.includes(resposta.hipotese)) {
    ptsHip = 10;
    comHip = "Hipótese possível, mas outra explica melhor o conjunto dos sinais. Mantenha-a na lista de verificação.";
  }
  itens.push({ titulo: "Hipótese", pontos: ptsHip, max: 20, comentario: comHip });

  // inspeção (20)
  const insp = new Set(resposta.inspecoes ?? []);
  const esperadasCitadas = desafio.inspecoesEsperadas.filter((i) => insp.has(i));
  const precipitadas = ["trocarMotor", "aumentarRotacao"].filter((i) => insp.has(i));
  let ptsInsp = (20 * esperadasCitadas.length) / desafio.inspecoesEsperadas.length - 10 * precipitadas.length;
  ptsInsp = Math.max(0, Math.round(ptsInsp));
  let comInsp = `${esperadasCitadas.length} de ${desafio.inspecoesEsperadas.length} verificações indicadas.`;
  const faltaInsp = desafio.inspecoesEsperadas.filter((i) => !insp.has(i));
  if (faltaInsp.length) comInsp += ` Considere também: ${faltaInsp.map((i) => `“${nomeInsp(i)}”`).join("; ")}.`;
  if (precipitadas.length) comInsp += " Intervenções sem confirmar a causa (trocar peças ou mudar a operação) foram descontadas.";
  itens.push({ titulo: "Inspeção proposta", pontos: ptsInsp, max: 20, comentario: comInsp });

  // registros (5)
  const nReg = (resposta.registros ?? []).length;
  itens.push({
    titulo: "Registro de evidências",
    pontos: nReg >= 2 ? 5 : nReg === 1 ? 3 : 0,
    max: 5,
    comentario: nReg >= 2 ? "Evidências registradas com instante e valores." : "Registre ao menos dois instantes (antes e depois da alteração).",
  });

  const mensagens = [];
  const j = (resposta.justificativa ?? "").trim();
  const mencoes = ["temperatura", "óleo", "oleo", "nível", "corrente", "vibra", "rotação", "rpm"].filter((p) => j.toLowerCase().includes(p));
  if (j.length < 40) mensagens.push("A justificativa está curta: explique como os sinais levaram à hipótese e o que a inspeção deve confirmar.");
  else if (mencoes.length < 2) mensagens.push("Na justificativa, relacione pelo menos duas grandezas e diga em que ordem mudaram.");
  mensagens.push("Lembre: a combinação de sinais é compatível com uma hipótese, não a prova. A conclusão vem da inspeção.");

  return { pontos: itens.reduce((s, i) => s + i.pontos, 0), total: 100, itens, mensagens };
}
