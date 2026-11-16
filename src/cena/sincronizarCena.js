/**
 * Leva a rotação medida para o giro da placa (e da roda do sensor de velocidade, que acompanha a placa).
 * Os valores das medições aparecem nas etiquetas dos próprios sensores (compartimentos.js e
 * caixaMonitoramento.js).
 */
export function sincronizarCena({ fluxo, placa }) {
  function atualizar() {
    const e = fluxo.estado("rotacao");
    placa.definirRpm(e.estado === "semDados" ? 0 : e.valor ?? 0);
  }
  const intervalo = setInterval(atualizar, 250);
  atualizar();
  return { atualizar, parar: () => clearInterval(intervalo) };
}
