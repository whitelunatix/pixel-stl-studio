const { filledBounds, latticeRects, safeGeometry, fullGridBounds, gridCenterOffset } = require("./stl");
const { hexToRgb, normalizeHex } = require("./color");

function materialName(prefix, color) {
  return `${prefix}_${String(color.code || color.id || "color").replace(/[^\w-]+/g, "_")}_${normalizeHex(color.hex).slice(1).toUpperCase()}`;
}

function kd(hex) {
  const rgb = hexToRgb(normalizeHex(hex));
  return `${(rgb.r / 255).toFixed(6)} ${(rgb.g / 255).toFixed(6)} ${(rgb.b / 255).toFixed(6)}`;
}

function layerZOffset(index, total, layerStep) {
  return Math.max(0, total - 1 - index) * layerStep;
}

function addObjCuboid(state, material, x0, y0, z0, x1, y1, z1) {
  const start = state.vertexCount + 1;
  const vertices = [
    [x0, y0, z0],
    [x1, y0, z0],
    [x1, y1, z0],
    [x0, y1, z0],
    [x0, y0, z1],
    [x1, y0, z1],
    [x1, y1, z1],
    [x0, y1, z1],
  ];
  for (const vertex of vertices) state.lines.push(`v ${vertex[0].toFixed(5)} ${vertex[1].toFixed(5)} ${vertex[2].toFixed(5)}`);
  state.vertexCount += vertices.length;
  state.lines.push(`usemtl ${material}`);
  state.lines.push(`f ${start + 4} ${start + 5} ${start + 6} ${start + 7}`);
  state.lines.push(`f ${start + 3} ${start + 2} ${start + 1} ${start}`);
  state.lines.push(`f ${start} ${start + 1} ${start + 5} ${start + 4}`);
  state.lines.push(`f ${start + 1} ${start + 2} ${start + 6} ${start + 5}`);
  state.lines.push(`f ${start + 2} ${start + 3} ${start + 7} ${start + 6}`);
  state.lines.push(`f ${start + 3} ${start} ${start + 4} ${start + 7}`);
}

function addObjFace(state, material, points) {
  const start = state.vertexCount + 1;
  for (const point of points) state.lines.push(`v ${point[0].toFixed(5)} ${point[1].toFixed(5)} ${point[2].toFixed(5)}`);
  state.vertexCount += points.length;
  state.lines.push(`usemtl ${material}`);
  state.lines.push(`f ${points.map((_, index) => start + index).join(" ")}`);
}

function addObjLatticeRects(state, material, grid, safe, bounds, z0, z1, offset = { x: 0, y: 0 }) {
  for (const rect of latticeRects(grid, safe, bounds)) {
    addObjCuboid(state, material, rect.x0 - offset.x, rect.y0 - offset.y, z0, rect.x1 - offset.x, rect.y1 - offset.y, z1);
  }
}

function addObjChamferedCuboid(state, material, x0, y0, z0, x1, y1, z1, chamfer) {
  const c = Math.min(Math.max(0, chamfer), (x1 - x0) / 2, (y1 - y0) / 2, (z1 - z0) / 2);
  if (c <= 0) {
    addObjCuboid(state, material, x0, y0, z0, x1, y1, z1);
    return;
  }

  const xb = x0 + c;
  const xe = x1 - c;
  const yb = y0 + c;
  const ye = y1 - c;
  const zt = z1 - c;

  addObjFace(state, material, [[x0, y1, z0], [x1, y1, z0], [x1, y0, z0], [x0, y0, z0]]);
  addObjFace(state, material, [[x0, y0, z0], [x1, y0, z0], [x1, y0, zt], [x0, y0, zt]]);
  addObjFace(state, material, [[x1, y0, z0], [x1, y1, z0], [x1, y1, zt], [x1, y0, zt]]);
  addObjFace(state, material, [[x1, y1, z0], [x0, y1, z0], [x0, y1, zt], [x1, y1, zt]]);
  addObjFace(state, material, [[x0, y1, z0], [x0, y0, z0], [x0, y0, zt], [x0, y1, zt]]);

  addObjFace(state, material, [[x0, y0, zt], [x1, y0, zt], [xe, yb, z1], [xb, yb, z1]]);
  addObjFace(state, material, [[x1, y0, zt], [x1, y1, zt], [xe, ye, z1], [xe, yb, z1]]);
  addObjFace(state, material, [[x1, y1, zt], [x0, y1, zt], [xb, ye, z1], [xe, ye, z1]]);
  addObjFace(state, material, [[x0, y1, zt], [x0, y0, zt], [xb, yb, z1], [xb, ye, z1]]);
  addObjFace(state, material, [[xb, yb, z1], [xe, yb, z1], [xe, ye, z1], [xb, ye, z1]]);
}

