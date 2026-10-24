import { describe, expect, it } from "vitest";
import { parseProject } from "./project";

describe("project parsing", () => {
  it("adds missing built-in color groups to cached projects without changing the active group", () => {
    const project = parseProject(
      JSON.stringify({
        version: 1,
        colorGroups: [
          {
            id: "default",
            name: "default",
            colors: [{ id: "default-k01", code: "K01", name: "Black", hex: "#111111", enabled: true }],
          },
        ],
        activeColorGroupId: "default",
        layers: [
          {
            id: "layer-1",
            name: "Layer 1",
            visible: true,
            colorGroups: [
              {
                id: "default",
                name: "default",
                colors: [{ id: "default-k01", code: "K01", name: "Black", hex: "#111111", enabled: true }],
              },
            ],
            activeColorGroupId: "default",
            selectedColorId: "default-k01",
            grid: { width: 1, height: 1, cells: [null] },
          },
        ],
        activeLayerId: "layer-1",
      }),
    );

    expect(project.activeColorGroupId).toBe("default");
    expect(project.layers[0].activeColorGroupId).toBe("default");
    expect(project.colorGroups.some((group) => group.id === "mard-72")).toBe(true);
    expect(project.colorGroups.some((group) => group.id === "mard-291")).toBe(true);
    expect(project.layers[0].colorGroups.some((group) => group.id === "mard-221")).toBe(true);
    expect(project.layers[0].selectedColorId).toBe("default-k01");
    expect(project.editor.modifiers.showCenterGuides).toBe(false);
    expect(project.editor.modifiers.highlightColorOutline).toBe(true);
    expect(project.editor.modifiers.mirrorDrawX).toBe(false);
  });

  it("restores editor modifiers from project JSON", () => {
    const project = parseProject(
      JSON.stringify({
        version: 1,
        layers: [
          {
            id: "layer-1",
            name: "Layer 1",
            visible: true,
            grid: { width: 1, height: 1, cells: [null] },
          },
        ],
        activeLayerId: "layer-1",
        editor: {
          tool: "brush",
          selectedColorId: "",
          zoom: 1,
          offsetX: 0,
          offsetY: 0,
          modifiers: {
            showCenterGuides: true,
            highlightColorOutline: false,
            mirrorDrawX: true,
            rotateDrawQuarter: true,
          },
        },
      }),
    );

    expect(project.editor.modifiers.showCenterGuides).toBe(true);
    expect(project.editor.modifiers.highlightColorOutline).toBe(false);
    expect(project.editor.modifiers.mirrorDrawX).toBe(true);
    expect(project.editor.modifiers.rotateDrawQuarter).toBe(true);
    expect(project.editor.modifiers.mirrorDrawY).toBe(false);
  });

  it("normalizes duplicate layer ids from cached or imported projects", () => {
    const project = parseProject(
      JSON.stringify({
        version: 1,
        layers: [
          {
            id: "layer-copy",
            name: "Layer Copy",
            visible: true,
            grid: { width: 1, height: 1, cells: ["red"] },
          },
          {
            id: "layer-copy",
            name: "Layer Copy 2",
            visible: true,
            grid: { width: 1, height: 1, cells: ["blue"] },
          },
        ],
        activeLayerId: "layer-copy",
      }),
    );

    expect(project.layers).toHaveLength(2);
    expect(new Set(project.layers.map((layer) => layer.id)).size).toBe(2);
    expect(project.layers[0].id).toBe("layer-copy");
    expect(project.layers[1].id).toBe("layer-copy_2");
    expect(project.activeLayerId).toBe("layer-copy");
  });
});
