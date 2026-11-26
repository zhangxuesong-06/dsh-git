# 更新日志

本文件记录面向使用者的版本变化。工程细节与踩坑记录见 [`docs/WORKLOG.md`](docs/WORKLOG.md)。
版本遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [1.4.29] - 2026-11-26

### 界面

- **GitHub 账号页改两栏，补上仓库信息**：左栏是账户资料（64px 头像、bio、公司/所在地/博客、加入时间、登录方式、
  权限 chips、MCP、连接状态、刷新/重新授权/退出）；右栏「我的仓库」把账号持有的仓库列出来——
  统计行（共 N 个 · 公开 X · 私有 Y）、本地搜索、每行显示公开/私有、描述、更新时间，并提供「克隆」（打开克隆面板
  **自动预填该仓库并预览**）与「打开」（浏览器打开仓库）两个动作。
- **会话右上角新增 GitHub 头像**：24px 圆形头像 + 状态点（灰=未登录 / 绿=已连接 / 黄=缺 workflow），
  点击弹出账号摘要（未登录时直接给登录入口），可「打开完整面板」跳到左侧账号页，也能刷新状态或退出登录。
- 新增 Host 路由 `GET /github/profile`（bio、公司、所在地、粉丝/关注、公开/私有仓库数、加入时间等）。

## [1.4.28] - 2026-11-26

### 界面

- **GitHub 登录信息搬进左侧插件栏**：新增侧边栏图标（`sidebar.panellist`，id `dsh-git-bar-github`）与对应的独立页面
  （`main` 面板），点图标即可打开「GitHub 账号」控制面板：未登录时的浏览器登录 / PAT / 高级设置，等待授权时的三步提示，
  已登录时的账户信息、权限 chips、MCP 状态、连接状态与刷新 / 重新授权 / 退出登录全在这里。
  图标右下角有状态点：灰=未登录、绿=已连接、黄=已连接但缺 `workflow`。
- **胶囊面板做减法**：GitHub 区块（头像、账号详情、登录、连接行）从 git 胶囊里整体移除，胶囊只保留分支/变更/提交/图谱/审查，
  不再挤占空间；提交时用到的登录身份改为静默读取，不占版面。

## [1.4.27] - 2026-11-26

### 修复

- **重新授权后短暂显示「无 workflow」**：设备流完成时 Host 只回 `{ok, account}`，客户端拿局部字段拼状态，`scopes` 一时是旧的；
  现在 Host 的 `device/poll` 完成响应直接带上**完整 status 与授权 scope**（取自 token 响应的 `scope` 字段，比 `/user` 的
  响应头更准），客户端直接采用；旧 Host 则回退为重新拉 `/github/status`，不再拼装。

### 界面

- **已登录时面板只显示头像**：胶囊面板里的 GitHub 区块收缩为 24px 圆形头像（右下角状态点；缺 `workflow` 时为黄点），
  点击头像打开**第二级面板**（原生 `<dialog>`，标题「GitHub 账号」）查看完整账号信息与操作（刷新 / 重新授权 / 退出登录，
  退出仍是行内二次确认）；Esc、点外部、× 均可关闭，关闭后回到头像。

## [1.4.26] - 2026-11-26

### 界面

- **GitHub 卡片按登录状态重做**：
  - **未登录**：一眼可见的整宽「用浏览器登录」主按钮 + 权限说明；PAT 与自定义 Client ID 降为折叠入口；
  - **等待授权**：三步卡片（已打开浏览器 / 验证码大字 + 复制 / 等待确认），带脉冲提示与**剩余有效期倒计时**；
  - **已登录**：头像 + 登录名 + 「已连接」徽标，两列信息（登录方式、已登录相对时间、权限 chips、MCP 状态），
    缺 `workflow` 权限时红色 chip + 警告条 + 「重新授权」；
  - **加载中**：骨架文案「正在读取登录状态…」，不再先闪一下「未登录」；
  - 「退出登录」改为**行内二次确认**（3 秒无操作自动还原），避免误点。

## [1.4.25] - 2026-11-26

### 重要修复（会阻止 DSH 启动）

- **不再把 GitHub token 写进 `~/.dsh/.env`**。Harness 0.2.1-rc.5 只允许 `DSH_GIT_BAR_GITHUB_TOKEN`
  从**启动进程的环境变量**接收，`.env` 里出现该字段会直接中止启动；1.4.24 及更早版本在登录/刷新 token 时会写这行，
  导致 DSH 起不来（日志里是启动中止，且卸掉插件也无法恢复，因为 `.env` 已被写脏）。
  现在插件只做**清理**：加载时、登录后、退出时移除任何遗留的 `DSH_GIT_BAR_GITHUB_TOKEN=` 行，其余键
  （如 `MAGPIE_GATEWAY_KEY`）原样保留；token 只存在凭据库/0600 文件里。
