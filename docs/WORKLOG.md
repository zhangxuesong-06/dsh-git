# 工作记录（WORKLOG）

本文件记录 `dsh-git-bar` 从零到发布的完整过程：每轮做了什么、为什么这么做、踩过什么坑、怎么验证、
还剩什么。**新接手的人（或未来的我）应当先读这一份**，再看 `README.md`（面向用户）和 `docs/PLUGIN.md`
（面向插件开发者）。

- 仓库：<https://github.com/zhangxuesong-06/dsh-git-bar>（2026-11-22 由 `dsh-git` 改名，旧 URL 由 GitHub 自动重定向）
- npm：<https://www.npmjs.com/package/dsh-git-bar>
- 目标 DSH 版本：`>=0.2.1-rc.5 <0.3.0`

---

## 1. 一句话说明

给 DSH Web GUI 加一枚会话标题栏右上角的 Git 胶囊：显示当前工作区分支与改动，点开看文件与最近提交，
点分支名进 Git 图谱并切分支/切版本，点文件把差异送进右侧栏审查；图谱里有一个小按钮，可提交并推送
（用户触发、可填描述、推送需要凭据时当场输入）。

## 2. 架构速览

```
浏览器半边 client.js                     Host 半边 index.js
─────────────────────                    ─────────────────────────────
conversation.session.header.utilities    会话 ID → ctx.sessions.get(id)
  └ GitCapsule（胶囊 + 弹出面板）                 → ctx.workingDirectory.get(session)
       ├ GitPanel（列表 / 提交详情 / 图谱 / 分支选择）
       │    └ CommitPanel（提交 + 推送 + 一次性凭据）
       └ SidebarReviewEntry（右侧栏审查标签体）
                                          ctx.webServer.register({ kind:'prefix', path:'/dsh-git-bar' })
                                             ├ GET  /state     分支/上游/改动/最近提交（支持 ?brief=1）
                                             ├ GET  /diff      单文件差异
                                             ├ GET  /branches  本地分支
                                             ├ POST /switch    切分支 / 检出为游离 HEAD
                                             ├ GET  /graph     提交图 + 泳道
                                             ├ GET  /commit    单提交元信息与补丁
                                             ├ GET  /commit-diff 单提交单文件补丁
                                             ├ POST /auto-commit 提交（可选推送；干净时降级为只推送）
                                             ├ POST /push      只推送（凭据重试）
                                             └ GET  /health    存活探针
```

要点：

- 浏览器从不指定目录；目录由 Host 用 `sessions` + `workingDirectory` 解析，再用
  `git rev-parse --show-toplevel` 落在仓库根。
- 所有 git 调用都是 **无 shell 的固定 argv**（`execFile`），参数数组化，杜绝注入。
- 唯一的写操作：切分支、检出提交、用户点击触发的提交/推送；没有后台自动提交，也从不 force push。
- 客户端只用 `require('react')`，无 JSX、无构建、无 `document.body`；样式只用 `--dsw-alias-*` token，
  类名前缀 `gitbar-`，`<style>` 留在自身子树内。

## 3. 时间线

