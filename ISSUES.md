# Token Consumption — 问题报告

> 审查日期：2026-08-14
> 审查范围：全部源代码（main / preload / renderer）+ 真实数据验证（pi jsonl 812 文件 / opencode.db 3.9GB）
> 严重级别：🔴 P1 数据错误 ｜ 🟠 P2 数据偏差 ｜ 🟡 P3 体验/隐患

---

## 一、数据正确性问题

### P1. pi 侧 `totalTokens` 不含 reasoning — 口径依赖手动重算（当前正确，需固化）

**位置**：`src/data/pi.ts:44-47`、`src/data/aggregate.ts:46-47`

**证据**（实测 pi 35,611 条 usage 记录）：
- 24,737 条带 `reasoning` 字段的记录中，`totalTokens` **一律不含** reasoning
- 例：`input=130852, output=67, cacheRead=2304, reasoning=21, totalTokens=133223`
  → `133223 = 130852+67+2304+0`，不含 21
- 而 opencode 的 `tokens.total` **含** reasoning（例：`68+23+37+328064 = 328192 = total` ✓）

**影响**：当前代码两边都手动按 `input+output+cacheRead+cacheWrite+reasoning` 重算，恰好把 pi 侧补上了 reasoning，与 opencode 口径对齐 —— **行为正确**。但这是隐性约定，一旦有人改成直接用源数据的 total 字段（pi 用 `totalTokens`），pi 侧会少算约 867 万 reasoning tokens（实测 pi 全部 reasoning 总量）。

**建议**：
1. 在 `RawMessage` 注释和 `aggregate.ts` 顶部显式声明口径：「total = 五项之和，来源的 total 字段仅供参考，禁止直接使用」
2. 加一条单元测试断言：`normModel + aggregate` 后 `daily.total === 五项之和`

---

### P2. 零 token 记录虚增调用次数

**位置**：`src/data/opencode.ts:31-44`

**证据**：opencode 的 20,630 条 assistant 消息中有 **491 条全 0 token**（API 错误如 `Insufficient balance`、空响应）。代码对它们照常 `calls: 1`。

**影响**：调用次数虚增约 2.4%；「今日调用次数」「累计调用次数」统计偏高。token 总量不受影响。

**建议**：读取时若 `total === 0` 则跳过该条（或加 `isError` 标记后仍跳过）。pi 侧未见同样问题（usage 存在即有真实调用）。

---

### P3. 模型别名大小写分裂

**位置**：`src/data/aggregate.ts:14-24`（`normModel`）

**证据**（实测 Top 5 模型分布）：

| 模型 | 占比 | 来源 |
|---|---|---|
| deepseek-v4-flash | 61.5% | 两边都有 |
| **MiniMax-M3** | 14.9% | opencode（原始大小写） |
| deepseek-v4-pro | 7.7% | 两边都有 |
| mimo-v2.5-pro | 6.3% | opencode |
| **minimax-m3** | 5.6% | pi（小写） |

`MiniMax-M3` 与 `minimax-m3` 被当作两个模型分别展示、分别排名、颜色不同 —— **实际很可能是同一个模型**。

**根因**：`normModel()` 对 pi 侧做了 `toLowerCase()`，但 opencode 的 `modelID` 未走归一化（`opencode.ts` 直接存 `d.modelID`）。

**建议**：在 `loadOpencodeMessages()` 里也调用 `normModel()` 归一化（或让 modelID 统一小写）。同时把 `MiniMax-M3` 类模型名加入 `ALIASES` 表。

---

## 二、未利用的数据（功能缺口）

### P4. cost 字段完全未读取 — 应用不统计费用

**位置**：`src/data/pi.ts` / `src/data/opencode.ts`

**证据**：两个数据源都带费用字段，全部被丢弃：
- pi：`usage.cost = { input, output, cacheRead, cacheWrite, total }`（35,605 条全部有）
- opencode：`data.cost`（毫美元）

**影响**：用户无法看到花了多少钱 —— 对 coding agent 用户这是高频需求（token 免费但 API 计费）。数据现成，加一个「今日费用 / 累计费用」卡片成本极低。

**建议**：
1. `RawMessage` 增加 `cost` 字段（单位注意：pi 是美元，opencode 需确认单位）
2. `ModelStats` 增加 cost 累加
3. `TopStats.vue` 加费用卡片，`exportCSV.ts` 加 cost 列

---

### P5. `cacheWrite1h` 字段被丢弃

**位置**：`src/data/pi.ts:44-47`

**证据**：pi 有 7,030 条记录带 `usage.cacheWrite1h`（1 小时内缓存写入）。实测其值恒等于 `cacheWrite`，当前丢弃**暂无损失**，但这是某类计费信息（很多 API 对 1h 内缓存写入免费/半价），未来若字段语义变化会丢信息。

**建议**：读取时透传到 `RawMessage`（可选字段），或至少注释说明为何忽略。

---

## 三、性能与稳定性隐患

### P6. opencode 3.9GB 数据库的读取路径

**位置**：`src/data/opencode.ts:24-30`

**证据**：
- `opencode.db` 文件 3.9GB，但 message 表仅 23,983 行、`data` 字段总和 165MB —— **文件体积大部分是历史空洞/WAL 残留**
- 存在单条 **124MB 的巨型 user 记录**，SQL 的 `json_extract(data, '$.role') = 'assistant'` 需完整解析它才能判断角色

