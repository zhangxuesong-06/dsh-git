# Git 胶囊 (dsh-git-bar)

在会话标题栏右上角的工具区放一枚**可展开的胶囊**，实时显示当前工作区的 **git 分支**与**工作区改动**；展开后可
分组查看改动文件、最近提交，点分支名打开 **git 图谱**（可切分支 / 切版本），点文件在**右侧栏**看差异审查。

已安装到当前 `desktop` profile（bundle `dsh-git-bar`），随 DSH 启动自动生效。

---

## 交互

| 操作 | 效果 |
| --- | --- |
| 默认 | 胶囊显示 `分支名 + 改动数`，圆点按状态着色（干净=空闲色，有改动=警告色，有冲突=错误色） |
| 点击胶囊 | 动画展开面板：分支、上游、`↑ahead ↓behind`、改动数、按 `已暂存 / 未暂存 / 未跟踪 / 冲突` 分组的文件列表、`最近提交` |
| 点击面板里的分支名 | 在同一面板里展开 **Git 图谱**（面板变宽到 720px，带动画） |
| 图谱里点分支芯片 | 直接切换到该分支（当前分支只提示不动作） |
| 图谱里点远程芯片 / 标签芯片 | 出现确认条「检出…（游离 HEAD）」，确认后检出该提交 |
| 图谱里点某一行 | 当前 HEAD 那一行只闪「当前」；分支顶点的行直接切该分支；其它行确认后检出为游离 HEAD |
| 游离 HEAD 时 | 工具条上有醒目的 **← 回到分支 <名字>**（名字由 Host 从 reflog 推出），点「游离 HEAD」芯片也能就地打开分支选择器 |
| 点击最近提交里的提交名 | 提交详情：哈希、作者、时间、`+N −M`、文件清单（不再内嵌补丁）；点文件行进该**提交内该文件**的右侧栏审查 |
| 点击某个改动文件 | 把差异交给右侧 Sidebar 的「Git 审查」标签页，**面板保持打开**并提示「已在右侧栏打开审查」，方便连续点下一个 |
| 右侧栏「开始」页 | 有一张 **代码审查** 卡片：没选文件时列出现有改动，点一条即审查 |
| 再次点击胶囊 / 点击面板外 / `Esc` | 逐步返回：先回到列表，再关闭面板（带动画） |
| 自动刷新 | 收起时 20s、展开时 5s；标签页隐藏时暂停；切换会话立即重取 |

除「进入审查」这一刻是瞬时的之外，展开/收起、分支选择器、图谱行入场、提交详情、确认条、行悬停与计数变化都有
平滑过渡（150/140/160/180/120ms）；系统开启「减少动态效果」时全部时长归零。

## Git 图谱（在胶囊里）

点胶囊里的分支名，面板原地切成图谱模式（宽度 `min(720px, 视口-24px)`，右边缘不动，其余模式仍是 460px）。
列：**图 / 描述 / 日期 / 作者 / 提交**；窄于 620px 时自动隐藏作者列。

- **一张画布**：整个列表只画一个绝对定位的 `<svg>`（在行之下、`pointer-events: none`），不是每行一个。
  节点圆点位于 `(lane*14+7, row*34+17)`，`r=3.5`，带一圈表面色描边避免交叉处糊在一起。
- **连线**：每个可见父节点一条三次贝塞尔（控制点取纵向跨度的 45%），父节点在窗口外则向下画短竖线；
  另外按「这条边跨过了哪些行带」补出**在飞的泳道竖线**，所以任何一条线都不会凭空断开——这正是「提交之间连起来」。
- **泳道**由 Host 计算（`assignLanes`：先认领等待中的泳道，否则取最小空泳道，首父继承子泳道），上限 8 列。
- 芯片顺序：`HEAD` → 本地分支 → 远程分支（`origin/main` 等）→ `tag`。本地分支芯片直接切分支（当前分支只提示 当前），
  远程/标签芯片走「游离 HEAD」检出（先确认）。
