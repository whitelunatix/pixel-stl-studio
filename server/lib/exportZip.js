const { strToU8, zipSync } = require("fflate");
const { normalizeHex } = require("./color");
const { buildLayeredObjMtl, buildObjMtl, layerZOffset, unionBounds } = require("./obj");
const { buildOverviewPng } = require("./overviewPattern");
const { buildPatternPng, countByColor } = require("./pattern");
const { safeGeometry } = require("./stl");
const { buildLayerThreeMf } = require("./threeMf");

const OVERVIEW_CARD_HEIGHT = 390;

function fileSafe(value) {
  return (
    String(value || "")
      .trim()
      .replace(/[^\w\u4e00-\u9fa5-]+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 42) || "bead"
  );
}

function uniqueLayerFolderName(layer, usedNames) {
  const base = fileSafe(layer.name);
  let name = base;
  let suffix = 2;
  while (usedNames.has(name)) {
    name = `${base}_${suffix}`;
    suffix += 1;
  }
  usedNames.add(name);
  return name;
}

function uniqueDisplayName(value, usedNames, fallback) {
  const base = String(value || "").trim() || fallback;
  let name = base;
  let suffix = 2;
  while (usedNames.has(name)) {
    name = `${base}_${suffix}`;
    suffix += 1;
  }
  usedNames.add(name);
  return name;
}

function uniqueLayerId(value, usedIds, fallback) {
  const base = String(value || "").trim() || fallback;
  let id = base;
  let suffix = 2;
  while (usedIds.has(id)) {
    id = `${base}_${suffix}`;
    suffix += 1;
  }
  usedIds.add(id);
  return id;
}

function usedColorIds(grid) {
  return Array.from(new Set(grid.cells.filter(Boolean)));
}

function normalizeProjectLayers(project) {
  if (!Array.isArray(project.layers) || project.layers.length === 0) {
    throw new Error("Invalid project: missing layers");
  }
  const usedNames = new Set();
  const usedIds = new Set();
  return project.layers.map((layer, index) => {
    if (!layer?.grid || !Array.isArray(layer.grid.cells)) {
      throw new Error(`Invalid project: invalid layer grid at ${index + 1}`);
    }
    const name = uniqueDisplayName(layer.name, usedNames, `Layer ${index + 1}`);
    const sourceId = String(layer.id || `layer-${index + 1}`).trim() || `layer-${index + 1}`;
    const id = uniqueLayerId(sourceId, usedIds, `layer-${index + 1}`);
    const normalized = {
      ...layer,
      id,
      name,
      visible: layer.visible !== false,
      colorGroups: Array.isArray(layer.colorGroups) ? layer.colorGroups : Array.isArray(project.colorGroups) ? project.colorGroups : [],
      activeColorGroupId: typeof layer.activeColorGroupId === "string" ? layer.activeColorGroupId : typeof project.activeColorGroupId === "string" ? project.activeColorGroupId : "",
      imageColorGroup: layer.imageColorGroup ?? null,
      selectedColorId: typeof layer.selectedColorId === "string" ? layer.selectedColorId : "",
    };
    Object.defineProperty(normalized, "__sourceLayerId", {
      value: sourceId,
      enumerable: false,
      configurable: false,
      writable: false,
    });
    return normalized;
  });
}

function normalizeExportProject(project) {
  if (!project || typeof project !== "object") {
    throw new Error("Invalid project");
  }
  const layers = normalizeProjectLayers(project);
  const colorGroups = Array.isArray(project.colorGroups) ? project.colorGroups : [];
  const activeColorGroupId =
    typeof project.activeColorGroupId === "string" && colorGroups.some((group) => group.id === project.activeColorGroupId)
      ? project.activeColorGroupId
      : colorGroups[0]?.id ?? "";
  const activeLayerId =
    typeof project.activeLayerId === "string" && layers.some((layer) => layer.id === project.activeLayerId)
      ? project.activeLayerId
      : layers[0].id;
  const editor = project.editor && typeof project.editor === "object" ? project.editor : {};
  return {
    ...project,
    version: 1,
    layers,
    activeLayerId,
    colorGroups,
    activeColorGroupId,
    imageColorGroup: project.imageColorGroup ?? null,
    geometry: project.geometry ?? {},
    editor,
  };
}

