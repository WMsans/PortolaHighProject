import { loadScene } from "./loader";
import { Viewer } from "./viewer";
import { mountUIDeps, toast } from "./ui";

const canvas = document.getElementById("canvas") as HTMLCanvasElement;
const panel = document.getElementById("panel") as HTMLElement;
const errorOverlay = document.getElementById("error-overlay") as HTMLElement;

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
    errorOverlay.hidden = false;
    errorOverlay.innerHTML = `
      <h2>Failed to load campus data</h2>
      <p>${(err as Error).message}</p>
      <button onclick="location.reload()">Reload</button>
    `;
  }
}

boot();