- **行点击规则**（按顺序判定）：①该行就是工作区所在提交 → 只闪「当前」，不发请求；②该行带有本地分支（分支顶点）→
  直接切到那个分支，不再游离；③其它行 → 确认条 → 检出为游离 HEAD。所以「和 main 最新提交同一提交号」的行会切回
  main，而不是把 HEAD 打散。
- **当前行高亮**：工作区所在的提交行有 3px 品牌色左边框、淡品牌底色和「当前」标记（游离时同样有效）；打开图谱时
  自动滚到这一行，长历史也能一眼定位。
- 工具条：当前分支芯片（游离时 `游离 HEAD <短哈希>`，可点开分支选择器）、`← 回到分支`、刷新、状态条
  （成功 1.6s 淡出；失败常驻可关闭，`switch-failed` 附带 git 原文）。
- **纵向滚动**：面板高度上限 `min(70vh, 560px)`，图谱体是唯一的滚动容器（`min-height:0` + `overflow-y:auto` +
  `overscroll-behavior:contain`），画布与行一起滚动，滚轮不会带动页面；细滚动条用主题描边色。
- **键盘**：图谱体可聚焦（焦点环用主题色），`PageUp / PageDown` 走 6 行、`Home / End` 到顶/底；焦点在按钮上时不抢键。
- 打开图谱时会把当前 HEAD 那一行瞬间滚到可见位置；之后的刷新/切换保留你当前的滚动位置。
- 右侧栏展开会让会话列变窄，面板的右边缘始终贴着胶囊，并在 10 帧 + 180/360ms 的收敛窗口内跟随，之后由
  `ResizeObserver` 继续对齐——所以面板开着也不会盖住右侧栏。


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
| `POST /dsh-git-bar/auto-commit` | 仅在用户点击「自动提交」时调用：`git add -A` 后以生成的 Conventional Commit 信息提交全部改动（类型按路径推断：文档→`docs`、测试→`test`、其余→`chore`）。冲突、游离 HEAD、无改动直接拒绝；返回值含短/完整哈希、主题与文件数；从不推送、不 amend、不重写历史 |
| `GET /dsh-git-bar/health` | 存活探针 |

安全约束：`path` 必须是仓库内相对路径（拒绝绝对路径、盘符与 `..`）；`hash` 只接受十六进制；分支名必须来自
`git for-each-ref` 的实际结果；所有 git 调用都是无 shell 的固定 argv，仓库根由 `git rev-parse --show-toplevel`
解析，浏览器从不直接指定目录。

## 右侧栏标签页（只有审查）

右侧栏只保留**一个**标签类型：**Git 审查**（`dsh-git-bar/review`，`kind: git-review`，地址
`dsh-resource://git-review/current`）。点文件时用 `ctx.sidebarRight.openResource(address, { params })` 打开并展开
右栏；`params` 区分 `{ mode:'worktree', path, staged, untracked }` 与 `{ mode:'commit', path, hash, hashShort }`。
标签内容是同一个 `DiffBody`，只是更宽。该类型还注册了 guide 卡片，所以右侧栏「开始」页有「代码审查」入口；
从卡片打开时没有具体文件，就给出现有改动的分组列表，点一条即可审查。

标签体拿不到 `useTabInfo()`（纯 JS 插件无法 import Harness Client 包），所以目标/状态放在模块内的可订阅 store 里：
先写入再开标签，标签体订阅 store 渲染（若插槽恰好传了 `tab.navigation.params` 则优先用它）。若
`sidebarRightTabs` / `sidebarRight` 不可用或抛错（例如当前布局没有会话面），则**自动回退**为面板内的审查视图。

`replaceTab` 只在当前活动标签是右侧栏 guide、或已经是我们自己的同类标签时传：这样点文件不会额外留下「开始」页，
也不会堆出第二个审查标签，同时绝不会替换文件/浏览器/终端等其它标签。

## 文件结构

