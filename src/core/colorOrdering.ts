import type { BeadColor, BeadColorGroup } from "../types";
import { hexToRgb } from "./color";

const MARD_PREFIX_ORDER = ["A", "B", "C", "D", "E", "F", "G", "H", "M", "P", "Q", "R", "T", "Y", "ZG"];

export interface MardCodeParts {
  prefix: string;
  number: number;
}

export interface ColorDisplaySection {
  key: string;
  label: string | null;
  colors: BeadColor[];
}

export function isMardColorGroupId(groupId: string): boolean {
  return /^mard-\d+$/i.test(groupId);
}

export function mardCodeParts(code: string): MardCodeParts | null {
  const match = code.trim().toUpperCase().match(/^([A-Z]+)(\d+)$/);
  if (!match) return null;
  return {
    prefix: match[1],
    number: Number(match[2]),
  };
}

function mardPrefixRank(prefix: string): number {
  const index = MARD_PREFIX_ORDER.indexOf(prefix);
  return index >= 0 ? index : MARD_PREFIX_ORDER.length;
}

export function colorLightness(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const srgb = [r, g, b].map((value) => {
    const channel = value / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
}

export function compareMardColorsBySeries(a: BeadColor, b: BeadColor): number {
  const aParts = mardCodeParts(a.code);
  const bParts = mardCodeParts(b.code);
  if (!aParts && !bParts) return a.code.localeCompare(b.code, "en", { numeric: true });
  if (!aParts) return 1;
  if (!bParts) return -1;

  const prefixDelta = mardPrefixRank(aParts.prefix) - mardPrefixRank(bParts.prefix);
  if (prefixDelta !== 0) return prefixDelta;
  const unknownPrefixDelta = aParts.prefix.localeCompare(bParts.prefix, "en", { numeric: true });
  if (mardPrefixRank(aParts.prefix) === MARD_PREFIX_ORDER.length && unknownPrefixDelta !== 0) return unknownPrefixDelta;

  const lightnessDelta = colorLightness(b.hex) - colorLightness(a.hex);
  if (Math.abs(lightnessDelta) > 0.000001) return lightnessDelta;
  return aParts.number - bParts.number || a.code.localeCompare(b.code, "en", { numeric: true });
}

export function compareMardColorsBySeriesAndUsage(a: BeadColor, b: BeadColor): number {
  const aParts = mardCodeParts(a.code);
  const bParts = mardCodeParts(b.code);
  if (!aParts || !bParts || aParts.prefix !== bParts.prefix) return compareMardColorsBySeries(a, b);
  const aUsed = a.displayUsed ?? a.enabled;
  const bUsed = b.displayUsed ?? b.enabled;
  const usedDelta = Number(bUsed) - Number(aUsed);
  return usedDelta || compareMardColorsBySeries(a, b);
}

export function orderColorsForDisplay(groupId: string, colors: BeadColor[]): BeadColor[] {
  if (!isMardColorGroupId(groupId)) return colors;
  return colors.slice().sort(compareMardColorsBySeriesAndUsage);
}

export function colorDisplaySections(group: BeadColorGroup | null): ColorDisplaySection[] {
  if (!group) return [];
  if (!isMardColorGroupId(group.id)) {
    return [{ key: group.id, label: null, colors: group.colors }];
  }

  const sections: ColorDisplaySection[] = [];
  const orderedColors = orderColorsForDisplay(group.id, group.colors);
  const usedColors = orderedColors.filter((color) => color.displayUsed ?? color.enabled);
  if (usedColors.length > 0) {
    sections.push({
      key: "used",
      label: "\u4f7f\u7528\u7ec4",
      colors: usedColors,
    });
  }

  for (const color of orderedColors) {
    if (color.displayUsed ?? color.enabled) continue;
    const parts = mardCodeParts(color.code);
    const key = parts?.prefix ?? "other";
    let section = sections.find((item) => item.key === key);
    if (!section) {
      section = {
        key,
        label: parts ? `${parts.prefix} \u7ec4` : "\u5176\u4ed6",
        colors: [],
      };
      sections.push(section);
    }
    section.colors.push(color);
  }
  return sections;
}
