# dsh-kilo-models

我想解决的就一件事：模型清单别老让我自己手改。

- 有个自己的设置界面，我点一下更新模型列表，就能把 Kilo 模型列表更新一遍，顺带自动探测一下这几个模型还活不活、什么等级，分个类。
- 只靠上下文长度来决定模型等级，是不是太草率了一点？所以让它联网搜索一下模型榜单，综合着决定。
- 部分重要标签应该在模型选择的时候就给出，比如是不是多模态之类的，不然选的时候还得来回翻。
- 现有可用模型单独列一页，省得在长表格里找。

（一开始是怎么坏的呢：`minimax/minimax-m3.1-flash:free` 被上游下架、转成付费了，配置里还留着它，于是每条消息都报 `does not exist`。）

## 用起来是这样

**Kilo 模型**（设置里）

刷新并探测 / 仅拉清单 / 联网查榜单 / 写回 DSH 配置。表格里有等级、分数、模型、上下文、标签、分级依据、探活耗时、到期日。
分级 = 榜单分 ×0.5 + 上下文 ×0.35 + 新鲜度 ×0.15，没榜单就上下文 ×0.7 + 新鲜度 ×0.3；S/A/B/C，探活失败记 X。

**可用模型**（设置里）

只列探活通过的，卡片式，能复制 id，省得翻。

**选模型的时候**

模型名后面直接跟文字：`视觉·视频·工具·推理·到期`。之前用 emoji 徽标，太不直观了，也没有查询方法，就改成文字了。

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

4. 重启 DSH，刷新页面。设置里会出现 **Kilo 模型** 和 **可用模型**。

前提：`cordis.patch.yml` 里已经有 `llm-pi-ai` 的 Kilo 路由（`providers.kilo`），
并且 `KILO_API_KEY` 在环境变量或 `~/.dsh/.credentials.yaml` 里。插件不创建 provider，只维护它的 `models`。

## 另外

- Kilo 免费池会把 prompt 记为可训练（`mayTrainOnYourPrompts: true`），别喂敏感内容。
- 联网查榜单每次消耗一个模型轮次，不想花就取消勾选，用内置快照。
- 榜单分是家族级的近似值，用来排序分档，不是严格评测。
