import { useEffect, useRef } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

import type { Node } from "@/services/cfsm/types";
import {
  assignFamilies,
  evolutionStage,
  hashString,
  readStages,
  wildFamily,
  writeStages,
} from "@/services/park/assignment";
import { loadGroundMap, pickGroundPoints, type GroundMap } from "@/services/park/placement";
import {
  loadRoster,
  MAX_PARK_NODES,
  resolveAssetPath,
  type Roster,
  type RosterFamily,
} from "@/services/park/roster";
import { resolveThemeAsset } from "@/services/themeAssets";

/**
 * 背景插画的原生尺寸。整个 3D 舞台按这个比例固定，
 * 这样视口怎么变，角色和画里小岛的相对位置都不漂。
 */
const IMAGE_WIDTH = 1920;
const IMAGE_HEIGHT = 1600;
/** 角色在场景里的目标高度（世界单位）。 */
const CHARACTER_HEIGHT = 0.62;
/** 名字标签的字号系数（相对 canvas 像素 → 世界单位）。 */
const LABEL_SCALE = 0.0026;

interface Unit {
  key: string;
  family: RosterFamily;
  stage: number;
  formFile: string;
  holder: THREE.Group;
  cell: THREE.Group;
  label: THREE.Sprite;
  mixer: THREE.AnimationMixer | null;
  loadSeq: number;
  online: boolean;
}

interface SceneState {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  units: Map<string, Unit>;
  mixers: THREE.AnimationMixer[];
  taken: Set<string>;
  stageMem: Record<string, number>;
  loader: GLTFLoader;
  clock: THREE.Clock;
  visible: boolean;
  disposed: boolean;
}

function hash01(seed: string): number {
  return (hashString(seed) % 10000) / 10000;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

/** 生成名字标签贴图（半透明底板 + 文字，任何背景上都看得清）。 */
function makeLabel(text: string, online: boolean): THREE.Sprite {
  const padding = 9;
  const fontSize = 30;
  const font = `600 ${fontSize}px ui-sans-serif, system-ui, sans-serif`;
  const measure = document.createElement("canvas").getContext("2d")!;
  measure.font = font;

  const width = Math.ceil(measure.measureText(text).width) + padding * 2;
  const height = fontSize + padding * 2;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d")!;
  ctx.font = font;
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.fillStyle = online ? "rgba(10,16,30,0.66)" : "rgba(46,46,56,0.58)";
  roundRect(ctx, 1, 1, width - 2, height - 2, height / 2);
  ctx.fill();
  ctx.fillStyle = online ? "#ffffff" : "rgba(255,255,255,0.7)";
  ctx.fillText(text, width / 2, height / 2 + 1);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(width * LABEL_SCALE, height * LABEL_SCALE, 1);
  return sprite;
}

/** 释放一棵子树里的几何 / 材质 / 贴图。 */
function disposeObject(root: THREE.Object3D): void {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(material)) material.forEach((item) => item.dispose());
    else material?.dispose();
  });
}

