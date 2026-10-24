# dsh-kilo-models

DSH 插件：把 Kilo 免费模型名册做成设置页里的按钮——一键刷新、逐个探活、综合分级、写回配置。
（起因：上游下架或转付费后，静态写在 `cordis.patch.yml` 里的模型 id 会让每轮请求 400。）

## 功能

- **刷新并探测**：拉 `api.kilo.ai/api/gateway/models`，取 `isFree` 的模型逐个真发一次
  `Reply with exactly: OK`（并发 4、20 秒超时），结果落 `~/.dsh/kilo-models/state.json`。
- **仅拉清单**：只更新元数据，不调推理端点。
- **综合分级**：`榜单分×0.5 + 上下文×0.35 + 新鲜度×0.15`（无榜单时上下文×0.7 + 新鲜度×0.3），
  分 S/A/B/C，探活失败记 X。
- **联网查榜单**：走 `ctx.web.search` 现查 Elo 折算成分数，查不到回落内置快照 `data/rankings.json`。
- **写回配置**：把勾选的模型写进 `llm-pi-ai.providers.kilo.models`，其余文本不动，写前自动备份。
- **设置 → 可用模型**：单独一页，只列探活通过的模型，可复制 id。
- **选择器文字**：模型名后面直接显示 `视觉·视频·工具·推理·到期`，一眼看出能力，不用查文档。

## 安装

1. 克隆：

   ```powershell
   git clone git@github.com:13649209883-hash/dsh-kilo-models.git E:\deepseek\plugins\dsh-kilo-models
   ```

2. 链接进 DSH profile（junction，改源码不用重拷）：

   ```powershell
   New-Item -ItemType Junction `
     -Path "$env:USERPROFILE\.dsh\profiles\desktop\node_modules\dsh-kilo-models" `
     -Target "E:\deepseek\plugins\dsh-kilo-models"
   ```

3. 在 `~/.dsh/profiles/desktop/cordis.patch.yml` 末尾加：

   ```yaml
   - insert:
       - id: kilo-models
         name: dsh-kilo-models
   ```

4. 重启 DSH，刷新页面。设置里会出现 **Kilo 模型** 与 **可用模型**。

前提：`cordis.patch.yml` 里已有 `llm-pi-ai` 的 Kilo 路由（`providers.kilo`），
且 `KILO_API_KEY` 在环境变量或 `~/.dsh/.credentials.yaml` 里。插件不创建 provider，只维护它的 `models`。

## 注意

- Kilo 免费池会把 prompt 记为可训练（`mayTrainOnYourPrompts: true`），别喂敏感内容。
- 「联网查榜单」每次消耗一个模型轮次；不想花就取消勾选。
- 榜单分是家族级近似值，用来排序分档，不是严格评测。
