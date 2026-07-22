# Token Consumption — 完整设计文档

> 桌面应用，实时聚合 pi + opencode 两个 AI coding agent 的 token 消耗

---

## 1. 项目概述

### 1.1 目标
一个 Electron 桌面应用，本地实时读取 **pi** 和 **opencode** 两个 agent 的 session 数据，聚合展示 token 消耗统计。

### 1.2 核心功能
- 累计 / 今日 token 总量卡片
- GitHub 风格热力图（按天）
- 每日 Token 堆叠柱状图（按模型分色）
- 每日模型 100% 堆叠柱状图
- 统一悬浮框（hover tooltip）
- 点击任意一天 → 详情弹窗：
  - 该日总量 + 缓存命中率
  - Token 分类饼图（input/output/cacheRead/cacheWrite/reasoning）
  - 模型分类饼图
  - 分钟/日 分段 + 堆叠柱状图（按模型）

### 1.3 项目位置
```
D:\workspace\token-consumption\
```

### 1.4 交付物
- Windows 安装包 `.exe`（NSIS）
- 自动从本地数据源刷新（默认 60s）

---

## 2. 技术选型

| 层 | 选择 | 版本 | 理由 |
|---|---|---|---|
| 桌面框架 | Electron | ^32 | 跨平台、Node 生态 |
| 渲染层 | Vue 3 | ^3.4 | Element Plus 官方推荐 |
| UI 组件 | Element Plus | ^2.7 | "Element UI" 现代版 |
| 图表 | Apache ECharts | ^5.5 | 商务风、heatmap/pie/bar 齐全 |
| ECharts-Vue 绑定 | vue-echarts | ^7.0 | 官方绑定 |
| SQLite | better-sqlite3 | ^11 | 同步、高性能、用于读 opencode.db |
| 构建 | electron-vite | ^2.3 | HMR 友好 |
| 打包 | electron-builder | ^24 | 输出 NSIS .exe |
| 语言 | TypeScript | ^5.4 | 类型安全 |

---

## 3. 目录结构

```
token-consumption/
├── DESIGN.md                          # 本文档
├── README.md
├── package.json
├── tsconfig.json
├── tsconfig.node.json
├── electron.vite.config.ts
├── electron-builder.yml
├── index.html                         # Vite 入口（被 electron-vite 引用）
├── .gitignore
├── src/
│   ├── main/                          # Electron 主进程
│   │   └── index.ts                   # 入口、BrowserWindow
│   ├── preload/
│   │   └── index.ts                   # contextBridge 暴露 window.api
│   ├── renderer/                      # Vue 3 渲染层
│   │   ├── index.html
│   │   ├── main.ts                    # Vue 入口（含 dark mode）
│   │   ├── App.vue                    # 根组件（layout）
│   │   ├── env.d.ts
│   │   ├── components/
│   │   │   ├── TopStats.vue           # 累计 / 今日
│   │   │   ├── Heatmap.vue            # 7×N 热力图
│   │   │   ├── DailyTokens.vue        # 每日 Token 堆叠柱
│   │   │   ├── DailyModels.vue        # 每日模型 100% 堆叠柱
│   │   │   ├── HoverCard.vue          # 统一悬浮框
│   │   │   └── DetailDialog.vue       # 详情弹窗
│   │   ├── composables/
│   │   │   ├── useData.ts             # 数据加载 + 60s 自动刷新
│   │   │   ├── useSelection.ts        # 选中日状态
│   │   │   └── modelColor.ts          # 模型色映射（唯一颜色规则）
│   │   ├── charts/
│   │   │   ├── heatmap.ts             # ECharts heatmap option
│   │   │   ├── stackedBar.ts
│   │   │   ├── percentBar.ts
│   │   │   └── pie.ts
│   │   └── types.ts
│   ├── shared/
│   │   └── types.ts                   # 主进程/渲染进程共享类型
│   └── data/                          # 数据层（主进程）
│       ├── pi.ts                      # 读 ~/.pi/agent/sessions/*.jsonl
│       ├── opencode.ts                # 读 ~/.local/share/opencode/opencode.db
│       └── aggregate.ts               # 合并、归一化、按 (date, model) 聚合
└── docs/
```

