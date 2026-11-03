# Token Consumption

实时聚合 **pi**、**opencode**、**Codex CLI** 三个 AI coding agent 的 token 消耗统计。

![主页仪表盘](screenshot.png)
![详情弹窗](screenshot-detail.png)

## 功能

### 主页

- **统计卡片** — 累计 Token、累计调用次数、今日 Token、今日缓存命中率、今日调用次数
- **热力图** — 7×52 网格，显示整年每日用量；点击任意格子查看当天详情
- **每日 Token 总消耗** — 堆叠柱状图，支持缩放联动
- **每日分布** — 100% 堆叠柱状图，展示各分组占比变化
- **维度切换** — 顶部按钮在 **模型 / 供应商 / Harness** 三个维度间切换，两张图表全局联动
- **导出 CSV** — 导出无损明细，可完整重建所有视图

### 详情弹窗

点击主页任意图表或热力图格子弹出：

- 当日统计卡（总量、缓存命中率、调用次数、当前维度分组数）
- Token 分类饼图（输入 / 输出 / 输入命中缓存 / 缓存写入 / 推理）
- 分组分布饼图（随维度切换）
- 按 5 分钟 / 按小时堆叠柱状图（随维度切换）
- 前一天 / 后一天导航

### 三个聚合维度

| 维度 | 含义 | 取值示例 |
|---|---|---|
| **模型** | 具体模型名 | `deepseek-v4-flash`、`gpt-6.1-sol`、`claude-sonnet-4.5` |
| **供应商** | 模型服务商 | `deepseek`、`openai`、`commandcode`、`minimax-cn` |
| **Harness** | 数据来自哪个 agent 客户端 | `pi`、`opencode`、`codex` |

## 数据源

| 来源 | 路径 | 格式 |
|---|---|---|
| **pi** | `~/.pi/agent/sessions/**/*.jsonl` | JSONL（session 消息流） |
| **opencode** | `~/.local/share/opencode/opencode.db` | SQLite |
| **Codex CLI** | `~/.codex/sessions/**/rollout-*.jsonl[.zst]`<br>`~/.codex/archived_sessions/**` | JSONL / zstd 压缩 |

数据实时读取，每 60 秒自动刷新。

### 各来源的 token 口径差异（已统一）

三个来源对 `total` 的定义并不一致，程序在读取时就做了归一化，保证
`input + output + reasoning + cacheRead + cacheWrite === total`：

| 来源 | total 定义 | 说明 |
|---|---|---|
| **pi** | `input + output + cacheRead + cacheWrite` | `reasoning ⊆ output`，需从 output 拆出 |
| **opencode** | `input + output + reasoning + cacheRead + cacheWrite` | 各项均为独立字段 |
| **Codex** | `input + output` | `cached ⊆ input`、`reasoning ⊆ output`，需分别拆出 |

### 两个易踩的坑（已修复）

1. **pi 会重写历史消息** — 会话续接 / 分叉时，历史消息连同当时的 usage 会被整份复制进新的
   session 文件（同一 `rec.id` 最多出现 5 次）。若不按消息 id 去重，同一笔消耗会被重复计算
   2–5 倍。
2. **Codex 的线程累计值可能被预置** — 新建线程的首条 `token_count` 事件里
   `total_token_usage` 可能继承了一个巨大初值（实测 5/155 线程存在，最大 179.8M），
   而同事件的 `last_token_usage` 才是真实增量。把累计值当增量会让某一天数据暴涨 2.5 倍。

## 技术栈

- **桌面框架**: Electron 32
- **UI**: Vue 3 + Element Plus（固定暗色主题）
- **图表**: Apache ECharts 6（全量 ESM 构建，tooltip 自动深色）
- **数据库**: better-sqlite3（读 opencode）
- **解压**: fzstd（纯 JS 解 zstd，不依赖系统 CLI）
- **构建**: electron-vite
- **打包**: electron-builder
- **CI**: GitHub Actions（5 平台矩阵 + 自动 Release）

## 快速开始

```bash
npm install
npx electron-builder install-app-deps   # 为 Electron 重编译 better-sqlite3
npm run dev                              # 开发模式（HMR）
```