**影响**：当前实测全表读取 0.4s 尚可；数据继续增长 + 巨型记录增多后，SQL 层 `json_extract` 会成为瓶颈。另外 3.9GB 文件每次冷启动读入开销大。

**建议**：
1. 短期：用户手动 `VACUUM` 瘦身（外部操作，报告即可）
2. 中期：SQL 增加 `AND length(data) < 100000000` 之类防护，或先按 `json_type(data,'$.tokens')` 缩小范围
3. 长期：增量同步（记录上次读取的 `time_created` 游标）

---

### P7. 聚合函数类型安全被绕过

**位置**：`src/data/aggregate.ts:161`（`as any` 返回值）、`aggregate.ts:185-210`（`getDayDetail` 内多处 `(snap as any).perDayHour`）

**证据**：`DataSnapshot` 类型（`src/shared/types.ts`）未声明 `perDayHour / perDayHourModel / perDayMinuteModel / perDayHourProvider / perDayMinuteProvider` 5 个字段，但运行时确实存在，靠 `as any` 传递。

**影响**：任何字段改名/重构都会静默失效（`undefined` 而不报编译错）；`DayDetail` 类型与 `getDayDetail` 返回值一致性也无法被编译器校验。

**建议**：把这 5 个字段补进 `DataSnapshot`，删掉 `as any`，让类型系统真正兜底。

---

### P8. 时区硬编码 UTC+8

**位置**：`src/data/aggregate.ts:49-74`（4 个函数全部 `+ 8 * 3600 * 1000`）、`src/renderer/charts/heatmap.ts:5-8`

**影响**：非 UTC+8 环境的用户（或 UTC+8 有夏令时变化的地区）日期分界、小时统计会错位。

**建议**：改用 `Intl.DateTimeFormat(undefined, { timeZone: undefined })` 取本地时区，或做成配置项。若确认只服务 UTC+8，至少在 DESIGN.md 中声明该假设。

---

### P9. 每次刷新全量重算所有历史

**位置**：`src/main/index.ts:17-20`（`buildSnapshot`）、`src/renderer/composables/useData.ts:34`（60s 定时器）

**证据**：实测当前数据量一次全量构建约 2.8s；pi 812 个文件、56k 条消息全量重读。数据翻倍后会显著变卡。

**影响**：刷新时 UI 阻塞（`data:refresh` 是同步 await）；会话文件越积越多。

**建议**：
1. 最小改动：`data:refresh` 与 `data:get` 改为增量（仅重读 60s 内有修改的文件）
2. 或：把聚合结果持久化（SQLite/JSON 缓存 + mtime 失效）

---

## 四、UI / 代码质量问题

### P10. `DayDetail.minutes` 命名误导

**位置**：`src/shared/types.ts:75-76`、`src/data/aggregate.ts:189-202`

**证据**：`minutes: MinuteRecord[]` 注释写「24 entries (hourly)」—— 实际是**小时**粒度数组，与 `perModelMinutely`（真 1440 分钟）并存同名冲突。

**影响**：后续维护者极易混淆；`MinuteRecord.hour` 字段名也暗示了它是小时桶。

**建议**：重命名 `minutes` → `hours`，`MinuteRecord` → `HourRecord`（涉及 `aggregate.ts` / `types.ts` / `detailBar.ts` 三处，机械改动）。

---

### P11. 大数字无千分位格式化

**位置**：`src/renderer/components/TopStats.vue`（`el-statistic` 未配 formatter）、`DetailDialog.vue` 统计卡

**证据**：累计 token 达 121 亿（`12137635933`），`el-statistic` 默认原样显示长数字，可读性差。

**建议**：加 formatter 输出 `12,137,635,933`（或 `121.4亿`）。

---

### P12. 热力图色阶区分度不足

**位置**：`src/renderer/charts/heatmap.ts:120-124`

**证据**：`visualMap.inRange.color` 只有 3 个值 `['#2c2c32', '#2c2c32', '#76ff76']` 对应 6 个级别（-1~4），前两级同色、后四级靠插值。实际数据里 97.9% 是缓存命中导致 daily total 普遍巨大，量化后大量格子集中在同一级别。

**建议**：改为 5 级明确色阶（如 `['#161b22', '#0e4429', '#006d32', '#26a641', '#39d353']`），并用对数/分位数归一化。

---

### P13. App.vue 两个 Segmented 绑定同一状态（可能是设计意图，需确认）

**位置**：`src/renderer/App.vue:24-25`、`34-35`

**证据**：两处 `el-segmented v-model="viewMode"` 指向同一个 ref，切换一处另一处同步变。

**影响**：若用户只想切换「每日 Token 总消耗」而保留「分布视图」为模型视角，做不到。若这是有意设计（全局模式切换），建议注释说明。

---

## 五、修复优先级建议

| 优先级 | 问题 | 工作量 | 收益 |
|---|---|---|---|
| 🔴 1 | P3 模型归一化 | 小（2 处） | 数据展示正确性 |
| 🔴 2 | P2 零 token 调用 | 小（1 处） | calls 统计准确 |
| 🟠 3 | P1 口径固化（注释+测试） | 小 | 防止回归 |
| 🟠 4 | P7 类型安全补齐 | 中 | 消除重构隐患 |
| 🟠 5 | P4 费用统计 | 中 | 核心功能扩展 |
| 🟡 6 | P8/P9 时区与增量 | 中-大 | 长期稳定 |
| 🟡 7 | P10-P13 UI 细节 | 小 | 体验优化 |

---

*报告由代码审查 + 真实数据验证得出，所有统计数据均为本机实测。*
