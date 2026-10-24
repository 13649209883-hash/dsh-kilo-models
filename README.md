# dsh-kilo-models

把「聚合站免费模型池」变成设置里的一页按钮：拉清单、真发请求探活、按排行榜打分、写回 DSH 的模型选择列表。
默认接 Kilo，换个站点只要改两个环境变量。

## 界面

设置 → **Kilo 模型**，顶部三行：

```
全部模型 17    可用模型 14              ← 标签
排序方式  按分数  按发布时间              ← 排序
检测可用性  只更新列表  按排行榜评分  更新模型选择列表(3)   ← 操作
```

表格四列：`☑ | 分类/分 | 模型 | 连通性/到期`，宽度压在面板内，不用横向拖动。悬停能看到上下文、评分依据、完整报错。

## 一、点一下更新模型列表

- **检测可用性**：拉一次上游清单，筛出免费模型，逐个发 `Reply with exactly: OK` 真测（并发 4，单个最多等 20 秒），然后重新评分。
- **只更新列表**：只拉清单，不调推理端点，不花额度。
- **按排行榜评分**：不碰上游，只重新算分。
- **更新模型选择列表(3)**：把勾选的模型写进 `cordis.patch.yml` 的 `llm-pi-ai.providers.kilo.models`，
  其余文本一字不动，写前自动备份到 `~/.dsh/kilo-models/*.bak`。

## 二、先按上下文大小分类，再各自内部评分

上下文不参与打分，只决定分到哪一组：

| 分类 | 上下文 |
|:--|:--|
| ≥1M | 100 万 token 及以上 |
| 512K–1M | 51.2 万 – 100 万 |
| 256K–512K | 25.6 万 – 51.2 万 |
| 128K–256K | 12.8 万 – 25.6 万 |
| <128K | 12.8 万以下 |

组内的「分」就是**排行榜分**（0–100），不再掺上下文、也不掺新鲜度：

```
分数 = 排行榜分
       查不到榜单分 → 显示「—」，排在本组末尾
```

排行榜分来自 `ctx.web.search`（联网查一次 LMArena 榜单，把 Elo 折算成 0–100）；查不到就用内置快照
`data/rankings.json`（人工整理的家族参考分）。点「按排行榜评分」只重算分数。

排序两种：

| 排序 | 组内规则 |
|:--|:--|
| 按分数 | 有分的按分数从高到低；**没有榜单分的沉到本组末尾** |
| 按发布时间 | 按模型发布日从新到旧，缺日期的沉底 |

## 三、选模型的时候就能看到重要标签

模型菜单里名字后面直接跟灰色小字：

| 文字 | 意思 |
|:--|:--|
| 视觉 / 视频 / 音频 | 能读这类输入 |
| 工具 | 支持 tool calling |
| 推理 | 有 thinking 档 |
| 到期 | 30 天内免费额度失效 |
| 限流 | 上次探活被 429 挡了，不是模型没了 |

最多 4 个，多的记 `+N`，悬停看全。

## 四、连通性写清楚

右边一列不写「✓/✗」，写具体发生了什么：

| 情况 | 显示 |
|:--|:--|
| 200 | `可用 · 968ms` |
| 429 / 408 / 5xx | `限流 · HTTP 429` |
| 404 等 | `HTTP 404: model not found…` |
| 没测过 | `未检测` |

429 不会被当成「模型下架」，它留在原分类里、标「限流」。

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

4. 重启 DSH（客户端 bundle 有缓存，只刷页面可能读到旧的），然后 Ctrl+F5。

前提：`cordis.patch.yml` 里已经存在对应 provider 路由，且 API key 在环境变量或 `~/.dsh/.credentials.yaml`
（默认读 `KILO_API_KEY`）。插件不创建 provider，只维护它的 `models`。

## 换一个聚合站

不用改代码，两个环境变量：

| 变量 | 作用 | 默认 |
|:--|:--|:--|
| `KILO_MODELS_BASE` | 网关地址（`GET {BASE}/models`、`POST {BASE}/chat/completions`） | `https://api.kilo.ai/api/gateway` |
| `KILO_MODELS_PROVIDER` | 写回时对应的 `providers.<name>` | `kilo` |

新站点只要兼容 OpenAI 风格的 `/models` 与 `/chat/completions`，清单里带 `isFree` 之类的免费标记，
就能直接用；字段映射不一致时改 `index.js` 的 `fetchListing` / `rankScoreOf`。

## 注意

- Kilo 免费池会把 prompt 记为可训练（`mayTrainOnYourPrompts: true`），别喂敏感内容。
- 「按排行榜评分」每次消耗一个模型轮次，不想花就取消勾选「评分时联网查排行榜」，用内置快照。
- 榜单分是家族级近似值，用来排序分档，不是严格评测。
