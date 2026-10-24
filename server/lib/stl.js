function cross(a, b, c) {
  const ab = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
  const ac = { x: c.x - a.x, y: c.y - a.y, z: c.z - a.z };
  return {
    x: ab.y * ac.z - ab.z * ac.y,
    y: ab.z * ac.x - ab.x * ac.z,
    z: ab.x * ac.y - ab.y * ac.x,
  };
}

function dot(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function orientedTriangle(normal, a, b, c) {
  if (dot(cross(a, b, c), normal) < 0) {
    return { normal, a, b: c, c: b };
  }
  return { normal, a, b, c };
}

function addFace(triangles, normal, p1, p2, p3, p4) {
  triangles.push(orientedTriangle(normal, p1, p2, p3), orientedTriangle(normal, p1, p3, p4));
}

function quantize(value, step = 0.001) {
  return Number((Math.round(value / step) * step).toFixed(6));
}

function quantizePoint(point) {
  return {
    x: quantize(point.x),
    y: quantize(point.y),
    z: quantize(point.z),
  };
}

function quantizeTriangle(triangle) {
  return {
    normal: triangle.normal,
    a: quantizePoint(triangle.a),
    b: quantizePoint(triangle.b),
    c: quantizePoint(triangle.c),
  };
}

function addCuboid(triangles, x0, y0, z0, x1, y1, z1) {
  addFace(triangles, { x: 0, y: 0, z: 1 }, { x: x0, y: y0, z: z1 }, { x: x1, y: y0, z: z1 }, { x: x1, y: y1, z: z1 }, { x: x0, y: y1, z: z1 });
  addFace(triangles, { x: 0, y: 0, z: -1 }, { x: x0, y: y1, z: z0 }, { x: x1, y: y1, z: z0 }, { x: x1, y: y0, z: z0 }, { x: x0, y: y0, z: z0 });
  addFace(triangles, { x: 0, y: -1, z: 0 }, { x: x0, y: y0, z: z0 }, { x: x1, y: y0, z: z0 }, { x: x1, y: y0, z: z1 }, { x: x0, y: y0, z: z1 });
  addFace(triangles, { x: 0, y: 1, z: 0 }, { x: x1, y: y1, z: z0 }, { x: x0, y: y1, z: z0 }, { x: x0, y: y1, z: z1 }, { x: x1, y: y1, z: z1 });
  addFace(triangles, { x: -1, y: 0, z: 0 }, { x: x0, y: y1, z: z0 }, { x: x0, y: y0, z: z0 }, { x: x0, y: y0, z: z1 }, { x: x0, y: y1, z: z1 });
  addFace(triangles, { x: 1, y: 0, z: 0 }, { x: x1, y: y0, z: z0 }, { x: x1, y: y1, z: z0 }, { x: x1, y: y1, z: z1 }, { x: x1, y: y0, z: z1 });
}

function addChamferedCuboid(triangles, x0, y0, z0, x1, y1, z1, chamfer) {
  const c = Math.min(Math.max(0, chamfer), (x1 - x0) / 2, (y1 - y0) / 2, (z1 - z0) / 2);
  if (c <= 0) {
    addCuboid(triangles, x0, y0, z0, x1, y1, z1);
    return;
  }

  const xb = x0 + c;
  const xe = x1 - c;
  const yb = y0 + c;
  const ye = y1 - c;
  const zt = z1 - c;

  addFace(triangles, { x: 0, y: 0, z: -1 }, { x: x0, y: y1, z: z0 }, { x: x1, y: y1, z: z0 }, { x: x1, y: y0, z: z0 }, { x: x0, y: y0, z: z0 });
  addFace(triangles, { x: 0, y: -1, z: 0 }, { x: x0, y: y0, z: z0 }, { x: x1, y: y0, z: z0 }, { x: x1, y: y0, z: zt }, { x: x0, y: y0, z: zt });
  addFace(triangles, { x: 1, y: 0, z: 0 }, { x: x1, y: y0, z: z0 }, { x: x1, y: y1, z: z0 }, { x: x1, y: y1, z: zt }, { x: x1, y: y0, z: zt });
  addFace(triangles, { x: 0, y: 1, z: 0 }, { x: x1, y: y1, z: z0 }, { x: x0, y: y1, z: z0 }, { x: x0, y: y1, z: zt }, { x: x1, y: y1, z: zt });
  addFace(triangles, { x: -1, y: 0, z: 0 }, { x: x0, y: y1, z: z0 }, { x: x0, y: y0, z: z0 }, { x: x0, y: y0, z: zt }, { x: x0, y: y1, z: zt });

  addFace(triangles, { x: 0, y: -0.7071, z: 0.7071 }, { x: x0, y: y0, z: zt }, { x: x1, y: y0, z: zt }, { x: xe, y: yb, z: z1 }, { x: xb, y: yb, z: z1 });
  addFace(triangles, { x: 0.7071, y: 0, z: 0.7071 }, { x: x1, y: y0, z: zt }, { x: x1, y: y1, z: zt }, { x: xe, y: ye, z: z1 }, { x: xe, y: yb, z: z1 });
  addFace(triangles, { x: 0, y: 0.7071, z: 0.7071 }, { x: x1, y: y1, z: zt }, { x: x0, y: y1, z: zt }, { x: xb, y: ye, z: z1 }, { x: xe, y: ye, z: z1 });
  addFace(triangles, { x: -0.7071, y: 0, z: 0.7071 }, { x: x0, y: y1, z: zt }, { x: x0, y: y0, z: zt }, { x: xb, y: yb, z: z1 }, { x: xb, y: ye, z: z1 });
  addFace(triangles, { x: 0, y: 0, z: 1 }, { x: xb, y: yb, z: z1 }, { x: xe, y: yb, z: z1 }, { x: xe, y: ye, z: z1 }, { x: xb, y: ye, z: z1 });
}

function writeVec3(buffer, offset, vec) {
  buffer.writeFloatLE(vec.x, offset);
  buffer.writeFloatLE(vec.y, offset + 4);
  buffer.writeFloatLE(vec.z, offset + 8);
  return offset + 12;
}

function encodeBinaryStl(name, triangles) {
  const normalized = triangles.map(quantizeTriangle);
  const buffer = Buffer.alloc(84 + normalized.length * 50);
  Buffer.from(`Pixel STL Studio ${name}`.slice(0, 80)).copy(buffer, 0);
  buffer.writeUInt32LE(normalized.length, 80);
  let offset = 84;
  for (const triangle of normalized) {
    offset = writeVec3(buffer, offset, triangle.normal);
    offset = writeVec3(buffer, offset, triangle.a);
    offset = writeVec3(buffer, offset, triangle.b);
    offset = writeVec3(buffer, offset, triangle.c);
    buffer.writeUInt16LE(0, offset);
    offset += 2;
  }
  return buffer;
}

function triangleCount(stl) {
  return Buffer.from(stl).readUInt32LE(80);
}

function safeGeometry(geometry) {
  const legacyCellSize = Math.max(0.5, Number(geometry.cellSize) || 5);
  const blockSize = Math.max(0.5, Number(geometry.blockSize) || legacyCellSize);
  const gridLineWidth = Math.min(
    Math.max(0.05, Number(geometry.gridLineWidth ?? geometry.lineWidth) || 0.6),
    blockSize * 0.9,
  );
  const maxGap = Math.max(0, (blockSize - gridLineWidth) / 2 - 0.05);
  const fitGap = Math.min(Math.max(0, Number(geometry.fitGap) || 0), maxGap);
  return {
    blockSize,
    fitGap,
    blockHeight: Math.max(0.1, Number(geometry.blockHeight ?? geometry.height) || 2),
    plateHeight: Math.max(0.1, Number(geometry.plateHeight) || 1.2),
    blockChamfer: Math.min(Math.max(0, Number(geometry.blockChamfer) || 0), blockSize / 2, (Math.max(0.1, Number(geometry.blockHeight ?? geometry.height) || 2)) / 2),
    gridLineWidth,
    pitch: blockSize + fitGap * 2 + gridLineWidth,
  };
}

function filledBounds(grid) {
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

function fullGridBounds(grid) {
  return { minX: 0, minY: 0, maxX: Math.max(0, grid.width - 1), maxY: Math.max(0, grid.height - 1) };
}

function gridCenterOffset(grid, safe) {
  return {
    x: (grid.width * safe.pitch + safe.gridLineWidth) / 2,
    y: (grid.height * safe.pitch + safe.gridLineWidth) / 2,
  };
}

function generateColorStl(grid, colorId, geometry, options = {}) {
  const safe = safeGeometry(geometry);
  const bounds = options.alignToGridCenter ? fullGridBounds(grid) : options.bounds ?? filledBounds(grid);
  const center = options.alignToGridCenter ? gridCenterOffset(grid, safe) : { x: 0, y: 0 };
  const zOffset = Number(options.zOffset) || 0;
  const triangles = [];
  if (!bounds) return encodeBinaryStl(`bead-${colorId}`, triangles);
  for (let y = 0; y < grid.height; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      if (grid.cells[y * grid.width + x] !== colorId) continue;
      const x0 = (x - bounds.minX) * safe.pitch + safe.gridLineWidth + safe.fitGap - center.x;
      const y0 = (y - bounds.minY) * safe.pitch + safe.gridLineWidth + safe.fitGap - center.y;
      addChamferedCuboid(triangles, x0, y0, zOffset, x0 + safe.blockSize, y0 + safe.blockSize, zOffset + safe.blockHeight, safe.blockChamfer);
    }
  }
  return encodeBinaryStl(`bead-${colorId}`, triangles);
}

function mergeIntervals(intervals) {
  const sorted = intervals.slice().sort((a, b) => a.start - b.start);
  const merged = [];
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

function latticeRects(grid, safe, bounds = filledBounds(grid)) {
  if (!bounds) return [];
  const vertical = new Map();
  const horizontal = new Map();
  const filled = (x, y) => x >= 0 && y >= 0 && x < grid.width && y < grid.height && Boolean(grid.cells[y * grid.width + x]);
  const addInterval = (map, key, interval) => {
    const current = map.get(key);
    if (current) current.push(interval);
    else map.set(key, [interval]);
  };

  for (let y = 0; y < grid.height; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      if (!filled(x, y)) continue;
      const localX = x - bounds.minX;
      const localY = y - bounds.minY;
      const x0 = localX * safe.pitch;
      const x1 = (localX + 1) * safe.pitch + safe.gridLineWidth;
      const y0 = localY * safe.pitch;
      const y1 = (localY + 1) * safe.pitch + safe.gridLineWidth;
      const left = localX * safe.pitch;
      const right = (localX + 1) * safe.pitch;
      const top = localY * safe.pitch;
      const bottom = (localY + 1) * safe.pitch;

      addInterval(vertical, `${left}`, { start: y0, end: y1, x0: left, x1: left + safe.gridLineWidth });
      addInterval(vertical, `${right}`, { start: y0, end: y1, x0: right, x1: right + safe.gridLineWidth });
      addInterval(horizontal, `${top}`, { start: x0, end: x1, y0: top, y1: top + safe.gridLineWidth });
      addInterval(horizontal, `${bottom}`, { start: x0, end: x1, y0: bottom, y1: bottom + safe.gridLineWidth });
    }
  }

  const rects = [];
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

function generateLatticeStl(grid, geometry, options = {}) {
  const safe = safeGeometry(geometry);
  const zOffset = Number(options.zOffset) || 0;
  const bounds = options.alignToGridCenter ? fullGridBounds(grid) : options.bounds;
  const center = options.alignToGridCenter ? gridCenterOffset(grid, safe) : { x: 0, y: 0 };
  const triangles = [];
  for (const rect of latticeRects(grid, safe, bounds)) {
    addCuboid(triangles, rect.x0 - center.x, rect.y0 - center.y, zOffset, rect.x1 - center.x, rect.y1 - center.y, zOffset + safe.plateHeight);
  }
  return encodeBinaryStl("black-lattice", triangles);
}

module.exports = {
  addCuboid,
  filledBounds,
  fullGridBounds,
  generateColorStl,
  generateLatticeStl,
  gridCenterOffset,
  latticeRects,
  safeGeometry,
  triangleCount,
};
