import { describe, expect, it } from "vitest";
import { BUILTIN_COLOR_GROUPS, cloneColorGroup } from "./beadPalettes";
import { colorDisplaySections, colorLightness, mardCodeParts, orderColorsForDisplay } from "./colorOrdering";

const EXPECTED_MARD_COUNTS = {
  "mard-72": 72,
  "mard-96": 96,
  "mard-120": 120,
  "mard-144": 144,
  "mard-221": 221,
  "mard-291": 291,
};

describe("built-in bead palettes", () => {
  it("includes the MARD set ranges with exact color counts", () => {
    for (const [id, count] of Object.entries(EXPECTED_MARD_COUNTS)) {
      const group = BUILTIN_COLOR_GROUPS.find((item) => item.id === id);
      expect(group?.colors).toHaveLength(count);
      expect(group?.name).toContain(`${count}色`);
      expect(group?.description).toBeTruthy();
    }
  });

  it("uses stable MARD letter-number codes and valid hex values", () => {
    const mard291 = BUILTIN_COLOR_GROUPS.find((item) => item.id === "mard-291");
    expect(mard291?.colors.some((color) => color.code === "A1")).toBe(true);
    expect(mard291?.colors.some((color) => color.code === "B12")).toBe(true);
    expect(mard291?.colors.some((color) => color.code === "ZG8")).toBe(true);

    for (const color of mard291?.colors ?? []) {
      expect(color.code).toMatch(/^[A-Z]+[0-9]+$/);
      expect(color.name).toBe(`MARD ${color.code}`);
      expect(color.hex).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("orders MARD palettes by series and lightness for color-card lookup", () => {
    const mard221 = BUILTIN_COLOR_GROUPS.find((item) => item.id === "mard-221");
    expect(mard221).toBeTruthy();

    const colors = mard221!.colors;
    const firstBIndex = colors.findIndex((color) => color.code.startsWith("B"));
    let lastAIndex = -1;
    colors.forEach((color, index) => {
      if (color.code.startsWith("A")) lastAIndex = index;
    });
    expect(firstBIndex).toBeGreaterThan(lastAIndex);

    const aColors = colors.filter((color) => mardCodeParts(color.code)?.prefix === "A");
    for (let index = 1; index < aColors.length; index += 1) {
      expect(colorLightness(aColors[index - 1].hex)).toBeGreaterThanOrEqual(colorLightness(aColors[index].hex));
    }
  });

  it("moves used MARD colors into a top usage section", () => {
    const colors = [
      { id: "a-light", code: "A1", name: "MARD A1", hex: "#ffffff", enabled: false },
      { id: "a-used", code: "A2", name: "MARD A2", hex: "#777777", enabled: true },
      { id: "b-used", code: "B1", name: "MARD B1", hex: "#eeeeee", enabled: true },
      { id: "b-unused", code: "B2", name: "MARD B2", hex: "#222222", enabled: false },
    ];

    expect(orderColorsForDisplay("mard-291", colors).map((color) => color.code)).toEqual(["A2", "A1", "B1", "B2"]);

    const sections = colorDisplaySections({ id: "mard-291", name: "MARD 291色", colors });
    expect(sections.map((section) => section.key)).toEqual(["used", "A", "B"]);
    expect(sections[0].label).toBe("使用组");
    expect(sections[0].colors.map((color) => color.code)).toEqual(["A2", "B1"]);
    expect(sections[1].colors.map((color) => color.code)).toEqual(["A1"]);
    expect(sections[2].colors.map((color) => color.code)).toEqual(["B2"]);
  });

  it("keeps MARD usage sections stable when only visibility changes", () => {
    const colors = [
      { id: "a-light", code: "A1", name: "MARD A1", hex: "#ffffff", enabled: true, displayUsed: false },
      { id: "a-used", code: "A2", name: "MARD A2", hex: "#777777", enabled: false, displayUsed: true },
      { id: "b-used", code: "B1", name: "MARD B1", hex: "#eeeeee", enabled: false, displayUsed: true },
      { id: "b-unused", code: "B2", name: "MARD B2", hex: "#222222", enabled: true, displayUsed: false },
    ];

    const sections = colorDisplaySections({ id: "mard-291", name: "MARD 291色", colors });

    expect(sections.map((section) => section.key)).toEqual(["used", "A", "B"]);
    expect(sections[0].colors.map((color) => color.code)).toEqual(["A2", "B1"]);
    expect(sections[1].colors.map((color) => color.code)).toEqual(["A1"]);
    expect(sections[2].colors.map((color) => color.code)).toEqual(["B2"]);
  });

  it("does not create duplicate color ids inside any built-in group", () => {
    for (const group of BUILTIN_COLOR_GROUPS) {
      const ids = group.colors.map((color) => color.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("clones group metadata and colors", () => {
    const source = BUILTIN_COLOR_GROUPS.find((item) => item.id === "mard-72");
    expect(source).toBeTruthy();
    const copy = cloneColorGroup(source!);
    expect(copy).not.toBe(source);
    expect(copy.description).toBe(source?.description);
    expect(copy.source).toBe(source?.source);
    expect(copy.colors[0]).not.toBe(source?.colors[0]);
  });
});