- **git 子进程环境消毒**：父进程若只导出 `GIT_CONFIG_COUNT` 而缺少配套的 `GIT_CONFIG_KEY_n`
  （本机桌面进程就是这样），任何 git 命令都会报 `missing config key GIT_CONFIG_KEY_0`。
  插件的所有 git 调用（普通命令、push、clone）现在都会剔除 `GIT_CONFIG_COUNT` / `GIT_CONFIG_KEY_n` /
  `GIT_CONFIG_VALUE_n` 再执行，不再受父进程影响；测试侧同样处理。
- 契约测试新增两条护栏：插件不得出现写 `.env` 的代码、git 调用必须经过 `sanitizeGitEnv`。

### 说明

- GitHub MCP 若需要启用：把 `DSH_GIT_BAR_GITHUB_TOKEN` 设成**用户环境变量**（或启动 DSH 的终端里的环境变量），
  重启 DSH 即可；**不要再写进 `.env`**。

## [1.4.24] - 2026-11-25

### 修复

- 浏览器登录的自带验证码链接：GitHub 的 device code 响应不一定返回 `verification_uri_complete`（本项目的 OAuth App
  就不返回），现在 Host 会用 `verification_uri?user_code=…` 自己拼出预填链接，浏览器打开即带验证码。

### 工程

- **CI 自动发布**：仓库已配置 `NPM_TOKEN` secret；`v*` tag 推送后由 `publish to npm` 作业带 provenance 发布
  （实测 v1.4.23 由 CI 发布成功，sigstore 透明日志可查）。README 的发布流程已同步更新。

## [1.4.23] - 2026-11-25

### 新增

- **浏览器登录自动化**：点「用浏览器登录」后立刻**自动打开浏览器**（用 GitHub 的 `verification_uri_complete`
  深链，验证码已预填）并把**验证码复制到剪贴板**；面板里同时大字显示验证码、提供「复制」与「重新打开浏览器」按钮。
  打开走 Host 的 `POST /github/device/open`（Electron `shell.openExternal`，只放行 `https://github.com/login/device*`），
  失败时退回 `window.open`，再失败保留可点链接；任何一步失败都不会中断轮询。

## [1.4.22] - 2026-11-25

### 修复

- **浏览器登录改走自建代理隧道**：经系统代理访问 `github.com/login/*` 时，Electron 的网络栈每隔几次就会丢连接
  （`fetch failed`），这是授权后登录失败的真正原因。Host 现在用 `node:http` 的 CONNECT + `node:tls` 自建一条
  一次性 HTTPS 隧道（仍优先，失败再回落到 Electron fetch），实测 6/6 轮询全部成功、单次 0.8–1.5 秒。
- 设备流轮询改为「失败立刻重试一次」，不再叠加退避等待，登录更快。

## [1.4.21] - 2026-11-25

### 修复

- 设备流轮询对瞬时网络失败的内部重试从 1 次提高到 **3 次**（500ms / 1500ms 退避）。经代理访问
  `github.com/login/oauth/access_token` 偶发首次连接被丢弃，实测约每 4~6 次轮询会有 1 次失败，
  现在基本在 Host 内部就恢复了，面板不会闪「网络不稳定」。

## [1.4.20] - 2026-11-25

### 修复

- **浏览器登录授权后误报「未配置 Client ID」**：设备流轮询偶发一次网络抖动（`fetch failed`）时，客户端把任何失败
  都当成 `missing-client-id` 并中止登录。现在 Host 会内部重试一次，客户端也按原因分流：网络问题显示
  「网络暂时不稳定，正在重试…」并每 3 秒重试（连续 5 次才停止）；`expired`/`unknown-flow` 提示「登录码已失效，
  请重新登录」；只有真正缺配置时才显示「未配置 Client ID」。

## [1.4.19] - 2026-11-25

### 变更

- **浏览器登录额外申请 `workflow` 作用域**：之前用 OAuth App 登录推不了修改 `.github/workflows/*` 的提交
  （GitHub 报 `refusing to allow an OAuth App to create or update workflow … without workflow scope`）。
  现在设备流登录会申请 `repo read:user workflow`，可以正常推送 workflow 文件。
  **已有的登录需要「退出 → 重新用浏览器登录」一次才会拿到新作用域**（PAT 请自备含 `workflow` 的 token）。

## [1.4.18] - 2026-11-25

### 修复

- **推送被 GitHub 拒绝时不再误报「远端有新提交」**：OAuth App 的 token 缺少 `workflow` 作用域时，推送任何修改
  `.github/workflows/*` 的提交会被 `remote rejected` 拒绝，旧逻辑把含 "rejected" 的错误一律当成 `out-of-date`。
  现在单独识别为 `workflow-scope`，面板明确提示「当前 GitHub 授权缺少 workflow 权限，请改用 SSH 推送或重新授权」，
  并且不再提供误导性的「重试推送」按钮。

