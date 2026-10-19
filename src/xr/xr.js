import { Color4, Vector3, WebXRSessionManager, WebXRState } from "@babylonjs/core";
import { criarEmissor } from "../util/emissor.js";

/**
 * RV/RA com WebXR. Requer HTTPS (ou localhost) e navegador com WebXR (Quest Browser, Chrome Android para RA…).
 * A interface HTML não aparece dentro do headset; por isso o painel 3D (painelXR.js) replica os controles.
 */
export async function iniciarXR(scene, { piso, ceu, posicaoOperador }) {
  const eventos = criarEmissor();
  const [suportaVR, suportaAR] = await Promise.all([
    WebXRSessionManager.IsSessionSupportedAsync("immersive-vr").catch(() => false),
    WebXRSessionManager.IsSessionSupportedAsync("immersive-ar").catch(() => false),
  ]);

  const api = {
    suportaVR,
    suportaAR,
    emXR: false,
    modo: null,
    on: eventos.on,
    entrar: async () => {},
    sair: async () => {},
    xr: null,
  };
  if (!suportaVR && !suportaAR) return api;

  const xr = await scene.createDefaultXRExperienceAsync({
    floorMeshes: [piso],
    disableDefaultUI: true,
  });
  api.xr = xr;

  const corFundoOriginal = scene.clearColor.clone();
  let modoPedido = "immersive-vr";

  // O usuário começa em pé na área do operador, olhando para o barramento.
  xr.baseExperience.onInitialXRPoseSetObservable.add((camXR) => {
    const [x, z] = posicaoOperador;
    camXR.position.x = x;
    camXR.position.z = z;
    camXR.setTarget(new Vector3(x, camXR.position.y, 0));
  });

  xr.baseExperience.onStateChangedObservable.add((estado) => {
    if (estado === WebXRState.IN_XR) {
      api.emXR = true;
      api.modo = modoPedido;
      if (modoPedido === "immersive-ar") {
        // Em RA o ambiente real substitui piso e céu.
        ceu?.setEnabled(false);
        piso.setEnabled(false);
        scene.clearColor = new Color4(0, 0, 0, 0);
      }
      eventos.emitir("estado", true, api.modo);
    } else if (estado === WebXRState.NOT_IN_XR) {
      api.emXR = false;
      api.modo = null;
      ceu?.setEnabled(true);
      piso.setEnabled(true);
      scene.clearColor = corFundoOriginal;
      eventos.emitir("estado", false, null);
    }
  });

  api.entrar = async (modo = "immersive-vr") => {
    modoPedido = modo;
    const espaco = "local-floor";
    await xr.baseExperience.enterXRAsync(modo, espaco, xr.renderTarget);
  };
  api.sair = async () => {
    if (api.emXR) await xr.baseExperience.exitXRAsync();
  };

  return api;
}