| 日期 | 版本 | 做了什么 |
| --- | --- | --- |
| 11-17 20:21 | — | 初始化工作区（`dsh-git-bar/` 子目录形态的雏形） |
| 11-17 21:01 | — | 第一版：会话右上角胶囊（分支 + 改动数）、分组文件列表、文件差异审查；挂 `conversation.session.header.utilities`，胶囊 84×26 |
| 11-17 23:21 | — | 分支图谱/版本切换、提交详情、右侧栏「Git 审查」标签、全套动效（除进入审查） |
| 11-18 00:16 | — | 图谱从侧边栏挪回胶囊、单画布连线（父提交连线 + 泳道）、游离 HEAD 回退、远程引用展示 |
| 11-18 01:20 | — | 图谱行点击语义（`isHead` 空操作 → 分支行切分支 → 其余确认后游离）、当前行高亮、图谱真实可滚动（`flex:1 1 auto; min-height:0`） |
| 11-18 02:25 | — | 包名定为 `dsh-git-bar`（npm 上 `dsh-git` 已被占用），仓库根改为包本体，补 `dsh.manifestVersion`、`files`、`exports`、`engines` |
| 11-18 02:34–03:01 | — | 两次尝试"点面板外不关面板"（先守右侧栏审查标签，再守"已交接审查"），09:20 用户反馈"降低了体验" → **两次 revert**，恢复成点外面即关闭 |
| 11-18 09:23 | v1.0.0 | 补 `repository`/`homepage`/`bugs`，打首个发布标签 |
| 11-18 10:23 | 1.0.0 | **npm 首发成功**。首版走 npm 的 staged publishing：先出现 `0.0.0-stage` 占位，约 5 分钟后 1.0.0 才可用 |
| 11-18 ~11:00 | — | **事故**：把 profile 从 `link:` 切成 registry 安装时，pnpm 在 Windows 处理指向仓库的 junction，连带删掉了仓库 `.git` 的 HEAD/config/index/logs。用残留的 `refs/` + 对象库 `git init` 重建恢复，并产出 `git bundle` 备份 |
| 11-18 12:22 | v1.0.1 | 恢复 `branch.main` 跟踪配置（`git branch --set-upstream-to=origin/main main`）；Host 增加"无跟踪分支时回退到 `origin/<branch>`"并补自测 |
| 11-20 10:32 | v1.0.2 | 「最近提交」展开、进入提交详情、进入/退出图谱三处硬切换改成动效（180ms，尊重 reduced-motion）；列表底部加「自动提交」按钮 |
| 11-20 11:04 | v1.0.3 | **事故修复**：用 PowerShell `Get-Content -Raw` 改写 README 版本号，被系统按 GBK 解码成乱码并已随 1.0.2 发布 → 从上一个正常提交恢复，改用编辑器重做，发补丁版 |
| 11-20 11:29 | v1.0.4 | 「自动提交」连带推送到远端（有上游走上游，否则 `push --set-upstream`），推送失败保留本地提交并分类报错 |
| 11-20 12:00 | v1.1.0 | 按钮改为图谱工具条 24×24 小图标 + 覆盖式操作面板：提交描述（留空自动生成）、仅提交/提交并推送、游离 HEAD 先建分支再提交、推送需要凭据时就地输入**一次性**用户名/令牌（临时 askpass，用完即删） |
| 11-20 13:15 | v1.1.1 | 修启动误报「不是 git 仓库」（Host 在会话未就绪时返回 `session-pending`，客户端按 400/800/1600/3000/5000ms 退避重试并显示 `…`）；推送按钮按状态自动降级：有改动→提交并推送，没改动但有未推送→只推送，都没有→「没有可推送的改动」 |
| 11-21 起 | v1.1.2 | 稳健化：自测入库 + CI、时间本地化、启动后台重试、收起态轻量轮询（本文件同时补写）；当日发布并装到本机，`/state?brief=1` 与 `iso` 时间戳实测通过 |
| 11-22 | v1.2.0 | Host 新增 6 条文件操作路由（stage / unstage / discard / clean / resolve / undo-commit）与 `test/file-ops.test.mjs`；客户端接上文件行操作、冲突取一边、分组「全部暂存」、提交面板「撤销上次提交」 |
| 11-22 | v1.3.0 / v1.3.1 | 图谱搜索（信息/作者/哈希）+ 加载更多 + 触摸常显；搜索词跨详情保留、Esc 清空搜索；GitHub 仓库改名 `dsh-git-bar` 并同步 `repository`/首页/安装地址 |
| 11-22 | v1.3.2 | **修图谱时间显示 2001 年**：`collectGraph` 曾用 `--date=format:%m/%d %H:%M` 的 `%ad`（无年份）冒充 ISO，`Date.parse` 解析成 2001；改用 `%aI` 严格 ISO，并加回归断言 |
| 11-23 | v1.4.0 | **GitHub 集成**：PAT + OAuth Device Flow 登录（token 进 DSH 凭据库 grant 记录）、以 GitHub 身份提交、token 经 askpass 推送（SSH 远端单条命令改写 HTTPS）、一键克隆仓库到 `~/dsh-workspaces` 并 `workspaces.create` + `uiWorkspace.openWorkspace` 打开新会话、官方远程 GitHub MCP（`dsh-mcp-client` 行由 `.env` 里的 token 变量 gate）；新增 8 条 `/github/*` 路由与 53 项测试 |

## 4. 关键决策（含理由）

1. **胶囊放 `conversation.session.header.utilities`**，用 `position: fixed` 从胶囊的
   `getBoundingClientRect()` 定位面板——避开标题栏 `overflow` 裁剪。面板宽度：列表 460px、图谱 720px，
   都夹在 `vw - 24` 内。
