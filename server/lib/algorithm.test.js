const { strFromU8, unzipSync } = require("fflate");
const sharp = require("sharp");
const { hexToRgb, nearestBeadColor } = require("./color");
const { buildExportZip, normalizeExportProject } = require("./exportZip");
const { buildObjMtl } = require("./obj");
const { buildOverviewSvg } = require("./overviewPattern");
const { buildPatternSvg, colorLabels, groupedLegendItems, legendName } = require("./pattern");
const { analyzeImageColors, rasterizeImage } = require("./rasterize");
const { generateColorStl, generateLatticeStl, triangleCount } = require("./stl");

function parseBinaryStl(stl) {
  const buffer = Buffer.from(stl);
  const count = buffer.readUInt32LE(80);
  const triangles = [];
  let offset = 84;
  const readVec = () => {
    const vec = {
      x: buffer.readFloatLE(offset),
      y: buffer.readFloatLE(offset + 4),
      z: buffer.readFloatLE(offset + 8),
    };
    offset += 12;
    return vec;
  };
  for (let index = 0; index < count; index += 1) {
    const normal = readVec();
    const a = readVec();
    const b = readVec();
    const c = readVec();
    offset += 2;
    triangles.push({ normal, a, b, c });
  }
  return triangles;
}

function triangleNormalZ(triangle) {
  const ab = {
    x: triangle.b.x - triangle.a.x,
    y: triangle.b.y - triangle.a.y,
    z: triangle.b.z - triangle.a.z,
  };
  const ac = {
    x: triangle.c.x - triangle.a.x,
    y: triangle.c.y - triangle.a.y,
    z: triangle.c.z - triangle.a.z,
  };
  return ab.x * ac.y - ab.y * ac.x;
}

function expectStlTopAndBottom(stl, expectedHeight) {
  const triangles = parseBinaryStl(stl);
  const vertices = triangles.flatMap((triangle) => [triangle.a, triangle.b, triangle.c]);
  const minZ = Math.min(...vertices.map((vertex) => vertex.z));
  const maxZ = Math.max(...vertices.map((vertex) => vertex.z));
  const bottom = triangles.filter((triangle) => [triangle.a, triangle.b, triangle.c].every((vertex) => Math.abs(vertex.z - minZ) < 1e-6));
  const top = triangles.filter((triangle) => [triangle.a, triangle.b, triangle.c].every((vertex) => Math.abs(vertex.z - maxZ) < 1e-6));

  expect(minZ).toBeCloseTo(0);
  expect(maxZ).toBeCloseTo(expectedHeight);
  expect(bottom.length).toBeGreaterThan(0);
  expect(top.length).toBeGreaterThan(0);
  expect(bottom.every((triangle) => triangle.normal.z < 0 && triangleNormalZ(triangle) < 0)).toBe(true);
  expect(top.every((triangle) => triangle.normal.z > 0 && triangleNormalZ(triangle) > 0)).toBe(true);
}

function stlBounds(stl) {
  const triangles = parseBinaryStl(stl);
  const vertices = triangles.flatMap((triangle) => [triangle.a, triangle.b, triangle.c]);
  return {
    minX: Math.min(...vertices.map((vertex) => vertex.x)),
    maxX: Math.max(...vertices.map((vertex) => vertex.x)),
    minY: Math.min(...vertices.map((vertex) => vertex.y)),
    maxY: Math.max(...vertices.map((vertex) => vertex.y)),
    minZ: Math.min(...vertices.map((vertex) => vertex.z)),
    maxZ: Math.max(...vertices.map((vertex) => vertex.z)),
  };
}

function vertexBoundsFromModelXml(modelXml) {
  const vertices = [];
  const vertexPattern = /<vertex x="([^"]+)" y="([^"]+)" z="([^"]+)"/g;
  let match = vertexPattern.exec(modelXml);
  while (match) {
    vertices.push({ x: Number(match[1]), y: Number(match[2]), z: Number(match[3]) });
    match = vertexPattern.exec(modelXml);
  }
  return {
    minX: Math.min(...vertices.map((vertex) => vertex.x)),
    maxX: Math.max(...vertices.map((vertex) => vertex.x)),
    minY: Math.min(...vertices.map((vertex) => vertex.y)),
    maxY: Math.max(...vertices.map((vertex) => vertex.y)),
    minZ: Math.min(...vertices.map((vertex) => vertex.z)),
    maxZ: Math.max(...vertices.map((vertex) => vertex.z)),
  };
}

function transformValues(transform) {
  const values = String(transform)
    .trim()
    .split(/\s+/)
    .map(Number);
  return {
    x: values[9] ?? 0,
    y: values[10] ?? 0,
    z: values[11] ?? 0,
  };
}

