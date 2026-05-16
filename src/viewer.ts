import {
  AmbientLight,
  Box3,
  DirectionalLight,
  Group,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Scene,
  SphereGeometry,
  Vector3,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import type { LoadedScene } from "./types";

export type FloorView = 1 | 2 | "both";

export class Viewer {
  readonly scene = new Scene();
  readonly camera: PerspectiveCamera;
  readonly renderer: WebGLRenderer;
  readonly controls: OrbitControls;
  private readonly routeLayer = new Group();
  private readonly debugLayer = new Group();
  private routeMaterial: LineMaterial;
  private defaultCameraPos = new Vector3(0, -200, 200);
  private defaultTarget = new Vector3(0, 0, 0);
  private modelBounds: Box3 | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);

    this.camera = new PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 5000);
    this.camera.up.set(0, 0, 1);
    this.camera.position.copy(this.defaultCameraPos);
    this.camera.lookAt(this.defaultTarget);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.1;
    this.controls.screenSpacePanning = true;
    this.controls.minDistance = 5;
    this.controls.maxDistance = 2000;
    this.controls.target.copy(this.defaultTarget);

    this.scene.add(new AmbientLight(0xffffff, 0.6));
    const sun = new DirectionalLight(0xffffff, 0.8);
    sun.position.set(100, -100, 200);
    this.scene.add(sun);

    this.scene.add(this.routeLayer);
    this.scene.add(this.debugLayer);

    this.routeMaterial = new LineMaterial({
      color: 0xff2222,
      linewidth: 4, // in screen pixels
      worldUnits: false,
      depthTest: false,
      transparent: true,
    });
    this.routeMaterial.resolution.set(window.innerWidth, window.innerHeight);

    window.addEventListener("resize", () => this.onResize());
    this.animate();
  }

  attachModel(loaded: LoadedScene): void {
    this.scene.add(loaded.modelRoot);
    this.modelBounds = new Box3().setFromObject(loaded.modelRoot);
    const center = new Vector3();
    this.modelBounds.getCenter(center);
    const size = new Vector3();
    this.modelBounds.getSize(size);
    const radius = Math.max(size.x, size.y, size.z);
    this.defaultTarget.copy(center);
    this.defaultCameraPos.set(center.x, center.y - radius * 1.2, center.z + radius * 0.8);
    this.recenter();
  }

  enableDebug(loaded: LoadedScene): void {
    this.debugLayer.clear();
    const sphereGeo = new SphereGeometry(0.6, 8, 8);
    const matWp = new MeshBasicMaterial({ color: 0x2ecc71 });
    const matRoom = new MeshBasicMaterial({ color: 0x3498db });
    const matPark = new MeshBasicMaterial({ color: 0xe67e22 });
    const matStair = new MeshBasicMaterial({ color: 0x9b59b6 });

    const place = (pos: Vector3, mat: MeshBasicMaterial) => {
      const m = new Mesh(sphereGeo, mat);
      m.position.copy(pos);
      this.debugLayer.add(m);
    };
    for (const wp of loaded.waypoints.values()) place(wp.position, matWp);
    for (const r of loaded.rooms.values()) place(r.position, matRoom);
    for (const p of loaded.parking.values()) place(p.position, matPark);
    for (const s of loaded.stairs) {
      place(s.endpoints[0].position, matStair);
      place(s.endpoints[1].position, matStair);
    }
  }

  drawRoute(points: Vector3[]): void {
    this.clearRoute();
    if (points.length < 2) return;
    const flat: number[] = [];
    for (const p of points) flat.push(p.x, p.y, p.z);
    const geo = new LineGeometry();
    geo.setPositions(flat);
    const line = new Line2(geo, this.routeMaterial);
    line.computeLineDistances();
    line.renderOrder = 999;
    this.routeLayer.add(line);
    this.frameBounds(new Box3().setFromPoints(points));
  }

  clearRoute(): void {
    this.routeLayer.clear();
  }

  setActiveFloor(_floor: FloorView): void {
    // v1: model has no separable floor geometry, so this only affects debug spheres.
    // Reserved for future per-floor visual treatments.
  }

  recenter(): void {
    this.camera.position.copy(this.defaultCameraPos);
    this.controls.target.copy(this.defaultTarget);
    this.controls.update();
  }

  private frameBounds(box: Box3): void {
    const center = new Vector3();
    box.getCenter(center);
    const size = new Vector3();
    box.getSize(size);
    const radius = Math.max(size.x, size.y, size.z, 10);
    const dir = new Vector3(0, -1, 0.6).normalize();
    this.camera.position.copy(center).addScaledVector(dir, radius * 2.2);
    this.controls.target.copy(center);
    this.controls.update();
  }

  private onResize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.routeMaterial.resolution.set(w, h);
  }

  private animate = (): void => {
    requestAnimationFrame(this.animate);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };
}