2. **图谱在胶囊里而不是侧边栏**：用户明确要求"图谱和版本切换放回胶囊"。图谱用**单个绝对定位 SVG**画
   连线（不是每行一个 SVG），跨行的"进行中"竖线单独补画，避免 `clipPath` 与行高错位。
3. **审查交给右侧栏**：胶囊只做"启动器"，点文件后 `ctx.sidebarRight.openResource(...)` 打开
   `sidebar.right.pane.tab` 的审查标签，面板保持打开并闪一下「已在右侧栏打开审查」。这是用户反复确认的
   行为（面板不要关，方便连续点下一个文件）。
4. **提交详情不内嵌补丁**：只显示元信息 + 增删统计 + 文件清单，补丁一律走右侧栏审查（`/commit-diff`），
   避免长补丁把面板撑爆。
5. **点面板外即关闭**（尝试改成"不关闭"被用户否掉两次）：关闭只有三条显式路径之外的补充——点胶囊、
   面板右上 ×、Esc（Esc 逐层：凭据/提交面板 → 图谱 → 列表 → 关闭）。
6. **写操作永远用户触发**：没有任何定时/后台提交；提交按钮只在图谱视图出现；推送失败不 force、不改写历史。
7. **DSH 客户端半边不能用构建产物**：单文件 `client.js` + `window.__ModuleLoader__.load({ id, factory(require) })`
   形态，所以不引入 JSX/打包器，纯 `React.createElement` 手写，`node --check` 作为语法闸门。
8. **发布形态：仓库根 = npm 包**。这样 `git+https://…` 安装无需 `prepare` 脚本，npm 与 GitHub 两条路径共用一份
   文件清单（`files` 白名单 10 个文件）。
9. **「丢弃」和「删除」拆成两个操作**：`discard` 用 `git restore --source=HEAD --staged --worktree` 把已跟踪
   文件连索引带工作区还原；未跟踪文件不属于任何提交，只能 `git clean -f` 从磁盘删除。两者语义不同、风险不同，
   所以拆开并在 Host 侧交叉校验（拿未跟踪路径调 discard 直接拒绝，反之亦然），前端各自加二次确认。
10. **撤销提交用 `reset --soft`**：改动退回暂存区，不丢工作；不用 `--mixed`（会让改动静默变成未暂存）也不用
   `--hard`（会删掉改动）。只有一条提交时没有 `HEAD~1`，直接拒绝并提示。
11. **文件操作先读 body 再跑 git**：请求体是流，若在 `await` 之后再挂监听，body 可能已经流完（测试里表现为
   请求永久挂起）。所以所有写操作路由的第一件事都是把 body 读完。
12. **GitHub 登录走「两种都要」**：PAT 是零配置路径（立刻可用），Device Flow 体验更好但要求用户自建
    OAuth App 提供 `client_id`（还要勾 Enable Device Flow），所以做成配置项而不是写死——没有 client id 时
    `/github/device/start` 直接返回 `missing-client-id`，PAT 通路不受影响。
13. **token 只进 Host**：存 `ctx.credentials` 的 grant 记录（`{kind:'grant', payload:{token,…}}`），这是凭据
    服务里唯一适合「授权凭据」的空间（api-key 记录是给模型供应商用的）；凭据服务缺失时退回插件数据目录的
    0600 JSON。路由永不返回 token，推送/克隆的认证走临时 askpass（不进 argv、不改 remote）。
14. **提交身份用 noreply 地址**：`<id>+<login>@users.noreply.github.com` 在账号改名后仍有效，也不会把真实
    邮箱写进提交历史；`useGithubIdentity` 可关，关掉就完全沿用仓库/全局 git 配置。
15. **MCP 用「env 变量 gate 的声明式行」而不是运行时挂载**：Loader 的 `!!js` 是同步求值（`new Function`），
    拿不到异步的凭据服务，所以登录时把 token 写进 Harness 家目录 `.env`（0600），patch 行用
    `disabled: !!js !process.env.DSH_GIT_BAR_GITHUB_TOKEN` 控制是否挂载、header 用 `!!js` 模板读同一个变量。
    代价是登录后要重启一次 DSH；好处是 token 从不进入 patch/设置文件，退出登录删一行即可。
16. **克隆目录名固定 `<owner>-<repo>`**：避免不同 owner 的同名仓库撞车；目标已存在且非空直接 `target-exists`，
    绝不覆盖用户已有目录；根目录可在卡片里改（默认 `~/dsh-workspaces`）。

