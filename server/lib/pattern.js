require("./fonts");
const sharp = require("sharp");
const { normalizeHex } = require("./color");

function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function textColor(hex) {
  const value = normalizeHex(hex).slice(1);
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return r * 0.299 + g * 0.587 + b * 0.114 > 155 ? "#111111" : "#ffffff";
}

function hexToUnitRgb(hex) {
  const value = normalizeHex(hex).slice(1);
  return {
    r: parseInt(value.slice(0, 2), 16) / 255,
    g: parseInt(value.slice(2, 4), 16) / 255,
    b: parseInt(value.slice(4, 6), 16) / 255,
  };
}

function rgbToHsl(hex) {
  const { r, g, b } = hexToUnitRgb(hex);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return { h: h * 60, s, l };
}

function colorLabels(colors) {
  const neutral = [];
  const chromatic = [];
  for (const color of colors) {
    const hsl = rgbToHsl(color.hex);
    const item = { color, ...hsl };
    if (hsl.s < 0.18 || hsl.l > 0.9 || hsl.l < 0.12) neutral.push(item);
    else chromatic.push(item);
  }

  chromatic.sort((a, b) => a.h - b.h || b.l - a.l);
  const groups = [];
  for (const item of chromatic) {
    const last = groups[groups.length - 1];
    if (last && Math.abs(item.h - last.seedHue) <= 28) {
      last.items.push(item);
      last.seedHue = (last.seedHue * (last.items.length - 1) + item.h) / last.items.length;
    } else {
      groups.push({ seedHue: item.h, items: [item] });
    }
  }

  const labels = new Map();
  neutral.sort((a, b) => b.l - a.l).forEach((item, index) => labels.set(item.color.id, `N${index + 1}`));
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  groups.forEach((group, groupIndex) => {
    const prefix = letters[groupIndex] ?? `C${groupIndex + 1}`;
    group.items.sort((a, b) => b.l - a.l).forEach((item, index) => labels.set(item.color.id, `${prefix}${index + 1}`));
  });
  return labels;
}

function countByColor(grid) {
  const counts = new Map();
  for (const cell of grid.cells) {
    if (!cell) continue;
    counts.set(cell, (counts.get(cell) ?? 0) + 1);
  }
  return counts;
}

function legendName(color) {
  const code = String(color.code ?? "").trim();
  const name = String(color.name ?? "").trim();
  return name && name !== code ? ` ${name}` : "";
}

function legendDisplayCode(color) {
  const code = String(color.code ?? "").trim();
  const name = String(color.name ?? "").trim();
  return code || name || "-";
}

function beadDisplayCode(color) {
  const code = String(color.code ?? "").trim();
  const name = String(color.name ?? "").trim();
  return code || name || "-";
}

function labelPrefix(label) {
  const match = String(label || "").match(/^[A-Za-z]+/);
  return match ? match[0].toUpperCase() : "#";
}

function groupedLegendItems(colors, labelMap, counts) {
  const groups = new Map();
  colors.forEach((color, sourceIndex) => {
    const label = labelMap.get(color.id) ?? color.code;
    const prefix = labelPrefix(label);
    if (!groups.has(prefix)) groups.set(prefix, []);
    groups.get(prefix).push({
      color,
      label,
      prefix,
      count: counts.get(color.id) ?? 0,
      sourceIndex,
    });
  });
  return Array.from(groups.entries())
    .map(([prefix, items]) => ({
      prefix,
      items: items.sort((a, b) => String(a.label).localeCompare(String(b.label), "en", { numeric: true }) || a.sourceIndex - b.sourceIndex),
    }))
    .sort((a, b) => a.prefix.localeCompare(b.prefix, "en", { numeric: true }));
}