---

## 4. 暗色模式（Dark Mode）

参考官方文档：<https://element-plus.org/zh-CN/guide/dark-mode>

Element Plus 2.2+ 通过 CSS 变量实现暗黑模式。设置步骤：

### 4.1 入口 HTML 加 `class="dark"`

`src/renderer/index.html`：

```html
<!DOCTYPE html>
<html class="dark">
  <head>...</head>
  <body>...</body>
</html>
```

### 4.2 引入 Element Plus 暗色 CSS 变量

`src/renderer/main.ts`：

```ts
import 'element-plus/theme-chalk/dark/css-vars.css'
import { createApp } from 'vue'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import App from './App.vue'

createApp(App).use(ElementPlus).mount('#app')
```

### 4.3 验证
应用启动后：
- 页面背景变深灰
- 卡片、按钮、字体自动反色
- **本应用固定使用暗色，不提供切换**

---

## 5. 数据层

### 5.1 数据源

| 来源 | 路径 | 格式 |
|---|---|---|
| Pi | `~/.pi/agent/sessions/**/*.jsonl` | JSONL，每行一个事件 |
| OpenCode | `~/.local/share/opencode/opencode.db` | SQLite |

### 5.2 关键字段

**Pi** (`message.usage`)：
- `input`, `output`, `cacheRead`, `cacheWrite`, `reasoning`
- `totalTokens` = input + output + cacheRead + cacheWrite + reasoning

**OpenCode** (`message.data.tokens`)：
- 同上结构；外加 `message.data.modelID`, `message.data.providerID`

### 5.3 模型归一化

```ts
const ALIASES = {
  'deepseek-v4-pro-260425': 'deepseek-v4-pro',
  'glm-5-2-260617':         'glm-5.2',
  'deepseek-v4-flash-beta': 'deepseek-v4-flash',
  'deepseek-v4-flash-free': 'deepseek-v4-flash',
  'MiniMax-M3':             'minimax-m3',
}
```

### 5.4 类型定义

`src/shared/types.ts`：

```ts
export interface ModelStats {
  calls: number
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  reasoning: number
  total: number
}

export interface DailyRecord {
  date: string                          // 'YYYY-MM-DD'
  total: number
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  reasoning: number
  cacheHitRate: number                  // cacheRead / (input + cacheRead)
  topModels: { name: string; value: number; pct: number }[]
  allModels: { name: string; value: number; pct: number }[]
}

export interface DataSnapshot {
  generatedAt: string
  range: { from: string; to: string }
  grandTotal: number
  todayTotal: number
  daily: DailyRecord[]                   // 按日期正序
  perDayModel: Record<string, Record<string, ModelStats>>
  rankedModels: string[]                 // 按总用量降序
}
```

### 5.5 数据加载流程

```
应用启动 / 每 60s
  ↓
Promise.all([loadPi(), loadOpencode()])
  ↓
aggregate(messages) → DataSnapshot
  ↓
IPC: data:get 传给渲染层
  ↓
Vue 组件 reactive 绑定 → ECharts 更新
```

### 5.6 性能预算

- Pi jsonl 扫描：~200ms（61 文件，63 MB）
- OpenCode SQL 查询：~100ms（20K 行，索引在 `role`）
- 聚合 + IPC：<200ms
- 启动总延迟：<1s

---

## 6. UI 设计

### 6.1 全局布局

