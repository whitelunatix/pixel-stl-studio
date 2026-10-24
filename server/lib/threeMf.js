const fs = require("fs");
const path = require("path");
const { strFromU8, strToU8, unzipSync, zipSync } = require("fflate");
const sharp = require("sharp");
const { countByColor } = require("./pattern");
const { generateColorStl, generateLatticeStl } = require("./stl");
const { normalizeHex } = require("./color");

const CORE_NS = "http://schemas.microsoft.com/3dmanufacturing/core/2015/02";
const PRODUCTION_NS = "http://schemas.microsoft.com/3dmanufacturing/production/2015/06";
const BAMBU_NS = "http://schemas.bambulab.com/package/2021";
const REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships";
const PLATE_SIZE = 256;
const PLATE_SPACING = PLATE_SIZE * 1.2;
const THUMBNAIL_SIZE = 512;
const SMALL_THUMBNAIL_SIZE = 128;
let referenceProjectSettings = null;

function xml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function fixed(value) {
  return Number(value || 0).toFixed(6).replace(/\.?0+$/, "") || "0";
}

function deterministicUuid(index, prefix = "00000000") {
  return `${prefix.slice(0, 8)}-${String(index).padStart(4, "0")}-4c03-9d28-80fed5dfa1dc`;
}

function upperHex(hex) {
  return normalizeHex(hex).toUpperCase();
}

function svg(value) {
  return xml(value);
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function findReferenceThreeMf() {
  const roots = [
    process.cwd(),
    path.resolve(__dirname, "../.."),
    path.join(process.cwd(), "testdata"),
    path.resolve(__dirname, "../../testdata"),
  ];
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    const exact = path.join(root, "立方体.3mf");
    if (fs.existsSync(exact)) return exact;
    const match = fs.readdirSync(root).find((name) => name.toLowerCase().endsWith(".3mf"));
    if (match) return path.join(root, match);
  }
  return null;
}

function loadReferenceProjectSettings() {
  if (referenceProjectSettings) return cloneJson(referenceProjectSettings);
  const file = findReferenceThreeMf();
  if (file) {
    const files = unzipSync(new Uint8Array(fs.readFileSync(file)));
    const settings = files["Metadata/project_settings.config"];
    if (settings) {
      referenceProjectSettings = JSON.parse(strFromU8(settings));
      return cloneJson(referenceProjectSettings);
    }
  }
  referenceProjectSettings = {
    from: "project",
    name: "project_settings",
    version: "02.02.01.60",
    printer_model: "Bambu Lab A1",
    printer_settings_id: "Bambu Lab A1 0.4 nozzle",
    print_compatible_printers: ["Bambu Lab A1 0.4 nozzle"],
    print_settings_id: "0.20mm Standard @BBL A1",
    nozzle_diameter: ["0.4"],
    printer_variant: "0.4",
    printer_technology: "FFF",
    printer_structure: "i3",
    printable_area: ["0x0", "256x0", "256x256", "0x256"],
    printable_height: "256",
    filament_colour: ["#FFFFFF", "#FFFF00", "#FF0000"],
    filament_multi_colour: ["#FFFFFF", "#FFFF00", "#FF0000"],
    filament_colour_type: ["1", "1", "1"],
    filament_settings_id: ["Generic PLA @BBL A1", "Generic PLA @BBL A1", "Generic PLA @BBL A1"],
    filament_type: ["PLA", "PLA", "PLA"],
    filament_vendor: ["Generic", "Generic", "Generic"],
    filament_self_index: ["1", "2", "3"],
    filament_map: ["1", "1", "1"],
    filament_printable: ["3", "3", "3"],
    default_filament_colour: ["", "", ""],
    default_filament_profile: ["Generic PLA @BBL A1"],
    filament_map_mode: "Auto For Flush",
    single_extruder_multi_material: "1",
    master_extruder_id: "1",
    physical_extruder_map: ["0"],
    printer_extruder_id: ["1"],
    print_extruder_id: ["1"],
    extruder_colour: ["#018001"],
    flush_volumes_matrix: ["0", "326", "354", "399", "0", "348", "678", "632", "0"],
    flush_volumes_vector: ["140", "140", "140", "140", "140", "140"],
  };
  return cloneJson(referenceProjectSettings);
}

