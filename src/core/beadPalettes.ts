import type { BeadColor, BeadColorGroup } from "../types";
import { compareMardColorsBySeries } from "./colorOrdering";
import { MARD_COLOR_DATA, MARD_SET_CODES } from "./mardPaletteData";

// Hex values are practical screen approximations collected from public color
// charts. They are for preview and color matching, not physical color proofing.

function color(groupId: string, code: string, name: string, hex: string): BeadColor {
  return {
    id: `${groupId}-${code.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    code,
    name,
    hex: hex.toLowerCase(),
    enabled: true,
    displayUsed: true,
  };
}

function codeList(value: string): string[] {
  return value.split(/\s+/).filter(Boolean);
}

const MARD_COLORS = MARD_COLOR_DATA.split(/\s+/).map((entry) => {
  const [code, hex] = entry.split(":");
  return { code, hex };
});

function mardGroup(size: keyof typeof MARD_SET_CODES | "291", description: string): BeadColorGroup {
  const id = `mard-${size}`;
  const allowedCodes = size === "291" ? null : new Set(codeList(MARD_SET_CODES[size]));
  const colors = MARD_COLORS.filter((item) => !allowedCodes || allowedCodes.has(item.code))
    .map((item) => color(id, item.code, `MARD ${item.code}`, item.hex))
    .sort(compareMardColorsBySeries);
  return {
    id,
    name: `MARD ${size}色`,
    description,
    source: "Pixelbead MARD public color chart and common MARD set ranges",
    colors,
  };
}

export const BUILTIN_COLOR_GROUPS: BeadColorGroup[] = [
  {
    id: "default",
    name: "默认色卡",
    description: "基础常用色，适合快速绘制和测试。",
    colors: [
      color("default", "W01", "白色", "#f7f4ee"),
      color("default", "K01", "黑色", "#121111"),
      color("default", "GR1", "浅灰", "#c7c7c2"),
      color("default", "GR2", "深灰", "#666a68"),
      color("default", "Y01", "黄色", "#f2d94e"),
      color("default", "Y02", "浅黄", "#f8e469"),
      color("default", "O01", "橙色", "#ef9b37"),
      color("default", "R01", "红色", "#d84238"),
      color("default", "R02", "深红", "#8f2d2d"),
      color("default", "P01", "粉色", "#ef9dae"),
      color("default", "P02", "桃粉", "#f2acb1"),
      color("default", "PU1", "紫色", "#7952a8"),
      color("default", "B01", "蓝色", "#3267b1"),
      color("default", "B02", "浅蓝", "#7fb8df"),
      color("default", "G01", "绿色", "#4b9a4d"),
      color("default", "G02", "深绿", "#2d6d45"),
      color("default", "N01", "棕色", "#7b4d2f"),
      color("default", "S01", "肤色", "#f1c9a7"),
    ],
  },
  mardGroup(72, "入门/小套装范围，适合小图标、钥匙扣和只用常见颜色的图纸。"),
  mardGroup(96, "小套装增强范围，适合小头像、简单宠物和礼物图案。"),
  mardGroup(120, "中等套装范围，适合动漫头像、角色半身和中等尺寸照片。"),
  mardGroup(144, "常用进阶范围，适合人物头像、动漫角色和阴影更丰富的图案。"),
  mardGroup(221, "标准全色范围，适合大尺寸照片、宠物毛发和细节要求更高的作品。"),
  mardGroup("291", "完整扩展范围，包含更多扩展/特殊色，适合先预览最佳匹配效果。"),
  {
    id: "artkal-s-common",
    name: "Artkal S 常用",
    description: "Artkal S 系常用屏幕参考色。",
    colors: [
      color("artkal-s-common", "S01", "White", "#f5f3ea"),
      color("artkal-s-common", "S02", "Ivory", "#eee3ce"),
      color("artkal-s-common", "S03", "Cream", "#f2dfb8"),
      color("artkal-s-common", "S04", "Light Yellow", "#f7e585"),
      color("artkal-s-common", "S05", "Yellow", "#efd34d"),
      color("artkal-s-common", "S06", "Gold", "#e6bd3d"),
      color("artkal-s-common", "S07", "Orange", "#ef9c33"),
      color("artkal-s-common", "S08", "Peach", "#efb07d"),
      color("artkal-s-common", "S09", "Red", "#c93432"),
      color("artkal-s-common", "S10", "Dark Red", "#8f2e32"),
      color("artkal-s-common", "S11", "Coral", "#e87364"),
      color("artkal-s-common", "S12", "Pink", "#ee9db2"),
      color("artkal-s-common", "S13", "Rose", "#d75c91"),
      color("artkal-s-common", "S14", "Magenta", "#b34b91"),
      color("artkal-s-common", "S15", "Lavender", "#b99ad2"),
      color("artkal-s-common", "S16", "Purple", "#7952a8"),
      color("artkal-s-common", "S17", "Violet", "#53357e"),
      color("artkal-s-common", "S18", "Black", "#121212"),
      color("artkal-s-common", "S19", "Sand", "#d9be92"),
      color("artkal-s-common", "S20", "Tan", "#c59465"),
      color("artkal-s-common", "S21", "Light Brown", "#a8754f"),
      color("artkal-s-common", "S22", "Brown", "#7b4d31"),
      color("artkal-s-common", "S23", "Dark Brown", "#513225"),
      color("artkal-s-common", "S24", "Skin", "#f0c29d"),
      color("artkal-s-common", "S25", "Blush", "#f4b39f"),
      color("artkal-s-common", "S26", "Light Peach", "#f6d0b4"),
      color("artkal-s-common", "S27", "Rust", "#a65337"),
      color("artkal-s-common", "S28", "Coffee", "#6b4731"),
      color("artkal-s-common", "S29", "Chocolate", "#5a392a"),
      color("artkal-s-common", "S30", "Warm Gray", "#b1aca3"),
      color("artkal-s-common", "S31", "Gray", "#92958f"),
      color("artkal-s-common", "S32", "Charcoal", "#4d5250"),
      color("artkal-s-common", "S33", "Light Gray", "#c7c7c2"),
      color("artkal-s-common", "S34", "Dark Gray", "#666a68"),
      color("artkal-s-common", "S35", "Mint", "#9ed7b4"),
      color("artkal-s-common", "S36", "Pastel Green", "#a8cf9a"),
      color("artkal-s-common", "S37", "Lime", "#b5c95a"),
      color("artkal-s-common", "S38", "Grass Green", "#76ae58"),
      color("artkal-s-common", "S39", "Green", "#58a052"),
      color("artkal-s-common", "S40", "Dark Green", "#2f7046"),
      color("artkal-s-common", "S41", "Teal", "#329486"),
      color("artkal-s-common", "S42", "Aqua", "#42a8c4"),
      color("artkal-s-common", "S43", "Pale Blue", "#a6d4ec"),
      color("artkal-s-common", "S44", "Light Blue", "#80b8df"),
      color("artkal-s-common", "S45", "Sky Blue", "#5fa1d3"),
      color("artkal-s-common", "S46", "Medium Blue", "#416eb5"),
      color("artkal-s-common", "S47", "Royal Blue", "#315aa4"),
      color("artkal-s-common", "S48", "Blue", "#3264aa"),
      color("artkal-s-common", "S49", "Navy", "#1f2f63"),
    ],
  },
  {
    id: "perler-common",
    name: "Perler 常用",
    description: "Perler 常用屏幕参考色。",
    colors: [
      color("perler-common", "P-80-19001", "White", "#f5f3ec"),
      color("perler-common", "P-80-19018", "Black", "#111111"),
      color("perler-common", "P-80-19017", "Grey", "#979995"),
      color("perler-common", "P-80-19091", "Light Grey", "#c8c8c4"),
      color("perler-common", "P-80-19092", "Dark Grey", "#5f6260"),
      color("perler-common", "P-80-19002", "Butterscotch", "#d8a248"),
      color("perler-common", "P-80-19003", "Creme", "#f0deb7"),
      color("perler-common", "P-80-19004", "Pastel Yellow", "#f7e58a"),
      color("perler-common", "P-80-19005", "Yellow", "#efd64e"),
      color("perler-common", "P-80-19007", "Orange", "#ef9935"),
      color("perler-common", "P-80-19008", "Green", "#529a50"),
      color("perler-common", "P-80-19009", "Red", "#c83a35"),
      color("perler-common", "P-80-19010", "Light Brown", "#a8754f"),
      color("perler-common", "P-80-19011", "Cheddar", "#f1b44a"),
      color("perler-common", "P-80-19012", "Pink", "#ed9cad"),
      color("perler-common", "P-80-19019", "Clear", "#f0f3f0"),
      color("perler-common", "P-80-19020", "Rust", "#a65337"),
      color("perler-common", "P-80-19021", "Light Pink", "#f2bdc8"),
      color("perler-common", "P-80-19029", "Brown", "#7d5131"),
      color("perler-common", "P-80-19030", "Purple", "#7952a8"),
      color("perler-common", "P-80-19033", "Tan", "#d6ba91"),
      color("perler-common", "P-80-19035", "Peach", "#f0b18e"),
      color("perler-common", "P-80-19038", "Magenta", "#b94c91"),
      color("perler-common", "P-80-19041", "Toothpaste", "#6cc0b5"),
      color("perler-common", "P-80-19044", "Pastel Green", "#a8cf9a"),
      color("perler-common", "P-80-19046", "Dark Blue", "#305aa0"),
      color("perler-common", "P-80-19047", "Light Green", "#8abd5e"),
      color("perler-common", "P-80-19048", "Sky Blue", "#5fa1d3"),
      color("perler-common", "P-80-19049", "Cranapple", "#8f2f38"),
      color("perler-common", "P-80-19052", "Light Blue", "#78add8"),
      color("perler-common", "P-80-19054", "Kiwi Lime", "#b5c95a"),
      color("perler-common", "P-80-19058", "Pastel Lavender", "#c6a5d7"),
      color("perler-common", "P-80-19060", "Plum", "#53357e"),
      color("perler-common", "P-80-19062", "Hot Coral", "#e87364"),
      color("perler-common", "P-80-19072", "Light Blueberry", "#92bfe4"),
      color("perler-common", "P-80-19080", "Periwinkle Blue", "#7f8fc7"),
      color("perler-common", "P-80-19083", "Light Peach", "#f6d0b4"),
      color("perler-common", "P-80-19088", "Evergreen", "#2f7046"),
    ],
  },
  {
    id: "hama-midi-common",
    name: "Hama Midi 常用",
    description: "Hama Midi 常用屏幕参考色。",
    colors: [
      color("hama-midi-common", "01", "White", "#f6f2ec"),
      color("hama-midi-common", "02", "Cream", "#f0dfbe"),
      color("hama-midi-common", "03", "Yellow", "#efd64b"),
      color("hama-midi-common", "04", "Orange", "#ed9435"),
      color("hama-midi-common", "05", "Red", "#c83d37"),
      color("hama-midi-common", "06", "Pink", "#ec98ad"),
      color("hama-midi-common", "07", "Purple", "#7952a8"),
      color("hama-midi-common", "08", "Blue", "#3262a8"),
      color("hama-midi-common", "09", "Light Blue", "#78add8"),
      color("hama-midi-common", "10", "Green", "#579a4d"),
      color("hama-midi-common", "11", "Light Green", "#91bd64"),
      color("hama-midi-common", "12", "Brown", "#7c5133"),
      color("hama-midi-common", "17", "Grey", "#999b97"),
      color("hama-midi-common", "18", "Black", "#111111"),
      color("hama-midi-common", "20", "Reddish Brown", "#8e4537"),
      color("hama-midi-common", "21", "Light Brown", "#aa7954"),
      color("hama-midi-common", "22", "Light Purple", "#b99ad2"),
      color("hama-midi-common", "26", "Beige", "#d8bf95"),
      color("hama-midi-common", "27", "Dark Grey", "#5f6260"),
      color("hama-midi-common", "28", "Dark Green", "#2f7046"),
      color("hama-midi-common", "29", "Claret", "#8f2e32"),
      color("hama-midi-common", "30", "Burgundy", "#653144"),
      color("hama-midi-common", "31", "Turquoise", "#42a8c4"),
      color("hama-midi-common", "32", "Neon Yellow", "#e9e55a"),
      color("hama-midi-common", "33", "Neon Red", "#ef5a45"),
      color("hama-midi-common", "34", "Neon Blue", "#339fc9"),
      color("hama-midi-common", "35", "Neon Green", "#85c95f"),
      color("hama-midi-common", "36", "Neon Orange", "#f0a145"),
      color("hama-midi-common", "37", "Neon Pink", "#ee6da5"),
      color("hama-midi-common", "38", "Olive Green", "#71834d"),
      color("hama-midi-common", "39", "Pastel Yellow", "#f7e58a"),
      color("hama-midi-common", "43", "Pastel Red", "#e87364"),
      color("hama-midi-common", "44", "Pastel Purple", "#c6a5d7"),
      color("hama-midi-common", "45", "Pastel Lime", "#b5d77a"),
      color("hama-midi-common", "46", "Pastel Blue", "#95c8e5"),
      color("hama-midi-common", "47", "Pastel Green", "#a8cf9a"),
      color("hama-midi-common", "48", "Pastel Pink", "#f0bdc8"),
      color("hama-midi-common", "49", "Azure", "#5fa1d3"),
      color("hama-midi-common", "60", "Striped Red", "#c83d37"),
      color("hama-midi-common", "70", "Mini White", "#f6f2ec"),
    ],
  },
];

export function cloneColor(colorValue: BeadColor): BeadColor {
  return { ...colorValue };
}

export function cloneColorGroup(group: BeadColorGroup): BeadColorGroup {
  return {
    ...group,
    colors: group.colors.map(cloneColor),
  };
}
