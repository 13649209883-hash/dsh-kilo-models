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

## 五、把这段话发给你的 agent（另一种安装方式）

不想自己敲命令，就把下面整段复制给 DSH / Codex / 任何能读写本机的 agent，让它替你装、配密钥、验收到能用为止：

```text
帮我在本机安装 https://github.com/13649209883-hash/dsh-kilo-models 这个 DSH 插件，然后告诉我怎么配置 Kilo 密钥、装完怎么用免费模型。

步骤：
1. 克隆到 E:\deepseek\plugins\dsh-kilo-models（目录已存在就先问我，别直接覆盖）。
2. junction 到 %USERPROFILE%\.dsh\profiles\desktop\node_modules\dsh-kilo-models：
   New-Item -ItemType Junction -Path "$env:USERPROFILE\.dsh\profiles\desktop\node_modules\dsh-kilo-models" -Target "E:\deepseek\plugins\dsh-kilo-models"
   已存在同名实体目录先改名成 dsh-kilo-models.local-bak，不要直接删。
3. 在 %USERPROFILE%\.dsh\profiles\desktop\cordis.patch.yml 末尾加（加之前备份，确认没有重复条目，别动文件里其它内容）：
   - insert:
       - id: kilo-models
         name: dsh-kilo-models
4. 确认 llm-pi-ai.providers.kilo 存在：baseURL https://api.kilo.ai/api/gateway、apiKeyEnv KILO_API_KEY、api openai-completions；没有就照这个补一段，models 可以先留空。
5. 密钥：在 %USERPROFILE%\.dsh\.credentials.yaml 里加一行 KILO_API_KEY: <key>，或设成同名环境变量。key 在 https://app.kilo.ai/profile 的 API Keys 里生成。
6. 重启 DSH 桌面端（客户端 bundle 有缓存，只刷新页面不生效），再 Ctrl+F5。
7. 验收：GET http://127.0.0.1:<DSH端口>/dsh-kilo-models 返回 200 且 freeCount > 0；设置 → Kilo 模型 页面能打开、表格有数据。
8. 最后用一句话告诉我：打开设置 → Kilo 模型 → 检测可用性 → 勾选 → 更新模型选择列表 → 在模型菜单里选，就能用免费模型。

任何一步失败，把原始报错贴给我，不要为了绕过报错去改别的配置。
```

装完的用法见下一节；也可以让 agent 直接在最后一步告诉你。

## 六、装完怎么用免费模型

1. **检测可用性**：设置 → **Kilo 模型** → 点一下。它会拉清单、筛出免费模型、逐个真发一次请求（17 个大约 6–15 秒）。
2. **挑模型**：看「分类 / 分 / 连通性」三列——先按上下文档选，再挑组内分高、显示 `可用 · xxx ms` 的；标「限流」的过一会儿再试，标「到期」的注意额度失效日。
3. **更新模型选择列表**：勾选要用的（默认自动勾上所有可用的）→ 点「更新模型选择列表(N)」→ 重启 DSH。
4. **在聊天里用**：聊天框的模型菜单里选它们，名字后面会带「视觉 / 工具 / 推理 / 到期」等标签。

免费池的 prompt 会被记为可训练（`mayTrainOnYourPrompts: true`），别喂敏感内容；429 说明这个模型这一会儿被限流，换个用即可。

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