## 5. 事故与根因（值得记住的坑）

| 事故 | 根因 | 处理 |
| --- | --- | --- |
| **v1.4.24 及更早版本让 DSH 完全无法启动** | 插件在登录/刷新 token 时把 `DSH_GIT_BAR_GITHUB_TOKEN=…` 写进 `~/.dsh/.env`，只为让声明式 MCP 行读到它。Harness 0.2.1-rc.5 只接受该字段来自**启动进程环境变量**，`.env` 里出现即中止启动；而且卸掉插件也不会自愈，因为 `.env` 已被写脏（手工删掉该行后恢复，凭据库里的 token 仍然有效） | 1) 彻底删除 `writeGithubEnvToken`，改为 `cleanupGithubEnvToken`（只在插件加载、登录后、退出时**移除**遗留行，其它键原样保留）；2) MCP 改为「需要时由用户把变量设进进程环境」并在 README 写明；3) 契约测试加护栏（不得出现写 `.env` 的代码）；4) 顺带发现父进程会导出半套 `GIT_CONFIG_*` 导致 git 报 `missing config key GIT_CONFIG_KEY_0`，插件所有 git 调用与测试统一走 `sanitizeGitEnv`。**规则：绝不写 Harness 拥有的启动文件；MCP 秘密只从进程环境来。** |
| **v1.4.6 让 DSH 启动失败、所有插件面板消失** | 我们把组件注册进 `conversation.hero.workspace.directoryFlow` / `sidebar.workspaces.directoryFlow`——它们是被系统目录选择器占用的 **single 插槽**。第二个注册让 `@deepseek-ai/dsh-client-ui-directory-picker-native` 这个前端 entry 激活失败，而 Web 启动要求「所有 entry 都激活」（`web boot: 1 entry did not activate`），于是整个前端启动失败。启动失败后 profile 被恢复流程重写：`dsh.profile.bundles` 从 13 项缩到 8 项（memory/remote-control/bridge/robot-uart/plugin-market/git-bar 全丢），`cordis.patch.yml` 也被覆盖（留下了 `.bak-1795440874397`） | 1) 从崩溃日志定位到 native picker entry；2) 回滚两个 single 插槽注册（v1.4.7），入口回到 list 插槽 `conversation.hero.options`、面板留在 `shell.overlay`；3) 手工用备份恢复 profile 的 `bundles` 与 `cordis.patch.yml`（原文件另存 `.bak-lead-*`）；4) 契约测试加护栏：client.js 出现 `conversation.hero.workspace` / `sidebar.workspaces` / `main.conversation` 即失败。**规则：只注册 list 插槽，single 插槽属于内置 UI。** |
| 路由 404、胶囊不显示 | (a) 缺 `export const inject = ['webServer']`；(b) prefix 写成 `/dsh-git-bar/`（宿主匹配规则是 `pathname === prefix \|\| startsWith(prefix + '/')`，带尾斜杠只匹配自己） | 补 inject；prefix 去掉尾斜杠 |
| 客户端注册不上 | 槽位注册选项里写了 `locale: NS`（不是合法选项），导致注册被拒 | 移除该字段，locale 改用 `ctx.locale.register` + `bind` |
| 图谱不能滚动 | `.gitbar-graph` 在 auto-height 的 flex body 里写了 `height:100%` | 改 `flex: 1 1 auto; min-height: 0`，容器 `overflow: hidden` |
| 泳道永远在 lane 0/1 间跳 | 放置提交后没有释放 lane | 放置前总是 `lanes[lane] = null` 再分配给父提交 |
| 游离状态无法返回 | 头部控件在 `/state` 不可用时渲染成 `<span>`（没有开合），"返回列表"被隐藏，行再点会重复 detach | 头部永远渲染成按钮；返回控件无条件出现；`row.isHead` 直接空操作；分支顶点行改为切分支 |
| README 变乱码 | PowerShell 5.1 的 `Get-Content -Raw` 按系统 ANSI（GBK）解码 UTF-8，再写回 UTF-8 | 从上一个正常提交恢复 + 编辑器重做；**规则：含中文的文件不再经 PowerShell 读写** |
| 仓库 `.git` 元数据丢失 | `link:` 安装 + pnpm 在 Windows 上删除指向仓库的 junction 时连带删了目标里的 `.git` 内部文件 | `git init` + `update-ref` + `reset --hard` 恢复（refs 与对象都还在）；产出 `git bundle` 备份；README 写明不要 `link:` 与 pnpm install/remove 混用 |
| npm 发布 403 | 账号开了 2FA，普通登录令牌不能发布 | 建带 `bypass 2FA` 的细粒度令牌写入 `%USERPROFILE%\.npmrc`；`.npmrc` 进 `.gitignore` |
| 发布后 409 版本冲突 | 首次发布走 staged publishing：1.0.0 已 staged 但还在处理中，重复发布报 409 | 等处理完成（约 5 分钟）；不要重复发同一版本 |
| 镜像装不上新版本 | DSH 的 pnpm 会退到 `registry.npmmirror.com`，镜像同步有延迟 | 用官方 registry 的 tarball（`npm pack` 或直接下载 `.tgz`）安装；或用 `install_bundle` 的 `registry` 参数优先官方源 |
| **别的用户搜到的是旧版本（1.1.x）** | 用户的 DSH 走国内镜像，镜像的 `latest` 当时停在 1.1.2（版本文件有 1.3.0/1.3.1，但 dist-tag 没跟上、也缺 1.3.2），而且镜像索引有 CDN 缓存 | `PUT https://registry.npmmirror.com/-/package/<name>/syncs` 触发同步；约十几分钟后 `latest` 变为 1.3.2、tarball 的 `integrity` 与官方一致。已固化为 `npm run sync-mirror`（发版清单第 6 步），README 加了 FAQ |
| 用户以为插件会自动更新 | DSH **没有插件自动更新**：`autoUpdate` 只出现在 `electron-updater`（应用自身）里；插件市场的「有更新」只是把**市场索引**里的版本与已安装版本比较（`dsh-plugin-market` 的 `installationOf`），索引本身由第三方维护 | README 里写清「插件升级 = 重新安装 + 重启 DSH」；另外市场索引用的是 format 1 JSON，本机配置的 `https://awesome-dsh-plugin.com/catalog.json` 不是该格式（`plugin_market` 直接报 `$.format must be 1`），所以市场搜索/更新提示本来就不可用 |
| 市场里有个同名插件 | 第三方目录里存在另一位作者的 GitHub 插件 `mjnhmd/dsh-git-bar`，与本项目无关 | README FAQ 里明确以 npm 包名 / 本仓库地址为准 |
| 改了 client.js 但界面没变 | 客户端模块已被页面"物化"，`link:` 下改文件不会自动重新加载；刷新页面有时也不够 | 装新版本（或重启 DSH）才会重新物化；README 明确写了"升级后重启一次 DSH" |
| 启动瞬间显示"不是 git 仓库" | 会话/工作区未就绪时 Host 退回进程默认目录（profile 目录）→ `not-a-repository` | Host 返回 `session-pending`；客户端等 sessionId 并按退避重试，未确定前显示 `…` |
| 推送永远 `Permission denied (publickey)` | DSH 进程拿不到用户的 SSH key/agent | 要么把无口令 key 放 `~/.ssh` 或启动 ssh-agent 后重启 DSH，要么改 HTTPS + PAT（面板里输入一次性令牌） |

