import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { hexToRgb } from "../core/color";
import type { BeadColor, GeometrySettings, PixelGrid, PixelLayer } from "../types";

interface Props {
  grid?: PixelGrid;
  layers?: PixelLayer[];
  colors: BeadColor[];
  geometry: GeometrySettings;
  theme: "light" | "dark";
}

interface Runtime {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  model: THREE.Group | null;
  frame: number;
  lastCameraFrameKey: string | null;
}

function colorNumber(hex: string): number {
  const rgb = hexToRgb(hex);
  return (rgb.r << 16) + (rgb.g << 8) + rgb.b;
}

function disposeObject(object: THREE.Object3D): void {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const material = mesh.material;
    if (Array.isArray(material)) {
      material.forEach((item) => item.dispose());
    } else if (material) {
      material.dispose();
    }
  });
}

interface SafePreviewGeometry {
  blockSize: number;
  fitGap: number;
  blockHeight: number;
  plateHeight: number;
  blockChamfer: number;
  gridLineWidth: number;
}

interface BoundaryRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

interface FilledBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function safePreviewGeometry(geometry: GeometrySettings): SafePreviewGeometry {
  const blockSize = Math.max(0.5, geometry.blockSize);
  const gridLineWidth = Math.max(0.05, Math.min(geometry.gridLineWidth, blockSize * 0.9));
  const maxGap = Math.max(0, (blockSize - gridLineWidth) / 2 - 0.05);
  return {
    blockSize,
    fitGap: Math.max(0, Math.min(geometry.fitGap, maxGap)),
    blockHeight: Math.max(0.1, geometry.blockHeight),
    plateHeight: Math.max(0.1, geometry.plateHeight),
    blockChamfer: Math.max(0, Math.min(geometry.blockChamfer, blockSize / 2, geometry.blockHeight / 2)),
    gridLineWidth,
  };
}

function cellPitch(safe: SafePreviewGeometry): number {
  return safe.blockSize + safe.fitGap * 2 + safe.gridLineWidth;
}

function mergeIntervals<T extends { start: number; end: number }>(intervals: T[]): T[] {
  const sorted = intervals.slice().sort((a, b) => a.start - b.start);
  const merged: T[] = [];
  for (const interval of sorted) {
    const last = merged[merged.length - 1];
    if (last && interval.start <= last.end + 1e-9) {
      last.end = Math.max(last.end, interval.end);
    } else {
      merged.push({ ...interval });
    }
  }
  return merged;
}

function filledBounds(grid: PixelGrid): FilledBounds | null {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (let y = 0; y < grid.height; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      if (!grid.cells[y * grid.width + x]) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  return Number.isFinite(minX) ? { minX, minY, maxX, maxY } : null;
}

function unionFilledBounds(grids: PixelGrid[]): FilledBounds | null {
  let union: FilledBounds | null = null;
  for (const grid of grids) {
    const bounds = filledBounds(grid);
    if (!bounds) continue;
    union = union
      ? {
          minX: Math.min(union.minX, bounds.minX),
          minY: Math.min(union.minY, bounds.minY),
          maxX: Math.max(union.maxX, bounds.maxX),
          maxY: Math.max(union.maxY, bounds.maxY),
        }
      : bounds;
  }
  return union;
}

function layerZOffset(index: number, total: number, layerStep: number): number {
  return Math.max(0, total - 1 - index) * layerStep;
}

function latticeRects(grid: PixelGrid, safe: SafePreviewGeometry, bounds = filledBounds(grid)): BoundaryRect[] {
  if (!bounds) return [];
  const pitch = cellPitch(safe);
  const vertical = new Map<string, Array<{ start: number; end: number; x0: number; x1: number }>>();
  const horizontal = new Map<string, Array<{ start: number; end: number; y0: number; y1: number }>>();
  const filled = (x: number, y: number) => x >= 0 && y >= 0 && x < grid.width && y < grid.height && Boolean(grid.cells[y * grid.width + x]);
  const addInterval = <T,>(map: Map<string, T[]>, key: string, interval: T) => {
    const current = map.get(key);
    if (current) current.push(interval);
    else map.set(key, [interval]);
  };

  for (let y = 0; y < grid.height; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      if (!filled(x, y)) continue;
      const localX = x - bounds.minX;
      const localY = y - bounds.minY;
      const x0 = localX * pitch;
      const x1 = (localX + 1) * pitch + safe.gridLineWidth;
      const y0 = localY * pitch;
      const y1 = (localY + 1) * pitch + safe.gridLineWidth;
      const left = localX * pitch;
      const right = (localX + 1) * pitch;
      const top = localY * pitch;
      const bottom = (localY + 1) * pitch;

      addInterval(vertical, `${left}`, { start: y0, end: y1, x0: left, x1: left + safe.gridLineWidth });
      addInterval(vertical, `${right}`, { start: y0, end: y1, x0: right, x1: right + safe.gridLineWidth });
      addInterval(horizontal, `${top}`, { start: x0, end: x1, y0: top, y1: top + safe.gridLineWidth });
      addInterval(horizontal, `${bottom}`, { start: x0, end: x1, y0: bottom, y1: bottom + safe.gridLineWidth });
    }
  }

  const rects: BoundaryRect[] = [];
  for (const intervals of vertical.values()) {
    for (const interval of mergeIntervals(intervals)) {
      rects.push({
        x0: interval.x0,
        y0: interval.start,
        x1: interval.x1,
        y1: interval.end,
      });
    }
  }
  for (const intervals of horizontal.values()) {
    for (const interval of mergeIntervals(intervals)) {
      rects.push({
        x0: interval.start,
        y0: interval.y0,
        x1: interval.end,
        y1: interval.y1,
      });
    }
  }
  return rects;
}

