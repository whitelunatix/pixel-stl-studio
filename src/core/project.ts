import type { BeadColor, BeadColorGroup, EditorModifiers, EditorSettings, GeometrySettings, PixelGrid, PixelLayer, Project, SourceImage, ToolMode } from "../types";
import { normalizeHex } from "./color";
import { cloneColorGroup } from "./beadPalettes";
import { cloneColorGroups, createBlankGrid, defaultEditorModifiers, DEFAULT_COLOR_GROUPS, DEFAULT_EDITOR, DEFAULT_GEOMETRY, mergeWithDefaultColorGroups } from "./defaults";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function numberIn(value: unknown, fallback: number, min: number, max: number): number {
  const next = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.min(max, Math.max(min, next));
}

function parseColor(value: unknown, index: number, groupId: string): BeadColor | null {
  if (!isRecord(value)) return null;
  const code = typeof value.code === "string" && value.code.trim() ? value.code.trim() : `C${index + 1}`;
  const id = typeof value.id === "string" && value.id.trim() ? value.id : `${groupId}-${code.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return {
    id,
    code,
    name: typeof value.name === "string" && value.name.trim() ? value.name.trim() : code,
    hex: normalizeHex(typeof value.hex === "string" ? value.hex : "#000000"),
    enabled: typeof value.enabled === "boolean" ? value.enabled : true,
    displayUsed:
      typeof value.displayUsed === "boolean"
        ? value.displayUsed
        : typeof value.enabled === "boolean"
          ? value.enabled
          : true,
  };
}

function parseColorGroup(value: unknown, index: number): BeadColorGroup | null {
  if (!isRecord(value)) return null;
  const id = typeof value.id === "string" && value.id.trim() ? value.id : index === 0 ? "default" : `group-${index}`;
  const name = typeof value.name === "string" && value.name.trim() ? value.name.trim() : id;
  const description = typeof value.description === "string" && value.description.trim() ? value.description.trim() : undefined;
  const source = typeof value.source === "string" && value.source.trim() ? value.source.trim() : undefined;
  const colors = Array.isArray(value.colors) ? value.colors.map((item, colorIndex) => parseColor(item, colorIndex, id)).filter((item): item is BeadColor => Boolean(item)) : [];
  return { id, name, description, source, colors };
}

function parseColorGroups(value: unknown): BeadColorGroup[] {
  if (!Array.isArray(value)) return DEFAULT_COLOR_GROUPS.map(cloneColorGroup);
  const groups = value.map(parseColorGroup).filter((group): group is BeadColorGroup => Boolean(group));
  return groups.length > 0 ? mergeWithDefaultColorGroups(groups) : DEFAULT_COLOR_GROUPS.map(cloneColorGroup);
}

function parseGrid(value: unknown, fallback = createBlankGrid()): PixelGrid {
  if (!isRecord(value)) return fallback;
  const width = Math.round(numberIn(value.width, fallback.width, 1, 256));
  const height = Math.round(numberIn(value.height, fallback.height, 1, 256));
  const sourceCells = Array.isArray(value.cells) ? value.cells : [];
  return {
    width,
    height,
    cells: Array.from({ length: width * height }, (_, index) => {
      const cell = sourceCells[index];
      return typeof cell === "string" && cell.trim() ? cell : null;
    }),
  };
}

function parseKernelColorGrid(value: unknown, fallback: PixelGrid): PixelGrid | null {
  if (!isRecord(value)) return null;
  const width = Math.round(numberIn(value.width, fallback.width, 1, 256));
  const height = Math.round(numberIn(value.height, fallback.height, 1, 256));
  if (width !== fallback.width || height !== fallback.height) return null;
  const sourceCells = Array.isArray(value.cells) ? value.cells : [];
  return {
    width,
    height,
    cells: Array.from({ length: width * height }, (_, index) => {
      const cell = sourceCells[index];
      return typeof cell === "string" && cell.trim() ? normalizeHex(cell) : null;
    }),
  };
}

function parseGeometry(value: unknown): GeometrySettings {
  if (!isRecord(value)) return { ...DEFAULT_GEOMETRY };
  const blockSize = numberIn(value.blockSize, DEFAULT_GEOMETRY.blockSize, 0.5, 100);
  const gridLineWidth = numberIn(value.gridLineWidth, DEFAULT_GEOMETRY.gridLineWidth, 0.05, blockSize * 0.9);
  const maxGap = Math.max(0, (blockSize - gridLineWidth) / 2 - 0.05);
  return {
    blockSize,
    fitGap: numberIn(value.fitGap, DEFAULT_GEOMETRY.fitGap, 0, maxGap),
    blockHeight: numberIn(value.blockHeight, DEFAULT_GEOMETRY.blockHeight, 0.1, 100),
    plateHeight: numberIn(value.plateHeight, DEFAULT_GEOMETRY.plateHeight, 0.1, 100),
    blockChamfer: numberIn(value.blockChamfer, DEFAULT_GEOMETRY.blockChamfer, 0, blockSize / 2),
    gridLineWidth,
    alphaThreshold: Math.round(numberIn(value.alphaThreshold, DEFAULT_GEOMETRY.alphaThreshold, 0, 255)),
    componentTolerance: Math.round(numberIn(value.componentTolerance, DEFAULT_GEOMETRY.componentTolerance, 0, 1000000)),
    imageTolerance: numberIn(value.imageTolerance, DEFAULT_GEOMETRY.imageTolerance, 0, 80),
    cropLeft: Math.round(numberIn(value.cropLeft, DEFAULT_GEOMETRY.cropLeft, 0, 1000000)),
    cropTop: Math.round(numberIn(value.cropTop, DEFAULT_GEOMETRY.cropTop, 0, 1000000)),
    cropRight: Math.round(numberIn(value.cropRight, DEFAULT_GEOMETRY.cropRight, 0, 1000000)),
    cropBottom: Math.round(numberIn(value.cropBottom, DEFAULT_GEOMETRY.cropBottom, 0, 1000000)),
    maxGridSize: Math.round(numberIn(value.maxGridSize, DEFAULT_GEOMETRY.maxGridSize, 8, 128)),
  };
}

function parseTool(value: unknown): ToolMode {
  return value === "eraser" || value === "magic-eraser" || value === "paint-bucket" || value === "move" || value === "pan" ? value : "brush";
}

function parseEditorModifiers(value: unknown): EditorModifiers {
  const defaults = defaultEditorModifiers();
  if (!isRecord(value)) return defaults;
  return {
    showCenterGuides: typeof value.showCenterGuides === "boolean" ? value.showCenterGuides : defaults.showCenterGuides,
    highlightColorOutline: typeof value.highlightColorOutline === "boolean" ? value.highlightColorOutline : defaults.highlightColorOutline,
    mirrorDrawX: typeof value.mirrorDrawX === "boolean" ? value.mirrorDrawX : defaults.mirrorDrawX,
    mirrorDrawY: typeof value.mirrorDrawY === "boolean" ? value.mirrorDrawY : defaults.mirrorDrawY,
    mirrorDrawDiagonalPurple: typeof value.mirrorDrawDiagonalPurple === "boolean" ? value.mirrorDrawDiagonalPurple : defaults.mirrorDrawDiagonalPurple,
    mirrorDrawDiagonalGreen: typeof value.mirrorDrawDiagonalGreen === "boolean" ? value.mirrorDrawDiagonalGreen : defaults.mirrorDrawDiagonalGreen,
    rotateDrawHalf: typeof value.rotateDrawHalf === "boolean" ? value.rotateDrawHalf : defaults.rotateDrawHalf,
    rotateDrawQuarter: typeof value.rotateDrawQuarter === "boolean" ? value.rotateDrawQuarter : defaults.rotateDrawQuarter,
  };
}

function parseEditor(value: unknown, fallbackSelectedColorId: string): EditorSettings {
  if (!isRecord(value)) return { ...DEFAULT_EDITOR, modifiers: defaultEditorModifiers(), selectedColorId: fallbackSelectedColorId };
  return {
    tool: parseTool(value.tool),
    selectedColorId: typeof value.selectedColorId === "string" && value.selectedColorId.trim() ? value.selectedColorId : fallbackSelectedColorId,
    zoom: numberIn(value.zoom, DEFAULT_EDITOR.zoom, 0.35, 5),
    offsetX: numberIn(value.offsetX, DEFAULT_EDITOR.offsetX, -10000, 10000),
    offsetY: numberIn(value.offsetY, DEFAULT_EDITOR.offsetY, -10000, 10000),
    modifiers: parseEditorModifiers(value.modifiers),
  };
}

export function serializeProject(project: Project): string {
  return JSON.stringify(project, null, 2);
}

function parseSourceImage(value: unknown): SourceImage | null {
  return isRecord(value) && typeof value.name === "string" && typeof value.dataUrl === "string"
    ? { name: value.name, dataUrl: value.dataUrl }
    : null;
}

function parseImageCrop(value: unknown): PixelLayer["imageCrop"] {
  if (!isRecord(value)) {
    return {
      cropLeft: DEFAULT_GEOMETRY.cropLeft,
      cropTop: DEFAULT_GEOMETRY.cropTop,
      cropRight: DEFAULT_GEOMETRY.cropRight,
      cropBottom: DEFAULT_GEOMETRY.cropBottom,
    };
  }
  return {
    cropLeft: Math.round(numberIn(value.cropLeft, DEFAULT_GEOMETRY.cropLeft, 0, 1000000)),
    cropTop: Math.round(numberIn(value.cropTop, DEFAULT_GEOMETRY.cropTop, 0, 1000000)),
    cropRight: Math.round(numberIn(value.cropRight, DEFAULT_GEOMETRY.cropRight, 0, 1000000)),
    cropBottom: Math.round(numberIn(value.cropBottom, DEFAULT_GEOMETRY.cropBottom, 0, 1000000)),
  };
}

function layerPalette(value: Record<string, unknown>, fallbackColorGroups: BeadColorGroup[]) {
  const colorGroups = Array.isArray(value.colorGroups) ? parseColorGroups(value.colorGroups) : cloneColorGroups(fallbackColorGroups);
  const activeColorGroupId =
    typeof value.activeColorGroupId === "string" && colorGroups.some((group) => group.id === value.activeColorGroupId)
      ? value.activeColorGroupId
      : colorGroups[0]?.id ?? "";
  const activeGroup = colorGroups.find((group) => group.id === activeColorGroupId) ?? colorGroups[0];
  const selectedColorId =
    typeof value.selectedColorId === "string" && activeGroup?.colors.some((color) => color.id === value.selectedColorId)
      ? value.selectedColorId
      : activeGroup?.colors[0]?.id ?? "";
  return {
    colorGroups,
    activeColorGroupId,
    imageColorGroup: parseColorGroup(value.imageColorGroup, 0),
    selectedColorId,
  };
}

function parseLayer(value: unknown, index: number, fallbackGrid: PixelGrid, fallbackColorGroups: BeadColorGroup[]): PixelLayer | null {
  if (!isRecord(value)) return null;
  const grid = parseGrid(value.grid, fallbackGrid);
  const id = typeof value.id === "string" && value.id.trim() ? value.id : `layer-${index + 1}`;
  const name = typeof value.name === "string" && value.name.trim() ? value.name.trim() : `图层 ${index + 1}`;
  return {
    id,
    name,
    visible: typeof value.visible === "boolean" ? value.visible : true,
    ...layerPalette(value, fallbackColorGroups),
    grid,
    kernelColorGrid: parseKernelColorGrid(value.kernelColorGrid, grid),
    sourceImage: parseSourceImage(value.sourceImage),
    imageRotation: Math.round(numberIn(value.imageRotation, 0, 0, 359)),
    imageCrop: parseImageCrop(value.imageCrop),
    imageTolerance: numberIn(value.imageTolerance, DEFAULT_GEOMETRY.imageTolerance, 0, 80),
  };
}

function uniqueLayerId(id: string, used: Set<string>, index: number): string {
  const base = id.trim() || `layer-${index + 1}`;
  let next = base;
  let suffix = 2;
  while (used.has(next)) {
    next = `${base}_${suffix}`;
    suffix += 1;
  }
  used.add(next);
  return next;
}

function normalizeLayerIds(layers: PixelLayer[]): { layers: PixelLayer[]; idMap: Map<string, string[]> } {
  const used = new Set<string>();
  const idMap = new Map<string, string[]>();
  const normalizedLayers = layers.map((layer, index) => {
    const originalId = layer.id;
    const id = uniqueLayerId(originalId, used, index);
    const mapped = idMap.get(originalId) ?? [];
    mapped.push(id);
    idMap.set(originalId, mapped);
    return id === originalId ? layer : { ...layer, id };
  });
  return { layers: normalizedLayers, idMap };
}

function layersFromLegacy(value: Record<string, unknown>, grid: PixelGrid, fallbackColorGroups: BeadColorGroup[]): PixelLayer[] {
  const geometry = parseGeometry(value.geometry);
  const palette = layerPalette(
    {
      colorGroups: fallbackColorGroups,
      activeColorGroupId: value.activeColorGroupId,
      imageColorGroup: value.imageColorGroup,
      selectedColorId: isRecord(value.editor) ? value.editor.selectedColorId : undefined,
    },
    fallbackColorGroups,
  );
  return [
    {
      id: "layer-1",
      name: "图层 1",
      visible: true,
      ...palette,
      grid,
      kernelColorGrid: parseKernelColorGrid(value.kernelColorGrid, grid),
      sourceImage: parseSourceImage(value.sourceImage),
      imageRotation: 0,
      imageCrop: {
        cropLeft: geometry.cropLeft,
        cropTop: geometry.cropTop,
        cropRight: geometry.cropRight,
        cropBottom: geometry.cropBottom,
      },
      imageTolerance: geometry.imageTolerance,
    },
  ];
}

export function parseProject(json: string): Project {
  const value = JSON.parse(json) as unknown;
  if (!isRecord(value) || value.version !== 1) throw new Error("Unsupported project JSON version");

  const colorGroups = parseColorGroups(value.colorGroups);
  const activeColorGroupId =
    typeof value.activeColorGroupId === "string" && colorGroups.some((group) => group.id === value.activeColorGroupId) ? value.activeColorGroupId : colorGroups[0].id;
  const imageColorGroup = parseColorGroup(value.imageColorGroup, 0);
  const legacyGrid = parseGrid(value.grid);
  const layers = Array.isArray(value.layers)
    ? value.layers.map((item, index) => parseLayer(item, index, legacyGrid, colorGroups)).filter((item): item is PixelLayer => Boolean(item))
    : layersFromLegacy(value, legacyGrid, colorGroups);
  const parsedLayers = layers.length > 0 ? layers : layersFromLegacy(value, legacyGrid, colorGroups);
  const { layers: finalLayers, idMap } = normalizeLayerIds(parsedLayers);
  const mappedActiveLayerId = typeof value.activeLayerId === "string" ? idMap.get(value.activeLayerId)?.[0] : undefined;
  const activeLayerId =
    mappedActiveLayerId && finalLayers.some((layer) => layer.id === mappedActiveLayerId) ? mappedActiveLayerId : finalLayers[0].id;
  const activeLayer = finalLayers.find((layer) => layer.id === activeLayerId) ?? finalLayers[0];

  return {
    version: 1,
    layers: finalLayers,
    activeLayerId,
    colorGroups,
    activeColorGroupId,
    imageColorGroup,
    geometry: parseGeometry(value.geometry),
    editor: parseEditor(value.editor, activeLayer.selectedColorId),
  };
}