function buildItemTransforms(rootModelXml) {
  const items = new Map();
  const itemPattern = /<item[^>]*objectid="([^"]+)"[^>]*transform="([^"]+)"/g;
  let match = itemPattern.exec(rootModelXml);
  while (match) {
    items.set(Number(match[1]), transformValues(match[2]));
    match = itemPattern.exec(rootModelXml);
  }
  return items;
}

function assembleTransforms(modelSettingsXml) {
  const transforms = new Map();
  const assemblePattern = /<assemble_item[^>]*object_id="([^"]+)"[^>]*transform="([^"]+)"/g;
  let match = assemblePattern.exec(modelSettingsXml);
  while (match) {
    transforms.set(Number(match[1]), transformValues(match[2]));
    match = assemblePattern.exec(modelSettingsXml);
  }
  return transforms;
}

function plateColumns(count) {
  return Math.max(1, Math.ceil(Math.sqrt(Math.max(1, count))));
}

function expectedPlateCenter(index, count) {
  const plateSize = 256;
  const plateSpacing = plateSize * 1.2;
  const column = index % plateColumns(count);
  const row = Math.floor(index / plateColumns(count));
  return {
    x: plateSize / 2 + column * plateSpacing,
    y: plateSize / 2 - row * plateSpacing,
  };
}

const geometry = {
  blockSize: 5,
  fitGap: 0.2,
  blockHeight: 2,
  plateHeight: 1.2,
  blockChamfer: 0,
  gridLineWidth: 0.6,
  alphaThreshold: 16,
  maxGridSize: 64,
};

describe("backend algorithms", () => {
  it("matches RGB pixels to enabled bead colors", () => {
    const color = nearestBeadColor(
      { r: 240, g: 40, b: 40 },
      [
        { id: "red", code: "R1", name: "red", hex: "#ef4444", enabled: true },
        { id: "blue", code: "B1", name: "blue", hex: "#2563eb", enabled: true },
      ],
    );
    expect(color.id).toBe("red");
  });

  it("generates binary STL files for colors and lattice", () => {
    const grid = { width: 1, height: 1, cells: ["red"] };
    expect(triangleCount(generateColorStl(grid, "red", geometry))).toBe(12);
    expect(triangleCount(generateLatticeStl(grid, geometry))).toBeGreaterThan(0);
  });

  it("applies block chamfer to exported bead STL geometry", () => {
    const grid = { width: 1, height: 1, cells: ["red"] };
    const flat = generateColorStl(grid, "red", { ...geometry, blockChamfer: 0 });
    const chamfered = generateColorStl(grid, "red", { ...geometry, blockChamfer: 0.5 });
    expect(triangleCount(chamfered)).toBeGreaterThan(triangleCount(flat));
  });

  it("exports STL with bottom at z=0 and top face normals pointing upward", () => {
    const grid = { width: 1, height: 1, cells: ["red"] };
    expectStlTopAndBottom(generateColorStl(grid, "red", { ...geometry, blockChamfer: 0 }), geometry.blockHeight);
    expectStlTopAndBottom(generateLatticeStl(grid, geometry), geometry.plateHeight);
  });

  it("applies block chamfer to all-in-one OBJ bead geometry", () => {
    const project = {
      grid: { width: 1, height: 1, cells: ["red"] },
      geometry: { ...geometry, blockChamfer: 0.5 },
    };
    const colors = [{ id: "red", code: "R1", name: "red", hex: "#ef4444", enabled: true }];
    const { obj } = buildObjMtl(project, colors);
    const faceCount = obj.split("\n").filter((line) => line.startsWith("f ")).length;
    expect(faceCount).toBeGreaterThan(6);
  });

  it("keeps pixel-level lattice lines between adjacent colored blocks", () => {
    const grid = { width: 2, height: 1, cells: ["red", "red"] };
    const bounds = stlBounds(generateLatticeStl(grid, geometry));
    const pitch = geometry.blockSize + geometry.fitGap * 2 + geometry.gridLineWidth;
    expect(bounds.maxX).toBeCloseTo(2 * pitch + geometry.gridLineWidth);
    expect(triangleCount(generateLatticeStl(grid, geometry))).toBeGreaterThan(triangleCount(generateLatticeStl({ width: 1, height: 1, cells: ["red"] }, geometry)));
  });

  it("generates lattice as direct bar cuboids while keeping STL orientation valid", () => {
    const filledGrid = {
      width: 2,
      height: 2,
      cells: ["red", "red", "red", "red"],
    };
    const stl = generateLatticeStl(filledGrid, geometry);
    expectStlTopAndBottom(stl, geometry.plateHeight);
    expect(triangleCount(stl)).toBeGreaterThan(triangleCount(generateLatticeStl({ width: 1, height: 1, cells: ["red"] }, geometry)));
  });

  it("generates lattice from colored boundary instead of full canvas", () => {
    const sparseGrid = {
      width: 5,
      height: 5,
      cells: [
        null, null, null, null, null,
        null, "red", "red", "red", null,
        null, "red", null, "red", null,
        null, "red", "red", "red", null,
        null, null, null, null, null,
      ],
    };
    const bounds = stlBounds(generateLatticeStl(sparseGrid, geometry));
    const pitch = geometry.blockSize + geometry.fitGap * 2 + geometry.gridLineWidth;
    expect(bounds.maxX).toBeCloseTo(3 * pitch + geometry.gridLineWidth);
    expect(bounds.maxY).toBeCloseTo(3 * pitch + geometry.gridLineWidth);
  });

  it("can center exported STL and OBJ geometry on the full grid origin", () => {
    const grid = {
      width: 4,
      height: 2,
      cells: [
        "red", null, null, null,
        null, null, null, "red",
      ],
    };
    const pitch = geometry.blockSize + geometry.fitGap * 2 + geometry.gridLineWidth;
    const colorBounds = stlBounds(generateColorStl(grid, "red", geometry, { alignToGridCenter: true }));
    const latticeBounds = stlBounds(generateLatticeStl(grid, geometry, { alignToGridCenter: true }));
    expect(colorBounds.minX).toBeLessThan(0);
    expect(colorBounds.maxX).toBeGreaterThan(0);
    expect(colorBounds.minY).toBeLessThan(0);
    expect(colorBounds.maxY).toBeGreaterThan(0);
    expect(latticeBounds.minX).toBeCloseTo(-(grid.width * pitch + geometry.gridLineWidth) / 2);
    expect(latticeBounds.maxX).toBeCloseTo((grid.width * pitch + geometry.gridLineWidth) / 2);

    const { obj } = buildObjMtl(
      { grid, geometry },
      [{ id: "red", code: "R1", name: "red", hex: "#ef4444", enabled: true }],
      { alignToGridCenter: true, materialLibrary: null },
    );
    const vertices = obj.split("\n")
      .filter((line) => line.startsWith("v "))
      .map((line) => line.split(/\s+/).slice(1, 4).map(Number));
    expect(Math.min(...vertices.map((vertex) => vertex[0]))).toBeLessThan(0);
    expect(Math.max(...vertices.map((vertex) => vertex[0]))).toBeGreaterThan(0);
    expect(Math.min(...vertices.map((vertex) => vertex[1]))).toBeLessThan(0);
    expect(Math.max(...vertices.map((vertex) => vertex[1]))).toBeGreaterThan(0);
  });

  it("exports ZIP with safe layer folders, metadata, and two png variants per layer by default", async () => {
    const zip = await buildExportZip({
      version: 1,
      layers: [
        {
          id: "single",
          name: "Single",
          visible: true,
          grid: { width: 1, height: 1, cells: ["red"] },
          kernelColorGrid: null,
          sourceImage: null,
          imageRotation: 0,
          imageCrop: { cropLeft: 0, cropTop: 0, cropRight: 0, cropBottom: 0 },
          imageTolerance: 8,
        },
      ],
      activeLayerId: "single",
      colorGroups: [
        {
          id: "default",
          name: "default",
          colors: [{ id: "red", code: "R1", name: "red", hex: "#ef4444", enabled: true }],
        },
      ],
      activeColorGroupId: "default",
      imageColorGroup: null,
      geometry,
      editor: { tool: "brush", selectedColorId: "red", zoom: 1, offsetX: 0, offsetY: 0 },
    }, { colorCount: 8, mappingMode: "palette", kernelPreview: true, theme: "system" });
    const files = unzipSync(zip);
    expect(files["black_lattice.stl"]).toBeUndefined();
    expect(files["bead_R1_EF4444.stl"]).toBeUndefined();
    expect(files["bead_pattern.png"]).toBeUndefined();
    expect(files["Single/Single.obj"]).toBeTruthy();
    expect(files["Single/Single.json"]).toBeTruthy();
    expect(files["Single/Single.png"]).toBeTruthy();
    expect(files["Single/Single_beads.png"]).toBeTruthy();
    expect(files["Single/Single_hammer.png"]).toBeUndefined();
    expect(files["Single/Single.3mf"]).toBeTruthy();
    expect(files["Single/black_lattice.stl"]).toBeUndefined();
    expect(files["Single/bead_R1_EF4444.stl"]).toBeUndefined();
    expect(files["Single/all_in_one.mtl"]).toBeUndefined();
    expect(files["meta_data/all_layers.obj"]).toBeTruthy();
    expect(files["meta_data/all_layers.mtl"]).toBeTruthy();
    expect(files["meta_data/project.pixel-stl.json"]).toBeTruthy();
    expect(files["meta_data/app_settings.json"]).toBeTruthy();
    expect(Buffer.from(files["Single/Single.png"]).slice(1, 4).toString()).toBe("PNG");
    const obj = strFromU8(files["Single/Single.obj"]);
    expect(obj).not.toContain("mtllib");
    expect(obj).toContain("usemtl black_lattice");
    expect(obj).toContain("usemtl bead_R1_EF4444");
    const manifest = JSON.parse(strFromU8(files["meta_data/manifest.json"]));
    const layerManifest = JSON.parse(strFromU8(files["Single/Single.json"]));
    const restoredProject = JSON.parse(strFromU8(files["meta_data/project.pixel-stl.json"]));
    const restoredSettings = JSON.parse(strFromU8(files["meta_data/app_settings.json"]));
    expect(restoredProject.layers).toHaveLength(1);
    expect(restoredSettings).toMatchObject({ colorCount: 8, mappingMode: "palette", kernelPreview: true, theme: "system" });
    expect(Object.keys(files).filter((file) => file.startsWith("Single/")).sort()).toEqual(["Single/Single.3mf", "Single/Single.json", "Single/Single.obj", "Single/Single.png", "Single/Single_beads.png"]);
    expect(manifest.files.map((file) => file.file)).toContain("Single/Single.obj");
    expect(manifest.files.map((file) => file.file)).toContain("Single/Single.json");
    expect(manifest.files.map((file) => file.file)).toContain("Single/Single.png");
    expect(manifest.colors[0]).toMatchObject({ colorId: "red", code: "R1", name: "red", hex: "#ef4444", count: 1 });
    expect(manifest.files.find((file) => file.role === "combined" && file.layerId === "single")).toMatchObject({
      file: "Single/Single.obj",
    });
    expect(manifest.files.find((file) => file.role === "pattern" && file.layerId === "single")).toMatchObject({ file: "Single/Single.png" });
    expect(manifest.files.find((file) => file.role === "bead-pattern" && file.layerId === "single")).toMatchObject({ file: "Single/Single_beads.png" });
    expect(layerManifest.files.map((file) => file.file).sort()).toEqual(["Single.3mf", "Single.json", "Single.obj", "Single.png", "Single_beads.png"]);
    expect(manifest.files.find((file) => file.role === "bambu-3mf" && file.layerId === "single")).toMatchObject({
      file: "Single/Single.3mf",
      plates: expect.arrayContaining([
        expect.objectContaining({ plateId: 1, role: "lattice", code: "black_lattice", hex: "#000000", extruder: 1, sourceStl: "black_lattice.stl" }),
        expect.objectContaining({ plateId: 2, role: "bead", code: "R1", hex: "#ef4444", extruder: 2, count: 1, sourceStl: "bead_R1_EF4444.stl" }),
      ]),
    });
  });

  it("filters exported layers and file types from export options", async () => {
    const zip = await buildExportZip(
      {
        version: 1,
        layers: [
          {
            id: "first",
            name: "First",
            visible: true,
            grid: { width: 1, height: 1, cells: ["red"] },
            kernelColorGrid: null,
            sourceImage: null,
            imageRotation: 0,
            imageCrop: { cropLeft: 0, cropTop: 0, cropRight: 0, cropBottom: 0 },
            imageTolerance: 8,
          },
          {
            id: "second",
            name: "Second",
            visible: true,
            grid: { width: 1, height: 1, cells: ["red"] },
            kernelColorGrid: null,
            sourceImage: null,
            imageRotation: 0,
            imageCrop: { cropLeft: 0, cropTop: 0, cropRight: 0, cropBottom: 0 },
            imageTolerance: 8,
          },
        ],
        activeLayerId: "second",
        colorGroups: [
          {
            id: "default",
            name: "default",
            colors: [{ id: "red", code: "R1", name: "red", hex: "#ef4444", enabled: true }],
          },
        ],
        activeColorGroupId: "default",
        imageColorGroup: null,
        geometry,
        editor: { tool: "brush", selectedColorId: "red", zoom: 1, offsetX: 0, offsetY: 0 },
      },
      { colorCount: 8 },
      null,
      { layerIds: ["second"], includeObj: false, include3mf: true, includePng: true, includeMeta: true },
    );
    const files = unzipSync(zip);
    expect(files["First/First.png"]).toBeUndefined();
    expect(files["Second/Second.png"]).toBeTruthy();
    expect(files["Second/Second_beads.png"]).toBeTruthy();
    expect(files["Second/Second.3mf"]).toBeTruthy();
    expect(files["Second/Second.obj"]).toBeUndefined();
    expect(files["Second/Second.json"]).toBeTruthy();
    expect(files["meta_data/all_layers.obj"]).toBeUndefined();
    expect(files["meta_data/manifest.json"]).toBeTruthy();
    const manifest = JSON.parse(strFromU8(files["meta_data/manifest.json"]));
    expect(manifest.layers.map((layer) => layer.id)).toEqual(["second"]);
    expect(manifest.files.map((file) => file.file).sort()).toEqual([
      "Second/Second.3mf",
      "Second/Second.json",
      "Second/Second.png",
      "Second/Second_beads.png",
    ]);
  });

  it("exports all selected layers even when source layer ids are duplicated", async () => {
    const duplicateId = "layer-dup";
    const project = {
      version: 1,
      layers: [
        {
          id: duplicateId,
          name: "First Copy",
          visible: true,
          grid: { width: 1, height: 1, cells: ["red"] },
          kernelColorGrid: null,
          sourceImage: null,
          imageRotation: 0,
          imageCrop: { cropLeft: 0, cropTop: 0, cropRight: 0, cropBottom: 0 },
          imageTolerance: 8,
        },
        {
          id: duplicateId,
          name: "Second Copy",
          visible: true,
          grid: { width: 1, height: 1, cells: ["blue"] },
          kernelColorGrid: null,
          sourceImage: null,
          imageRotation: 0,
          imageCrop: { cropLeft: 0, cropTop: 0, cropRight: 0, cropBottom: 0 },
          imageTolerance: 8,
        },
      ],
      activeLayerId: duplicateId,
      colorGroups: [
        {
          id: "default",
          name: "default",
          colors: [
            { id: "red", code: "R1", name: "red", hex: "#ef4444", enabled: true },
            { id: "blue", code: "B1", name: "blue", hex: "#3b82f6", enabled: true },
          ],
        },
      ],
      activeColorGroupId: "default",
      imageColorGroup: null,
      geometry,
      editor: { tool: "brush", selectedColorId: "red", zoom: 1, offsetX: 0, offsetY: 0 },
    };

    const zip = await buildExportZip(project, null, null, {
      layerIds: [duplicateId, duplicateId],
      includeObj: false,
      include3mf: false,
      includePatternPng: true,
      includeBeadPng: false,
      includeMeta: true,
    });

    const files = unzipSync(zip);
    const manifest = JSON.parse(strFromU8(files["meta_data/manifest.json"]));
    expect(manifest.layers).toHaveLength(2);
    expect(manifest.layers.map((layer) => layer.name)).toEqual(["First Copy", "Second Copy"]);
    expect(Object.keys(files).filter((file) => file.endsWith(".png") && file.startsWith("meta_data/"))).toHaveLength(0);
    expect(files["First_Copy/First_Copy.png"]).toBeTruthy();
    expect(files["Second_Copy/Second_Copy.png"]).toBeTruthy();
  });

  it("exports overview png only when multiple selected layers request it", async () => {
    const layer = (id, name, cells) => ({
      id,
      name,
      visible: true,
      colorGroups: [
        {
          id: "default",
          name: "default",
          colors: [
            { id: "red", code: "R1", name: "red", hex: "#ef4444", enabled: true },
            { id: "blue", code: "B1", name: "blue", hex: "#3b82f6", enabled: true },
          ],
        },
      ],
      activeColorGroupId: "default",
      imageColorGroup: null,
      selectedColorId: "red",
      grid: { width: 2, height: 2, cells },
      kernelColorGrid: null,
      sourceImage: null,
      imageRotation: 0,
      imageCrop: { cropLeft: 0, cropTop: 0, cropRight: 0, cropBottom: 0 },
      imageTolerance: 8,
    });
    const project = {
      version: 1,
      layers: [layer("first", "First Layer", ["red", null, "blue", "red"]), layer("second", "Second Layer", [null, "blue", null, "blue"])],
      activeLayerId: "first",
      colorGroups: [
        {
          id: "default",
          name: "default",
          colors: [
            { id: "red", code: "R1", name: "red", hex: "#ef4444", enabled: true },
            { id: "blue", code: "B1", name: "blue", hex: "#3b82f6", enabled: true },
          ],
        },
      ],
      activeColorGroupId: "default",
      imageColorGroup: null,
      geometry,
      editor: { tool: "brush", selectedColorId: "red", zoom: 1, offsetX: 0, offsetY: 0 },
    };
    const zip = await buildExportZip(project, null, null, {
      layerIds: ["first", "second"],
      includeObj: false,
      include3mf: false,
      includePatternPng: false,
      includeBeadPng: false,
      includeOverviewPng: true,
      overviewColumns: 1,
      overviewCardHeight: 420,
      zipFileName: "custom-overview.zip",
      includeMeta: true,
    });
    const files = unzipSync(zip);
    expect(Buffer.from(files["overview.png"]).slice(1, 4).toString()).toBe("PNG");
    const manifest = JSON.parse(strFromU8(files["meta_data/manifest.json"]));
    expect(manifest.files.find((file) => file.role === "overview-pattern")).toMatchObject({
      file: "overview.png",
      name: "Selected layers overview",
    });

    const singleLayerZip = await buildExportZip(project, null, null, {
      layerIds: ["first"],
      includeObj: false,
      include3mf: false,
      includePatternPng: false,
      includeBeadPng: false,
      includeOverviewPng: true,
      includeMeta: true,
    });
    const singleLayerFiles = unzipSync(singleLayerZip);
    expect(singleLayerFiles["overview.png"]).toBeUndefined();
    const singleManifest = JSON.parse(strFromU8(singleLayerFiles["meta_data/manifest.json"]));
    expect(singleManifest.files.find((file) => file.role === "overview-pattern")).toBeUndefined();
  });

  it("builds overview SVG with layer preview metadata", () => {
    const layer = {
      id: "overview",
      name: "Overview Layer With A Very Long Name",
      visible: true,
      colorGroups: [
        {
          id: "default",
          name: "default",
          colors: [
            { id: "red", code: "R1", name: "red", hex: "#ef4444", enabled: true },
            { id: "blue", code: "B1", name: "blue", hex: "#3b82f6", enabled: true },
          ],
        },
      ],
      activeColorGroupId: "default",
      imageColorGroup: null,
      selectedColorId: "red",
      grid: { width: 2, height: 2, cells: ["red", null, "blue", "red"] },
      kernelColorGrid: null,
      sourceImage: null,
      imageRotation: 0,
      imageCrop: { cropLeft: 0, cropTop: 0, cropRight: 0, cropBottom: 0 },
      imageTolerance: 8,
    };
    const { svg, height } = buildOverviewSvg({ geometry }, [layer], { title: "Custom Zip Name", columns: 1, cardHeight: 420 });
    expect(svg).toContain("Custom Zip Name");
    expect(svg).toContain("Overview Layer With A");
    expect(svg).not.toContain("&#21517;&#31216;&#65306;");
    expect(svg).not.toContain("layers</text>");
    expect(svg).not.toContain("R1");
    expect(svg).not.toContain("B1");
    expect(svg).toContain("overview-preview-outline");
    expect(svg).toContain('stroke="#94a3b8"');
    expect(svg).toContain("&#23610;&#23544;&#65306;");
    expect(svg).toContain("&#39063;&#31890;&#25968;&#65306;3");
    expect(svg).toContain("&#39068;&#33394;&#31181;&#31867;&#65306;2&#31181;");
    expect(height).toBe(528);
  });

  it("exports only the bead png when requested", async () => {
    const zip = await buildExportZip(
      {
        version: 1,
        layers: [
          {
            id: "single",
            name: "Single",
            visible: true,
            grid: { width: 1, height: 1, cells: ["red"] },
            kernelColorGrid: null,
            sourceImage: null,
            imageRotation: 0,
            imageCrop: { cropLeft: 0, cropTop: 0, cropRight: 0, cropBottom: 0 },
            imageTolerance: 8,
          },
        ],
        activeLayerId: "single",
        colorGroups: [
          {
            id: "default",
            name: "default",
            colors: [{ id: "red", code: "R1", name: "red", hex: "#ef4444", enabled: true }],
          },
        ],
        activeColorGroupId: "default",
        imageColorGroup: null,
        geometry,
        editor: { tool: "brush", selectedColorId: "red", zoom: 1, offsetX: 0, offsetY: 0 },
      },
      { colorCount: 8 },
      null,
      { layerIds: ["single"], includeObj: false, include3mf: false, includePatternPng: false, includeBeadPng: true, includeMeta: true },
    );
    const files = unzipSync(zip);
    expect(files["Single/Single.png"]).toBeUndefined();
    expect(files["Single/Single_beads.png"]).toBeTruthy();
    expect(files["Single/Single.obj"]).toBeUndefined();
    expect(files["Single/Single.3mf"]).toBeUndefined();
    const manifest = JSON.parse(strFromU8(files["meta_data/manifest.json"]));
    expect(manifest.files.map((file) => file.file).sort()).toEqual(["Single/Single.json", "Single/Single_beads.png"]);
    expect(manifest.files.find((file) => file.role === "bead-pattern")).toMatchObject({ file: "Single/Single_beads.png" });
  });

  it("exports hammer bead png when requested", async () => {
    const zip = await buildExportZip(
      {
        version: 1,
        layers: [
          {
            id: "single",
            name: "Single",
            visible: true,
            grid: { width: 1, height: 1, cells: ["red"] },
            kernelColorGrid: null,
            sourceImage: null,
            imageRotation: 0,
            imageCrop: { cropLeft: 0, cropTop: 0, cropRight: 0, cropBottom: 0 },
            imageTolerance: 8,
          },
        ],
        activeLayerId: "single",
        colorGroups: [
          {
            id: "default",
            name: "default",
            colors: [{ id: "red", code: "R1", name: "red", hex: "#ef4444", enabled: true }],
          },
        ],
        activeColorGroupId: "default",
        imageColorGroup: null,
        geometry,
        editor: { tool: "brush", selectedColorId: "red", zoom: 1, offsetX: 0, offsetY: 0 },
      },
      { colorCount: 8 },
      null,
      {
        layerIds: ["single"],
        includeObj: false,
        include3mf: false,
        includePatternPng: false,
        includeBeadPng: false,
        includeHammerPng: true,
        includeMeta: true,
      },
    );
    const files = unzipSync(zip);
    expect(files["Single/Single.png"]).toBeUndefined();
    expect(files["Single/Single_beads.png"]).toBeUndefined();
    expect(files["Single/Single_hammer.png"]).toBeTruthy();
    const manifest = JSON.parse(strFromU8(files["meta_data/manifest.json"]));
    expect(manifest.files.map((file) => file.file).sort()).toEqual(["Single/Single.json", "Single/Single_hammer.png"]);
    expect(manifest.files.find((file) => file.role === "hammer-pattern")).toMatchObject({ file: "Single/Single_hammer.png" });
  });

  it("exports all checked non-active layers instead of falling back to the active layer", async () => {
    const layer = (id, name, colorId, code, hex) => ({
      id,
      name,
      visible: true,
      colorGroups: [
        {
          id: "default",
          name: "default",
          colors: [{ id: colorId, code, name: colorId, hex, enabled: true }],
        },
      ],
      activeColorGroupId: "default",
      imageColorGroup: null,
      selectedColorId: colorId,
      grid: { width: 1, height: 1, cells: [colorId] },
      kernelColorGrid: null,
      sourceImage: null,
      imageRotation: 0,
      imageCrop: { cropLeft: 0, cropTop: 0, cropRight: 0, cropBottom: 0 },
      imageTolerance: 8,
    });
    const zip = await buildExportZip(
      {
        version: 1,
        layers: [
          layer("active", "Active", "red", "R1", "#ef4444"),
          layer("middle", "Middle", "blue", "B1", "#3b82f6"),
          layer("bottom", "Bottom", "green", "G1", "#22c55e"),
        ],
        activeLayerId: "active",
        colorGroups: [
          {
            id: "default",
            name: "default",
            colors: [
              { id: "red", code: "R1", name: "red", hex: "#ef4444", enabled: true },
              { id: "blue", code: "B1", name: "blue", hex: "#3b82f6", enabled: true },
              { id: "green", code: "G1", name: "green", hex: "#22c55e", enabled: true },
            ],
          },
        ],
        activeColorGroupId: "default",
        imageColorGroup: null,
        geometry,
        editor: { tool: "brush", selectedColorId: "red", zoom: 1, offsetX: 0, offsetY: 0 },
      },
      { colorCount: 8 },
      null,
      { layerIds: ["middle", "bottom"], includeObj: false, include3mf: true, includePng: true, includeMeta: true },
    );
    const files = unzipSync(zip);
    expect(files["Active/Active.png"]).toBeUndefined();
    expect(files["Middle/Middle.png"]).toBeTruthy();
    expect(files["Middle/Middle_beads.png"]).toBeTruthy();
    expect(files["Bottom/Bottom.png"]).toBeTruthy();
    expect(files["Bottom/Bottom_beads.png"]).toBeTruthy();
    expect(files["Middle/Middle.3mf"]).toBeTruthy();
    expect(files["Bottom/Bottom.3mf"]).toBeTruthy();
    const manifest = JSON.parse(strFromU8(files["meta_data/manifest.json"]));
    expect(manifest.layers.map((item) => item.id)).toEqual(["middle", "bottom"]);
    expect(manifest.files.map((file) => file.file).sort()).toEqual([
      "Bottom/Bottom.3mf",
      "Bottom/Bottom.json",
      "Bottom/Bottom.png",
      "Bottom/Bottom_beads.png",
      "Middle/Middle.3mf",
      "Middle/Middle.json",
      "Middle/Middle.png",
      "Middle/Middle_beads.png",
    ]);
  });

  it("rejects explicit export options when no selected layer id matches", async () => {
    await expect(
      buildExportZip(
        {
          version: 1,
          layers: [
            {
              id: "active",
              name: "Active",
              visible: true,
              grid: { width: 1, height: 1, cells: ["red"] },
              kernelColorGrid: null,
              sourceImage: null,
              imageRotation: 0,
              imageCrop: { cropLeft: 0, cropTop: 0, cropRight: 0, cropBottom: 0 },
              imageTolerance: 8,
            },
          ],
          activeLayerId: "active",
          colorGroups: [
            {
              id: "default",
              name: "default",
              colors: [{ id: "red", code: "R1", name: "red", hex: "#ef4444", enabled: true }],
            },
          ],
          activeColorGroupId: "default",
          imageColorGroup: null,
          geometry,
          editor: { tool: "brush", selectedColorId: "red", zoom: 1, offsetX: 0, offsetY: 0 },
        },
        { colorCount: 8 },
        null,
        { layerIds: ["missing"], includeObj: false, include3mf: true, includePng: true, includeMeta: true },
      ),
    ).rejects.toThrow("Invalid export options: no selected layers");
  });

  it("reports export progress monotonically and completes at 100", async () => {
    const events = [];
    await buildExportZip(
      {
        version: 1,
        layers: [
          {
            id: "single",
            name: "Single",
            visible: true,
            grid: { width: 1, height: 1, cells: ["red"] },
            kernelColorGrid: null,
            sourceImage: null,
            imageRotation: 0,
            imageCrop: { cropLeft: 0, cropTop: 0, cropRight: 0, cropBottom: 0 },
            imageTolerance: 8,
          },
        ],
        activeLayerId: "single",
        colorGroups: [
          {
            id: "default",
            name: "default",
            colors: [{ id: "red", code: "R1", name: "red", hex: "#ef4444", enabled: true }],
          },
        ],
        activeColorGroupId: "default",
        imageColorGroup: null,
        geometry,
        editor: { tool: "brush", selectedColorId: "red", zoom: 1, offsetX: 0, offsetY: 0 },
      },
      null,
      (event) => events.push(event),
    );

    expect(events.length).toBeGreaterThan(3);
    expect(events.at(-1)).toMatchObject({ progress: 100, label: "完成" });
    expect(events.every((event, index) => index === 0 || event.progress >= events[index - 1].progress)).toBe(true);
  });

  it("exports Bambu-style 3MF per layer with one plate and filament color per part", async () => {
    const zip = await buildExportZip({
      version: 1,
      layers: [
        {
          id: "single",
          name: "Single",
          visible: true,
          grid: { width: 3, height: 1, cells: ["red", "green", "blue"] },
          kernelColorGrid: null,
          sourceImage: null,
          imageRotation: 0,
          imageCrop: { cropLeft: 0, cropTop: 0, cropRight: 0, cropBottom: 0 },
          imageTolerance: 8,
        },
      ],
      activeLayerId: "single",
      colorGroups: [
        {
          id: "default",
          name: "default",
          colors: [
            { id: "red", code: "R1", name: "red", hex: "#ef4444", enabled: true },
            { id: "green", code: "G1", name: "green", hex: "#22c55e", enabled: true },
            { id: "blue", code: "B1", name: "blue", hex: "#3b82f6", enabled: true },
          ],
        },
      ],
      activeColorGroupId: "default",
      imageColorGroup: null,
      geometry,
      editor: { tool: "brush", selectedColorId: "red", zoom: 1, offsetX: 0, offsetY: 0 },
    });
    const files = unzipSync(zip);
    const threeMf = unzipSync(files["Single/Single.3mf"]);
    expect(threeMf["[Content_Types].xml"]).toBeTruthy();
    expect(threeMf["_rels/.rels"]).toBeTruthy();
    expect(threeMf["3D/3dmodel.model"]).toBeTruthy();
    expect(threeMf["3D/_rels/3dmodel.model.rels"]).toBeTruthy();
    expect(threeMf["Metadata/model_settings.config"]).toBeTruthy();
    expect(threeMf["Metadata/project_settings.config"]).toBeTruthy();
    expect(threeMf["Metadata/slice_info.config"]).toBeTruthy();
    expect(threeMf["Metadata/cut_information.xml"]).toBeTruthy();
    expect(threeMf["Metadata/thumbnail.png"]).toBeTruthy();
    expect(threeMf["Metadata/thumbnail_small.png"]).toBeTruthy();
    expect(threeMf["Metadata/plate_1.png"]).toBeTruthy();
    expect(threeMf["Metadata/plate_1_small.png"]).toBeTruthy();
    expect(threeMf["Metadata/plate_no_light_1.png"]).toBeTruthy();
    expect(threeMf["Metadata/top_1.png"]).toBeTruthy();
    expect(threeMf["Metadata/pick_1.png"]).toBeTruthy();
    expect(threeMf["3D/Objects/object_1.model"]).toBeTruthy();
    expect(threeMf["3D/Objects/object_3.model"]).toBeTruthy();
    expect(threeMf["3D/Objects/object_4.model"]).toBeTruthy();
    expect(threeMf["3D/Objects/object_5.model"]).toBeFalsy();

    const rels = strFromU8(threeMf["_rels/.rels"]);
    expect(rels).toContain('Target="/Metadata/thumbnail.png"');
    expect(rels).toContain('Target="/Metadata/thumbnail_small.png"');
    const plateThumbnail = await sharp(Buffer.from(threeMf["Metadata/plate_1.png"])).metadata();
    const smallThumbnail = await sharp(Buffer.from(threeMf["Metadata/plate_1_small.png"])).metadata();
    const beadThumbnail = await sharp(Buffer.from(threeMf["Metadata/plate_2.png"])).metadata();
    const coverThumbnail = await sharp(Buffer.from(threeMf["Metadata/thumbnail.png"])).metadata();
    const coverSmallThumbnail = await sharp(Buffer.from(threeMf["Metadata/thumbnail_small.png"])).metadata();
    expect(plateThumbnail).toMatchObject({ format: "png", width: 512, height: 512 });
    expect(smallThumbnail).toMatchObject({ format: "png", width: 128, height: 128 });
    expect(beadThumbnail).toMatchObject({ format: "png", width: 512, height: 512 });
    expect(coverThumbnail).toMatchObject({ format: "png", width: 512, height: 512 });
    expect(coverSmallThumbnail).toMatchObject({ format: "png", width: 128, height: 128 });
    expect(Buffer.compare(Buffer.from(threeMf["Metadata/thumbnail.png"]), Buffer.from(threeMf["Metadata/plate_1.png"]))).not.toBe(0);
    expect(threeMf["Metadata/plate_1.png"].length).toBeGreaterThan(1000);
    expect(threeMf["Metadata/plate_1_small.png"].length).toBeGreaterThan(300);
    expect(threeMf["Metadata/thumbnail.png"].length).toBeGreaterThan(1000);

    const modelSettings = strFromU8(threeMf["Metadata/model_settings.config"]);
    expect((modelSettings.match(/<plate>/g) || [])).toHaveLength(4);
    expect(modelSettings).toContain('key="extruder" value="1"');
    expect(modelSettings).toContain('key="extruder" value="4"');
    expect(modelSettings).toContain('key="plater_name" value="Single"');
    expect(modelSettings).not.toContain('key="plater_name" value="Black lattice"');
    expect(modelSettings).toContain('key="plater_name" value="R1 red"');
    expect(strFromU8(threeMf["Metadata/cut_information.xml"])).toContain('<object id="4">');

    const projectSettings = JSON.parse(strFromU8(threeMf["Metadata/project_settings.config"]));
    expect(Object.keys(projectSettings).length).toBeGreaterThan(400);
    expect(projectSettings.filament_colour).toEqual(["#000000", "#EF4444", "#22C55E", "#3B82F6"]);
    expect(projectSettings.filament_multi_colour).toEqual(projectSettings.filament_colour);
    expect(projectSettings.filament_settings_id).toHaveLength(4);
    expect(projectSettings.filament_settings_id.every((item) => typeof item === "string" && item.length > 0)).toBe(true);
    expect(projectSettings.filament_type).toHaveLength(4);
    expect(projectSettings.filament_type.every((item) => typeof item === "string" && item.length > 0)).toBe(true);
    expect(projectSettings.filament_self_index).toEqual(["1", "2", "3", "4"]);
    expect(projectSettings.single_extruder_multi_material).toBe("1");
    expect(projectSettings.flush_volumes_matrix).toHaveLength(16);

    const manifest = JSON.parse(strFromU8(files["meta_data/manifest.json"]));
    const threeMfFile = manifest.files.find((file) => file.role === "bambu-3mf" && file.layerId === "single");
    expect(threeMfFile.plates).toHaveLength(4);
    expect(threeMfFile.plates[0]).toMatchObject({ role: "lattice", plateId: 1, name: "Single", extruder: 1, sourceStl: "black_lattice.stl", hex: "#000000" });
    expect(threeMfFile.plates[1]).toMatchObject({ role: "bead", plateId: 2, extruder: 2, sourceStl: "bead_R1_EF4444.stl", hex: "#ef4444" });
  });

  it("places each generated 3MF object inside its assigned plate", async () => {
    const cells = Array.from({ length: 24 * 24 }, () => null);
    cells[0] = "red";
    cells[23] = "green";
    cells[24 * 23 + 23] = "blue";
    const zip = await buildExportZip({
      version: 1,
      layers: [
        {
          id: "single",
          name: "Single",
          visible: true,
          grid: { width: 24, height: 24, cells },
          kernelColorGrid: null,
          sourceImage: null,
          imageRotation: 0,
          imageCrop: { cropLeft: 0, cropTop: 0, cropRight: 0, cropBottom: 0 },
          imageTolerance: 8,
          colorGroups: [
            {
              id: "default",
              name: "default",
              colors: [
                { id: "red", code: "R1", name: "red", hex: "#ef4444", enabled: true },
                { id: "green", code: "G1", name: "green", hex: "#22c55e", enabled: true },
                { id: "blue", code: "B1", name: "blue", hex: "#3b82f6", enabled: true },
              ],
            },
          ],
          activeColorGroupId: "default",
          imageColorGroup: null,
          selectedColorId: "red",
        },
      ],
      activeLayerId: "single",
      colorGroups: [],
      geometry,
      editor: { tool: "brush", selectedColorId: "red", zoom: 1, offsetX: 0, offsetY: 0 },
    });

    const files = unzipSync(zip);
    const threeMf = unzipSync(files["Single/Single.3mf"]);
    const rootModel = strFromU8(threeMf["3D/3dmodel.model"]);
    const modelSettings = strFromU8(threeMf["Metadata/model_settings.config"]);
    const buildTransforms = buildItemTransforms(rootModel);
    const assembledTransforms = assembleTransforms(modelSettings);
    const plateSize = 256;
    const epsilon = 1e-3;
    const plateCount = 4;

    for (let plate = 1; plate <= plateCount; plate += 1) {
      const objectId = plate * 2;
      const bounds = vertexBoundsFromModelXml(strFromU8(threeMf[`3D/Objects/object_${plate}.model`]));
      const transform = buildTransforms.get(objectId);
      const assembled = assembledTransforms.get(objectId);
      const { x: centerX, y: centerY } = expectedPlateCenter(plate - 1, plateCount);

      expect(assembled.x).toBeCloseTo(0);
      expect(assembled.y).toBeCloseTo(0);
      expect(assembled.z).toBeCloseTo(transform.z);
      expect(bounds.maxX).toBeGreaterThan(bounds.minX);
      expect(bounds.maxY).toBeGreaterThan(bounds.minY);
      expect(bounds.minZ).toBeCloseTo(0);
      expect(transform.x + bounds.minX).toBeGreaterThanOrEqual(centerX - plateSize / 2 - epsilon);
      expect(transform.x + bounds.maxX).toBeLessThanOrEqual(centerX + plateSize / 2 + epsilon);
      expect(transform.y + bounds.minY).toBeGreaterThanOrEqual(centerY - plateSize / 2 - epsilon);
      expect(transform.y + bounds.maxY).toBeLessThanOrEqual(centerY + plateSize / 2 + epsilon);
      expect(transform.z + bounds.minZ).toBeCloseTo(0);
    }
  });

  it("lays out ten 3MF plates row-first with four columns", async () => {
    const colors = Array.from({ length: 9 }, (_, index) => ({
      id: `c${index + 1}`,
      code: `C${index + 1}`,
      name: `color ${index + 1}`,
      hex: `#${(0x111111 + index * 0x10101).toString(16).padStart(6, "0")}`,
      enabled: true,
    }));
    const zip = await buildExportZip({
      version: 1,
      layers: [
        {
          id: "single",
          name: "Single",
          visible: true,
          grid: { width: 9, height: 1, cells: colors.map((color) => color.id) },
          kernelColorGrid: null,
          sourceImage: null,
          imageRotation: 0,
          imageCrop: { cropLeft: 0, cropTop: 0, cropRight: 0, cropBottom: 0 },
          imageTolerance: 8,
          colorGroups: [{ id: "default", name: "default", colors }],
          activeColorGroupId: "default",
          imageColorGroup: null,
          selectedColorId: "c1",
        },
      ],
      activeLayerId: "single",
      colorGroups: [],
      geometry,
      editor: { tool: "brush", selectedColorId: "c1", zoom: 1, offsetX: 0, offsetY: 0 },
    });
    const files = unzipSync(zip);
    const threeMf = unzipSync(files["Single/Single.3mf"]);
    const buildTransforms = buildItemTransforms(strFromU8(threeMf["3D/3dmodel.model"]));
    const modelSettings = strFromU8(threeMf["Metadata/model_settings.config"]);

    expect((modelSettings.match(/<plate>/g) || [])).toHaveLength(10);
    for (let plate = 1; plate <= 10; plate += 1) {
      const transform = buildTransforms.get(plate * 2);
      const center = expectedPlateCenter(plate - 1, 10);
      expect(transform.x).toBeCloseTo(center.x);
      expect(transform.y).toBeCloseTo(center.y);
    }
  });

  it("normalizes layered projects for export validation", () => {
    const layeredProject = {
      version: 1,
      layers: [
        {
          id: "layer-a",
          name: "Layer A",
          visible: true,
          grid: { width: 1, height: 1, cells: ["red"] },
        },
      ],
      colorGroups: [],
      geometry,
    };
    expect(() => normalizeExportProject(layeredProject)).not.toThrow();
    expect(() => normalizeExportProject({ project: layeredProject })).toThrow(/Invalid project/);
    expect(() => normalizeExportProject(JSON.stringify(layeredProject))).toThrow(/Invalid project/);
    expect(() =>
      normalizeExportProject({
        version: 1,
        layers: [{ id: "bad-layer" }],
        grid: { width: 1, height: 1, cells: ["red"] },
        colorGroups: [],
        geometry,
      }),
    ).toThrow(/Invalid project/);
    expect(() => normalizeExportProject({ version: 1, grid: { width: 1, height: 1, cells: ["red"] }, colorGroups: [], geometry })).toThrow(/Invalid project/);
    expect(() => normalizeExportProject({ version: 1, layers: [] })).toThrow(/Invalid project/);
  });

  it("exports layered ZIP folders and combined stacked OBJ", async () => {
    const zip = await buildExportZip({
      version: 1,
      layers: [
        {
          id: "top",
          name: "Top",
          visible: false,
          grid: { width: 2, height: 1, cells: ["red", null] },
          kernelColorGrid: null,
          sourceImage: null,
          imageRotation: 0,
          imageCrop: { cropLeft: 0, cropTop: 0, cropRight: 0, cropBottom: 0 },
          imageTolerance: 8,
        },
        {
          id: "base",
          name: "Base",
          visible: true,
          grid: { width: 2, height: 1, cells: [null, "blue"] },
          kernelColorGrid: null,
          sourceImage: null,
          imageRotation: 0,
          imageCrop: { cropLeft: 0, cropTop: 0, cropRight: 0, cropBottom: 0 },
          imageTolerance: 8,
        },
      ],
      activeLayerId: "top",
      colorGroups: [
        {
          id: "default",
          name: "default",
          colors: [
            { id: "red", code: "R1", name: "red", hex: "#ef4444", enabled: true },
            { id: "blue", code: "B1", name: "blue", hex: "#3b82f6", enabled: true },
          ],
        },
      ],
      activeColorGroupId: "default",
      imageColorGroup: null,
      geometry,
      editor: { tool: "brush", selectedColorId: "red", zoom: 1, offsetX: 0, offsetY: 0 },
    });
    const files = unzipSync(zip);
    const layerManifests = Object.keys(files).filter((file) => /^(Base|Top)\/\1\.json$/.test(file));
    expect(layerManifests.sort()).toEqual(["Base/Base.json", "Top/Top.json"]);
    expect(Object.keys(files).filter((file) => file.endsWith(".zip"))).toEqual([]);
    expect(files["Top/black_lattice.stl"]).toBeUndefined();
    expect(files["Base/black_lattice.stl"]).toBeUndefined();
    expect(files["Top/Top.png"]).toBeTruthy();
    expect(files["Base/Base.png"]).toBeTruthy();
    expect(files["meta_data/all_layers.obj"]).toBeTruthy();
    expect(files["meta_data/all_layers.mtl"]).toBeTruthy();
    expect(files["bead_pattern.png"]).toBeUndefined();
    expect(files["black_lattice.stl"]).toBeUndefined();
    const manifest = JSON.parse(strFromU8(files["meta_data/manifest.json"]));
    expect(manifest.layers).toHaveLength(2);
    expect(manifest.layers[0]).toMatchObject({ id: "top", visible: false, zOffset: Math.max(geometry.blockHeight, geometry.plateHeight) });
    expect(manifest.layers[1]).toMatchObject({ id: "base", visible: true, zOffset: 0 });
    expect(manifest.colors.map((color) => color.colorId).sort()).toEqual(["blue", "red"]);
    expect(manifest.files.map((file) => file.file)).toContain("Top/Top.png");
    expect(manifest.files.map((file) => file.file)).toContain("Base/Base.png");
    const obj = strFromU8(files["meta_data/all_layers.obj"]);
    expect(obj).toContain("mtllib all_layers.mtl");
    expect(obj).toContain(Math.max(geometry.blockHeight, geometry.plateHeight).toFixed(5));
  });

  it("exports each layer with its own independent palette", async () => {
    const layerPalette = (hex, code) => [
      {
        id: "layer-palette",
        name: "layer palette",
        colors: [{ id: "shared", code, name: code, hex, enabled: true }],
      },
    ];
    const zip = await buildExportZip({
      version: 1,
      layers: [
        {
          id: "top",
          name: "Top",
          visible: true,
          colorGroups: layerPalette("#ef4444", "A1"),
          activeColorGroupId: "layer-palette",
          imageColorGroup: null,
          selectedColorId: "shared",
          grid: { width: 1, height: 1, cells: ["shared"] },
          kernelColorGrid: null,
          sourceImage: null,
          imageRotation: 0,
          imageCrop: { cropLeft: 0, cropTop: 0, cropRight: 0, cropBottom: 0 },
          imageTolerance: 8,
        },
        {
          id: "base",
          name: "Base",
          visible: true,
          colorGroups: layerPalette("#3b82f6", "B1"),
          activeColorGroupId: "layer-palette",
          imageColorGroup: null,
          selectedColorId: "shared",
          grid: { width: 1, height: 1, cells: ["shared"] },
          kernelColorGrid: null,
          sourceImage: null,
          imageRotation: 0,
          imageCrop: { cropLeft: 0, cropTop: 0, cropRight: 0, cropBottom: 0 },
          imageTolerance: 8,
        },
      ],
      activeLayerId: "top",
      colorGroups: layerPalette("#111111", "OLD"),
      activeColorGroupId: "layer-palette",
      imageColorGroup: null,
      geometry,
      editor: { tool: "brush", selectedColorId: "shared", zoom: 1, offsetX: 0, offsetY: 0 },
    });
    const files = unzipSync(zip);
    expect(files["Top/Top.obj"]).toBeTruthy();
    expect(files["Base/Base.obj"]).toBeTruthy();
    expect(files["Top/bead_A1_EF4444.stl"]).toBeUndefined();
    expect(files["Base/bead_B1_3B82F6.stl"]).toBeUndefined();
    const manifest = JSON.parse(strFromU8(files["meta_data/manifest.json"]));
    expect(manifest.colors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ layerId: "top", code: "A1", hex: "#ef4444", count: 1 }),
        expect.objectContaining({ layerId: "base", code: "B1", hex: "#3b82f6", count: 1 }),
      ]),
    );
    const mtl = strFromU8(files["meta_data/all_layers.mtl"]);
    expect(mtl).toContain("newmtl bead_top_A1_EF4444");
    expect(mtl).toContain("newmtl bead_base_B1_3B82F6");
  });

  it("uses unique layer-name folders when layer names repeat", async () => {
    const repeatedLayers = [
      {
        id: "first",
        name: "Same",
        visible: true,
        grid: { width: 1, height: 1, cells: ["red"] },
        kernelColorGrid: null,
        sourceImage: null,
        imageRotation: 0,
        imageCrop: { cropLeft: 0, cropTop: 0, cropRight: 0, cropBottom: 0 },
        imageTolerance: 8,
      },
      {
        id: "second",
        name: "Same",
        visible: true,
        grid: { width: 1, height: 1, cells: ["red"] },
        kernelColorGrid: null,
        sourceImage: null,
        imageRotation: 0,
        imageCrop: { cropLeft: 0, cropTop: 0, cropRight: 0, cropBottom: 0 },
        imageTolerance: 8,
      },
    ];
    const zip = await buildExportZip({
      version: 1,
      layers: repeatedLayers,
      activeLayerId: "first",
      colorGroups: [
        {
          id: "default",
          name: "default",
          colors: [{ id: "red", code: "R1", name: "red", hex: "#ef4444", enabled: true }],
        },
      ],
      activeColorGroupId: "default",
      imageColorGroup: null,
      geometry,
      editor: { tool: "brush", selectedColorId: "red", zoom: 1, offsetX: 0, offsetY: 0 },
    });
    const files = unzipSync(zip);
    const layerManifests = Object.keys(files).filter((file) => /^Same(_2)?\/Same(_2)?\.json$/.test(file));
    expect(layerManifests.sort()).toEqual(["Same/Same.json", "Same_2/Same_2.json"]);
    expect(files["Same/Same.png"]).toBeTruthy();
    expect(files["Same_2/Same_2.png"]).toBeTruthy();
    const restoredProject = JSON.parse(strFromU8(files["meta_data/project.pixel-stl.json"]));
    expect(restoredProject.layers.map((layer) => layer.name)).toEqual(["Same", "Same_2"]);
  });

  it("applies crop and alpha connected-component tolerance before rasterizing", async () => {
    const raw = Buffer.alloc(5 * 4 * 4);
    const paint = (x, y, r, g, b, a = 255) => {
      const offset = (y * 5 + x) * 4;
      raw[offset] = r;
      raw[offset + 1] = g;
      raw[offset + 2] = b;
      raw[offset + 3] = a;
    };
    paint(1, 1, 240, 40, 40);
    paint(2, 1, 240, 40, 40);
    paint(1, 2, 240, 40, 40);
    paint(2, 2, 240, 40, 40);
    paint(4, 3, 40, 40, 240);

    const png = await sharp(raw, { raw: { width: 5, height: 4, channels: 4 } }).png().toBuffer();
    const grid = await rasterizeImage({
      sourceImage: { name: "components.png", dataUrl: `data:image/png;base64,${png.toString("base64")}` },
      colors: [
        { id: "red", name: "red", hex: "#ef4444", enabled: true },
        { id: "blue", name: "blue", hex: "#2563eb", enabled: true },
      ],
      geometry: { ...geometry, maxGridSize: 8, componentTolerance: 2 },
    });

    expect(grid.width).toBe(8);
    expect(grid.height).toBe(8);
    expect(grid.kernelColorGrid.width).toBe(8);
    expect(grid.kernelColorGrid.height).toBe(8);
    expect(grid.kernelColorGrid.cells.some((cell) => typeof cell === "string" && cell.startsWith("#"))).toBe(true);
    expect(grid.cells).toContain("red");
    expect(grid.cells).not.toContain("blue");
  });

  it("creates short pattern labels grouped by color class", () => {
    const labels = colorLabels([
      { id: "white", code: "S01", name: "White", hex: "#f5f3ea" },
      { id: "black", code: "S18", name: "Black", hex: "#121212" },
      { id: "yellow", code: "S05", name: "Yellow", hex: "#efd34d" },
      { id: "orange", code: "S07", name: "Orange", hex: "#ef9c33" },
      { id: "blue", code: "S48", name: "Blue", hex: "#3264aa" },
    ]);

    expect(labels.get("white")).toMatch(/^N\d+$/);
    expect(labels.get("black")).toMatch(/^N\d+$/);
    expect(labels.get("yellow")).toMatch(/^[A-Z]\d+$/);
    expect(labels.get("yellow")).not.toBe("S05");
    expect(labels.get("blue")).not.toBe(labels.get("yellow"));
  });

  it("builds UTF-8 pattern SVG with bottom legend and 5-cell guide lines", () => {
    const { svg } = buildPatternSvg(
      {
        grid: {
          width: 6,
          height: 6,
          cells: Array.from({ length: 36 }, (_, index) => (index % 2 === 0 ? "yellow" : "blue")),
        },
      },
      [
        { id: "yellow", code: "D1", name: "Yellow", hex: "#efd34d" },
        { id: "blue", code: "D2", name: "Blue", hex: "#3264aa" },
      ],
      { title: "图层D", colorGroupName: "MARD 72色" },
    );
    expect(svg.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(svg).toContain("Noto Sans SC");
    expect(svg.indexOf("Noto Sans SC")).toBeLessThan(svg.indexOf("Noto Sans CJK SC"));
    expect(svg).toContain("Color Key");
    expect(svg).toContain("Color Key / MARD 72色");
    expect(svg).toContain("legend-item");
    expect(svg).toContain("(");
    expect(svg).toContain(")");
    expect(svg).toContain('text-anchor="middle"');
    expect(svg).toContain('font-size="24"');
    expect(svg).not.toContain("Legend / Usage");
    expect(svg).not.toContain(" = (");
    expect(svg).toContain('stroke-width="2"');
    expect(svg.indexOf("Color Key")).toBeGreaterThan(svg.indexOf('y="6"'));
    expect(svg).toContain("图层D");
  });

  it("builds bead pattern SVG with total bead count and code-count-hex legend format", () => {
    const { svg } = buildPatternSvg(
      {
        grid: {
          width: 6,
          height: 6,
          cells: Array.from({ length: 36 }, () => "skin"),
        },
      },
      [{ id: "skin", code: "A23", name: "Skin", hex: "#e6c9b7" }],
      { title: "图层A", colorGroupName: "MARD 221色", variant: "bead" },
    );
    expect(svg).toContain("Bead Key / MARD 221色 / 总共 36 粒");
    expect(svg).toContain("A23 x 36 (#E6C9B7)");
    expect(svg).not.toContain("A23 #E6C9B7 x36");
    expect(svg).not.toContain("Color Key / MARD 221色");
  });

  it("builds hammer pattern SVG without axes, empty grid cells, or hex legend values", () => {
    const { svg } = buildPatternSvg(
      {
        grid: {
          width: 5,
          height: 5,
          cells: [
            null,
            null,
            null,
            null,
            null,
            null,
            "skin",
            null,
            "gray",
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            "skin",
            null,
            null,
            null,
            null,
            null,
            null,
            null,
          ],
        },
      },
      [
        { id: "skin", code: "A23", name: "Skin", hex: "#e6c9b7" },
        { id: "gray", code: "D4", name: "Gray", hex: "#888888" },
      ],
      { title: "图层A", colorGroupName: "MARD 221色", variant: "hammer" },
    );
    expect(svg).toContain("A23 x 2");
    expect(svg).toContain("D4 x 1");
    expect(svg).not.toContain("A23 x 2 (#E6C9B7)");
    expect(svg).not.toContain("#E6C9B7");
    expect(svg).not.toContain('y="-12"');
    expect(svg).not.toContain('stroke-width="2"');
    expect((svg.match(/width="26" height="26" fill="/g) ?? []).length).toBe(3);
  });

  it("groups pattern legend entries by generated label prefix", () => {
    const colors = [
      { id: "white", code: "D1", name: "White", hex: "#ededee" },
      { id: "black", code: "D2", name: "Black", hex: "#0e0d0c" },
      { id: "red", code: "D10", name: "Red", hex: "#93443f" },
      { id: "green", code: "D3", name: "Green", hex: "#5d6d3c" },
    ];
    const labels = colorLabels(colors);
    const groups = groupedLegendItems(colors, labels, new Map(colors.map((color, index) => [color.id, index + 1])));
    expect(groups.map((group) => group.prefix)).toEqual(expect.arrayContaining(["N", "A", "B"]));
    for (const group of groups) {
      expect(group.items.every((item) => item.label.startsWith(group.prefix))).toBe(true);
    }
  });

  it("omits duplicate legend names when code and name are identical", () => {
    expect(legendName({ code: "D1", name: "D1" })).toBe("");
    expect(legendName({ code: "S05", name: "Yellow" })).toBe(" Yellow");
  });

  it("can rasterize processed image into an explicit target grid", async () => {
    const raw = Buffer.alloc(4 * 2 * 4);
    for (let index = 0; index < 4 * 2; index += 1) {
      raw[index * 4] = 240;
      raw[index * 4 + 1] = 40;
      raw[index * 4 + 2] = 40;
      raw[index * 4 + 3] = 255;
    }
    const png = await sharp(raw, { raw: { width: 4, height: 2, channels: 4 } }).png().toBuffer();
    const grid = await rasterizeImage({
      sourceImage: { name: "target.png", dataUrl: `data:image/png;base64,${png.toString("base64")}` },
      colors: [{ id: "red", name: "red", hex: "#ef4444", enabled: true }],
      geometry: { ...geometry, targetGrid: { width: 9, height: 7 } },
    });

    expect(grid.width).toBe(9);
    expect(grid.height).toBe(7);
    expect(grid.cells.every((cell) => cell === "red")).toBe(true);
  });

  it("uses each target cell dominant color instead of resized blended pixels", async () => {
    const cellSize = 12;
    const width = cellSize * 3;
    const height = cellSize * 2;
    const raw = Buffer.alloc(width * height * 4);
    const fillCell = (cellX, cellY, rgb) => {
      for (let y = cellY * cellSize; y < (cellY + 1) * cellSize; y += 1) {
        for (let x = cellX * cellSize; x < (cellX + 1) * cellSize; x += 1) {
          const offset = (y * width + x) * 4;
          raw[offset] = rgb[0];
          raw[offset + 1] = rgb[1];
          raw[offset + 2] = rgb[2];
          raw[offset + 3] = 255;
        }
      }
    };
    const paint = (x, y, rgb) => {
      const offset = (y * width + x) * 4;
      raw[offset] = rgb[0];
      raw[offset + 1] = rgb[1];
      raw[offset + 2] = rgb[2];
      raw[offset + 3] = 255;
    };

    fillCell(0, 0, [245, 198, 30]);
    fillCell(1, 0, [245, 198, 30]);
    fillCell(2, 0, [30, 30, 30]);
    fillCell(0, 1, [245, 198, 30]);
    fillCell(1, 1, [245, 110, 155]);
    fillCell(2, 1, [255, 255, 255]);

    for (let x = cellSize + 2; x < cellSize * 2 - 2; x += 1) paint(x, 5, [15, 15, 15]);
    for (let y = 2; y < cellSize - 2; y += 1) paint(cellSize + 5, y, [15, 15, 15]);

    const png = await sharp(raw, { raw: { width, height, channels: 4 } }).png().toBuffer();
    const sourceImage = { name: "dominant-cells.png", dataUrl: `data:image/png;base64,${png.toString("base64")}` };
    const colors = [
      { id: "yellow", name: "yellow", hex: "#f5c61e", enabled: true },
      { id: "black", name: "black", hex: "#111111", enabled: true },
      { id: "pink", name: "pink", hex: "#f56e9b", enabled: true },
      { id: "white", name: "white", hex: "#ffffff", enabled: true },
    ];

    const grid = await rasterizeImage({
      sourceImage,
      colors,
      geometry: { ...geometry, targetGrid: { width: 3, height: 2 } },
    });
    const analysis = await analyzeImageColors({
      sourceImage,
      geometry: { ...geometry, targetGrid: { width: 3, height: 2 } },
      colorCount: 4,
    });

    expect(grid.cells).toEqual(["yellow", "yellow", "black", "yellow", "pink", "white"]);
    expect(analysis.colors).toHaveLength(4);
    expect(analysis.colors.some((hex) => nearestBeadColor(hexToRgb(hex), colors).id === "black")).toBe(true);
    expect(analysis.colors.some((hex) => nearestBeadColor(hexToRgb(hex), colors).id === "pink")).toBe(true);
  });

  it("merges similar cell colors to the requested palette size", async () => {
    const cellSize = 8;
    const width = cellSize * 4;
    const height = cellSize * 2;
    const raw = Buffer.alloc(width * height * 4);
    const samplePixels = [
      [248, 228, 105],
      [246, 225, 116],
      [248, 228, 105],
      [246, 225, 116],
      [245, 242, 236],
      [255, 248, 244],
      [20, 20, 20],
      [235, 108, 86],
    ];
    samplePixels.forEach((rgb, index) => {
      const cellX = index % 4;
      const cellY = Math.floor(index / 4);
      for (let y = cellY * cellSize; y < (cellY + 1) * cellSize; y += 1) {
        for (let x = cellX * cellSize; x < (cellX + 1) * cellSize; x += 1) {
          const offset = (y * width + x) * 4;
          raw[offset] = rgb[0];
          raw[offset + 1] = rgb[1];
          raw[offset + 2] = rgb[2];
          raw[offset + 3] = 255;
        }
      }
    });
    const png = await sharp(raw, { raw: { width, height, channels: 4 } }).png().toBuffer();
    const sourceImage = { name: "palette-merge.png", dataUrl: `data:image/png;base64,${png.toString("base64")}` };
    const beadColors = [
      { id: "yellow", name: "yellow", hex: "#f8e469", enabled: true },
      { id: "white", name: "white", hex: "#fbf4f2", enabled: true },
      { id: "black", name: "black", hex: "#111111", enabled: true },
      { id: "red", name: "red", hex: "#eb6c56", enabled: true },
    ];

    const analysis = await analyzeImageColors({
      sourceImage,
      geometry: { ...geometry, targetGrid: { width: 4, height: 2 } },
      colorCount: 4,
    });
    const matchedIds = analysis.colors.map((hex) => nearestBeadColor(hexToRgb(hex), beadColors).id);

    expect(analysis.colors).toHaveLength(4);
    expect(new Set(matchedIds)).toEqual(new Set(["yellow", "white", "black", "red"]));
  });

  it("keeps distinguishable 24x24 cell colors when enough palette slots are requested", async () => {
    const cellSize = 10;
    const gridWidth = 24;
    const gridHeight = 24;
    const width = cellSize * gridWidth;
    const height = cellSize * gridHeight;
    const raw = Buffer.alloc(width * height * 4);
    const fillCell = (cellX, cellY, rgb) => {
      for (let y = cellY * cellSize; y < (cellY + 1) * cellSize; y += 1) {
        for (let x = cellX * cellSize; x < (cellX + 1) * cellSize; x += 1) {
          const offset = (y * width + x) * 4;
          raw[offset] = rgb[0];
          raw[offset + 1] = rgb[1];
          raw[offset + 2] = rgb[2];
          raw[offset + 3] = 255;
        }
      }
    };
    const paintLine = (cellX, cellY) => {
      const y = cellY * cellSize + 2;
      for (let x = cellX * cellSize + 2; x < (cellX + 1) * cellSize - 2; x += 1) {
        const offset = (y * width + x) * 4;
        raw[offset] = 18;
        raw[offset + 1] = 18;
        raw[offset + 2] = 18;
        raw[offset + 3] = 255;
      }
    };
    for (let y = 0; y < gridHeight; y += 1) {
      for (let x = 0; x < gridWidth; x += 1) {
        if (x < 8) fillCell(x, y, [248, 228, 105]);
        else if (x < 16) fillCell(x, y, [243, 195, 92]);
        else fillCell(x, y, [242, 172, 177]);
        if ((x + y) % 3 === 0) paintLine(x, y);
      }
    }
    const png = await sharp(raw, { raw: { width, height, channels: 4 } }).png().toBuffer();
    const sourceImage = { name: "grid-24-colors.png", dataUrl: `data:image/png;base64,${png.toString("base64")}` };
    const colors = [
      { id: "yellow", name: "yellow", hex: "#f8e469", enabled: true },
      { id: "orange", name: "orange", hex: "#f3c35c", enabled: true },
      { id: "pink", name: "pink", hex: "#f2acb1", enabled: true },
    ];

    const analysis = await analyzeImageColors({
      sourceImage,
      geometry: { ...geometry, targetGrid: { width: gridWidth, height: gridHeight } },
      colorCount: 6,
    });
    const matchedIds = new Set(analysis.colors.map((hex) => nearestBeadColor(hexToRgb(hex), colors).id));

    expect(matchedIds).toEqual(new Set(["yellow", "orange", "pink"]));
  });

  it("uses the largest color vote inside a target kernel", async () => {
    const width = 10;
    const height = 10;
    const raw = Buffer.alloc(width * height * 4);
    const paint = (x, y, rgb) => {
      const offset = (y * width + x) * 4;
      raw[offset] = rgb[0];
      raw[offset + 1] = rgb[1];
      raw[offset + 2] = rgb[2];
      raw[offset + 3] = 255;
    };
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) paint(x, y, [14, 14, 14]);
    }
    for (let y = 0; y < 3; y += 1) {
      for (let x = 0; x < width; x += 1) paint(x, y, [250, 250, 250]);
    }
    for (let x = 0; x < 5; x += 1) paint(x, 3, [250, 250, 250]);

    const png = await sharp(raw, { raw: { width, height, channels: 4 } }).png().toBuffer();
    const grid = await rasterizeImage({
      sourceImage: { name: "largest-kernel-cluster.png", dataUrl: `data:image/png;base64,${png.toString("base64")}` },
      colors: [
        { id: "black", name: "black", hex: "#111111", enabled: true },
        { id: "white", name: "white", hex: "#ffffff", enabled: true },
      ],
      geometry: { ...geometry, imageTolerance: 8, targetGrid: { width: 1, height: 1 } },
    });

    expect(grid.cells).toEqual(["black"]);
  });

  it("groups similar pixel votes before choosing the target kernel color", async () => {
    const width = 10;
    const height = 10;
    const raw = Buffer.alloc(width * height * 4);
    const pinks = [
      [250, 157, 178],
      [238, 145, 170],
      [247, 173, 190],
      [229, 137, 164],
    ];
    const paint = (x, y, rgb) => {
      const offset = (y * width + x) * 4;
      raw[offset] = rgb[0];
      raw[offset + 1] = rgb[1];
      raw[offset + 2] = rgb[2];
      raw[offset + 3] = 255;
    };
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const variant = (x % 2) + (y % 2) * 2;
        paint(x, y, pinks[variant]);
      }
    }
    for (let y = 2; y < 5; y += 1) {
      for (let x = 1; x < 9; x += 1) paint(x, y, [16, 16, 16]);
    }

    const png = await sharp(raw, { raw: { width, height, channels: 4 } }).png().toBuffer();
    const sourceImage = { name: "kernel-vote-before-cluster.png", dataUrl: `data:image/png;base64,${png.toString("base64")}` };
    const colors = [
      { id: "pink", name: "pink", hex: "#f3a0b6", enabled: true },
      { id: "black", name: "black", hex: "#111111", enabled: true },
    ];

    const grid = await rasterizeImage({
      sourceImage,
      colors,
      geometry: { ...geometry, imageTolerance: 2, targetGrid: { width: 1, height: 1 } },
    });
    const analysis = await analyzeImageColors({
      sourceImage,
      geometry: { ...geometry, imageTolerance: 2, targetGrid: { width: 1, height: 1 } },
      colorCount: 2,
    });

    expect(grid.cells).toEqual(["pink"]);
    expect(analysis.colors.length).toBeLessThanOrEqual(2);
  });

  it("keeps large yellow and orange regions separate before merging small artifacts", async () => {
    const cellSize = 10;
    const gridWidth = 8;
    const gridHeight = 4;
    const width = cellSize * gridWidth;
    const height = cellSize * gridHeight;
    const raw = Buffer.alloc(width * height * 4);
    const fillCell = (cellX, cellY, rgb) => {
      for (let y = cellY * cellSize; y < (cellY + 1) * cellSize; y += 1) {
        for (let x = cellX * cellSize; x < (cellX + 1) * cellSize; x += 1) {
          const offset = (y * width + x) * 4;
          raw[offset] = rgb[0];
          raw[offset + 1] = rgb[1];
          raw[offset + 2] = rgb[2];
          raw[offset + 3] = 255;
        }
      }
    };
    const paint = (x, y, rgb) => {
      const offset = (y * width + x) * 4;
      raw[offset] = rgb[0];
      raw[offset + 1] = rgb[1];
      raw[offset + 2] = rgb[2];
      raw[offset + 3] = 255;
    };

    for (let y = 0; y < gridHeight; y += 1) {
      for (let x = 0; x < gridWidth; x += 1) {
        fillCell(x, y, x < 4 ? [248, 228, 105] : [243, 195, 92]);
        for (let px = x * cellSize + 2; px < (x + 1) * cellSize - 2; px += 1) paint(px, y * cellSize + 3, [18, 18, 18]);
        if ((x + y) % 2 === 0) {
          for (let px = x * cellSize + 1; px < (x + 1) * cellSize - 1; px += 1) paint(px, y * cellSize + 7, [190, 190, 190]);
        }
      }
    }

    const png = await sharp(raw, { raw: { width, height, channels: 4 } }).png().toBuffer();
    const sourceImage = { name: "yellow-orange-artifacts.png", dataUrl: `data:image/png;base64,${png.toString("base64")}` };
    const colors = [
      { id: "yellow", name: "yellow", hex: "#f8e469", enabled: true },
      { id: "orange", name: "orange", hex: "#f3c35c", enabled: true },
      { id: "black", name: "black", hex: "#111111", enabled: true },
      { id: "gray", name: "gray", hex: "#bdbdbd", enabled: true },
    ];

    const analysis = await analyzeImageColors({
      sourceImage,
      geometry: { ...geometry, imageTolerance: 5, targetGrid: { width: gridWidth, height: gridHeight } },
      colorCount: 4,
    });
    const grid = await rasterizeImage({
      sourceImage,
      colors: analysis.colors.map((hex, index) => ({ id: `color-${index}`, name: hex, hex, enabled: true })),
      geometry: { ...geometry, imageTolerance: 5, targetGrid: { width: gridWidth, height: gridHeight } },
    });
    const matchedIds = new Set(analysis.colors.map((hex) => nearestBeadColor(hexToRgb(hex), colors).id));
    const resolvedGridIds = new Set(
      grid.cells
        .filter(Boolean)
        .map((cell) => analysis.colors[Number(String(cell).replace("color-", ""))])
        .map((hex) => nearestBeadColor(hexToRgb(hex), colors).id),
    );

    expect(matchedIds).toEqual(new Set(["yellow", "orange", "black", "gray"]));
    expect(resolvedGridIds.has("yellow")).toBe(true);
    expect(resolvedGridIds.has("orange")).toBe(true);
  });

  it("uses image tolerance to cluster colors inside each target kernel", async () => {
    const width = 8;
    const height = 8;
    const raw = Buffer.alloc(width * height * 4);
    const paint = (x, y, rgb) => {
      const offset = (y * width + x) * 4;
      raw[offset] = rgb[0];
      raw[offset + 1] = rgb[1];
      raw[offset + 2] = rgb[2];
      raw[offset + 3] = 255;
    };
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) paint(x, y, [248, 228, 105]);
    }
    for (let y = 0; y < 3; y += 1) {
      for (let x = 0; x < width; x += 1) paint(x, y, [240, 208, 88]);
    }
    for (let x = 1; x < width - 1; x += 1) paint(x, 4, [12, 12, 12]);

    const png = await sharp(raw, { raw: { width, height, channels: 4 } }).png().toBuffer();
    const sourceImage = { name: "kernel-tolerance.png", dataUrl: `data:image/png;base64,${png.toString("base64")}` };
    const colors = [
      { id: "light-yellow", name: "light", hex: "#f8e469", enabled: true },
      { id: "orange-yellow", name: "orange", hex: "#f0d058", enabled: true },
    ];

    const strictGrid = await rasterizeImage({
      sourceImage,
      colors,
      geometry: { ...geometry, imageTolerance: 2, targetGrid: { width: 1, height: 1 } },
    });
    const looseGrid = await rasterizeImage({
      sourceImage,
      colors,
      geometry: { ...geometry, imageTolerance: 35, targetGrid: { width: 1, height: 1 } },
    });

    expect(strictGrid.cells).toEqual(["light-yellow"]);
    expect(looseGrid.cells).toEqual(["light-yellow"]);
  });

  it("can rasterize a target kernel by mean sampling before palette matching", async () => {
    const width = 4;
    const height = 4;
    const raw = Buffer.alloc(width * height * 4);
    const paint = (x, y, rgb) => {
      const offset = (y * width + x) * 4;
      raw[offset] = rgb[0];
      raw[offset + 1] = rgb[1];
      raw[offset + 2] = rgb[2];
      raw[offset + 3] = 255;
    };
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) paint(x, y, x < 2 ? [255, 0, 0] : [0, 0, 255]);
    }

    const png = await sharp(raw, { raw: { width, height, channels: 4 } }).png().toBuffer();
    const grid = await rasterizeImage({
      sourceImage: { name: "mean-sample-purple.png", dataUrl: `data:image/png;base64,${png.toString("base64")}` },
      colors: [
        { id: "red", name: "red", hex: "#ff0000", enabled: true },
        { id: "blue", name: "blue", hex: "#0000ff", enabled: true },
        { id: "purple", name: "purple", hex: "#800080", enabled: true },
      ],
      geometry: { ...geometry, targetGrid: { width: 1, height: 1 } },
      algorithm: "mean-sample",
    });

    expect(grid.cells).toEqual(["purple"]);
    expect(grid.kernelColorGrid.cells).toEqual(["#800080"]);
  });

  it("ignores transparent pixels and leaves fully transparent mean-sample cells empty", async () => {
    const width = 6;
    const height = 2;
    const raw = Buffer.alloc(width * height * 4);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < 2; x += 1) {
        const offset = (y * width + x) * 4;
        raw[offset] = 0;
        raw[offset + 1] = 255;
        raw[offset + 2] = 0;
        raw[offset + 3] = 255;
      }
      for (let x = 4; x < 6; x += 1) {
        const offset = (y * width + x) * 4;
        raw[offset] = 0;
        raw[offset + 1] = 255;
        raw[offset + 2] = 0;
        raw[offset + 3] = 255;
      }
    }
    const png = await sharp(raw, { raw: { width, height, channels: 4 } }).png().toBuffer();
    const grid = await rasterizeImage({
      sourceImage: { name: "mean-sample-transparent.png", dataUrl: `data:image/png;base64,${png.toString("base64")}` },
      colors: [{ id: "green", name: "green", hex: "#00ff00", enabled: true }],
      geometry: { ...geometry, componentTolerance: 0, targetGrid: { width: 3, height: 1 } },
      algorithm: "mean-sample",
    });

    expect(grid.cells).toEqual(["green", null, "green"]);
    expect(grid.kernelColorGrid.cells).toEqual(["#00ff00", null, "#00ff00"]);
  });

  it("analyzes colors from mean-sampled target cells when requested", async () => {
    const width = 6;
    const height = 2;
    const raw = Buffer.alloc(width * height * 4);
    const fill = (x0, x1, rgb) => {
      for (let y = 0; y < height; y += 1) {
        for (let x = x0; x < x1; x += 1) {
          const offset = (y * width + x) * 4;
          raw[offset] = rgb[0];
          raw[offset + 1] = rgb[1];
          raw[offset + 2] = rgb[2];
          raw[offset + 3] = 255;
        }
      }
    };
    fill(0, 2, [240, 20, 20]);
    fill(2, 4, [20, 240, 20]);
    fill(4, 6, [20, 20, 240]);
    const png = await sharp(raw, { raw: { width, height, channels: 4 } }).png().toBuffer();
    const analysis = await analyzeImageColors({
      sourceImage: { name: "mean-sample-analysis.png", dataUrl: `data:image/png;base64,${png.toString("base64")}` },
      geometry: { ...geometry, targetGrid: { width: 3, height: 1 } },
      colorCount: 3,
      algorithm: "mean-sample",
    });

    expect(new Set(analysis.colors)).toEqual(new Set(["#f01414", "#14f014", "#1414f0"]));
  });

  it("supports median sampling for outlier-resistant cell colors", async () => {
    const width = 3;
    const height = 3;
    const raw = Buffer.alloc(width * height * 4);
    for (let index = 0; index < width * height; index += 1) {
      raw[index * 4] = index === 4 ? 255 : 0;
      raw[index * 4 + 1] = 0;
      raw[index * 4 + 2] = index === 4 ? 255 : 0;
      raw[index * 4 + 3] = 255;
    }
    const png = await sharp(raw, { raw: { width, height, channels: 4 } }).png().toBuffer();
    const grid = await rasterizeImage({
      sourceImage: { name: "median-outlier.png", dataUrl: `data:image/png;base64,${png.toString("base64")}` },
      colors: [
        { id: "black", name: "black", hex: "#000000", enabled: true },
        { id: "magenta", name: "magenta", hex: "#ff00ff", enabled: true },
      ],
      geometry: { ...geometry, targetGrid: { width: 1, height: 1 } },
      algorithm: "median-sample",
    });

    expect(grid.cells).toEqual(["black"]);
    expect(grid.kernelColorGrid.cells).toEqual(["#000000"]);
  });

  it("supports center-weighted sampling that favors center pixels", async () => {
    const width = 5;
    const height = 5;
    const raw = Buffer.alloc(width * height * 4);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const offset = (y * width + x) * 4;
        const center = x === 2 && y === 2;
        raw[offset] = center ? 255 : 0;
        raw[offset + 1] = 0;
        raw[offset + 2] = center ? 0 : 255;
        raw[offset + 3] = 255;
      }
    }
    const png = await sharp(raw, { raw: { width, height, channels: 4 } }).png().toBuffer();
    const grid = await rasterizeImage({
      sourceImage: { name: "center-weighted.png", dataUrl: `data:image/png;base64,${png.toString("base64")}` },
      colors: [
        { id: "blue", name: "blue", hex: "#0000ff", enabled: true },
        { id: "purple", name: "purple", hex: "#4d00b2", enabled: true },
      ],
      geometry: { ...geometry, targetGrid: { width: 1, height: 1 } },
      algorithm: "center-weighted",
    });

    expect(grid.cells).toEqual(["purple"]);
  });

  it("supports edge-preserve sampling that weights line detail", async () => {
    const width = 5;
    const height = 5;
    const raw = Buffer.alloc(width * height * 4);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const offset = (y * width + x) * 4;
        const edge = x === 0 || x === 4 || y === 0 || y === 4;
        raw[offset] = edge ? 0 : 255;
        raw[offset + 1] = edge ? 0 : 255;
        raw[offset + 2] = edge ? 0 : 255;
        raw[offset + 3] = 255;
      }
    }
    const png = await sharp(raw, { raw: { width, height, channels: 4 } }).png().toBuffer();
    const grid = await rasterizeImage({
      sourceImage: { name: "edge-line.png", dataUrl: `data:image/png;base64,${png.toString("base64")}` },
      colors: [
        { id: "white", name: "white", hex: "#ffffff", enabled: true },
        { id: "gray", name: "gray", hex: "#bbbbbb", enabled: true },
      ],
      geometry: { ...geometry, targetGrid: { width: 1, height: 1 } },
      algorithm: "edge-preserve",
    });

    expect(grid.cells).toEqual(["gray"]);
  });

  it("supports global clustering for analysis and rasterization", async () => {
    const width = 6;
    const height = 2;
    const raw = Buffer.alloc(width * height * 4);
    const fill = (x0, x1, rgb) => {
      for (let y = 0; y < height; y += 1) {
        for (let x = x0; x < x1; x += 1) {
          const offset = (y * width + x) * 4;
          raw[offset] = rgb[0];
          raw[offset + 1] = rgb[1];
          raw[offset + 2] = rgb[2];
          raw[offset + 3] = 255;
        }
      }
    };
    fill(0, 2, [240, 30, 30]);
    fill(2, 4, [30, 240, 30]);
    fill(4, 6, [30, 30, 240]);
    const png = await sharp(raw, { raw: { width, height, channels: 4 } }).png().toBuffer();
    const sourceImage = { name: "global-cluster.png", dataUrl: `data:image/png;base64,${png.toString("base64")}` };
    const analysis = await analyzeImageColors({
      sourceImage,
      geometry: { ...geometry, targetGrid: { width: 3, height: 1 } },
      colorCount: 2,
      algorithm: "global-cluster",
    });
    const grid = await rasterizeImage({
      sourceImage,
      colors: [
        { id: "red", name: "red", hex: "#f01e1e", enabled: true },
        { id: "green", name: "green", hex: "#1ef01e", enabled: true },
        { id: "blue", name: "blue", hex: "#1e1ef0", enabled: true },
      ],
      geometry: { ...geometry, targetGrid: { width: 3, height: 1 } },
      algorithm: "global-cluster",
    });

    expect(analysis.colors).toHaveLength(2);
    expect(grid.cells.filter(Boolean).length).toBe(3);
  });
});