function activeLayerColors(layer: PixelLayer): BeadColor[] {
  return layer.colorGroups.find((group) => group.id === layer.activeColorGroupId)?.colors ?? layer.colorGroups[0]?.colors ?? [];
}

function createModel(grids: Array<{ id: string; grid: PixelGrid; colors: BeadColor[] }>, geometry: GeometrySettings): THREE.Group {
  const group = new THREE.Group();
  const safe = safePreviewGeometry(geometry);
  const fallbackGrid = grids[0]?.grid ?? { width: 24, height: 24, cells: [] };
  const pitch = cellPitch(safe);
  const layerStep = Math.max(safe.blockHeight, safe.plateHeight);

  grids.forEach(({ grid, colors }, layerIndex) => {
    const zOffset = layerZOffset(layerIndex, grids.length, layerStep);
    const bounds = { minX: 0, minY: 0, maxX: Math.max(0, grid.width - 1), maxY: Math.max(0, grid.height - 1) };
    const centerX = (grid.width * pitch + safe.gridLineWidth) / 2;
    const centerY = (grid.height * pitch + safe.gridLineWidth) / 2;
    for (const color of colors) {
      if (!color.enabled) continue;
      const indexes = grid.cells.map((cell, index) => (cell === color.id ? index : -1)).filter((index) => index >= 0);
      if (indexes.length === 0) continue;

      const cubeGeometry =
        safe.blockChamfer > 0
          ? new RoundedBoxGeometry(safe.blockSize, safe.blockSize, safe.blockHeight, 2, safe.blockChamfer)
          : new THREE.BoxGeometry(safe.blockSize, safe.blockSize, safe.blockHeight);
      const material = new THREE.MeshStandardMaterial({
        color: colorNumber(color.hex),
        roughness: 0.56,
        metalness: 0.02
      });
      const mesh = new THREE.InstancedMesh(cubeGeometry, material, indexes.length);
      const matrix = new THREE.Matrix4();

      indexes.forEach((index, instanceIndex) => {
        const x = index % grid.width;
        const y = Math.floor(index / grid.width);
        matrix.makeTranslation(
          x * pitch + safe.gridLineWidth + safe.fitGap + safe.blockSize / 2 - centerX,
          -(y * pitch + safe.gridLineWidth + safe.fitGap + safe.blockSize / 2 - centerY),
          zOffset + safe.blockHeight / 2
        );
        mesh.setMatrixAt(instanceIndex, matrix);
      });

      mesh.instanceMatrix.needsUpdate = true;
      group.add(mesh);
    }

    const latticeMaterial = new THREE.MeshStandardMaterial({
      color: 0x111111,
      roughness: 0.72,
      metalness: 0.02
    });

    for (const rect of latticeRects(grid, safe, bounds)) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(rect.x1 - rect.x0, rect.y1 - rect.y0, safe.plateHeight), latticeMaterial);
      bar.position.set((rect.x0 + rect.x1) / 2 - centerX, -((rect.y0 + rect.y1) / 2 - centerY), zOffset + safe.plateHeight / 2);
      group.add(bar);
    }
  });

  return group;
}

