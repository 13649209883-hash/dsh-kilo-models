# 变更记录

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
