import { Axis, Quaternion } from "@babylonjs/core";

// Acima deste valor a placa gira numa velocidade reduzida e identificada como ilustrativa:
// a taxa de quadros do monitor não reproduz rotações altas (efeito estroboscópico).
export const RPM_LIMITE_ANIMACAO = 90;

/**
 * Giro da placa a partir da rotação informada (medida, simulada ou reproduzida).
 * O nó "Placa_rotativa" do GLB já tem o pivô no eixo do eixo-árvore (eixo X).
 */
export function criarAnimacaoPlaca(scene, noPlaca) {
  const base = noPlaca.rotationQuaternion?.clone() ?? Quaternion.FromEulerVector(noPlaca.rotation);
  // Visto do contraponto, a placa gira no sentido anti-horário (topo da peça vindo em direção ao operador, +Z).
  const sentido = 1;
  let rpm = 0;
  let rpmVisual = 0;
  let angulo = 0;

  scene.onBeforeRenderObservable.add(() => {
    const dt = Math.min(0.1, scene.getEngine().getDeltaTime() / 1000);
    const alvo = Math.min(Math.max(rpm, 0), RPM_LIMITE_ANIMACAO);
    rpmVisual += (alvo - rpmVisual) * Math.min(1, dt * 2.5); // inércia aparente
    if (rpmVisual < 0.05 && alvo === 0) rpmVisual = 0;
    angulo = (angulo + (rpmVisual / 60) * Math.PI * 2 * dt) % (Math.PI * 2);
    noPlaca.rotationQuaternion = base.multiply(Quaternion.RotationAxis(Axis.X, angulo * sentido));
  });

  return {
    definirRpm(valor) {
      rpm = Number.isFinite(valor) ? valor : 0;
    },
    get rpm() {
      return rpm;
    },
    get ilustrativa() {
      return rpm > RPM_LIMITE_ANIMACAO;
    },
  };
}
