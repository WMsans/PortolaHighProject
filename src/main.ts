import { loadScene } from "./loader";
import { registerMotion } from "./motion";
import { Viewer } from "./viewer";
import { mountUIDeps, toast } from "./ui";

registerMotion();

const canvasEl = document.getElementById("canvas");
const panelEl = document.getElementById("panel");
const errorOverlayEl = document.getElementById("error-overlay");

if (!canvasEl) throw new Error("Missing #canvas element");
if (!panelEl) throw new Error("Missing #panel element");
if (!errorOverlayEl) throw new Error("Missing #error-overlay element");

const canvas = canvasEl as HTMLCanvasElement;
const panel = panelEl as HTMLElement;
const errorOverlay = errorOverlayEl as HTMLElement;

const debug = new URLSearchParams(location.search).has("debug");

function showError(message: string, onPick: (file: File) => void) {
  errorOverlay.hidden = false;
  errorOverlay.innerHTML = `
    <h2>Failed to load campus data</h2>
    <p></p>
    <p style="margin-top:12px">Choose a .glb file from your computer:</p>
    <input type="file" accept=".glb,model/gltf-binary" id="glb-picker" style="margin-top:8px;color:white" />
    <button id="reload-btn">Reload</button>
  `;
  errorOverlay.querySelector("p")!.textContent = message;
  errorOverlay.querySelector<HTMLButtonElement>("#reload-btn")!.addEventListener("click", () => location.reload());
  errorOverlay.querySelector<HTMLInputElement>("#glb-picker")!.addEventListener("change", (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) onPick(file);
  });
}

async function boot(glbSource: string | File = "./school.glb") {
  errorOverlay.hidden = true;
  errorOverlay.innerHTML = "";
  const viewer = new Viewer(canvas);
  try {
    const scene = await loadScene(glbSource, "./graph.json");
    viewer.attachModel(scene);
    if (debug) viewer.enableDebug(scene);
    mountUIDeps(panel, scene, viewer);
    if (scene.edges.length === 0) toast("graph.json has no edges — routing disabled");
  } catch (err) {
    viewer.dispose();
    showError((err as Error).message, (file) => boot(file));
  }
}

boot();