```
┌────────────────────────────────────────────────────────────────┐
│  Token 消耗统计                              🔄  2026-07-21    │
├────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────┐  ┌─────────────────────┐              │
│  │ 累计 Token          │  │ 今日 Token          │              │
│  │ 5,472,536,686       │  │ 1,486,398           │              │
│  └─────────────────────┘  └─────────────────────┘              │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│   [热力图]                                                     │
│   May  Jun  Jul                                                │
│   Mon ▢▢▢▢▢▢▢▢▢▢▢▢▢                                          │
│   Wed ▢▢▢▢▢▢▢▢▢▢▢▢▢                                          │
│   Fri ▢▢▢▢▢▢▢▢▢▢▢▢▢                                          │
│                                                                │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│   [每日 Token 总消耗 · 每列 = 一天 · 按模型堆叠]                 │
│   ┌──────────────────────────────────────────────────┐        │
│   │  ▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮       │        │
│   └──────────────────────────────────────────────────┘        │
│                                                                │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│   [每日模型分布 100% 堆叠 · 每列 = 一天]                         │
│   ┌──────────────────────────────────────────────────┐        │
│   │  ▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰       │        │
│   └──────────────────────────────────────────────────┘        │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

### 6.2 顶部：累计 / 今日卡片

Element Plus `<el-card>` + `<el-statistic>`。

```vue
<el-row :gutter="16">
  <el-col :span="12">
    <el-card>
      <el-statistic title="累计 Token" :value="grandTotal" />
    </el-card>
  </el-col>
  <el-col :span="12">
    <el-card>
      <el-statistic title="今日 Token" :value="todayTotal" />
    </el-card>
  </el-col>
</el-row>
```

### 6.3 热力图

ECharts `heatmap` series，7 行 × N 周列。

**配色**：5 段离散绿（GitHub 风格）
```
0: #ebedf0
1: #9be9a8
2: #40c463
3: #30a14e
4: #216e39
```

**配置**：
- `xgap=3, ygap=3`（单元格间隙）
- 顶部月份标签，左侧 Mon/Wed/Fri
- 量化分位：25/50/75/100 percentile

**交互**：
- 悬停 → 统一悬浮框格式 A
- 点击 → 打开详情弹窗

### 6.4 每日 Token 总消耗堆叠柱状图

ECharts `bar` series，`stack: 'total'`。

- x 轴：日期
- y 轴：token 数量
- 堆叠段：**按模型分色**

**悬停框（格式 A）**：
```
┌────────────────────────────┐
│  2026-07-05                │
│ ────────────────────────── │
│ 总量:    521,430,845       │
│ 缓存命中率: 95.12%         │
│                            │
│ Top 3 模型:                │
│ deepseek-v4-flash: 456M 87%│
│ deepseek-v4-pro:   52M 10%│
│ glm-5.2:          13M  2% │
└────────────────────────────┘
```

点击某列 → 打开详情弹窗。

### 6.5 每日模型分布 100% 堆叠柱状图

ECharts `bar` series，`stack: 'total'`，y 轴 `max: 100`。

- x 轴：日期
- y 轴：0–100%（带 `%` 后缀）
- 堆叠段：**按模型分色**（同 §6.4）

**悬停框（格式 B，显示所有模型降序）**：
```
┌────────────────────────────┐
│  2026-07-05                │
│ ────────────────────────── │
│ deepseek-v4-flash: 456M 87%│
│ deepseek-v4-pro:   52M 10%│
│ glm-5.2:          13M  2% │
│ glm-5.1:           1M  0% │
│ ...                        │
└────────────────────────────┘
```

点击某列 → 打开详情弹窗。

### 6.6 详情弹窗（DetailDialog）

点击热力图 / §6.4 / §6.5 任意一天触发。

**布局**：
```
┌────────────────────────────────────────────────────────┐
│  2026-07-05                                            [×] │
│                                                        │
│  总量: 521,430,845        缓存命中率: 95.12%             │
├────────────────────────────────────────────────────────┤
│  ┌──────────────────┐  ┌──────────────────┐            │
│  │ Token 分类饼图    │  │ 模型分类饼图      │            │
│  │                  │  │                  │            │
│  │   ●●●            │  │   ●●●            │            │
│  │  ●●●●●           │  │  ●●●●●           │            │
│  │                  │  │                  │            │
│  └──────────────────┘  └──────────────────┘            │
│                                                        │
│  [分钟]  [日]                                          │
│  ┌──────────────────────────────────────────────────┐  │
│  │  堆叠柱状图 (按模型堆叠)                          │  │
│  │                                                  │  │
│  │  ▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮       │  │
│  └──────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────┘
```

#### 6.6.1 顶部数据展示

```vue
<el-descriptions :column="2" border>
  <el-descriptions-item label="日期">2026-07-05</el-descriptions-item>
  <el-descriptions-item label="缓存命中率">95.12%</el-descriptions-item>
  <el-descriptions-item label="总量" :span="2">521,430,845</el-descriptions-item>