## 6. 验证策略（为什么没有截图测试）

这个环境没有浏览器控制权，所以分三层验证：

1. **离线 Node 自测**（现在已入库 `test/`）：用 mock 的 `ctx`/`req`/`res` 直接调 `apply(ctx)` 与路由
   handler，在临时 git 仓库（含 bare 远端、冲突、游离 HEAD 等场景）上断言 JSON 结果与仓库真实状态；
   客户端用假 React + 假 `fetch`/定时器跑 SSR 与交互断言。
2. **真机 HTTP 探针**：对运行中的 GUI 端口请求 `/health`、`/state`、`/graph`、`/push` 等，验证真实
   DSH 环境下的路由、会话解析、权限与错误分类。
3. **用户目视**：动效手感、面板布局、配色。每轮发版后由用户重启 DSH 确认。

真机验证时注意：GUI 端口每次重启都会变（历史出现过 40231/3385/38732/44655 等），以运行时上下文里的
URL 为准；会话 ID 也会随环境变化。

## 7. 已知限制

- 只支持本地仓库；远程是网络文件系统/SSH 工作区时不保证。
- 差异与文件列表有长度上限（`MAX_DIFF_CHARS` 等），超大改动会截断并提示。
- 提交信息自动生成规则很简单（文档→`docs`、测试→`test`、其余→`chore`，主题 `auto-commit N files`），
  不调用模型生成。
