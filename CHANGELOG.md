# 更新日志

本文件记录面向使用者的版本变化。工程细节与踩坑记录见 [`docs/WORKLOG.md`](docs/WORKLOG.md)。
版本遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [1.4.4] - 2026-11-23

### 新增

- **克隆前先确认**：点克隆会先显示「将克隆到 `<路径>`」，可 **[确认克隆]** 或 **[修改目录]**（弹系统目录选择器）；
  目录已存在且非空时会警告「会被拒绝」；未登录时提示「只能克隆公开仓库」。
- **支持任意 git 地址**：`owner/repo`、`github.com/owner/repo`、GitHub 的 https/SSH 地址，以及 GitLab、Bitbucket
  等任何 git URL 都可以粘贴克隆；GitHub 地址会归一化出 owner/name，其余按仓库名建目录。
- **未登录也能克隆公开仓库**：不再强制先登录；只有私有仓库失败时才提示「需要登录才能克隆私有仓库」并可一键去登录。
- 新增 `POST /github/clone/preview`（返回 root/folder/path/exists/signedIn），克隆失败新增 `needsSignIn` 标记。

## [1.4.3] - 2026-11-23

### 新增

- **克隆体验**：卡片里常驻显示克隆根目录与目标文件夹预览（`<root>\<owner>-<repo>`），可原地修改根目录；
  克隆改为**后台任务**（`POST /github/clone {background:true}` + `GET /github/clone/status`），面板里显示真实的
  git 百分比与阶段（计数/压缩/接收对象/解析差异）、目标路径；**关闭面板后任务继续**，重新打开能看到进度、
  成功路径（点「打开工作区」才建会话）、失败原因与「重试」。

### 修复

- 并行跑测试时 askpass 临时目录断言会误报（统计了全机器的临时目录），CI 的 ubuntu 任务因此随机失败；
  现在目录名带进程号、断言只统计本进程。

## [1.4.2] - 2026-11-23

### 修复

- **系统代理下浏览器登录失败**：Host 的 GitHub 请求改用 Electron `net.fetch`（Chromium 网络栈，自动读取系统代理），
  CLI 或测试环境自动回退 Node `fetch`。此前直连 `github.com` 超时（`fetch failed`），而 `api.github.com` 可用，
  所以只有 device flow 受影响。

## [1.4.1] - 2026-11-23

### 新增

- **浏览器登录开箱即用**：插件内置项目自己的 OAuth App Client ID（device flow 的 client id 是公开信息，
  不需要 client secret），装好就能点「用浏览器登录」——面板给出 8 位码与链接，授权即登录，不必人人自建 App。
- **自定义 Client ID**：想用自己的 OAuth App 时，可在卡片里填写并保存（`POST /github/config`），保存后即时生效，
  也可一键「重置为内置应用」。
- **token 自动续期**：device flow 返回的 `refresh_token` 与过期时间会存进 grant；调用前发现临近过期会自动换新
  （GitHub 每次刷新都会轮换 refresh token，插件整份替换）。刷新失败时接口返回 `reauth-required`，面板提示重新登录。
  带过期时间的 PAT 也会记录到期时间。

### 修复

- 浏览器登录在缺少 OAuth App 时不再是一个报错死路：面板改为显示说明 + 「改用 PAT」入口，且不会发出任何
  `/device/start` 请求；`/github/status` 增加 `device{ready,custom,shipped}` 供面板判断。

## [1.4.0] - 2026-11-23

### 新增

- **GitHub 登录**：面板顶部新增 GitHub 卡片，支持 **Personal Access Token** 或 **OAuth Device Flow**
  （8 位码 + 浏览器授权）。token 存进 DSH 凭据库（grant 记录），任何路由都不返回它；也可用插件数据目录里
  权限 0600 的兜底文件。
- **以 GitHub 身份提交/推送**：登录后插件创建的提交使用 `<名字> <id+login@users.noreply.github.com>` 作作者与
  提交者（提交面板可一键关掉）；推送用登录 token 经临时 askpass 认证，SSH 远端只在这一次推送里改写成 HTTPS，
  remote 配置不动。
- **从 GitHub 新建工作区**：卡片里搜索仓库或手填 `owner/repo`，克隆到 `~/dsh-workspaces/<owner>-<repo>`
  （根目录可改），随后自动创建工作区并打开新会话；非空目标目录会被拒绝，不会覆盖已有文件。
