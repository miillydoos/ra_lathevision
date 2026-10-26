const tela = () => document.getElementById("carregando");

export function progressoCarregamento(fracao) {
  const barra = document.getElementById("progresso");
  const texto = document.getElementById("progresso-texto");
  if (fracao === null) {
    texto.textContent = "Carregando…";
    return;
  }
  const pct = Math.round(fracao * 100);
  barra.style.width = pct + "%";
  texto.textContent = pct + "%";
}

export function concluirCarregamento() {
  const t = tela();
  t.classList.add("saindo");
  setTimeout(() => t.remove(), 450);
}

export function erroCarregamento(mensagem) {
  const t = tela();
  t.classList.add("erro");
  t.querySelector("strong").textContent = "Não foi possível carregar o modelo";
  document.getElementById("progresso-texto").textContent = mensagem;
}