- 推送凭据只支持"一次性"：不支持记住、不支持 passkey/WebAuthn；GitHub HTTPS 必须用 PAT。
- 图谱默认 120 条、最多 300 条，没有分页/搜索。
- 客户端 200KB 单文件，无构建链。

## 8. 路线图

- **v1.1.2（稳健化，已完成）**：
  - [x] 自测入库 `test/*.test.mjs` + `npm test`（`node --test`）+ `prepublishOnly` 闸门；
  - [x] GitHub Actions（ubuntu + windows 跑 check/test，打 tag 时 `npm publish --provenance`）；
  - [x] `docs/WORKLOG.md` + `CHANGELOG.md`；
  - [x] Host：`/state?brief=1` 轻量模式（收起态轮询少跑 2 个 git 子进程）、提交时间补 `iso` 字段；
  - [x] `test/contract.test.mjs`：静态契约（loader 形态、只 require('react')、无 Web Storage、类名前缀、
        host 路由前缀无尾斜杠、无 shell 执行、manifest/locale/patch 完整性）；
  - [x] 客户端：收起态 brief 轮询、`Intl.RelativeTimeFormat` 时间本地化、启动识别后台慢重试。
- **v1.2.0（功能，已完成，2026-11-22 发布）**：
  - [x] Host：`stage` / `unstage` / `discard` / `clean` / `resolve` / `undo-commit` 六条路由 + 路径与状态交叉校验；
  - [x] `test/file-ops.test.mjs`（33 项断言，含 CRLF 与路径越权守则）；
  - [x] 客户端：文件行操作按钮、行内确认条、冲突取一边、分组「全部暂存」、面板「撤销上次提交」；
  - [x] 发布并装到本机；真机 HTTPS 探针校验了六条路由的 `405`/`missing-paths`/`missing-side` 分支，
        并对**未跟踪探针文件**跑通了 stage → unstage → clean 全链路（仓库状态零残留）。
- **v1.3.0（功能，进行中）**：
  - [x] Host：`/graph` 支持 `skip` 分页（`--skip`，单页上限 500）与 `q` 搜索（最近 1000 条内匹配
        信息/作者/哈希，大小写不敏感，命中后按扁平列表返回）；
  - [x] `test/graph-search.test.mjs`（24 项：信息/作者/哈希/大小写/无结果/三页分页/搜索分页/limit 夹取）；
  - [x] 客户端：图谱搜索框与结果列表、加载更多、触摸设备行操作常显；
  - [x] 打磨项（1.3.1）：从搜索结果进详情再返回保留搜索词与已加载分页、搜索框内 Esc 先清空搜索、
        清空搜索即时生效（打字仍防抖）；
  - [ ] 剩余观察项：跨页泳道连线未重算、从详情返回滚动位置回顶部、大仓库虚拟滚动（观察后再定）。