function buildObjMtl(project, colors, options = {}) {
  const safe = safeGeometry(project.geometry);
  const bounds = options.alignToGridCenter ? fullGridBounds(project.grid) : options.bounds ?? filledBounds(project.grid);
  const center = options.alignToGridCenter ? gridCenterOffset(project.grid, safe) : { x: 0, y: 0 };
  const zOffset = Number(options.zOffset) || 0;
  const objName = options.objName || "pixel_stl_all_in_one";
  const materialLibrary = options.materialLibrary === null ? null : options.materialLibrary || "all_in_one.mtl";
  const obj = {
    lines: ["# Pixel STL Studio all-in-one model", ...(materialLibrary ? [`mtllib ${materialLibrary}`] : []), `o ${objName}`],
    vertexCount: 0,
  };
  const mtlLines = [
    "# Pixel STL Studio material library",
    "newmtl black_lattice",
    "Kd 0.000000 0.000000 0.000000",
    "Ka 0.000000 0.000000 0.000000",
    "Ks 0.050000 0.050000 0.050000",
  ];

  const materialByColor = new Map();
  for (const color of colors) {
    const material = materialName("bead", color);
    materialByColor.set(color.id, material);
    mtlLines.push("");
    mtlLines.push(`newmtl ${material}`);
    mtlLines.push(`Kd ${kd(color.hex)}`);
    mtlLines.push(`Ka ${kd(color.hex)}`);
    mtlLines.push("Ks 0.040000 0.040000 0.040000");
  }

  if (bounds) {
    obj.lines.push("g black_lattice");
    addObjLatticeRects(obj, "black_lattice", project.grid, safe, bounds, zOffset, zOffset + safe.plateHeight, center);

    for (const color of colors) {
      const material = materialByColor.get(color.id);
      if (!material) continue;
      obj.lines.push(`g ${material}`);
      for (let y = 0; y < project.grid.height; y += 1) {
        for (let x = 0; x < project.grid.width; x += 1) {
          if (project.grid.cells[y * project.grid.width + x] !== color.id) continue;
          const x0 = (x - bounds.minX) * safe.pitch + safe.gridLineWidth + safe.fitGap - center.x;
          const y0 = (y - bounds.minY) * safe.pitch + safe.gridLineWidth + safe.fitGap - center.y;
          addObjChamferedCuboid(obj, material, x0, y0, zOffset, x0 + safe.blockSize, y0 + safe.blockSize, zOffset + safe.blockHeight, safe.blockChamfer);
        }
      }
    }
  }

  return {
    obj: `${obj.lines.join("\n")}\n`,
    mtl: `${mtlLines.join("\n")}\n`,
  };
}

function buildLayeredObjMtl(project, layers, colors) {
  const safe = safeGeometry(project.geometry);
  const layerStep = Math.max(safe.blockHeight, safe.plateHeight);
  const obj = {
    lines: ["# Pixel STL Studio layered model", "mtllib all_layers.mtl", "o pixel_stl_all_layers"],
    vertexCount: 0,
  };
  const mtlLines = [
    "# Pixel STL Studio material library",
    "newmtl black_lattice",
    "Kd 0.000000 0.000000 0.000000",
    "Ka 0.000000 0.000000 0.000000",
    "Ks 0.050000 0.050000 0.050000",
  ];
  const materialByColor = new Map();
  for (const color of colors) {
    const material = materialName(`bead_${String(color.layerId || "layer").replace(/[^\w-]+/g, "_")}`, color);
    materialByColor.set(`${color.layerId || ""}:${color.id}`, material);
    mtlLines.push("");
    mtlLines.push(`newmtl ${material}`);
    mtlLines.push(`Kd ${kd(color.hex)}`);
    mtlLines.push(`Ka ${kd(color.hex)}`);
    mtlLines.push("Ks 0.040000 0.040000 0.040000");
  }
  layers.forEach((layer, layerIndex) => {
    const bounds = fullGridBounds(layer.grid);
    const center = gridCenterOffset(layer.grid, safe);
    if (!bounds) return;
      const zOffset = layerZOffset(layerIndex, layers.length, layerStep);
      obj.lines.push(`g layer_${layerIndex + 1}_black_lattice`);
      addObjLatticeRects(obj, "black_lattice", layer.grid, safe, bounds, zOffset, zOffset + safe.plateHeight, center);
      for (const color of colors.filter((item) => !item.layerId || item.layerId === layer.id)) {
        const material = materialByColor.get(`${color.layerId || ""}:${color.id}`) ?? materialByColor.get(`:${color.id}`);
        if (!material) continue;
        obj.lines.push(`g layer_${layerIndex + 1}_${material}`);
        for (let y = 0; y < layer.grid.height; y += 1) {
          for (let x = 0; x < layer.grid.width; x += 1) {
            if (layer.grid.cells[y * layer.grid.width + x] !== color.id) continue;
            const x0 = (x - bounds.minX) * safe.pitch + safe.gridLineWidth + safe.fitGap - center.x;
            const y0 = (y - bounds.minY) * safe.pitch + safe.gridLineWidth + safe.fitGap - center.y;
            addObjChamferedCuboid(obj, material, x0, y0, zOffset, x0 + safe.blockSize, y0 + safe.blockSize, zOffset + safe.blockHeight, safe.blockChamfer);
          }
        }
      }
  });
  return {
    obj: `${obj.lines.join("\n")}\n`,
    mtl: `${mtlLines.join("\n")}\n`,
  };
}

function unionBounds(grids) {
  let bounds = null;
  for (const grid of grids) {
    const next = filledBounds(grid);
    if (!next) continue;
    bounds = bounds
      ? {
          minX: Math.min(bounds.minX, next.minX),
          minY: Math.min(bounds.minY, next.minY),
          maxX: Math.max(bounds.maxX, next.maxX),
          maxY: Math.max(bounds.maxY, next.maxY),
        }
      : next;
  }
  return bounds;
}

module.exports = {
  addObjChamferedCuboid,
  buildObjMtl,
  buildLayeredObjMtl,
  layerZOffset,
  materialName,
  unionBounds,
};