function layerActiveColors(layer) {
  const groups = Array.isArray(layer.colorGroups) ? layer.colorGroups : [];
  const group = groups.find((item) => item.id === layer.activeColorGroupId) ?? groups[0] ?? { colors: [] };
  return Array.isArray(group.colors) ? group.colors.map((color) => ({ ...color, hex: normalizeHex(color.hex) })) : [];
}

function layerActiveColorGroupName(layer) {
  const groups = Array.isArray(layer.colorGroups) ? layer.colorGroups : [];
  const group = groups.find((item) => item.id === layer.activeColorGroupId) ?? groups[0] ?? null;
  return typeof group?.name === "string" && group.name.trim() ? group.name.trim() : "";
}

function colorUsageForLayers(layers) {
  const counts = new Map();
  for (const layer of layers) {
    for (const [id, count] of countByColor(layer.grid)) {
      const color = layerActiveColors(layer).find((item) => item.id === id);
      const key = color ? `${layer.id}:${color.id}` : `${layer.id}:${id}`;
      counts.set(key, (counts.get(key) ?? 0) + count);
    }
  }
  return counts;
}

function usedColorsForLayer(layer) {
  const used = new Set(usedColorIds(layer.grid));
  return layerActiveColors(layer).filter((color) => used.has(color.id));
}

function usedColorsForLayers(layers) {
  return layers.flatMap((layer) => usedColorsForLayer(layer).map((color) => ({ ...color, layerId: layer.id })));
}

function normalizeExportOptions(options, layers) {
  const hasLayerIds = Boolean(options && Object.prototype.hasOwnProperty.call(options, "layerIds"));
  const requestedLayerIds = new Set(Array.isArray(options?.layerIds) ? options.layerIds.map((id) => String(id)) : []);
  const layerIds = hasLayerIds
    ? layers.filter((layer) => requestedLayerIds.has(layer.id) || requestedLayerIds.has(layer.__sourceLayerId)).map((layer) => layer.id)
    : layers.map((layer) => layer.id);
  if (layerIds.length === 0) {
    throw new Error("Invalid export options: no selected layers");
  }
  const hasLegacyPng = options && Object.prototype.hasOwnProperty.call(options, "includePng");
  const legacyPng = hasLegacyPng ? options.includePng !== false : undefined;
  const includePatternPng = options?.includePatternPng ?? legacyPng ?? true;
  const includeBeadPng = options?.includeBeadPng ?? legacyPng ?? true;
  const includeHammerPng = options?.includeHammerPng ?? false;
  const includeOverviewPng = options?.includeOverviewPng === true && layerIds.length >= 2;
  const overviewColumns = Math.min(6, Math.max(1, Math.round(Number(options?.overviewColumns) || 2)));
  const zipBaseName = String(options?.zipFileName || "")
    .replace(/\.zip$/i, "")
    .trim();
  return {
    layerIds,
    includeObj: options?.includeObj !== false,
    include3mf: options?.include3mf !== false,
    includePatternPng: includePatternPng !== false,
    includeBeadPng: includeBeadPng === true,
    includeHammerPng: includeHammerPng === true,
    includeOverviewPng,
    overviewColumns,
    overviewCardHeight: OVERVIEW_CARD_HEIGHT,
    overviewTitle: zipBaseName || "Layer Overview",
    includeMeta: options?.includeMeta !== false,
  };
}