</el-descriptions>
```

#### 6.6.2 左饼图：Token 分类

ECharts pie，5 段：input / output / cacheRead / cacheWrite / reasoning。
**不指定颜色**，使用 ECharts 默认调色板。

#### 6.6.3 右饼图：模型分类

ECharts pie，N 段（N = 该日有数据的模型数）。
**使用 §7 模型色映射**，保证与主图一致。

#### 6.6.4 分钟 / 日 Segmented + 堆叠柱状图

```vue
<el-segmented v-model="granularity" :options="['分钟', '日']" />
```

两种模式都**按模型堆叠**（与主图一致），仅 x 轴不同：

**分钟模式**：
- x 轴：当天 24 小时（00–23）
- y 轴：token 数量
- 堆叠段：按模型
- 悬停框：格式 A

**日模式**：
- x 轴：所选当天及前后共 7 天（默认 ±3 天，跨数据边界时自动缩减）
- y 轴：token 数量
- 堆叠段：按模型
- **当天柱用 Element Plus `danger` 主题色描边高亮**
- 悬停框：格式 A

---

## 7. 颜色规则

### 7.1 唯一的颜色规则：模型色映射

`src/renderer/composables/modelColor.ts`：

```ts
const BOLD = [
  '#7F3C8D', '#11A579', '#3969AC', '#F2B701', '#E73F74',
  '#80BA5A', '#E68310', '#008695'
]
const MUTED = [
  '#BFD3E6', '#FFD9A6', '#D4B6D6', '#A8D5BA', '#F2C2C2',
  '#C9C9C9', '#E6E6E6'
]
const TOP_N = 8

export function modelColor(model: string, ranked: string[]): string {
  const i = ranked.indexOf(model)
  if (i < 0) return MUTED[0]
  if (i < TOP_N) return BOLD[i]
  return MUTED[(i - TOP_N) % MUTED.length]
}
```

- 按总用量降序排序
- Top 8 → BOLD（高对比）
- 其余 → MUTED（柔和）
- **跨所有"按模型分色"的地方共用**

### 7.2 配色总览

| 用途 | 来源 | 备注 |
|---|---|---|
| 页面整体 / 卡片 / 字体 | Element Plus 暗色 | 不写 CSS |
| 热力图 | 内置 5 段绿 | 唯一例外（GitHub 风） |
| 模型识别 | §7.1 BOLD + MUTED | 跨图唯一颜色规则 |
| Token 分类饼图 | ECharts 默认调色板 | 不指定 |
| 当天高亮描边 | Element Plus `danger` 主题色 | 用变量 |
| 普通 ECharts 图表 | ECharts 默认 | 不指定 |

**没有 `<style>` 块、没有自定义颜色 hex**（除热力图 5 段绿 + 模型色映射）。

---

## 8. 组件清单

| 组件 | 用途 | 关键依赖 |
|---|---|---|
| `App.vue` | 根布局（4 块垂直堆叠） | `el-row`, `el-card` |
| `TopStats` | 累计 / 今日 卡片 | `el-statistic` |
| `Heatmap` | 7×N 热力图 | ECharts heatmap |
| `DailyTokens` | 每日 Token 堆叠柱（按模型） | ECharts bar (stack) |
| `DailyModels` | 每日模型 100% 堆叠柱 | ECharts bar (stack + max=100) |
| `HoverCard` | 统一悬浮框（两种格式） | `el-popper` |
| `DetailDialog` | 详情弹窗 | `el-dialog`, `el-segmented`, ECharts pie + bar |

---

## 9. 交互流转

```
打开应用
  ↓