function filledBounds(grid) {
  let minX = grid.width;
  let minY = grid.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < grid.height; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      if (!grid.cells[y * grid.width + x]) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (maxX < minX || maxY < minY) return null;
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

function estimateSvgTextWidth(value, fontSize) {
  return Array.from(String(value ?? "")).reduce((sum, char) => sum + (char.charCodeAt(0) > 127 ? fontSize * 1.05 : fontSize * 0.58), 0);
}

function buildPatternSvg(project, colors, options = {}) {
  const counts = countByColor(project.grid);
  const colorMap = new Map(colors.map((color) => [color.id, color]));
  const labelMap = colorLabels(colors);
  const beadMode = options.variant === "bead";
  const hammerMode = options.variant === "hammer";
  const codeMode = beadMode || hammerMode;
  const colorGroupName = String(options.colorGroupName ?? "").trim();
  const legendItems = colors
    .map((color, sourceIndex) => ({
      color,
      label: codeMode ? beadDisplayCode(color) : labelMap.get(color.id) ?? color.code,
      count: counts.get(color.id) ?? 0,
      sourceIndex,
    }))
    .filter((item) => item.count > 0)
    .sort((a, b) => String(a.label).localeCompare(String(b.label), "en", { numeric: true }) || a.sourceIndex - b.sourceIndex);
  const totalBeadCount = legendItems.reduce((sum, item) => sum + item.count, 0);
  const beadLegendTitle = ["Bead Key", colorGroupName, `总共 ${totalBeadCount} 粒`].filter(Boolean).join(" / ");
  const generalLegendTitle = colorGroupName ? `Color Key / ${colorGroupName}` : "Color Key";
  const legendTitle = codeMode ? beadLegendTitle : generalLegendTitle;
  const legendTexts = legendItems.map((item) => {
    const hex = normalizeHex(item.color.hex);
    const code = legendDisplayCode(item.color);
    return hammerMode ? `${code} x ${item.count}` : beadMode ? `${code} x ${item.count} (${hex.toUpperCase()})` : `${item.label} (${code}) ${hex.toUpperCase()} x${item.count}`;
  });
  const bounds = hammerMode ? filledBounds(project.grid) : null;
  const patternWidth = hammerMode ? Math.max(1, bounds?.width ?? 1) : project.grid.width;
  const patternHeight = hammerMode ? Math.max(1, bounds?.height ?? 1) : project.grid.height;
  const cell = project.grid.width > 48 || project.grid.height > 48 ? 18 : 26;
  const margin = 28;
  const axisSize = hammerMode ? 0 : 30;
  const titleHeight = 44;
  const gridWidth = patternWidth * cell;
  const gridHeight = patternHeight * cell;
  const legendGap = 26;
  const contentWidth = hammerMode ? Math.max(gridWidth, 360) : gridWidth + axisSize * 2;
  const legendRow = 30;
  const hammerColumnWidth = Math.max(128, Math.min(190, Math.max(0, ...legendTexts.map((text) => estimateSvgTextWidth(text, 12) + 58))));
  const hammerBalancedColumns = Math.max(1, Math.ceil(legendItems.length / 4));
  const hammerColumnsByWidth = Math.max(1, Math.floor(contentWidth / hammerColumnWidth));
  const legendColumns = hammerMode
    ? Math.max(1, Math.min(4, legendItems.length || 1, hammerBalancedColumns, hammerColumnsByWidth))
    : Math.max(1, Math.min(4, Math.floor((gridWidth + axisSize * 2) / 230)));
  const hammerTitleWidth = estimateSvgTextWidth(legendTitle, 14) + estimateSvgTextWidth(`${legendItems.length} colors`, 11) + 58;
  const legendWidth = hammerMode ? Math.min(contentWidth, Math.max(220, hammerTitleWidth, legendColumns * hammerColumnWidth)) : gridWidth + axisSize * 2;
  const legendColumnWidth = legendWidth / legendColumns;
  const legendRows = Math.max(1, Math.ceil(legendItems.length / legendColumns));
  const legendHeight = Math.max(74, 44 + legendRows * legendRow + 14);
  const width = margin * 2 + contentWidth;
  const height = margin * 2 + titleHeight + axisSize * 2 + gridHeight + legendGap + legendHeight;
  const fontSize = Math.max(8, Math.min(12, cell * 0.42));
  const showCodes = cell >= 16;
  const gridX = margin + axisSize + (contentWidth - (axisSize * 2 + gridWidth)) / 2;
  const gridY = margin + titleHeight + axisSize;
  const title = String(options.title || "Pixel bead pattern").trim() || "Pixel bead pattern";
  const fontFamily = `'Noto Sans SC', 'Noto Sans CJK SC', 'Microsoft YaHei', 'DejaVu Sans', Arial, sans-serif`;
  const parts = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<rect width="100%" height="100%" fill="#f7fafc"/>`,
    `<text x="${width / 2}" y="${margin + 4}" text-anchor="middle" font-family="${fontFamily}" font-size="24" font-weight="800" fill="#111827" dominant-baseline="hanging">${escapeXml(title)}</text>`,
    `<g transform="translate(${gridX},${gridY})">`,
  ];
  if (!hammerMode) {
    parts.push(`<rect x="0" y="0" width="${gridWidth}" height="${gridHeight}" fill="#ffffff" stroke="#111827" stroke-width="1"/>`);
  }

  const sourceMinX = hammerMode ? bounds?.minX ?? 0 : 0;
  const sourceMinY = hammerMode ? bounds?.minY ?? 0 : 0;
  const sourceMaxX = hammerMode ? bounds?.maxX ?? sourceMinX : project.grid.width - 1;
  const sourceMaxY = hammerMode ? bounds?.maxY ?? sourceMinY : project.grid.height - 1;
  for (let y = sourceMinY; y <= sourceMaxY; y += 1) {
    for (let x = sourceMinX; x <= sourceMaxX; x += 1) {
      const id = project.grid.cells[y * project.grid.width + x];
      const color = id ? colorMap.get(id) : null;
      if (hammerMode && !color) continue;
      const fill = color ? normalizeHex(color.hex) : "#ffffff";
      const px = (x - sourceMinX) * cell;
      const py = (y - sourceMinY) * cell;
      parts.push(`<rect x="${px}" y="${py}" width="${cell}" height="${cell}" fill="${fill}"/>`);
      if (color && showCodes) {
        const label = codeMode ? beadDisplayCode(color) : labelMap.get(color.id) ?? color.code;
        parts.push(
          `<text x="${px + cell / 2}" y="${py + cell / 2 + fontSize * 0.35}" text-anchor="middle" font-family="${fontFamily}" font-size="${fontSize}" font-weight="700" fill="${textColor(fill)}">${escapeXml(label)}</text>`,
        );
      }
    }
  }

  if (!hammerMode) {
    parts.push(`<g stroke-linecap="square">`);
    for (let x = 0; x <= project.grid.width; x += 1) {
      const strokeWidth = x % 5 === 0 || x === project.grid.width ? 2 : 0.7;
      const stroke = strokeWidth > 1 ? "#64748b" : "#cbd5e1";
      const px = x * cell;
      parts.push(`<line x1="${px}" y1="0" x2="${px}" y2="${gridHeight}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`);
    }
    for (let y = 0; y <= project.grid.height; y += 1) {
      const strokeWidth = y % 5 === 0 || y === project.grid.height ? 2 : 0.7;
      const stroke = strokeWidth > 1 ? "#64748b" : "#cbd5e1";
      const py = y * cell;
      parts.push(`<line x1="0" y1="${py}" x2="${gridWidth}" y2="${py}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`);
    }
    parts.push(`<rect x="0" y="0" width="${gridWidth}" height="${gridHeight}" fill="none" stroke="#111827" stroke-width="2"/>`);
    parts.push(`</g>`);
  }
  parts.push("</g>");

  if (!hammerMode) {
    parts.push(`<g transform="translate(${gridX},${gridY})" font-family="${fontFamily}" font-size="11" font-weight="700" fill="#334155">`);
    for (let x = 0; x < project.grid.width; x += 1) {
      parts.push(`<text x="${x * cell + cell / 2}" y="-12" text-anchor="middle">${x + 1}</text>`);
      parts.push(`<text x="${x * cell + cell / 2}" y="${gridHeight + 20}" text-anchor="middle">${x + 1}</text>`);
    }
    for (let y = 0; y < project.grid.height; y += 1) {
      parts.push(`<text x="-10" y="${y * cell + cell / 2 + 4}" text-anchor="end">${y + 1}</text>`);
      parts.push(`<text x="${gridWidth + 10}" y="${y * cell + cell / 2 + 4}" text-anchor="start">${y + 1}</text>`);
    }
    parts.push("</g>");
  }

  const legendX = margin + (contentWidth - legendWidth) / 2;
  const legendY = gridY + gridHeight + axisSize + legendGap;
  parts.push(`<g transform="translate(${legendX},${legendY})">`);
  parts.push(`<rect x="0" y="0" width="${legendWidth}" height="${legendHeight}" rx="8" fill="#ffffff" stroke="#cbd5e1"/>`);
  parts.push(`<text x="14" y="24" font-family="${fontFamily}" font-size="14" font-weight="800" fill="#111827">${escapeXml(legendTitle)}</text>`);
  parts.push(`<text x="${legendWidth - 14}" y="24" text-anchor="end" font-family="${fontFamily}" font-size="11" font-weight="600" fill="#64748b">${legendItems.length} colors</text>`);
  legendItems.forEach((item, index) => {
    const column = index % legendColumns;
    const row = Math.floor(index / legendColumns);
    const x = 14 + column * legendColumnWidth;
    const y = 50 + row * legendRow;
    const hex = normalizeHex(item.color.hex);
    const maxTextWidth = Math.max(120, legendColumnWidth - 42);
    const text = legendTexts[index] ?? "";
    parts.push(`<g class="legend-item" transform="translate(${x},${y})">`);
    parts.push(`<rect x="0" y="-17" width="22" height="22" rx="5" fill="${hex}" stroke="#94a3b8" stroke-width="1.2"/>`);
    if (hammerMode) {
      parts.push(`<text x="32" y="0" font-family="${fontFamily}" font-size="12" font-weight="650" fill="#111827">${escapeXml(text)}</text>`);
    } else {
      parts.push(
        `<text x="32" y="0" font-family="${fontFamily}" font-size="12" font-weight="650" fill="#111827" textLength="${maxTextWidth}" lengthAdjust="spacingAndGlyphs">${escapeXml(text)}</text>`,
      );
    }
    parts.push("</g>");
  });
  parts.push("</g>");
  parts.push("</svg>");

  return { svg: parts.join(""), width, height };
}

async function buildPatternPng(project, colors, options = {}) {
  const scale = 2;
  const { svg, width, height } = buildPatternSvg(project, colors, options);
  return sharp(Buffer.from(svg, "utf8"))
    .resize({ width: width * scale, height: height * scale, fit: "fill", kernel: "nearest" })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
}

module.exports = {
  buildPatternPng,
  buildPatternSvg,
  colorLabels,
  countByColor,
  groupedLegendItems,
  legendName,
};