- **GitHub MCP**：随包附带一行 `@deepseek-ai/dsh-mcp-client`（官方远程 `https://api.githubcopilot.com/mcp/`），
  授权头取 `DSH_GIT_BAR_GITHUB_TOKEN`；登录后写入 Harness 家目录 `.env`，**重启 DSH** 后会话里出现
  `mcp__github__*` 工具，退出登录即清除。
- 新增 8 条 `/github/*` 路由（status / login / logout / device/start / device/poll / repos / clone / config）。

### 测试

- `test/github.test.mjs`（53 项）：测试里用 mock `fetch` 驱动 GitHub API，覆盖 PAT 登录、坏 token、设备流
  的 pending/slow-down/approved、仓库列表与过滤、克隆（本地 bare 仓库）、`target-exists`、配置校验、
  以 GitHub 身份提交、关闭身份开关、带 token 的提交+推送、退出登录后拒绝克隆。
- `test/contract.test.mjs` 增加 GitHub 契约：8 条路由、身份 helper、askpass 传递、SSH 改写、token 不进
  argv、patch 里没有 token 字面量、MCP 行由变量 gate。

## [1.3.2] - 2026-11-22

### 修复

- **Git 图谱的时间列显示成 2001 年**：图谱接口把 `--date=format:%m/%d %H:%M` 生成的 `%ad`（如
  `11/22 10:56`，不含年份）当成了 ISO 时间返回，浏览器 `Date.parse` 会把它解析成 2001-11-22。
  现在改为返回严格 ISO（`%aI`），图谱时间列恢复为本地化相对时间（如「12 分钟前」），
  `test/graph-search.test.mjs` 增加了对应回归断言（ISO 格式 + 年份合理性）。

## [1.3.1] - 2026-11-22

### 修复

- 从图谱搜索结果进入提交详情后返回，搜索词与结果不再被清空。
- 搜索框内按 `Esc` 先清空搜索（保持图谱），输入为空时才按原层序返回列表。

### 变更

- GitHub 仓库已改名为 `dsh-git-bar`，`repository` / `homepage` / `bugs` 与 README 里的安装地址同步更新
  （旧地址由 GitHub 自动重定向，已安装的用户无需改动）。

## [1.3.0] - 2026-11-22

### 新增

- Git 图谱搜索：工具条搜索框按「提交信息 / 作者 / 哈希」过滤（大小写不敏感，范围是最近 1000 条提交），
  结果为扁平列表，点条目直接打开提交详情。
- 图谱「加载更多」：按页追加更早的提交（单页上限提高到 500），不打断滚动位置。
- 触摸设备上改动文件行的操作图标常显（`@media (pointer: coarse)`），不再依赖 hover。

## [1.2.0] - 2026-11-22

### 新增

- 改动文件行上的操作：**暂存 / 取消暂存 / 丢弃改动 / 删除未跟踪文件 / 复制相对路径**，
  危险操作都要经过行内二次确认（不使用浏览器 `confirm`）。
- 冲突文件行可直接「用我方」或「用对方」解决冲突并标记解决。
- 分组标题旁的「全部暂存」按钮。
- 提交面板里新增「撤销上次提交」（`reset --soft`，改动保留在暂存区，需二次确认）。
- Host 新增 6 条文件操作路由：`stage` / `unstage` / `discard` / `clean` / `resolve` / `undo-commit`；
  路径逐条校验并与 `git status` 交叉核对（未跟踪只能删除、冲突只能取一边），误用不会破坏工作区。

## [1.1.2] - 2026-11-21

### 新增

- 离线自测入库（`test/*.test.mjs`，`npm test` 一条命令跑 6 组、约 12 秒）与 GitHub Actions：
  双平台（ubuntu / windows）跑语法检查 + 自测，打 tag 时自动发布 npm；`npm publish` 前也会先跑检查与自测。
- 新增 `docs/WORKLOG.md`（工作记录：时间线、关键决策、事故根因、验证策略、路线图）与本文件。

### 变更

- 收起状态的胶囊改用轻量轮询（`/state?brief=1`）：跳过 `--numstat` 与 `git log`，每轮 git 子进程从 4 个降到 2 个。
- 提交时间做本地化：Host 返回 ISO 时间戳，界面显示「2 小时前」而不是 git 的英文 "2 hours ago"。
- 启动识别的退避重试用尽后转后台慢重试（每 30 秒），工作区晚就绪时胶囊会自己恢复，不必手动点一下。

