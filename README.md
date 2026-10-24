# dsh-kilo-models

把 Kilo 免费模型名册做成设置里的按钮：点一下就能更新列表、探测可用性、分好等级，再把结果写回 DSH 配置。

## 功能

### 一、点一下更新模型列表

设置里多了「Kilo 模型」一页，有自己的界面。点「刷新并探测」，就去 Kilo 拉一次全量清单，
筛出免费的那批，然后挨个发一句 `Reply with exactly: OK` 真测一遍（并发 4 个，每个最多等 20 秒）。

- 表格里能看到：等级、分数、模型、上下文、标签、分级依据、探活耗时、到期日。
- 只想更新清单、不想花额度，点「仅拉清单」，不调推理端点。
- 勾选想要的模型，点「写回 DSH 配置」，写进 `cordis.patch.yml` 的 `llm-pi-ai.providers.kilo.models`，
  其余文本一字不动，写前自动备份。

### 二、联网查榜单，综合决定等级

只靠上下文长度定级太草率。现在按三项加权：

```
分数 = 榜单分 × 0.5 + 上下文 × 0.35 + 版本新鲜度 × 0.15
       （没查到榜单分时：上下文 × 0.7 + 新鲜度 × 0.3）
```

榜单分来自联网搜索（`ctx.web.search`）：现查一次排行榜，把各家 Elo 折算成 0–100；查不到就用
内置快照 `data/rankings.json`（人工整理的家族参考分）。点「联网查榜单」可以只重算分级，不重拉清单。

按分数分 S / A / B / C 四档，探活失败的记 X 并沉到列表底部。

### 三、选模型的时候就能看到重要标签

在模型的菜单里，名字后面直接跟一小段灰色文字：

| 文字 | 意思 |
|:--|:--|
| 视觉 / 视频 / 音频 | 能读这类输入 |
| 工具 | 支持 tool calling |
| 推理 | 有 thinking 档 |
| 到期 | 30 天内免费额度失效 |

最多显示 4 个，多出来的记 `+N`，鼠标悬停看全。之前用的是 emoji 图标，不直观也没有地方查含义，
所以改成了文字。

### 四、可用模型和完整清单在同一页，两个标签页切换

「Kilo 模型」这一页顶部有两个标签：

- **全部模型**：完整表格，带勾选框、等级、分数、上下文、标签、依据、探活、到期，勾好可以写回配置。
- **可用模型**：只列探活通过的，卡片式，带等级、分数、上下文、标签，可以复制模型 id。

不用在两个设置页面之间来回跳。

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

4. 重启 DSH，刷新页面（Ctrl+F5）。设置里会出现「Kilo 模型」一页，顶部是「全部模型 / 可用模型」两个标签。

前提：`cordis.patch.yml` 里已经有 `llm-pi-ai` 的 Kilo 路由（`providers.kilo`），
并且 `KILO_API_KEY` 在环境变量或 `~/.dsh/.credentials.yaml` 里。插件不创建 provider，只维护它的 `models`。

## 注意

- Kilo 免费池会把 prompt 记为可训练（`mayTrainOnYourPrompts: true`），别喂敏感内容。
- 「联网查榜单」每次消耗一个模型轮次，不想花就取消勾选，用内置快照。
- 榜单分是家族级的近似值，用来排序分档，不是严格评测。
