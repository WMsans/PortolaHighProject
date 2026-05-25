import {
  AmbientLight,
  Box3,
  DirectionalLight,
  Group,
  Material,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MOUSE,
  PerspectiveCamera,
  PMREMGenerator,
  Scene,
  SphereGeometry,
  TOUCH,
  Vector3,
  WebGLRenderer,
  CylinderGeometry,
  RingGeometry,
  DoubleSide,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import type { LoadedScene } from "./types";
import type { Object3D } from "three";
import { gsap, DUR, EASE } from "./motion";

export type FloorView = 1 | 2 | "both";

const ROUTE_RENDER_ORDER = 999;

export class Viewer {
  readonly scene = new Scene();
  readonly camera: PerspectiveCamera;
  readonly renderer: WebGLRenderer;
  readonly controls: OrbitControls;
  private readonly routeLayer = new Group();
  private readonly debugLayer = new Group();
  private routeMaterial: LineMaterial;
  private routePoints: Vector3[] = [];
  private routeTotalLen = 0;
  private routeLine: Line2 | null = null;
  private routeProgress = 0;
  private pinMesh: Mesh | null = null;
  private ringMeshes: Mesh[] = [];
  private floorGroups: { 1: Object3D[]; 2: Object3D[] } | null = null;
  private currentFloor: FloorView = "both";
  private floorTl: gsap.core.Timeline | null = null;
  private defaultCameraPos = new Vector3(0, 200, 200);
  private defaultTarget = new Vector3(0, 0, 0);
  private modelBounds: Box3 | null = null;
  private animFrameId = 0;
  private resizeRafId = 0;
  private disposed = false;
  private readonly onResizeHandler = (): void => this.onResize();

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);

    this.camera = new PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 5000);
    this.camera.position.copy(this.defaultCameraPos);
    this.camera.lookAt(this.defaultTarget);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.1;
    this.controls.screenSpacePanning = true;
    this.controls.minDistance = 5;
    this.controls.maxDistance = 2000;
    this.controls.target.copy(this.defaultTarget);
    // Blender/Unity-style navigation: MMB pans, RMB orbits, wheel zooms to cursor.
    this.controls.mouseButtons = {
      LEFT: MOUSE.ROTATE,
      MIDDLE: MOUSE.PAN,
      RIGHT: MOUSE.ROTATE,
    };
    this.controls.touches = { ONE: TOUCH.ROTATE, TWO: TOUCH.DOLLY_PAN };
    this.controls.panSpeed = 1.0;
    this.controls.rotateSpeed = 0.8;
    this.controls.zoomSpeed = 1.2;
    this.controls.zoomToCursor = true;

    this.scene.add(new AmbientLight(0xffffff, 2.5));
    this.scene.add(new HemisphereLight(0xffffff, 0x444444, 2.0));
    const sun = new DirectionalLight(0xffffff, 2.5);
    sun.position.set(100, -100, 200);
    this.scene.add(sun);

    const pmrem = new PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    this.renderer.toneMappingExposure = 1.5;

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

    window.addEventListener("resize", this.onResizeHandler);
    this.animate();
  }

  attachModel(loaded: LoadedScene): void {
    this.scene.add(loaded.modelRoot);
    this.floorGroups = loaded.floorMeshes;
    this.modelBounds = new Box3().setFromObject(loaded.modelRoot);
    if (this.modelBounds.isEmpty()) return;
    const center = new Vector3();
    this.modelBounds.getCenter(center);
    const size = new Vector3();
    this.modelBounds.getSize(size);
    const radius = Math.max(size.x, size.y, size.z);
    this.defaultTarget.copy(center);
    this.defaultCameraPos.set(center.x, center.y + radius * 0.8, center.z + radius * 1.2);
    this.recenter();
  }

  enableDebug(loaded: LoadedScene): void {
    this.disposeDebugLayer();
    const matWp = new MeshBasicMaterial({ color: 0x2ecc71 });
    const matRoom = new MeshBasicMaterial({ color: 0x3498db });
    const matPark = new MeshBasicMaterial({ color: 0xe67e22 });
    const matStair = new MeshBasicMaterial({ color: 0x9b59b6 });

    const place = (pos: Vector3, templateMat: MeshBasicMaterial) => {
      const m = new Mesh(new SphereGeometry(0.6, 8, 8), templateMat.clone());
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
    matWp.dispose();
    matRoom.dispose();
    matPark.dispose();
    matStair.dispose();
  }

  drawRoute(points: Vector3[]): void {
    this.clearRoute();
    if (points.length < 2) return;
    this.routePoints = points.map((p) => p.clone());
    this.routeTotalLen = 0;
    for (let i = 1; i < points.length; i++) this.routeTotalLen += points[i].distanceTo(points[i - 1]);
    const geo = new LineGeometry();
    geo.setPositions([points[0].x, points[0].y, points[0].z,
                      points[0].x, points[0].y, points[0].z]);
    const line = new Line2(geo, this.routeMaterial);
    line.computeLineDistances();
    line.renderOrder = ROUTE_RENDER_ORDER;
    this.routeLayer.add(line);
    this.routeLine = line;
    this.progress = 0;
  }

  animateRouteDraw(points: Vector3[]): gsap.core.Timeline {
    this.drawRoute(points);
    const tl = gsap.timeline();
    tl.to(this, { progress: 1, duration: DUR.routeDraw, ease: EASE.sineInOut });
    return tl;
  }

  tweenCameraToFitRoute(points: Vector3[]): gsap.core.Timeline {
    const box = new Box3().setFromPoints(points);
    const center = new Vector3(); box.getCenter(center);
    const size = new Vector3(); box.getSize(size);
    const radius = Math.max(size.x, size.y, size.z, 10) * 1.25;
    const dir = new Vector3(0, 0.6, 1).normalize();
    const targetPos = center.clone().addScaledVector(dir, radius * 2.2);

    this.controls.enabled = false;
    const tl = gsap.timeline({
      onComplete: () => { this.controls.enabled = true; this.controls.update(); },
    });
    tl.to(this.camera.position, {
      x: targetPos.x, y: targetPos.y, z: targetPos.z,
      duration: DUR.glide, ease: EASE.power3InOut,
    }, 0);
    tl.to(this.controls.target, {
      x: center.x, y: center.y, z: center.z,
      duration: DUR.glide, ease: EASE.power3InOut,
      onUpdate: () => this.controls.update(),
    }, 0);
    return tl;
  }

  animatePinDrop(position: Vector3): gsap.core.Timeline {
    this.clearPin();
    const pinGeo = new CylinderGeometry(0, 1.5, 4, 16);
    const pinMat = new MeshBasicMaterial({ color: 0xff2222, depthTest: false });
    const pin = new Mesh(pinGeo, pinMat);
    pin.rotation.x = Math.PI;
    pin.position.copy(position).add(new Vector3(0, 0, 12));
    pin.scale.set(0.6, 0.6, 0.6);
    pin.renderOrder = ROUTE_RENDER_ORDER + 1;
    this.routeLayer.add(pin);
    this.pinMesh = pin;

    const tl = gsap.timeline();
    tl.to(pin.position, { z: position.z + 1, duration: DUR.pinDrop, ease: EASE.bounceOut }, 0);
    tl.to(pin.scale,    { x: 1, y: 1, z: 1, duration: DUR.pinDrop, ease: EASE.backOutStrong }, 0);

    for (let i = 0; i < 3; i++) {
      const ringGeo = new RingGeometry(0.5, 0.8, 24);
      const ringMat = new MeshBasicMaterial({ color: 0xff2222, transparent: true, opacity: 0.6, side: DoubleSide, depthTest: false });
      const ring = new Mesh(ringGeo, ringMat);
      ring.position.copy(position);
      ring.rotation.x = -Math.PI / 2;
      ring.renderOrder = ROUTE_RENDER_ORDER + 2;
      this.routeLayer.add(ring);
      this.ringMeshes.push(ring);
      tl.fromTo(ring.scale,
        { x: 0.5, y: 0.5, z: 0.5 },
        { x: 4, y: 4, z: 1, duration: 0.7, ease: "power2.out" }, 0.1 + i * 0.12);
      tl.fromTo(ringMat,
        { opacity: 0.6 },
        { opacity: 0, duration: 0.7, ease: "power2.out" }, 0.1 + i * 0.12);
    }
    return tl;
  }

  animateMarkerPulse(positions: Vector3[]): gsap.core.Timeline {
    const tl = gsap.timeline();
    positions.forEach((pos, i) => {
      const geo = new RingGeometry(0.8, 1.1, 18);
      const mat = new MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.85, side: DoubleSide, depthTest: false });
      const halo = new Mesh(geo, mat);
      halo.position.copy(pos);
      halo.rotation.x = -Math.PI / 2;
      halo.renderOrder = ROUTE_RENDER_ORDER + 3;
      this.routeLayer.add(halo);
      tl.fromTo(halo.scale,
        { x: 0.5, y: 0.5, z: 0.5 },
        { x: 1.4, y: 1.4, z: 1.4, duration: 0.36, ease: EASE.elasticOut }, i * 0.06);
      tl.fromTo(mat,
        { opacity: 0.85 },
        { opacity: 0, duration: 0.36, ease: "power2.out",
          onComplete: () => { this.routeLayer.remove(halo); geo.dispose(); mat.dispose(); } }, i * 0.06);
    });
    return tl;
  }

  clearRoute(): void {
    this.clearPin();
    this.routeLayer.children.forEach((child) => {
      if (child instanceof Line2) child.geometry.dispose();
    });
    this.routeLayer.clear();
    this.routePoints = [];
    this.routeLine = null;
    this.routeProgress = 0;
  }

  get progress(): number { return this.routeProgress; }
  set progress(p: number) {
    this.routeProgress = p;
    if (!this.routeLine) return;
    const pos = this.buildPartialPositions(p);
    if (pos.length < 6) {
      this.routeLine.visible = false;
      return;
    }
    this.routeLine.visible = true;
    this.routeLine.geometry.setPositions(pos);
    this.routeLine.computeLineDistances();
  }

  setActiveFloor(floor: FloorView): void {
    this.extrudeFloor(floor);
  }

  extrudeFloor(target: FloorView): gsap.core.Timeline {
    this.floorTl?.kill();
    const groups = this.floorGroups;
    const tl = gsap.timeline();
    if (!groups) { this.floorTl = tl; return tl; }

    const showFloor = (meshes: Object3D[], show: boolean) => {
      meshes.forEach((m) => {
        const material = (m as Mesh).material as Material | undefined;
        if (material) {
          material.transparent = true;
          tl.to(material, { opacity: show ? 1 : 0, duration: DUR.floorSwitch, ease: EASE.power3InOut,
            onComplete: () => { if (show) material.transparent = false; } }, 0.05);
        }
        tl.to(m.position, {
          z: show ? (m.userData.origZ ?? m.position.z) : (m.userData.origZ ?? m.position.z) + 8,
          duration: DUR.floorSwitch, ease: show ? EASE.backOutSubtle : EASE.power2In,
        }, 0.05);
      });
    };

    for (const list of [groups[1], groups[2]]) for (const m of list) {
      if (m.userData.origZ === undefined) m.userData.origZ = m.position.z;
    }

    const want1 = target === 1 || target === "both";
    const want2 = target === 2 || target === "both";
    showFloor(groups[1], want1);
    showFloor(groups[2], want2);
    this.currentFloor = target;
    this.floorTl = tl;
    return tl;
  }

  playBootIntro(loaded: LoadedScene): gsap.core.Timeline {
    this.controls.enabled = false;

    const startPos = this.defaultCameraPos.clone().multiplyScalar(3);
    startPos.y *= 1.4;
    this.camera.position.copy(startPos);
    this.controls.target.copy(this.defaultTarget);
    this.controls.update();

    const allMeshes = [...loaded.floorMeshes[1], ...loaded.floorMeshes[2]];
    allMeshes.forEach((m) => {
      m.userData.origScaleY = m.scale.y;
      m.scale.y = 0;
    });

    const tl = gsap.timeline({
      onComplete: () => { this.controls.enabled = true; this.controls.update(); },
    });

    tl.to(this.camera.position, {
      x: this.defaultCameraPos.x, y: this.defaultCameraPos.y, z: this.defaultCameraPos.z,
      duration: DUR.bootCamera, ease: EASE.power3Out, onUpdate: () => this.controls.update(),
    }, 0);

    loaded.floorMeshes[1].forEach((m, i) => {
      tl.to(m.scale, { y: m.userData.origScaleY, duration: 0.5, ease: "back.out(2.2)" }, 0.2 + i * 0.04);
    });
    loaded.floorMeshes[2].forEach((m, i) => {
      tl.to(m.scale, { y: m.userData.origScaleY, duration: 0.5, ease: "back.out(2.2)" }, 0.26 + i * 0.04);
    });

    return tl;
  }

  recenter(): void {
    this.camera.position.copy(this.defaultCameraPos);
    this.controls.target.copy(this.defaultTarget);
    this.controls.update();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.animFrameId);
    cancelAnimationFrame(this.resizeRafId);
    window.removeEventListener("resize", this.onResizeHandler);
    this.disposeDebugLayer();
    this.clearRoute();
    this.routeMaterial.dispose();
    this.controls.dispose();
    this.renderer.dispose();
  }

  private buildPartialPositions(p: number): number[] {
    if (this.routePoints.length < 2) return [];
    const target = this.routeTotalLen * Math.max(0, Math.min(1, p));
    const out: number[] = [];
    out.push(this.routePoints[0].x, this.routePoints[0].y, this.routePoints[0].z);
    let acc = 0;
    for (let i = 1; i < this.routePoints.length; i++) {
      const prev = this.routePoints[i - 1];
      const cur  = this.routePoints[i];
      const seg  = cur.distanceTo(prev);
      if (acc + seg >= target) {
        const t = (target - acc) / seg;
        out.push(prev.x + (cur.x - prev.x) * t,
                 prev.y + (cur.y - prev.y) * t,
                 prev.z + (cur.z - prev.z) * t);
        return out;
      }
      acc += seg;
      out.push(cur.x, cur.y, cur.z);
    }
    return out;
  }

  private clearPin(): void {
    if (this.pinMesh) {
      this.routeLayer.remove(this.pinMesh);
      this.pinMesh.geometry.dispose();
      (this.pinMesh.material as Material).dispose();
      this.pinMesh = null;
    }
    for (const r of this.ringMeshes) {
      this.routeLayer.remove(r);
      r.geometry.dispose();
      (r.material as Material).dispose();
    }
    this.ringMeshes = [];
  }

  private disposeDebugLayer(): void {
    this.debugLayer.children.forEach((child) => {
      if (child instanceof Mesh) {
        child.geometry.dispose();
        (child.material as Material).dispose();
      }
    });
    this.debugLayer.clear();
  }

  private onResize(): void {
    if (this.resizeRafId) return;
    this.resizeRafId = requestAnimationFrame(() => {
      this.resizeRafId = 0;
      if (this.disposed) return;
      const w = window.innerWidth;
      const h = window.innerHeight;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h, false);
      this.routeMaterial.resolution.set(w, h);
    });
  }

  private animate = (): void => {
    if (this.disposed) return;
    this.animFrameId = requestAnimationFrame(this.animate);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };
}