> `install-app-deps` 不可省略：`better-sqlite3` 是原生模块，必须按 Electron 的 ABI 编译，
> 否则读不到 opencode 的数据。

## 打包

```bash
npm run build     # 只构建到 out/
npm run package   # 构建 + 打 Windows 便携版
```

产物为**便携版**，解压即用，无需安装：

| 平台 | 目标 | 文件名 |
|---|---|---|
| Windows x64 | portable | `Token Consumption-<version>-win32-x64.exe` |
| Windows arm64 | portable | `Token Consumption-<version>-win32-arm64.exe` |
| macOS universal | zip | `Token Consumption-<version>-darwin-universal.zip` |
| Linux x64 | AppImage | `Token Consumption-<version>-linux-x86_64.AppImage` |
| Linux arm64 | AppImage | `Token Consumption-<version>-linux-arm64.AppImage` |

### 发布

推送 `v*` 标签即触发 GitHub Actions 全平台构建，并自动创建 pre-release 附带全部产物：

```bash
git tag v0.3.0
git push origin v0.3.0
```

## CSV 导出

点击顶栏「导出 CSV」，选择一个保存位置。格式为**无损原子行**，无冗余：

```csv
# Summary
# generatedAt,2026-11-03T12:00:00.000Z
# rangeFrom,2026-06-24
# rangeTo,2026-11-03
# grandTotal,18089739020
# todayDate,2026-11-03
# todayTotal,141162615

date,harness,model,provider,calls,input,output,cache_read,cache_write,reasoning,total
2026-11-03,pi,deepseek-v4-flash,deepseek,120,1500000,80000,42000000,0,20000,43580000
```

每行是 `(日期, harness, 模型, 供应商)` 这一最细粒度的统计。模型视图、供应商视图、
Harness 视图、每日汇总、热力图、详情弹窗都可以从这张表重建。

## 项目结构

```
token-consumption/
├── .github/workflows/build.yml   # CI：5 平台构建 + Release
├── electron-builder.yml          # 打包配置（portable / zip / AppImage）
├── electron.vite.config.ts       # Vite 配置（含 echarts 全量构建 alias）
├── DESIGN.md                     # 设计文档
├── ISSUES.md                     # 代码审查问题报告
├── screenshot*.png
└── src/
    ├── main/
    │   └── index.ts              # Electron 主进程：窗口 + IPC + CSV 导出
    ├── preload/
    │   └── index.ts              # contextBridge API
    ├── data/                     # 数据层（运行在主进程）
    │   ├── pi.ts                 # 读 pi jsonl（按 rec.id 去重）
    │   ├── opencode.ts           # 读 opencode SQLite
    │   ├── codex.ts              # 读 Codex rollout（fzstd 解压 + 累计差值法）
    │   ├── aggregate.ts          # 三维度聚合
    │   └── exportCSV.ts          # CSV 生成
    ├── shared/
    │   └── types.ts              # 主/渲染进程共享类型
    └── renderer/
        ├── App.vue               # 主页布局 + 维度切换
        ├── components/           # TopStats / Heatmap / DailyTokens / DailyModels / DetailDialog
        ├── composables/          # useData / useSelection / modelColor
        └── charts/               # ECharts option 构建器
            ├── dimension.ts      # 维度标签与取数映射（模型/供应商/Harness）
            ├── heatmap.ts        # 热力图
            ├── stackedBar.ts     # 每日总量堆叠柱
            ├── percentBar.ts     # 100% 堆叠柱
            ├── pie.ts            # 饼图
            └── detailBar.ts      # 详情页 5 分钟/小时柱
```

## 已知限制

- **时区硬编码 UTC+8**（`aggregate.ts`）。非 UTC+8 环境日期分界会错位。
- **逐日数字与 Codex 官方界面存在 ±10–15% 偏差** — 本地只有 rollout 里的计数器观测时间，
  而 Codex 界面按服务端计费时间归日，且不计中断/报错的 turn。总量是精确的，
  逐日分布只能近似。
- **刷新为全量重算** — 数据量增长后启动/刷新耗时会线性上升（当前约 8 秒）。

## 许可

MIT