function cssColor(element: Element, name: string, fallback: string): string {
  return getComputedStyle(element).getPropertyValue(name).trim() || fallback;
}

function themedThreeBackground(host: Element, theme: Props["theme"]): string {
  const fallback = theme === "light" ? "#ffffff" : "#11171e";
  const cssValue = cssColor(host, "--three-bg", fallback);
  return theme === "dark" && cssValue.toLowerCase() === "#ffffff" ? fallback : cssValue;
}

export function ThreePreview({ grid, layers, colors, geometry, theme }: Props): JSX.Element {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const runtimeRef = useRef<Runtime | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;

    const scene = new THREE.Scene();
    const background = themedThreeBackground(host, theme);
    scene.background = new THREE.Color(background);

    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 5000);
    camera.up.set(0, 0, 1);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(background);
    host.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.PAN,
      RIGHT: THREE.MOUSE.PAN,
    };

    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const key = new THREE.DirectionalLight(0xffffff, 1.35);
    key.position.set(120, -160, 220);
    scene.add(key);

    const resize = () => {
      const rect = host.getBoundingClientRect();
      renderer.setSize(Math.max(1, rect.width), Math.max(1, rect.height), false);
      camera.aspect = Math.max(1, rect.width) / Math.max(1, rect.height);
      camera.updateProjectionMatrix();
    };

    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();

    runtimeRef.current = { renderer, scene, camera, controls, model: null, frame: 0, lastCameraFrameKey: null };

    const animate = () => {
      const runtime = runtimeRef.current;
      if (!runtime) return;
      runtime.controls.update();
      runtime.renderer.render(runtime.scene, runtime.camera);
      runtime.frame = requestAnimationFrame(animate);
    };
    runtimeRef.current.frame = requestAnimationFrame(animate);

    return () => {
      const runtime = runtimeRef.current;
      if (!runtime) return;
      cancelAnimationFrame(runtime.frame);
      observer.disconnect();
      runtime.controls.dispose();
      if (runtime.model) disposeObject(runtime.model);
      runtime.renderer.dispose();
      runtime.renderer.domElement.remove();
      runtimeRef.current = null;
    };
  }, []);

  useEffect(() => {
    const runtime = runtimeRef.current;
    const host = hostRef.current;
    if (!runtime || !host) return;
    const background = themedThreeBackground(host, theme);
    runtime.scene.background = new THREE.Color(background);
    runtime.renderer.setClearColor(background);
  }, [theme]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;

    if (runtime.model) {
      runtime.scene.remove(runtime.model);
      disposeObject(runtime.model);
    }

    const previewLayers = layers && layers.length > 0 ? layers.map((layer) => ({ id: layer.id, grid: layer.grid, colors: activeLayerColors(layer) })) : grid ? [{ id: "grid", grid, colors }] : [];
    const model = createModel(previewLayers, geometry);
    runtime.model = model;
    runtime.scene.add(model);

    const safe = safePreviewGeometry(geometry);
    const bounds = unionFilledBounds(previewLayers.map((item) => item.grid));
    const fallbackGrid = previewLayers[0]?.grid ?? grid ?? { width: 24, height: 24, cells: [] };
    const width = bounds ? bounds.maxX - bounds.minX + 1 : fallbackGrid.width;
    const height = bounds ? bounds.maxY - bounds.minY + 1 : fallbackGrid.height;
    const cameraFrameKey = JSON.stringify({
      layers: previewLayers.map((layer) => ({ id: layer.id, width: layer.grid.width, height: layer.grid.height })),
      blockSize: geometry.blockSize,
      fitGap: geometry.fitGap,
      blockHeight: geometry.blockHeight,
      plateHeight: geometry.plateHeight,
      gridLineWidth: geometry.gridLineWidth,
    });
    if (runtime.lastCameraFrameKey === cameraFrameKey) {
      runtime.controls.update();
      return;
    }
    runtime.lastCameraFrameKey = cameraFrameKey;
    const span = Math.max(width * safe.blockSize, height * safe.blockSize, 36);
    runtime.camera.position.set(span * 0.72, -span * 1.08, span * 0.78);
    runtime.camera.far = span * 16;
    runtime.camera.updateProjectionMatrix();
    runtime.controls.target.set(0, 0, 0);
    runtime.controls.update();
  }, [geometry, grid, layers, colors]);

  return <div className="three-preview" ref={hostRef} />;
}