仓库根目录就是包本体（npm 包名 `dsh-git-bar`）：

```
dsh-git-bar/            # ← 仓库根 = npm 包
├── package.json        # bundle 补丁 + dsh.client 声明（platform: web, inject: ui-conversation）
├── cordis.patch.yml    # 插入 id: dsh-git-bar 的 Host 行
├── index.js            # Host 半边：会话目录解析 + git 读取/图谱/切换 + 路由
├── client.js           # 浏览器半边：胶囊 / 面板 / 图谱 / 差异审查（纯 JS，仅 require('react')）
├── locale/en.json      # 插件管理页显示名与描述（英文）
├── locale/zh.json      # 插件管理页显示名与描述（中文）
├── icon.svg            # 插件图标（原始绘制）
├── README.md           # 仓库/npm 主页说明
├── LICENSE             # MIT
└── docs/PLUGIN.md      # 本文件
```

## 实现要点

- 挂载点：`conversation.session.header.utilities`（会话标题栏右对齐工具列表），注册项 `{ name, id: 'dsh-git-bar', order: 40 }`；展开面板用 `position: fixed` 从胶囊的 `getBoundingClientRect()` 定位，避开标题栏的裁剪。
- 样式只用宿主题 token（`--dsw-alias-*`），差异着色用 `color-mix(...)`，`<style>` 渲染在组件自身子树内，卸载即消失；类名前缀 `gitbar-`。
- 可见文案走客户端 locale 服务（命名空间 `dshGitBar`，内置中英词典兜底）。
- 所有 fetch / 计时器 / 监听器 / `AbortController` 都在 effect 中成对创建与清理；渲染体整体包在 try/catch 中，失败时保留最小胶囊而不是让宿主插槽变空。
- 路由前缀不带结尾斜杠：宿主的匹配规则是 `pathname === prefix || dirname 以 prefix/ 开头`，`/dsh-git-bar/` 这种写法只会匹配它自己。

## 可调参数

`client.js` 顶部常量：`POLL_COLLAPSED`（收起轮询 20s）、`POLL_EXPANDED`（展开轮询 5s）、`MAX_DIFF_ROWS`（渲染行上限 4000）、
图谱行高 34px / 泳道宽 14px、图谱宽度 720px（窄屏自动收缩并隐藏作者列）。
Host 侧位于 `index.js` 顶部：`MAX_DIFF_CHARS`、`COMMIT_LIMIT`、`GRAPH_LIMIT`（默认 120 条）、`MAX_GRAPH_COLUMNS`（默认 8 列），
以及 git 可执行文件探测顺序 `GIT_CANDIDATES`（可用环境变量 `DSH_GIT_BIN` 指定，应用进程的 PATH 与终端可能不同）。

## 已知限制

- 切换分支/检出提交会真实改动用户的工作区（git 自身的保护仍然生效：会拒绝覆盖本地改动，插件把 git 原文显示出来）；插件不会自动重试。
- 写操作只有「切分支」和「检出为游离 HEAD」，其余（暂存、提交、丢弃改动）都不提供；游离 HEAD 一定先经过确认条。
- 不同分支上的远程提交可以被检出，但不会创建本地跟踪分支（要建分支请用 git 或终端）。
- 同一类标签只有一份：再点别的文件会聚焦同一个审查标签并换成新目标，不会堆出多个标签。
- 图谱一次最多 120 条提交、最多 8 条泳道；更早的历史不画；极多分支的仓库会被折到 8 列内。
- 仅在本机 Web 载体下工作（依赖 `ctx.webServer`）；没有 Web 载体的组合中插件会自动降级为不注册路由。
- 大仓库首次读取会跑多次 git 子进程（状态 + 两路 numstat + log + 图谱），已被超时与输出上限保护。

## 卸载

在「设置 → 插件」中停用 `Git 胶囊`，或在本仓库外执行 `plugin_manager` 的 `remove_bundle`（目标 `dsh-git-bar`）。
