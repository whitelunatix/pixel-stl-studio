import type { BeadColorGroup, EditorSettings, GeometrySettings, PixelGrid, PixelLayer, Project } from "../types";
import { BUILTIN_COLOR_GROUPS, cloneColorGroup } from "./beadPalettes";
import type { EditorModifiers } from "../types";

export const DEFAULT_COLOR_GROUPS: BeadColorGroup[] = BUILTIN_COLOR_GROUPS.map(cloneColorGroup);

export const DEFAULT_GEOMETRY: GeometrySettings = {
  blockSize: 10,
  fitGap: 0.05,
  blockHeight: 10.5,
  plateHeight: 10,
  blockChamfer: 0.5,
  gridLineWidth: 1,
  alphaThreshold: 16,
  componentTolerance: 0,
  imageTolerance: 8,
  cropLeft: 0,
  cropTop: 0,
  cropRight: 0,
  cropBottom: 0,
  maxGridSize: 64,
};

export const DEFAULT_EDITOR: EditorSettings = {
  tool: "brush",
  selectedColorId: DEFAULT_COLOR_GROUPS[0].colors[0]?.id ?? "",
  zoom: 1,
  offsetX: 48,
  offsetY: 48,
  modifiers: {
    showCenterGuides: false,
    highlightColorOutline: true,
    mirrorDrawX: false,
    mirrorDrawY: false,
    mirrorDrawDiagonalPurple: false,
    mirrorDrawDiagonalGreen: false,
    rotateDrawHalf: false,
    rotateDrawQuarter: false,
  },
};

export function defaultEditorModifiers(): EditorModifiers {
  return { ...DEFAULT_EDITOR.modifiers };
}

export function createBlankGrid(width = 24, height = 24): PixelGrid {
  return {
    width,
    height,
    cells: Array.from({ length: width * height }, () => null),
  };
}

export function cloneColorGroups(groups: BeadColorGroup[]): BeadColorGroup[] {
  return groups.map(cloneColorGroup);
}

export function mergeWithDefaultColorGroups(groups: BeadColorGroup[]): BeadColorGroup[] {
  const merged = cloneColorGroups(groups);
  const existingIds = new Set(merged.map((group) => group.id));
  for (const defaultGroup of DEFAULT_COLOR_GROUPS) {
    if (!existingIds.has(defaultGroup.id)) {
      merged.push(cloneColorGroup(defaultGroup));
      existingIds.add(defaultGroup.id);
    }
  }
  return merged;
}

export function createPixelLayer(name = "图层 1", grid = createBlankGrid(), paletteGroups = DEFAULT_COLOR_GROUPS): PixelLayer {
  const colorGroups = cloneColorGroups(paletteGroups);
  const activeColorGroup = colorGroups[0];
  return {
    id: `layer-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    name,
    visible: true,
    colorGroups,
    activeColorGroupId: activeColorGroup?.id ?? "",
    imageColorGroup: null,
    selectedColorId: activeColorGroup?.colors[0]?.id ?? "",
    grid,
    kernelColorGrid: null,
    sourceImage: null,
    imageRotation: 0,
    imageCrop: {
      cropLeft: DEFAULT_GEOMETRY.cropLeft,
      cropTop: DEFAULT_GEOMETRY.cropTop,
      cropRight: DEFAULT_GEOMETRY.cropRight,
      cropBottom: DEFAULT_GEOMETRY.cropBottom,
    },
    imageTolerance: DEFAULT_GEOMETRY.imageTolerance,
  };
}

export function createEmptyProject(): Project {
  const colorGroups = DEFAULT_COLOR_GROUPS.map(cloneColorGroup);
  const activeColorGroup = colorGroups[0];
  const layer = createPixelLayer("图层 1", createBlankGrid(), colorGroups);
  return {
    version: 1,
    layers: [layer],
    activeLayerId: layer.id,
    colorGroups,
    activeColorGroupId: activeColorGroup.id,
    imageColorGroup: null,
    geometry: { ...DEFAULT_GEOMETRY },
    editor: {
      ...DEFAULT_EDITOR,
      modifiers: defaultEditorModifiers(),
      selectedColorId: layer.selectedColorId || (activeColorGroup.colors[0]?.id ?? ""),
    },
  };
}
