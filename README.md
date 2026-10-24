# Pixel STL Studio

把图片转换成多色像素/多材料 STL 的本地 Web 应用。

A local web app that turns an image into a multi-filament pixel STL.

## 功能

- 图片上传与栅格化：按目标像素尺寸生成像素网格
- 颜色分析：统计主色、颜色数量与占比
- MARD 色卡映射：内置 72 / 96 / 120 / 144 / 221 色套装，支持颜色替换与色号标签
- 颜色顺序优化：按层/按色分组，减少换色次数
- Three.js 3D 预览：查看像素块、层高与整体模型
- 逐层/逐色编辑：调整单格颜色、层参数与项目配置
- 导出 3MF / OBJ / ZIP：3MF 用于切片软件，OBJ 用于彩色模型查看，ZIP 打包模型、色号图与层总览图
- 导出任务进度与取消：长任务可查看进度并中止
- 项目保存/加载：把当前像素网格与配置保存为本地项目文件

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | React 18、TypeScript、Vite、Three.js、lucide-react |
| 后端 | Node.js、Express、Sharp、fflate |
| 测试 | Vitest |
| 字体 | Noto Sans SC（SIL OFL 1.1） |

## 快速开始

要求 Node.js 20+（开发环境使用 Node 24）。

```bash
npm ci
npm run dev
```

- 前端：http://127.0.0.1:5173
- 后端：http://127.0.0.1:3001
- Vite 会把 `/api` 代理到后端

生产构建：

```bash
npm run build
npm start
# 打开 http://127.0.0.1:3001
```

测试：

```bash
npm test
```

## 项目结构

```text
.
├── src/
│   ├── App.tsx                 # 主界面与交互
│   ├── components/
│   │   └── ThreePreview.tsx    # Three.js 预览
│   └── core/
│       ├── beadPalettes.ts     # 色卡与套装
│       ├── color.ts            # 颜色转换
│       ├── colorOrdering.ts    # 颜色顺序
│       ├── grid.ts             # 像素网格
│       ├── layers.ts           # 分层
│       ├── project.ts          # 项目保存/加载
│       └── mardPaletteData.ts  # MARD 色号数据
├── server/
│   ├── index.js                # Express API
│   ├── assets/fonts/           # Noto Sans SC
│   └── lib/
│       ├── rasterize.js        # 图片栅格化/颜色分析
│       ├── stl.js              # STL 生成
│       ├── threeMf.js          # 3MF 生成
│       ├── obj.js              # OBJ/MTL 生成
│       ├── exportZip.js        # ZIP 打包
│       ├── pattern.js          # 色号图/图例
│       └── overviewPattern.js  # 总览图
├── index.html
├── testdata/reference.3mf     # Bambu 3MF 项目设置模板（测试夹具）
├── vite.config.ts
└── vitest.config.ts
```

## API

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/rasterize` | 图片栅格化为像素网格 |
| POST | `/api/analyze-colors` | 统计图片颜色 |
| GET | `/api/prompt` | 返回内置的图像生成提示词 |
| POST | `/api/export/start` | 启动导出任务 |
| GET | `/api/export/status/:taskId` | 查询导出进度 |
| POST | `/api/export/cancel/:taskId` | 取消导出任务 |
| GET | `/api/export/download/:taskId` | 下载导出文件 |

导出任务只保存在内存中，TTL 为 10 分钟；服务重启后任务会丢失。

## 使用流程

1. 上传 PNG/JPG 图片，设置目标像素尺寸。
2. 选择色卡套装（72/96/120/144/221 色）与颜色数量。
3. 检查颜色分析结果，必要时替换或合并颜色。
4. 在 3D 预览中检查像素块、层高与整体尺寸。
5. 逐层/逐色微调，保存项目。
6. 导出 3MF / OBJ / ZIP。

## 限制

- 本地单用户应用，没有账号、鉴权或云存储。
- 图片与项目数据只在本地浏览器/服务端内存中处理，不会上传到第三方服务。
- 大尺寸图片或高像素密度会占用较多内存，建议先降低目标像素尺寸。
- 导出任务不持久化，服务重启后需要重新导出。
- 生成的几何是像素块拼合模型（内部以 STL 三角面生成，3MF/OBJ 由此导出），不包含切片参数；实际打印效果取决于打印机、材料和切片设置。

## 第三方声明

依赖与字体许可证见 [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md)。

MARD 色号为对应品牌色卡数据，相关商标归其所有者；本项目与该品牌无隶属或背书关系。

## License

[MIT](LICENSE)
