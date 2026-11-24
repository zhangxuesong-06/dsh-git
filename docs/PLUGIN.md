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
| `GET /dsh-git-bar/state?session=<id>` | 分支、HEAD、上游与 ahead/behind、状态条目（含 `--numstat` 增删行数）、最近 12 条提交（短哈希 + 完整哈希）。会话或它的工作区尚未就绪时返回 `{ok:false, reason:'session-pending'}`，而不是退回进程默认目录误报 `not-a-repository` |
| `GET /dsh-git-bar/diff?session=<id>&path=<相对路径>&staged=0或1` | 单个文件的统一差异；未跟踪文件合成「新文件」差异；超过上限截断 |
| `GET /dsh-git-bar/branches?session=<id>` | 本地分支（按提交时间倒序，标记当前分支），带上游与最后一条提交 |
| `POST /dsh-git-bar/switch` | `{"branch":"<name>"}` 切分支；`{"detach":"<sha/标签/远程名>"}` 检出为游离 HEAD。分支名必须存在、目标必须以十六进制或已知标签/远程名给出，拒绝 `-` 开头；有未解决冲突直接拒绝，git 拒绝时回传原始报错 |
| `GET /dsh-git-bar/commit?session=<id>&hash=<sha>` | 单个提交的元信息、逐文件增删统计与完整补丁（4–64 位十六进制校验，`rev-parse --verify` 确认存在） |
| `GET /dsh-git-bar/commit-diff?session=<id>&hash=<sha>&path=<相对路径>` | 某个提交里单个文件的补丁与增删行数 |
| `GET /dsh-git-bar/graph?session=<id>&limit=10..500&skip=&q=` | 仓库提交图（`--all --topo-order`）：父提交、作者、时间、主题、泳道号、装饰（HEAD/分支/远程/标签）与总列数。`skip` 分页（「加载更多」按已加载条数继续取，追加渲染）；`q` 进入搜索模式：在最近 1000 条里按「提交信息 / 作者 / 完整或短哈希」做大小写不敏感子串匹配，返回 `filtered:true`、`total`（匹配总数）、`hasMore`，`columns` 固定 1（前端渲染扁平结果列表）；`limit` 上限 500，搜索窗口不会随分页放大 |
| `POST /dsh-git-bar/auto-commit` | 仅在用户点击图谱工具条的「自动提交」小按钮并确认面板时调用：body `{message?, push?, branch?, username?, password?}`。**有改动**：`git add -A` 后提交（`message` 为空则按路径推断生成 Conventional Commit 信息：文档→`docs`、测试→`test`、其余→`chore`），`push:true` 时随后推送到远端（有上游走上游，没有则 `push --set-upstream <origin 或首个远端> <分支>`）。**无改动且 `push:true`**：若存在未推送提交则不提交、直接推送（返回 `committed:false` 与 `ahead`），否则 `reason:'nothing-to-push'`；`push:false` 时为 `nothing-to-commit`。游离 HEAD 提交必须给 `branch`（先经 `git check-ref-format --branch` 校验、再确认不存在），Host 会 `switch -c` 后提交，原分支指针不动。返回 `committed`/`short`/`hash`/`subject`/`message`/`files`/`branch`/`createdBranch`/`ahead`/`pushed`/`skipped`/`pushReason`（`no-remote`/`out-of-date`/`push-failed`）/`pushDetail`/`upstream`/`needsCredentials`；冲突、非法或已存在的分支名直接拒绝。推送失败时本地提交保留；从不 force push、不 amend、不重写历史 |
| `POST /dsh-git-bar/push` | 只推送、不提交（面板拿到 `needsCredentials` 后用一次性凭据重试）：body `{username?, password?}`。密码经临时 askpass 辅助程序传给 git（不进 argv），推送结束即删除临时目录，不保存凭据。返回 `{ok, pushed, reason, pushReason, pushDetail, upstream, needsCredentials}` |
| `POST /dsh-git-bar/stage` | 文件操作（用户点击）：`{paths:[…]}` 暂存指定路径 / `{all:true}` 暂存全部（`git add -A`）。路径必须通过仓库内相对路径校验且不以 `-` 开头，出错返回 `missing-paths` 或 `git-error` |
| `POST /dsh-git-bar/unstage` | 取消暂存：`{paths}`（`git restore --staged -- …`）或 `{all:true}`（`git reset -q HEAD -- .`） |
| `POST /dsh-git-bar/discard` | 丢弃已跟踪文件改动：`git restore --source=HEAD --staged --worktree -- …`，索引与工作区一起还原；未跟踪路径返回 `untracked-needs-clean`，冲突路径返回 `conflicted-needs-resolve` |
| `POST /dsh-git-bar/clean` | 删除未跟踪文件：`git clean -f -- …`（只删文件）；已跟踪路径返回 `tracked-needs-discard` |
| `POST /dsh-git-bar/resolve` | 冲突取一边：`{paths, side:'ours'|'theirs'}` → `git checkout --ours/--theirs -- …` 后 `git add`；非冲突路径返回 `not-conflicted`，缺 side 返回 `missing-side` |
| `POST /dsh-git-bar/undo-commit` | 撤销上一次提交：`git reset --soft HEAD~1`（改动留在暂存区），返回 `{ok, undone:'<标题>', short}`；无父提交返回 `no-previous-commit` |
| `GET /dsh-git-bar/github/status` | 登录状态与配置：`signedIn`、`account{login,name,id,avatarUrl,htmlUrl,email}`、`tokenKind`（`pat`/`device`）、`scopes`、`mcp{configured,envName}`、`config{cloneRoot,deviceClientId,useGithubIdentity}`。**不返回 token** |
| `POST /dsh-git-bar/github/login` | body `{token}`：`GET /user` 校验 → 以 `{kind:'grant', payload:{token,tokenKind,account,scopes,connectedAt}}` 写入 `ctx.credentials`（key `dsh-git-bar/github-token`），同时把 token 写进 Harness 家目录 `.env` 供 MCP 行使用；坏 token `bad-credentials` |
| `POST /dsh-git-bar/github/logout` | 删除 grant + 清 `.env` 里的 `DSH_GIT_BAR_GITHUB_TOKEN` |
| `POST /dsh-git-bar/github/device/start` | 需先配置 `deviceClientId`（没有则 `missing-client-id`）。Host 调 `github.com/login/device/code`，把 `device_code` 留在内存（`Map`，id 为随机 12 字节），返回 `{id,userCode,verificationUri,interval,expiresAt}` |
| `POST /dsh-git-bar/github/device/poll` | body `{id}`；按 GitHub 的 `interval` 做本地闸门（未到时间直接 `pending` + `retryAfter`），映射 `authorization_pending`/`slow_down`（间隔 +5s）/`expired_token`/`access_denied`；成功则同 login 落库并返回 `{state:'done',account}` |
| `GET /dsh-git-bar/github/repos?q=&limit=` | `/user/repos?sort=updated&affiliation=owner,collaborator,organization_member`，最多 100 条，Host 侧按名称/描述过滤 |
| `POST /dsh-git-bar/github/clone` | body `{repo,branch?,root?}`；`owner/repo` / `github.com/...` / 任意 URL（`file:` 也可，测试用）。目录名 `<owner>-<repo>`，目标非空即 `target-exists`；token 走 askpass 的 HTTPS 克隆；错误还包括 `not-signed-in`、`bad-repo`、`not-found`、`auth-failed`、`clone-failed` |
| `POST /dsh-git-bar/github/config` | 改 `cloneRoot`/`deviceClientId`/`useGithubIdentity`（写到插件数据目录 `github.json`）；client id 非法返回 `invalid-config` |
| `GET /dsh-git-bar/github/network` | 连通状态：`proxy{mode:'direct'\|'proxy'\|'unknown',url}`（Electron `resolveProxy` → Windows 注册表 → `https_proxy`/`DSH_GIT_BAR_HTTP_PROXY`，`none` 强制直连）、`github{reachable,status,latencyMs}`（15s 缓存）、`git{usesProxyForPush}`、`push{transport:'https'\|'ssh'\|'none',remote,url}`。推送与克隆只在**单条 git 命令**上加 `-c http.proxy=… -c https.proxy=…`，不改全局配置 |
| `GET /dsh-git-bar/health` | 存活探针 |