export function ParkScene({
  nodes,
  evolutionDays,
  parkExtra,
  reduceMotion,
  backgroundUrl,
  assetBase,
}: {
  nodes: Node[];
  evolutionDays: number;
  parkExtra: number;
  reduceMotion: boolean;
  backgroundUrl: string;
  /** 模型与名录的托管前缀；留空表示跟主题同源。 */
  assetBase: string;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<SceneState | null>(null);
  const rosterRef = useRef<Roster | null>(null);
  const groundMapRef = useRef<GroundMap | null>(null);
  const propsRef = useRef({ nodes, evolutionDays, parkExtra, reduceMotion, assetBase });
  propsRef.current = { nodes, evolutionDays, parkExtra, reduceMotion, assetBase };

  /* ------------------------------ 初始化 ------------------------------ */
  useEffect(() => {
    const wrap = wrapRef.current;
    const stage = stageRef.current;
    if (!wrap || !stage) return;

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.display = "block";
    stage.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    // 舞台比例固定后，这套相机参数在任意视口下给出的构图都一样。
    const camera = new THREE.PerspectiveCamera(26, IMAGE_WIDTH / IMAGE_HEIGHT, 0.1, 200);
    camera.position.set(0, 7.4, 9.2);
    camera.lookAt(0, 0.5, 0.1);

    // 一盏主光 + 半球光补环境，尽量贴近插画那种柔和的日光。
    const key = new THREE.DirectionalLight(0xfff4e0, 2.6);
    key.position.set(4, 8, 6);
    scene.add(key);
    scene.add(new THREE.HemisphereLight(0xffe9f5, 0x9fd8ff, 1.7));

    const state: SceneState = {
      renderer,
      scene,
      camera,
      units: new Map<string, Unit>(),
      mixers: [],
      taken: new Set<string>(),
      stageMem: readStages(),
      loader: new GLTFLoader(),
      clock: new THREE.Clock(),
      visible: true,
      disposed: false,
    };
    sceneRef.current = state;

    const resize = () => {
      const cw = wrap.clientWidth;
      const ch = wrap.clientHeight;
      if (cw === 0 || ch === 0) return;
      // 取能塞进容器的最大 1080:899 矩形：背景图不裁切，3D 与插画始终对齐。
      const scale = Math.min(cw / IMAGE_WIDTH, ch / IMAGE_HEIGHT);
      const width = Math.max(1, Math.round(IMAGE_WIDTH * scale));
      const height = Math.max(1, Math.round(IMAGE_HEIGHT * scale));
      stage.style.width = `${width}px`;
      stage.style.height = `${height}px`;
      renderer.setSize(width, height, false);
      camera.aspect = IMAGE_WIDTH / IMAGE_HEIGHT;
      camera.updateProjectionMatrix();
    };
    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(wrap);

    // 不可见 / 页面隐藏时停掉渲染循环，别白烧 GPU。
    const intersection = new IntersectionObserver(
      ([entry]) => {
        state.visible = entry.isIntersecting;
      },
      { threshold: 0.01 },
    );
    intersection.observe(wrap);

    const onVisibility = () => {
      if (document.hidden) state.clock.stop();
      else state.clock.start();
    };
    document.addEventListener("visibilitychange", onVisibility);

    let frame = 0;
    const tick = () => {
      frame = requestAnimationFrame(tick);
      if (state.disposed || !state.visible || document.hidden) return;
      const delta = Math.min(state.clock.getDelta(), 0.1);
      for (const mixer of state.mixers) mixer.update(delta);
      renderer.render(scene, camera);
    };
    frame = requestAnimationFrame(tick);

    return () => {
      state.disposed = true;
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      intersection.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      for (const unit of state.units.values()) {
        unit.mixer?.stopAllAction();
        disposeObject(unit.holder);
        unit.label.material.map?.dispose();
        unit.label.material.dispose();
      }
      state.units.clear();
      renderer.dispose();
      renderer.domElement.remove();
      sceneRef.current = null;
    };
  }, []);

  /* ------------------------------ 解析背景图站位 ------------------------------ */
  useEffect(() => {
    let cancelled = false;
    groundMapRef.current = null;
    if (!backgroundUrl) return;
    loadGroundMap(resolveThemeAsset(backgroundUrl, assetBase)).then((map) => {
      if (cancelled) return;
      groundMapRef.current = map;
      syncRef.current();
    });
    return () => {
      cancelled = true;
    };
  }, [backgroundUrl, assetBase]);

  /* ------------------------------ 载入名录 ------------------------------ */
  useEffect(() => {
    let cancelled = false;
    loadRoster(assetBase)
      .then((roster) => {
        if (cancelled) return;
        rosterRef.current = roster;
        syncRef.current();
      })
      .catch(() => {
        // 名录拿不到就只是没有角色，页面其它部分照常。
      });
    return () => {
      cancelled = true;
    };
  }, [assetBase]);

  /* ------------------------------ 同步角色 ------------------------------ */
  const syncRef = useRef<() => void>(() => {});
  syncRef.current = () => {
    const state = sceneRef.current;
    const roster = rosterRef.current;
    if (!state || !roster) return;

    const {
      nodes: currentNodes,
      evolutionDays: days,
      parkExtra: extra,
      assetBase: base,
    } = propsRef.current;

    const visibleNodes = currentNodes.filter((node) => !node.hidden).slice(0, MAX_PARK_NODES);
    const assignment = assignFamilies(roster, visibleNodes);

    const desired = new Set<string>(visibleNodes.map((node) => `n${node.id}`));
    for (let i = 0; i < extra; i += 1) desired.add(`w${i}`);

    // 移除不再需要的角色。
    for (const [key, unit] of [...state.units]) {
      if (desired.has(key)) continue;
      state.scene.remove(unit.holder);
      unit.mixer?.stopAllAction();
      const index = unit.mixer ? state.mixers.indexOf(unit.mixer) : -1;
      if (index >= 0) state.mixers.splice(index, 1);
      disposeObject(unit.holder);
      unit.label.material.map?.dispose();
      unit.label.material.dispose();
      state.units.delete(key);
      state.taken.delete(unit.family.id);
    }

    const total = visibleNodes.length + extra;
    // 从背景插画里挑可站立的点，再反投影到地面。
    const points = pickGroundPoints(groundMapRef.current, total, 0);
    const raycaster = new THREE.Raycaster();
    const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const hit = new THREE.Vector3();
    state.camera.updateMatrixWorld();

    const place = (unit: Unit, index: number, seed: string) => {
      const point = points[index];
      if (point) {
        const ndc = new THREE.Vector2(
          (point.u / IMAGE_WIDTH) * 2 - 1,
          -(point.v / IMAGE_HEIGHT) * 2 + 1,
        );
        raycaster.setFromCamera(ndc, state.camera);
        if (raycaster.ray.intersectPlane(groundPlane, hit)) {
          unit.holder.position.set(hit.x, 0, hit.z);
        }
      }
      // 大致面向镜头，再加一点个体差异。
      unit.holder.rotation.y = (hash01(`${seed}r`) - 0.5) * 1.1;
      unit.label.position.set(0, CHARACTER_HEIGHT * 1.5, 0);
    };

    let index = 0;
    for (const node of visibleNodes) {
      const key = `n${node.id}`;
      const family = assignment.get(node.id);
      if (!family) continue;
      let unit = state.units.get(key);
      if (!unit) {
        unit = createUnit(key, family, node.metrics.online);
        state.units.set(key, unit);
        state.taken.add(family.id);
        state.scene.add(unit.holder);
      }
      unit.online = node.metrics.online;
      place(unit, index, key);
      index += 1;

      const remembered = state.stageMem[node.id] ?? 0;
      const nextStage = evolutionStage(family, node, remembered, days);
      if (nextStage !== unit.stage) {
        unit.stage = nextStage;
        state.stageMem[node.id] = nextStage;
        void loadForm(state, unit, family.forms[nextStage]?.file, base);
      }
    }

    for (let i = 0; i < extra; i += 1) {
      const key = `w${i}`;
      const family = wildFamily(roster, i);
      if (!family) continue;
      let unit = state.units.get(key);
      if (!unit) {
        unit = createUnit(key, family, true);
        state.units.set(key, unit);
        state.taken.add(family.id);
        state.scene.add(unit.holder);
      }
      place(unit, index, key);
      index += 1;
      const remembered = state.stageMem[key] ?? Math.floor(hash01(key) * family.forms.length);
      const nextStage = evolutionStage(family, null, remembered, days);
      if (nextStage !== unit.stage) {
        unit.stage = nextStage;
        state.stageMem[key] = nextStage;
        void loadForm(state, unit, family.forms[nextStage]?.file, base);
      }
    }

    writeStages(state.stageMem);
  };

  useEffect(() => {
    syncRef.current();
  }, [nodes, evolutionDays, parkExtra, reduceMotion, assetBase, backgroundUrl]);

  return (
    <div ref={wrapRef} className="absolute inset-0 grid place-items-center overflow-hidden">
      <div
        ref={stageRef}
        className="relative overflow-hidden shadow-2xl"
        style={{
          backgroundImage: backgroundUrl
            ? `url("${resolveThemeAsset(backgroundUrl, assetBase)}")`
            : undefined,
          backgroundSize: "100% 100%",
          backgroundRepeat: "no-repeat",
        }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * 场景操作
 * ------------------------------------------------------------------ */

function createUnit(key: string, family: RosterFamily, online: boolean): Unit {
  const holder = new THREE.Group();
  const cell = new THREE.Group();
  holder.add(cell);
  const label = makeLabel(family.name, online);
  holder.add(label);
  return {
    key,
    family,
    stage: -1,
    formFile: "",
    holder,
    cell,
    label,
    mixer: null,
    loadSeq: 0,
    online,
  };
}

async function loadForm(
  state: SceneState,
  unit: Unit,
  file: string | undefined,
  assetBase: string,
): Promise<void> {
  if (!file || file === unit.formFile) return;
  const seq = ++unit.loadSeq;
  unit.formFile = file;
  try {
    const gltf = await state.loader.loadAsync(resolveAssetPath(file, assetBase));
    if (state.disposed || unit.loadSeq !== seq) {
      disposeObject(gltf.scene);
      return;
    }
    // 清掉上一个形态。
    for (const child of [...unit.cell.children]) {
      unit.cell.remove(child);
      disposeObject(child);
    }
    if (unit.mixer) {
      unit.mixer.stopAllAction();
      const index = state.mixers.indexOf(unit.mixer);
      if (index >= 0) state.mixers.splice(index, 1);
      unit.mixer = null;
    }

    const model = gltf.scene;
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    if (size.y <= 1e-6) throw new Error("模型高度为 0");
    const scale = CHARACTER_HEIGHT / size.y;
    const center = box.getCenter(new THREE.Vector3());
    model.scale.setScalar(scale);
    model.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);
    unit.cell.add(model);

    const clip = gltf.animations[0];
    if (clip) {
      const mixer = new THREE.AnimationMixer(model);
      mixer.clipAction(clip).reset().play();
      unit.mixer = mixer;
      state.mixers.push(mixer);
    }
  } catch {
    if (unit.loadSeq !== seq) return;
    // 单个模型加载失败不影响其它角色。
    unit.formFile = "";
  }
}