async function addLayerExport(entries, manifest, project, layer, colors, bounds, folder, zOffset = 0, options = {}) {
  const counts = countByColor(layer.grid);
  const usedIds = usedColorIds(layer.grid);
  const usedColors = colors.filter((color) => usedIds.includes(color.id));
  const pseudoProject = { ...project, grid: layer.grid };
  const includeObj = options.includeObj !== false;
  const include3mf = options.include3mf !== false;
  const includePatternPng = options.includePatternPng !== false;
  const includeBeadPng = options.includeBeadPng === true;
  const includeHammerPng = options.includeHammerPng === true;
  const includeMeta = options.includeMeta !== false;
  const baseName = fileSafe(options.baseName || layer.name || "layer");
  const patternFileName = `${baseName}.png`;
  const patternPath = `${folder}${patternFileName}`;
  const beadPatternFileName = `${baseName}_beads.png`;
  const beadPatternPath = `${folder}${beadPatternFileName}`;
  const hammerPatternFileName = `${baseName}_hammer.png`;
  const hammerPatternPath = `${folder}${hammerPatternFileName}`;
  const objFile = `${folder}${baseName}.obj`;
  const layerJsonFile = `${folder}${baseName}.json`;
  const threeMfFileName = `${baseName}.3mf`;
  const threeMfPath = `${folder}${threeMfFileName}`;
  const layerFiles = [];
  const addFile = (file) => {
    manifest.files.push(file);
    layerFiles.push(file);
  };

  if (includeObj) {
    const combined = buildObjMtl(pseudoProject, usedColors, {
      bounds,
      zOffset,
      objName: fileSafe(layer.name),
      materialLibrary: null,
      alignToGridCenter: true,
    });
    entries[objFile] = strToU8(combined.obj);
    addFile({
      file: objFile,
      role: "combined",
      name: "Layer all-in-one color model",
      layerId: layer.id,
    });
  }

  if (includePatternPng) {
    entries[patternPath] = await buildPatternPng(pseudoProject, usedColors, { title: layer.name, colorGroupName: layerActiveColorGroupName(layer) });
    addFile({
      file: patternPath,
      role: "pattern",
      name: "General pattern and usage",
      variant: "general",
      layerId: layer.id,
    });
  }

  if (includeBeadPng) {
    entries[beadPatternPath] = await buildPatternPng(pseudoProject, usedColors, {
      title: layer.name,
      colorGroupName: layerActiveColorGroupName(layer),
      variant: "bead",
    });
    addFile({
      file: beadPatternPath,
      role: "bead-pattern",
      name: "Bead-only pattern and usage",
      variant: "bead",
      layerId: layer.id,
    });
  }

  if (includeHammerPng) {
    entries[hammerPatternPath] = await buildPatternPng(pseudoProject, usedColors, {
      title: layer.name,
      colorGroupName: layerActiveColorGroupName(layer),
      variant: "hammer",
    });
    addFile({
      file: hammerPatternPath,
      role: "hammer-pattern",
      name: "Hammer bead compact pattern",
      variant: "hammer",
      layerId: layer.id,
    });
  }

  if (include3mf) {
    const threeMf = await buildLayerThreeMf({ project, layer, colors: usedColors, bounds });
    const threeMfPlates = threeMf.plates.map((plate) => ({
      ...plate,
      sourceStl: plate.sourceStl,
    }));
    entries[threeMfPath] = threeMf.buffer;
    addFile({
      file: threeMfPath,
      role: "bambu-3mf",
      name: "Bambu Studio layer project",
      layerId: layer.id,
      plates: threeMfPlates,
    });
  }

  const layerManifest = {
    version: 1,
    generatedAt: manifest.generatedAt,
    units: "mm",
    layer: {
      id: layer.id,
      name: layer.name,
      visible: layer.visible,
      zOffset,
    },
    grid: {
      width: layer.grid.width,
      height: layer.grid.height,
    },
    geometry: project.geometry,
    colors: usedColors.map((color) => ({
      colorId: color.id,
      code: color.code,
      name: color.name,
      hex: color.hex,
      count: counts.get(color.id) ?? 0,
    })),
    files: layerFiles.map((file) => ({ ...file, file: file.file.replace(folder, "") })),
  };
  if (includeMeta) {
    addFile({
      file: layerJsonFile,
      role: "layer-manifest",
      name: "Layer export manifest",
      layerId: layer.id,
    });
    layerManifest.files = layerFiles.map((file) => ({ ...file, file: file.file.replace(folder, "") }));
    entries[layerJsonFile] = strToU8(JSON.stringify(layerManifest, null, 2));
  }
}

function progressReporter(onProgress) {
  return (progress, label) => {
    if (typeof onProgress === "function") {
      onProgress({ progress: Math.max(0, Math.min(100, Math.round(progress))), label });
    }
  };
}

