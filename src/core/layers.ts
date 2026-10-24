import type { BeadColor, PixelGrid, PixelLayer, Project } from "../types";
import { createBlankGrid, createPixelLayer } from "./defaults";
import { resizeGrid } from "./grid";

export function activeLayer(project: Project): PixelLayer {
  return project.layers.find((layer) => layer.id === project.activeLayerId) ?? project.layers[0];
}

export function updateLayer(project: Project, layerId: string, updater: (layer: PixelLayer) => PixelLayer): Project {
  const layers = project.layers.map((layer) => (layer.id === layerId ? updater(layer) : layer));
  return { ...project, layers };
}

export function updateActiveLayer(project: Project, updater: (layer: PixelLayer) => PixelLayer): Project {
  return updateLayer(project, activeLayer(project).id, updater);
}

export function ensureLayers(project: Project): Project {
  if (project.layers.length > 0 && project.layers.some((layer) => layer.id === project.activeLayerId)) return project;
  const layer = project.layers[0] ?? createPixelLayer("图层 1", createBlankGrid(), project.colorGroups);
  return { ...project, layers: [layer], activeLayerId: layer.id };
}

export function resizeAllLayers(project: Project, width: number, height: number): Project {
  return {
    ...project,
    layers: project.layers.map((layer) => ({
      ...layer,
      grid: resizeGrid(layer.grid, width, height),
      kernelColorGrid: layer.kernelColorGrid ? resizeGrid(layer.kernelColorGrid, width, height) : null,
    })),
  };
}

export function usedColorIdsInLayers(layers: PixelLayer[]): Set<string> {
  const used = new Set<string>();
  for (const layer of layers) {
    for (const cell of layer.grid.cells) {
      if (cell) used.add(cell);
    }
  }
  return used;
}

export function syncColorsToLayerUsage(colors: BeadColor[], layers: PixelLayer[]): BeadColor[] {
  const used = usedColorIdsInLayers(layers);
  return colors
    .map((color, index) => ({ color: { ...color, enabled: used.has(color.id) }, index }))
    .sort((a, b) => Number(b.color.enabled) - Number(a.color.enabled) || a.index - b.index)
    .map((item) => item.color);
}

export function commonGrid(project: Project): PixelGrid {
  return activeLayer(project).grid;
}
