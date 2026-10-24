require("./fonts");
const sharp = require("sharp");
const { normalizeHex } = require("./color");
const { countByColor } = require("./pattern");
const { safeGeometry } = require("./stl");

const FONT_FAMILY = "'Noto Sans SC','Noto Sans CJK SC','Microsoft YaHei','DejaVu Sans',Arial,sans-serif";
const LABELS = {
  name: "&#21517;&#31216;&#65306;",
  size: "&#23610;&#23544;&#65306;",
  beads: "&#39063;&#31890;&#25968;&#65306;",
  colorTypes: "&#39068;&#33394;&#31181;&#31867;&#65306;",
  typesSuffix: "&#31181;",
};

function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function truncateText(value, maxLength) {
  const text = String(value ?? "").trim();
  return text.length > maxLength ? `${text.slice(0, Math.max(1, maxLength - 3))}...` : text;
}

function layerActiveColors(layer) {
  const groups = Array.isArray(layer.colorGroups) ? layer.colorGroups : [];
  const group = groups.find((item) => item.id === layer.activeColorGroupId) ?? groups[0] ?? { colors: [] };
  return Array.isArray(group.colors) ? group.colors.map((color) => ({ ...color, hex: normalizeHex(color.hex) })) : [];
}

function layerStats(layer, geometry) {
  const safe = safeGeometry(geometry);
  const counts = countByColor(layer.grid);
  const colors = layerActiveColors(layer);
  const colorMap = new Map(colors.map((color) => [color.id, color]));
  const filledCount = Array.from(counts.values()).reduce((sum, count) => sum + count, 0);
  const widthCm = ((layer.grid.width * safe.pitch + safe.gridLineWidth) / 10).toFixed(1);
  const heightCm = ((layer.grid.height * safe.pitch + safe.gridLineWidth) / 10).toFixed(1);
  return {
    colorMap,
    filledCount,
    usedColorCount: counts.size,
    widthCm,
    heightCm,
  };
}

function previewCellSize(grid, maxWidth, maxHeight) {
  return Math.max(2, Math.floor(Math.min(maxWidth / Math.max(1, grid.width), maxHeight / Math.max(1, grid.height))));
}

function filledBounds(grid) {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (let row = 0; row < grid.height; row += 1) {
    for (let column = 0; column < grid.width; column += 1) {
      if (!grid.cells[row * grid.width + column]) continue;
      minX = Math.min(minX, column);
      minY = Math.min(minY, row);
      maxX = Math.max(maxX, column);
      maxY = Math.max(maxY, row);
    }
  }
  return Number.isFinite(minX) ? { minX, minY, maxX, maxY } : null;
}

function appendLayerPreview(parts, layer, colorMap, x, y, width, height) {
  const bounds = filledBounds(layer.grid);
  if (!bounds) return;
  const filledCells = new Set();
  for (let row = bounds.minY; row <= bounds.maxY; row += 1) {
    for (let column = bounds.minX; column <= bounds.maxX; column += 1) {
      const id = layer.grid.cells[row * layer.grid.width + column];
      if (id && colorMap.has(id)) {
        filledCells.add(`${column},${row}`);
      }
    }
  }
  const previewGrid = {
    width: bounds.maxX - bounds.minX + 1,
    height: bounds.maxY - bounds.minY + 1,
  };
  const cell = previewCellSize(previewGrid, width, height);
  const gridWidth = previewGrid.width * cell;
  const gridHeight = previewGrid.height * cell;
  const offsetX = x + (width - gridWidth) / 2;
  const offsetY = y + (height - gridHeight) / 2;
  parts.push(`<g transform="translate(${offsetX.toFixed(2)},${offsetY.toFixed(2)})">`);
  for (let row = bounds.minY; row <= bounds.maxY; row += 1) {
    for (let column = bounds.minX; column <= bounds.maxX; column += 1) {
      const id = layer.grid.cells[row * layer.grid.width + column];
      const color = id ? colorMap.get(id) : null;
      if (!color) continue;
      const fill = normalizeHex(color.hex);
      const px = (column - bounds.minX) * cell;
      const py = (row - bounds.minY) * cell;
      parts.push(`<rect x="${px}" y="${py}" width="${cell}" height="${cell}" fill="${fill}"/>`);
    }
  }
  const outline = [];
  const hasCell = (column, row) => filledCells.has(`${column},${row}`);
  for (let row = bounds.minY; row <= bounds.maxY; row += 1) {
    for (let column = bounds.minX; column <= bounds.maxX; column += 1) {
      if (!hasCell(column, row)) continue;
      const px = (column - bounds.minX) * cell;
      const py = (row - bounds.minY) * cell;
      if (!hasCell(column, row - 1)) outline.push(`M${px} ${py}H${px + cell}`);
      if (!hasCell(column + 1, row)) outline.push(`M${px + cell} ${py}V${py + cell}`);
      if (!hasCell(column, row + 1)) outline.push(`M${px + cell} ${py + cell}H${px}`);
      if (!hasCell(column - 1, row)) outline.push(`M${px} ${py + cell}V${py}`);
    }
  }
  if (outline.length > 0) {
    const strokeWidth = Math.max(1.4, Math.min(4.2, cell * 0.15));
    parts.push(
      `<path class="overview-preview-outline" d="${outline.join("")}" fill="none" stroke="#94a3b8" stroke-opacity="0.72" stroke-width="${strokeWidth.toFixed(2)}" stroke-linecap="square" stroke-linejoin="miter"/>`,
    );
  }
  parts.push(`</g>`);
}