function resizeArrayFromTemplate(template, count, fallback, makeValue) {
  const source = Array.isArray(template) && template.length > 0 ? template : [fallback];
  return Array.from({ length: count }, (_, index) => (makeValue ? makeValue(index, source) : source[Math.min(index, source.length - 1)] ?? fallback));
}

function readFloat(buffer, offset) {
  return Buffer.from(buffer).readFloatLE(offset);
}

function meshFromBinaryStl(stl) {
  const buffer = Buffer.from(stl);
  if (buffer.length < 84) return { vertices: [], triangles: [], bounds: null };
  const count = buffer.readUInt32LE(80);
  const vertices = [];
  const triangles = [];
  const vertexIndex = new Map();
  let bounds = null;

  const addVertex = (point) => {
    const key = `${point.x.toFixed(6)},${point.y.toFixed(6)},${point.z.toFixed(6)}`;
    const existing = vertexIndex.get(key);
    if (existing !== undefined) return existing;
    const index = vertices.length;
    vertices.push(point);
    vertexIndex.set(key, index);
    bounds = bounds
      ? {
          minX: Math.min(bounds.minX, point.x),
          minY: Math.min(bounds.minY, point.y),
          minZ: Math.min(bounds.minZ, point.z),
          maxX: Math.max(bounds.maxX, point.x),
          maxY: Math.max(bounds.maxY, point.y),
          maxZ: Math.max(bounds.maxZ, point.z),
        }
      : {
          minX: point.x,
          minY: point.y,
          minZ: point.z,
          maxX: point.x,
          maxY: point.y,
          maxZ: point.z,
        };
    return index;
  };

  for (let triangleIndex = 0; triangleIndex < count; triangleIndex += 1) {
    const base = 84 + triangleIndex * 50 + 12;
    if (base + 36 > buffer.length) break;
    const ids = [];
    for (let vertex = 0; vertex < 3; vertex += 1) {
      const offset = base + vertex * 12;
      ids.push(
        addVertex({
          x: readFloat(buffer, offset),
          y: readFloat(buffer, offset + 4),
          z: readFloat(buffer, offset + 8),
        }),
      );
    }
    triangles.push(ids);
  }

  return { vertices, triangles, bounds };
}

function centerMeshOnOrigin(mesh) {
  if (!mesh.bounds) return { ...mesh, size: { width: 0, height: 0, depth: 0 } };
  const centerX = (mesh.bounds.minX + mesh.bounds.maxX) / 2;
  const centerY = (mesh.bounds.minY + mesh.bounds.maxY) / 2;
  const centerZ = (mesh.bounds.minZ + mesh.bounds.maxZ) / 2;
  const vertices = mesh.vertices.map((vertex) => ({
    x: vertex.x - centerX,
    y: vertex.y - centerY,
    z: vertex.z - centerZ,
  }));
  const size = {
    width: Math.max(0, mesh.bounds.maxX - mesh.bounds.minX),
    height: Math.max(0, mesh.bounds.maxY - mesh.bounds.minY),
    depth: Math.max(0, mesh.bounds.maxZ - mesh.bounds.minZ),
  };
  return {
    vertices,
    triangles: mesh.triangles,
    bounds: {
      minX: -size.width / 2,
      minY: -size.height / 2,
      minZ: -size.depth / 2,
      maxX: size.width / 2,
      maxY: size.height / 2,
      maxZ: size.depth / 2,
    },
    size,
  };
}

function keepMeshOrigin(mesh) {
  if (!mesh.bounds) return { ...mesh, size: { width: 0, height: 0, depth: 0 } };
  return {
    ...mesh,
    size: {
      width: Math.max(0, mesh.bounds.maxX - mesh.bounds.minX),
      height: Math.max(0, mesh.bounds.maxY - mesh.bounds.minY),
      depth: Math.max(0, mesh.bounds.maxZ - mesh.bounds.minZ),
    },
  };
}

