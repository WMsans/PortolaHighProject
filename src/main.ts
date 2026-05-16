import { loadScene } from "./loader";
import { Viewer } from "./viewer";
import { mountUIDeps, toast } from "./ui";

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

async function boot() {
  const viewer = new Viewer(canvas);
  try {
    const scene = await loadScene("./school.glb", "./graph.json");
    viewer.attachModel(scene);
    if (debug) viewer.enableDebug(scene);
    mountUIDeps(panel, scene, viewer);
    if (scene.edges.length === 0) toast("graph.json has no edges — routing disabled");
  } catch (err) {
    viewer.dispose();
    errorOverlay.hidden = false;
    errorOverlay.innerHTML = `
      <h2>Failed to load campus data</h2>
      <p></p>
      <button onclick="location.reload()">Reload</button>
    `;
    errorOverlay.querySelector("p")!.textContent = (err as Error).message;
  }
}

boot();