## [1.4.17] - 2026-11-25

### 修复

- **推送/克隆不再一律强加代理**：检测到系统代理时改为**先直连、失败再走代理**。TUN 模式（本机就是）下 git 直连
  GitHub 更快更稳，而强制走 HTTP 代理会出现 `schannel: failed to receive handshake, SSL/TLS connection failed`；
  只有网络类错误（`unable to access`、TLS/handshake、connection refused、超时等）才重试另一条通道，
  认证失败与非快进冲突不会盲目重试。

## [1.4.16] - 2026-11-24

### 新增

- **克隆目标文件夹默认取仓库名**（不再带所有者前缀），并在确认区**可编辑**：改名字 300ms 后重新预览，
  清空则交给 Host 自动避让重名；目标已存在且非空时行内红字提示并禁用「确认克隆」；改父目录后保留已输入的名字。
- 重名不再直接失败：Host 会自动挑选 `<name>`、`<name>-2`、`<name>-3`…
- **新会话界面显示 git 胶囊**：在工作区是 git 仓库时，新会话的那一行也会出现胶囊（`conversation.hero.options`
  追加注册，list 插槽，与 header 里同一个组件）。

## [1.4.15] - 2026-11-24

### 修复

- 面板被**输入框（composer）**盖住：dialog/卡片/兜底遮罩统一提到最高层级（`z-index: 2147483647`），并在
  `show()` 之后校验 `dialog.open`，静默失败或抛错时在下一帧重试、仍失败则切回遮罩渲染，避免「看不见/被压住」。
- 诊断扩到两档（150ms / 600ms），新增 `dialog{open,modal,rects}`、`card{rect,scrollHeight,clientHeight}`、
  卡片上中下三点的 `elementsFromPoint` 命中栈与页面上所有 dialog 的开合与矩形。

## [1.4.14] - 2026-11-24

### 修复

- **面板在新会话页变成「浏览器默认 dialog 外观」**：诊断日志显示 dialog 的 `position` 是 `absolute`（应为 `fixed`），
  说明 `.gitbar-*` 样式根本没生效——所有样式原本只随**胶囊**子树挂载，而新会话 hero 页没有胶囊。
  现在样式随宿主走：入口组件始终渲染一份 `<style>`，`<dialog>` 自身也带一份；并把 dialog/卡片的关键样式
  内联兜底（定位、宽度、背景、边框、圆角、阴影），不再依赖 class 命中。

## [1.4.13] - 2026-11-24

### 修复

- 克隆面板**只保留一条渲染路径**：`dialog` 与旧遮罩互斥（`show()` 失败时先关掉并卸载 dialog，再切回遮罩），
  避免透明 dialog 残留在面板之上吞点击/遮住内容；dialog 容器 `pointer-events:none`、卡片 `pointer-events:auto`
  作为兜底。
- 新增客户端诊断通道 `POST/GET /dsh-git-bar/github/client-log`：面板打开 150ms 后上报实测数据（模式、视口、
  面板矩形、14 层祖先的 transform/filter/contain/z-index、中心点的命中元素），渲染问题可以从磁盘日志精确定位。

## [1.4.12] - 2026-11-24

### 修复

- **面板不再阻塞页面**：`<dialog>` 从 `showModal()` 改为**非模态** `show()`——仍在 top layer（不受祖先 transform 影响），
  但页面不再 inert，面板开着也能直接点其他会话；切换会话时面板自动关闭。Esc（document 级，不依赖焦点）与
  点击面板外部都会关闭，且不会吞掉这次点击。
- **面板内容布局恢复**：dialog 宽度改为 `min(520px, calc(100vw - 32px))`——此前 `width:auto` 与卡片 `width:100%`
  形成循环百分比，导致卡片塌缩、内容看起来「和以前不一样」。

## [1.4.11] - 2026-11-24

### 修复

- 「连接」探测更稳：改为 GET `api.github.com/rate_limit`（带 User-Agent、8s 超时），失败再退回 `github.com`；
  任何 <500 的响应都算连通（401/403 只说明未认证），返回里带上探测通道（api/html）。

## [1.4.10] - 2026-11-24

### 修复

- **克隆面板终于在哪儿都弹对了**：之前用 `position: fixed` 的遮罩渲染在 hero 行/胶囊子树里，祖先带 `transform` 时
  fixed 会退化成相对该祖先定位，表现为「按钮原地展开一块没渲染好的面板」，切一次会话换了宿主才正常。现在改用
  **原生 `<dialog>` + `showModal()`**（浏览器 top layer，天然不受祖先 transform/裁剪影响），遮罩用
  `::backdrop` + `--dsw-alias-bg-mask-1`；Esc 与关闭按钮都同步真实 dialog 与面板状态。
