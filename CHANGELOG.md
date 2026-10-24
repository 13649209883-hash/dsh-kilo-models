# 变更记录

## 0.2.2 — 2026-10-24

README 精简：126 行 → 51 行，只留功能点与安装步骤（分级公式、API、数据落盘等细节点到为止）。

## 0.2.1 — 2026-10-24

选择器里的能力标识从 emoji 改成中文文字。

- 徽标 👁/🎬/🔊/🧰/🧠/⏳ 换成 `视觉`/`视频`/`音频`/`工具`/`推理`/`到期`（`·` 连接，
  最多 4 个，多出来的记 `+N`，悬停看完整列表）。
- 面板底部加一行文字说明，不用翻 README 也知道每个词什么意思。
- 原因：emoji 在窄菜单里辨认成本高，而且没有地方「查」它代表什么。

## 0.2.0 — 2026-10-24

按「别只看上下文分级」的意见改版。

- **综合分级**：分数 = 榜单分 ×0.5 + 上下文分 ×0.35 + 版本新鲜度 ×0.15；没有榜单分时按
  上下文 ×0.7 + 新鲜度 ×0.3。等级阈值 S≥75 / A≥60 / B≥45 / C，探活失败强制 X。
- **联网查榜单**：新增 `POST {op:'leaderboard'}`，用 `ctx.web.search` 现查 LMArena 类榜单，
  从标题/摘要里抠家族名后的 Elo（950–1600 → 0–100）；查不到回落内置快照 `data/rankings.json`。
  刷新接口新增 `leaderboard` 布尔，面板上有「刷新时联网查榜单」勾选。
- **选择器徽标**：占用 `conversation.input.model.label` 槽，在模型名后显示
  👁 视觉 / 🎬 视频 / 🔊 音频 / 🧰 工具 / 🧠 推理 / ⏳ 30 天内到期。
- **可用模型独立页**：设置里新增「可用模型」分区（order 27），只列探活通过的模型，卡片式，
  带复制 id 与重新探测。
- 表格新增「分」「依据」两列；`state.json` 升到 version 3（每条带 `score`/`rank`/`rankFrom`/`tierReason`）。
- 修：榜单解析会把前一个家族的 Elo 算到后一个家族头上（现在只在家族名后 90 字符内找数字）。
- 修：同家族同时有内置分与联网分时，优先用联网分。

实测（2026-10-24，内置榜单）：17 个免费模型全部探活，约 14 秒；S 级 4 个
（nemotron-3-ultra 88、nemotron-3.5-super-vl 86、nemotron-3.5-lightning 80、laguna-s 75），
可用 14 个、失败 3 个（120b 404、laguna-xs 429、xing4.0 429）。

## 0.1.0 — 2026-10-24

首个版本。

- 设置页「Kilo 模型」面板：刷新并探测 / 仅拉清单 / 写回 DSH 配置。
- 从 `https://api.kilo.ai/api/gateway/models` 取 `isFree` 模型，逐个真发
  `Reply with exactly: OK`（`max_tokens: 200`）探活；并发 4，单项 20 秒超时。
- 按上下文窗口分级：`S` ≥ 1M / `A` 256K–1M / `B` 128–256K / `C` < 128K，探活失败记 `X`。
- 自动标签：视觉、视频、音频、代码、审核、工具、推理、极速、慢、即将到期（≤30 天）。
- 写回 `cordis.patch.yml` 的 `llm-pi-ai.providers.kilo.models`，改动前备份到
  `~/.dsh/kilo-models/cordis.patch.yml.<ts>.bak`，其余文本不动。
- 结果落盘到 `~/.dsh/kilo-models/state.json`；HTTP 路由 `/dsh-kilo-models` 仅回环可访问。

首版实测（2026-10-24）：402 个模型、17 个免费，17 个全探活用时约 13 秒，
14 个可用、3 个失败（其中 `nvidia/nemotron-3-super-120b-a12b:free` 404，
`poolside/laguna-xs-2.1:free` 与 `xingchen-agi/xing4.0-29b-a4b:free` 429）。
