# Git 胶囊 (dsh-git-bar)

在会话标题栏右上角的工具区放一枚**可展开的胶囊**，实时显示当前工作区的 **git 分支**与**工作区改动**；展开后可
分组查看改动文件、最近提交，点分支名打开 **git 图谱**（可切分支 / 切版本），点文件在**右侧栏**看差异审查。

已安装到当前 `desktop` profile（bundle `@local/dsh-git-bar`），随 DSH 启动自动生效。

---

## 交互

| 操作 | 效果 |
| --- | --- |
| 默认 | 胶囊显示 `分支名 + 改动数`，圆点按状态着色（干净=空闲色，有改动=警告色，有冲突=错误色） |
| 点击胶囊 | 动画展开面板：分支、上游、`↑ahead ↓behind`、改动数、按 `已暂存 / 未暂存 / 未跟踪 / 冲突` 分组的文件列表、`最近提交` |
| 点击面板里的分支名 | 打开右侧栏的 **Git 图谱** 标签页（面板带动画收起） |
| 图谱里点分支芯片 | 直接切换到该分支（当前分支只提示不动作） |
| 图谱里点标签/远程芯片或整行 | 出现确认条「切换到 `<hash>`（游离 HEAD）」，确认后检出该版本 |
| 点击最近提交里的提交名 | 提交详情：哈希、作者、时间、`+N −M`、文件清单、完整补丁；点文件行进入该**提交内该文件**的右侧栏审查 |
| 点击某个改动文件 | 立即把差异交给右侧 Sidebar 的「Git 审查」标签页（无入场动画） |
| 右侧栏「开始」页 | 有一张 **代码审查** 卡片：没选文件时列出现有改动，点一条即审查 |
| 再次点击胶囊 / 点击面板外 / `Esc` | 带动画收起面板 |
| 自动刷新 | 收起时 20s、展开时 5s；标签页隐藏时暂停；切换会话立即重取 |

除「进入审查」这一刻是瞬时的之外，展开/收起、分支选择器、图谱行入场、提交详情、确认条、行悬停与计数变化都有
平滑过渡（150/140/160/180/120ms）；系统开启「减少动态效果」时全部时长归零。

## Git 图谱

右侧栏独立标签页（`@local/dsh-git-bar/graph`，地址 `dsh-resource://git-graph/current`），表格列：
**图 / 描述 / 日期 / 作者 / 提交**。

- 图列是每行一个内联 SVG：节点圆点位于 `lane * 14 + 7`，到可见父节点画一条三次贝塞尔
  （`M x1 y1 C x1 y1+16, x2 y2-16, x2 y2`），父节点不在窗口内的画到行底短竖线；每条边按 34px 行带裁剪，
  所以曲线跨行连续而不需要 `overflow`。垂直连线只画在真正有边经过的地方。
- 泳道由 Host 计算（`assignLanes`：先认领等待中的泳道，否则取最小空泳道，首父继承子泳道），上限 8 列。
- 芯片：`HEAD`（品牌色实心）、分支（描边，当前分支高亮）、远程（弱化）、`tag`；点分支芯片切分支，
  点标签/远程芯片或整行则走「游离 HEAD」检出（先确认）。
- 顶部工具条：当前分支芯片（游离时显示 `游离 HEAD <短哈希>`）、刷新、状态条（成功 1.6s 淡出；失败常驻可关闭，
  `switch-failed` 会附带 git 原文）。

## 数据来源

- 浏览器一半（`client.js`）只负责渲染，不读取任何文件。
- Host 一半（`index.js`）把**会话 ID** 映射到目录：`ctx.sessions.get(id)` → `ctx.workingDirectory.get(session)`，因此胶囊跟随**当前会话的工作区**，多工作区并存时各会话各看各的。
- Host 通过 `node:child_process` 以**无 shell 的固定 argv** 调用本机 git（读完结果即丢弃），并开这几条 HTTP 路由：

| 路由 | 说明 |
| --- | --- |
| `GET /dsh-git-bar/state?session=<id>` | 分支、HEAD、上游与 ahead/behind、状态条目（含 `--numstat` 增删行数）、最近 12 条提交（短哈希 + 完整哈希） |
| `GET /dsh-git-bar/diff?session=<id>&path=<相对路径>&staged=0或1` | 单个文件的统一差异；未跟踪文件合成「新文件」差异；超过上限截断 |
| `GET /dsh-git-bar/branches?session=<id>` | 本地分支（按提交时间倒序，标记当前分支），带上游与最后一条提交 |
| `POST /dsh-git-bar/switch` | `{"branch":"<name>"}` 切分支；`{"detach":"<sha/标签/远程名>"}` 检出为游离 HEAD。分支名必须存在、目标必须以十六进制或已知标签/远程名给出，拒绝 `-` 开头；有未解决冲突直接拒绝，git 拒绝时回传原始报错 |
| `GET /dsh-git-bar/commit?session=<id>&hash=<sha>` | 单个提交的元信息、逐文件增删统计与完整补丁（4–64 位十六进制校验，`rev-parse --verify` 确认存在） |
| `GET /dsh-git-bar/commit-diff?session=<id>&hash=<sha>&path=<相对路径>` | 某个提交里单个文件的补丁与增删行数 |
| `GET /dsh-git-bar/graph?session=<id>&limit=10..300` | 仓库提交图（`--all --topo-order`）：父提交、作者、时间、主题、泳道号、装饰（HEAD/分支/远程/标签）与总列数 |
| `GET /dsh-git-bar/health` | 存活探针 |