function objectPlateTransform(object, index, total) {
  const center = plateCenter(index, total);
  return { tx: center.x, ty: center.y, tz: -(object.mesh.bounds?.minZ ?? 0) };
}

function objectAssembleTransforms(objects) {
  return objects.map((object) => ({ tx: 0, ty: 0, tz: -(object.mesh.bounds?.minZ ?? 0) }));
}

function plateColumnCount(total) {
  return Math.max(1, Math.ceil(Math.sqrt(Math.max(1, total))));
}

function plateCenter(index, total) {
  const columns = plateColumnCount(total);
  const column = index % columns;
  const row = Math.floor(index / columns);
  return {
    x: PLATE_SIZE / 2 + column * PLATE_SPACING,
    y: PLATE_SIZE / 2 - row * PLATE_SPACING,
  };
}

function objectModelXml(partId, mesh) {
  const vertices = mesh.vertices.map((vertex) => `     <vertex x="${fixed(vertex.x)}" y="${fixed(vertex.y)}" z="${fixed(vertex.z)}"/>`).join("\n");
  const triangles = mesh.triangles.map((triangle) => `     <triangle v1="${triangle[0]}" v2="${triangle[1]}" v3="${triangle[2]}"/>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US" xmlns="${CORE_NS}" xmlns:BambuStudio="${BAMBU_NS}" xmlns:p="${PRODUCTION_NS}" requiredextensions="p">
 <metadata name="BambuStudio:3mfVersion">1</metadata>
 <resources>
  <object id="${partId}" p:UUID="${deterministicUuid(partId, "00010000")}" type="model">
   <mesh>
    <vertices>
${vertices}
    </vertices>
    <triangles>
${triangles}
    </triangles>
   </mesh>
  </object>
 </resources>
 <build/>
</model>
`;
}

function rootModelXml(objects) {
  const resources = objects
    .map(
      (object) => `  <object id="${object.objectId}" p:UUID="${deterministicUuid(object.objectId, "00000000")}" type="model">
   <components>
    <component p:path="/3D/Objects/object_${object.index}.model" objectid="${object.partId}" p:UUID="${deterministicUuid(object.partId, "00020000")}" transform="1 0 0 0 1 0 0 0 1 0 0 0"/>
   </components>
  </object>`,
    )
    .join("\n");
  const build = objects
    .map((object, index) => {
      const { tx, ty, tz } = objectPlateTransform(object, index, objects.length);
      return `  <item objectid="${object.objectId}" p:UUID="${deterministicUuid(object.objectId, "00030000")}" transform="1 0 0 0 1 0 0 0 1 ${fixed(tx)} ${fixed(ty)} ${fixed(tz)}" printable="1"/>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US" xmlns="${CORE_NS}" xmlns:BambuStudio="${BAMBU_NS}" xmlns:p="${PRODUCTION_NS}" requiredextensions="p">
 <metadata name="Application">BambuStudio-02.02.01.60</metadata>
 <metadata name="BambuStudio:3mfVersion">1</metadata>
 <metadata name="Copyright"></metadata>
 <metadata name="CreationDate">${new Date().toISOString().slice(0, 10)}</metadata>
 <metadata name="Description"></metadata>
 <metadata name="Designer"></metadata>
 <metadata name="DesignerCover"></metadata>
 <metadata name="DesignerUserId"></metadata>
 <metadata name="License"></metadata>
 <metadata name="ModificationDate">${new Date().toISOString().slice(0, 10)}</metadata>
 <metadata name="Origin"></metadata>
 <metadata name="Title"></metadata>
 <resources>
${resources}
 </resources>
 <build p:UUID="2c7c17d8-22b5-4d84-8835-1976022ea369">
${build}
 </build>
</model>
`;
}

function relationshipsXml(objects) {
  const rels = objects
    .map((object) => ` <Relationship Target="/3D/Objects/object_${object.index}.model" Id="rel-${object.index}" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="${REL_NS}">
${rels}
</Relationships>`;
}

function packageRelationshipsXml(hasThumbnail) {
  const thumbnail = hasThumbnail
    ? `
 <Relationship Target="/Metadata/thumbnail.png" Id="rel-2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/thumbnail"/>
 <Relationship Target="/Metadata/thumbnail.png" Id="rel-4" Type="http://schemas.bambulab.com/package/2021/cover-thumbnail-middle"/>
 <Relationship Target="/Metadata/thumbnail_small.png" Id="rel-5" Type="http://schemas.bambulab.com/package/2021/cover-thumbnail-small"/>`
    : "";
  return `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="${REL_NS}">
 <Relationship Target="/3D/3dmodel.model" Id="rel-1" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>${thumbnail}
</Relationships>`;
}

function contentTypesXml(includePng) {
  const png = includePng ? `\n <Default Extension="png" ContentType="image/png"/>` : "";
  return `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
 <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
 <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>${png}
 <Default Extension="gcode" ContentType="text/x.gcode"/>
</Types>`;
}

function modelSettingsXml(objects) {
  const objectBlocks = objects
    .map(
      (object) => `  <object id="${object.objectId}">
    <metadata key="name" value="${xml(object.name)}"/>
    <metadata key="extruder" value="${object.extruder}"/>
    <metadata face_count="${object.mesh.triangles.length}"/>
    <part id="${object.partId}" subtype="normal_part">
      <metadata key="name" value="${xml(object.name)}"/>
      <metadata key="matrix" value="1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1"/>
      <mesh_stat face_count="${object.mesh.triangles.length}" edges_fixed="0" degenerate_facets="0" facets_removed="0" facets_reversed="0" backwards_edges="0"/>
    </part>
  </object>`,
    )
    .join("\n");
  const plateBlocks = objects
    .map(
      (object, index) => `  <plate>
    <metadata key="plater_id" value="${index + 1}"/>
    <metadata key="plater_name" value="${xml(object.name)}"/>
    <metadata key="locked" value="false"/>
    <metadata key="filament_map_mode" value="Auto For Flush"/>
    <metadata key="thumbnail_file" value="Metadata/plate_${index + 1}.png"/>
    <metadata key="thumbnail_no_light_file" value="Metadata/plate_no_light_${index + 1}.png"/>
    <metadata key="top_file" value="Metadata/top_${index + 1}.png"/>
    <metadata key="pick_file" value="Metadata/pick_${index + 1}.png"/>
    <model_instance>
      <metadata key="object_id" value="${object.objectId}"/>
      <metadata key="instance_id" value="0"/>
      <metadata key="identify_id" value="${77 + index * 36}"/>
    </model_instance>
  </plate>`,
    )
    .join("\n");
  const assembleTransforms = objectAssembleTransforms(objects);
  const assemble = objects
    .map((object, index) => {
      const { tx, ty, tz } = assembleTransforms[index];
      return `   <assemble_item object_id="${object.objectId}" instance_id="0" transform="1 0 0 0 1 0 0 0 1 ${fixed(tx)} ${fixed(ty)} ${fixed(tz)}" offset="0 0 0" />`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<config>
${objectBlocks}
${plateBlocks}
  <assemble>
${assemble}
  </assemble>
</config>
`;
}

function projectSettingsJson(objects) {
  const colors = objects.length > 0 ? objects.map((object) => upperHex(object.hex)) : ["#000000"];
  const count = colors.length;
  const indexed = Array.from({ length: count }, (_, index) => String(index + 1));
  const settings = loadReferenceProjectSettings();
  const flushMatrix = [];
  for (let y = 0; y < count; y += 1) {
    for (let x = 0; x < count; x += 1) {
      const templateIndex = (y % 3) * 3 + (x % 3);
      const templateValue = Array.isArray(settings.flush_volumes_matrix) ? settings.flush_volumes_matrix[templateIndex] : null;
      flushMatrix.push(x === y ? "0" : String(templateValue ?? "280"));
    }
  }
  const resizeKeys = [
    "activate_air_filtration",
    "additional_cooling_fan_speed",
    "chamber_temperatures",
    "circle_compensation_speed",
    "close_fan_the_first_x_layers",
    "complete_print_exhaust_fan_speed",
    "cool_plate_temp",
    "cool_plate_temp_initial_layer",
    "counter_coef_1",
    "counter_coef_2",
    "counter_coef_3",
    "counter_limit_max",
    "counter_limit_min",
    "default_filament_colour",
    "diameter_limit",
    "during_print_exhaust_fan_speed",
    "enable_overhang_bridge_fan",
    "enable_pressure_advance",
    "eng_plate_temp",
    "eng_plate_temp_initial_layer",
    "fan_cooling_layer_time",
    "fan_max_speed",
    "fan_min_speed",
    "filament_adaptive_volumetric_speed",
    "filament_adhesiveness_category",
    "filament_change_length",
    "filament_colour_type",
    "filament_cost",
    "filament_density",
    "filament_deretraction_speed",
    "filament_diameter",
    "filament_end_gcode",
    "filament_extruder_variant",
    "filament_flow_ratio",
    "filament_flush_temp",
    "filament_flush_volumetric_speed",
    "filament_ids",
    "filament_is_support",
    "filament_long_retractions_when_cut",
    "filament_max_volumetric_speed",
    "filament_minimal_purge_on_wipe_tower",
    "filament_pre_cooling_temperature",
    "filament_prime_volume",
    "filament_ramming_travel_time",
    "filament_ramming_volumetric_speed",
    "filament_retract_before_wipe",
    "filament_retract_restart_extra",
    "filament_retract_when_changing_layer",
    "filament_retraction_distances_when_cut",
    "filament_retraction_length",
    "filament_retraction_minimum_travel",
    "filament_retraction_speed",
    "filament_scarf_gap",
    "filament_scarf_height",
    "filament_scarf_length",
    "filament_scarf_seam_type",
    "filament_settings_id",
    "filament_shrink",
    "filament_soluble",
    "filament_start_gcode",
    "filament_type",
    "filament_velocity_adaptation_factor",
    "filament_vendor",
    "filament_wipe",
    "filament_wipe_distance",
    "filament_z_hop",
    "filament_z_hop_types",
    "full_fan_speed_layer",
    "hole_coef_1",
    "hole_coef_2",
    "hole_coef_3",
    "hole_limit_max",
    "hole_limit_min",
    "hot_plate_temp",
    "hot_plate_temp_initial_layer",
    "impact_strength_z",
    "long_retractions_when_ec",
    "nozzle_temperature",
    "nozzle_temperature_initial_layer",
    "nozzle_temperature_range_high",
    "nozzle_temperature_range_low",
    "overhang_fan_speed",
    "overhang_fan_threshold",
    "overhang_threshold_participating_cooling",
    "pre_start_fan_time",
    "pressure_advance",
    "reduce_fan_stop_start_freq",
    "required_nozzle_HRC",
    "retraction_distances_when_ec",
    "slow_down_for_layer_cooling",
    "slow_down_layer_time",
    "slow_down_min_speed",
    "supertack_plate_temp",
    "supertack_plate_temp_initial_layer",
    "temperature_vitrification",
    "textured_plate_temp",
    "textured_plate_temp_initial_layer",
    "upward_compatible_machine",
    "volumetric_speed_coefficients",
    "wipe_tower_x",
    "wipe_tower_y",
  ];
  for (const key of resizeKeys) {
    if (Array.isArray(settings[key])) settings[key] = resizeArrayFromTemplate(settings[key], count, settings[key][0] ?? "");
  }
  settings.filament_colour = colors;
  settings.filament_multi_colour = colors;
  settings.filament_self_index = indexed;
  settings.filament_map = resizeArrayFromTemplate(settings.filament_map, count, "1");
  settings.filament_printable = resizeArrayFromTemplate(settings.filament_printable, count, String(count), () => String(count));
  settings.flush_volumes_matrix = flushMatrix;
  settings.flush_volumes_vector = resizeArrayFromTemplate(settings.flush_volumes_vector, Math.max(0, count * Math.max(0, count - 1)), "140");
  settings.default_filament_colour = resizeArrayFromTemplate(settings.default_filament_colour, count, "");
  settings.single_extruder_multi_material = "1";
  settings.master_extruder_id = "1";
  settings.filament_map_mode = "Auto For Flush";
  settings.from = "project";
  settings.name = "project_settings";
  settings.version = settings.version || "02.02.01.60";
  return JSON.stringify(settings, null, 4);
}

function sliceInfoXml() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<config>
  <header>
    <header_item key="X-BBL-Client-Type" value="slicer"/>
    <header_item key="X-BBL-Client-Version" value="02.02.01.60"/>
  </header>
</config>
`;
}

function cutInformationXml(objects) {
  const entries = objects.map((object) => ` <object id="${object.index}">\n  <cut_id id="0" check_sum="1" connectors_cnt="0"/>\n </object>`).join("\n");
  return `<?xml version="1.0" encoding="utf-8"?>
<objects>
${entries}
</objects>`;
}

function objectThumbnailCells(layer, object) {
  const grid = layer.grid || { width: 0, height: 0, cells: [] };
  const result = [];
  for (let row = 0; row < grid.height; row += 1) {
    for (let column = 0; column < grid.width; column += 1) {
      const colorId = grid.cells[row * grid.width + column];
      if (!colorId) continue;
      if (object.role !== "lattice" && colorId !== object.colorId) continue;
      result.push({ row, column });
    }
  }
  return result;
}

function thumbnailCellBounds(cells) {
  if (cells.length === 0) return null;
  let minColumn = Number.POSITIVE_INFINITY;
  let minRow = Number.POSITIVE_INFINITY;
  let maxColumn = Number.NEGATIVE_INFINITY;
  let maxRow = Number.NEGATIVE_INFINITY;
  for (const cell of cells) {
    minColumn = Math.min(minColumn, cell.column);
    minRow = Math.min(minRow, cell.row);
    maxColumn = Math.max(maxColumn, cell.column);
    maxRow = Math.max(maxRow, cell.row);
  }
  return { minColumn, minRow, maxColumn, maxRow };
}

function layerThumbnailCells(layer, colorMap) {
  const grid = layer.grid || { width: 0, height: 0, cells: [] };
  const result = [];
  for (let row = 0; row < grid.height; row += 1) {
    for (let column = 0; column < grid.width; column += 1) {
      const colorId = grid.cells[row * grid.width + column];
      const color = colorId ? colorMap.get(colorId) : null;
      if (!color) continue;
      result.push({ row, column, hex: normalizeHex(color.hex) });
    }
  }
  return result;
}

function layerThumbnailSvg(layer, colors, size = THUMBNAIL_SIZE) {
  const colorMap = new Map(colors.map((color) => [color.id, color]));
  const cells = layerThumbnailCells(layer, colorMap);
  const bounds = thumbnailCellBounds(cells);
  const parts = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">`,
    `<rect width="100%" height="100%" fill="#eef2f7"/>`,
    `<rect x="${size * 0.05}" y="${size * 0.05}" width="${size * 0.9}" height="${size * 0.9}" rx="${size * 0.035}" fill="#f8fafc" stroke="#cbd5e1" stroke-width="${Math.max(1, size * 0.004)}"/>`,
  ];
  if (!bounds) {
    parts.push(`<text x="${size / 2}" y="${size / 2}" text-anchor="middle" dominant-baseline="middle" font-family="Arial,sans-serif" font-size="${size * 0.055}" font-weight="700" fill="#64748b">${svg(layer.name || "Layer")}</text>`);
    parts.push(`</svg>`);
    return parts.join("");
  }

  const previewColumns = bounds.maxColumn - bounds.minColumn + 1;
  const previewRows = bounds.maxRow - bounds.minRow + 1;
  const available = size * 0.82;
  const cell = Math.max(2, Math.floor(Math.min(available / Math.max(1, previewColumns), available / Math.max(1, previewRows))));
  const width = previewColumns * cell;
  const height = previewRows * cell;
  const offsetX = (size - width) / 2;
  const offsetY = (size - height) / 2;
  const stroke = Math.max(0.5, Math.min(2, cell * 0.035));

  parts.push(`<g transform="translate(${fixed(offsetX)},${fixed(offsetY)})">`);
  for (const item of cells) {
    const x = (item.column - bounds.minColumn) * cell;
    const y = (item.row - bounds.minRow) * cell;
    parts.push(`<rect x="${x}" y="${y}" width="${cell}" height="${cell}" fill="${item.hex}" stroke="#111827" stroke-opacity="0.12" stroke-width="${stroke}" shape-rendering="crispEdges"/>`);
  }
  parts.push(`</g>`);
  parts.push(`</svg>`);
  return parts.join("");
}

function plateThumbnailSvg(layer, object, size = THUMBNAIL_SIZE) {
  const cells = objectThumbnailCells(layer, object);
  const bounds = thumbnailCellBounds(cells);
  const parts = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">`,
    `<rect width="100%" height="100%" fill="#eef2f7"/>`,
    `<rect x="${size * 0.05}" y="${size * 0.05}" width="${size * 0.9}" height="${size * 0.9}" rx="${size * 0.035}" fill="#f8fafc" stroke="#cbd5e1" stroke-width="${Math.max(1, size * 0.004)}"/>`,
  ];
  if (!bounds) {
    parts.push(`<text x="${size / 2}" y="${size / 2}" text-anchor="middle" dominant-baseline="middle" font-family="Arial,sans-serif" font-size="${size * 0.055}" font-weight="700" fill="#64748b">${svg(object.name)}</text>`);
    parts.push(`</svg>`);
    return parts.join("");
  }

  const previewColumns = bounds.maxColumn - bounds.minColumn + 1;
  const previewRows = bounds.maxRow - bounds.minRow + 1;
  const available = size * 0.78;
  const cell = Math.max(2, Math.floor(Math.min(available / Math.max(1, previewColumns), available / Math.max(1, previewRows))));
  const width = previewColumns * cell;
  const height = previewRows * cell;
  const offsetX = (size - width) / 2;
  const offsetY = (size - height) / 2;
  const stroke = object.role === "lattice" ? Math.max(1, Math.min(4, cell * 0.14)) : Math.max(0.5, Math.min(2, cell * 0.045));
  const fill = normalizeHex(object.hex);

  parts.push(`<g transform="translate(${fixed(offsetX)},${fixed(offsetY)})">`);
  for (const item of cells) {
    const x = (item.column - bounds.minColumn) * cell;
    const y = (item.row - bounds.minRow) * cell;
    if (object.role === "lattice") {
      parts.push(`<rect x="${x}" y="${y}" width="${cell}" height="${cell}" fill="none" stroke="${fill}" stroke-width="${stroke}" shape-rendering="crispEdges"/>`);
    } else {
      parts.push(`<rect x="${x}" y="${y}" width="${cell}" height="${cell}" fill="${fill}" stroke="#111827" stroke-opacity="0.14" stroke-width="${stroke}" shape-rendering="crispEdges"/>`);
    }
  }
  parts.push(`</g>`);
  parts.push(`</svg>`);
  return parts.join("");
}

async function layerThumbnailImages(layer, colors) {
  const cover = await sharp(Buffer.from(layerThumbnailSvg(layer, colors, THUMBNAIL_SIZE), "utf8"))
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
  const small = await sharp(cover)
    .resize({ width: SMALL_THUMBNAIL_SIZE, height: SMALL_THUMBNAIL_SIZE, fit: "fill", kernel: "nearest" })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
  return { cover, small };
}

async function plateThumbnailImages(layer, object) {
  const plate = await sharp(Buffer.from(plateThumbnailSvg(layer, object, THUMBNAIL_SIZE), "utf8"))
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
  const small = await sharp(plate)
    .resize({ width: SMALL_THUMBNAIL_SIZE, height: SMALL_THUMBNAIL_SIZE, fit: "fill", kernel: "nearest" })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
  return {
    plate,
    small,
    noLight: plate,
    top: plate,
    pick: plate,
  };
}

async function buildLayerThreeMf({ project, layer, colors, bounds }) {
  const counts = countByColor(layer.grid);
  const usedIds = new Set(Array.from(counts.keys()));
  const usedColors = colors.filter((color) => usedIds.has(color.id));
  const layerPlateName = String(layer.name || "").trim() || "Layer";
  const objects = [];
  const addObject = ({ role, name, hex, code, colorId, count, stl, sourceStl }) => {
    const mesh = keepMeshOrigin(meshFromBinaryStl(stl));
    if (mesh.triangles.length === 0) return;
    const index = objects.length + 1;
    objects.push({
      index,
      objectId: index * 2,
      partId: index * 2 - 1,
      extruder: index,
      name,
      code,
      colorId,
      role,
      hex: upperHex(hex),
      count,
      sourceStl,
      size: mesh.size,
      mesh,
    });
  };

  addObject({
    role: "lattice",
    name: layerPlateName,
    code: "black_lattice",
    hex: "#000000",
    count: null,
    sourceStl: "black_lattice.stl",
    stl: generateLatticeStl(layer.grid, project.geometry, { bounds, zOffset: 0, alignToGridCenter: true }),
  });

  for (const color of usedColors) {
    const hex = normalizeHex(color.hex);
    const code = color.code || color.id;
    addObject({
      role: "bead",
      name: `${code} ${color.name || ""}`.trim(),
      code,
      colorId: color.id,
      hex,
      count: counts.get(color.id) ?? 0,
      sourceStl: `bead_${String(code).replace(/[^\w\u4e00-\u9fa5-]+/g, "_")}_${hex.replace("#", "").toUpperCase()}.stl`,
      stl: generateColorStl(layer.grid, color.id, project.geometry, { bounds, zOffset: 0, alignToGridCenter: true }),
    });
  }

  const entries = {
    "[Content_Types].xml": strToU8(contentTypesXml(objects.length > 0)),
    "_rels/.rels": strToU8(packageRelationshipsXml(objects.length > 0)),
    "3D/3dmodel.model": strToU8(rootModelXml(objects)),
    "3D/_rels/3dmodel.model.rels": strToU8(relationshipsXml(objects)),
    "Metadata/model_settings.config": strToU8(modelSettingsXml(objects)),
    "Metadata/project_settings.config": strToU8(projectSettingsJson(objects)),
    "Metadata/slice_info.config": strToU8(sliceInfoXml()),
    "Metadata/cut_information.xml": strToU8(cutInformationXml(objects)),
  };

  const thumbnails = new Map();
  for (const object of objects) {
    thumbnails.set(object.index, await plateThumbnailImages(layer, object));
  }
  if (objects.length > 0) {
    const cover = await layerThumbnailImages(layer, usedColors);
    entries["Metadata/thumbnail.png"] = cover.cover;
    entries["Metadata/thumbnail_small.png"] = cover.small;
  }

  for (const object of objects) {
    const thumbnail = thumbnails.get(object.index);
    entries[`3D/Objects/object_${object.index}.model`] = strToU8(objectModelXml(object.partId, object.mesh));
    entries[`Metadata/plate_${object.index}.png`] = thumbnail.plate;
    entries[`Metadata/plate_${object.index}_small.png`] = thumbnail.small;
    entries[`Metadata/plate_no_light_${object.index}.png`] = thumbnail.noLight;
    entries[`Metadata/top_${object.index}.png`] = thumbnail.top;
    entries[`Metadata/pick_${object.index}.png`] = thumbnail.pick;
  }

  return {
    buffer: Buffer.from(zipSync(entries, { level: 6 })),
    plates: objects.map((object) => ({
      plateId: object.index,
      role: object.role,
      sourceStl: object.sourceStl,
      code: object.code,
      name: object.name,
      hex: normalizeHex(object.hex),
      extruder: object.extruder,
      count: object.count,
    })),
  };
}

module.exports = {
  buildLayerThreeMf,
  meshFromBinaryStl,
};
