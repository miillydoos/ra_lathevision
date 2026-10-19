// Componentes didáticos do torno.
// Os 15 conjuntos do GLB são identificados pelo nome do nó (`no`).
// O conjunto "Estrutura" reúne várias peças fixas; elas são separadas pelo nome da malha (`malhas`).
// Descrições baseadas no catálogo da Linha ROMI T (AM-02 / 042024).

export const COMPONENTES = [
  // ---- peças fixas dentro de "Estrutura"
  {
    id: "cabecote",
    grupo: "Estrutura",
    nome: "Cabeçote fixo",
    malhas: /^(Cabecote_fixo|Porta_lateral_cabecote|Dobradica_porta|Fecho_lateral|Protetor_face_cabecote)/,
    descricao:
      "Aloja o eixo-árvore (nariz ASA L0, passagem Ø 52 mm) e a caixa de 20 velocidades (39 a 2.000 rpm no T 350). Engrenagens e eixos temperados trabalham em banho de óleo. A porta de acesso tem micro de segurança anti-burla (NR-12).",
  },
  {
    id: "painel",
    grupo: "Estrutura",
    nome: "Painel de comandos",
    malhas: /^(Painel_comandos|Junta_painel|Parafuso_painel|Seletor_|Anel_emergencia|Botao_|Grafismo_painel)/,
    descricao:
      "Concentra a parada de emergência, os botões de comando e as alavancas seletoras de velocidade, avanços e roscas.",
  },
  {
    id: "barramento",
    grupo: "Estrutura",
    nome: "Barramento",
    malhas: /^(Barramento|Guia_aco|Guia_quina|Canal_central|Nervura_barramento)/,
    descricao:
      "Guias que sustentam e alinham o carro e o cabeçote móvel. Largura de 305 mm e altura de 334 mm.",
  },
  {
    id: "fuso_vara",
    grupo: "Estrutura",
    nome: "Fuso de guia e vara de avanços",
    malhas: /^(Cobertura_fuso|Vinco_protecao|Vara_comando|Suporte_vara)/,
    descricao:
      "Enclausurados por proteção em aço inox, que impede o contato do operador e protege contra cavacos e fluido de corte. Passo do fuso de guia: 6 mm.",
  },
  {
    id: "base",
    grupo: "Estrutura",
    nome: "Pedestais e motor principal",
    malhas: /^(Pedestal|Sapata|Nivelador|Porca_nivelador|Travessa|Gabinete_motor|Veneziana_motor|Saia_branca|Fixacao_saia|Identificacao_modelo)/,
    descricao:
      "Base da máquina. O motor principal (AC assíncrono, 7,5 cv, com freio eletromagnético) fica no pedestal do lado do cabeçote; a transmissão até o cabeçote é feita por correia e polias multi-V.",
  },
  {
    id: "bandeja",
    grupo: "Estrutura",
    nome: "Bandeja aparadora de cavacos",
    malhas: /^(Bandeja_cavacos|Borda_bandeja)/,
    descricao: "Recolhe cavacos e fluido de corte sob a área de usinagem.",
  },
  {
    id: "protecao_traseira",
    grupo: "Estrutura",
    nome: "Proteção traseira",
    malhas: /^(Protecao_traseira|Dobra_superior_traseira|Calha_traseira|Fechamento_traseiro)/,
    descricao: "Reduz a projeção de cavacos e respingos de fluido de corte pela parte traseira da máquina.",
  },

  // ---- conjuntos (nós do GLB)
  {
    id: "placa",
    grupo: "Eixo-árvore",
    nome: "Placa de 3 castanhas",
    no: "Placa_rotativa",
    descricao:
      "Placa universal Ø 250 mm montada no nariz do eixo-árvore. Prende a peça e gira com o eixo-árvore.",
  },
  {
    id: "protecao_placa",
    grupo: "Eixo-árvore",
    nome: "Proteção da placa",
    no: "Protecao_placa",
    descricao:
      "Possui micro de segurança anti-burla: a máquina não liga com a proteção aberta. Impede que a chave das castanhas fique na placa.",
  },
  {
    id: "carro_longitudinal",
    grupo: "Carros",
    nome: "Carro longitudinal e avental",
    no: "Carro_longitudinal",
    descricao:
      "Desloca a ferramenta ao longo do barramento. O avental tem engrenagens em banho de óleo, bomba manual de lubrificação das guias e visor de óleo.",
  },
  {
    id: "volante_longitudinal",
    grupo: "Carros",
    nome: "Volante do avanço longitudinal",
    no: "Volante_longitudinal",
    descricao:
      "Avanço manual longitudinal. Permanece parado durante o avanço automático e a abertura de roscas, por segurança. Graduação em mm e polegada.",
  },
  {
    id: "carro_transversal",
    grupo: "Carros",
    nome: "Carro transversal",
    no: "Carro_transversal",
    descricao:
      "Movimenta a ferramenta na direção radial (curso de 300 mm no T 350). Tem sistema para eliminar folga entre a porca e o fuso transversal.",
  },
  {
    id: "volante_transversal",
    grupo: "Carros",
    nome: "Volante do carro transversal",
    no: "Volante_transversal",
    descricao: "Avanço manual do carro transversal.",
  },
  {
    id: "carro_superior",
    grupo: "Carros",
    nome: "Carro superior",
    no: "Carro_superior",
    descricao: "Carro porta-ferramentas com curso de 120 mm. Pode ser inclinado para tornear cones.",
  },
  {
    id: "manivela_superior",
    grupo: "Carros",
    nome: "Manivela do carro superior",
    no: "Manivela_carro_superior",
    descricao: "Avanço manual do carro superior.",
  },
  {
    id: "porta_ferramentas",
    grupo: "Carros",
    nome: "Porta-ferramentas de 4 posições",
    no: "Torre_porta_ferramentas",
    descricao: "Torre quadrada com base giratória. Seção do cabo da ferramenta: 20 × 20 mm.",
  },
  {
    id: "contraponto",
    grupo: "Cabeçote móvel",
    nome: "Cabeçote móvel (contraponto)",
    no: "Contraponto",
    descricao:
      "Apoia peças longas com ponto rotativo CM 4. Manga de Ø 60 mm com curso de 125 mm, graduada em mm e polegada.",
  },
  {
    id: "volante_contraponto",
    grupo: "Cabeçote móvel",
    nome: "Volante do cabeçote móvel",
    no: "Volante_contraponto",
    descricao: "Desloca a manga do cabeçote móvel.",
  },
  {
    id: "luneta",
    grupo: "Acessórios",
    nome: "Luneta fixa",
    no: "Luneta_fixa",
    descricao: "Apoia peças longas, como eixos e tubos, reduzindo flexão e vibração durante a usinagem.",
  },
  {
    id: "protecao_cavacos",
    grupo: "Acessórios",
    nome: "Proteção contra cavacos",
    no: "Protecao_cavacos",
    descricao:
      "Visor de policarbonato com micro de segurança anti-burla: a máquina não liga com a proteção aberta.",
  },
  {
    id: "acessorios",
    grupo: "Acessórios",
    nome: "Luminária e refrigeração de corte",
    no: "Acessorios",
    descricao: "Luminária da área de trabalho e tubulação do sistema de refrigeração de corte (bomba de 0,125 cv).",
  },
  {
    id: "estrutura",
    grupo: "Estrutura",
    nome: "Estrutura",
    no: "Estrutura",
    descricao: "Partes fixas da máquina.",
    oculto: true,
  },
];