安全约束：`path` 必须是仓库内相对路径（拒绝绝对路径、盘符与 `..`）；`hash` 只接受十六进制；分支名必须来自
`git for-each-ref` 的实际结果；所有 git 调用都是无 shell 的固定 argv，仓库根由 `git rev-parse --show-toplevel`
解析，浏览器从不直接指定目录。

## 右侧栏标签页

JSON（两个标签类型，同一套注册/回退逻辑）：

- **Git 审查**（`@local/dsh-git-bar/review`，`kind: git-review`，地址 `dsh-resource://git-review/current`）：
  点文件时用 `ctx.sidebarRight.openResource(address, { params })` 打开并展开右栏；`params` 区分
  `{ mode:'worktree', path, staged, untracked }` 与 `{ mode:'commit', path, hash, hashShort }`。标签内容是同一个
  `DiffBody`，只是更宽。该类型还注册了 guide 卡片，所以右侧栏「开始」页有「代码审查」入口；从卡片打开时没有
  具体文件，就给出现有改动的分组列表，点一条即可审查。
- **Git 图谱**（`@local/dsh-git-bar/graph`，`kind: git-graph`，地址 `dsh-resource://git-graph/current`）：
  点胶囊里的分支名打开。

标签体拿不到 `useTabInfo()`（纯 JS 插件无法 import Harness Client 包），所以目标/状态放在模块内的可订阅 store 里：
先写入再开标签，标签体订阅 store 渲染（若插槽恰好传了 `tab.navigation.params` 则优先用它）。若
`sidebarRightTabs` / `sidebarRight` 不可用或抛错（例如当前布局没有会话面），则**自动回退**：审查退回面板内视图，
图谱退回面板内的分支选择器。

`replaceTab` 只在当前活动标签是右侧栏 guide、或已经是我们自己的同类标签时传：这样点文件不会额外留下「开始」页，
也不会堆出第二个同类型标签，同时绝不会替换文件/浏览器/终端等其它标签。

## 文件结构

```
dsh-git-bar/
├── package.json        # bundle 补丁 + dsh.client 声明（platform: web, inject: ui-conversation）
├── cordis.patch.yml    # 插入 id: dsh-git-bar 的 Host 行
├── index.js            # Host 半边：会话目录解析 + git 读取/图谱/切换 + 路由
├── client.js           # 浏览器半边：胶囊 / 面板 / 图谱 / 差异审查（纯 JS，仅 require('react')）
├── locale/en.json      # 插件管理页显示名与描述（英文）
├── locale/zh.json      # 插件管理页显示名与描述（中文）
└── icon.svg            # 插件图标（原始绘制）
```

## 实现要点

- 挂载点：`conversation.session.header.utilities`（会话标题栏右对齐工具列表），注册项 `{ name, id: 'dsh-git-bar', order: 40 }`；展开面板用 `position: fixed` 从胶囊的 `getBoundingClientRect()` 定位，避开标题栏的裁剪。
- 样式只用宿主题 token（`--dsw-alias-*`），差异着色用 `color-mix(...)`，`<style>` 渲染在组件自身子树内，卸载即消失；类名前缀 `gitbar-`。
- 可见文案走客户端 locale 服务（命名空间 `dshGitBar`，内置中英词典兜底）。
- 所有 fetch / 计时器 / 监听器 / `AbortController` 都在 effect 中成对创建与清理；渲染体整体包在 try/catch 中，失败时保留最小胶囊而不是让宿主插槽变空。
- 路由前缀不带结尾斜杠：宿主的匹配规则是 `pathname === prefix || dirname 以 prefix/ 开头`，`/dsh-git-bar/` 这种写法只会匹配它自己。

## 可调参数

`client.js` 顶部常量：`POLL_COLLAPSED`（收起轮询 20s）、`POLL_EXPANDED`（展开轮询 5s）、`MAX_DIFF_ROWS`（渲染行上限 4000）。
Host 侧位于 `index.js` 顶部：`MAX_DIFF_CHARS`、`COMMIT_LIMIT`，以及 git 可执行文件探测顺序 `GIT_CANDIDATES`（可用环境变量 `DSH_GIT_BAR_GIT` 指定，应用进程的 PATH 与终端可能不同）。

## 已知限制

- 切换分支/检出提交会真实改动用户的工作区（git 自身的保护仍然生效：会拒绝覆盖本地改动，插件把 git 原文显示出来）；插件不会自动重试。
- 写操作只有「切分支」和「检出为游离 HEAD」，其余（暂存、提交、丢弃改动）都不提供；游离 HEAD 一定先经过确认条。
- 同一类标签只有一份：再点别的文件/再开图谱会聚焦同一个标签并换成新目标，不会堆出多个标签。
- 图谱一次最多 120 条提交、最多 8 条泳道；更早的历史不画。
- 仅在本机 Web 载体下工作（依赖 `ctx.webServer`）；没有 Web 载体的组合中插件会自动降级为不注册路由。
- 大仓库首次读取会跑多次 git 子进程（状态 + 两路 numstat + log + 图谱），已被超时与输出上限保护。

## 卸载

在「设置 → 插件」中停用 `Git 胶囊`，或在本仓库外执行 `plugin_manager` 的 `remove_bundle`（目标 `@local/dsh-git-bar`）。