- **v1.4.0（GitHub 集成，已实现，待真机验证）**：
  - [x] Host：`github/status|login|logout|device/start|device/poll|repos|clone|config` 八条路由；
        token 存 `ctx.credentials` 的 grant 记录（`dsh-git-bar/github-token`），无该服务时退回 0600 文件；
  - [x] 身份：`githubIdentityArgs()` → `<name> <id+login@users.noreply.github.com>`，`useGithubIdentity` 可关；
  - [x] 推送：token 经临时 askpass，`git@github.com:` / `ssh://git@github.com/` 仅在单条命令里用
        `url.https://github.com/.insteadOf` 改写；remote 配置不变；
  - [x] 克隆：`parseGithubRepo` 接受 `owner/repo`、`github.com/...`、URL；目标目录非空即拒绝；
  - [x] MCP：patch 增 `@deepseek-ai/dsh-mcp-client`（`serverName: github`），header 用 `!!js` 读
        `process.env.DSH_GIT_BAR_GITHUB_TOKEN`，`disabled` 同变量取反；login/logout 维护 `~/.dsh/.env`；
  - [x] `test/github.test.mjs`（59 项，mock `fetch`）+ `contract.test.mjs` 的 GitHub 契约（8 路由、askpass、
        SSH 改写、patch 无 token 字面量）；
  - [x] 内置 OAuth App client id 通路：`DEFAULT_DEVICE_CLIENT_ID`（发布者建一次、随包分发）+ 环境变量
        `DSH_GIT_BAR_OAUTH_CLIENT_ID`（测试/运维覆盖）+ 配置 `deviceClientId`（用户自建 App 覆盖）；
        `/github/status` 多返回 `device{ready,custom,shipped}`，panel 可据此决定是否展示浏览器登录；
  - [x] 客户端（v1.4.1）：没有可用 App 时降级为说明 + 「改用 PAT」且不再发 `/device/start`；卡片里可填/保存
        自定义 Client ID（`invalid-config` 行内显示）、可「重置为内置应用」；内置 App 时显示「使用内置应用」小字；
  - [x] token 续期：grant 记 `refreshToken`/`expiresAt`（device flow 的 `expires_in`、PAT 的
        `github-authentication-token-expiration` 头），调用前临近过期自动刷新并整份替换轮换后的
        refresh token；刷新失败返回 `reauth-required`；
  - [x] **v1.4.2 代理修复**：用户机器走系统代理（`127.0.0.1:7897`），`github.com` 直连超时但 `api.github.com` 可用，
        导致 device flow 只有它失败。Host 改用 Electron `net.fetch`（Chromium 栈读系统代理），无 Electron 时回退
        Node fetch；真机探针随后拿到真实 user code（`C85A-A237`），登录成功（`zhangxuesong-06`）；
  - [x] **v1.4.3 克隆体验**：后台克隆任务（`clone/status` 返回 state/percent/stage/path/result/reason）、
        客户端模块级 store 让面板关闭后继续轮询、目标路径预览、克隆根目录可改、失败重试；
  - [x] 并行测试误报修复：askpass 临时目录断言统计全机目录 → 目录名带 pid、只统计本进程（CI ubuntu 红的主因）；
  - [x] **v1.4.4 克隆流程**：`clone/preview` 先给出目标路径/占用/登录状态，用户在确认区选「确认克隆」或
        「修改目录」（`uiWorkspace.pickDirectory()`）；GitHub 的 https/SSH 地址归一化成 owner/name，
        其它 git URL 原样克隆（folder 取仓库名）；**未登录可克隆公开仓库**，私有仓库失败带 `needsSignIn`；
  - [x] **v1.4.5 克隆入口搬家**：胶囊 GitHub 卡片只留登录/账户；新会话行注册 `conversation.hero.options`
        放「从 GitHub 克隆」入口，打开独立面板（搜索仓库/任意 URL → preview 确认 → 后台进度 → 创建并打开工作区）；
        轮询移到插件模块层，面板关闭后继续；hero 注册失败时退回胶囊里的兜底入口。
        **为什么不在「添加工作区…」菜单里**：那个弹层是 ui-workspace 内部菜单，没有插件扩展点；
        `conversation.hero.options` 是同一行里官方提供的最近位置（`directoryFlow` 是 single 且会顶掉系统目录选择器，故不用）。
  - [x] **v1.4.6 入口进「添加工作区」**：面板改注册到 `shell.overlay`，点击**立即**出现（此前挂在胶囊子树里、
        新会话页无上下文，要等一次重渲染）；接管两个 `directoryFlow` single 插槽，把「添加工作区…」变成
        「选择本地文件夹…（走原生 pick）/ 从 GitHub 克隆…（克隆完成后 onPicked 让框架自动建工作区）」；
        flow 上下文按钮文案「克隆并建立工作区」，注册失败退回胶囊兜底按钮。
  - [x] **v1.4.8 面板宿主修正 + 配色**：`shell.overlay` 在新会话页（AppFrame 无会话挂载）不渲染，导致点按钮后要切一次
        会话才出现；改为由**会话头部胶囊宿主**（`clonePanelHost` + `ClonePanelHost`）渲染，胶囊常驻并订阅 store，
        点击即出现；hero 按钮只触发，胶囊未挂载才退回入口本地渲染。遮罩改用 `--dsw-alias-bg-mask-1`，
        卡片尺寸/阴影/圆角/字号对齐胶囊面板（`bg-overlay` + `border-l2` + `min(520px,100%)`）。
  - [x] **v1.4.9 网络与渲染兜底**：git 不读桌面网络栈，系统代理下 https 远端超时（GitHub API 走 Electron fetch 却正常）
        → Host 检测代理（Electron `resolveProxy` → Windows 注册表 → 环境变量，`DSH_GIT_BAR_HTTP_PROXY=none` 强制直连），
        只在单条 git 命令上加 `-c http.proxy=…`；新增 `GET /github/network`（代理/可达性/延迟/推送方式，15s 缓存），
        面板在 GitHub 卡片、克隆面板、推送失败错误条三处展示并可重测。另修 hero 页胶囊走 catch 兜底分支时丢面板宿主的问题。
  - [x] **v1.4.10 原生 dialog 修「面板渲染成原地展开」**：`position: fixed` 在带 `transform` 的祖先里会退化成相对该祖先
        定位（hero 行正好是这类容器），所以面板看着像「在按钮处展开且没渲染好」，切会话换宿主才正常。改用
        `<dialog>` + `showModal()`（top layer，不受祖先 transform/裁剪影响），`::backdrop` 用 `--dsw-alias-bg-mask-1`；
        `showModal` 缺失时退回 fixed 遮罩；切会话自动关闭；删除胶囊宿主/`shell.overlay` 双渲染路径。
  - [ ] 待用户用真实 GitHub 账号验证：真机克隆 + 打开工作区、重启后 `mcp__github__*` 工具是否出现、
        面板在 hero 页的即时渲染与主题观感、代理下推送是否稳定。
  - [-] 历史作者整理：开发期 44 个提交作者是 `DSH Lead <lead@local>`；**用户决定不改写历史**（不 force push），
        此后的提交已改用仓库配置身份、插件创建的提交用 GitHub 身份。
