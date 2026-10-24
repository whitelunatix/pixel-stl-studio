import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { strFromU8, unzipSync } from "fflate";
import { Fragment } from "react";
import {
  ArrowDownToLine,
  ArrowLeftToLine,
  ArrowRightToLine,
  ArrowUpToLine,
  Brush,
  ChevronDown,
  ChevronRight,
  Copy,
  Crosshair,
  Download,
  Eraser,
  Eye,
  EyeOff,
  FlipHorizontal2,
  FlipVertical2,
  FoldHorizontal,
  FoldVertical,
  GripVertical,
  Hand,
  ImageUp,
  Info,
  Monitor,
  Moon,
  Move,
  MoveDiagonal,
  MoveDiagonal2,
  PanelLeftOpen,
  PanelRightOpen,
  PaintBucket,
  Pipette,
  Plus,
  Redo2,
  RefreshCw,
  RotateCcw,
  RotateCw,
  RotateCwSquare,
  Scan,
  Sun,
  X,
  Trash2,
  Undo2,
  WandSparkles,
} from "lucide-react";
import "./App.css";
import { ThreePreview } from "./components/ThreePreview";
import { hexToRgb, normalizeHex } from "./core/color";
import { colorDisplaySections, orderColorsForDisplay } from "./core/colorOrdering";
import { cloneColorGroups, createBlankGrid, createEmptyProject, createPixelLayer, DEFAULT_COLOR_GROUPS, mergeWithDefaultColorGroups } from "./core/defaults";
import { countFilledCells, gridIndex, isInsideGrid, resizeGrid, setCell, shiftGrid, usedColorIds } from "./core/grid";
import { activeLayer as getActiveLayer, updateActiveLayer, updateLayer } from "./core/layers";
import { parseProject } from "./core/project";
import type { BeadColorGroup, BeadColor, EditorModifiers, GeometrySettings, ImageMappingMode, PixelAlgorithm, PixelGrid, PixelLayer, Project, SourceImage, ToolMode } from "./types";

const UI = {
  ready: "\u51c6\u5907\u5c31\u7eea",
  noImage: "\u672a\u5bfc\u5165\u56fe\u7247",
  guide: "\u64cd\u4f5c\u6307\u5357",
  image: "\u56fe\u7247",
  gridSettings: "\u7f51\u683c\u8bbe\u7f6e",
  exportStl: "\u5bfc\u51fa ZIP",
  importZip: "\u5bfc\u5165 ZIP",
  resetProject: "\u91cd\u7f6e\u9879\u76ee",
  projectReset: "\u5df2\u91cd\u7f6e\u9879\u76ee",
  cropConvert: "\u88c1\u526a\u8f6c\u6362",
  brush: "\u753b\u7b14",
  eraser: "\u6a61\u76ae\u64e6",
  magicEraser: "\u9b54\u672f\u6a61\u76ae\u64e6",
  paintBucket: "\u6cb9\u6f06\u6876",
  picker: "\u53d6\u8272\u9009\u62e9",
  movePixels: "\u79fb\u52a8\u50cf\u7d20",
  panView: "\u79fb\u52a8\u89c6\u56fe",
  mirrorX: "\u6c34\u5e73\u955c\u50cf",
  mirrorY: "\u5782\u76f4\u955c\u50cf",
  centerGuides: "\u663e\u793a/\u9690\u85cf\u4e2d\u5fc3\u53c2\u8003\u7ebf",
  highlightColorOutline: "\u663e\u793a/\u9690\u85cf\u9009\u4e2d\u8272\u5f69\u8f6e\u5ed3\u7ebf",
  mirrorDrawX: "X \u955c\u50cf\u7ed8\u5236\uff08\u5de6\u53f3\uff09",
  mirrorDrawY: "Y \u955c\u50cf\u7ed8\u5236\uff08\u4e0a\u4e0b\uff09",
  mirrorDrawDiagonalPurple: "\u4ece\u53f3\u4e0a\u5230\u5de6\u4e0b\u8fdb\u884c\u955c\u50cf",
  mirrorDrawDiagonalGreen: "\u4ece\u5de6\u4e0a\u5230\u53f3\u4e0b\u955c\u50cf",
  rotateDrawHalf: "1/2 \u4e2d\u5fc3\u65cb\u8f6c\u7ed8\u5236\uff08180\u00b0\uff09",
  rotateDrawQuarter: "1/4 \u4e2d\u5fc3\u65cb\u8f6c\u7ed8\u5236\uff0890\u00b0\uff09",
  clearCanvas: "\u6e05\u7a7a\u753b\u5e03",
  copyLeftToRight: "-x \u5230 x",
  copyRightToLeft: "x \u5230 -x",
  copyBottomToTop: "-y \u5230 y",
  copyTopToBottom: "y \u5230 -y",
  copyPrompt: "\u590d\u5236\u63d0\u793a\u8bcd",
  beads: "\u8272\u5361\u5206\u7ec4",
  layers: "\u56fe\u5c42",
  newLayer: "\u65b0\u5efa\u56fe\u5c42",
  duplicateLayer: "\u590d\u5236\u56fe\u5c42",
  deleteLayer: "\u5220\u9664\u56fe\u5c42",
  showLayer: "\u663e\u793a\u56fe\u5c42",
  hideLayer: "\u9690\u85cf\u56fe\u5c42",
  showAllLayers: "\u663e\u793a\u5168\u90e8",
  hideInactiveLayers: "\u4ec5\u5f53\u524d",
  autoHideInactiveLayers: "\u81ea\u52a8\u4ec5\u5f53\u524d",
  activeLayer: "\u5f53\u524d\u56fe\u5c42",
  visibleLayers: "\u53ef\u89c1\u56fe\u5c42",
  modelSettings: "\u6a21\u578b\u53c2\u6570",
  preview: "3D \u9884\u89c8",
  noBead: "\u65e0\u8272\u5361",
  newBead: "\u65b0\u8272\u5361",
  importing: "\u6b63\u5728\u5bfc\u5165\u56fe\u7247...",
  rasterizing: "\u540e\u7aef\u6b63\u5728\u50cf\u7d20\u5316\u5e76\u5339\u914d\u8272\u5361...",
  generatingZip: "\u540e\u7aef\u6b63\u5728\u751f\u6210 ZIP...",
  importFailed: "\u5bfc\u5165\u5931\u8d25",
  openFailed: "\u6253\u5f00\u9879\u76ee\u5931\u8d25",
  exportFailed: "\u5bfc\u51fa\u5931\u8d25",
  needImage: "\u8bf7\u5148\u5bfc\u5165\u56fe\u7247",
  beadCode: "\u62fc\u8c46\u8272\u53f7",
  colorValue: "\u8272\u5361\u989c\u8272",
  pixelAlgorithm: "\u50cf\u7d20\u5316\u7b97\u6cd5",
  algorithmDominantVote: "\u4e3b\u8272\u6295\u7968\u5339\u914d",
  algorithmMeanSample: "\u5747\u503c\u91c7\u6837\u5339\u914d",
  algorithmMedianSample: "\u4e2d\u4f4d\u6570\u91c7\u6837\u5339\u914d",
  algorithmCenterWeighted: "\u4e2d\u5fc3\u52a0\u6743\u5339\u914d",
  algorithmEdgePreserve: "\u8fb9\u7f18\u4fdd\u7559\u5339\u914d",
  algorithmGlobalCluster: "\u5168\u5c40\u805a\u7c7b\u5339\u914d",
  colorCount: "\u89e3\u6790\u989c\u8272\u6570\u91cf",
  mappingMode: "\u6620\u5c04\u65b9\u5f0f",
  mapPalette: "\u5f53\u524d\u8272\u5361\u7ec4\u6620\u5c04",
  mapAuto: "\u50cf\u7d20\u81ea\u52a8\u5206\u7ec4",
  imageTolerance: "\u56fe\u7247\u5bb9\u5dee",
  kernelPreview: "\u7f51\u683c\u9884\u89c8",
  rotationAngle: "\u65cb\u8f6c\u89d2\u5ea6",
  rotateLeft: "\u5411\u5de6\u65cb\u8f6c",
  rotateRight: "\u5411\u53f3\u65cb\u8f6c",
  cropLeft: "\u5de6\u88c1\u526a (px)",
  cropTop: "\u4e0a\u88c1\u526a (px)",
  cropRight: "\u53f3\u88c1\u526a (px)",
  cropBottom: "\u4e0b\u88c1\u526a (px)",
  gridColumns: "\u6c34\u5e73\u50cf\u7d20\u5757\u6570",
  gridRows: "\u5782\u76f4\u50cf\u7d20\u5757\u6570",
  blockSize: "\u65b9\u5757\u5927\u5c0f (mm)",
  fitGap: "\u65b9\u5757/\u6805\u683c\u88c5\u914d\u95f4\u9699 (mm)",
  blockHeight: "\u65b9\u5757\u9ad8\u5ea6 (mm)",
  plateHeight: "\u6805\u683c\u677f\u9ad8\u5ea6 (mm)",
  gridLineWidth: "\u9ed1\u8272\u6846\u539a\u5ea6 (mm)",
  blockChamfer: "\u65b9\u5757\u5012\u89d2 (mm)",
  viewImage: "\u56fe\u7247\u89c6\u56fe",
  view2d: "2D \u89c6\u56fe",
  view3d: "3D \u89c6\u56fe",
  splitView: "\u5206\u5c4f\u6a21\u5f0f",
  restoreLeftPane: "\u6062\u590d\u5de6\u4fa7\u53c2\u6570\u680f",
  restoreRightPane: "\u6062\u590d\u53f3\u4fa7\u8272\u5361\u680f",
  closeView: "\u5408\u5e76\u5230\u5de6\u4fa7",
  importImage: "\u5bfc\u5165\u56fe\u7247",
  dropImage: "\u70b9\u51fb\u3001\u62d6\u5165\u6216 Ctrl+V \u7c98\u8d34\u56fe\u7247",
  splitLeft: "\u5411\u5de6\u62c6\u5206",
  splitRight: "\u5411\u53f3\u62c6\u5206",
  zipSaved: "\u5df2\u4fdd\u5b58",
  zipDownloaded: "\u5df2\u4e0b\u8f7d",
  zipCancelled: "\u5df2\u53d6\u6d88\u5bfc\u51fa",
  zipCompleteTitle: "\u4e0b\u8f7d\u5b8c\u6210",
  zipLocationNotice: "\u6d4f\u89c8\u5668\u4e0d\u5141\u8bb8\u7f51\u9875\u76f4\u63a5\u6253\u5f00\u672c\u5730\u6587\u4ef6\u5939\uff0c\u8bf7\u5728\u6d4f\u89c8\u5668\u4e0b\u8f7d\u5217\u8868\u6216\u4f60\u9009\u62e9\u7684\u4fdd\u5b58\u4f4d\u7f6e\u6253\u5f00\u3002",
  gotIt: "\u77e5\u9053\u4e86",
  exportOptions: "\u5bfc\u51fa\u9009\u9879",
  exportZipName: "\u5bfc\u51fa\u538b\u7f29\u5305\u540d\u5b57",
  exportLayers: "\u56fe\u5c42",
  exportFiles: "\u6587\u4ef6",
  exportMeta: "\u5143\u4fe1\u606f JSON",
  exportObj: "OBJ",
  export3mf: "3MF",
  exportPatternPng: "\u901a\u7528\u56fe\u7eb8 PNG",
  exportBeadPng: "\u62fc\u8c46\u56fe\u7eb8 PNG",
  exportHammerPng: "\u6572\u8c46\u56fe\u7eb8 PNG",
  exportOverviewPng: "\u6982\u89c8\u56fe PNG",
  exportOverviewPngHint: "\u9009\u62e9\u591a\u4e2a\u56fe\u5c42\u540e\u53ef\u5bfc\u51fa",
  exportOverviewColumns: "\u6982\u89c8\u56fe\u5217\u6570",
  exportOverviewColumnsHint: "\u5217\u6570\u53ea\u5f71\u54cd\u6982\u89c8\u56fe PNG",
  exportSelectAllFiles: "\u5168\u90e8\u52fe\u9009",
  exportClearAllFiles: "\u53d6\u6d88\u5168\u9009",
  exportSelectAllLayers: "\u5168\u90e8\u52fe\u9009",
  exportClearAllLayers: "\u53d6\u6d88\u5168\u9009",
  exportSelected: "\u5bfc\u51fa\u9009\u4e2d\u5185\u5bb9",
  exportSelectAtLeastOneLayer: "\u81f3\u5c11\u9700\u8981\u9009\u62e9\u4e00\u4e2a\u56fe\u5c42",
  exportSelectAtLeastOneFile: "\u81f3\u5c11\u9700\u8981\u9009\u62e9\u4e00\u79cd\u56fe\u5c42\u6587\u4ef6\u6216\u5143\u4fe1\u606f",
  cells: "\u683c",
  colors: "\u8272",
  width: "\u5bbd",
  depth: "\u9ad8",
  thick: "\u539a",
  undo: "\u64a4\u9500",
  redo: "\u91cd\u505a",
  resetImage: "\u91cd\u7f6e\u56fe\u7247",
  defaultBeads: "\u9ed8\u8ba4\u8272\u5361",
  imageBeads: "\u56fe\u7247\u8272\u5361",
  beadGroup: "\u8272\u5361\u5206\u7ec4",
  groupName: "\u5206\u7ec4\u540d\u79f0",
  newGroup: "\u65b0\u5efa\u5206\u7ec4",
  deleteGroup: "\u5220\u9664\u5206\u7ec4",
  restoreDefaultBeads: "\u6062\u590d\u9ed8\u8ba4\u8272\u5361",
  restoredDefaultBeads: "\u5df2\u6062\u590d\u9ed8\u8ba4\u8272\u5361",
  defaultGroup: "default",
  groupManage: "\u5206\u7ec4\u7ba1\u7406",
  groupColors: "\u8272\u5361",
  groupCurrent: "\u5f53\u524d\u5206\u7ec4",
  groupColorCount: "\u8272",
  sortColors: "\u5237\u65b0",
  hexValue: "HEX",
  mergeTo: "\u66ff\u6362\u4e3a",
  replaceActiveColorWith: "\u6fc0\u6d3b\u989c\u8272\u66ff\u6362\u4e3a",
  deleteActiveColor: "\u5220\u9664\u6fc0\u6d3b\u989c\u8272",
  setColor: "\u8bbe\u7f6e\u989c\u8272",
  confirm: "\u786e\u8ba4",
  cancel: "\u53d6\u6d88",
  invalidHex: "\u8bf7\u8f93\u5165 6 \u4f4d\u5341\u516d\u8fdb\u5236\u989c\u8272",
  noMergeTarget: "\u6ca1\u6709\u53ef\u5408\u5e76\u8272\u5361",
  theme: "\u4e3b\u9898",
  themeSystem: "\u8ddf\u968f\u7cfb\u7edf",
  themeLight: "\u6d45\u8272",
  themeDark: "\u6df1\u8272",
  needsReparse: "\u88c1\u526a\u53c2\u6570\u5df2\u53d8\u66f4\uff0c\u9700\u8981\u91cd\u65b0\u8f6c\u6362",
};

const GUIDE_SECTIONS: Array<{ title: string; items: JSX.Element[] }> = [
  {
    title: "\u5feb\u901f\u6d41\u7a0b",
    items: [
      <>先在左侧选择 <strong>当前图层</strong>，设置该图层的 <strong>像素块数量</strong>，再根据打印需要调整 <strong>模型参数</strong>。</>,
      <>进入 <strong>图片视图</strong>，点击子工具栏的 <strong>导入图片</strong>，或直接把图片拖入图片区域。导入只保存到当前图层，<u>不会自动覆盖 2D 图案</u>。</>,
      <>调整裁剪框、旋转角度、颜色数量和映射方式后，点击 <strong>裁剪转换</strong>。转换成功会跳到 <strong>2D 视图</strong>，并只写入当前图层。</>,
      <>在 <strong>2D 视图</strong> 修正颜色和空格，再用 <strong>3D 视图</strong> 检查层叠、晶格和高度，最后点击 <strong>导出 ZIP</strong> 选择需要导出的图层和文件。</>,
      <>已有项目可以点击顶部 <strong>导入 ZIP</strong> 恢复；想重新开始时点击 <strong>重置项目</strong>，会清空当前项目并回到一个空图层。</>,
    ],
  },
  {
    title: "\u9f20\u6807\u4e0e\u89c6\u56fe\u64cd\u4f5c",
    items: [
      <>在 2D 画布中，<strong>鼠标左键</strong> 执行当前工具：画笔、橡皮擦、魔术橡皮擦、油漆桶、取色器或移动像素。</>,
      <><strong>鼠标右键</strong> 只打开上下文菜单，不会触发左键绘制、擦除、取色或移动操作。</>,
      <><strong>鼠标中键</strong> 用于平移图片视图和 2D 视图；<strong>滚轮</strong> 用于缩放，并会以鼠标位置为中心缩放。</>,
      <>顶部的 <strong>图片视图 / 2D 视图 / 3D 视图</strong> 标签用于切换工作区；分屏后，每个窗口里的标签只切换该窗口内容。</>,
      <>如果视图被缩放或平移到不好操作，可以用 <strong>平移工具</strong> 或中键把画面移回中心。</>,
      <>2D 工具条里的 <strong>水平镜像</strong>、<strong>垂直镜像</strong> 是视图翻转开关，会同步影响 2D 点击位置、3D 预览和导出，但不会直接改写当前图层像素。</>,
    ],
  },
  {
    title: "\u56fe\u7247\u5bfc\u5165\u4e0e\u88c1\u526a\u8f6c\u6362",
    items: [
      <>图片导入只影响 <strong>当前图层</strong>。切换到其它图层后再导入图片，不会覆盖原来图层的图片或 2D 网格。</>,
      <>绿色裁剪框决定参与转换的区域。点击 <strong>裁剪转换</strong> 时，只会使用 <u>裁剪框内部</u>、并且已经旋转后的图片。</>,
      <><strong>主色投票匹配</strong> 会在每个格子内按容差聚类并选择主要颜色，适合线稿、边缘和局部细节。</>,
      <><strong>均值采样匹配</strong> 会先计算每个格子的平均颜色，再匹配到色卡，适合照片、渐变和柔和区域。</>,
      <><strong>中位数采样</strong> 更抗离群噪点；<strong>中心加权</strong> 更重视格子中心；<strong>边缘保留</strong> 偏向线稿轮廓；<strong>全局聚类</strong> 会先按整张图做颜色聚类。</>,
      <>旋转以 <strong>1°</strong> 为单位，也可以直接输入角度；转换使用旋转后的栅格像素，而不是只改变屏幕预览。</>,
      <><strong>网格预览</strong> 用来检查图片会被切成多少格；当前图层的水平/垂直像素块数决定最终 2D 网格尺寸。</>,
      <><strong>解析颜色数量</strong> 会约束当前转换候选色数量；<strong>图片容差</strong> 主要影响主色投票匹配的格内聚类。</>,
    ],
  },
  {
    title: "2D \u7ed8\u5236\u4e0e\u53f3\u952e\u83dc\u5355",
    items: [
      <>先在右侧 <strong>色卡</strong> 中选中颜色，再用 <strong>画笔</strong> 左键绘制。按住 <kbd>Shift</kbd> 时，画笔会临时变成橡皮擦。</>,
      <><strong>橡皮擦</strong> 清空单格或拖动清空；<strong>魔术橡皮擦</strong> 删除点击位置连通的同色区域；<strong>油漆桶</strong> 填充连通区域。</>,
      <><strong>取色器</strong> 左键点击 2D 格子，会把右侧色卡反向切换到该颜色；取色器不会自动切回画笔，工具只由用户主动切换。</>,
      <><strong>移动像素</strong> 会整体移动当前图层的 2D 图案，只影响当前图层。</>,
      <><strong>清空画布</strong> 会清空当前图层的所有 2D 像素和对应图片解析引用，不影响其它图层。</>,
      <><strong>中心参考线</strong> 会显示淡红色水平/垂直中心线和原点小点，只辅助定位，不改写图案。</>,
      <><strong>高亮轮廓线</strong> 默认开启，会持续给当前选中色在 2D 图案中的外轮廓描边；关闭后只隐藏这层辅助轮廓，不改变任何像素。</>,
      <><strong>X/Y 镜像绘制</strong> 会让画笔或普通橡皮在左右/上下对称位置同时生效。</>,
      <><strong>从左上到右下镜像</strong>、<strong>从右上到左下进行镜像</strong> 会沿两条对角线同步绘制；非正方形网格中，落到网格外的目标会被忽略。</>,
      <><strong>1/2 旋转绘制</strong> 会额外写入 180° 对称格；<strong>1/4 旋转绘制</strong> 会额外写入 90°、180°、270° 对称格。</>,
      <>半区镜像按钮 <strong>-x 到 x</strong>、<strong>x 到 -x</strong>、<strong>-y 到 y</strong>、<strong>y 到 -y</strong> 是一次性操作：会先清空目标半区，再把源半区完整镜像复制过去。</>,
      <>右键点击有颜色的格子，可选择 <strong>激活颜色替换为</strong>，把当前图层中同色像素替换成目标色卡。</>,
      <>右键点击有颜色的格子，也可以选择 <strong>删除激活颜色</strong>，清空当前图层中同色像素，并自动刷新右侧色卡用量状态。</>,
      <>快捷键：<kbd>Ctrl</kbd> + <kbd>Z</kbd> 撤销，<kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>Z</kbd> 重做。</>,
    ],
  },
  {
    title: "\u56fe\u5c42\u7ba1\u7406",
    items: [
      <>项目默认至少有一个 <strong>图层</strong>。当前选中的图层决定 2D 编辑、图片导入、裁剪转换、网格设置和色卡刷新作用范围。</>,
      <>点击图层行可以切换当前图层；<strong>复制</strong> 会复制该层的网格、图片状态和色卡状态；<strong>删除</strong> 不能删除最后一个图层。</>,
      <><strong>小眼睛</strong> 只控制该图层是否出现在 3D 预览中，不影响当前图层在 2D 中继续编辑。</>,
      <><strong>显示全部</strong> 会打开所有图层；<strong>仅当前</strong> 会隐藏非当前图层；<strong>自动仅当前</strong> 会在切换图层时自动隐藏其它图层。</>,
      <>按住图层行左侧的 <strong>拖拽手柄</strong> 可以调整图层顺序。列表越上方，在 3D 视图和导出堆叠中越靠上。</>,
      <>每个图层可以有自己的网格尺寸和图片状态；修改当前图层网格不会清空其它图层的 2D 内容。</>,
    ],
  },
  {
    title: "\u8272\u5361\u4e0e\u8272\u5361\u7ec4",
    items: [
      <>每个图层都有独立的 <strong>色卡组</strong>、色卡开关状态和当前选中色。切换图层时，右侧色卡会同步切换到该图层自己的状态。</>,
      <><strong>色卡组</strong> 可以新建、删除、重命名，也可以点击 <strong>恢复默认色卡</strong> 回到内置色卡。新建色卡默认启用。</>,
      <>色号字段用于拼豆编号；HEX 字段用于颜色值。右键 <strong>HEX</strong> 区域可以输入并校验 6 位十六进制颜色。</>,
      <><strong>解析颜色数量</strong> 会限制转换时使用的颜色数量：<strong>当前色卡组映射</strong> 会先从当前分组中选出最接近图片的 N 个候选色，<strong>像素自动分组</strong> 会生成 N 个 dynamic 颜色。</>,
      <>点击 <strong>刷新</strong> 只核对当前图层的 2D 用色：用到的色卡开启，没用到的关闭，并把开启项排在前面。</>,
      <>MARD 这类按字母系列分组的色卡，会在顶部自动显示 <strong>使用组</strong>，集中列出当前开启/已使用的颜色，避免在 A/F/N 等系列之间反复查找。</>,
      <>右键色卡 item 可使用 <strong>替换为</strong>，把当前图层中该颜色像素替换到目标色卡，但不删除源色卡。</>,
      <>如果替换目标原本是关闭状态，替换后会自动打开；被替换后不再使用的源色卡会在刷新后关闭。</>,
    ],
  },
  {
    title: "\u5206\u5c4f\u4e0e\u6807\u7b7e",
    items: [
      <>顶部标签可以在 <strong>图片视图</strong>、<strong>2D 视图</strong>、<strong>3D 视图</strong> 之间切换。</>,
      <>右键任意标签可选择 <strong>向左拆分</strong> 或 <strong>向右拆分</strong>，把该视图放入新的分屏窗口。</>,
      <>同一个分屏窗口里如果有多个标签，点击标签只会切换该窗口显示内容，不会新建重复视图。</>,
      <>分屏中间的分隔线可以左右拖动，用来调整每个窗口的宽度。</>,
      <>点击分屏关闭按钮会合并到左侧；当只剩一个窗口时，会自动退出分屏模式。</>,
    ],
  },
  {
    title: "3D \u9884\u89c8\u4e0e\u5bfc\u51fa",
    items: [
      <>3D 视图只显示 <strong>未隐藏图层</strong>，并按左侧图层顺序在 Z 轴堆叠：列表越上方，3D 中越靠上。</>,
      <>黑色晶格按 2D 有色格子的边界快速生成 <strong>多个条形实体</strong>，不做布尔合并；内部允许重叠面，但外部轮廓会和 2D/3D 预览保持一致。</>,
      <>点击顶部 <strong>导出 ZIP</strong> 会先打开导出选项。默认只勾选 <strong>当前图层</strong>，文件默认勾选 <strong>3MF</strong>、<strong>PNG</strong> 和 <strong>元信息 JSON</strong>，不勾选 OBJ。</>,
      <>导出选项可以选择需要下载的图层，也可以单独控制 OBJ、3MF、PNG 和 meta_data 元信息 JSON，避免 ZIP 里包含不需要的文件。</>,
      <><strong>3MF</strong> 用于 Bambu Studio 等切片软件打开；<strong>PNG</strong> 是带坐标和图例的拼豆图纸；<strong>OBJ</strong> 适合查看彩色模型。</>,
      <>勾选 <strong>元信息 JSON</strong> 时，ZIP 会包含 meta_data 中的项目配置、应用配置和 manifest，便于后续恢复或核对导出内容。</>,
      <>导出前可以在导出弹窗里再次修改图层文件名；保存对话框里改过 ZIP 文件名后，完成提示会显示最终文件名。</>,
      <>导出前建议先检查 <u>2D 颜色是否正确</u>、图层显示状态、色卡开关和 3D 堆叠顺序。</>,
    ],
  },
  {
    title: "\u5e38\u89c1\u95ee\u9898",
    items: [
      <>颜色分不清：增加 <strong>解析颜色数量</strong>，或调整 <strong>图片容差</strong>，再重新裁剪转换。</>,
      <>转换后不是想要的图案：确认当前激活的是正确图层，并检查裁剪框、旋转角度、网格数量和映射方式。</>,
      <>3D 中看不到某层：检查该图层的小眼睛是否关闭，或是否启用了 <strong>仅当前</strong>/<strong>自动仅当前</strong>。</>,
      <>色卡开关和 2D 图案不一致：点击右侧 <strong>刷新</strong>，按当前图层实际用色重新核对。</>,
      <>导出的 ZIP 文件太大：点击 <strong>导出 ZIP</strong> 后只勾选需要的图层和文件类型；通常打印只需要 <strong>3MF</strong> 和 <strong>PNG</strong>。</>,
      <>模型太松或太紧：调整 <strong>方块/栅格装配间隙</strong>。间隙越大，方块和晶格之间越松。</>,
    ],
  },
];

const DISPLAY_CELL = 14;
const SETTINGS_STORAGE_KEY = "pixel-stl-studio-settings-v3";
const EXPORT_FILE_OPTIONS_STORAGE_KEY = `${SETTINGS_STORAGE_KEY}:export-file-options`;
const EXPORT_OVERVIEW_OPTIONS_STORAGE_KEY = `${SETTINGS_STORAGE_KEY}:export-overview-options`;
const DYNAMIC_COLOR_GROUP_ID = "dynamic";
const DYNAMIC_COLOR_GROUP_NAME = "dynamic";
const LEFT_PANE_DEFAULT_WIDTH = 336;
const LEFT_PANE_MIN_WIDTH = 220;
const LEFT_PANE_MAX_WIDTH = 520;
const LEFT_PANE_COLLAPSE_THRESHOLD = 120;
const RIGHT_PANE_DEFAULT_WIDTH = 336;
const RIGHT_PANE_MIN_WIDTH = 260;
const RIGHT_PANE_MAX_WIDTH = 560;
const RIGHT_PANE_COLLAPSE_THRESHOLD = 140;
const COLLAPSED_PANE_RAIL_WIDTH = 40;
const SPLIT_PANEL_MIN_WIDTH = 240;
const PIXEL_ALGORITHMS: Array<{ value: PixelAlgorithm; label: string }> = [
  { value: "dominant-vote", label: UI.algorithmDominantVote },
  { value: "mean-sample", label: UI.algorithmMeanSample },
  { value: "median-sample", label: UI.algorithmMedianSample },
  { value: "center-weighted", label: UI.algorithmCenterWeighted },
  { value: "edge-preserve", label: UI.algorithmEdgePreserve },
  { value: "global-cluster", label: UI.algorithmGlobalCluster },
];
type ActiveView = "image" | "2d" | "3d";
type SplitSide = "left" | "right";
const CORE_VIEW_TABS: ActiveView[] = ["image", "2d", "3d"];
interface ViewGroup {
  id: string;
  tabs: ActiveView[];
  activeView: ActiveView;
}
type ZipSaveResult = { status: "saved" | "downloaded"; fileName: string } | { status: "cancelled"; fileName: string };
type ZipSaveTarget = { type: "handle"; handle: Awaited<ReturnType<SaveFilePicker>> } | { type: "download" } | { type: "cancelled" };
type ZipProgressState = { active: boolean; value: number; label: string };
type ActiveExportTask = { taskId: string; fileName: string };
type ZipCompleteNotice = { kind: "saved" | "downloaded"; fileName: string };
interface ExportFileOptions {
  includeObj: boolean;
  include3mf: boolean;
  includePatternPng: boolean;
  includeBeadPng: boolean;
  includeHammerPng: boolean;
  includeOverviewPng: boolean;
  includeMeta: boolean;
}
interface ExportOverviewOptions {
  overviewColumns: number;
}
interface ExportSelection {
  zipFileName: string;
  layerIds: string[];
  layerNames: Record<string, string>;
  includeObj: boolean;
  include3mf: boolean;
  includePatternPng: boolean;
  includeBeadPng: boolean;
  includeHammerPng: boolean;
  includeOverviewPng: boolean;
  includeMeta: boolean;
  overviewColumns: number;
}