- 切换到其他会话时面板**自动关闭**（不再残留）；`showModal` 不可用的老环境自动退回旧的 fixed 遮罩渲染。
- 删除 v1.4.8/v1.4.9 的胶囊宿主与 `shell.overlay` 渲染路径，面板只由一个宿主渲染，避免双渲染与状态分叉。

## [1.4.9] - 2026-11-24

### 新增

- **推送/克隆自动走系统代理**：git 不读桌面的网络栈，系统代理下 https 远端会超时（而 GitHub API 走 Electron
  fetch 却正常）。Host 现在自动检测代理（Electron `resolveProxy` → Windows 注册表 → 环境变量），并只在**这一条**
  git 命令上用 `-c http.proxy=… -c https.proxy=…`，不改任何 git 全局配置。
- **连接状态可见**：新增 `GET /github/network`，返回代理模式/地址、GitHub 可达性与延迟、当前仓库的推送方式
  （https/ssh）。面板里三处展示并可「重测」：GitHub 卡片「连接」行、克隆面板顶部紧凑行、提交面板**推送失败时**
  的错误条下方（区分网络问题还是权限问题）。

### 修复

- 新会话页点「从 GitHub 克隆」弹不出/渲染异常：胶囊在 hero 页走兜底渲染分支时不再丢失面板宿主，
  现在正常分支由胶囊宿主渲染、兜底分支由入口本地渲染，两种情况都能立即出面板。

## [1.4.8] - 2026-11-23

### 修复

- **点「从 GitHub 克隆」后必须切一次会话才出现面板**：面板此前挂在 `shell.overlay`，而新会话页的 AppFrame
  在没有会话挂载时不会渲染该层。现在面板改由**会话头部胶囊宿主**渲染（`clonePanelHost` + `ClonePanelHost`），
  胶囊在所有会话页常驻且订阅 store，点击即出现；hero 按钮只负责触发，胶囊未挂载的极端场景才退回入口本地渲染。
- **配色对齐**：遮罩改用主题 token `--dsw-alias-bg-mask-1`（不再用文字色混灰，亮色主题下发乌），卡片尺寸/阴影/
  圆角/字号与胶囊面板一致（`bg-overlay` + `border-l2` + 12px 圆角 + `min(520px,100%)`）。

## [1.4.7] - 2026-11-23

### 修复

- **回滚 v1.4.6 的「添加工作区」接管**：`conversation.hero.workspace.directoryFlow` 与
  `sidebar.workspaces.directoryFlow` 是系统目录选择器占用的 **single 插槽**，我们注册进去会让
  `@deepseek-ai/dsh-client-ui-directory-picker-native` 启动失败；Web 启动要求每个前端 entry 都激活，
  于是一个 entry 失败就导致**整个界面、所有插件面板消失**。现已完全移除这两个注册。
- 克隆入口回到 `conversation.hero.options`（新会话界面工作区选择器同一行右侧的「从 GitHub 克隆」按钮）；
  克隆面板仍注册在 `shell.overlay`，点击**立即**出现（保留 v1.4.6 的渲染修复）。
- 契约测试新增静态护栏：client.js 不得出现 `conversation.hero.workspace` / `sidebar.workspaces` /
  `main.conversation` 等 single 插槽名，防止再次踩坑。

## [1.4.6] - 2026-11-23

### 变更

- **入口进入「添加工作区」流程**：工作区按钮 →「添加工作区…」现在会打开一个小面板，两行选项——
  「选择本地文件夹…」（保持原有系统目录选择器）与「从 GitHub 克隆…」。选择克隆时，克隆完成后由框架
  自动在该目录**建立工作区**，无需再点一次。
- 克隆面板改为注册在 `shell.overlay`，**点击立即出现**（此前要先点一下别的对话才渲染）。
- 克隆面板在「添加工作区」流程里显示「克隆并建立工作区」，并支持「返回」回到两行菜单；独立打开时仍是
  「创建并打开工作区」。
- 两个 directory-flow 插槽都注册失败时，退回胶囊 GitHub 卡片里的「从 GitHub 克隆」兜底入口。

## [1.4.5] - 2026-11-23

### 变更

- **「从 GitHub 克隆工作区」从胶囊搬到新会话界面**：胶囊里的 GitHub 卡片现在只负责登录与账户（头像、退出、PAT/浏览器登录、
  自定义 Client ID），不再常驻克隆区。
- 新会话界面的工作区选择行新增 **「从 GitHub 克隆」** 入口，点击打开一个**独立面板**：搜索自己的仓库或粘贴任意
  git 地址 → 预览并确认目标目录（可弹系统目录选择器修改）→ 后台克隆并显示真实进度 → 完成后「创建并打开工作区」。
- 克隆轮询搬到插件模块层：**关闭面板后任务继续**，重新打开能看到进度与结果。

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
