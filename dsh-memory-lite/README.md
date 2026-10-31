# dsh-memory-lite

给 DeepSeek Harness（DSH）的最小可行记忆插件。**零依赖、无构建、无数据库、无后台进程。**

## 设计

- **性格层与记忆层分离**：persona 独立文件、独立预算、独立注入通道，不参与检索排序。
- **记忆层两阶段检索**：粗扫 `index.jsonl` 摘要索引 → 精确展开 Top-K 原文块。
- **上下文无上限，计算量近似恒定**：`personaTokens + memoryTokens` 是 prompt 中记忆相关部分的硬上限，库再大也不涨。
- **压缩可校验、可回退**：只做规则去冗余和抽取式删句；语义保真校验不过就保留原文，不做生成式摘要。
- **原文是法律，压缩是草稿**：`content` 永远保留原文，`compact` 只用于索引和注入。

## 安装

```bash
dsh plugin --profile web add link:./dsh-memory-lite
```

## 配置

配置文件只有一个：项目根目录的 **`cordis.patch.yml`**。

### 默认配置

```yaml
plugins:
  dsh-memory-lite:
    enabled: true
    config:
      memoryDir: "~/.dsh/memory-lite"
      personaTokens: 200
      memoryTokens: 500
      coarseTopK: 15
      expandTopK: 3
      minCoverage: 0.6
      compressMaxChars: 80
```

### 参数说明

| 参数 | 默认 | 范围 | 作用 |
|---|---|---|---|
| `memoryDir` | `~/.dsh/memory-lite` | 任意路径 | 记忆数据根目录 |
| `personaTokens` | 200 | 50–1000 | 性格层注入预算 |
| `memoryTokens` | 500 | 100–3000 | 记忆层每轮注入上限 |
| `coarseTopK` | 15 | 3–100 | 粗召回候选数 |
| `expandTopK` | 3 | 1–10 | 精确展开条数 |
| `minCoverage` | 0.6 | 0.3–1.0 | 压缩保真最低 bigram 覆盖率 |
| `compressMaxChars` | 80 | 20–500 | 压缩目标长度 |

### YAML 写法注意

- **注释不用输**：README 和示例里的 `# 说明文字` 是给人看的，`cordis.patch.yml` 里写不写都不影响运行，推荐不写。
- **缩进必须用空格，不能用 Tab**：
  - `plugins:` 顶格
  - `dsh-memory-lite:` 缩进 2 个空格
  - `enabled:` / `config:` 缩进 4 个空格
  - 参数缩进 6 个空格
- **冒号后面要有一个空格**：`enabled: true`，不能写 `enabled:true`。

### 改完怎么生效

- `memoryDir` 改了必须**重启 DSH**。
- 其余参数理论上下次 hook 会就地更新，但**重启最稳**。

## 预设与少坑指南

### 三套预设怎么选

| 预设 | 适合场景 | 代价 |
|---|---|---|
| **省 token** | 小模型、长会话、token 敏感 | 召回少，可能漏掉相关记忆 |
| **平衡（默认）** | 大多数个人使用 | 无明显短板 |
| **高召回** | 记忆库大、话题多、不怕 token | 每轮注入更长，prefix 更贵 |

预设不是新文件，只是三组数值。选一套，把 `cordis.patch.yml` 里 `config:` 下面换成对应值即可。

### 省 token

```yaml
personaTokens: 150
memoryTokens: 300
coarseTopK: 10
expandTopK: 2
minCoverage: 0.7
compressMaxChars: 60
```

- 性格层 150 token，记忆层 300 token，合计硬上限约 450。
- 只展开 2 条记忆，压缩更激进（覆盖率门槛 0.7，目标 60 字）。
- **坑**：`expandTopK: 2` 时，如果两条都不相关，这轮等于没记忆。适合“记忆少而精”的用法，不适合把闲聊全存进去。

### 平衡（默认）

```yaml
personaTokens: 200
memoryTokens: 500
coarseTopK: 15
expandTopK: 3
minCoverage: 0.6
compressMaxChars: 80
```

- 合计硬上限约 700 token。
- 展开 3 条，压缩目标 80 字。
- **坑**：这是默认值，不要同时把 `coarseTopK` 调很大又保留 `expandTopK: 3`，粗召回再多也只展开 3 条，多出来的候选白算。

### 高召回

```yaml
personaTokens: 300
memoryTokens: 1200
coarseTopK: 40
expandTopK: 5
minCoverage: 0.55
compressMaxChars: 120
```