## [1.1.1] - 2026-11-20

### 修复

- 刚启动 DSH 时胶囊误报「不是 git 仓库」：Host 在会话/工作区尚未就绪时不再退回进程默认目录，而是返回
  `session-pending`；客户端等拿到 sessionId 后按 400/800/1600/3000/5000ms 退避重试，未得出确定结论前
  显示 `…`（悬停「正在识别工作区」）。

### 变更

- 提交面板主按钮「提交并推送」改为「推送」，并按当前状态自动降级：
  有未提交改动 → 提交后推送；无改动但有未推送提交 → 直接推送；两者都没有 → 提示「没有可推送的改动」。
- 干净但有未推送提交时，面板提示「当前无未提交改动，将直接推送 N 个提交」。
- 新增失败原因 `nothing-to-push`。

## [1.1.0] - 2026-11-20

### 新增

- 「自动提交」从列表底部大按钮改为 **Git 图谱工具条里的小图标按钮**，点击弹出操作面板：
  - 提交描述输入，**留空则自动生成** Conventional Commit 信息（文档→`docs`、测试→`test`、其余→`chore`）；
  - 「仅提交」「提交并推送」两个操作，失败时面板内联提示、不关闭；
  - 游离 HEAD 下会先按面板中填写的分支名（默认 `wip/<yyyyMMdd-HHmm>`）创建分支再提交，**原分支指针不动**。
- 推送需要凭据时，面板就地变成**一次性凭据输入**（用户名 + 密码/令牌）：只用于这一次推送，
  经临时 askpass 辅助程序交给 git（不进命令行参数），用完立即删除，不落盘、不保存。
- 新增 `POST /dsh-git-bar/push` 路由（只推送，供凭据重试）。

## [1.0.4] - 2026-11-20

### 变更

- 「自动提交」连带推送到远端：有上游走配置的上游，没有则 `push --set-upstream <origin 或首个远端> <分支>`。
- 推送失败时本地提交保留，并按原因分类提示（无远端 / 远端有新提交 / git 原始报错首行）。
- 网络命令带 `GIT_TERMINAL_PROMPT=0` 等变量，凭据缺失时立即失败而不是卡在交互提示。

## [1.0.3] - 2026-11-20

### 修复

- 修复 README 中文乱码（由 PowerShell 按系统 GBK 编码读取 UTF-8 导致，1.0.2 的 npm 包受影响）。

## [1.0.2] - 2026-11-20

### 新增

- 「最近提交」展开/收起、「进入提交详情」、「进入/退出 Git 图谱」三处补齐平滑过渡（180ms，
  尊重系统 `prefers-reduced-motion`）。
- 列出改动文件的底部新增「自动提交」按钮（用户点击触发，自动生成提交信息提交全部改动）。

## [1.0.1] - 2026-11-18

### 修复

- 仓库被重新初始化或克隆后没有配置上游时，胶囊也能显示 `origin/<分支>` 与 `↑ahead ↓behind`
  （Host 在 `@{upstream}` 为空时回退到同名远程跟踪分支）。

## [1.0.0] - 2026-11-18

### 新增

- 首个发布版本。会话标题栏右上角的 Git 胶囊：
  - 分支名与改动计数，圆点按状态着色（干净 / 有改动 / 有冲突），游离 HEAD 显示 `HEAD@<短哈希>`；
  - 展开面板：上游与 `↑ahead ↓behind`、分组文件列表（已暂存 / 未暂存 / 未跟踪 / 冲突）、最近提交；
  - 点文件在右侧栏「Git 审查」标签里查看差异，面板保持打开；右侧栏「开始」页有「代码审查」卡片；
  - 点分支名切换为 **Git 图谱**：单画布连线、泳道、`HEAD`/分支/远程/标签芯片、纵向滚动与键盘翻页；
  - 点图谱中的分支芯片切换分支；点远程/标签芯片或非顶点行，确认后检出为游离 HEAD；游离状态可一键回到原分支；
  - 点提交名查看提交详情（元信息、增删统计、文件清单），点文件进该提交该文件的审查；
  - 全部交互有平滑动效并遵守 `prefers-reduced-motion`。
