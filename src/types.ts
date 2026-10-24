export type ToolMode = "brush" | "eraser" | "magic-eraser" | "paint-bucket" | "picker" | "move" | "pan";
export type ImageMappingMode = "palette" | "auto";
export type PixelAlgorithm = "dominant-vote" | "mean-sample" | "median-sample" | "center-weighted" | "edge-preserve" | "global-cluster";

export interface BeadColor {
  id: string;
  code: string;
  name: string;
  hex: string;
  enabled: boolean;
  displayUsed?: boolean;
}

export interface BeadColorGroup {
  id: string;
  name: string;
  description?: string;
  source?: string;
  colors: BeadColor[];
}

export interface GeometrySettings {
  blockSize: number;
  fitGap: number;
  blockHeight: number;
  plateHeight: number;
  blockChamfer: number;
  gridLineWidth: number;
  alphaThreshold: number;
  componentTolerance: number;
  imageTolerance: number;
  cropLeft: number;
  cropTop: number;
  cropRight: number;
  cropBottom: number;
  maxGridSize: number;
}

export interface SourceImage {
  name: string;
  dataUrl: string;
}

export interface PixelGrid {
  width: number;
  height: number;
  cells: Array<string | null>;
}

export interface PixelLayer {
  id: string;
  name: string;
  visible: boolean;
  colorGroups: BeadColorGroup[];
  activeColorGroupId: string;
  imageColorGroup: BeadColorGroup | null;
  selectedColorId: string;
  grid: PixelGrid;
  kernelColorGrid: PixelGrid | null;
  sourceImage: SourceImage | null;
  imageRotation: number;
  imageCrop: Pick<GeometrySettings, "cropLeft" | "cropTop" | "cropRight" | "cropBottom">;
  imageTolerance: number;
}

export interface EditorSettings {
  tool: ToolMode;
  selectedColorId: string;
  zoom: number;
  offsetX: number;
  offsetY: number;
  modifiers: EditorModifiers;
}

export interface EditorModifiers {
  showCenterGuides: boolean;
  highlightColorOutline: boolean;
  mirrorDrawX: boolean;
  mirrorDrawY: boolean;
  mirrorDrawDiagonalPurple: boolean;
  mirrorDrawDiagonalGreen: boolean;
  rotateDrawHalf: boolean;
  rotateDrawQuarter: boolean;
}

export interface Project {
  version: 1;
  layers: PixelLayer[];
  activeLayerId: string;
  colorGroups: BeadColorGroup[];
  activeColorGroupId: string;
  imageColorGroup: BeadColorGroup | null;
  geometry: GeometrySettings;
  editor: EditorSettings;
}

export interface ExportedFileInfo {
  role: "bead" | "lattice" | "combined" | "material-library" | "pattern" | "bead-pattern" | "overview-pattern";
  file: string;
  colorId?: string;
  code?: string;
  name?: string;
  hex?: string;
  count?: number;
  materialLibrary?: string;
  variant?: "general" | "bead";
}

export interface ExportManifest {
  version: 1;
  generatedAt: string;
  units: "mm";
  grid: {
    width: number;
    height: number;
  };
  geometry: GeometrySettings;
  colors: Array<{
    colorId: string;
    code: string;
    name: string;
    hex: string;
    count: number;
  }>;
  files: ExportedFileInfo[];
}