const DEFAULT_EXPORT_FILE_OPTIONS: ExportFileOptions = {
  includeObj: false,
  include3mf: true,
  includePatternPng: true,
  includeBeadPng: true,
  includeHammerPng: true,
  includeOverviewPng: false,
  includeMeta: true,
};
const EXPORT_FILE_OPTION_KEYS = [
  "includeObj",
  "include3mf",
  "includePatternPng",
  "includeBeadPng",
  "includeHammerPng",
  "includeOverviewPng",
  "includeMeta",
] as const;
const DEFAULT_EXPORT_OVERVIEW_OPTIONS: ExportOverviewOptions = {
  overviewColumns: 2,
};
type ExportTaskStatus = {
  status: "running" | "done" | "error" | "cancelled";
  progress: number;
  label: string;
  error?: string | null;
  fileName?: string;
};

type SaveFilePicker = (options?: {
  suggestedName?: string;
  types?: Array<{ description: string; accept: Record<string, string[]> }>;
}) => Promise<{
  name?: string;
  createWritable: () => Promise<{
    write: (data: Blob) => Promise<void>;
    close: () => Promise<void>;
  }>;
}>;

interface ImageAnalysis {
  width: number;
  height: number;
  outputWidth: number;
  outputHeight: number;
  crop: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
  componentBounds: {
    left: number;
    top: number;
    right: number;
    bottom: number;
  } | null;
  components: Array<{
    count: number;
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  }>;
}

interface ImageColorAnalysis {
  colors: string[];
  image: ImageAnalysis;
}

type CropDragHandle = "move" | "left" | "top" | "right" | "bottom" | "top-left" | "top-right" | "bottom-left" | "bottom-right";
type RasterGeometry = GeometrySettings & { targetGrid?: { width: number; height: number } };
type ImageViewport = { zoom: number; offsetX: number; offsetY: number };
type ImageRotation = number;
type LayerImageUiState = {
  analysis: ImageAnalysis | null;
  dirty: boolean;
  rotation: ImageRotation;
  source: SourceImage | null;
  viewport: ImageViewport;
};
type ProjectUpdater = Project | ((current: Project) => Project);
type ThemeMode = "system" | "light" | "dark";
type ResolvedTheme = "light" | "dark";
type RasterizeResult = { grid: PixelGrid; kernelColorGrid: PixelGrid | null };
type LeftSectionId = "grid" | "model" | "layers";

interface AddColorDialog {
  color: string;
  code: string;
}

interface GroupDialog {
  name: string;
}

interface SplitContextMenu {
  view: ActiveView;
  groupId: string;
  x: number;
  y: number;
}

interface ColorContextMenu {
  colorId: string;
  x: number;
  y: number;
  openLeft: boolean;
}

interface CanvasReplaceContextMenu {
  sourceColorId: string;
  x: number;
  y: number;
  openLeft: boolean;
}

interface HexContextMenu {
  colorId: string;
  x: number;
  y: number;
  value: string;
  error: string;
}

interface HistoryState {
  past: Project[];
  future: Project[];
}

interface LayerSortState {
  layerId: string;
  originalIds: string[];
  previewIds: string[];
  pointerId: number;
  startY: number;
  currentY: number;
  moved: boolean;
}

interface TabSortState {
  groupId: string;
  view: ActiveView;
  originalTabs: ActiveView[];
  previewTabs: ActiveView[];
  pointerId: number;
  startX: number;
  currentX: number;
  moved: boolean;
}

interface AppSettingsExport {
  colorCount: number;
  mappingMode: ImageMappingMode;
  pixelAlgorithm: PixelAlgorithm;
  kernelPreview: boolean;
  mirrorX: boolean;
  mirrorY: boolean;
  theme: ThemeMode;
  leftPaneWidth: number;
  leftPaneCollapsed: boolean;
  rightPaneWidth: number;
  rightPaneCollapsed: boolean;
  autoHideInactiveLayers: boolean;
  collapsedLeftSections: Record<LeftSectionId, boolean>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPixelAlgorithm(value: unknown): value is PixelAlgorithm {
  return typeof value === "string" && PIXEL_ALGORITHMS.some((item) => item.value === value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function projectBaseName(project: Project): string {
  const name = project.layers.find((layer) => layer.sourceImage)?.sourceImage?.name.replace(/\.[^.]+$/, "") || "pixel-stl-project";
  return name.replace(/[\\/:*?"<>|]+/g, "_");
}

function safeZipBaseName(value: string, fallback = "pixel-stl-project"): string {
  const fallbackName = fallback.replace(/\.zip$/i, "").trim() || "pixel-stl-project";
  const base = (value || fallbackName)
    .trim()
    .replace(/\.zip$/i, "")
    .replace(/[\\/:*?"<>|]+/g, "_")
    .replace(/\s+/g, " ")
    .replace(/^\.+|\.+$/g, "");
  return base || fallbackName;
}

function safeZipFileName(value: string, fallback = "pixel-stl-project"): string {
  return `${safeZipBaseName(value, fallback)}.zip`;
}

function uniqueLayerName(name: string, layers: PixelLayer[], excludeId?: string): string {
  const base = name.trim() || "图层";
  const used = new Set(layers.filter((layer) => layer.id !== excludeId).map((layer) => layer.name));
  return uniqueNameFromSet(base, used);
}

function uniqueNameFromSet(name: string, used: Set<string>): string {
  const base = name.trim() || "图层";
  if (!used.has(base)) return base;
  let suffix = 2;
  let next = `${base}_${suffix}`;
  while (used.has(next)) {
    suffix += 1;
    next = `${base}_${suffix}`;
  }
  return next;
}

function gridForExport(grid: PixelGrid | undefined, fallback: PixelGrid): PixelGrid {
  const width = Math.max(1, Math.round(Number(grid?.width) || fallback.width || 24));
  const height = Math.max(1, Math.round(Number(grid?.height) || fallback.height || 24));
  const cells = Array.isArray(grid?.cells) ? grid.cells : [];
  return {
    width,
    height,
    cells: Array.from({ length: width * height }, (_, index) => {
      const cell = cells[index];
      return typeof cell === "string" && cell.trim() ? cell : null;
    }),
  };
}

function mirrorGridX(grid: PixelGrid): PixelGrid {
  const cells = Array.from({ length: grid.width * grid.height }, (_, index) => {
    const x = index % grid.width;
    const y = Math.floor(index / grid.width);
    return grid.cells[y * grid.width + (grid.width - 1 - x)] ?? null;
  });
  return { ...grid, cells };
}

function mirrorGridY(grid: PixelGrid): PixelGrid {
  const cells = Array.from({ length: grid.width * grid.height }, (_, index) => {
    const x = index % grid.width;
    const y = Math.floor(index / grid.width);
    return grid.cells[(grid.height - 1 - y) * grid.width + x] ?? null;
  });
  return { ...grid, cells };
}

function mirrorLayer(layer: PixelLayer, mirrorX = false, mirrorY = false): PixelLayer {
  const grid = mirrorY ? mirrorGridY(mirrorX ? mirrorGridX(layer.grid) : layer.grid) : mirrorX ? mirrorGridX(layer.grid) : layer.grid;
  const kernelSource =
    layer.kernelColorGrid && layer.kernelColorGrid.width === layer.grid.width && layer.kernelColorGrid.height === layer.grid.height
      ? layer.kernelColorGrid
      : null;
  const kernelColorGrid = kernelSource ? (mirrorY ? mirrorGridY(mirrorX ? mirrorGridX(kernelSource) : kernelSource) : mirrorX ? mirrorGridX(kernelSource) : kernelSource) : layer.kernelColorGrid;
  return {
    ...layer,
    grid,
    kernelColorGrid,
  };
}

function projectWithExportLayerNames(project: Project, selection: ExportSelection): Project {
  const selectedLayerIds = new Set(selection.layerIds);
  const usedNames = new Set<string>();
  const layers = project.layers.filter((layer) => selectedLayerIds.has(layer.id)).map((layer, index) => {
    const requested = selection.layerNames[layer.id]?.trim() || layer.name;
    const name = uniqueNameFromSet(requested, usedNames);
    usedNames.add(name);
    return { ...layer, id: `${layer.id || "layer"}__export_${index + 1}`, name };
  });
  const active = layers.find((layer) => layer.id === project.activeLayerId) ?? layers[0];
  return {
    ...project,
    layers,
    activeLayerId: active?.id ?? project.activeLayerId,
    colorGroups: active?.colorGroups ?? project.colorGroups,
    activeColorGroupId: active?.activeColorGroupId ?? project.activeColorGroupId,
    imageColorGroup: active?.imageColorGroup ?? project.imageColorGroup,
  };
}

function projectForExport(project: Project, mirrorX = false, mirrorY = false): Project {
  const fallbackGrid = project.layers.find((layer) => Array.isArray(layer.grid?.cells))?.grid ?? createBlankGrid();
  const layers = project.layers.length > 0 ? project.layers : [createPixelLayer("Layer 1", fallbackGrid)];
  const normalizedLayers = layers.map((sourceLayer, index) => {
    const layer = mirrorX || mirrorY ? mirrorLayer(sourceLayer, mirrorX, mirrorY) : sourceLayer;
    const grid = gridForExport(layer.grid, fallbackGrid);
    const kernelColorGrid =
      layer.kernelColorGrid && Array.isArray(layer.kernelColorGrid.cells) ? gridForExport(layer.kernelColorGrid, grid) : null;
    const colorGroups = layer.colorGroups?.length
      ? mergeWithDefaultColorGroups(layer.colorGroups)
      : mergeWithDefaultColorGroups(project.colorGroups?.length ? project.colorGroups : DEFAULT_COLOR_GROUPS);
    const activeColorGroupId = colorGroups.some((group) => group.id === layer.activeColorGroupId) ? layer.activeColorGroupId : colorGroups[0]?.id ?? "";
    const activeGroup = colorGroups.find((group) => group.id === activeColorGroupId) ?? colorGroups[0];
    return {
      ...layer,
      id: layer.id || `layer-${index + 1}`,
      name: layer.name?.trim() || `Layer ${index + 1}`,
      visible: layer.visible !== false,
      colorGroups,
      activeColorGroupId,
      imageColorGroup: layer.imageColorGroup ? { ...layer.imageColorGroup, colors: cloneColors(layer.imageColorGroup.colors) } : null,
      selectedColorId: activeGroup?.colors.some((color) => color.id === layer.selectedColorId) ? layer.selectedColorId : activeGroup?.colors[0]?.id ?? "",
      grid,
      kernelColorGrid: kernelColorGrid && kernelColorGrid.width === grid.width && kernelColorGrid.height === grid.height ? kernelColorGrid : null,
    };
  });
  const activeLayerId = normalizedLayers.some((layer) => layer.id === project.activeLayerId) ? project.activeLayerId : normalizedLayers[0].id;
  const active = normalizedLayers.find((layer) => layer.id === activeLayerId) ?? normalizedLayers[0];
  return {
    ...project,
    version: 1,
    layers: normalizedLayers,
    activeLayerId,
    colorGroups: active.colorGroups,
    activeColorGroupId: active.activeColorGroupId,
    imageColorGroup: active.imageColorGroup,
    editor: { ...project.editor, selectedColorId: active.selectedColorId },
  };
}

function projectForLocalStorage(project: Project): Project {
  const normalized = projectForExport(project);
  return {
    ...normalized,
    layers: normalized.layers.map((layer) => ({
      ...layer,
      sourceImage: null,
    })),
  };
}

function makeColor(): BeadColor {
  const code = `C${Date.now().toString(36).slice(-4).toUpperCase()}`;
  return {
    id: `bead-${Date.now().toString(36)}`,
    name: UI.newBead,
    code,
    hex: "#38bdf8",
    enabled: true,
    displayUsed: true,
  };
}

function toolLabel(tool: ToolMode): string {
  if (tool === "brush") return UI.brush;
  if (tool === "eraser") return UI.eraser;
  if (tool === "magic-eraser") return UI.magicEraser;
  if (tool === "paint-bucket") return UI.paintBucket;
  if (tool === "picker") return UI.picker;
  if (tool === "move") return UI.movePixels;
  return UI.panView;
}

function defaultExportSelection(project: Project): ExportSelection {
  const activeLayer = project.layers.find((layer) => layer.id === project.activeLayerId) ?? project.layers[0];
  const fileOptions = readExportFileOptions();
  const overviewOptions = readExportOverviewOptions();
  return {
    zipFileName: safeZipBaseName(projectBaseName(project)),
    layerIds: activeLayer ? [activeLayer.id] : [],
    layerNames: Object.fromEntries(project.layers.map((layer) => [layer.id, layer.name])),
    ...fileOptions,
    ...overviewOptions,
  };
}

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

async function requestZipSaveTarget(fileName: string): Promise<ZipSaveTarget> {
  const picker = (window as Window & { showSaveFilePicker?: SaveFilePicker }).showSaveFilePicker;
  if (picker) {
    try {
      const handle = await picker({
        suggestedName: fileName,
        types: [
          {
            description: "ZIP",
            accept: { "application/zip": [".zip"] },
          },
        ],
      });
      return { type: "handle", handle };
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return { type: "cancelled" };
      return { type: "download" };
    }
  }
  return { type: "download" };
}

function zipSaveTargetFileName(target: ZipSaveTarget, fallback: string): string {
  if (target.type === "handle") return target.handle.name || fallback;
  return fallback;
}

async function writeZipBlob(target: ZipSaveTarget, blob: Blob, fileName: string): Promise<ZipSaveResult> {
  if (target.type === "cancelled") return { status: "cancelled", fileName };
  if (target.type === "handle") {
    const finalFileName = target.handle.name || fileName;
    try {
      const writable = await target.handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return { status: "saved", fileName: finalFileName };
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return { status: "cancelled", fileName: finalFileName };
      downloadBlob(blob, finalFileName);
      return { status: "downloaded", fileName: finalFileName };
    }
  }
  downloadBlob(blob, fileName);
  return { status: "downloaded", fileName };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function parseApiError(response: Response): Promise<string> {
  const payload = await response.json().catch(() => null);
  return payload?.error || `${response.status} ${response.statusText}`;
}

async function fetchPromptText(): Promise<string> {
  const response = await fetch("/api/prompt");
  if (!response.ok) throw new Error(await parseApiError(response));
  const payload = (await response.json()) as { prompt?: string };
  if (typeof payload.prompt !== "string" || !payload.prompt.trim()) throw new Error("Prompt unavailable");
  return payload.prompt;
}

async function copyTextToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.top = "-9999px";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  document.body.removeChild(textarea);
  if (!copied) throw new Error("Clipboard unavailable");
}

async function startExportTask(project: Project, appSettings: AppSettingsExport, fileName: string, exportOptions: ExportSelection): Promise<{ taskId: string }> {
  const response = await fetch("/api/export/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ project, appSettings, fileName, exportOptions }),
  });
  if (!response.ok) throw new Error(await parseApiError(response));
  return (await response.json()) as { taskId: string };
}

async function readExportStatus(taskId: string): Promise<ExportTaskStatus> {
  const response = await fetch(`/api/export/status/${encodeURIComponent(taskId)}`);
  if (!response.ok) throw new Error(await parseApiError(response));
  return (await response.json()) as ExportTaskStatus;
}

async function downloadExportTask(taskId: string): Promise<Blob> {
  const response = await fetch(`/api/export/download/${encodeURIComponent(taskId)}`);
  if (!response.ok) throw new Error(await parseApiError(response));
  return response.blob();
}

async function cancelExportTask(taskId: string): Promise<void> {
  const response = await fetch(`/api/export/cancel/${encodeURIComponent(taskId)}`, { method: "POST" });
  if (!response.ok) throw new Error(await parseApiError(response));
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("File read failed"));
    };
    reader.onerror = () => reject(reader.error ?? new Error("File read failed"));
    reader.readAsDataURL(file);
  });
}

function isSupportedImageFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return file.type.startsWith("image/") || /\.(png|jpe?g|webp|gif|bmp|avif)$/i.test(name);
}

function imageFileFromClipboard(event: ClipboardEvent): File | null {
  const items = Array.from(event.clipboardData?.items ?? []);
  for (const item of items) {
    if (!item.type.startsWith("image/")) continue;
    const file = item.getAsFile();
    if (!file) continue;
    const extension = item.type.split("/")[1]?.replace("jpeg", "jpg") || "png";
    return new File([file], file.name || `pasted-image.${extension}`, { type: file.type || item.type });
  }
  const files = Array.from(event.clipboardData?.files ?? []);
  return files.find((file) => isSupportedImageFile(file)) ?? null;
}

function isEditablePasteTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(target.closest("input, textarea, select, [contenteditable='true'], [contenteditable='']"));
}

function normalizeImageRotation(rotation: number): ImageRotation {
  return ((Math.round(rotation) % 360) + 360) % 360;
}

function loadSourceImage(sourceImage: SourceImage): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const width = image.naturalWidth || image.width;
      const height = image.naturalHeight || image.height;
      if (width > 0 && height > 0) resolve(image);
      else reject(new Error("图片尺寸无效"));
    };
    image.onerror = () => reject(new Error("图片解码失败，请使用 PNG、JPG 或 WebP"));
    image.src = sourceImage.dataUrl;
  });
}

async function sourceImageSize(sourceImage: SourceImage): Promise<{ width: number; height: number }> {
  const image = await loadSourceImage(sourceImage);
  return {
    width: image.naturalWidth || image.width,
    height: image.naturalHeight || image.height,
  };
}

function rotateSourceImage(sourceImage: SourceImage, rotation: ImageRotation): Promise<SourceImage> {
  const normalized = normalizeImageRotation(rotation);
  if (normalized === 0) return Promise.resolve(sourceImage);

  return loadSourceImage(sourceImage).then((image) => {
    const sourceWidth = image.naturalWidth || image.width;
    const sourceHeight = image.naturalHeight || image.height;
    if (sourceWidth <= 0 || sourceHeight <= 0) {
      throw new Error("Invalid image size");
    }

    const radians = (normalized * Math.PI) / 180;
    const cos = Math.abs(Math.cos(radians));
    const sin = Math.abs(Math.sin(radians));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.ceil(sourceWidth * cos + sourceHeight * sin));
    canvas.height = Math.max(1, Math.ceil(sourceWidth * sin + sourceHeight * cos));
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Canvas unavailable");
    }

    context.translate(canvas.width / 2, canvas.height / 2);
    context.rotate(radians);
    context.drawImage(image, -sourceWidth / 2, -sourceHeight / 2);
    return { name: sourceImage.name, dataUrl: canvas.toDataURL("image/png") };
  });
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const bodyJson = JSON.stringify(body);
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: bodyJson,
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        const message = payload?.error || `${response.status} ${response.statusText}`;
        if (![502, 503, 504].includes(response.status) || attempt === 2) throw new Error(message);
        lastError = new Error(message);
      } else {
        return (await response.json()) as T;
      }
    } catch (error) {
      lastError = error;
      if (attempt === 2) break;
    }
    await new Promise((resolve) => window.setTimeout(resolve, 350 + attempt * 450));
  }
  throw lastError instanceof Error ? lastError : new Error("Request failed");
}

function sanitizeGeometry(geometry: GeometrySettings): GeometrySettings {
  const blockSize = clamp(Number(geometry.blockSize) || 10, 0.5, 100);
  const gridLineWidth = clamp(Number(geometry.gridLineWidth) || 1, 0.05, blockSize * 0.9);
  const maxGap = Math.max(0, (blockSize - gridLineWidth) / 2 - 0.05);
  return {
    blockSize,
    fitGap: clamp(Number(geometry.fitGap) || 0.05, 0, maxGap),
    blockHeight: clamp(Number(geometry.blockHeight) || 10.5, 0.1, 100),
    plateHeight: clamp(Number(geometry.plateHeight) || 10, 0.1, 100),
    blockChamfer: clamp(Number(geometry.blockChamfer) || 0.5, 0, blockSize / 2),
    gridLineWidth,
    alphaThreshold: clamp(Math.round(Number(geometry.alphaThreshold) || 0), 0, 255),
    componentTolerance: clamp(Math.round(Number(geometry.componentTolerance) || 0), 0, 1000000),
    imageTolerance: clamp(Number(geometry.imageTolerance) || 0, 0, 80),
    cropLeft: clamp(Math.round(Number(geometry.cropLeft) || 0), 0, 1000000),
    cropTop: clamp(Math.round(Number(geometry.cropTop) || 0), 0, 1000000),
    cropRight: clamp(Math.round(Number(geometry.cropRight) || 0), 0, 1000000),
    cropBottom: clamp(Math.round(Number(geometry.cropBottom) || 0), 0, 1000000),
    maxGridSize: clamp(Math.round(Number(geometry.maxGridSize) || 64), 8, 128),
  };
}

function applyStoredSettings(project: Project): Project {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return project;
    const parsed = parseProject(raw);
    return {
      ...parsed,
      geometry: sanitizeGeometry(parsed.geometry),
    };
  } catch {
    safeRemoveLocalStorage(SETTINGS_STORAGE_KEY);
    return project;
  }
}

function centeredEditor(editor: Project["editor"], grid: PixelGrid, canvas: HTMLCanvasElement | null): Project["editor"] {
  const cellSize = DISPLAY_CELL * editor.zoom;
  const rect = canvas?.getBoundingClientRect();
  const width = rect?.width && rect.width > 0 ? rect.width : 900;
  const height = rect?.height && rect.height > 0 ? rect.height : 700;
  return {
    ...editor,
    offsetX: Math.round((width - grid.width * cellSize) / 2),
    offsetY: Math.round((height - grid.height * cellSize) / 2),
  };
}

function imageGroupFromColors(colors: string[]): BeadColorGroup {
  return {
    id: DYNAMIC_COLOR_GROUP_ID,
    name: DYNAMIC_COLOR_GROUP_NAME,
    colors: colors.map((hex, index) => ({
      id: `${DYNAMIC_COLOR_GROUP_ID}-color-${index}-${normalizeHex(hex).slice(1)}`,
      code: `D${index + 1}`,
      name: `D${index + 1}`,
      hex: normalizeHex(hex),
      enabled: true,
      displayUsed: true,
    })),
  };
}

function safeSetLocalStorage(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (error) {
    if (error instanceof DOMException && error.name === "QuotaExceededError") {
      try {
        localStorage.removeItem(key);
        localStorage.setItem(key, value);
        return true;
      } catch {
        return false;
      }
    }
    console.warn("Failed to write localStorage", error);
    return false;
  }
}

function safeRemoveLocalStorage(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Ignore storage cleanup failures.
  }
}

function readExportFileOptions(): ExportFileOptions {
  try {
    const raw = localStorage.getItem(EXPORT_FILE_OPTIONS_STORAGE_KEY);
    if (!raw) {
      safeSetLocalStorage(EXPORT_FILE_OPTIONS_STORAGE_KEY, JSON.stringify(DEFAULT_EXPORT_FILE_OPTIONS));
      return { ...DEFAULT_EXPORT_FILE_OPTIONS };
    }
    const parsed = JSON.parse(raw) as Partial<Record<keyof ExportFileOptions, unknown>>;
    const next = { ...DEFAULT_EXPORT_FILE_OPTIONS };
    for (const key of EXPORT_FILE_OPTION_KEYS) {
      if (typeof parsed[key] === "boolean") next[key] = parsed[key];
    }
    return next;
  } catch {
    safeSetLocalStorage(EXPORT_FILE_OPTIONS_STORAGE_KEY, JSON.stringify(DEFAULT_EXPORT_FILE_OPTIONS));
    return { ...DEFAULT_EXPORT_FILE_OPTIONS };
  }
}

function writeExportFileOptions(options: ExportFileOptions): void {
  safeSetLocalStorage(EXPORT_FILE_OPTIONS_STORAGE_KEY, JSON.stringify(options));
}

function readExportOverviewOptions(): ExportOverviewOptions {
  try {
    const raw = localStorage.getItem(EXPORT_OVERVIEW_OPTIONS_STORAGE_KEY);
    if (!raw) {
      safeSetLocalStorage(EXPORT_OVERVIEW_OPTIONS_STORAGE_KEY, JSON.stringify(DEFAULT_EXPORT_OVERVIEW_OPTIONS));
      return { ...DEFAULT_EXPORT_OVERVIEW_OPTIONS };
    }
    const parsed = JSON.parse(raw) as Partial<Record<keyof ExportOverviewOptions, unknown>>;
    const columnsValue = Number(parsed.overviewColumns);
    const overviewColumns = Number.isFinite(columnsValue) ? clamp(Math.round(columnsValue), 1, 6) : DEFAULT_EXPORT_OVERVIEW_OPTIONS.overviewColumns;
    return { overviewColumns };
  } catch {
    safeSetLocalStorage(EXPORT_OVERVIEW_OPTIONS_STORAGE_KEY, JSON.stringify(DEFAULT_EXPORT_OVERVIEW_OPTIONS));
    return { ...DEFAULT_EXPORT_OVERVIEW_OPTIONS };
  }
}

function writeExportOverviewOptions(options: ExportOverviewOptions): void {
  safeSetLocalStorage(EXPORT_OVERVIEW_OPTIONS_STORAGE_KEY, JSON.stringify(options));
}

function exportFileOptionsFromSelection(selection: ExportSelection): ExportFileOptions {
  return {
    includeObj: selection.includeObj,
    include3mf: selection.include3mf,
    includePatternPng: selection.includePatternPng,
    includeBeadPng: selection.includeBeadPng,
    includeHammerPng: selection.includeHammerPng,
    includeOverviewPng: selection.includeOverviewPng,
    includeMeta: selection.includeMeta,
  };
}

function cloneColors(colors: BeadColor[]): BeadColor[] {
  return colors.map((color) => ({ ...color }));
}

function sortColorsByDisplayUsage(colors: BeadColor[], groupId = ""): BeadColor[] {
  const orderedColors = orderColorsForDisplay(groupId, colors);
  return colors
    .map((color) => ({ color, index: orderedColors.findIndex((item) => item.id === color.id) }))
    .sort((a, b) => Number((b.color.displayUsed ?? b.color.enabled)) - Number((a.color.displayUsed ?? a.color.enabled)) || a.index - b.index)
    .map((item) => item.color);
}

function layerActiveColorGroup(layer: PixelLayer): BeadColorGroup | null {
  return layer.colorGroups.find((group) => group.id === layer.activeColorGroupId) ?? layer.colorGroups[0] ?? null;
}

function layerActiveColorGroupColors(layer: PixelLayer): BeadColor[] {
  return layerActiveColorGroup(layer)?.colors ?? [];
}

function upsertColorGroup(groups: BeadColorGroup[], group: BeadColorGroup): BeadColorGroup[] {
  const nextGroup = { ...group, colors: cloneColors(group.colors) };
  if (groups.some((item) => item.id === group.id)) {
    return groups.map((item) => (item.id === group.id ? nextGroup : item));
  }
  return [...groups, nextGroup];
}

function updateActiveLayerPalette(project: Project, updater: (layer: PixelLayer) => PixelLayer): Project {
  const next = updateActiveLayer(project, updater);
  const active = getActiveLayer(next);
  return {
    ...next,
    colorGroups: active.colorGroups,
    activeColorGroupId: active.activeColorGroupId,
    imageColorGroup: active.imageColorGroup,
    editor: { ...next.editor, selectedColorId: active.selectedColorId },
  };
}

function withActiveLayerColorGroup(project: Project, colors: BeadColor[], selectedColorId?: string): Project {
  const layer = getActiveLayer(project);
  const nextColors = colors.length > 0 ? colors : layerActiveColorGroupColors(layer);
  const nextSelected =
    selectedColorId && nextColors.some((color) => color.id === selectedColorId) ? selectedColorId : nextColors[0]?.id ?? layer.selectedColorId;
  const nextGroups = layer.colorGroups.map((group) => (group.id === layer.activeColorGroupId ? { ...group, colors: nextColors } : group));
  return updateActiveLayerPalette(project, (active) => ({
    ...active,
    colorGroups: nextGroups,
    selectedColorId: nextSelected,
  }));
}