function safeOptionNumber(value, fallback, min, max) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, Math.round(number))) : fallback;
}

function buildOverviewSvg(project, layers, options = {}) {
  const selectedLayers = Array.isArray(layers) ? layers : [];
  const count = selectedLayers.length;
  const columns = Math.min(count || 1, safeOptionNumber(options.columns, count <= 2 ? Math.max(1, count) : Math.min(3, Math.ceil(Math.sqrt(count))), 1, 6));
  const rows = Math.max(1, Math.ceil(count / Math.max(1, columns)));
  const margin = 34;
  const gap = 20;
  const cardWidth = 330;
  const cardHeight = safeOptionNumber(options.cardHeight, 390, 320, 720);
  const titleHeight = 40;
  const width = margin * 2 + columns * cardWidth + Math.max(0, columns - 1) * gap;
  const height = margin * 2 + titleHeight + rows * cardHeight + Math.max(0, rows - 1) * gap;
  const title = truncateText(options.title || "Layer Overview", 72);
  const parts = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<rect width="100%" height="100%" fill="#f3f6fb"/>`,
    `<text x="${width / 2}" y="${margin - 2}" text-anchor="middle" font-family="${FONT_FAMILY}" font-size="28" font-weight="900" fill="#111827" dominant-baseline="hanging">${escapeXml(title)}</text>`,
  ];

  selectedLayers.forEach((layer, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = margin + column * (cardWidth + gap);
    const y = margin + titleHeight + row * (cardHeight + gap);
    const stats = layerStats(layer, project.geometry);
    const previewHeight = Math.max(152, cardHeight - 168);
    const metaY = cardHeight - 72;
    const name = truncateText(layer.name, 24);
    const lines = [
      `${LABELS.size}${stats.widthCm}*${stats.heightCm}cm`,
      `${LABELS.beads}${stats.filledCount}`,
      `${LABELS.colorTypes}${stats.usedColorCount}${LABELS.typesSuffix}`,
    ];

    parts.push(`<g transform="translate(${x},${y})">`);
    parts.push(`<rect x="0" y="0" width="${cardWidth}" height="${cardHeight}" rx="12" fill="#ffffff" stroke="#cbd5e1"/>`);
    parts.push(`<text x="${cardWidth / 2}" y="40" text-anchor="middle" font-family="${FONT_FAMILY}" font-size="18" font-weight="900" fill="#111827">${escapeXml(name)}</text>`);
    appendLayerPreview(parts, layer, stats.colorMap, 18, 66, cardWidth - 36, Math.max(120, previewHeight - 18));
    lines.forEach((line, lineIndex) => {
      parts.push(
        `<text x="${cardWidth / 2}" y="${metaY + lineIndex * 24}" text-anchor="middle" font-family="${FONT_FAMILY}" font-size="15" font-weight="760" fill="#334155">${line}</text>`,
      );
    });
    parts.push(`</g>`);
  });
  parts.push(`</svg>`);
  return { svg: parts.join(""), width, height };
}

async function buildOverviewPng(project, layers, options = {}) {
  const { svg, width, height } = buildOverviewSvg(project, layers, options);
  return sharp(Buffer.from(svg, "utf8"))
    .resize({ width: width * 2, height: height * 2, fit: "fill", kernel: "nearest" })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
}

module.exports = {
  buildOverviewPng,
  buildOverviewSvg,
  layerStats,
};