- 合计硬上限约 1500 token。
- 粗召回 40 条，展开 5 条，压缩更宽松（覆盖率 0.55，目标 120 字）。
- **坑 1**：`memoryTokens: 1200` 是**每轮**上限。如果每轮都命中 5 条长记忆，prompt 会明显变长，prefix cache 也更难稳定。
- **坑 2**：`minCoverage: 0.55` 压缩更激进，可能删掉一些边缘语义。如果发现记忆“意思变了”，先把这个值调回 0.65 以上。
- **坑 3**：`coarseTopK: 40` 在索引超过几千条时，每轮粗扫成本会上升。超过 1 万条会触发告警，届时应该迁移 SQLite FTS5，而不是继续调大 `coarseTopK`。

### 少坑清单（不管用哪套预设都适用）

1. **`memoryDir` 改了必须重启 DSH**。其余参数理论上下次 hook 生效，但重启最稳。
2. **YAML 用空格缩进，不能用 Tab**；冒号后面必须有一个空格。
3. **注释不用输**。README 里的 `# 说明` 是给人看的，`cordis.patch.yml` 里写不写都能跑，推荐不写。
4. **`expandTopK` 不要大于 `coarseTopK`**，否则等于没筛。
5. **`minCoverage` 调低前先想清楚**：低于 0.5 时，压缩可能删掉关键否定词或数字周边的语义。系统有保护片段兜底，但不是万能的。
6. **不要把 `memoryTokens` 当成“越大越好”**。它是每轮硬上限，调大等于每轮都多付 token，和“上下文无上限、计算量不变”的初衷相反。
7. **多进程共用同一个 `memoryDir` 需要外部文件锁**。插件只保证单进程内写入串行化。
8. **`index.jsonl` 超过 1 万条会告警**。这时候正确做法是迁移 SQLite FTS5 或按项目拆分 `memoryDir`，不是继续调 `coarseTopK`。
9. **无命中 = 不注入**。如果发现“明明存过却想不起来”，先确认用户原话里有没有触发词（记住 / 记一下 / 不要忘记 / 以后都），再确认 `index.jsonl` 里有对应摘要。
10. **压缩被拒绝是正常行为**。`compactMeta.method: "none"` + `note: "rejected"` 表示“压了会变味，所以保留原文”，不是 bug。

### 一句话选型

- 只想省 token → **省 token**，但接受“可能漏召回”。
- 不知道选哪个 → **平衡**。
- 记忆很多、经常跨话题找东西 → **高召回**，同时接受 prompt 变长。

## 数据布局

```
~/.dsh/memory-lite/
├── persona.json          # 性格层，独立通道
├── index.jsonl           # 摘要索引，粗检索只扫这个
└── chunks/<id>.json      # 原文块，精确展开时读
```

所有数据都是纯文本，可以 `git diff`、可以 `cat`、可以手动编辑、可以整目录备份。

## 为什么 token 不随库增长

每轮 prompt 中与记忆相关的部分有硬上限：

- `personaTokens`：性格层，有 sessionId 时按 session 冻结。
- `memoryTokens`：记忆层，粗检索只扫摘要索引，精展开只读固定 K 条。

库再大，进入 prompt 的也只有这些。

## 本地演示

```bash
npm run demo
```

不需要启动 DSH，直接验证「写入 → 换话题不命中 → 换回话题命中」的行为。

## Known Limitations

- Hook API 依赖 DSH 当前版本；升级宿主后需回归 `onPreStep` / `onPostStep`。
- 并发写入只在进程内串行化（Promise 链）；多进程共用 `memoryDir` 需外部文件锁。
- `memoryDir` 在首次 hook 时确定，运行中修改会重建存储层并告警。
- memory block 每轮按 query 计算；有命中注入、无命中不注入，因此话题切换时 prefix cache 会变化一次，属预期行为。
- `index.jsonl` 无自动 compaction，超过 1 万条会告警，建议届时迁移 SQLite FTS5。
- bigram 检索对长文档和同义改写召回有限，这是不引入向量库的刻意取舍。
- 压缩仅规则去冗余 + 抽取式删句；生成式摘要未实现，以保证"意思不变"可校验。
- 无多租户权限隔离，多人共用请按 `memoryDir` 分目录。

## 排查顺序

1. 插件没生效 → 检查 `cordis.patch.yml` 是否被 DSH 加载，`enabled: true`。
2. 记忆不注入 → 看 `memoryDir` 下有没有 `index.jsonl`；确认用户说了"记住"。
3. 注入内容不对 → `cat` 对应 `chunks/<id>.json`，看 `content` 和 `compact`。
4. 索引报错 → 日志里会有 `skip N corrupt index line(s)`，坏行会被跳过，不影响其余。
5. 超过 1 万条告警 → 考虑迁移 SQLite FTS5，或按项目拆分 `memoryDir`。
6. 改了配置不生效 → `memoryDir` 变更需重启；其余核心参数会在下次 hook 就地更新。

## License

MIT