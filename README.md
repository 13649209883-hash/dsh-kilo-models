# dsh-kilo-models

Kilo.ai 免费模型名册插件（DeepSeek Harness）。解决的问题：DSH 的模型清单是静态写在
`cordis.patch.yml` 里的，Kilo 上游随时下架或把免费模型转付费（2026-10-24 的
`minimax/minimax-m3.1-flash:free` 就是这么开始每轮 400 的）。这个插件把「拉清单 → 逐个探活 →
分级 → 写回配置」做成设置页里的一个按钮。

## 界面

设置 → **Kilo 模型**：

- **刷新并探测**：从 `https://api.kilo.ai/api/gateway/models` 拉全量清单，取出 `isFree` 的模型，
  对每个模型真发一次 `Reply with exactly: OK`（`max_tokens: 200`，因为推理型模型会把小预算全吃在
  thinking 上），并发 4、每个 20 秒超时。
- **仅拉清单**：只更新元数据，不请求推理端点（快，但「可用」列全是「未测」）。
- **写回 DSH 配置**：把勾选的模型写成 `llm-pi-ai.providers.kilo.models` 那段 YAML，其余文本一字不动，
  写前备份到 `~/.dsh/kilo-models/cordis.patch.yml.<ts>.bak`。配置热加载后模型选择器立即更新。

表格列：等级 / 模型（id）/ 上下文 / 标签（视觉、视频、音频、代码、审核、工具、推理、即将到期、极速、慢）/
探活耗时 / 到期日。

等级规则（按上下文窗口）：`S` ≥ 1M 旗舰，`A` 512K–1M 主力+、256–512K 主力，`B` 128–256K 中量，
`C` < 128K 轻量，探活失败记 `X`。

## 数据落盘

- `~/.dsh/kilo-models/state.json`：最近一次刷新结果（含每个模型的探活耗时与失败原因）。
- `~/.dsh/kilo-models/cordis.patch.yml.*.bak`：每次写回配置前的备份。

## HTTP API

宿主注册一条 `kind: 'exact'`、`path: '/dsh-kilo-models'` 的路由（仅回环地址可访问）：

- `GET /dsh-kilo-models` → `{ ok, state }`
- `POST { "op": "refresh", "probe": true }` → 刷新并探活
- `POST { "op": "refresh", "probe": false }` → 仅拉清单
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

4. 重启 DSH 让插件加载；之后刷新页面，设置里会出现 **Kilo 模型**。

前提：`cordis.patch.yml` 里已有 `llm-pi-ai` 的 Kilo 路由（`providers.kilo`），
并且 `KILO_API_KEY` 在环境变量或 `~/.dsh/.credentials.yaml` 里。插件不创建 provider，
只维护它的 `models` 列表。

## 注意

Kilo 免费池的所有通道都会把 prompt 记为可训练（`mayTrainOnYourPrompts: true`），
插件在面板底部也提示了这点——别把敏感内容喂给免费模型。
