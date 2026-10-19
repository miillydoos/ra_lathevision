// Estados de cada grandeza. A cor nunca aparece sozinha: sempre com ícone e texto.
// Cores da paleta de status (bom / alerta / crítico), reservadas para estado — nunca usadas como cor de série.
export const ESTADOS = {
  normal: { id: "normal", texto: "Normal", cor: "#0ca30c", icone: "normal", prioridade: 0 },
  atencao: { id: "atencao", texto: "Atenção", cor: "#fab219", icone: "atencao", prioridade: 2 },
  alarme: { id: "alarme", texto: "Alarme", cor: "#d03b3b", icone: "alarme", prioridade: 3 },
  semDados: { id: "semDados", texto: "Sem dados", cor: "#898781", icone: "semDados", prioridade: 1 },
};

// Tinta dos gráficos sobre o fundo escuro dos painéis.
export const TINTA = {
  serie: "#3987e5",
  serieArea: "rgba(57,135,229,0.12)",
  primaria: "#f0efec",
  secundaria: "#c3c2b7",
  sutil: "#898781",
  grade: "#2c2c2a",
  eixo: "#383835",
  superficie: "#151c25",
};