- **发布收尾**：
  - [x] GitHub 仓库已改名为 `dsh-git-bar`（2026-11-22，旧 URL 自动重定向），`repository`/`homepage`/`bugs`
        与 README 里的安装地址已在 1.3.1 同步更新；
  - [ ] README 截图（需要真机截图）；
  - [-] 删除 npm 上的 `0.0.0-stage` 占位 —— **用户决定保留**（不影响安装，`latest` 始终指向正式版本）。

## 9. 测试说明（`npm test`）

`node --test` 自动发现 `test/*.test.mjs`，每个文件是一个独立进程，跑完打印 JSON 断言清单并以退出码表结论。
所有用例都在 `%TEMP%` 下造临时 git 仓库，不碰工作区、不需要启动 DSH。

| 文件 | 覆盖 |
| --- | --- |
| `upstream.test.mjs` | 无跟踪分支回退到 `origin/<branch>`、ahead/behind 计数、真配了上游时行为不变 |
| `auto-commit.test.mjs` | 提交合并改动、自定义/自动提交信息、提交后工作区清空、无改动与冲突的拒绝 |
| `push.test.mjs` | 有上游/无上游/无远端/远端领先/远端不可达五种推送路径与分类 |
| `push-only.test.mjs` | `session-pending` 与"干净但有未推送提交→只推送"的降级逻辑 |
| `commit-panel.test.mjs` | 自定义描述、仅提交、游离 HEAD 建分支、`/push` 路由、askpass 特殊字符与临时目录清理 |
| `graph-search.test.mjs` | 图谱搜索（信息/作者/哈希/大小写/无结果）与 `skip` 分页、`limit` 夹取 |
| `github.test.mjs` | GitHub：纯函数（仓库规格/身份/SSH 改写）、PAT 登录与坏 token、设备流 pending/slow-down/approved、仓库过滤、本地克隆与 `target-exists`、配置校验、GitHub 身份提交与开关、带 token 的提交+推送、退出登录后的拒绝 |
| `brief.test.mjs` | `?brief=1` 不返回文件/提交但计数一致、`iso` 格式、干净树计数为 0 |
| `contract.test.mjs` | 两个半边的静态契约（见上文路线图里的说明） |

## 10. 发版检查清单

1. 改代码 → `node --check index.js client.js`；
2. `npm test`（自测全绿）；
3. 更新 `package.json` 版本 + README 里的版本号/离线包名 + `CHANGELOG.md`；
4. `git commit` + `git tag -a vX.Y.Z`；
5. `npm publish`（等 5 分钟处理完）；
6. **`npm run sync-mirror`**：触发国内镜像同步并校验 `latest` 与 `integrity`（不同步的话镜像用户会装到旧版本）；
7. 用**官方 registry 的 tarball** 安装到本机：`plugin_manager remove_bundle` → `install_bundle target=<tgz>`；
8. 探针验证：`/health`、`/state`、`/graph`、新路由（含错误分支）；
9. 请用户重启 DSH 目视确认；
10. `git push origin main vX.Y.Z`。
