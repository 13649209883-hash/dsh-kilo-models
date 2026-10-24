# dsh-kilo-models

Kilo.ai 免费模型名册插件（DeepSeek Harness）。解决的问题：DSH 的模型清单是静态写在
`cordis.patch.yml` 里的，Kilo 上游随时下架或把免费模型转付费（2026-10-24 的
`minimax/minimax-m3.1-flash:free` 就是这么开始每轮 400 的）。这个插件把「拉清单 → 逐个探活 →
综合分级 → 写回配置」做成设置页里的按钮，并且**在选模型的地方就把能力标出来**。

## 界面（三块）

### 1. 设置 → Kilo 模型

- **刷新并探测**：从 `https://api.kilo.ai/api/gateway/models` 拉全量清单，取出 `isFree` 的模型，
  对每个模型真发一次 `Reply with exactly: OK`（`max_tokens: 200`，因为推理型模型会把小预算全吃在
  thinking 上），并发 4、每个 20 秒超时。
- **仅拉清单**：只更新元数据，不请求推理端点（快，但「可用」列全是「未测」）。
- **联网查榜单**：用 DeepSeek 原生联网搜索（`ctx.web.search`）现查一次 LMArena 类榜单，把各家族
  Elo 折算成 0–100 的分数，然后重算分级（不重拉清单）。侧栏勾选「刷新时联网查榜单」可让刷新顺带做。
  查不到就回落内置快照 `data/rankings.json`（人工整理的家族参考分，随版本更新）。
- **写回 DSH 配置**：把勾选的模型写成 `llm-pi-ai.providers.kilo.models` 那段 YAML，其余文本一字不动，
  写前备份到 `~/.dsh/kilo-models/cordis.patch.yml.<ts>.bak`。配置热加载后模型选择器立即更新。

表格列：勾选 / 等级 / 分数 / 模型 / 上下文 / 标签 / 分级依据 / 探活 / 到期日。

### 2. 设置 → 可用模型

只列探活通过的模型，卡片式，带等级、分数、标签、上下文、复制 id 按钮、重新探测按钮。
不想在长表格里翻的时候，用这一页挑。

### 3. 模型选择器里的徽标

在 composer 的模型菜单、`/model` 里，模型名后面直接挂能力徽标：

| 徽标 | 含义 |
|:--|:--|
| 👁 | 支持图片输入 |
| 🎬 | 支持视频输入 |
| 🔊 | 支持音频输入 |
| 🧰 | 支持工具调用 |
| 🧠 | 支持推理 |
| ⏳ | 30 天内到期（免费额度要没了） |

实现上占用 `conversation.input.model.label` 槽（会话作用域），对触发器、当前值、每个选项都生效；
数据来自 `state.json` 的 5 分钟缓存，面板刷新后会广播失效。

## 分级规则

不再只看上下文窗口，而是三项加权：

```
分数 = 榜单分 × 0.5 + 上下文分 × 0.35 + 版本新鲜度 × 0.15
       （没有榜单分时：上下文 × 0.7 + 新鲜度 × 0.3）
```

- **榜单分**：优先用联网查到的 Elo（`(elo−950)/6` 截到 0–100），否则用内置快照里该家族的分；两级都没有就不参与加权。
- **上下文分**：1M→85、512K→72、256K→62、128K→50、64K→38、其余 28、未知 45。
- **新鲜度**：按上游 `created` 算，≤180 天 95、≤365 天 80、≤730 天 60、更老 45、未知 50。
- **等级**：≥75 `S` 旗舰、≥60 `A` 主力、≥45 `B` 中量、其余 `C` 轻量；**探活失败强制 `X` 不可用**
  （排序时 X 沉底，但仍显示分数和依据，方便判断是「太弱」还是「暂时挂了」）。

标签（视觉 / 视频 / 音频 / 多模态 / 代码 / 审核 / 自动选型 / 工具 / 推理 / 即将到期 / 极速 / 慢）
来自上游 `architecture.input_modalities`、`supported_parameters`、`opencode.variants`、
`expiration_date` 与探活耗时。

## 数据落盘

- `~/.dsh/kilo-models/state.json`：最近一次刷新结果（version 3，含每个模型的分数、依据、探活耗时、失败原因）。
- `~/.dsh/kilo-models/cordis.patch.yml.*.bak`：每次写回配置前的备份。

## HTTP API

宿主注册一条 `kind: 'exact'`、`path: '/dsh-kilo-models'` 的路由（仅回环地址可访问）：

- `GET /dsh-kilo-models` → `{ ok, state }`
- `POST { "op": "refresh", "probe": true, "leaderboard": true }` → 刷新（可关探测/账单查询）
- `POST { "op": "leaderboard" }` → 只重查榜单并重算分级
- `POST { "op": "apply", "ids": ["..."] }` → 写回 cordis.patch.yml
- `POST { "op": "probe", "id": "..." }` → 单个模型探活

## 凭据

`KILO_API_KEY` 优先取环境变量，其次 `~/.dsh/.credentials.yaml` 里的同名键（不打印、不落盘）。
`KILO_MODELS_BASE` 可覆盖网关地址（默认 `https://api.kilo.ai/api/gateway`）。

## 安装

1. 克隆到任意位置：

   ```powershell
   git clone git@github.com:13649209883-hash/dsh-kilo-models.git E:\deepseek\plugins\dsh-kilo-models
   ```

2. 链接进 DSH profile（用 junction，改源码不用重新拷）：

   ```powershell
   New-Item -ItemType Junction `
     -Path "$env:USERPROFILE\.dsh\profiles\desktop\node_modules\dsh-kilo-models" `
     -Target "E:\deepseek\plugins\dsh-kilo-models"
   ```

3. 在 `~/.dsh/profiles/desktop/cordis.patch.yml` 末尾加一段挂载（`id` 是插件实例名，`name` 是包名）：

   ```yaml
   - insert:
       - id: kilo-models
         name: dsh-kilo-models
   ```

4. 重启 DSH 让插件加载；之后刷新页面，设置里会出现 **Kilo 模型** 与 **可用模型**，
   模型选择器里的模型名后面会出现能力徽标。

前提：`cordis.patch.yml` 里已有 `llm-pi-ai` 的 Kilo 路由（`providers.kilo`），
并且 `KILO_API_KEY` 在环境变量或 `~/.dsh/.credentials.yaml` 里。插件不创建 provider，
只维护它的 `models` 列表。

## 注意

- Kilo 免费池的所有通道都会把 prompt 记为可训练（`mayTrainOnYourPrompts: true`），
  插件在面板底部也提示了这点——别把敏感内容喂给免费模型。
- 「联网查榜单」走 `ctx.web.search`，会消耗一个模型轮次；不想花就取消勾选，只用内置快照。
- 榜单分是「家族级」的近似值，不是精确到每个模型的 Elo——上游榜单多是闭源旗舰对局，
  开源小模型只能按家族/尺寸估。分数用来排序和分档，不要当成严格评测。