function colorDistanceSquared(aHex: string, bHex: string): number {
  const a = hexToRgb(aHex);
  const b = hexToRgb(bHex);
  return (a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2;
}

function colorsForMapping(colors: BeadColor[]): BeadColor[] {
  const enabled = colors.filter((color) => color.enabled);
  return enabled.length > 0 ? enabled : colors;
}

function colorsForRasterizePalette(colors: BeadColor[]): BeadColor[] {
  return colors.map((color) => ({ ...color, enabled: true }));
}

function nearestColor(hex: string, colors: BeadColor[]): BeadColor | null {
  const candidates = colors;
  if (candidates.length === 0) return null;
  return candidates.slice().sort((a, b) => colorDistanceSquared(hex, a.hex) - colorDistanceSquared(hex, b.hex))[0] ?? null;
}

function limitedPaletteMappingColors(colors: BeadColor[], referenceHexes: string[], limit: number): BeadColor[] {
  const candidates = colorsForRasterizePalette(colors);
  const safeLimit = clamp(Math.round(limit) || candidates.length, 1, Math.max(1, candidates.length));
  if (candidates.length <= safeLimit || referenceHexes.length === 0) return candidates;

  const scored = new Map<string, { color: BeadColor; count: number; distance: number; index: number }>();
  candidates.forEach((color, index) => {
    scored.set(color.id, { color, count: 0, distance: 0, index });
  });

  for (const hex of referenceHexes) {
    const nearest = nearestColor(hex, candidates);
    if (!nearest) continue;
    const score = scored.get(nearest.id);
    if (!score) continue;
    score.count += 1;
    score.distance += colorDistanceSquared(hex, nearest.hex);
  }

  const selected = Array.from(scored.values())
    .filter((score) => score.count > 0)
    .sort((a, b) => b.count - a.count || a.distance / a.count - b.distance / b.count || a.index - b.index)
    .slice(0, safeLimit)
    .map((score) => score.color);

  if (selected.length >= safeLimit) return selected;
  const selectedIds = new Set(selected.map((color) => color.id));
  return [...selected, ...candidates.filter((color) => !selectedIds.has(color.id)).slice(0, safeLimit - selected.length)];
}

function syncColorEnabled(colors: BeadColor[], cells: Array<string | null>, groupId = ""): BeadColor[] {
  const used = new Set(cells.filter((cell): cell is string => Boolean(cell)));
  return sortColorsByDisplayUsage(
    colors.map((color) => ({
      ...color,
      enabled: used.has(color.id),
      displayUsed: used.has(color.id),
    })),
    groupId,
  );
}

function enableAllColors(colors: BeadColor[]): BeadColor[] {
  return colors.map((color) => ({ ...color, enabled: true, displayUsed: true }));
}

function layerImageGeometry(project: Project, layer: PixelLayer): GeometrySettings {
  return sanitizeGeometry({
    ...project.geometry,
    ...layer.imageCrop,
    imageTolerance: layer.imageTolerance,
  });
}

function hideInactiveLayersInProject(project: Project): Project {
  return {
    ...project,
    layers: project.layers.map((layer) => ({ ...layer, visible: layer.id === project.activeLayerId })),
  };
}

function referenceGridFromLayer(project: Project, layer: PixelLayer): PixelGrid | null {
  if (layer.kernelColorGrid && layer.kernelColorGrid.width === layer.grid.width && layer.kernelColorGrid.height === layer.grid.height) {
    return layer.kernelColorGrid;
  }
  const colorMap = new Map(layerActiveColorGroupColors(layer).map((color) => [color.id, color.hex]));
  return {
    width: layer.grid.width,
    height: layer.grid.height,
    cells: layer.grid.cells.map((cell) => (cell ? colorMap.get(cell) ?? null : null)),
  };
}

function remapGridToColorGroup(project: Project, nextGroup: BeadColorGroup): Project {
  const fallback = colorsForMapping(nextGroup.colors)[0] ?? nextGroup.colors[0] ?? null;
  const cache = new Map<string, string | null>();
  const layer = getActiveLayer(project);
  const referenceGrid = referenceGridFromLayer(project, layer);
  const cells = layer.grid.cells.map((cell, index) => {
    if (!cell) return null;
    const sourceHex = referenceGrid?.cells[index];
    if (!sourceHex) return fallback?.id ?? null;
    if (cache.has(sourceHex)) return cache.get(sourceHex) ?? null;
    const replacement = nearestColor(sourceHex, nextGroup.colors) ?? fallback;
    const replacementId = replacement?.id ?? null;
    cache.set(sourceHex, replacementId);
    return replacementId;
  });
  const selectedColor = fallback ? nearestColor(fallback.hex, nextGroup.colors) ?? fallback : null;
  const nextColors = enableAllColors(nextGroup.colors);
  const nextSelectedColorId = cells.find((cell): cell is string => Boolean(cell)) ?? selectedColor?.id ?? "";
  return updateActiveLayerPalette(project, (active) => {
    const nextGroups = active.colorGroups.map((group) => (group.id === nextGroup.id ? { ...nextGroup, colors: nextColors } : group));
    return {
      ...active,
      grid: { ...active.grid, cells },
      colorGroups: nextGroups,
      activeColorGroupId: nextGroup.id,
      selectedColorId: nextSelectedColorId,
    };
  });
}

function remapAllLayersToTheirActiveGroups(project: Project): Project {
  const layers = project.layers.map((layer) => {
    const nextGroup = layerActiveColorGroup(layer);
    if (!nextGroup) return layer;
    const fallback = colorsForMapping(nextGroup.colors)[0] ?? nextGroup.colors[0] ?? null;
    const cache = new Map<string, string | null>();
    const referenceGrid = referenceGridFromLayer(project, layer);
    const cells = layer.grid.cells.map((cell, index) => {
      if (!cell) return null;
      const sourceHex = referenceGrid?.cells[index];
      if (!sourceHex) return fallback?.id ?? null;
      if (cache.has(sourceHex)) return cache.get(sourceHex) ?? null;
      const replacement = nearestColor(sourceHex, nextGroup.colors) ?? fallback;
      const replacementId = replacement?.id ?? null;
      cache.set(sourceHex, replacementId);
      return replacementId;
    });
    return { ...layer, grid: { ...layer.grid, cells } };
  });
  return {
    ...project,
    layers,
  };
}

function withSyncedActiveColorUsage(project: Project): Project {
  const layer = getActiveLayer(project);
  const group = layerActiveColorGroup(layer);
  const nextColors = syncColorEnabled(group?.colors ?? [], layer.grid.cells, group?.id);
  const selectedColorId = nextColors.some((color) => color.id === layer.selectedColorId && color.enabled)
    ? layer.selectedColorId
    : nextColors.find((color) => color.enabled)?.id ?? nextColors[0]?.id ?? "";
  return withActiveLayerColorGroup(project, nextColors, selectedColorId);
}

function withSyncedLayerColorUsage(project: Project, layerId: string): Project {
  const target = project.layers.find((layer) => layer.id === layerId);
  if (!target) return project;
  const group = layerActiveColorGroup(target);
  const nextColors = syncColorEnabled(group?.colors ?? [], target.grid.cells, group?.id);
  const selectedColorId = nextColors.some((color) => color.id === target.selectedColorId && color.enabled)
    ? target.selectedColorId
    : nextColors.find((color) => color.enabled)?.id ?? nextColors[0]?.id ?? "";
  const layers = project.layers.map((layer) => {
    if (layer.id !== layerId) return layer;
    const colorGroups = layer.colorGroups.map((group) => (group.id === layer.activeColorGroupId ? { ...group, colors: nextColors } : group));
    return { ...layer, colorGroups, selectedColorId };
  });
  if (project.activeLayerId !== layerId) return { ...project, layers };
  const active = layers.find((layer) => layer.id === layerId) ?? target;
  return {
    ...project,
    layers,
    colorGroups: active.colorGroups,
    activeColorGroupId: active.activeColorGroupId,
    imageColorGroup: active.imageColorGroup,
    editor: { ...project.editor, selectedColorId },
  };
}

function setKernelHexCell(project: Project, layer: PixelLayer, x: number, y: number, hex: string | null): PixelGrid | null {
  const base = referenceGridFromLayer(project, layer);
  if (!base || !isInsideGrid(base, x, y)) return base;
  return setCell(base, x, y, hex ? normalizeHex(hex) : null);
}

function setKernelHexCells(project: Project, layer: PixelLayer, cells: Array<{ x: number; y: number }>, hex: string | null): PixelGrid | null {
  const base = referenceGridFromLayer(project, layer);
  if (!base) return base;
  const next = base.cells.slice();
  let changed = false;
  const value = hex ? normalizeHex(hex) : null;
  for (const cell of cells) {
    if (!isInsideGrid(base, cell.x, cell.y)) continue;
    next[gridIndex(base, cell.x, cell.y)] = value;
    changed = true;
  }
  return changed ? { ...base, cells: next } : base;
}

type PixelTransformMode = "negative-x-to-positive-x" | "positive-x-to-negative-x" | "negative-y-to-positive-y" | "positive-y-to-negative-y";

function transformedGrid(grid: PixelGrid, mode: PixelTransformMode): PixelGrid {
  const cells = grid.cells.slice();
  const mirrorX = (x: number) => grid.width - 1 - x;
  const mirrorY = (y: number) => grid.height - 1 - y;

  if (mode === "negative-x-to-positive-x" || mode === "positive-x-to-negative-x") {
    const sourceIsNegative = mode === "negative-x-to-positive-x";
    for (let y = 0; y < grid.height; y += 1) {
      for (let x = 0; x < grid.width; x += 1) {
        const targetX = mirrorX(x);
        if (targetX === x) continue;
        const inNegativeHalf = x < targetX;
        const inPositiveHalf = x > targetX;
        const isTarget = sourceIsNegative ? inPositiveHalf : inNegativeHalf;
        if (isTarget) cells[gridIndex(grid, x, y)] = null;
      }
    }
    for (let y = 0; y < grid.height; y += 1) {
      for (let x = 0; x < grid.width; x += 1) {
        const targetX = mirrorX(x);
        if (targetX === x) continue;
        const inNegativeHalf = x < targetX;
        const inPositiveHalf = x > targetX;
        const isSource = sourceIsNegative ? inNegativeHalf : inPositiveHalf;
        if (!isSource) continue;
        cells[gridIndex(grid, targetX, y)] = grid.cells[gridIndex(grid, x, y)] ?? null;
      }
    }
    return { ...grid, cells };
  }

  const sourceIsNegative = mode === "negative-y-to-positive-y";
  for (let y = 0; y < grid.height; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      const targetY = mirrorY(y);
      if (targetY === y) continue;
      const inPositiveHalf = y < targetY;
      const inNegativeHalf = y > targetY;
      const isTarget = sourceIsNegative ? inPositiveHalf : inNegativeHalf;
      if (isTarget) cells[gridIndex(grid, x, y)] = null;
    }
  }
  for (let y = 0; y < grid.height; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      const targetY = mirrorY(y);
      if (targetY === y) continue;
      const inPositiveHalf = y < targetY;
      const inNegativeHalf = y > targetY;
      const isSource = sourceIsNegative ? inNegativeHalf : inPositiveHalf;
      if (!isSource) continue;
      cells[gridIndex(grid, x, targetY)] = grid.cells[gridIndex(grid, x, y)] ?? null;
    }
  }
  return { ...grid, cells };
}

function targetCellsForPaint(x: number, y: number, grid: PixelGrid, modifiers: EditorModifiers): Array<{ x: number; y: number }> {
  if (!isInsideGrid(grid, x, y)) return [];
  const targets = new Map<string, { x: number; y: number }>();
  const add = (nextX: number, nextY: number) => {
    if (!isInsideGrid(grid, nextX, nextY)) return;
    targets.set(`${nextX}:${nextY}`, { x: nextX, y: nextY });
  };
  const mirrorX = (nextX: number) => grid.width - 1 - nextX;
  const mirrorY = (nextY: number) => grid.height - 1 - nextY;
  const centerX = (grid.width - 1) / 2;
  const centerY = (grid.height - 1) / 2;
  const diagonalSpaceSize = Math.min(grid.width, grid.height);
  const diagonalOffsetX = (grid.width - diagonalSpaceSize) / 2;
  const diagonalOffsetY = (grid.height - diagonalSpaceSize) / 2;
  const addDiagonalGreenMirror = (nextX: number, nextY: number) => {
    const localX = nextX - diagonalOffsetX;
    const localY = nextY - diagonalOffsetY;
    add(Math.round(localY + diagonalOffsetX), Math.round(localX + diagonalOffsetY));
  };
  const addDiagonalPurpleMirror = (nextX: number, nextY: number) => {
    const localX = nextX - diagonalOffsetX;
    const localY = nextY - diagonalOffsetY;
    const max = diagonalSpaceSize - 1;
    add(Math.round(max - localY + diagonalOffsetX), Math.round(max - localX + diagonalOffsetY));
  };

  add(x, y);
  if (modifiers.mirrorDrawX) add(mirrorX(x), y);
  if (modifiers.mirrorDrawY) add(x, mirrorY(y));
  if (modifiers.mirrorDrawDiagonalGreen) addDiagonalGreenMirror(x, y);
  if (modifiers.mirrorDrawDiagonalPurple) addDiagonalPurpleMirror(x, y);
  if (modifiers.rotateDrawHalf || modifiers.rotateDrawQuarter) add(mirrorX(x), mirrorY(y));
  if (modifiers.rotateDrawQuarter) {
    const dx = x - centerX;
    const dy = y - centerY;
    add(Math.round(centerX - dy), Math.round(centerY + dx));
    add(Math.round(centerX + dy), Math.round(centerY - dx));
  }
  return Array.from(targets.values());
}

function readThemeMode(): ThemeMode {
  const stored = localStorage.getItem(`${SETTINGS_STORAGE_KEY}:theme`);
  return stored === "light" || stored === "dark" || stored === "system" ? stored : "system";
}

function readLeftPaneWidth(): number {
  const stored = Number(localStorage.getItem(`${SETTINGS_STORAGE_KEY}:left-pane-width`));
  return clamp(Number.isFinite(stored) && stored > 0 ? stored : LEFT_PANE_DEFAULT_WIDTH, LEFT_PANE_MIN_WIDTH, LEFT_PANE_MAX_WIDTH);
}

function readLeftPaneCollapsed(): boolean {
  return localStorage.getItem(`${SETTINGS_STORAGE_KEY}:left-pane-collapsed`) === "true";
}

function readRightPaneWidth(): number {
  const stored = Number(localStorage.getItem(`${SETTINGS_STORAGE_KEY}:right-pane-width`));
  return clamp(Number.isFinite(stored) && stored > 0 ? stored : RIGHT_PANE_DEFAULT_WIDTH, RIGHT_PANE_MIN_WIDTH, RIGHT_PANE_MAX_WIDTH);
}

function readRightPaneCollapsed(): boolean {
  return localStorage.getItem(`${SETTINGS_STORAGE_KEY}:right-pane-collapsed`) === "true";
}

function readAutoHideInactiveLayers(): boolean {
  return localStorage.getItem(`${SETTINGS_STORAGE_KEY}:auto-hide-inactive-layers`) === "true";
}

function readMirrorX(): boolean {
  return localStorage.getItem(`${SETTINGS_STORAGE_KEY}:mirror-x`) === "true";
}

function readMirrorY(): boolean {
  return localStorage.getItem(`${SETTINGS_STORAGE_KEY}:mirror-y`) === "true";
}

function readCollapsedLeftSections(): Record<LeftSectionId, boolean> {
  try {
    const parsed = JSON.parse(localStorage.getItem(`${SETTINGS_STORAGE_KEY}:left-sections`) || "{}") as Partial<Record<LeftSectionId, boolean>>;
    return {
      grid: Boolean(parsed.grid),
      model: Boolean(parsed.model),
      layers: Boolean(parsed.layers),
    };
  } catch {
    return { grid: false, model: false, layers: false };
  }
}

function parseAppSettings(value: unknown): Partial<AppSettingsExport> {
  if (!isRecord(value)) return {};
  const next: Partial<AppSettingsExport> = {};
  if (typeof value.colorCount === "number") next.colorCount = clamp(Math.round(value.colorCount), 1, 32);
  if (value.mappingMode === "palette" || value.mappingMode === "auto") next.mappingMode = value.mappingMode;
  if (isPixelAlgorithm(value.pixelAlgorithm)) next.pixelAlgorithm = value.pixelAlgorithm;
  if (typeof value.kernelPreview === "boolean") next.kernelPreview = value.kernelPreview;
  if (typeof value.mirrorX === "boolean") next.mirrorX = value.mirrorX;
  if (typeof value.mirrorY === "boolean") next.mirrorY = value.mirrorY;
  if (value.theme === "system" || value.theme === "light" || value.theme === "dark") next.theme = value.theme;
  if (typeof value.leftPaneWidth === "number") next.leftPaneWidth = clamp(Math.round(value.leftPaneWidth), LEFT_PANE_MIN_WIDTH, LEFT_PANE_MAX_WIDTH);
  if (typeof value.leftPaneCollapsed === "boolean") next.leftPaneCollapsed = value.leftPaneCollapsed;
  if (typeof value.rightPaneWidth === "number") next.rightPaneWidth = clamp(Math.round(value.rightPaneWidth), RIGHT_PANE_MIN_WIDTH, RIGHT_PANE_MAX_WIDTH);
  if (typeof value.rightPaneCollapsed === "boolean") next.rightPaneCollapsed = value.rightPaneCollapsed;
  if (typeof value.autoHideInactiveLayers === "boolean") next.autoHideInactiveLayers = value.autoHideInactiveLayers;
  if (isRecord(value.collapsedLeftSections)) {
    next.collapsedLeftSections = {
      grid: Boolean(value.collapsedLeftSections.grid),
      model: Boolean(value.collapsedLeftSections.model),
      layers: Boolean(value.collapsedLeftSections.layers),
    };
  }
  return next;
}

function isZipFile(file: File): boolean {
  return file.name.toLowerCase().endsWith(".zip") || file.type === "application/zip" || file.type === "application/x-zip-compressed";
}

