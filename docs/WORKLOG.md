# 工作记录（WORKLOG）

本文件记录 `dsh-git-bar` 从零到发布的完整过程：每轮做了什么、为什么这么做、踩过什么坑、怎么验证、
还剩什么。**新接手的人（或未来的我）应当先读这一份**，再看 `README.md`（面向用户）和 `docs/PLUGIN.md`
（面向插件开发者）。

- 仓库：<https://github.com/zhangxuesong-06/dsh-git>
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

## 5. 事故与根因（值得记住的坑）

| 事故 | 根因 | 处理 |
| --- | --- | --- |
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
- **v1.2.0（功能，进行中）**：
  - [x] Host：`stage` / `unstage` / `discard` / `clean` / `resolve` / `undo-commit` 六条路由 + 路径与状态交叉校验；
  - [x] `test/file-ops.test.mjs`（33 项断言，含 CRLF 与路径越权守则）；
  - [ ] 客户端：文件行操作按钮、行内确认条、冲突取一边、分组「全部暂存」、面板「撤销上次提交」；
  - [ ] 图谱搜索（作者/信息/哈希）与加载更多（留到 1.3.0）。
- **发布收尾**：README 截图、删除 npm 上 `0.0.0-stage` 占位（需 OTP）、GitHub 仓库改名为
  `dsh-git-bar` 并同步 `repository` 字段。

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
| `brief.test.mjs` | `?brief=1` 不返回文件/提交但计数一致、`iso` 格式、干净树计数为 0 |
| `contract.test.mjs` | 两个半边的静态契约（见上文路线图里的说明） |

## 10. 发版检查清单

1. 改代码 → `node --check index.js client.js`；
2. `npm test`（自测全绿）；
3. 更新 `package.json` 版本 + README 里的版本号/离线包名 + `CHANGELOG.md`；
4. `git commit` + `git tag -a vX.Y.Z`；
5. `npm publish`（等 5 分钟处理完；镜像会更慢）；
6. 用**官方 registry 的 tarball** 安装到本机：`plugin_manager remove_bundle` → `install_bundle target=<tgz>`；
7. 探针验证：`/health`、`/state`、`/graph`、新路由（含错误分支）；
8. 请用户重启 DSH 目视确认；
9. `git push origin main vX.Y.Z`。