loadData() → 显示 TopStats + Heatmap + 两个柱状图
  ↓
setInterval(refresh, 60_000)   ← 自动刷新
  ↓
用户悬停任一图表 → 弹出 HoverCard
  ↓
用户点击格子 / 某列
  ↓
打开 DetailDialog
  ├─ 顶部：日期 + 总量 + 缓存命中率
  ├─ 中部：双饼图（Token 分类 + 模型分类）
  └─ 底部：[分钟|日] Segmented + 堆叠柱状图
  ↓
切换分钟/日 → 柱状图 x 轴重绘
  ↓
用户关闭弹窗 → 回到主视图
```

---

## 10. 依赖

`package.json`：

```json
{
  "name": "token-consumption",
  "version": "0.1.0",
  "main": "out/main/index.js",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "preview": "electron-vite preview",
    "package": "electron-vite build && electron-builder --win"
  },
  "dependencies": {
    "vue": "^3.4.0",
    "element-plus": "^2.7.0",
    "echarts": "^5.5.0",
    "vue-echarts": "^7.0.0",
    "better-sqlite3": "^11.0.0"
  },
  "devDependencies": {
    "electron": "^32.0.0",
    "electron-vite": "^2.3.0",
    "electron-builder": "^24.13.0",
    "typescript": "^5.4.0",
    "vite": "^5.3.0",
    "@types/node": "^20.0.0",
    "@types/better-sqlite3": "^7.6.0"
  }
}
```

---

## 11. 打包

`electron-builder.yml`：

```yaml
appId: com.user.token-consumption
productName: Token Consumption
directories:
  output: release
  buildResources: build
files:
  - '!**/.vscode/*'
  - '!src/*'
  - '!electron.vite.config.ts'
  - '!{tsconfig.json,tsconfig.node.json,build}'
win:
  target: nsis
  icon: build/icon.ico
nsis:
  oneClick: false
  perMachine: false
  allowToChangeInstallationDirectory: true
```

输出：`release/Token Consumption Setup 0.1.0.exe`

---

## 12. 实现步骤

| 阶段 | 内容 | 估时 |
|---|---|---|
| 1 | 脚手架（electron-vite + Vue 3 + TS） | 30 min |
| 2 | 安装依赖 + 暗色模式 | 30 min |
| 3 | 数据层（pi.ts / opencode.ts / aggregate.ts） | 2 h |
| 4 | IPC + Preload | 30 min |
| 5 | TopStats 卡片 | 30 min |
| 6 | Heatmap | 2 h |
| 7 | DailyTokens 堆叠柱 | 1.5 h |
| 8 | DailyModels 100% 堆叠柱 | 1.5 h |
| 9 | DetailDialog（双饼图 + 切换柱） | 2 h |
| 10 | 自动刷新 + 加载状态 | 30 min |
| 11 | 打包 .exe + 测试 | 1 h |
| **合计** | | **~13 h** |

---

## 13. 风险与对策

| 风险 | 对策 |
|---|---|
| `better-sqlite3` Windows 编译失败 | `electron-rebuild` 后置；若失败改用 `sql.js` (WASM) |
| OpenCode DB 3.8 GB 文件锁 | `readonly: true` 打开，读完即关 |
| ECharts 主题与 Element Plus 不完全一致 | 用 `vue-echarts` 的默认主题 |
| 暗色模式下图表颜色冲突 | 模型色映射独立于 ECharts 调色板 |
| 首次启动慢 | 骨架屏（Element Plus `el-skeleton`） |
| 自动刷新时图表闪烁 | 用 ECharts `setOption` 增量更新，不销毁重建 |

---

## 14. 参考

- Element Plus 暗色模式：<https://element-plus.org/zh-CN/guide/dark-mode>
- ECharts 文档：<https://echarts.apache.org/zh/option.html>
- vue-echarts：<https://github.com/ecomfe/vue-echarts>
- electron-vite：<https://electron-vite.org/>
- better-sqlite3：<https://github.com/WiseLibs/better-sqlite3>

---

**版本**：v3（修正版）
**最后更新**：2026-07-21