function getSystemTheme(): ResolvedTheme {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function resolveTheme(themeMode: ThemeMode, systemTheme: ResolvedTheme): ResolvedTheme {
  return themeMode === "system" ? systemTheme : themeMode;
}

function cssVar(element: Element, name: string, fallback: string): string {
  return getComputedStyle(element).getPropertyValue(name).trim() || fallback;
}

function menuPosition(clientX: number, clientY: number, width = 260, height = 260): { x: number; y: number } {
  return {
    x: clamp(clientX, 8, Math.max(8, window.innerWidth - width - 8)),
    y: clamp(clientY, 8, Math.max(8, window.innerHeight - height - 8)),
  };
}

function isViewAvailable(view: ActiveView, project: Project): boolean {
  void view;
  void project;
  return true;
}

function viewLabel(view: ActiveView): string {
  if (view === "image") return UI.viewImage;
  if (view === "2d") return UI.view2d;
  return UI.view3d;
}

function distinctViewTabs(views: ActiveView[]): ActiveView[] {
  const result: ActiveView[] = [];
  for (const view of views) {
    if (!CORE_VIEW_TABS.includes(view) || result.includes(view)) continue;
    result.push(view);
  }
  return result;
}

function coreMergedViewTabs(views: ActiveView[], project: Project): ActiveView[] {
  return distinctViewTabs([...views, ...defaultViewTabs(project)]);
}

function uniqueAvailableViews(views: ActiveView[], project: Project, fallback: ActiveView): ActiveView[] {
  const available = distinctViewTabs(views).filter((view) => isViewAvailable(view, project));
  if (available.length > 0) return available;
  return [isViewAvailable(fallback, project) ? fallback : "2d"];
}

function createViewGroup(tabs: ActiveView[], activeView: ActiveView, project: Project): ViewGroup {
  const availableTabs = uniqueAvailableViews(tabs, project, activeView);
  const safeActive = availableTabs.includes(activeView) ? activeView : availableTabs[0];
  return {
    id: `view-group-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    tabs: availableTabs,
    activeView: safeActive,
  };
}

function normalizeViewGroups(groups: ViewGroup[], project: Project, fallback: ActiveView): ViewGroup[] {
  const normalized = groups
    .map((group) => {
      const tabs = uniqueAvailableViews(group.tabs, project, group.activeView || fallback);
      const active = tabs.includes(group.activeView) ? group.activeView : tabs[0];
      return { ...group, tabs, activeView: active };
    })
    .filter((group) => group.tabs.length > 0);
  if (normalized.length > 0) return normalized;
  return [createViewGroup(defaultViewTabs(project), fallback, project)];
}

function activeGroupIndex(groups: ViewGroup[], activeView: ActiveView): number {
  const activeTabGroup = groups.findIndex((group) => group.activeView === activeView);
  if (activeTabGroup >= 0) return activeTabGroup;
  const containingGroup = groups.findIndex((group) => group.tabs.includes(activeView));
  return containingGroup >= 0 ? containingGroup : 0;
}

function groupWithView(groups: ViewGroup[], view: ActiveView, activeView: ActiveView): number {
  const activeIndex = activeGroupIndex(groups, activeView);
  if (groups[activeIndex]?.tabs.includes(view)) return activeIndex;
  const index = groups.findIndex((group) => group.tabs.includes(view));
  return index >= 0 ? index : activeIndex;
}

function defaultViewTabs(project: Project): ActiveView[] {
  return CORE_VIEW_TABS.filter((view) => isViewAvailable(view, project));
}

function percentRect(bounds: { left: number; top: number; right: number; bottom: number }, width: number, height: number) {
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);
  const left = clamp(bounds.left, 0, safeWidth);
  const top = clamp(bounds.top, 0, safeHeight);
  const right = clamp(bounds.right, left, safeWidth);
  const bottom = clamp(bounds.bottom, top, safeHeight);
  return {
    left: `${(left / safeWidth) * 100}%`,
    top: `${(top / safeHeight) * 100}%`,
    width: `${((right - left) / safeWidth) * 100}%`,
    height: `${((bottom - top) / safeHeight) * 100}%`,
  };
}

function cropRectFromGeometry(geometry: GeometrySettings, width: number, height: number) {
  const left = clamp(Math.round(geometry.cropLeft), 0, Math.max(0, width - 1));
  const top = clamp(Math.round(geometry.cropTop), 0, Math.max(0, height - 1));
  const right = clamp(width - Math.round(geometry.cropRight), left + 1, width);
  const bottom = clamp(height - Math.round(geometry.cropBottom), top + 1, height);
  return { left, top, right, bottom };
}

function geometryFromCropRect(geometry: GeometrySettings, rect: { left: number; top: number; right: number; bottom: number }, width: number, height: number): GeometrySettings {
  return sanitizeGeometry({
    ...geometry,
    cropLeft: rect.left,
    cropTop: rect.top,
    cropRight: width - rect.right,
    cropBottom: height - rect.bottom,
  });
}

function defaultLayerImageUiState(layer: PixelLayer): LayerImageUiState {
  return {
    analysis: null,
    dirty: false,
    rotation: normalizeImageRotation(layer.imageRotation),
    source: null,
    viewport: { zoom: 1, offsetX: 0, offsetY: 0 },
  };
}

function imageAnalysisFromSize(layer: PixelLayer, size: { width: number; height: number }): ImageAnalysis {
  return {
    width: size.width,
    height: size.height,
    outputWidth: layer.grid.width,
    outputHeight: layer.grid.height,
    crop: { left: 0, top: 0, width: size.width, height: size.height },
    componentBounds: null,
    components: [],
  };
}

export default function App(): JSX.Element {
  const [project, setProject] = useState<Project>(() => applyStoredSettings(createEmptyProject()));
  const [status, setStatus] = useState(UI.ready);
  const [zipProgress, setZipProgress] = useState<ZipProgressState>({ active: false, value: 0, label: "" });
  const [activeExportTask, setActiveExportTask] = useState<ActiveExportTask | null>(null);
  const [zipCompleteNotice, setZipCompleteNotice] = useState<ZipCompleteNotice | null>(null);
  const [exportDialog, setExportDialog] = useState<ExportSelection | null>(null);
  const [activeView, setActiveView] = useState<ActiveView>("2d");
  const [splitMode, setSplitMode] = useState(false);
  const exportRunRef = useRef(0);
  const [viewGroups, setViewGroups] = useState<ViewGroup[]>(() => {
    const initialProject = createEmptyProject();
    return [createViewGroup(defaultViewTabs(initialProject), "2d", initialProject)];
  });
  const [imageUiByLayer, setImageUiByLayer] = useState<Record<string, LayerImageUiState>>({});
  const [addDialog, setAddDialog] = useState<AddColorDialog | null>(null);
  const [groupDialog, setGroupDialog] = useState<GroupDialog | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const [promptCopying, setPromptCopying] = useState(false);
  const [imageDropActive, setImageDropActive] = useState(false);
  const [mappingMode, setMappingMode] = useState<ImageMappingMode>("palette");
  const [pixelAlgorithm, setPixelAlgorithmState] = useState<PixelAlgorithm>(() => {
    const stored = localStorage.getItem(`${SETTINGS_STORAGE_KEY}:pixel-algorithm`);
    return isPixelAlgorithm(stored) ? stored : "dominant-vote";
  });
  const [showKernelPreview, setShowKernelPreview] = useState(() => localStorage.getItem(`${SETTINGS_STORAGE_KEY}:kernel-preview`) === "true");
  const [mirrorX, setMirrorX] = useState(readMirrorX);
  const [colorCount, setColorCount] = useState(() => {
    const raw = localStorage.getItem(`${SETTINGS_STORAGE_KEY}:color-count`);
    return clamp(Math.round(Number(raw) || 8), 1, 32);
  });
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => readThemeMode());
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(() => getSystemTheme());
  const [hexDrafts, setHexDrafts] = useState<Record<string, string>>({});
  const [history, setHistory] = useState<HistoryState>({ past: [], future: [] });
  const [resizeTick, setResizeTick] = useState(0);
  const [leftPaneWidth, setLeftPaneWidth] = useState(readLeftPaneWidth);
  const [leftPaneCollapsed, setLeftPaneCollapsed] = useState(readLeftPaneCollapsed);
  const [rightPaneWidth, setRightPaneWidth] = useState(readRightPaneWidth);
  const [rightPaneCollapsed, setRightPaneCollapsed] = useState(readRightPaneCollapsed);
  const [autoHideInactiveLayers, setAutoHideInactiveLayers] = useState(readAutoHideInactiveLayers);
  const [mirrorY, setMirrorY] = useState(readMirrorY);
  const [splitRatios, setSplitRatios] = useState<number[]>([1]);
  const [splitContextMenu, setSplitContextMenu] = useState<SplitContextMenu | null>(null);
  const [colorContextMenu, setColorContextMenu] = useState<ColorContextMenu | null>(null);
  const [canvasReplaceContextMenu, setCanvasReplaceContextMenu] = useState<CanvasReplaceContextMenu | null>(null);
  const [hexContextMenu, setHexContextMenu] = useState<HexContextMenu | null>(null);
  const [layerSort, setLayerSort] = useState<LayerSortState | null>(null);
  const [tabSort, setTabSort] = useState<TabSortState | null>(null);
  const [collapsedLeftSections, setCollapsedLeftSections] = useState<Record<LeftSectionId, boolean>>(readCollapsedLeftSections);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const viewContentRef = useRef<HTMLDivElement | null>(null);
  const imageFrameRef = useRef<HTMLDivElement | null>(null);
  const imageStageRef = useRef<HTMLDivElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const projectZipInputRef = useRef<HTMLInputElement | null>(null);
  const layerRowRefs = useRef(new Map<string, HTMLDivElement>());
  const layerSortRef = useRef<LayerSortState | null>(null);
  const layerFlipRectsRef = useRef(new Map<string, DOMRect>());
  const tabButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const tabSortRef = useRef<TabSortState | null>(null);
  const tabFlipRectsRef = useRef(new Map<string, DOMRect>());
  const ignoreNextTabClickRef = useRef(false);
  const dragRef = useRef<{
    active: boolean;
    panView: boolean;
    lastCell: { x: number; y: number } | null;
    lastPoint: { x: number; y: number } | null;
  }>({ active: false, panView: false, lastCell: null, lastPoint: null });
  const cropDragRef = useRef<{
    handle: CropDragHandle;
    startX: number;
    startY: number;
    startGeometry: Pick<GeometrySettings, "cropLeft" | "cropTop" | "cropRight" | "cropBottom">;
  } | null>(null);
  const imagePanRef = useRef<{
    active: boolean;
    lastPoint: { x: number; y: number } | null;
  }>({ active: false, lastPoint: null });
  const historyBaseRef = useRef<Project | null>(null);
  const historyTransactionActiveRef = useRef(false);
  const projectRef = useRef(project);
  const activeViewRef = useRef<ActiveView>(activeView);
  const importFileRef = useRef<(file: File) => Promise<void>>(async () => undefined);
  const leftPaneResizeRef = useRef<{
    active: boolean;
    startX: number;
    startWidth: number;
  } | null>(null);
  const rightPaneResizeRef = useRef<{
    active: boolean;
    startX: number;
    startWidth: number;
  } | null>(null);
  const splitResizeRef = useRef<{
    index: number;
    startX: number;
    startRatios: number[];
    containerWidth: number;
  } | null>(null);

  activeViewRef.current = activeView;

  const handleCopyPrompt = useCallback(async () => {
    if (promptCopying) return;
    setPromptCopying(true);
    try {
      const prompt = await fetchPromptText();
      await copyTextToClipboard(prompt);
      setStatus(UI.copyPrompt);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "复制提示词失败");
    } finally {
      setPromptCopying(false);
    }
  }, [promptCopying]);

  const commitProject = useCallback((updater: ProjectUpdater, baseOverride?: Project) => {
    const current = projectRef.current;
    const base = baseOverride ?? current;
    const next = typeof updater === "function" ? updater(current) : updater;
    if (next === current) return;
    projectRef.current = next;
    if (baseOverride && historyTransactionActiveRef.current) {
      setProject(next);
      return;
    }
    setHistory((historyState) => ({
      past: [...historyState.past.slice(-79), base],
      future: [],
    }));
    if (baseOverride) historyTransactionActiveRef.current = true;
    setProject(next);
  }, []);

  const collectAppSettings = useCallback(
    (): AppSettingsExport => ({
      colorCount,
      mappingMode,
      pixelAlgorithm,
      kernelPreview: showKernelPreview,
      mirrorX,
      mirrorY,
      theme: themeMode,
      leftPaneWidth,
      leftPaneCollapsed,
      rightPaneWidth,
      rightPaneCollapsed,
      autoHideInactiveLayers,
      collapsedLeftSections,
    }),
    [autoHideInactiveLayers, collapsedLeftSections, colorCount, leftPaneCollapsed, leftPaneWidth, mappingMode, mirrorX, mirrorY, pixelAlgorithm, rightPaneCollapsed, rightPaneWidth, showKernelPreview, themeMode],
  );

  const applyImportedAppSettings = useCallback((settings: Partial<AppSettingsExport>) => {
    if (settings.colorCount !== undefined) setColorCount(settings.colorCount);
    if (settings.mappingMode !== undefined) setMappingMode(settings.mappingMode);
    if (settings.pixelAlgorithm !== undefined) setPixelAlgorithmState(settings.pixelAlgorithm);
    if (settings.kernelPreview !== undefined) setShowKernelPreview(settings.kernelPreview);
    if (settings.mirrorX !== undefined) setMirrorX(settings.mirrorX);
    if (settings.mirrorY !== undefined) setMirrorY(settings.mirrorY);
    if (settings.theme !== undefined) setThemeMode(settings.theme);
    if (settings.leftPaneWidth !== undefined) setLeftPaneWidth(settings.leftPaneWidth);
    if (settings.leftPaneCollapsed !== undefined) setLeftPaneCollapsed(settings.leftPaneCollapsed);
    if (settings.rightPaneWidth !== undefined) setRightPaneWidth(settings.rightPaneWidth);
    if (settings.rightPaneCollapsed !== undefined) setRightPaneCollapsed(settings.rightPaneCollapsed);
    if (settings.autoHideInactiveLayers !== undefined) setAutoHideInactiveLayers(settings.autoHideInactiveLayers);
    if (settings.collapsedLeftSections !== undefined) setCollapsedLeftSections(settings.collapsedLeftSections);
  }, []);

  const updateProjectView = useCallback((updater: ProjectUpdater) => {
    const current = projectRef.current;
    const next = typeof updater === "function" ? updater(current) : updater;
    if (next === current) return;
    projectRef.current = next;
    setProject(next);
  }, []);

  const updateLayerImageUi = useCallback((layerId: string, updater: (current: LayerImageUiState) => LayerImageUiState) => {
    setImageUiByLayer((current) => {
      const layer = projectRef.current.layers.find((item) => item.id === layerId);
      if (!layer) return current;
      const previous = current[layerId] ?? defaultLayerImageUiState(layer);
      return { ...current, [layerId]: updater(previous) };
    });
  }, []);

  const undoProject = useCallback(() => {
    setHistory((currentHistory) => {
      const previous = currentHistory.past[currentHistory.past.length - 1];
      if (!previous) return currentHistory;
      const currentProject = projectRef.current;
      projectRef.current = previous;
      setProject(previous);
      return {
        past: currentHistory.past.slice(0, -1),
        future: [currentProject, ...currentHistory.future].slice(0, 80),
      };
    });
  }, []);

  const redoProject = useCallback(() => {
    setHistory((currentHistory) => {
      const next = currentHistory.future[0];
      if (!next) return currentHistory;
      const currentProject = projectRef.current;
      projectRef.current = next;
      setProject(next);
      return {
        past: [...currentHistory.past.slice(-79), currentProject],
        future: currentHistory.future.slice(1),
      };
    });
  }, []);

  const activeLayer = useMemo(() => getActiveLayer(project), [project]);
  const activeGroup = useMemo(() => layerActiveColorGroup(activeLayer), [activeLayer]);
  const activeColors = useMemo(() => activeGroup?.colors ?? [], [activeGroup]);
  const activeColorSections = useMemo(() => colorDisplaySections(activeGroup), [activeGroup]);
  const activeDisplayColors = useMemo(() => activeColorSections.flatMap((section) => section.colors), [activeColorSections]);
  const activeColorRows = useMemo(
    () =>
      activeColorSections.flatMap((section) => [
        ...(section.label ? [{ type: "section" as const, id: `section-${section.key}`, label: section.label }] : []),
        ...section.colors.map((color) => ({ type: "color" as const, id: color.id, color })),
      ]),
    [activeColorSections],
  );
  const activeGroupColorCount = activeGroup?.colors.length ?? 0;
  const activeGroupSummary = activeGroup
    ? `${UI.groupCurrent}: ${activeGroupColorCount} ${UI.groupColorCount}${activeGroup.description ? ` · ${activeGroup.description}` : ""}`
    : UI.defaultGroup;
  const activeGrid = activeLayer.grid;
  const activeImageGeometry = useMemo(() => layerImageGeometry(project, activeLayer), [activeLayer, project.geometry]);
  const visiblePreviewLayers = useMemo(() => {
    const layers = project.layers.filter((layer) => layer.visible);
    return mirrorX || mirrorY ? layers.map((layer) => mirrorLayer(layer, mirrorX, mirrorY)) : layers;
  }, [mirrorX, mirrorY, project.layers]);
  const colorMap = useMemo(() => new Map(activeColors.map((color) => [color.id, color])), [activeColors]);
  const selectedColor = colorMap.get(activeLayer.selectedColorId) ?? activeColors[0] ?? null;
  const activeImageUi = imageUiByLayer[activeLayer.id] ?? defaultLayerImageUiState(activeLayer);
  const imageAnalysis = activeImageUi.analysis;
  const imageDirty = activeImageUi.dirty;
  const imageRotation = activeImageUi.rotation;
  const imageViewport = activeImageUi.viewport;
  const imageViewSource = activeImageUi.source ?? activeLayer.sourceImage;
  const resolvedTheme = useMemo(() => resolveTheme(themeMode, systemTheme), [systemTheme, themeMode]);
  const filledCells = useMemo(() => countFilledCells(activeGrid), [activeGrid]);
  const usedColorCount = useMemo(() => usedColorIds(activeGrid).length, [activeGrid]);
  const colorUsageCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const colorId of activeGrid.cells) {
      if (!colorId) continue;
      counts.set(colorId, (counts.get(colorId) ?? 0) + 1);
    }
    return counts;
  }, [activeGrid]);
  const activeModelMetrics = useMemo(() => {
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (let y = 0; y < activeGrid.height; y += 1) {
      for (let x = 0; x < activeGrid.width; x += 1) {
        if (!activeGrid.cells[y * activeGrid.width + x]) continue;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
    const cellsWide = Number.isFinite(minX) ? maxX - minX + 1 : activeGrid.width;
    const cellsHigh = Number.isFinite(minY) ? maxY - minY + 1 : activeGrid.height;
    const pitch = project.geometry.blockSize + project.geometry.fitGap * 2 + project.geometry.gridLineWidth;
    return {
      width: cellsWide * pitch + project.geometry.gridLineWidth,
      depth: cellsHigh * pitch + project.geometry.gridLineWidth,
      thick: Math.max(project.geometry.blockHeight, project.geometry.plateHeight),
    };
  }, [activeGrid, project.geometry]);
  const previewModelMetrics = useMemo(() => {
    const layers = visiblePreviewLayers.length > 0 ? visiblePreviewLayers : [activeLayer];
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (const layer of layers) {
      for (let y = 0; y < layer.grid.height; y += 1) {
        for (let x = 0; x < layer.grid.width; x += 1) {
          if (!layer.grid.cells[y * layer.grid.width + x]) continue;
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      }
    }
    const fallbackGrid = layers[0]?.grid ?? activeGrid;
    const cellsWide = Number.isFinite(minX) ? maxX - minX + 1 : fallbackGrid.width;
    const cellsHigh = Number.isFinite(minY) ? maxY - minY + 1 : fallbackGrid.height;
    const pitch = project.geometry.blockSize + project.geometry.fitGap * 2 + project.geometry.gridLineWidth;
    const layerStep = Math.max(project.geometry.blockHeight, project.geometry.plateHeight);
    return {
      width: cellsWide * pitch + project.geometry.gridLineWidth,
      depth: cellsHigh * pitch + project.geometry.gridLineWidth,
      thick: Math.max(project.geometry.blockHeight, project.geometry.plateHeight) + Math.max(0, layers.length - 1) * layerStep,
    };
  }, [activeGrid, activeLayer, project.geometry, visiblePreviewLayers]);

  useEffect(() => {
    try {
      const storedProject = projectForLocalStorage(project);
      const saved = safeSetLocalStorage(
        SETTINGS_STORAGE_KEY,
        JSON.stringify({
          version: 1,
          layers: storedProject.layers,
          activeLayerId: storedProject.activeLayerId,
          geometry: storedProject.geometry,
          colorGroups: activeLayer.colorGroups,
          activeColorGroupId: activeLayer.activeColorGroupId,
          imageColorGroup: activeLayer.imageColorGroup,
          editor: storedProject.editor,
        }),
      );
      if (!saved) setStatus("本地存储空间不足，已跳过自动缓存；请导出 ZIP 保存完整项目");
    } catch (error) {
      if (error instanceof DOMException && error.name === "QuotaExceededError") {
        setStatus("本地存储空间不足，图片不会写入浏览器缓存；请导出 ZIP 保存完整项目");
        return;
      }
      console.warn("Failed to persist project settings", error);
    }
  }, [
    project.activeLayerId,
    project.editor,
    project.geometry,
    project.layers,
    activeLayer.activeColorGroupId,
    activeLayer.colorGroups,
    activeLayer.imageColorGroup,
  ]);

  useEffect(() => {
    safeSetLocalStorage(`${SETTINGS_STORAGE_KEY}:color-count`, String(colorCount));
  }, [colorCount]);

  useEffect(() => {
    safeSetLocalStorage(`${SETTINGS_STORAGE_KEY}:pixel-algorithm`, pixelAlgorithm);
  }, [pixelAlgorithm]);

  useEffect(() => {
    safeSetLocalStorage(`${SETTINGS_STORAGE_KEY}:kernel-preview`, String(showKernelPreview));
  }, [showKernelPreview]);

  useEffect(() => {
    safeSetLocalStorage(`${SETTINGS_STORAGE_KEY}:mirror-x`, String(mirrorX));
  }, [mirrorX]);

  useEffect(() => {
    safeSetLocalStorage(`${SETTINGS_STORAGE_KEY}:mirror-y`, String(mirrorY));
  }, [mirrorY]);

  useEffect(() => {
    safeSetLocalStorage(`${SETTINGS_STORAGE_KEY}:theme`, themeMode);
  }, [themeMode]);

  useEffect(() => {
    safeSetLocalStorage(`${SETTINGS_STORAGE_KEY}:left-pane-width`, String(leftPaneWidth));
  }, [leftPaneWidth]);

  useEffect(() => {
    safeSetLocalStorage(`${SETTINGS_STORAGE_KEY}:left-pane-collapsed`, String(leftPaneCollapsed));
  }, [leftPaneCollapsed]);

  useEffect(() => {
    safeSetLocalStorage(`${SETTINGS_STORAGE_KEY}:right-pane-width`, String(rightPaneWidth));
  }, [rightPaneWidth]);

  useEffect(() => {
    safeSetLocalStorage(`${SETTINGS_STORAGE_KEY}:right-pane-collapsed`, String(rightPaneCollapsed));
  }, [rightPaneCollapsed]);

  useEffect(() => {
    safeSetLocalStorage(`${SETTINGS_STORAGE_KEY}:auto-hide-inactive-layers`, String(autoHideInactiveLayers));
  }, [autoHideInactiveLayers]);

  useEffect(() => {
    safeSetLocalStorage(`${SETTINGS_STORAGE_KEY}:left-sections`, JSON.stringify(collapsedLeftSections));
  }, [collapsedLeftSections]);

  useEffect(() => {
    layerSortRef.current = layerSort;
  }, [layerSort]);

  useEffect(() => {
    tabSortRef.current = tabSort;
  }, [tabSort]);

  useEffect(() => {
    if (!layerSort) return undefined;
    const handleMove = (event: PointerEvent) => {
      const state = layerSortRef.current;
      if (!state || state.pointerId !== event.pointerId) return;
      event.preventDefault();
      updateLayerDragPreview(event.clientY);
    };
    const handleUp = (event: PointerEvent) => {
      const state = layerSortRef.current;
      if (!state || state.pointerId !== event.pointerId) return;
      event.preventDefault();
      updateLayerDragPreview(event.clientY);
      finishLayerDragState(true);
    };
    const handleCancel = (event: PointerEvent) => {
      const state = layerSortRef.current;
      if (!state || state.pointerId !== event.pointerId) return;
      finishLayerDragState(false);
    };
    window.addEventListener("pointermove", handleMove, { passive: false });
    window.addEventListener("pointerup", handleUp, { passive: false });
    window.addEventListener("pointercancel", handleCancel);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleCancel);
    };
  }, [layerSort]);

  useEffect(() => {
    const previousRects = layerFlipRectsRef.current;
    if (previousRects.size === 0) return;
    for (const [id, element] of layerRowRefs.current) {
      const previous = previousRects.get(id);
      if (!previous) continue;
      const next = element.getBoundingClientRect();
      const dy = previous.top - next.top;
      if (Math.abs(dy) < 1) continue;
      element.animate(
        [
          { transform: `translateY(${dy}px)` },
          { transform: "translateY(0)" },
        ],
        { duration: 160, easing: "cubic-bezier(0.2, 0, 0, 1)" },
      );
    }
    layerFlipRectsRef.current = new Map();
  }, [layerSort?.previewIds]);

  useEffect(() => {
    if (!tabSort) return undefined;
    const handleMove = (event: PointerEvent) => {
      const state = tabSortRef.current;
      if (!state || state.pointerId !== event.pointerId) return;
      event.preventDefault();
      updateTabDragPreview(event.clientX);
    };
    const handleUp = (event: PointerEvent) => {
      const state = tabSortRef.current;
      if (!state || state.pointerId !== event.pointerId) return;
      event.preventDefault();
      updateTabDragPreview(event.clientX);
      finishTabDragState(true);
    };
    const handleCancel = (event: PointerEvent) => {
      const state = tabSortRef.current;
      if (!state || state.pointerId !== event.pointerId) return;
      finishTabDragState(false);
    };
    window.addEventListener("pointermove", handleMove, { passive: false });
    window.addEventListener("pointerup", handleUp, { passive: false });
    window.addEventListener("pointercancel", handleCancel);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleCancel);
    };
  }, [tabSort]);

  useEffect(() => {
    const previousRects = tabFlipRectsRef.current;
    if (previousRects.size === 0) return;
    for (const [key, element] of tabButtonRefs.current) {
      const previous = previousRects.get(key);
      if (!previous) continue;
      const next = element.getBoundingClientRect();
      const dx = previous.left - next.left;
      if (Math.abs(dx) < 1) continue;
      element.animate(
        [
          { transform: `translateX(${dx}px)` },
          { transform: "translateX(0)" },
        ],
        { duration: 150, easing: "cubic-bezier(0.2, 0, 0, 1)" },
      );
    }
    tabFlipRectsRef.current = new Map();
  }, [tabSort?.previewTabs]);

  useEffect(() => {
    if (!splitContextMenu) return undefined;
    const close = () => setSplitContextMenu(null);
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", close);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", close);
    };
  }, [splitContextMenu]);

  useEffect(() => {
    if (!colorContextMenu && !canvasReplaceContextMenu && !hexContextMenu) return undefined;
    const close = () => {
      setColorContextMenu(null);
      setCanvasReplaceContextMenu(null);
      setHexContextMenu(null);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [canvasReplaceContextMenu, colorContextMenu, hexContextMenu]);

  useEffect(() => {
    const query = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!query) return undefined;
    const update = () => {
      setSystemTheme(query.matches ? "dark" : "light");
      setResizeTick((tick) => tick + 1);
    };
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
    setResizeTick((tick) => tick + 1);
  }, [resolvedTheme]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && layerSortRef.current) {
        event.preventDefault();
        layerSortRef.current = null;
        setLayerSort(null);
        return;
      }
      const key = event.key.toLowerCase();
      if (!(event.ctrlKey || event.metaKey)) return;
      if (key === "z" && event.shiftKey) {
        event.preventDefault();
        redoProject();
        return;
      }
      if (key === "z") {
        event.preventDefault();
        undoProject();
        return;
      }
      if (key === "y") {
        event.preventDefault();
        redoProject();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [redoProject, undoProject]);

  const isImageViewVisible = Boolean(activeLayer.sourceImage) && viewGroups.some((group) => group.activeView === "image");
  const is2dViewVisible = viewGroups.some((group) => group.activeView === "2d");

  useEffect(() => {
    setViewGroups((current) => {
      const normalized = normalizeViewGroups(current, project, activeView);
      const next = normalized.length > 1 ? normalized : [normalized[0]];
      const nextActive = next.some((group) => group.activeView === activeView) ? activeView : next[0].activeView;
      if (nextActive !== activeView) setActiveView(nextActive);
      if (next.length <= 1) {
        setSplitMode(false);
        setSplitRatios([1]);
      } else {
        setSplitMode(true);
        syncSplitRatios(next.length);
      }
      const same =
        next.length === current.length &&
        next.every((group, index) => {
          const old = current[index];
          return old && old.id === group.id && old.activeView === group.activeView && old.tabs.length === group.tabs.length && old.tabs.every((view, tabIndex) => view === group.tabs[tabIndex]);
        });
      return same ? current : next;
    });
  }, [activeLayer.sourceImage, activeView, project, viewGroups.length]);

  useEffect(() => {
    let cancelled = false;
    const layerId = activeLayer.id;
    const layerSourceImage = activeLayer.sourceImage;
    if (!layerSourceImage) {
      updateLayerImageUi(layerId, () => defaultLayerImageUiState(activeLayer));
      return () => {
        cancelled = true;
      };
    }
    void (async () => {
      try {
        const displayed =
          activeLayer.imageRotation === 0 ? layerSourceImage : await rotateSourceImage(layerSourceImage, activeLayer.imageRotation);
        const size = await sourceImageSize(displayed);
        if (cancelled) return;
        updateLayerImageUi(layerId, (current) => ({
          ...current,
          analysis: current.analysis ? { ...current.analysis, outputWidth: activeLayer.grid.width, outputHeight: activeLayer.grid.height } : imageAnalysisFromSize(activeLayer, size),
          rotation: normalizeImageRotation(activeLayer.imageRotation),
          source: displayed,
        }));
      } catch {
        if (!cancelled) {
          updateLayerImageUi(layerId, (current) => ({
            ...current,
            analysis: null,
            rotation: normalizeImageRotation(activeLayer.imageRotation),
            source: layerSourceImage,
          }));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeLayer.grid.height, activeLayer.grid.width, activeLayer.id, activeLayer.imageRotation, activeLayer.sourceImage, updateLayerImageUi]);

  useEffect(() => {
    if (!isImageViewVisible) return undefined;
    const frame = requestAnimationFrame(() => {
      const stage = imageStageRef.current;
      const imageFrame = imageFrameRef.current;
      if (!stage || !imageFrame) return;
      const stageRect = stage.getBoundingClientRect();
      const frameRect = imageFrame.getBoundingClientRect();
      const viewportElement = stage.firstElementChild instanceof HTMLElement ? stage.firstElementChild : null;
      const originX = viewportElement?.offsetLeft ?? 0;
      const originY = viewportElement?.offsetTop ?? 0;
      const nextViewport = {
        zoom: 1,
        offsetX: Math.round((stageRect.width - frameRect.width) / 2 - originX),
        offsetY: Math.round((stageRect.height - frameRect.height) / 2 - originY),
      };
      updateLayerImageUi(activeLayer.id, (current) => ({ ...current, viewport: nextViewport }));
    });
    return () => cancelAnimationFrame(frame);
  }, [activeLayer.id, activeLayer.sourceImage?.dataUrl, imageRotation, isImageViewVisible, splitMode, updateLayerImageUi]);

  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.floor(rect.width * dpr));
    const height = Math.max(1, Math.floor(rect.height * dpr));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const shell = canvas.closest(".app-shell") ?? document.documentElement;
    const canvasBg = cssVar(shell, "--canvas-bg", "#151a21");
    const canvasBoard = cssVar(shell, "--canvas-board", "#1a2028");
    const emptyHatch = cssVar(shell, "--empty-hatch", "rgba(130, 148, 166, 0.16)");
    const gridLine = cssVar(shell, "--canvas-grid-line", "rgba(0, 0, 0, 0.58)");
    const accent = cssVar(shell, "--accent", "#66e0a3");

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);
    ctx.fillStyle = canvasBg;
    ctx.fillRect(0, 0, rect.width, rect.height);

    const cellSize = DISPLAY_CELL * project.editor.zoom;
    const gridWidth = activeGrid.width * cellSize;
    const gridHeight = activeGrid.height * cellSize;

    ctx.save();
    ctx.translate(project.editor.offsetX, project.editor.offsetY);
    ctx.fillStyle = canvasBoard;
    ctx.fillRect(-1, -1, gridWidth + 2, gridHeight + 2);

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, gridWidth, gridHeight);
    ctx.clip();
    ctx.strokeStyle = emptyHatch;
    ctx.lineWidth = 1;
    const hatchStep = Math.max(10, cellSize);
    for (let offset = -gridHeight; offset < gridWidth; offset += hatchStep) {
      ctx.beginPath();
      ctx.moveTo(offset, gridHeight);
      ctx.lineTo(offset + gridHeight, 0);
      ctx.stroke();
    }
    ctx.restore();

    for (let y = 0; y < activeGrid.height; y += 1) {
      for (let x = 0; x < activeGrid.width; x += 1) {
        const cell = activeGrid.cells[y * activeGrid.width + x];
        const color = cell ? colorMap.get(cell) : null;
        if (!color?.enabled) continue;
        const displayX = mirrorX ? activeGrid.width - 1 - x : x;
        const displayY = mirrorY ? activeGrid.height - 1 - y : y;
        ctx.fillStyle = color.hex;
        ctx.fillRect(displayX * cellSize + 1, displayY * cellSize + 1, Math.max(1, cellSize - 2), Math.max(1, cellSize - 2));
      }
    }

    const selectedColorId = activeLayer.selectedColorId;
    if (selectedColorId && project.editor.modifiers.highlightColorOutline) {
      const isSelectedCell = (x: number, y: number) =>
        x >= 0 && y >= 0 && x < activeGrid.width && y < activeGrid.height && activeGrid.cells[y * activeGrid.width + x] === selectedColorId;
      const drawSelectedOutline = (strokeStyle: string, lineWidth: number) => {
        ctx.save();
        ctx.strokeStyle = strokeStyle;
        ctx.lineWidth = lineWidth;
        ctx.lineCap = "square";
        ctx.lineJoin = "miter";
        ctx.beginPath();
        for (let y = 0; y < activeGrid.height; y += 1) {
          for (let x = 0; x < activeGrid.width; x += 1) {
            if (!isSelectedCell(x, y)) continue;
            const displayX = mirrorX ? activeGrid.width - 1 - x : x;
            const displayY = mirrorY ? activeGrid.height - 1 - y : y;
            const left = displayX * cellSize;
            const top = displayY * cellSize;
            const right = left + cellSize;
            const bottom = top + cellSize;
            const displayLeftNeighborX = mirrorX ? x + 1 : x - 1;
            const displayRightNeighborX = mirrorX ? x - 1 : x + 1;
            const displayTopNeighborY = mirrorY ? y + 1 : y - 1;
            const displayBottomNeighborY = mirrorY ? y - 1 : y + 1;
            if (!isSelectedCell(x, displayTopNeighborY)) {
              ctx.moveTo(left, top);
              ctx.lineTo(right, top);
            }
            if (!isSelectedCell(displayRightNeighborX, y)) {
              ctx.moveTo(right, top);
              ctx.lineTo(right, bottom);
            }
            if (!isSelectedCell(x, displayBottomNeighborY)) {
              ctx.moveTo(right, bottom);
              ctx.lineTo(left, bottom);
            }
            if (!isSelectedCell(displayLeftNeighborX, y)) {
              ctx.moveTo(left, bottom);
              ctx.lineTo(left, top);
            }
          }
        }
        ctx.stroke();
        ctx.restore();
      };
      const selectedOuter = resolvedTheme === "dark" ? "rgba(255, 252, 244, 0.96)" : "rgba(255, 255, 255, 0.86)";
      const selectedInner = resolvedTheme === "dark" ? "rgba(232, 236, 240, 0.92)" : "rgba(50, 57, 66, 0.88)";
      drawSelectedOutline(selectedOuter, Math.max(2, Math.min(5, cellSize * 0.18)));
      drawSelectedOutline(selectedInner, Math.max(1.5, Math.min(3, cellSize * 0.11)));
    }

    ctx.strokeStyle = gridLine;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= activeGrid.width; x += 1) {
      ctx.moveTo(x * cellSize + 0.5, 0);
      ctx.lineTo(x * cellSize + 0.5, gridHeight);
    }
    for (let y = 0; y <= activeGrid.height; y += 1) {
      ctx.moveTo(0, y * cellSize + 0.5);
      ctx.lineTo(gridWidth, y * cellSize + 0.5);
    }
    ctx.stroke();

    if (project.editor.modifiers.showCenterGuides) {
      ctx.save();
      ctx.strokeStyle = "rgba(239, 68, 68, 0.42)";
      ctx.lineWidth = Math.max(1.5, Math.min(3, cellSize * 0.08));
      ctx.setLineDash([Math.max(6, cellSize * 0.32), Math.max(4, cellSize * 0.22)]);
      const centerX = (activeGrid.width * cellSize) / 2;
      const centerY = (activeGrid.height * cellSize) / 2;
      ctx.beginPath();
      ctx.moveTo(centerX, 0);
      ctx.lineTo(centerX, gridHeight);
      ctx.moveTo(0, centerY);
      ctx.lineTo(gridWidth, centerY);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(239, 68, 68, 0.58)";
      ctx.beginPath();
      ctx.arc(centerX, centerY, Math.max(3, Math.min(6, cellSize * 0.18)), 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.78)";
      ctx.lineWidth = Math.max(1, Math.min(2, cellSize * 0.05));
      ctx.stroke();
      ctx.restore();
    }

    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, gridWidth, gridHeight);
    ctx.restore();
  }, [activeGrid, activeLayer.selectedColorId, colorMap, mirrorX, mirrorY, project.editor.modifiers.highlightColorOutline, project.editor.modifiers.showCenterGuides, project.editor.offsetX, project.editor.offsetY, project.editor.zoom, resizeTick, resolvedTheme]);

  useEffect(() => {
    if (is2dViewVisible) drawCanvas();
  }, [drawCanvas, is2dViewVisible]);

  useEffect(() => {
    if (!is2dViewVisible) return undefined;
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const observer = new ResizeObserver(() => setResizeTick((tick) => tick + 1));
    observer.observe(canvas);
    const frame = requestAnimationFrame(() => setResizeTick((tick) => tick + 1));
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [is2dViewVisible]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      updateProjectView((current) => ({ ...current, editor: centeredEditor(current.editor, getActiveLayer(current).grid, canvasRef.current) }));
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  const pointerToCell = (event: React.PointerEvent<HTMLCanvasElement> | React.WheelEvent<HTMLCanvasElement> | React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: -1, y: -1 };
    const rect = canvas.getBoundingClientRect();
    const cellSize = DISPLAY_CELL * project.editor.zoom;
    const displayX = Math.floor((event.clientX - rect.left - project.editor.offsetX) / cellSize);
    const displayY = Math.floor((event.clientY - rect.top - project.editor.offsetY) / cellSize);
    return {
      x: mirrorX ? activeGrid.width - 1 - displayX : displayX,
      y: mirrorY ? activeGrid.height - 1 - displayY : displayY,
    };
  };

  const rasterizeOnBackend = useCallback(
    async (sourceImage: SourceImage, colors: BeadColor[], geometry: RasterGeometry = project.geometry): Promise<RasterizeResult> => {
      const result = await postJson<{ grid: PixelGrid; kernelColorGrid?: PixelGrid | null }>("/api/rasterize", {
        sourceImage,
        colors,
        geometry,
        algorithm: pixelAlgorithm,
      });
      return { grid: result.grid, kernelColorGrid: result.kernelColorGrid ?? null };
    },
    [pixelAlgorithm, project.geometry],
  );

  const analyzeColorsOnBackend = useCallback(
    async (sourceImage: SourceImage, geometry: RasterGeometry = project.geometry): Promise<ImageColorAnalysis> =>
      postJson<ImageColorAnalysis>("/api/analyze-colors", {
        sourceImage,
        colorCount,
        geometry,
        algorithm: pixelAlgorithm,
      }),
    [colorCount, pixelAlgorithm, project.geometry],
  );

  const paintCell = (x: number, y: number, eraseOverride = false) => {
    commitProject((current) => {
      const layer = getActiveLayer(current);
      if (x < 0 || y < 0 || x >= layer.grid.width || y >= layer.grid.height) return current;
      const value = eraseOverride || current.editor.tool === "eraser" ? null : layer.selectedColorId;
      const color = value ? layerActiveColorGroupColors(layer).find((item) => item.id === value) : null;
      const targets = targetCellsForPaint(x, y, layer.grid, current.editor.modifiers);
      if (targets.length === 0) return current;
      const cells = layer.grid.cells.slice();
      for (const target of targets) {
        cells[gridIndex(layer.grid, target.x, target.y)] = value;
      }
      return updateActiveLayer(current, (active) => ({
        ...active,
        grid: { ...active.grid, cells },
        kernelColorGrid: setKernelHexCells(current, active, targets, color?.hex ?? null),
      }));
    }, historyBaseRef.current ?? undefined);
  };

  const setImageViewRotation = useCallback(
    async (rotation: ImageRotation, baseSource = getActiveLayer(projectRef.current).sourceImage): Promise<SourceImage | null> => {
      if (!baseSource) return null;
      const normalized = normalizeImageRotation(rotation);
      const rotated = await rotateSourceImage(baseSource, normalized);
      const size = await sourceImageSize(rotated);
      const layer = getActiveLayer(projectRef.current);
      updateLayerImageUi(layer.id, (current) => ({
        ...current,
        analysis: imageAnalysisFromSize(layer, size),
        dirty: true,
        rotation: normalized,
        source: rotated,
        viewport: { zoom: 1, offsetX: 0, offsetY: 0 },
      }));
      commitProject((current) =>
        updateActiveLayer(current, (active) => ({
          ...active,
          imageRotation: normalized,
          imageCrop: { cropLeft: 0, cropTop: 0, cropRight: 0, cropBottom: 0 },
        })),
      );
      return rotated;
    },
    [commitProject, updateLayerImageUi],
  );

  const rotateImageView = async (delta: number) => {
    try {
      await setImageViewRotation(normalizeImageRotation(imageRotation + delta));
    } catch (error) {
      setStatus(error instanceof Error ? `${UI.importFailed}: ${error.message}` : UI.importFailed);
    }
  };

  const updateImageRotation = async (value: number) => {
    try {
      await setImageViewRotation(normalizeImageRotation(value));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : UI.importFailed);
    }
  };

  const convertSourceWithGeometry = useCallback(async (targetLayer: PixelLayer, geometry: RasterGeometry, previewSource: SourceImage | null, rotation: ImageRotation): Promise<boolean> => {
    const sourceImage = previewSource ?? targetLayer.sourceImage;
    if (!sourceImage) {
      setStatus(UI.needImage);
      return false;
    }

    try {
      setStatus(UI.rasterizing);
      const analysis = await analyzeColorsOnBackend(sourceImage, geometry);
      const imageGroup = analysis.colors.length > 0 ? imageGroupFromColors(analysis.colors) : null;
      const targetGroup = layerActiveColorGroup(targetLayer);
      const targetColors = targetGroup?.colors ?? [];
      const outputGroup = mappingMode === "auto" ? imageGroup : targetGroup;
      const outputColors =
        mappingMode === "auto"
          ? outputGroup?.colors ?? targetColors
          : limitedPaletteMappingColors(outputGroup?.colors ?? targetColors, analysis.colors, colorCount);
      const rasterized = await rasterizeOnBackend(sourceImage, outputColors, geometry);
      const { grid, kernelColorGrid } = rasterized;
      let applied = false;
      commitProject((current) => {
        if (!current.layers.some((layer) => layer.id === targetLayer.id)) return current;
        applied = true;
        const nextProject = updateLayer(
          {
            ...current,
            editor: current.activeLayerId === targetLayer.id ? centeredEditor(current.editor, grid, canvasRef.current) : current.editor,
          },
          targetLayer.id,
          (active) => ({
            ...active,
            colorGroups: mappingMode === "auto" && outputGroup ? upsertColorGroup(active.colorGroups, outputGroup) : active.colorGroups,
            activeColorGroupId: mappingMode === "auto" && outputGroup ? DYNAMIC_COLOR_GROUP_ID : active.activeColorGroupId,
            imageColorGroup: outputGroup ? { ...outputGroup, colors: cloneColors(outputGroup.colors) } : null,
            selectedColorId: outputColors[0]?.id ?? active.selectedColorId,
            grid,
            kernelColorGrid,
            sourceImage,
            imageRotation: rotation,
            imageCrop: {
              cropLeft: geometry.cropLeft,
              cropTop: geometry.cropTop,
              cropRight: geometry.cropRight,
              cropBottom: geometry.cropBottom,
            },
            imageTolerance: geometry.imageTolerance,
          }),
        );
        return withSyncedLayerColorUsage(nextProject, targetLayer.id);
      });
      if (!applied) return false;
      updateLayerImageUi(targetLayer.id, (current) => ({
        ...current,
        analysis: analysis.image,
        dirty: false,
        rotation,
        source: sourceImage,
      }));
      setStatus(`OK: ${grid.width} x ${grid.height}`);
      return true;
    } catch (error) {
      setStatus(error instanceof Error ? error.message : UI.importFailed);
      return false;
    }
  }, [analyzeColorsOnBackend, colorCount, commitProject, mappingMode, rasterizeOnBackend, updateLayerImageUi]);

  const focusViewWithoutDuplicating = useCallback((view: ActiveView) => {
    setActiveView(view);
    setViewGroups((current) => {
      const normalized = normalizeViewGroups(current, projectRef.current, view);
      const activeExistingIndex = normalized.findIndex((group) => group.activeView === view);
      const tabExistingIndex = normalized.findIndex((group) => group.tabs.includes(view));
      const existingIndex = activeExistingIndex >= 0 ? activeExistingIndex : tabExistingIndex;
      const targetIndex = existingIndex >= 0 ? existingIndex : activeGroupIndex(normalized, activeView);
      const next = normalized.map((group, index) => {
        if (index !== targetIndex) return group;
        return {
          ...group,
          tabs: group.tabs.includes(view) ? group.tabs : [...group.tabs, view],
          activeView: view,
        };
      });
      if (next.length <= 1) {
        setSplitMode(false);
        setSplitRatios([1]);
      } else {
        setSplitMode(true);
        syncSplitRatios(next.length);
      }
      return next;
    });
    setResizeTick((tick) => tick + 1);
  }, [activeView]);

  const convertCroppedImage = useCallback(async () => {
    const targetLayer = getActiveLayer(projectRef.current);
    const targetUi = imageUiByLayer[targetLayer.id] ?? defaultLayerImageUiState(targetLayer);
    const geometry = layerImageGeometry(projectRef.current, targetLayer);
    const converted = await convertSourceWithGeometry(targetLayer, {
      ...geometry,
      targetGrid: {
        width: targetLayer.grid.width,
        height: targetLayer.grid.height,
      },
    }, targetUi.source, targetUi.rotation);
    if (converted && projectRef.current.activeLayerId === targetLayer.id) {
      focusViewWithoutDuplicating("2d");
    }
  }, [convertSourceWithGeometry, focusViewWithoutDuplicating, imageUiByLayer]);

  const importImage = () => imageInputRef.current?.click();
  const importProjectZip = () => projectZipInputRef.current?.click();

  const handleProjectZipFile = async (file: File) => {
    try {
      setStatus(UI.importing);
      const files = unzipSync(new Uint8Array(await file.arrayBuffer()));
      const projectFile = files["meta_data/project.pixel-stl.json"];
      if (!projectFile) throw new Error("ZIP missing meta_data/project.pixel-stl.json");
      const restoredProject = parseProject(strFromU8(projectFile));
      const settingsFile = files["meta_data/app_settings.json"];
      if (settingsFile) {
        applyImportedAppSettings(parseAppSettings(JSON.parse(strFromU8(settingsFile))));
      }
      setImageUiByLayer({});
      commitProject(restoredProject);
      setSplitMode(false);
      setViewGroups([createViewGroup(defaultViewTabs(restoredProject), "2d", restoredProject)]);
      setSplitRatios([1]);
      setActiveView("2d");
      setStatus(`OK: ${file.name}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : UI.openFailed);
    }
  };

  const importFile = async (file: File) => {
    if (!file) return;
    if (isZipFile(file)) {
      await handleProjectZipFile(file);
      return;
    }
    if (!isSupportedImageFile(file)) {
      setStatus("不支持的文件类型，请导入 PNG、JPG、WebP 或 ZIP");
      return;
    }

    try {
      const targetLayer = getActiveLayer(projectRef.current);
      const targetLayerId = targetLayer.id;
      setStatus(UI.importing);
      const sourceImage = { name: file.name, dataUrl: await readFileAsDataUrl(file) };
      const size = await sourceImageSize(sourceImage);
      const importGeometry = sanitizeGeometry({
        ...projectRef.current.geometry,
        imageTolerance: targetLayer.imageTolerance,
        cropLeft: 0,
        cropTop: 0,
        cropRight: 0,
        cropBottom: 0,
      });
      const analysis = await analyzeColorsOnBackend(sourceImage, importGeometry);
      const imageGroup = analysis.colors.length > 0 ? imageGroupFromColors(analysis.colors) : null;
      let applied = false;
      const nextImportedProject = (() => {
        const current = projectRef.current;
        if (!current.layers.some((layer) => layer.id === targetLayerId)) return current;
        applied = true;
        const nextProject = updateLayer(
          current,
          targetLayerId,
          (active) => ({
            ...active,
            colorGroups: mappingMode === "auto" && imageGroup ? upsertColorGroup(active.colorGroups, imageGroup) : active.colorGroups,
            activeColorGroupId: mappingMode === "auto" && imageGroup ? DYNAMIC_COLOR_GROUP_ID : active.activeColorGroupId,
            imageColorGroup: imageGroup ? { ...imageGroup, colors: cloneColors(imageGroup.colors) } : null,
            sourceImage,
            imageRotation: 0,
            imageCrop: { cropLeft: 0, cropTop: 0, cropRight: 0, cropBottom: 0 },
            imageTolerance: importGeometry.imageTolerance,
          }),
        );
        const active = nextProject.layers.find((layer) => layer.id === targetLayerId) ?? getActiveLayer(nextProject);
        return nextProject.activeLayerId === targetLayerId
          ? {
              ...nextProject,
              colorGroups: active.colorGroups,
              activeColorGroupId: active.activeColorGroupId,
              imageColorGroup: active.imageColorGroup,
              editor: { ...nextProject.editor, selectedColorId: active.selectedColorId },
            }
          : nextProject;
      })();
      if (!applied) return;
      commitProject(nextImportedProject);
      updateLayerImageUi(targetLayerId, () => ({
        analysis: analysis.image ?? imageAnalysisFromSize(targetLayer, size),
        dirty: true,
        rotation: 0,
        source: sourceImage,
        viewport: { zoom: 1, offsetX: 0, offsetY: 0 },
      }));
      if (projectRef.current.activeLayerId === targetLayerId) {
        setActiveView("image");
        setViewGroups([createViewGroup(defaultViewTabs(nextImportedProject), "image", nextImportedProject)]);
        setSplitMode(false);
        setSplitRatios([1]);
      }
      setStatus(`OK: ${file.name}`);
    } catch (error) {
      setStatus(error instanceof Error ? `${UI.importFailed}: ${error.message}` : UI.importFailed);
    }
  };

  const handleImageFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    await importFile(file);
  };

  const handleProjectZipInput = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!isZipFile(file)) {
      setStatus("请导入 ZIP 项目文件");
      return;
    }
    await handleProjectZipFile(file);
  };

  const firstDroppedFile = (event: React.DragEvent<HTMLElement>): File | null => {
    const files = Array.from(event.dataTransfer.files ?? []);
    return files.find((file) => isSupportedImageFile(file) || isZipFile(file)) ?? files[0] ?? null;
  };

  const handleImageDrop = async (event: React.DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setImageDropActive(false);
    const file = firstDroppedFile(event);
    if (file) await importFile(file);
  };

  const handleImageDragOver = (event: React.DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "copy";
    setImageDropActive(true);
  };

  const handleImageDragLeave = (event: React.DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setImageDropActive(false);
    }
  };

  importFileRef.current = importFile;

  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      if (activeViewRef.current !== "image") return;
      if (isEditablePasteTarget(event.target)) return;
      const file = imageFileFromClipboard(event);
      if (!file) return;
      event.preventDefault();
      event.stopPropagation();
      void importFileRef.current(file);
    };
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, []);

  const openExportDialog = () => {
    if (zipProgress.active) return;
    setExportDialog(defaultExportSelection(project));
  };

  const updateExportFileOptions = (updates: Partial<ExportFileOptions> | ((current: ExportFileOptions) => ExportFileOptions)) => {
    setExportDialog((current) => {
      if (!current) return current;
      const currentOptions = exportFileOptionsFromSelection(current);
      const nextOptions = typeof updates === "function" ? updates(currentOptions) : { ...currentOptions, ...updates };
      writeExportFileOptions(nextOptions);
      return { ...current, ...nextOptions };
    });
  };

  const updateExportOverviewOptions = (updates: Partial<ExportOverviewOptions>) => {
    setExportDialog((current) => {
      if (!current) return current;
      const nextOptions = {
        overviewColumns: clamp(Math.round(updates.overviewColumns ?? current.overviewColumns), 1, 6),
      };
      writeExportOverviewOptions(nextOptions);
      return { ...current, ...nextOptions };
    });
  };

  const setAllExportFileOptions = (checked: boolean) => {
    setExportDialog((current) => {
      if (!current) return current;
      const nextOptions: ExportFileOptions = {
        includeObj: checked,
        include3mf: checked,
        includePatternPng: checked,
        includeBeadPng: checked,
        includeHammerPng: checked,
        includeOverviewPng: checked && current.layerIds.length >= 2,
        includeMeta: checked,
      };
      writeExportFileOptions(nextOptions);
      return { ...current, ...nextOptions };
    });
  };

  const setAllExportLayerIds = (checked: boolean) => {
    setExportDialog((current) => {
      if (!current) return current;
      const layerIds = checked ? project.layers.map((layer) => layer.id) : [];
      return { ...current, layerIds };
    });
  };

  const resetProject = () => {
    const next = createEmptyProject();
    setImageUiByLayer({});
    setHistory({ past: [], future: [] });
    projectRef.current = next;
    setProject(next);
    setActiveView("2d");
    setSplitMode(false);
    setViewGroups([createViewGroup(defaultViewTabs(next), "2d", next)]);
    setSplitRatios([1]);
    setExportDialog(null);
    setColorContextMenu(null);
    setCanvasReplaceContextMenu(null);
    setHexContextMenu(null);
    setLayerSort(null);
    setTabSort(null);
    setStatus(UI.projectReset);
    requestAnimationFrame(() => {
      updateProjectView((current) => ({ ...current, editor: centeredEditor(current.editor, getActiveLayer(current).grid, canvasRef.current) }));
    });
  };

  const exportZip = async (selection: ExportSelection) => {
    if (zipProgress.active) return;
    const runId = exportRunRef.current + 1;
    exportRunRef.current = runId;
    const isCurrentRun = () => exportRunRef.current === runId;
    const setProgressForRun = (progress: ZipProgressState) => {
      if (isCurrentRun()) setZipProgress(progress);
    };
    const setTaskForRun = (task: ActiveExportTask | null) => {
      if (isCurrentRun()) setActiveExportTask(task);
    };
    try {
      const hasLayerFile = selection.includeObj || selection.include3mf || selection.includePatternPng || selection.includeBeadPng || selection.includeHammerPng;
      const canExportOverview = selection.layerIds.length >= 2;
      const includeOverviewPng = selection.includeOverviewPng && canExportOverview;
      if (selection.layerIds.length === 0) {
        setStatus(UI.exportSelectAtLeastOneLayer);
        return;
      }
      if (!hasLayerFile && !includeOverviewPng && !selection.includeMeta) {
        setStatus(UI.exportSelectAtLeastOneFile);
        return;
      }
      const renamedProject = projectWithExportLayerNames(project, selection);
      if (renamedProject.layers.length === 0) {
        setStatus(UI.exportSelectAtLeastOneLayer);
        return;
      }
      setExportDialog(null);
      const fileName = safeZipFileName(selection.zipFileName, projectBaseName(renamedProject));
      setProgressForRun({ active: true, value: 8, label: "准备保存" });
      setTaskForRun(null);
      setZipCompleteNotice(null);
      const saveTarget = await requestZipSaveTarget(fileName);
      if (!isCurrentRun()) return;
      if (saveTarget.type === "cancelled") {
        setStatus(UI.zipCancelled);
        setProgressForRun({ active: false, value: 0, label: "" });
        return;
      }
      const finalFileName = zipSaveTargetFileName(saveTarget, fileName);
      setProgressForRun({ active: true, value: 10, label: "准备项目" });
      setStatus(UI.generatingZip);
      const exportProject = projectForExport(renamedProject, mirrorX, mirrorY);
      const exportSettings = { ...collectAppSettings(), mirrorX: false, mirrorY: false };
      const exportSelection: ExportSelection = {
        ...selection,
        includeOverviewPng,
        zipFileName: safeZipBaseName(finalFileName),
        overviewColumns: selection.overviewColumns,
        layerIds: exportProject.layers.map((layer) => layer.id),
        layerNames: Object.fromEntries(exportProject.layers.map((layer) => [layer.id, layer.name])),
      };
      const { taskId } = await startExportTask(exportProject, exportSettings, finalFileName, exportSelection);
      if (!isCurrentRun()) {
        void cancelExportTask(taskId).catch(() => undefined);
        return;
      }
      setTaskForRun({ taskId, fileName: finalFileName });
      let latestStatus: ExportTaskStatus | null = null;
      for (;;) {
        latestStatus = await readExportStatus(taskId);
        if (!isCurrentRun()) return;
        setProgressForRun({
          active: true,
          value: clamp(latestStatus.progress || 0, 1, 95),
          label: latestStatus.label || UI.generatingZip,
        });
        if (latestStatus.status === "done") break;
        if (latestStatus.status === "cancelled") {
          setStatus(UI.zipCancelled);
          setProgressForRun({ active: false, value: 0, label: "" });
          setTaskForRun(null);
          return;
        }
        if (latestStatus.status === "error") throw new Error(latestStatus.error || UI.exportFailed);
        await sleep(350);
      }
      setProgressForRun({ active: true, value: 96, label: "接收文件" });
      const blob = await downloadExportTask(taskId);
      if (!isCurrentRun()) return;
      setProgressForRun({ active: true, value: 98, label: "写入文件" });
      const result = await writeZipBlob(saveTarget, blob, finalFileName);
      if (!isCurrentRun()) return;
      if (result.status === "cancelled") {
        setStatus(UI.zipCancelled);
        setProgressForRun({ active: false, value: 0, label: "" });
        setTaskForRun(null);
      } else {
        setProgressForRun({ active: true, value: 100, label: "完成" });
        setTaskForRun(null);
        setStatus(`${result.status === "saved" ? UI.zipSaved : UI.zipDownloaded}: ${result.fileName}`);
        setZipCompleteNotice({ kind: result.status, fileName: result.fileName });
        window.setTimeout(() => {
          if (isCurrentRun()) {
            setZipProgress((current) => (current.value === 100 ? { active: false, value: 0, label: "" } : current));
          }
        }, 1800);
      }
    } catch (error) {
      if (!isCurrentRun()) return;
      setStatus(error instanceof Error ? error.message : UI.exportFailed);
      setProgressForRun({ active: false, value: 0, label: "" });
      setTaskForRun(null);
    }
  };

  const cancelActiveExport = async () => {
    const task = activeExportTask;
    exportRunRef.current += 1;
    if (!task) {
      setZipProgress({ active: false, value: 0, label: "" });
      setStatus(UI.zipCancelled);
      return;
    }
    setStatus(UI.zipCancelled);
    setZipProgress({ active: true, value: zipProgress.value, label: "正在取消" });
    try {
      await cancelExportTask(task.taskId);
    } catch {
      // If the task already finished or expired, stop the local progress UI anyway.
    }
    setActiveExportTask(null);
    setZipProgress({ active: false, value: 0, label: "" });
  };

  const updateGeometry = <K extends keyof GeometrySettings>(key: K, value: number) => {
    if (["cropLeft", "cropTop", "cropRight", "cropBottom", "imageTolerance"].includes(String(key))) {
      updateLayerImageUi(activeLayer.id, (current) => ({ ...current, dirty: Boolean(activeLayer.sourceImage) }));
    }
    commitProject((current) => {
      if (["cropLeft", "cropTop", "cropRight", "cropBottom"].includes(String(key))) {
        const nextCrop = { ...getActiveLayer(current).imageCrop, [key]: value };
        return updateActiveLayer(current, (layer) => ({ ...layer, imageCrop: nextCrop }));
      }
      if (key === "imageTolerance") {
        return updateActiveLayer(current, (layer) => ({ ...layer, imageTolerance: sanitizeGeometry({ ...current.geometry, imageTolerance: value }).imageTolerance }));
      }
      const geometry = sanitizeGeometry({ ...current.geometry, [key]: value });
      return { ...current, geometry };
    });
  };

  const updateColorCount = (value: number) => {
    setColorCount(clamp(Math.round(value), 1, 32));
    updateLayerImageUi(activeLayer.id, (current) => ({ ...current, dirty: Boolean(activeLayer.sourceImage) }));
  };

  const setPixelAlgorithm = (value: PixelAlgorithm) => {
    setPixelAlgorithmState(value);
    updateLayerImageUi(activeLayer.id, (current) => ({ ...current, dirty: Boolean(activeLayer.sourceImage) }));
  };

  const updateGridSize = (key: "width" | "height", value: number) => {
    const targetLayerId = activeLayer.id;
    commitProject((current) => {
      const targetLayer = current.layers.find((layer) => layer.id === targetLayerId) ?? getActiveLayer(current);
      const currentGrid = targetLayer.grid;
      const width = key === "width" ? clamp(Math.round(value), 1, 256) : currentGrid.width;
      const height = key === "height" ? clamp(Math.round(value), 1, 256) : currentGrid.height;
      const next = updateLayer(current, targetLayer.id, (layer) => ({
        ...layer,
        grid: resizeGrid(layer.grid, width, height),
        kernelColorGrid: layer.kernelColorGrid ? resizeGrid(layer.kernelColorGrid, width, height) : null,
      }));
      return { ...next, editor: centeredEditor(next.editor, getActiveLayer(next).grid, canvasRef.current) };
    });
    const resizedLayer = projectRef.current.layers.find((layer) => layer.id === targetLayerId);
    if (!resizedLayer?.sourceImage) return;
    updateLayerImageUi(resizedLayer.id, (previous) => ({
      ...previous,
      analysis: previous.analysis ? { ...previous.analysis, outputWidth: resizedLayer.grid.width, outputHeight: resizedLayer.grid.height } : previous.analysis,
      dirty: true,
    }));
  };

  const updateColor = (id: string, patch: Partial<BeadColor>) => {
    commitProject((current) => {
      const layer = getActiveLayer(current);
      const colors = layerActiveColorGroupColors(layer).map((color) =>
        color.id === id
          ? {
              ...color,
              ...patch,
              hex: patch.hex ? normalizeHex(patch.hex) : color.hex,
              ...(typeof patch.enabled === "boolean" ? { enabled: patch.enabled } : {}),
            }
          : color,
      );
      return withActiveLayerColorGroup(current, colors, layer.selectedColorId);
    });
  };

  const updateHexInput = (id: string, value: string) => {
    const raw = value.trim().replace(/^#/, "");
    if (!/^[0-9a-fA-F]{0,6}$/.test(raw)) return;
    setHexDrafts((current) => ({ ...current, [id]: value }));
    if (raw.length === 6) {
      updateColor(id, { hex: `#${raw}` });
      setHexDrafts((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
    }
  };

  const commitHexInput = (id: string) => {
    const fallback = layerActiveColorGroupColors(getActiveLayer(projectRef.current)).find((color) => color.id === id)?.hex ?? "#000000";
    const raw = (hexDrafts[id] ?? fallback).trim().replace(/^#/, "");
    if (/^[0-9a-fA-F]{6}$/.test(raw)) updateColor(id, { hex: `#${raw}` });
    setHexDrafts((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  };

  const openColorContextMenu = (event: React.MouseEvent<HTMLElement>, colorId: string) => {
    event.preventDefault();
    event.stopPropagation();
    const position = menuPosition(event.clientX, event.clientY, 340, 260);
    setHexContextMenu(null);
    setCanvasReplaceContextMenu(null);
    setColorContextMenu({ colorId, ...position, openLeft: event.clientX > window.innerWidth - 340 });
  };

  const openCanvasReplaceContextMenu = (event: React.MouseEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setHexContextMenu(null);
    setColorContextMenu(null);
    setCanvasReplaceContextMenu(null);
    const cell = pointerToCell(event);
    const layer = getActiveLayer(projectRef.current);
    if (!isInsideGrid(layer.grid, cell.x, cell.y)) return;
    const sourceColorId = layer.grid.cells[gridIndex(layer.grid, cell.x, cell.y)];
    if (!sourceColorId) return;
    const position = menuPosition(event.clientX, event.clientY, 340, 260);
    setCanvasReplaceContextMenu({ sourceColorId, ...position, openLeft: event.clientX > window.innerWidth - 340 });
  };

  const openHexContextMenu = (event: React.MouseEvent<HTMLElement>, color: BeadColor) => {
    event.preventDefault();
    event.stopPropagation();
    const position = menuPosition(event.clientX, event.clientY, 246, 170);
    setColorContextMenu(null);
    setCanvasReplaceContextMenu(null);
    setHexContextMenu({
      colorId: color.id,
      ...position,
      value: color.hex.toUpperCase(),
      error: "",
    });
  };

  const mergeColorInto = (sourceColorId: string, targetColorId: string) => {
    if (sourceColorId === targetColorId) return;
    commitProject((current) => {
      const replaced = updateActiveLayerPalette(
        current,
        (layer) => {
          if (!layer.grid.cells.some((cell) => cell === sourceColorId)) {
            return { ...layer, selectedColorId: targetColorId };
          }
          return {
          ...layer,
          selectedColorId: targetColorId,
          grid: {
            ...layer.grid,
            cells: layer.grid.cells.map((cell) => (cell === sourceColorId ? targetColorId : cell)),
          },
          };
        },
      );
      return withSyncedActiveColorUsage(replaced);
    });
    setColorContextMenu(null);
    setCanvasReplaceContextMenu(null);
  };

  const deleteActiveColorFromLayer = (sourceColorId: string) => {
    commitProject((current) => {
      const cleared = updateActiveLayerPalette(current, (layer) => {
        const kernelCells = layer.kernelColorGrid?.cells.slice() ?? null;
        let changed = false;
        const cells = layer.grid.cells.map((cell, index) => {
          if (cell !== sourceColorId) return cell;
          changed = true;
          if (kernelCells) kernelCells[index] = null;
          return null;
        });
        if (!changed) return layer;
        return {
          ...layer,
          grid: { ...layer.grid, cells },
          kernelColorGrid: kernelCells ? { ...layer.kernelColorGrid!, cells: kernelCells } : layer.kernelColorGrid,
        };
      });
      return withSyncedActiveColorUsage(cleared);
    });
    setColorContextMenu(null);
    setCanvasReplaceContextMenu(null);
  };

  const commitHexContextMenu = () => {
    if (!hexContextMenu) return;
    const raw = hexContextMenu.value.trim().replace(/^#/, "");
    if (!/^[0-9a-fA-F]{6}$/.test(raw)) {
      setHexContextMenu((current) => (current ? { ...current, error: UI.invalidHex } : current));
      return;
    }
    updateColor(hexContextMenu.colorId, { hex: `#${raw}` });
    setHexDrafts((current) => {
      const next = { ...current };
      delete next[hexContextMenu.colorId];
      return next;
    });
    setHexContextMenu(null);
  };

  const addColor = () => {
    setAddDialog({ color: "#38bdf8", code: `C${activeColors.length + 1}` });
  };

  const refreshActiveColorUsage = () => {
    commitProject((current) => {
      const layer = getActiveLayer(current);
      const group = layerActiveColorGroup(layer);
      const used = new Set(layer.grid.cells.filter((cell): cell is string => Boolean(cell)));
      const colors = sortColorsByDisplayUsage(
        (group?.colors ?? []).map((color) => ({
          ...color,
          enabled: used.has(color.id),
          displayUsed: used.has(color.id),
        })),
        group?.id,
      );
      const selectedColorId = colors.some((color) => color.id === layer.selectedColorId && color.enabled)
        ? layer.selectedColorId
        : colors.find((color) => color.enabled)?.id ?? layer.selectedColorId;
      return withActiveLayerColorGroup(current, colors, selectedColorId);
    });
  };

  const selectBeadColorGroup = (id: string) => {
    commitProject((current) => {
      const layer = getActiveLayer(current);
      const nextGroup = layer.colorGroups.find((group) => group.id === id) ?? layer.colorGroups[0];
      if (!nextGroup || nextGroup.id === layer.activeColorGroupId) return current;
      return remapGridToColorGroup(current, nextGroup);
    });
  };

  const addBeadColorGroup = () => {
    setGroupDialog({ name: `group ${activeLayer.colorGroups.length + 1}` });
  };

  const confirmAddBeadColorGroup = () => {
    if (!groupDialog) return;
    commitProject((current) => {
      const id = `group-${Date.now().toString(36)}`;
      const group: BeadColorGroup = {
        id,
        name: groupDialog.name.trim() || `group ${getActiveLayer(current).colorGroups.length + 1}`,
        colors: [],
      };
      return updateActiveLayerPalette(current, (active) => ({
        ...active,
        colorGroups: [...active.colorGroups, group],
        activeColorGroupId: id,
        selectedColorId: "",
      }));
    });
    setGroupDialog(null);
  };

  const renameActiveGroup = (name: string) => {
    commitProject((current) =>
      updateActiveLayerPalette(current, (active) => ({
        ...active,
        colorGroups: active.colorGroups.map((group) => (group.id === active.activeColorGroupId ? { ...group, name } : group)),
      })),
    );
  };

  const deleteBeadColorGroup = () => {
    commitProject((current) => {
      const active = getActiveLayer(current);
      if (active.colorGroups.length <= 1) return current;
      const nextGroups = active.colorGroups.filter((group) => group.id !== active.activeColorGroupId);
      const nextGroup = nextGroups[0];
      const withGroups = updateActiveLayerPalette(current, (layer) => ({ ...layer, colorGroups: nextGroups, activeColorGroupId: nextGroup.id }));
      return remapGridToColorGroup(withGroups, nextGroup);
    });
  };

  const restoreDefaultBeadGroups = () => {
    commitProject((current) => {
      const colorGroups = cloneColorGroups(DEFAULT_COLOR_GROUPS);
      const activeGroup = colorGroups[0];
      const withGroups = updateActiveLayerPalette(current, (layer) => ({
        ...layer,
        imageColorGroup: null,
        colorGroups,
        activeColorGroupId: activeGroup.id,
        selectedColorId: activeGroup.colors[0]?.id ?? "",
      }));
      return remapGridToColorGroup(withGroups, activeGroup);
    });
    setStatus(UI.restoredDefaultBeads);
  };

  const confirmAddColor = () => {
    if (!addDialog) return;
    const hex = normalizeHex(addDialog.color);
    const code = addDialog.code.trim() || `C${activeColors.length + 1}`;
    const beadColor: BeadColor = {
      ...makeColor(),
      code,
      name: code,
      hex,
      enabled: true,
      displayUsed: true,
    };
    commitProject((current) => withActiveLayerColorGroup(current, [...layerActiveColorGroupColors(getActiveLayer(current)), beadColor], beadColor.id));
    setAddDialog(null);
  };

  const deleteColor = (id: string) => {
    if (activeColors.length <= 1) return;
    commitProject((current) => {
      const layer = getActiveLayer(current);
      const currentColors = layerActiveColorGroupColors(layer);
      if (currentColors.length <= 1) return current;
      const nextColors = currentColors.filter((color) => color.id !== id);
      const reference = referenceGridFromLayer(current, layer);
      const kernelColorGrid = reference
        ? {
            ...reference,
            cells: reference.cells.map((hex, index) => (layer.grid.cells[index] === id ? null : hex)),
          }
        : layer.kernelColorGrid;
      const selectedColorId = layer.selectedColorId === id ? nextColors[0].id : layer.selectedColorId;
      const next = updateActiveLayer(current, (active) => ({
        ...active,
        grid: { ...active.grid, cells: active.grid.cells.map((cell) => (cell === id ? null : cell)) },
        kernelColorGrid,
      }));
      return withActiveLayerColorGroup(next, nextColors, selectedColorId);
    });
  };

  const resetImage = () => {
    updateLayerImageUi(activeLayer.id, () => defaultLayerImageUiState(activeLayer));
    setActiveView("2d");
    commitProject((current) => {
      const next = updateActiveLayer(
        current,
        (layer) => {
          const grid = { ...layer.grid, cells: layer.grid.cells.map(() => null) };
          return {
            ...layer,
            imageColorGroup: null,
            sourceImage: null,
            imageRotation: 0,
            imageCrop: { cropLeft: 0, cropTop: 0, cropRight: 0, cropBottom: 0 },
            grid,
            kernelColorGrid: null,
          };
        },
      );
      return { ...next, editor: centeredEditor(next.editor, getActiveLayer(next).grid, canvasRef.current) };
    });
    setStatus(UI.resetImage);
  };

  const addLayer = () => {
    commitProject((current) => {
      const active = getActiveLayer(current);
      const baseGrid = active.grid;
      const layer = createPixelLayer(uniqueLayerName(`图层 ${current.layers.length + 1}`, current.layers), createBlankGrid(baseGrid.width, baseGrid.height), active.colorGroups);
      const next = {
        ...current,
        layers: [layer, ...current.layers],
        activeLayerId: layer.id,
        colorGroups: layer.colorGroups,
        activeColorGroupId: layer.activeColorGroupId,
        imageColorGroup: layer.imageColorGroup,
        editor: { ...centeredEditor(current.editor, layer.grid, canvasRef.current), selectedColorId: layer.selectedColorId },
      };
      return autoHideInactiveLayers ? hideInactiveLayersInProject(next) : next;
    });
  };

  const selectLayer = (id: string) => {
    updateProjectView((current) => {
      const layer = current.layers.find((item) => item.id === id);
      if (!layer) return current;
      const next = {
        ...current,
        activeLayerId: id,
        colorGroups: layer.colorGroups,
        activeColorGroupId: layer.activeColorGroupId,
        imageColorGroup: layer.imageColorGroup,
        editor: { ...centeredEditor(current.editor, layer.grid, canvasRef.current), selectedColorId: layer.selectedColorId },
      };
      return autoHideInactiveLayers ? hideInactiveLayersInProject(next) : next;
    });
  };

  const renameLayer = (id: string, name: string) => {
    commitProject((current) => ({
      ...current,
      layers: current.layers.map((layer) => (layer.id === id ? { ...layer, name: uniqueLayerName(name, current.layers, id) } : layer)),
    }));
  };

  const toggleLayerVisible = (id: string) => {
    commitProject((current) => ({
      ...current,
      layers: current.layers.map((layer) => (layer.id === id ? { ...layer, visible: !layer.visible } : layer)),
    }));
  };

  const showAllLayers = () => {
    commitProject((current) => ({
      ...current,
      layers: current.layers.map((layer) => ({ ...layer, visible: true })),
    }));
  };

  const hideInactiveLayers = () => {
    commitProject((current) => hideInactiveLayersInProject(current));
  };

  const toggleAutoHideInactiveLayers = (checked: boolean) => {
    setAutoHideInactiveLayers(checked);
    if (checked) hideInactiveLayers();
  };

  const duplicateLayer = (id: string) => {
    let copiedLayerId: string | null = null;
    commitProject((current) => {
      const index = current.layers.findIndex((layer) => layer.id === id);
      if (index < 0) return current;
      const source = current.layers[index];
      const copy: PixelLayer = {
        ...source,
        id: `layer-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
        name: uniqueLayerName(`${source.name} copy`, current.layers),
        colorGroups: cloneColorGroups(source.colorGroups),
        imageColorGroup: source.imageColorGroup ? { ...source.imageColorGroup, colors: cloneColors(source.imageColorGroup.colors) } : null,
        grid: { ...source.grid, cells: source.grid.cells.slice() },
        kernelColorGrid: source.kernelColorGrid ? { ...source.kernelColorGrid, cells: source.kernelColorGrid.cells.slice() } : null,
        imageCrop: { ...source.imageCrop },
        sourceImage: source.sourceImage ? { ...source.sourceImage } : null,
      };
      copiedLayerId = copy.id;
      const layers = current.layers.slice();
      layers.splice(index, 0, copy);
      const next = {
        ...current,
        layers,
        activeLayerId: copy.id,
        colorGroups: copy.colorGroups,
        activeColorGroupId: copy.activeColorGroupId,
        imageColorGroup: copy.imageColorGroup,
        editor: { ...current.editor, selectedColorId: copy.selectedColorId },
      };
      return autoHideInactiveLayers ? hideInactiveLayersInProject(next) : next;
    });
    if (copiedLayerId) {
      const nextLayerId = copiedLayerId;
      setImageUiByLayer((current) => {
        const source = current[id];
        if (!source) return current;
        return {
          ...current,
          [nextLayerId]: {
            analysis: source.analysis ? { ...source.analysis, components: source.analysis.components.slice() } : null,
            dirty: source.dirty,
            rotation: source.rotation,
            source: source.source ? { ...source.source } : null,
            viewport: { ...source.viewport },
          },
        };
      });
    }
  };

  const deleteLayer = (id: string) => {
    commitProject((current) => {
      if (current.layers.length <= 1) return current;
      const index = current.layers.findIndex((layer) => layer.id === id);
      if (index < 0) return current;
      const layers = current.layers.filter((layer) => layer.id !== id);
      const activeLayerId = current.activeLayerId === id ? layers[Math.min(index, layers.length - 1)].id : current.activeLayerId;
      const active = layers.find((layer) => layer.id === activeLayerId) ?? layers[0];
      const next = {
        ...current,
        layers,
        activeLayerId,
        colorGroups: active.colorGroups,
        activeColorGroupId: active.activeColorGroupId,
        imageColorGroup: active.imageColorGroup,
        editor: { ...current.editor, selectedColorId: active.selectedColorId },
      };
      return autoHideInactiveLayers ? hideInactiveLayersInProject(next) : next;
    });
    setImageUiByLayer((current) => {
      if (!current[id]) return current;
      const next = { ...current };
      delete next[id];
      return next;
    });
  };

  const reorderLayersByIds = (layers: PixelLayer[], ids: string[]): PixelLayer[] => {
    const byId = new Map(layers.map((layer) => [layer.id, layer]));
    const ordered = ids.map((id) => byId.get(id)).filter((layer): layer is PixelLayer => Boolean(layer));
    const missing = layers.filter((layer) => !ids.includes(layer.id));
    return [...ordered, ...missing];
  };

  const commitLayerOrder = (ids: string[]) => {
    commitProject((current) => {
      const currentIds = current.layers.map((layer) => layer.id);
      if (ids.length !== currentIds.length || ids.every((id, index) => id === currentIds[index])) return current;
      return { ...current, layers: reorderLayersByIds(current.layers, ids) };
    });
  };

  const toggleLeftSection = (section: LeftSectionId) => {
    setCollapsedLeftSections((current) => ({ ...current, [section]: !current[section] }));
  };

  const captureLayerRects = () => {
    layerFlipRectsRef.current = new Map(Array.from(layerRowRefs.current, ([id, element]) => [id, element.getBoundingClientRect()]));
  };

  const layerIndexFromPointer = (clientY: number, previewIds: string[], draggingId: string): number => {
    const targets = previewIds
      .filter((id) => id !== draggingId)
      .map((id) => ({ id, rect: layerRowRefs.current.get(id)?.getBoundingClientRect() }))
      .filter((item): item is { id: string; rect: DOMRect } => Boolean(item.rect))
      .sort((a, b) => a.rect.top - b.rect.top);
    if (targets.length === 0) return 0;
    let index = 0;
    for (const item of targets) {
      if (clientY > item.rect.top + item.rect.height / 2) index += 1;
    }
    return index;
  };

  const previewLayerOrder = (state: LayerSortState, targetIndex: number, currentY = state.currentY): LayerSortState => {
    const withoutDragged = state.previewIds.filter((id) => id !== state.layerId);
    const nextIndex = clamp(targetIndex, 0, withoutDragged.length);
    const previewIds = withoutDragged.slice();
    previewIds.splice(nextIndex, 0, state.layerId);
    const moved = state.moved || Math.abs(currentY - state.startY) > 3 || !previewIds.every((id, index) => id === state.originalIds[index]);
    if (previewIds.every((id, index) => id === state.previewIds[index]) && currentY === state.currentY && moved === state.moved) return state;
    return { ...state, previewIds, currentY, moved };
  };

  const updateLayerDragPreview = (clientY: number) => {
    const state = layerSortRef.current;
    if (!state) return;
    captureLayerRects();
    const targetIndex = layerIndexFromPointer(clientY, state.previewIds, state.layerId);
    const nextState = previewLayerOrder(state, targetIndex, clientY);
    layerSortRef.current = nextState;
    if (nextState !== state) setLayerSort(nextState);
  };

  const finishLayerDragState = (commit: boolean) => {
    const state = layerSortRef.current;
    if (!state) return;
    if (commit && state.moved) commitLayerOrder(state.previewIds);
    layerSortRef.current = null;
    setLayerSort(null);
  };

  const handleLayerDragPointerDown = (event: React.PointerEvent<HTMLElement>, layerId: string) => {
    if (event.button !== 0 || project.layers.length <= 1) return;
    event.preventDefault();
    event.stopPropagation();
    const originalIds = project.layers.map((layer) => layer.id);
    const nextState: LayerSortState = {
      layerId,
      originalIds,
      previewIds: originalIds,
      pointerId: event.pointerId,
      startY: event.clientY,
      currentY: event.clientY,
      moved: false,
    };
    layerSortRef.current = nextState;
    setLayerSort(nextState);
  };

  const handleLayerDragPointerMove = (event: React.PointerEvent<HTMLElement>) => {
    const state = layerSortRef.current;
    if (!state || state.pointerId !== event.pointerId) return;
    event.preventDefault();
    updateLayerDragPreview(event.clientY);
  };

  const finishLayerDrag = (event: React.PointerEvent<HTMLElement>, commit: boolean) => {
    const state = layerSortRef.current;
    if (!state || state.pointerId !== event.pointerId) return;
    finishLayerDragState(commit);
  };

  const tabKey = (groupId: string, view: ActiveView) => `${groupId}:${view}`;

  const captureTabRects = (groupId: string) => {
    tabFlipRectsRef.current = new Map(
      Array.from(tabButtonRefs.current)
        .filter(([key]) => key.startsWith(`${groupId}:`))
        .map(([key, element]) => [key, element.getBoundingClientRect()]),
    );
  };

  const tabIndexFromPointer = (clientX: number, state: TabSortState): number => {
    const targets = state.previewTabs
      .filter((view) => view !== state.view)
      .map((view) => ({ view, rect: tabButtonRefs.current.get(tabKey(state.groupId, view))?.getBoundingClientRect() }))
      .filter((item): item is { view: ActiveView; rect: DOMRect } => Boolean(item.rect))
      .sort((a, b) => a.rect.left - b.rect.left);
    if (targets.length === 0) return 0;
    let index = 0;
    for (const item of targets) {
      if (clientX > item.rect.left + item.rect.width / 2) index += 1;
    }
    return index;
  };

  const previewTabOrder = (state: TabSortState, targetIndex: number, currentX = state.currentX): TabSortState => {
    const withoutDragged = state.previewTabs.filter((view) => view !== state.view);
    const nextIndex = clamp(targetIndex, 0, withoutDragged.length);
    const previewTabs = withoutDragged.slice();
    previewTabs.splice(nextIndex, 0, state.view);
    const moved = state.moved || Math.abs(currentX - state.startX) > 4 || !previewTabs.every((view, index) => view === state.originalTabs[index]);
    if (previewTabs.every((view, index) => view === state.previewTabs[index]) && currentX === state.currentX && moved === state.moved) return state;
    return { ...state, previewTabs, currentX, moved };
  };

  const updateTabDragPreview = (clientX: number) => {
    const state = tabSortRef.current;
    if (!state) return;
    captureTabRects(state.groupId);
    const targetIndex = tabIndexFromPointer(clientX, state);
    const nextState = previewTabOrder(state, targetIndex, clientX);
    tabSortRef.current = nextState;
    if (nextState !== state) setTabSort(nextState);
  };

  const finishTabDragState = (commit: boolean) => {
    const state = tabSortRef.current;
    if (!state) return;
    if (commit && state.moved) {
      ignoreNextTabClickRef.current = true;
      setViewGroups((current) =>
        current.map((group) => (group.id === state.groupId ? { ...group, tabs: state.previewTabs, activeView: state.view } : group)),
      );
      setActiveView(state.view);
      setResizeTick((tick) => tick + 1);
      window.setTimeout(() => {
        ignoreNextTabClickRef.current = false;
      }, 0);
    }
    tabSortRef.current = null;
    setTabSort(null);
  };

  const handleTabPointerDown = (event: React.PointerEvent<HTMLButtonElement>, group: ViewGroup, view: ActiveView) => {
    if (event.button !== 0 || group.tabs.length <= 1) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const nextState: TabSortState = {
      groupId: group.id,
      view,
      originalTabs: group.tabs,
      previewTabs: group.tabs,
      pointerId: event.pointerId,
      startX: event.clientX,
      currentX: event.clientX,
      moved: false,
    };
    tabSortRef.current = nextState;
    setTabSort(nextState);
  };

  const syncSplitRatios = (count: number, updater?: (current: number[]) => number[]) => {
    setSplitRatios((current) => {
      const base = updater ? updater(current) : current.slice(0, count);
      if (base.length === count && base.every((ratio) => ratio > 0)) return base;
      const next = base.slice(0, count);
      while (next.length < count) next.push(1);
      return next.map((ratio) => (ratio > 0 ? ratio : 1));
    });
  };

  const handleLeftPanePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = leftPaneCollapsed ? Math.max(leftPaneWidth, LEFT_PANE_DEFAULT_WIDTH) : leftPaneWidth;
    leftPaneResizeRef.current = { active: true, startX, startWidth };
    document.body.classList.add("resizing-pane");

    const handleMove = (pointerEvent: PointerEvent) => {
      const drag = leftPaneResizeRef.current;
      if (!drag?.active) return;
      const nextWidth = drag.startWidth + pointerEvent.clientX - drag.startX;
      if (nextWidth < LEFT_PANE_COLLAPSE_THRESHOLD) {
        setLeftPaneCollapsed(true);
      } else {
        setLeftPaneCollapsed(false);
        setLeftPaneWidth(clamp(Math.round(nextWidth), LEFT_PANE_MIN_WIDTH, LEFT_PANE_MAX_WIDTH));
      }
      setResizeTick((tick) => tick + 1);
    };

    const handleUp = () => {
      leftPaneResizeRef.current = null;
      document.body.classList.remove("resizing-pane");
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleUp);
      setResizeTick((tick) => tick + 1);
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleUp);
  };

  const restoreLeftPane = () => {
    setLeftPaneCollapsed(false);
    setLeftPaneWidth((width) => clamp(width || LEFT_PANE_DEFAULT_WIDTH, LEFT_PANE_MIN_WIDTH, LEFT_PANE_MAX_WIDTH));
    setResizeTick((tick) => tick + 1);
  };

  const handleRightPanePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = rightPaneCollapsed ? Math.max(rightPaneWidth, RIGHT_PANE_DEFAULT_WIDTH) : rightPaneWidth;
    rightPaneResizeRef.current = { active: true, startX, startWidth };
    document.body.classList.add("resizing-pane");

    const handleMove = (pointerEvent: PointerEvent) => {
      const drag = rightPaneResizeRef.current;
      if (!drag?.active) return;
      const nextWidth = drag.startWidth - (pointerEvent.clientX - drag.startX);
      if (nextWidth < RIGHT_PANE_COLLAPSE_THRESHOLD) {
        setRightPaneCollapsed(true);
      } else {
        setRightPaneCollapsed(false);
        setRightPaneWidth(clamp(Math.round(nextWidth), RIGHT_PANE_MIN_WIDTH, RIGHT_PANE_MAX_WIDTH));
      }
      setResizeTick((tick) => tick + 1);
    };

    const handleUp = () => {
      rightPaneResizeRef.current = null;
      document.body.classList.remove("resizing-pane");
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleUp);
      setResizeTick((tick) => tick + 1);
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleUp);
  };

  const restoreRightPane = () => {
    setRightPaneCollapsed(false);
    setRightPaneWidth((width) => clamp(width || RIGHT_PANE_DEFAULT_WIDTH, RIGHT_PANE_MIN_WIDTH, RIGHT_PANE_MAX_WIDTH));
    setResizeTick((tick) => tick + 1);
  };

  const selectView = (view: ActiveView) => {
    if (!isViewAvailable(view, projectRef.current)) return;
    setSplitContextMenu(null);
    setActiveView(view);
    setViewGroups((current) => {
      const groups = normalizeViewGroups(current, projectRef.current, activeView);
      const index = groupWithView(groups, view, activeView);
      const next = groups.map((group, groupIndex) => (groupIndex === index ? { ...group, activeView: view, tabs: group.tabs.includes(view) ? group.tabs : [...group.tabs, view] } : group));
      if (next.length <= 1) {
        setSplitMode(false);
        syncSplitRatios(1);
      } else {
        setSplitMode(true);
        syncSplitRatios(next.length);
      }
      return next;
    });
    setResizeTick((tick) => tick + 1);
  };

  const closeSplitView = (view: ActiveView, groupId?: string) => {
    void view;
    setViewGroups((current) => {
      const groups = normalizeViewGroups(current, projectRef.current, activeView);
      if (groups.length <= 1) {
        const single = groups[0] ?? createViewGroup(defaultViewTabs(projectRef.current), "2d", projectRef.current);
        const tabs = coreMergedViewTabs(single.tabs, projectRef.current);
        const active = tabs.includes(single.activeView) ? single.activeView : tabs[0];
        setSplitMode(false);
        setSplitRatios([1]);
        setActiveView(active);
        return [{ ...single, tabs, activeView: active }];
      }

      const sourceIndex = groupId ? groups.findIndex((group) => group.id === groupId) : groupWithView(groups, view, activeView);
      const safeSourceIndex = sourceIndex >= 0 ? sourceIndex : groups.length - 1;
      if (safeSourceIndex <= 0) return groups;
      const removedIndex = safeSourceIndex;
      const sourceGroup = groups[removedIndex];
      const targetIndex = Math.max(0, removedIndex - 1);
      const targetGroup = groups[targetIndex];
      const mergedTabs = coreMergedViewTabs([...targetGroup.tabs, ...sourceGroup.tabs], projectRef.current);
      const mergedActive = mergedTabs.includes(sourceGroup.activeView) ? sourceGroup.activeView : mergedTabs.includes(targetGroup.activeView) ? targetGroup.activeView : mergedTabs[0];
      const next = groups
        .map((group, index) => {
          if (index === targetIndex) return { ...targetGroup, tabs: mergedTabs, activeView: mergedActive };
          if (index === removedIndex) return null;
          return group;
        })
        .filter((group): group is ViewGroup => Boolean(group));

      setActiveView(mergedActive);
      if (next.length <= 1) {
        setSplitMode(false);
        setSplitRatios([1]);
      } else {
        setSplitMode(true);
        syncSplitRatios(next.length, (ratios) => ratios.filter((_, index) => index !== removedIndex));
      }
      return next;
    });
    setResizeTick((tick) => tick + 1);
  };

  const handleTabContextMenu = (event: React.MouseEvent<HTMLButtonElement>, view: ActiveView, groupId: string) => {
    if (!isViewAvailable(view, projectRef.current)) return;
    event.preventDefault();
    setSplitContextMenu({ view, groupId, x: event.clientX, y: event.clientY });
  };

  const splitViewFromMenu = (view: ActiveView, side: SplitSide, groupId = splitContextMenu?.groupId) => {
    if (!isViewAvailable(view, projectRef.current)) return;
    setSplitMode(true);
    setViewGroups((current) => {
      const groups = normalizeViewGroups(current, projectRef.current, activeView);
      const sourceIndex = groupId ? groups.findIndex((group) => group.id === groupId) : groupWithView(groups, view, activeView);
      const safeSourceIndex = sourceIndex >= 0 ? sourceIndex : activeGroupIndex(groups, activeView);
      const sourceGroup = groups[safeSourceIndex];
      const sourceTabs = sourceGroup.tabs.filter((item) => item !== view);
      const sourceReplacement = sourceTabs.length > 0 ? { ...sourceGroup, tabs: sourceTabs, activeView: sourceGroup.activeView === view ? sourceTabs[0] : sourceGroup.activeView } : null;
      const base = groups.map((group, index) => (index === safeSourceIndex ? sourceReplacement : group)).filter((group): group is ViewGroup => Boolean(group));
      const targetIndex = sourceReplacement ? safeSourceIndex : Math.max(0, safeSourceIndex - 1);
      const insertIndex = side === "left" ? targetIndex : targetIndex + 1;
      const newGroup = createViewGroup([view], view, projectRef.current);
      const next = [...base.slice(0, insertIndex), newGroup, ...base.slice(insertIndex)];
      syncSplitRatios(next.length, (ratios) => {
        const activeRatio = ratios[safeSourceIndex] ?? 1;
        const splitRatio = Math.max(0.5, activeRatio / 2);
        const nextRatios = sourceReplacement ? ratios.slice() : ratios.filter((_, index) => index !== safeSourceIndex);
        if (sourceReplacement && nextRatios[safeSourceIndex] !== undefined) nextRatios[safeSourceIndex] = splitRatio;
        nextRatios.splice(insertIndex, 0, splitRatio);
        return nextRatios;
      });
      return next;
    });
    setActiveView(view);
    setSplitContextMenu(null);
    setResizeTick((tick) => tick + 1);
  };

  const handleSplitResizerPointerDown = (event: React.PointerEvent<HTMLDivElement>, index: number) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const rect = viewContentRef.current?.getBoundingClientRect();
    if (!rect) return;
    splitResizeRef.current = {
      index,
      startX: event.clientX,
      startRatios: splitRatios.length >= renderedGroups.length ? splitRatios.slice(0, renderedGroups.length) : renderedGroups.map(() => 1),
      containerWidth: rect.width,
    };
    document.body.classList.add("resizing-pane");

    const handleMove = (pointerEvent: PointerEvent) => {
      const drag = splitResizeRef.current;
      if (!drag) return;
      const ratios = drag.startRatios.slice();
      const totalRatio = ratios.reduce((sum, ratio) => sum + ratio, 0) || 1;
      const ratioDelta = ((pointerEvent.clientX - drag.startX) / Math.max(1, drag.containerWidth)) * totalRatio;
      const minRatio = (SPLIT_PANEL_MIN_WIDTH / Math.max(1, drag.containerWidth)) * totalRatio;
      const left = ratios[drag.index] + ratioDelta;
      const right = ratios[drag.index + 1] - ratioDelta;
      if (left < minRatio || right < minRatio) return;
      ratios[drag.index] = left;
      ratios[drag.index + 1] = right;
      setSplitRatios(ratios);
      setResizeTick((tick) => tick + 1);
    };

    const handleUp = () => {
      splitResizeRef.current = null;
      document.body.classList.remove("resizing-pane");
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleUp);
      setResizeTick((tick) => tick + 1);
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleUp);
  };

  const selectColor = (id: string) => {
    updateProjectView((current) =>
      updateActiveLayerPalette(
        current,
        (active) => ({
          ...active,
          selectedColorId: id,
        }),
      ),
    );
  };

  const setTool = (tool: ToolMode) => {
    updateProjectView((current) => ({ ...current, editor: { ...current.editor, tool } }));
  };

  const toggleEditorModifier = (key: keyof EditorModifiers) => {
    updateProjectView((current) => ({
      ...current,
      editor: {
        ...current.editor,
        modifiers: {
          ...current.editor.modifiers,
          [key]: !current.editor.modifiers[key],
        },
      },
    }));
  };

  const applyPixelTransform = (mode: PixelTransformMode) => {
    commitProject((current) =>
      withSyncedActiveColorUsage(
        updateActiveLayer(current, (layer) => ({
          ...layer,
          grid: transformedGrid(layer.grid, mode),
          kernelColorGrid: layer.kernelColorGrid ? transformedGrid(layer.kernelColorGrid, mode) : null,
        })),
      ),
    );
  };

  const pickColorFromCell = (x: number, y: number) => {
    updateProjectView((current) => {
      const layer = getActiveLayer(current);
      if (!isInsideGrid(layer.grid, x, y)) return current;
      const colorId = layer.grid.cells[gridIndex(layer.grid, x, y)];
      if (!colorId || !layerActiveColorGroupColors(layer).some((color) => color.id === colorId)) return current;
      return updateActiveLayerPalette(
        current,
        (active) => ({
          ...active,
          selectedColorId: colorId,
        }),
      );
    });
  };

  const eraseConnectedComponent = (x: number, y: number) => {
    commitProject((current) => {
      const layer = getActiveLayer(current);
      if (!isInsideGrid(layer.grid, x, y)) return current;
      const target = layer.grid.cells[gridIndex(layer.grid, x, y)];
      if (!target) return current;
      const cells = layer.grid.cells.slice();
      const kernelCells = referenceGridFromLayer(current, layer)?.cells.slice() ?? null;
      const visited = new Uint8Array(cells.length);
      const queue: Array<{ x: number; y: number }> = [{ x, y }];
      visited[gridIndex(layer.grid, x, y)] = 1;
      for (let head = 0; head < queue.length; head += 1) {
        const point = queue[head];
        const index = gridIndex(layer.grid, point.x, point.y);
        cells[index] = null;
        if (kernelCells) kernelCells[index] = null;
        const neighbors = [
          { x: point.x - 1, y: point.y },
          { x: point.x + 1, y: point.y },
          { x: point.x, y: point.y - 1 },
          { x: point.x, y: point.y + 1 },
        ];
        for (const neighbor of neighbors) {
          if (!isInsideGrid(layer.grid, neighbor.x, neighbor.y)) continue;
          const index = gridIndex(layer.grid, neighbor.x, neighbor.y);
          if (visited[index] || layer.grid.cells[index] !== target) continue;
          visited[index] = 1;
          queue.push(neighbor);
        }
      }
      return updateActiveLayer(current, (active) => ({
        ...active,
        grid: { ...active.grid, cells },
        kernelColorGrid: kernelCells ? { ...active.grid, cells: kernelCells } : active.kernelColorGrid,
      }));
    });
  };

  const fillConnectedComponent = (x: number, y: number) => {
    commitProject((current) => {
      const layer = getActiveLayer(current);
      if (!isInsideGrid(layer.grid, x, y)) return current;
      const target = layer.grid.cells[gridIndex(layer.grid, x, y)];
      const replacementId = layer.selectedColorId;
      if (!replacementId || target === replacementId) return current;
      const replacementColor = layerActiveColorGroupColors(layer).find((item) => item.id === replacementId);
      if (!replacementColor) return current;
      const cells = layer.grid.cells.slice();
      const kernelCells = referenceGridFromLayer(current, layer)?.cells.slice() ?? null;
      const visited = new Uint8Array(cells.length);
      const queue: Array<{ x: number; y: number }> = [{ x, y }];
      visited[gridIndex(layer.grid, x, y)] = 1;
      for (let head = 0; head < queue.length; head += 1) {
        const point = queue[head];
        const index = gridIndex(layer.grid, point.x, point.y);
        cells[index] = replacementId;
        if (kernelCells) kernelCells[index] = normalizeHex(replacementColor.hex);
        const neighbors = [
          { x: point.x - 1, y: point.y },
          { x: point.x + 1, y: point.y },
          { x: point.x, y: point.y - 1 },
          { x: point.x, y: point.y + 1 },
        ];
        for (const neighbor of neighbors) {
          if (!isInsideGrid(layer.grid, neighbor.x, neighbor.y)) continue;
          const neighborIndex = gridIndex(layer.grid, neighbor.x, neighbor.y);
          if (visited[neighborIndex] || layer.grid.cells[neighborIndex] !== target) continue;
          visited[neighborIndex] = 1;
          queue.push(neighbor);
        }
      }
      return updateActiveLayer(current, (active) => ({
        ...active,
        grid: { ...active.grid, cells },
        kernelColorGrid: kernelCells ? { ...active.grid, cells: kernelCells } : active.kernelColorGrid,
      }));
    });
  };

  const clearGrid = () => {
    commitProject((current) => {
      const next = updateActiveLayer(current, (layer) => {
        const grid = { ...layer.grid, cells: layer.grid.cells.map(() => null) };
        const kernelColorGrid = layer.kernelColorGrid ? { ...layer.kernelColorGrid, cells: layer.kernelColorGrid.cells.map(() => null) } : null;
        return { ...layer, grid, kernelColorGrid };
      });
      return { ...next, editor: centeredEditor(next.editor, getActiveLayer(next).grid, canvasRef.current) };
    });
    setStatus(UI.clearCanvas);
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const isPrimaryEdit = event.button === 0;
    const panView = event.button === 1;
    if (!isPrimaryEdit && !panView) return;
    canvas.setPointerCapture(event.pointerId);
    if (panView) event.preventDefault();
    const cell = pointerToCell(event);
    historyBaseRef.current = panView ? null : projectRef.current;
    dragRef.current = {
      active: true,
      panView,
      lastCell: cell,
      lastPoint: { x: event.clientX, y: event.clientY },
    };
    if (isPrimaryEdit && project.editor.tool === "magic-eraser") {
      eraseConnectedComponent(cell.x, cell.y);
    } else if (isPrimaryEdit && project.editor.tool === "paint-bucket") {
      fillConnectedComponent(cell.x, cell.y);
    } else if (isPrimaryEdit && project.editor.tool === "picker") {
      pickColorFromCell(cell.x, cell.y);
    } else if (isPrimaryEdit && (project.editor.tool === "brush" || project.editor.tool === "eraser")) {
      paintCell(cell.x, cell.y, event.shiftKey);
    }
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (!drag.active) return;

    if (drag.panView) {
      const lastPoint = drag.lastPoint;
      if (!lastPoint) return;
      const dx = event.clientX - lastPoint.x;
      const dy = event.clientY - lastPoint.y;
      updateProjectView((current) => ({
        ...current,
        editor: { ...current.editor, offsetX: current.editor.offsetX + dx, offsetY: current.editor.offsetY + dy },
      }));
      dragRef.current.lastPoint = { x: event.clientX, y: event.clientY };
      return;
    }

    if (project.editor.tool === "magic-eraser" || project.editor.tool === "paint-bucket" || project.editor.tool === "picker") return;

    if (project.editor.tool === "brush" || project.editor.tool === "eraser") {
      const cell = pointerToCell(event);
      paintCell(cell.x, cell.y, event.shiftKey);
      dragRef.current.lastCell = cell;
      return;
    }

    if (project.editor.tool === "move") {
      const cell = pointerToCell(event);
      const lastCell = drag.lastCell;
      if (lastCell && (cell.x !== lastCell.x || cell.y !== lastCell.y)) {
        commitProject((current) =>
          updateActiveLayer(current, (layer) => ({
            ...layer,
            grid: shiftGrid(layer.grid, cell.x - lastCell.x, cell.y - lastCell.y),
            kernelColorGrid: layer.kernelColorGrid ? shiftGrid(layer.kernelColorGrid, cell.x - lastCell.x, cell.y - lastCell.y) : null,
          })),
        historyBaseRef.current ?? undefined);
        dragRef.current.lastCell = cell;
      }
      return;
    }

    const lastPoint = drag.lastPoint;
    if (!lastPoint) return;
    const dx = event.clientX - lastPoint.x;
    const dy = event.clientY - lastPoint.y;
    updateProjectView((current) => ({
      ...current,
      editor: { ...current.editor, offsetX: current.editor.offsetX + dx, offsetY: current.editor.offsetY + dy },
    }));
    dragRef.current.lastPoint = { x: event.clientX, y: event.clientY };
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (canvas?.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    dragRef.current = { active: false, panView: false, lastCell: null, lastPoint: null };
    historyBaseRef.current = null;
    historyTransactionActiveRef.current = false;
  };

  const handleCropPointerDown = (event: React.PointerEvent<HTMLElement>, handle: CropDragHandle) => {
    if (!imageAnalysis || !imageFrameRef.current) return;
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    historyBaseRef.current = projectRef.current;
    cropDragRef.current = {
      handle,
      startX: event.clientX,
      startY: event.clientY,
      startGeometry: {
        cropLeft: activeImageGeometry.cropLeft,
        cropTop: activeImageGeometry.cropTop,
        cropRight: activeImageGeometry.cropRight,
        cropBottom: activeImageGeometry.cropBottom,
      },
    };
  };

  const handleCropPointerMove = (event: React.PointerEvent<HTMLElement>) => {
    const drag = cropDragRef.current;
    const frame = imageFrameRef.current;
    if (!drag || !frame || !imageAnalysis) return;
    event.preventDefault();
    const rect = frame.getBoundingClientRect();
    const baseWidth = Math.max(1, rect.width);
    const baseHeight = Math.max(1, rect.height);
    const dx = ((event.clientX - drag.startX) / baseWidth) * imageAnalysis.width;
    const dy = ((event.clientY - drag.startY) / baseHeight) * imageAnalysis.height;
    const start = cropRectFromGeometry({ ...activeImageGeometry, ...drag.startGeometry }, imageAnalysis.width, imageAnalysis.height);
    let next = { ...start };
    const moveLeft = drag.handle.includes("left");
    const moveRight = drag.handle.includes("right");
    const moveTop = drag.handle.includes("top");
    const moveBottom = drag.handle.includes("bottom");

    if (drag.handle === "move") {
      const width = start.right - start.left;
      const height = start.bottom - start.top;
      const left = clamp(Math.round(start.left + dx), 0, imageAnalysis.width - width);
      const top = clamp(Math.round(start.top + dy), 0, imageAnalysis.height - height);
      next = { left, top, right: left + width, bottom: top + height };
    } else {
      if (moveLeft) next.left = clamp(Math.round(start.left + dx), 0, next.right - 1);
      if (moveRight) next.right = clamp(Math.round(start.right + dx), next.left + 1, imageAnalysis.width);
      if (moveTop) next.top = clamp(Math.round(start.top + dy), 0, next.bottom - 1);
      if (moveBottom) next.bottom = clamp(Math.round(start.bottom + dy), next.top + 1, imageAnalysis.height);
    }

    commitProject(
      (current) =>
        updateActiveLayer(current, (layer) => ({
          ...layer,
          imageCrop: geometryFromCropRect(layerImageGeometry(current, layer), next, imageAnalysis.width, imageAnalysis.height),
        })),
      historyBaseRef.current ?? undefined,
    );
    updateLayerImageUi(activeLayer.id, (current) => ({ ...current, dirty: true }));
  };

  const handleCropPointerUp = (event: React.PointerEvent<HTMLElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    cropDragRef.current = null;
    historyBaseRef.current = null;
    historyTransactionActiveRef.current = false;
  };

  const handleWheel = (event: React.WheelEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const pointerX = event.clientX - rect.left;
    const pointerY = event.clientY - rect.top;

    updateProjectView((current) => {
      const oldZoom = current.editor.zoom;
      const zoom = clamp(oldZoom * (event.deltaY < 0 ? 1.1 : 0.9), 0.35, 5);
      const ratio = zoom / oldZoom;
      return {
        ...current,
        editor: {
          ...current.editor,
          zoom,
          offsetX: pointerX - (pointerX - current.editor.offsetX) * ratio,
          offsetY: pointerY - (pointerY - current.editor.offsetY) * ratio,
        },
      };
    });
  };

  const handleImageWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const stage = imageStageRef.current;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    const viewportElement = stage.firstElementChild instanceof HTMLElement ? stage.firstElementChild : null;
    const originX = viewportElement?.offsetLeft ?? 0;
    const originY = viewportElement?.offsetTop ?? 0;
    const pointerX = event.clientX - rect.left;
    const pointerY = event.clientY - rect.top;
    updateLayerImageUi(activeLayer.id, (current) => {
      const zoom = clamp(current.viewport.zoom * (event.deltaY < 0 ? 1.1 : 0.9), 0.25, 8);
      const ratio = zoom / current.viewport.zoom;
      return {
        ...current,
        viewport: {
          zoom,
          offsetX: pointerX - originX - (pointerX - originX - current.viewport.offsetX) * ratio,
          offsetY: pointerY - originY - (pointerY - originY - current.viewport.offsetY) * ratio,
        },
      };
    });
  };

  const handleImagePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 1) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    imagePanRef.current = {
      active: true,
      lastPoint: { x: event.clientX, y: event.clientY },
    };
  };

  const handleImagePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const pan = imagePanRef.current;
    if (!pan.active || !pan.lastPoint) return;
    event.preventDefault();
    const dx = event.clientX - pan.lastPoint.x;
    const dy = event.clientY - pan.lastPoint.y;
    updateLayerImageUi(activeLayer.id, (current) => ({
      ...current,
      viewport: {
        ...current.viewport,
        offsetX: current.viewport.offsetX + dx,
        offsetY: current.viewport.offsetY + dy,
      },
    }));
    imagePanRef.current.lastPoint = { x: event.clientX, y: event.clientY };
  };

  const handleImagePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    imagePanRef.current = { active: false, lastPoint: null };
  };

  const tools: Array<{ tool: ToolMode; icon: JSX.Element; title: string }> = [
    { tool: "brush", icon: <Brush size={18} />, title: UI.brush },
    { tool: "eraser", icon: <Eraser size={18} />, title: UI.eraser },
    { tool: "magic-eraser", icon: <WandSparkles size={18} />, title: UI.magicEraser },
    { tool: "paint-bucket", icon: <PaintBucket size={18} />, title: UI.paintBucket },
    { tool: "picker", icon: <Pipette size={18} />, title: UI.picker },
    { tool: "move", icon: <Move size={18} />, title: UI.movePixels },
  ];
  const modifiers: Array<{ key: keyof EditorModifiers; icon: JSX.Element; title: string }> = [
    { key: "showCenterGuides", icon: <Crosshair size={18} />, title: UI.centerGuides },
    { key: "highlightColorOutline", icon: <Scan size={18} />, title: UI.highlightColorOutline },
    { key: "mirrorDrawX", icon: <FoldHorizontal size={18} />, title: UI.mirrorDrawX },
    { key: "mirrorDrawY", icon: <FoldVertical size={18} />, title: UI.mirrorDrawY },
    { key: "mirrorDrawDiagonalGreen", icon: <MoveDiagonal size={18} />, title: UI.mirrorDrawDiagonalGreen },
    { key: "mirrorDrawDiagonalPurple", icon: <MoveDiagonal2 size={18} />, title: UI.mirrorDrawDiagonalPurple },
    { key: "rotateDrawHalf", icon: <RotateCw size={18} />, title: UI.rotateDrawHalf },
    { key: "rotateDrawQuarter", icon: <RotateCwSquare size={18} />, title: UI.rotateDrawQuarter },
  ];
  const transformActions: Array<{ mode: PixelTransformMode; icon: JSX.Element; title: string }> = [
    { mode: "negative-x-to-positive-x", icon: <ArrowRightToLine size={18} />, title: UI.copyLeftToRight },
    { mode: "positive-x-to-negative-x", icon: <ArrowLeftToLine size={18} />, title: UI.copyRightToLeft },
    { mode: "negative-y-to-positive-y", icon: <ArrowUpToLine size={18} />, title: UI.copyBottomToTop },
    { mode: "positive-y-to-negative-y", icon: <ArrowDownToLine size={18} />, title: UI.copyTopToBottom },
  ];
  const themeOptions: Array<{ mode: ThemeMode; icon: JSX.Element; title: string }> = [
    { mode: "system", icon: <Monitor size={17} />, title: UI.themeSystem },
    { mode: "light", icon: <Sun size={17} />, title: UI.themeLight },
    { mode: "dark", icon: <Moon size={17} />, title: UI.themeDark },
  ];
  const cropOverlay = imageAnalysis
    ? percentRect(
        cropRectFromGeometry(activeImageGeometry, imageAnalysis.width, imageAnalysis.height),
        imageAnalysis.width,
        imageAnalysis.height,
      )
    : null;
  const componentOverlay =
    imageAnalysis?.componentBounds && cropOverlay
      ? percentRect(
          {
            left: imageAnalysis.componentBounds.left,
            top: imageAnalysis.componentBounds.top,
            right: imageAnalysis.componentBounds.right + 1,
            bottom: imageAnalysis.componentBounds.bottom + 1,
          },
          imageAnalysis.width,
          imageAnalysis.height,
        )
      : null;
  const kernelLines = useMemo(() => {
    if (!showKernelPreview || !cropOverlay) return [];
    const lines: Array<{ key: string; className: string; style: CSSProperties }> = [];
    for (let x = 1; x < activeGrid.width; x += 1) {
      lines.push({
        key: `v-${x}`,
        className: "kernel-line vertical",
        style: { left: `${(x / activeGrid.width) * 100}%` },
      });
    }
    for (let y = 1; y < activeGrid.height; y += 1) {
      lines.push({
        key: `h-${y}`,
        className: "kernel-line horizontal",
        style: { top: `${(y / activeGrid.height) * 100}%` },
      });
    }
    return lines;
  }, [activeGrid.height, activeGrid.width, cropOverlay, showKernelPreview]);
  const normalizedViewGroups = normalizeViewGroups(viewGroups, project, activeView);
  const renderedGroups = splitMode ? normalizedViewGroups : [normalizedViewGroups[activeGroupIndex(normalizedViewGroups, activeView)] ?? normalizedViewGroups[0]];
  const workspaceStyle = {
    "--left-pane-width": `${leftPaneCollapsed ? COLLAPSED_PANE_RAIL_WIDTH : leftPaneWidth}px`,
    "--right-pane-width": `${rightPaneCollapsed ? COLLAPSED_PANE_RAIL_WIDTH : rightPaneWidth}px`,
  } as CSSProperties;
  const splitGridColumns = splitMode
    ? renderedGroups.map((_, index) => `${Math.max(0.1, splitRatios[index] ?? 1)}fr`).join(" 6px ")
    : undefined;

  const renderImageView = () => (
    <section
      className={`image-view-pane ${activeLayer.sourceImage ? "" : "empty"} ${imageDropActive ? "drop-active" : ""}`}
      aria-label="image view"
      onPointerDown={() => {
        activeViewRef.current = "image";
        setActiveView("image");
      }}
      onDragEnter={handleImageDragOver}
      onDragOver={handleImageDragOver}
      onDragLeave={handleImageDragLeave}
      onDrop={handleImageDrop}
    >
      <div className="image-control-strip">
        <div className="image-control-group import-group">
          <button type="button" className="text-button image-import-button" onClick={resetImage} title={UI.resetImage} disabled={!activeLayer.sourceImage}>
            <RotateCcw size={16} />
            <span>{UI.resetImage}</span>
          </button>
        </div>
        {activeLayer.sourceImage ? (
          <>
            <div className="image-control-group image-param-group">
              <label className="algorithm-field">
                <span>{UI.pixelAlgorithm}</span>
                <select value={pixelAlgorithm} onChange={(event) => setPixelAlgorithm(event.target.value as PixelAlgorithm)}>
                  {PIXEL_ALGORITHMS.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="count-field">
                <span>{UI.colorCount}</span>
                <input type="number" min="1" max="32" step="1" value={colorCount} onChange={(event) => updateColorCount(Number(event.target.value))} />
              </label>
              <label className="mapping-field">
                <span>{UI.mappingMode}</span>
                <select value={mappingMode} onChange={(event) => setMappingMode(event.target.value as ImageMappingMode)}>
                  <option value="palette">{UI.mapPalette}</option>
                  <option value="auto">{UI.mapAuto}</option>
                </select>
              </label>
              <label className="tolerance-field">
                <span>{UI.imageTolerance}</span>
                <input
                  type="number"
                  min="0"
                  max="80"
                  step="0.5"
                  value={activeImageGeometry.imageTolerance}
                  onChange={(event) => updateGeometry("imageTolerance", Number(event.target.value))}
                />
              </label>
            </div>
            <div className="image-control-group image-rotation-group">
              <label className="rotation-field">
                <span>{UI.rotationAngle}</span>
                <input type="number" min="0" max="359" step="1" value={imageRotation} onChange={(event) => void updateImageRotation(Number(event.target.value))} />
              </label>
              <div className="image-rotate-controls" aria-label="image rotation">
                <button type="button" className="tool-button image-rotate-button" onClick={() => void rotateImageView(-1)} title={UI.rotateLeft}>
                  <RotateCcw size={16} />
                </button>
                <button type="button" className="tool-button image-rotate-button" onClick={() => void rotateImageView(1)} title={UI.rotateRight}>
                  <RotateCw size={16} />
                </button>
              </div>
            </div>
            <div className="image-control-group image-action-group">
              <label className="checkbox-field image-checkbox-field">
                <input type="checkbox" checked={showKernelPreview} onChange={(event) => setShowKernelPreview(event.target.checked)} />
                <span>{UI.kernelPreview}</span>
              </label>
              <button type="button" className={`text-button convert-button ${imageDirty ? "attention" : "primary"}`} onClick={convertCroppedImage}>
                {UI.cropConvert}
              </button>
            </div>
          </>
        ) : null}
      </div>
      {activeLayer.sourceImage ? (
        <>
          <div
            className="image-stage"
            ref={imageStageRef}
            onWheel={handleImageWheel}
            onPointerDown={handleImagePointerDown}
            onPointerMove={handleImagePointerMove}
            onPointerUp={handleImagePointerUp}
            onPointerCancel={handleImagePointerUp}
            onAuxClick={(event) => event.preventDefault()}
          >
            <div className="image-viewport" style={{ transform: `translate(${imageViewport.offsetX}px, ${imageViewport.offsetY}px) scale(${imageViewport.zoom})` }}>
              <div className="image-frame" ref={imageFrameRef}>
                <img src={imageViewSource?.dataUrl ?? activeLayer.sourceImage.dataUrl} alt={activeLayer.sourceImage.name} draggable={false} />
                {cropOverlay ? (
                  <span
                    className="crop-overlay"
                    style={cropOverlay}
                    onPointerDown={(event) => handleCropPointerDown(event, "move")}
                    onPointerMove={handleCropPointerMove}
                    onPointerUp={handleCropPointerUp}
                    onPointerCancel={handleCropPointerUp}
                  >
                    {(["top-left", "top", "top-right", "right", "bottom-right", "bottom", "bottom-left", "left"] as CropDragHandle[]).map((handle) => (
                      <i
                        key={handle}
                        className={`crop-handle ${handle}`}
                        onPointerDown={(event) => handleCropPointerDown(event, handle)}
                        onPointerMove={handleCropPointerMove}
                        onPointerUp={handleCropPointerUp}
                        onPointerCancel={handleCropPointerUp}
                      />
                    ))}
                    {kernelLines.map((line) => (
                      <i key={line.key} className={line.className} style={line.style} />
                    ))}
                  </span>
                ) : null}
                {componentOverlay ? <span className="component-overlay" style={componentOverlay} /> : null}
              </div>
            </div>
          </div>
          <div className="image-status">
            <span>{imageAnalysis ? `${imageAnalysis.width} x ${imageAnalysis.height}` : activeLayer.sourceImage.name}</span>
            <span>{imageAnalysis ? `${imageAnalysis.outputWidth} x ${imageAnalysis.outputHeight}` : `${activeGrid.width} x ${activeGrid.height}`}</span>
            <span>{imageAnalysis ? `${imageAnalysis.components.length} CC` : `${usedColorCount} ${UI.colors}`}</span>
            <span>{Math.round(imageViewport.zoom * 100)}%</span>
            <span>{imageRotation}\u00b0</span>
            {imageDirty ? <span className="dirty-state">{UI.needsReparse}</span> : null}
          </div>
        </>
      ) : (
        <>
          <button type="button" className="image-empty-state" onClick={importImage} aria-label={UI.dropImage}>
            <ImageUp size={34} />
            <strong>{UI.noImage}</strong>
            <span>{UI.dropImage}</span>
          </button>
          <div className="image-status">
            <span>{activeGrid.width} x {activeGrid.height}</span>
            <span>{UI.noImage}</span>
          </div>
        </>
      )}
    </section>
  );

  const renderEditorView = () => (
    <section className="editor-pane" aria-label="pixel editor">
      <div className="editor-tool-strip" aria-label="2D editor tools">
        <div className="toolbar-group tool-group editor-tool-group">
          {tools.map((item) => (
            <button
              key={item.tool}
              type="button"
              className={`tool-button ${project.editor.tool === item.tool ? "active" : ""}`}
              onClick={() => setTool(item.tool)}
              title={item.title}
            >
              {item.icon}
            </button>
          ))}
        </div>
        <div className="toolbar-group tool-group editor-view-group">
          <button
            type="button"
            className={`tool-button ${project.editor.tool === "pan" ? "active" : ""}`}
            onClick={() => setTool("pan")}
            title={UI.panView}
          >
            <Hand size={18} />
          </button>
          <button
            type="button"
            className={`tool-button ${mirrorX ? "active" : ""}`}
            onClick={() => setMirrorX((current) => !current)}
            aria-pressed={mirrorX}
            title={UI.mirrorX}
          >
            <FlipHorizontal2 size={18} />
          </button>
          <button
            type="button"
            className={`tool-button ${mirrorY ? "active" : ""}`}
            onClick={() => setMirrorY((current) => !current)}
            aria-pressed={mirrorY}
            title={UI.mirrorY}
          >
            <FlipVertical2 size={18} />
          </button>
        </div>
        <div className="toolbar-group tool-group editor-modifier-group">
          {modifiers.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`tool-button ${project.editor.modifiers[item.key] ? "active" : ""}`}
              onClick={() => toggleEditorModifier(item.key)}
              aria-pressed={project.editor.modifiers[item.key]}
              title={item.title}
            >
              {item.icon}
            </button>
          ))}
        </div>
        <div className="toolbar-group tool-group editor-flip-group">
          {transformActions.map((item) => (
            <button
              key={item.mode}
              type="button"
              className="tool-button"
              onClick={() => applyPixelTransform(item.mode)}
              title={item.title}
            >
              {item.icon}
            </button>
          ))}
        </div>
        <div className="toolbar-group tool-group editor-canvas-action-group">
          <button type="button" className="tool-button" onClick={clearGrid} title={UI.clearCanvas}>
            <X size={18} />
          </button>
        </div>
      </div>
      <canvas
        ref={canvasRef}
        className={`pixel-canvas tool-${project.editor.tool}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onContextMenu={openCanvasReplaceContextMenu}
        onAuxClick={(event) => event.preventDefault()}
        onWheel={handleWheel}
      />
      <div className="canvas-status">
        <span>{toolLabel(project.editor.tool)}</span>
        <span>{selectedColor ? `${selectedColor.code} ${selectedColor.hex.toUpperCase()}` : UI.noBead}</span>
        <span>{Math.round(project.editor.zoom * 100)}%</span>
        <span>{UI.width} {activeModelMetrics.width.toFixed(1)} mm</span>
        <span>{UI.depth} {activeModelMetrics.depth.toFixed(1)} mm</span>
        <span>{UI.thick} {activeModelMetrics.thick.toFixed(1)} mm</span>
      </div>
    </section>
  );

  const renderPreviewView = () => (
    <aside className="preview-pane" aria-label="3D preview">
      <ThreePreview layers={visiblePreviewLayers} colors={activeColors} geometry={project.geometry} theme={resolvedTheme} />
      <div className="preview-metrics">
        <span>{UI.width} {previewModelMetrics.width.toFixed(1)}</span>
        <span>{UI.depth} {previewModelMetrics.depth.toFixed(1)}</span>
        <span>{UI.thick} {previewModelMetrics.thick.toFixed(1)}</span>
      </div>
    </aside>
  );

  const renderViewContent = (view: ActiveView) => {
    if (view === "image") return renderImageView();
    if (view === "2d") return renderEditorView();
    return renderPreviewView();
  };

  return (
    <div className="app-shell" data-theme={resolvedTheme}>
      <input ref={imageInputRef} type="file" accept="image/*,.png,.jpg,.jpeg,.webp,.gif,.bmp,.avif" hidden onChange={handleImageFile} />
      <input ref={projectZipInputRef} type="file" accept=".zip,application/zip" hidden onChange={handleProjectZipInput} />

      <header className="app-header">
        <div className="brand-block">
          <h1>Pixel Studio</h1>
          <p>{activeLayer.sourceImage ? `${activeLayer.name} / ${activeLayer.sourceImage.name}` : UI.noImage}</p>
        </div>
        <div className="top-toolbar" aria-label="main toolbar">
          <div className="toolbar-group">
            <button type="button" className="dock-button guide-button" onClick={() => setGuideOpen(true)} title={UI.guide}>
              <Info size={18} />
              <span>{UI.guide}</span>
            </button>
          </div>
          <div className="toolbar-group">
            <button type="button" className="tool-button" onClick={undoProject} disabled={history.past.length === 0} title={`${UI.undo} Ctrl+Z`}>
              <Undo2 size={18} />
            </button>
            <button type="button" className="tool-button" onClick={redoProject} disabled={history.future.length === 0} title={`${UI.redo} Ctrl+Shift+Z`}>
              <Redo2 size={18} />
            </button>
          </div>
          <div className="toolbar-group tool-group theme-group" aria-label={UI.theme}>
            {themeOptions.map((item) => (
              <button
                key={item.mode}
                type="button"
                className={`tool-button ${themeMode === item.mode ? "active" : ""}`}
                onClick={() => setThemeMode(item.mode)}
                title={item.title}
              >
                {item.icon}
              </button>
            ))}
          </div>
          <div className="toolbar-group">
            <button type="button" className="dock-button ghost" onClick={importProjectZip} disabled={zipProgress.active} title={UI.importZip}>
              <ImageUp size={19} />
              <span>{UI.importZip}</span>
            </button>
            <button type="button" className="dock-button primary" onClick={openExportDialog} disabled={zipProgress.active} title={UI.exportStl}>
              <Download size={19} />
              <span>{UI.exportStl}</span>
            </button>
            <button type="button" className="dock-button ghost" onClick={resetProject} title={UI.resetProject}>
              <RotateCcw size={19} />
              <span>{UI.resetProject}</span>
            </button>
          </div>
        </div>
        <div className="header-meta">
          <div className="header-stats">
            <span>{activeGrid.width} x {activeGrid.height}</span>
            <span>{filledCells} {UI.cells}</span>
            <span>{usedColorCount} {UI.colors}</span>
          </div>
          <div className={`dock-status ${zipProgress.active ? "with-progress" : ""}`}>
            <span>{status}</span>
          </div>
        </div>
      </header>

      {zipProgress.active ? (
        <div className="zip-progress-overlay" role="status" aria-live="polite" aria-label={zipProgress.label}>
          <span className="zip-progress-overlay-title">{zipProgress.label}</span>
          <span className="zip-progress">
            <span className="zip-progress-track">
              <span className="zip-progress-fill" style={{ width: `${zipProgress.value}%` }} />
            </span>
            <span className="zip-progress-label">{Math.round(zipProgress.value)}%</span>
          </span>
          <button type="button" className="zip-progress-cancel" onClick={cancelActiveExport}>
            {UI.cancel}
          </button>
        </div>
      ) : null}

      {zipCompleteNotice ? (
        <div className="zip-complete-toast" role="status" aria-live="polite">
          <div>
            <strong>{UI.zipCompleteTitle}</strong>
            <span>{`${zipCompleteNotice.kind === "saved" ? UI.zipSaved : UI.zipDownloaded}: ${zipCompleteNotice.fileName}`}</span>
          </div>
          <p>{UI.zipLocationNotice}</p>
          <button type="button" className="text-button primary" onClick={() => setZipCompleteNotice(null)}>
            {UI.gotIt}
          </button>
        </div>
      ) : null}

      <main className={`workspace ${leftPaneCollapsed ? "left-pane-collapsed" : ""}`} style={workspaceStyle}>
        <div className="left-pane-slot">
          {leftPaneCollapsed ? (
            <button type="button" className="left-pane-restore" onClick={restoreLeftPane} title={UI.restoreLeftPane}>
              <PanelLeftOpen size={17} />
            </button>
          ) : (
            <aside className="model-pane" aria-label="model settings">
              <section className={`settings-section collapsible-section ${collapsedLeftSections.grid ? "collapsed" : ""}`}>
                <div className="section-heading">
                  <button type="button" className="section-toggle" onClick={() => toggleLeftSection("grid")} aria-expanded={!collapsedLeftSections.grid}>
                    {collapsedLeftSections.grid ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                    <h2>{UI.gridSettings}</h2>
                  </button>
                </div>
                <div className="section-content field-grid">
                  <label>
                    <span>{UI.gridColumns}</span>
                    <input
                      type="number"
                      min="1"
                      max="256"
                      step="1"
                      value={activeGrid.width}
                      onChange={(event) => updateGridSize("width", Number(event.target.value))}
                    />
                  </label>
                  <label>
                    <span>{UI.gridRows}</span>
                    <input
                      type="number"
                      min="1"
                      max="256"
                      step="1"
                      value={activeGrid.height}
                      onChange={(event) => updateGridSize("height", Number(event.target.value))}
                    />
                  </label>
                </div>
              </section>

              <section className={`settings-section collapsible-section ${collapsedLeftSections.model ? "collapsed" : ""}`}>
                <div className="section-heading">
                  <button type="button" className="section-toggle" onClick={() => toggleLeftSection("model")} aria-expanded={!collapsedLeftSections.model}>
                    {collapsedLeftSections.model ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                    <h2>{UI.modelSettings}</h2>
                  </button>
                </div>
                <div className="section-content field-grid">
                  <label>
                    <span>{UI.blockSize}</span>
                    <input
                      type="number"
                      min="0.5"
                      step="0.1"
                      value={project.geometry.blockSize}
                      onChange={(event) => updateGeometry("blockSize", Number(event.target.value))}
                    />
                  </label>
                  <label>
                    <span>{UI.fitGap}</span>
                    <input
                      type="number"
                      min="0"
                      step="0.05"
                      value={project.geometry.fitGap}
                      onChange={(event) => updateGeometry("fitGap", Number(event.target.value))}
                    />
                  </label>
                  <label>
                    <span>{UI.blockHeight}</span>
                    <input
                      type="number"
                      min="0.1"
                      step="0.1"
                      value={project.geometry.blockHeight}
                      onChange={(event) => updateGeometry("blockHeight", Number(event.target.value))}
                    />
                  </label>
                  <label>
                    <span>{UI.plateHeight}</span>
                    <input
                      type="number"
                      min="0.1"
                      step="0.1"
                      value={project.geometry.plateHeight}
                      onChange={(event) => updateGeometry("plateHeight", Number(event.target.value))}
                    />
                  </label>
                  <label>
                    <span>{UI.gridLineWidth}</span>
                    <input
                      type="number"
                      min="0.05"
                      step="0.05"
                      value={project.geometry.gridLineWidth}
                      onChange={(event) => updateGeometry("gridLineWidth", Number(event.target.value))}
                    />
                  </label>
                  <label>
                    <span>{UI.blockChamfer}</span>
                    <input
                      type="number"
                      min="0"
                      step="0.05"
                      value={project.geometry.blockChamfer}
                      onChange={(event) => updateGeometry("blockChamfer", Number(event.target.value))}
                    />
                  </label>
                </div>
              </section>

              <section className={`settings-section collapsible-section ${collapsedLeftSections.layers ? "collapsed" : ""}`}>
                <div className="section-heading">
                  <button type="button" className="section-toggle" onClick={() => toggleLeftSection("layers")} aria-expanded={!collapsedLeftSections.layers}>
                    {collapsedLeftSections.layers ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                    <span className="section-title-stack">
                      <h2>{UI.layers}</h2>
                      <span className="section-subtitle">{UI.activeLayer}: {activeLayer.name}</span>
                    </span>
                  </button>
                  <button type="button" className="icon-button" onClick={addLayer} title={UI.newLayer}>
                    <Plus size={16} />
                  </button>
                </div>
                <div className="layer-toolbar">
                  <div className="layer-toolbar-actions">
                    <button type="button" className="layer-toolbar-button" onClick={showAllLayers} title={UI.showAllLayers}>
                      <Eye size={14} />
                      <span>{UI.showAllLayers}</span>
                    </button>
                    <button type="button" className="layer-toolbar-button" onClick={hideInactiveLayers} title={UI.hideInactiveLayers}>
                      <EyeOff size={14} />
                      <span>{UI.hideInactiveLayers}</span>
                    </button>
                  </div>
                  <label className="checkbox-field layer-auto-hide">
                    <input type="checkbox" checked={autoHideInactiveLayers} onChange={(event) => toggleAutoHideInactiveLayers(event.target.checked)} />
                    <span>{UI.autoHideInactiveLayers}</span>
                  </label>
                </div>
                <div className={`section-content layer-list ${layerSort ? "sorting" : ""}`}>
                  {(layerSort ? reorderLayersByIds(project.layers, layerSort.previewIds) : project.layers).map((layer) => (
                    <div
                      key={layer.id}
                      ref={(element) => {
                        if (element) layerRowRefs.current.set(layer.id, element);
                        else layerRowRefs.current.delete(layer.id);
                      }}
                      className={`layer-row ${layer.id === project.activeLayerId ? "active" : ""} ${layerSort?.layerId === layer.id ? "dragging" : ""}`}
                      role="button"
                      tabIndex={0}
                      onClick={() => selectLayer(layer.id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          selectLayer(layer.id);
                        }
                      }}
                    >
                      <span
                        className="layer-drag-handle"
                        title="拖拽排序"
                        aria-hidden="true"
                        onPointerDown={(event) => handleLayerDragPointerDown(event, layer.id)}
                      >
                        <GripVertical size={15} />
                      </span>
                      <button
                        type="button"
                        className="icon-button layer-eye"
                        onClick={(event) => {
                          event.stopPropagation();
                          toggleLayerVisible(layer.id);
                        }}
                        title={layer.visible ? UI.hideLayer : UI.showLayer}
                      >
                        {layer.visible ? <Eye size={15} /> : <EyeOff size={15} />}
                      </button>
                      <input
                        value={layer.name}
                        onClick={(event) => event.stopPropagation()}
                        onPointerDown={(event) => event.stopPropagation()}
                        onChange={(event) => renameLayer(layer.id, event.target.value)}
                        aria-label={UI.layers}
                      />
                      <div className="layer-actions">
                        <button
                          type="button"
                          className="icon-button"
                          onClick={(event) => {
                            event.stopPropagation();
                            duplicateLayer(layer.id);
                          }}
                          title={UI.duplicateLayer}
                        >
                          <Copy size={14} />
                        </button>
                        <button
                          type="button"
                          className="icon-button danger"
                          onClick={(event) => {
                            event.stopPropagation();
                            deleteLayer(layer.id);
                          }}
                          disabled={project.layers.length <= 1}
                          title={UI.deleteLayer}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </aside>
          )}
          <div className="left-pane-resizer" role="separator" aria-orientation="vertical" onPointerDown={handleLeftPanePointerDown} />
        </div>

        <section className="view-pane" aria-label="views">
          <div
            ref={viewContentRef}
            className={`view-content ${splitMode ? "split" : "single"}`}
            style={splitGridColumns ? ({ gridTemplateColumns: splitGridColumns } as CSSProperties) : undefined}
          >
            {renderedGroups.map((group, index) => (
              <Fragment key={group.id}>
                <section className={`split-panel split-panel-${group.activeView}`} aria-label={viewLabel(group.activeView)}>
                  <div className={`split-panel-tabs ${tabSort?.groupId === group.id ? "sorting" : ""}`} role="tablist" aria-label="view switcher">
                    {(tabSort?.groupId === group.id ? tabSort.previewTabs : group.tabs).map((view) => (
                      <button
                        key={view}
                        ref={(element) => {
                          const key = tabKey(group.id, view);
                          if (element) tabButtonRefs.current.set(key, element);
                          else tabButtonRefs.current.delete(key);
                        }}
                        type="button"
                        role="tab"
                        aria-selected={group.activeView === view}
                        className={`tab-button ${group.activeView === view ? "active" : ""} ${tabSort?.groupId === group.id && tabSort.view === view ? "dragging" : ""}`}
                        onPointerDown={(event) => handleTabPointerDown(event, group, view)}
                        onClick={(event) => {
                          if (ignoreNextTabClickRef.current) {
                            event.preventDefault();
                            ignoreNextTabClickRef.current = false;
                            return;
                          }
                          setSplitContextMenu(null);
                          setActiveView(view);
                          setViewGroups((current) => current.map((item) => (item.id === group.id ? { ...item, activeView: view } : item)));
                          setResizeTick((tick) => tick + 1);
                        }}
                        onContextMenu={(event) => handleTabContextMenu(event, view, group.id)}
                      >
                        <span className="tab-label">{viewLabel(view)}</span>
                      </button>
                    ))}
                    {renderedGroups.length > 1 && index > 0 ? (
                      <button type="button" className="tab-merge-button" onClick={() => closeSplitView(group.activeView, group.id)} title={UI.closeView} aria-label={UI.closeView}>
                        <X size={14} />
                      </button>
                    ) : null}
                  </div>
                  <div className="split-panel-body">{renderViewContent(group.activeView)}</div>
                </section>
                {splitMode && index < renderedGroups.length - 1 ? (
                  <div className="split-resizer" role="separator" aria-orientation="vertical" onPointerDown={(event) => handleSplitResizerPointerDown(event, index)} />
                ) : null}
              </Fragment>
            ))}
          </div>
        </section>

        <div className="right-pane-slot">
          <div className="right-pane-resizer" role="separator" aria-orientation="vertical" onPointerDown={handleRightPanePointerDown} />
          {rightPaneCollapsed ? (
            <button type="button" className="right-pane-restore" onClick={restoreRightPane} title={UI.restoreRightPane}>
              <PanelRightOpen size={17} />
            </button>
          ) : (
            <aside className="settings-pane" aria-label="settings">
              <section className="settings-section">
            <div className="section-heading">
              <div>
                <h2>{UI.beads}</h2>
                <p className="section-subtitle">
                  {activeGroup ? `${activeGroup.name} · ${activeGroupColorCount}${UI.groupColorCount}` : UI.defaultGroup}
                </p>
              </div>
            </div>
            <div className="bead-panel-block group-block">
              <div className="group-toolbar">
                  <select value={activeLayer.activeColorGroupId} onChange={(event) => selectBeadColorGroup(event.target.value)}>
                    {activeLayer.colorGroups.map((group) => (
                      <option key={group.id} value={group.id}>
                        {group.name} ({group.colors.length}{UI.groupColorCount})
                      </option>
                    ))}
                  </select>
                <button type="button" className="icon-button" onClick={addBeadColorGroup} title={UI.newGroup}>
                  <Plus size={17} />
                </button>
                <button type="button" className="icon-button danger" onClick={deleteBeadColorGroup} disabled={activeLayer.colorGroups.length <= 1} title={UI.deleteGroup}>
                  <Trash2 size={16} />
                </button>
                <button type="button" className="icon-button" onClick={restoreDefaultBeadGroups} title={UI.restoreDefaultBeads}>
                  <RotateCcw size={16} />
                </button>
              </div>
              <label className="group-name-row">
                <span>{UI.groupName}</span>
                <input value={activeGroup?.name ?? ""} onChange={(event) => renameActiveGroup(event.target.value)} />
              </label>
              <p className="group-meta">
                {activeGroup
                  ? `${activeGroupColorCount}${UI.groupColorCount}${activeGroup.description ? ` · ${activeGroup.description}` : ""}`
                  : activeGroupSummary}
              </p>
            </div>
            <div className="bead-panel-block colors-block">
              <div className="block-heading">
                <span className="block-title">{UI.groupColors}</span>
                <div className="color-actions">
                  <button type="button" className="text-button sort-color-button" onClick={refreshActiveColorUsage} disabled={!activeGroup} title={UI.sortColors}>
                    <RefreshCw size={15} />
                    <span>{UI.sortColors}</span>
                  </button>
                  <button type="button" className="text-button primary add-color-button" onClick={addColor} disabled={!activeGroup} title={UI.newBead}>
                    <Plus size={16} />
                    <span>{UI.newBead}</span>
                  </button>
                </div>
              </div>
              <div className="color-list">
                {activeColorRows.map((row) => {
                  if (row.type === "section") {
                    return (
                      <div key={row.id} className="color-section-label">
                        {row.label}
                      </div>
                    );
                  }
                  const color = row.color;
                  const usageCount = colorUsageCounts.get(color.id) ?? 0;
                  return (
                    <div
                      key={color.id}
                      role="button"
                      tabIndex={0}
                      className={`color-row ${color.id === activeLayer.selectedColorId ? "active" : ""}`}
                      onClick={() => selectColor(color.id)}
                      onContextMenu={(event) => openColorContextMenu(event, color.id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          selectColor(color.id);
                        }
                      }}
                    >
                      <input
                        className="color-radio"
                        type="radio"
                        name={`bead-color-${activeLayer.activeColorGroupId}`}
                        checked={color.id === activeLayer.selectedColorId}
                        onClick={(event) => event.stopPropagation()}
                        onPointerDown={(event) => event.stopPropagation()}
                        onChange={() => selectColor(color.id)}
                        aria-label={`${UI.beadCode} ${color.code}`}
                      />
                      <input
                        type="color"
                        value={color.hex}
                        onClick={(event) => event.stopPropagation()}
                        onPointerDown={(event) => event.stopPropagation()}
                        onChange={(event) => updateColor(color.id, { hex: event.target.value })}
                        aria-label={UI.colorValue}
                      />
                      <input
                        className="code-input"
                        value={color.code}
                        onClick={(event) => event.stopPropagation()}
                        onPointerDown={(event) => event.stopPropagation()}
                        onChange={(event) => updateColor(color.id, { code: event.target.value, name: event.target.value })}
                        aria-label={UI.beadCode}
                      />
                      <input
                        className="hex-input"
                        value={hexDrafts[color.id] ?? color.hex.toUpperCase()}
                        onClick={(event) => event.stopPropagation()}
                        onPointerDown={(event) => event.stopPropagation()}
                        onContextMenu={(event) => openHexContextMenu(event, color)}
                        onChange={(event) => updateHexInput(color.id, event.target.value)}
                        onBlur={() => commitHexInput(color.id)}
                        aria-label={UI.hexValue}
                      />
                      <span
                        className={`color-usage-badge ${usageCount > 0 ? "is-used" : "is-empty"}`}
                        title={`当前图层使用 ${usageCount} 粒`}
                      >
                        {usageCount} 粒
                      </span>
                      <label className="switch" onClick={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
                        <input type="checkbox" checked={color.enabled} onChange={(event) => updateColor(color.id, { enabled: event.target.checked })} />
                        <span />
                      </label>
                      <button
                        type="button"
                        className="icon-button danger"
                        onClick={(event) => {
                          event.stopPropagation();
                          deleteColor(color.id);
                        }}
                        onPointerDown={(event) => event.stopPropagation()}
                        title="delete"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
            </aside>
          )}
        </div>
      </main>

      {splitContextMenu ? (
        <div
          className="split-context-menu"
          style={{ left: splitContextMenu.x, top: splitContextMenu.y }}
          role="menu"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button type="button" role="menuitem" onClick={() => splitViewFromMenu(splitContextMenu.view, "left", splitContextMenu.groupId)}>
            {UI.splitLeft}
          </button>
          <button type="button" role="menuitem" onClick={() => splitViewFromMenu(splitContextMenu.view, "right", splitContextMenu.groupId)}>
            {UI.splitRight}
          </button>
        </div>
      ) : null}

      {colorContextMenu ? (
        <div
          className={`color-context-menu ${colorContextMenu.openLeft ? "open-left" : ""}`}
          style={{ left: colorContextMenu.x, top: colorContextMenu.y }}
          role="menu"
          onPointerDown={(event) => event.stopPropagation()}
          onMouseLeave={() => setColorContextMenu(null)}
        >
          <div className="color-context-item has-submenu" role="menuitem">
            <span>{UI.mergeTo}</span>
            <ChevronRight size={14} />
            <div className="color-context-submenu" role="menu">
              {activeDisplayColors.filter((color) => color.id !== colorContextMenu.colorId).length > 0 ? (
                activeDisplayColors
                  .filter((color) => color.id !== colorContextMenu.colorId)
                  .map((color) => (
                    <button
                      key={color.id}
                      type="button"
                      className="color-merge-target"
                      role="menuitem"
                      onClick={() => mergeColorInto(colorContextMenu.colorId, color.id)}
                    >
                      <span className="context-swatch" style={{ background: color.hex }} />
                      <span className="context-code">{color.code}</span>
                      <span className="context-hex">{color.hex.toUpperCase()}</span>
                    </button>
                  ))
              ) : (
                <span className="color-context-empty">{UI.noMergeTarget}</span>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {canvasReplaceContextMenu ? (
        <div
          className={`color-context-menu canvas-replace-context-menu ${canvasReplaceContextMenu.openLeft ? "open-left" : ""}`}
          style={{ left: canvasReplaceContextMenu.x, top: canvasReplaceContextMenu.y }}
          role="menu"
          onPointerDown={(event) => event.stopPropagation()}
          onMouseLeave={() => setCanvasReplaceContextMenu(null)}
        >
          <button
            type="button"
            className="color-context-action danger"
            role="menuitem"
            onClick={() => deleteActiveColorFromLayer(canvasReplaceContextMenu.sourceColorId)}
          >
            {UI.deleteActiveColor}
          </button>
          <div className="color-context-item has-submenu" role="menuitem">
            <span>{UI.replaceActiveColorWith}</span>
            <ChevronRight size={14} />
            <div className="color-context-submenu" role="menu">
              {activeDisplayColors.filter((color) => color.id !== canvasReplaceContextMenu.sourceColorId).length > 0 ? (
                activeDisplayColors
                  .filter((color) => color.id !== canvasReplaceContextMenu.sourceColorId)
                  .map((color) => (
                    <button
                      key={color.id}
                      type="button"
                      className="color-merge-target"
                      role="menuitem"
                      onClick={() => mergeColorInto(canvasReplaceContextMenu.sourceColorId, color.id)}
                    >
                      <span className="context-swatch" style={{ background: color.hex }} />
                      <span className="context-code">{color.code}</span>
                      <span className="context-hex">{color.hex.toUpperCase()}</span>
                    </button>
                  ))
              ) : (
                <span className="color-context-empty">{UI.noMergeTarget}</span>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {hexContextMenu ? (
        <div
          className="hex-context-menu"
          style={{ left: hexContextMenu.x, top: hexContextMenu.y }}
          role="dialog"
          aria-label={UI.setColor}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <label>
            <span>{UI.setColor}</span>
            <input
              autoFocus
              value={hexContextMenu.value}
              onChange={(event) => setHexContextMenu((current) => (current ? { ...current, value: event.target.value, error: "" } : current))}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  commitHexContextMenu();
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  setHexContextMenu(null);
                }
              }}
              placeholder="#AABBCC"
            />
          </label>
          {hexContextMenu.error ? <span className="hex-context-error">{hexContextMenu.error}</span> : null}
          <div className="hex-context-actions">
            <button type="button" className="text-button" onClick={() => setHexContextMenu(null)}>
              {UI.cancel}
            </button>
            <button type="button" className="text-button primary" onClick={commitHexContextMenu}>
              {UI.confirm}
            </button>
          </div>
        </div>
      ) : null}

      {guideOpen ? (
        <div className="modal-backdrop" role="presentation">
          <div className="choice-dialog guide-dialog" role="dialog" aria-modal="true" aria-labelledby="guide-title">
            <button type="button" className="modal-close" onClick={() => setGuideOpen(false)} title="close">
              <X size={18} />
            </button>
            <h2 id="guide-title">{UI.guide}</h2>
            <div className="guide-content">
              {GUIDE_SECTIONS.map((section) => (
                <section key={section.title} className="guide-section">
                  <h3>{section.title}</h3>
                  <ul>
                    {section.items.map((item, index) => (
                      <li key={`${section.title}-${index}`}>{item}</li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
            <div className="dialog-actions guide-dialog-actions">
              <button type="button" className="text-button" onClick={handleCopyPrompt} disabled={promptCopying}>
                <Copy size={14} />
                <span>{promptCopying ? "..." : UI.copyPrompt}</span>
              </button>
              <button type="button" className="text-button primary" onClick={() => setGuideOpen(false)}>
                知道了
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {exportDialog ? (
        <div className="modal-backdrop" role="presentation">
          <div className="choice-dialog export-dialog" role="dialog" aria-modal="true" aria-labelledby="export-options-title">
            <button type="button" className="modal-close" onClick={() => setExportDialog(null)} title="close">
              <X size={18} />
            </button>
            <h2 id="export-options-title">{UI.exportOptions}</h2>
            <div className="export-options-content">
              <div className="export-layer-pane">
                <section className="export-option-section export-layer-section">
                  <div className="export-option-heading">
                    <strong>{UI.exportLayers}</strong>
                    <div className="export-file-actions" role="group" aria-label={UI.exportLayers}>
                      <button type="button" className="mini-text-button" onClick={() => setAllExportLayerIds(true)}>
                        {UI.exportSelectAllLayers}
                      </button>
                      <button type="button" className="mini-text-button" onClick={() => setAllExportLayerIds(false)}>
                        {UI.exportClearAllLayers}
                      </button>
                      <span>{exportDialog.layerIds.length}/{project.layers.length}</span>
                    </div>
                  </div>
                  <div className="export-layer-list">
                    {project.layers.map((layer) => (
                      <label key={layer.id} className="export-check-row export-layer-row">
                        <input
                          type="checkbox"
                          checked={exportDialog.layerIds.includes(layer.id)}
                          onChange={(event) =>
                            setExportDialog((current) => {
                              if (!current) return current;
                              const layerIds = event.target.checked
                                ? [...current.layerIds, layer.id]
                                : current.layerIds.filter((id) => id !== layer.id);
                              return { ...current, layerIds };
                            })
                          }
                        />
                        <input
                          className="export-layer-name-input"
                          value={exportDialog.layerNames[layer.id] ?? layer.name}
                          onClick={(event) => event.stopPropagation()}
                          onPointerDown={(event) => event.stopPropagation()}
                          onChange={(event) =>
                            setExportDialog((current) =>
                              current
                                ? {
                                    ...current,
                                    layerNames: {
                                      ...current.layerNames,
                                      [layer.id]: event.target.value,
                                    },
                                  }
                                : current,
                            )
                          }
                          aria-label={`${UI.layers} ${layer.name}`}
                        />
                      </label>
                    ))}
                  </div>
                </section>
              </div>
              <div className="export-settings-pane">
                <section className="export-option-section">
                  <label className="export-zip-name-row">
                    <span>{UI.exportZipName}</span>
                    <input
                      value={exportDialog.zipFileName}
                      onChange={(event) => setExportDialog((current) => (current ? { ...current, zipFileName: event.target.value } : current))}
                      onBlur={() => setExportDialog((current) => (current ? { ...current, zipFileName: safeZipBaseName(current.zipFileName) } : current))}
                      aria-label={UI.exportZipName}
                    />
                  </label>
                </section>
                <section className="export-option-section">
                  <div className="export-option-heading">
                    <strong>{UI.exportFiles}</strong>
                    <div className="export-file-actions" role="group" aria-label={UI.exportFiles}>
                      <button type="button" className="mini-text-button" onClick={() => setAllExportFileOptions(true)}>
                        {UI.exportSelectAllFiles}
                      </button>
                      <button type="button" className="mini-text-button" onClick={() => setAllExportFileOptions(false)}>
                        {UI.exportClearAllFiles}
                      </button>
                    </div>
                  </div>
                  <div className="export-file-options">
                    <label className="export-check-row">
                      <input
                        type="checkbox"
                        checked={exportDialog.includeObj}
                        onChange={(event) => updateExportFileOptions({ includeObj: event.target.checked })}
                      />
                      <span>{UI.exportObj}</span>
                    </label>
                    <label className="export-check-row">
                      <input
                        type="checkbox"
                        checked={exportDialog.include3mf}
                        onChange={(event) => updateExportFileOptions({ include3mf: event.target.checked })}
                      />
                      <span>{UI.export3mf}</span>
                    </label>
                    <label className="export-check-row">
                      <input
                        type="checkbox"
                        checked={exportDialog.includePatternPng}
                        onChange={(event) => updateExportFileOptions({ includePatternPng: event.target.checked })}
                      />
                      <span>{UI.exportPatternPng}</span>
                    </label>
                    <label className="export-check-row">
                      <input
                        type="checkbox"
                        checked={exportDialog.includeBeadPng}
                        onChange={(event) => updateExportFileOptions({ includeBeadPng: event.target.checked })}
                      />
                      <span>{UI.exportBeadPng}</span>
                    </label>
                    <label className="export-check-row">
                      <input
                        type="checkbox"
                        checked={exportDialog.includeHammerPng}
                        onChange={(event) => updateExportFileOptions({ includeHammerPng: event.target.checked })}
                      />
                      <span>{UI.exportHammerPng}</span>
                    </label>
                    <label className="export-check-row">
                      <input
                        type="checkbox"
                        checked={exportDialog.includeMeta}
                        onChange={(event) => updateExportFileOptions({ includeMeta: event.target.checked })}
                      />
                      <span>{UI.exportMeta}</span>
                    </label>
                  </div>
                </section>
                <section className="export-option-section export-overview-section">
                  <div className="export-option-heading">
                    <strong>{UI.exportOverviewPng}</strong>
                    <span>{exportDialog.layerIds.length >= 2 ? `${exportDialog.layerIds.length} layers` : UI.exportOverviewPngHint}</span>
                  </div>
                  <div className="export-overview-controls">
                    <label className={`export-check-row export-overview-check${exportDialog.layerIds.length < 2 ? " disabled" : ""}`}>
                      <input
                        type="checkbox"
                        checked={exportDialog.layerIds.length >= 2 && exportDialog.includeOverviewPng}
                        disabled={exportDialog.layerIds.length < 2}
                        onChange={(event) => updateExportFileOptions({ includeOverviewPng: event.target.checked })}
                      />
                      <span>{UI.exportOverviewPng}</span>
                    </label>
                    <label className="export-overview-columns-row">
                      <span>{UI.exportOverviewColumns}</span>
                      <input
                        type="number"
                        min={1}
                        max={6}
                        value={exportDialog.overviewColumns}
                        onChange={(event) => updateExportOverviewOptions({ overviewColumns: Number(event.target.value) })}
                      />
                    </label>
                  </div>
                  <p className="export-overview-hint">{UI.exportOverviewColumnsHint}</p>
                </section>
              </div>
            </div>
            <div className="dialog-actions">
              <button type="button" className="text-button" onClick={() => setExportDialog(null)}>
                {UI.cancel}
              </button>
              <button
                type="button"
                className="text-button primary"
                onClick={() => exportZip(exportDialog)}
                disabled={
                  exportDialog.layerIds.length === 0 ||
                  (!(exportDialog.includeObj || exportDialog.include3mf || exportDialog.includePatternPng || exportDialog.includeBeadPng || exportDialog.includeHammerPng || (exportDialog.includeOverviewPng && exportDialog.layerIds.length >= 2)) &&
                    !exportDialog.includeMeta)
                }
              >
                {UI.exportSelected}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {addDialog ? (
        <div className="modal-backdrop" role="presentation">
          <div className="choice-dialog compact" role="dialog" aria-modal="true" aria-labelledby="add-bead-title">
            <button type="button" className="modal-close" onClick={() => setAddDialog(null)} title="close">
              <X size={18} />
            </button>
            <h2 id="add-bead-title">{UI.newBead}</h2>
            <div className="dialog-fields">
              <label>
                <span>{UI.colorValue}</span>
                <input type="color" value={addDialog.color} onChange={(event) => setAddDialog({ ...addDialog, color: event.target.value })} />
              </label>
              <label>
                <span>{UI.beadCode}</span>
                <input value={addDialog.code} onChange={(event) => setAddDialog({ ...addDialog, code: event.target.value })} />
              </label>
            </div>
            <div className="dialog-actions">
              <button type="button" className="text-button" onClick={() => setAddDialog(null)}>
                取消
              </button>
              <button type="button" className="text-button primary" onClick={confirmAddColor}>
                添加
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {groupDialog ? (
        <div className="modal-backdrop" role="presentation">
          <div className="choice-dialog compact" role="dialog" aria-modal="true" aria-labelledby="add-group-title">
            <button type="button" className="modal-close" onClick={() => setGroupDialog(null)} title="close">
              <X size={18} />
            </button>
            <h2 id="add-group-title">{UI.newGroup}</h2>
            <div className="dialog-fields">
              <label>
                <span>{UI.groupName}</span>
                <input value={groupDialog.name} onChange={(event) => setGroupDialog({ name: event.target.value })} />
              </label>
            </div>
            <div className="dialog-actions">
              <button type="button" className="text-button" onClick={() => setGroupDialog(null)}>
                取消
              </button>
              <button type="button" className="text-button primary" onClick={confirmAddBeadColorGroup}>
                确认
              </button>
            </div>
          </div>
        </div>
      ) : null}

    </div>
  );
}