async function buildExportZip(project, appSettings = null, onProgress = null, exportOptions = null) {
  const report = progressReporter(onProgress);
  report(2, "准备项目");
  const normalizedProject = normalizeExportProject(project);
  const options = normalizeExportOptions(exportOptions, normalizedProject.layers);
  const entries = {};
  const layers = normalizedProject.layers.filter((layer) => options.layerIds.includes(layer.id));
  const bounds = unionBounds(layers.map((layer) => layer.grid));
  const safe = safeGeometry(normalizedProject.geometry);
  const layerStep = Math.max(safe.blockHeight, safe.plateHeight);
  const allUsedColors = usedColorsForLayers(layers);
  const allCounts = colorUsageForLayers(layers);
  const generatedAt = new Date().toISOString();
  const manifest = {
    version: 1,
    generatedAt,
    units: "mm",
    grid: {
      width: layers[0]?.grid.width ?? 0,
      height: layers[0]?.grid.height ?? 0,
    },
    geometry: normalizedProject.geometry,
    layers: layers.map((layer, index) => ({
      id: layer.id,
      name: layer.name,
      visible: layer.visible !== false,
      order: index,
      zOffset: layerZOffset(index, layers.length, layerStep),
      grid: {
        width: layer.grid.width,
        height: layer.grid.height,
      },
    })),
    colors: allUsedColors.map((color) => ({
      colorId: color.id,
      code: color.code,
      name: color.name,
      hex: color.hex,
      layerId: color.layerId,
      count: allCounts.get(`${color.layerId}:${color.id}`) ?? 0,
    })),
    files: [],
  };

  const usedFolderNames = new Set();
  for (const [index, layer] of layers.entries()) {
    report(8 + (index / Math.max(1, layers.length)) * 58, `导出图层 ${index + 1}/${layers.length}`);
    const layerFolderName = uniqueLayerFolderName(layer, usedFolderNames);
    const folder = `${layerFolderName}/`;
    const zOffset = layerZOffset(index, layers.length, layerStep);
    await addLayerExport(entries, manifest, normalizedProject, layer, usedColorsForLayer(layer), bounds, folder, zOffset, {
      baseName: layerFolderName,
      includeObj: options.includeObj,
      include3mf: options.include3mf,
      includePatternPng: options.includePatternPng,
      includeBeadPng: options.includeBeadPng,
      includeHammerPng: options.includeHammerPng,
      includeMeta: options.includeMeta,
    });
    report(8 + ((index + 1) / Math.max(1, layers.length)) * 58, `导出图层 ${index + 1}/${layers.length}`);
  }

  report(70, "生成整体模型");
  if (options.includeOverviewPng) {
    entries["overview.png"] = await buildOverviewPng(normalizedProject, layers, {
      title: options.overviewTitle,
      columns: options.overviewColumns,
      cardHeight: options.overviewCardHeight,
    });
    manifest.files.push({
      file: "overview.png",
      role: "overview-pattern",
      name: "Selected layers overview",
    });
  }

  if (options.includeMeta && options.includeObj) {
    const layered = buildLayeredObjMtl(normalizedProject, layers, allUsedColors);
    entries["meta_data/all_layers.obj"] = strToU8(layered.obj);
    entries["meta_data/all_layers.mtl"] = strToU8(layered.mtl);
    manifest.files.push({
      file: "meta_data/all_layers.obj",
      role: "combined",
      name: "All layers stacked model",
      materialLibrary: "meta_data/all_layers.mtl",
    });
    manifest.files.push({
      file: "meta_data/all_layers.mtl",
      role: "material-library",
      name: "All layers material library",
    });
  }

  report(82, "写入项目配置");
  if (options.includeMeta) {
    entries["meta_data/project.pixel-stl.json"] = strToU8(JSON.stringify({ ...normalizedProject, layers }, null, 2));
    if (appSettings && typeof appSettings === "object") {
      entries["meta_data/app_settings.json"] = strToU8(JSON.stringify(appSettings, null, 2));
    }
    entries["meta_data/manifest.json"] = strToU8(JSON.stringify(manifest, null, 2));
  }
  if (Object.keys(entries).length === 0) {
    throw new Error("Invalid export options: no files selected");
  }
  report(92, "打包 ZIP");
  const zip = Buffer.from(zipSync(entries, { level: 6 }));
  report(100, "完成");
  return zip;
}

module.exports = {
  buildExportZip,
  normalizeExportProject,
};