文件操作统一约束：只有 `POST`；`paths` 逐条过 `relativePath` 校验（拒绝绝对路径、盘符、`..`、`-` 开头），
并与当前 `git status` 交叉核对（未跟踪的只能 `clean`、冲突的只能 `resolve`），所以误用不会毁掉工作区。

安全约束：`path` 必须是仓库内相对路径（拒绝绝对路径、盘符与 `..`）；`hash` 只接受十六进制；分支名必须来自
`git for-each-ref` 的实际结果；所有 git 调用都是无 shell 的固定 argv，仓库根由 `git rev-parse --show-toplevel`
解析，浏览器从不直接指定目录。

GitHub 相关约束：token 只存在于 Host（凭据库 grant 记录 / 0600 兜底文件 / Harness `.env`），路由永不返回它；
推送/克隆的 token 经临时 askpass 助手交给 git（不进 argv、不改 remote 配置，SSH 远端只在单条命令里用
`url.https://github.com/.insteadOf` 改写）；提交身份用 noreply 地址且可在面板关闭；MCP 行由
`DSH_GIT_BAR_GITHUB_TOKEN` 是否存在决定启用，patch 文件里没有任何 token 字面量。

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
dsh-git-bar/                # ← 仓库根 = npm 包
├── package.json            # bundle 补丁 + dsh.client 声明（platform: web, inject: ui-conversation）+ scripts
├── cordis.patch.yml        # 插入 id: dsh-git-bar 的 Host 行
├── index.js                # Host 半边：会话目录解析 + git 读取/图谱/切换/提交推送 + 路由
├── client.js               # 浏览器半边：胶囊 / 面板 / 图谱 / 提交面板 / 差异审查（纯 JS，仅 require('react')）
├── locale/en.json          # 插件管理页显示名与描述（英文）
├── locale/zh.json          # 插件管理页显示名与描述（中文）
├── icon.svg                # 插件图标（原始绘制）
├── test/*.test.mjs         # 离线自测（node --test，含 bare 远端/冲突/游离 HEAD/凭据等真实 git 场景）
├── .github/workflows/ci.yml# CI：两平台跑 check + test；打 tag 时发布 npm
├── README.md               # 仓库/npm 主页说明
├── CHANGELOG.md            # 面向使用者的版本变化
├── LICENSE                 # MIT
└── docs/
    ├── PLUGIN.md           # 本文件（插件开发视角）
    ├── WORKLOG.md          # 工作记录：时间线、关键决策、事故根因、验证策略
    └── screenshots/        # 截图（待补）
```

开发命令：`npm run check`（两边 `node --check`）、`npm test`（`node --test`，约 12 秒）、
`npm publish` 会先跑 `prepublishOnly` 里的 check + test。

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
