# dsh-git-bar · DSH 的 Git 胶囊

给 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）Web GUI 加一枚**会话标题栏右上角的 Git 胶囊**：一眼看到当前工作区的分支与改动，点开看改动文件、最近提交，点分支名看**带连线泳道的 Git 图谱**并切分支/切版本，点文件把差异送进**右侧栏审查**。

> 纯本地插件：不联网、不上传代码、不读凭据；只在本机用 `git` 读你的仓库，写操作仅限「切分支 / 检出某个提交（先确认）」。

---

## 功能一览

| 位置 | 能力 |
| --- | --- |
| 胶囊（收起） | 分支名 + 改动数；圆点按状态着色（干净 / 有改动 / 有冲突）；游离 HEAD 时显示 `HEAD@<短哈希>` |
| 胶囊（展开） | 上游与 `↑ahead ↓behind`、分组文件列表（已暂存 / 未暂存 / 未跟踪 / 冲突）、`最近提交`；20s/5s 自动刷新，切会话立即重取 |
| 图谱工具条的「自动提交」小按钮 | 点开一个操作面板：可填提交描述（**留空自动生成** Conventional Commit 信息），两个操作「仅提交」和「推送」。**推送会按当前状态自动选择**：有未提交改动 → 先提交再推送；没有改动但有未推送提交 → 直接推送；两者都没有 → 提示「没有可推送的改动」。推送默认当前分支（有上游走上游，否则 `push --set-upstream`）；需要凭据时面板变成一次性凭据输入（用户名 + 密码/令牌），只用于这一次推送、不落盘不保存。游离 HEAD 下会先按面板里填的分支名建分支再提交，原分支指针不动 |
| 点分支名 | 同一面板切成 **Git 图谱**（宽度 720px，右边缘不动）：单画布连线、泳道、`HEAD`/分支/远程/标签芯片、当前行高亮与「当前」标记、纵向滚动与 `PageUp/PageDown/Home/End` |
| 点图谱里的分支芯片 | 直接切换分支 |
| 点图谱里的远程/标签芯片，或非顶点行 | 确认条 → 检出为游离 HEAD |
| 游离 HEAD | 工具条 `← 回到分支 <名字>`（Host 从 reflog 推断）+「游离 HEAD」芯片就地打开分支选择器 |
| 点提交名 | 提交详情：哈希、作者、时间、`+N −M`、文件清单（不内嵌补丁）；点文件进该提交的该文件审查 |
| 点改动文件 | 在右侧栏「Git 审查」标签里打开差异，**面板保持打开**并自动让位，方便连续点下一个 |
| 改动文件行操作 | 悬停或键盘聚焦出现一组小图标：**暂存 / 取消暂存 / 丢弃改动 / 删除未跟踪文件 / 复制相对路径**；冲突行是**用我方 / 用对方**；丢弃、删除都要行内二次确认（不用浏览器弹窗）。分组标题旁有「全部暂存」 |
| 提交面板 | 底部还有「撤销上次提交」（`reset --soft`，改动退回暂存区，需确认） |
| 右侧栏「开始」页 | 一张「代码审查」卡片：没选文件时列出现有改动，点一条即审查 |

所有过渡（展开/收起、`最近提交` 展开、进入提交详情、进入/退出图谱、图谱行入场、确认条、悬停、计数变化）都是平滑动画，并且遵守系统 `prefers-reduced-motion`；只有「进入审查」这一刻是瞬时的。

## 安装

在 DSH 的 **设置 → 插件 → 添加**（或 `plugin_manager` 工具）里，任选一种：

| 方式 | 输入 |
| --- | --- |
| npm 包（已发布） | `dsh-git-bar`（跟随 latest），或锁定版本 `dsh-git-bar@1.2.0` |
| GitHub 仓库 | `git+https://github.com/zhangxuesong-06/dsh-git.git` |
| 本地目录（开发） | `link:<仓库绝对路径>` |
| 离线包 | `file:<仓库绝对路径>/dsh-git-bar-1.2.0.tgz` |

对应的工具调用：

```text
plugin_manager  action=install_bundle  target=dsh-git-bar
plugin_manager  action=install_bundle  target=git+https://github.com/zhangxuesong-06/dsh-git.git
plugin_manager  action=install_bundle  target=link:<仓库绝对路径>
```

安装后 bundle 通过 DSH 的 HMR 生效；**但升级或首次安装后请重启一次 DSH**——浏览器半边是「物化」加载的，
只刷新页面不会换上新代码（Host 半边则会热替换）。用 `link:` 安装时改代码只需对 `include:dsh-git-bar`
做一次「停用 → 启用」；registry / git 安装的是打包副本，改动需要重新发版或重新安装。

> 开发提示：不要把 profile 指向仓库目录的 `link:` 安装与 pnpm 的 install/remove 混用——在 Windows 上
> pnpm 处理这种 junction 时可能连带删除链接目标里的内容（本项目曾因此丢失 `.git` 元数据，靠 refs/对象恢复）。
> 稳妥做法是 `npm pack` 后装 tarball，或发布 `--tag next` 的预发布版本来联调。

要求：

- DSH **0.2.1-rc.5** 或兼容版本（用到了 `webServer`、`sessions`、`workingDirectory`、`sidebarRightTabs`、`sidebarRight` 这些扩展点）；
- 有 Web 载体（`ctx.webServer`）——桌面版与 `dsh web` 都有；Headless 组合下插件会自动降级为不注册路由；
- 本机 `git` 2.x（应用进程 PATH 里找不到时会再试常见安装路径，也可用环境变量 `DSH_GIT_BIN` 指定）；
- 「自动提交」的**推送**步骤优先使用应用进程可见的 git 凭据（SSH key/agent、或 HTTPS remote + credential helper）；
  没有可用凭据时，面板会就地变成一次性凭据输入（用户名 + 密码/令牌），只用于这一次推送、用完即删；也可能直接
  显示「推送未完成：<git 原始报错>」——此时本地提交已经生成，只是没推上去。
- HTTPS 推送 GitHub/GitLab 时，密码位置要填 **Personal Access Token**（这些平台已不接受账号密码）；SSH 推送时填私钥口令。

## 工作原理

```
浏览器半边 client.js                 Host 半边 index.js
─────────────────────                ──────────────────────────────
conversation.session.header          会话 ID → ctx.sessions.get(id)
  .utilities 注册胶囊                → ctx.workingDirectory.get(session)
面板 / 图谱 / 提交详情               → 本机 git（无 shell 的固定 argv）
右侧栏「Git 审查」标签体             → 私有 HTTP 路由（同源 JSON）
        │                                        ▲
        └──────────── fetch /dsh-git-bar/* ──────────┘
```

| 路由 | 作用 |
| --- | --- |
| `GET /dsh-git-bar/state?session=` | 分支、HEAD、上游、ahead/behind、状态条目（含 `--numstat`）、最近提交（短/完整哈希）；会话/工作区尚未就绪时返回 `{ok:false, reason:'session-pending'}`（客户端会短暂重试，不会误判成「不是 git 仓库」） |
| `GET /dsh-git-bar/diff?session=&path=&staged=` | 单文件统一差异（未跟踪文件合成「新文件」差异） |
| `GET /dsh-git-bar/branches?session=` | 本地分支列表（当前分支标记、上游、最后一条提交） |
| `POST /dsh-git-bar/switch` | `{branch}` 切分支 / `{detach}` 检出为游离 HEAD；拒绝 `-` 开头、未知目标、有冲突的工作区，git 报错原样回传 |
| `GET /dsh-git-bar/graph?session=&limit=` | 提交图（`--all --topo-order`）：父提交、泳道、`HEAD`/分支/远程/标签装饰、`headFull`、`isHead`、`previousBranch` |
| `GET /dsh-git-bar/commit?session=&hash=` | 单提交元信息、逐文件增删、完整补丁 |
| `GET /dsh-git-bar/commit-diff?session=&hash=&path=` | 单提交里某个文件的补丁 |
| `POST /dsh-git-bar/auto-commit` | 由用户点击触发：body `{message?, push?, branch?, username?, password?}`。`message` 为空则自动生成提交信息。**有改动时**：提交（`push:true` 则随后推送，有上游走上游，否则 `push --set-upstream`）；**无改动但 `push:true` 且存在未推送提交时**：不提交、直接推送，返回 `committed:false` 与 `ahead`；**无改动也无未推送提交时**：`reason:'nothing-to-push'`（`push:false` 时是 `nothing-to-commit`）。游离 HEAD 提交需要 `branch`，先 `switch -c` 再提交（原分支指针不动）。返回 `committed`/`short`/`subject`/`branch`/`createdBranch`/`ahead`/`pushed`/`pushReason`/`pushDetail`/`upstream`/`needsCredentials`；拒绝冲突、非法或已存在的分支名；从不 force push、不 amend、不重写历史 |
| `POST /dsh-git-bar/push` | 只推送不提交，body `{username?, password?}`：面板拿到 `needsCredentials` 后用一次性凭据重试；返回 `ok`/`pushed`/`reason`/`pushDetail`/`upstream` |
| `POST /dsh-git-bar/stage` | 由用户点击触发：body `{paths:[…]}` 暂存指定文件，或 `{all:true}` 暂存全部 |
| `POST /dsh-git-bar/unstage` | 取消暂存（`{paths}` 或 `{all:true}`）；刚 `add` 的新文件会回到未跟踪 |
| `POST /dsh-git-bar/discard` | 丢弃已跟踪文件的工作区改动（从 HEAD 恢复索引与工作区）；未跟踪路径会被拒绝（`untracked-needs-clean`） |
| `POST /dsh-git-bar/clean` | 删除未跟踪文件（`git clean -f`，只接受未跟踪路径；已跟踪返回 `tracked-needs-discard`） |
| `POST /dsh-git-bar/resolve` | 冲突文件取一边：`{paths, side:'ours'\|'theirs'}`，取完自动标记解决；非冲突路径返回 `not-conflicted` |
| `POST /dsh-git-bar/undo-commit` | 撤销上一次提交（`reset --soft HEAD~1`，改动保留在暂存区）；只有一条提交时返回 `no-previous-commit` |
| `GET /dsh-git-bar/health` | 存活探针 |

安全约束：`path` 必须是仓库内相对路径（拒绝绝对路径、盘符、`..`）；`hash` 只接受十六进制；分支/标签名必须来自
`git for-each-ref` 的实际结果（新分支名另经 `git check-ref-format --branch` 校验）；仓库根由 `git rev-parse --show-toplevel`
解析，浏览器从不直接指定目录。写操作只有三种：切分支、检出为游离 HEAD、**用户点击触发的自动提交/推送**
（没有任何后台定时提交，也不 force push）。推送时设置 `GIT_TERMINAL_PROMPT=0` 等变量避免卡在交互提示；一次性密码
经 Host 写入临时 askpass 辅助程序交给 git（不出现在 argv 里），推送结束立即删除，不落盘、不保存。

## 仓库结构

仓库根目录就是 **npm 包本体**（这样 `npm publish` 与 `git+https://…` 两种安装都能直接工作）：

```
.
├── package.json           # 包清单：dsh.bundle 补丁 + dsh.client（platform: web）+ scripts
├── cordis.patch.yml       # 插入 id: dsh-git-bar 的 Host 行
├── index.js               # Host 半边：会话目录 → git → HTTP 路由（含提交/推送）
├── client.js              # 浏览器半边：胶囊 / 面板 / 图谱 / 提交面板 / 审查（纯 JS，仅 require('react')）
├── locale/en.json         # 插件管理页显示名与描述
├── locale/zh.json
├── icon.svg               # 插件图标（原始绘制）
├── test/*.test.mjs        # 离线自测：真实临时仓库 + mock ctx，覆盖提交/推送/游离 HEAD/凭据等
├── .github/workflows/ci.yml # CI：双平台 check + test，打 tag 时发布 npm
├── README.md              # 本文件（npm 页也会展示）
├── CHANGELOG.md           # 版本变化
├── LICENSE
├── .gitignore
└── docs/
    ├── PLUGIN.md          # 插件级深文档：交互细节、实现要点、可调参数
    └── WORKLOG.md         # 工作记录：时间线、决策、事故根因、验证策略、路线图
```

## 开发与调试

- 语法检查：`npm run check`（等价 `node --check index.js && node --check client.js`）。
- 自测：`npm test`（`node --test`，5 个测试文件、约 12 秒）。测试会在临时目录里造真实 git 仓库
  （含 bare 远端、冲突、游离 HEAD、无上游、凭据 askpass 等场景），用 mock 的 `ctx`/`req`/`res` 直接驱动
  Host 路由，不需要启动 DSH。首次贡献代码前建议先跑一遍。
- 打包预览：`npm pack --dry-run`（应只包含运行需要的 10 个文件，测试与文档不随包发布）。
- 热重载：`plugin_manager action=set_plugin target=include:dsh-git-bar enabled=false` 再 `enabled=true`，Host 与浏览器两半都会换成磁盘上的最新文件（仅 `link:` 安装时跟随磁盘）。
- 浏览器半边的约束：`window.__ModuleLoader__.load({ id, factory })` 形式（`id` 必须等于包名 `dsh-git-bar`）、只用
  `require('react')`、无 JSX/`import`、样式只用主题 token（`--dsw-alias-*`）、`<style>` 渲染在组件自身子树内、所有 effect 成对清理。
- 审查标签体拿不到 `useTabInfo()`，所以审查目标放在模块内可订阅 store 里；右侧栏不可用时自动回退到面板内审查。
- 完整开发史、事故根因与路线图见 [`docs/WORKLOG.md`](docs/WORKLOG.md)；版本变化见 [`CHANGELOG.md`](CHANGELOG.md)。

## 发布

```bash
npm publish          # scoped 包需 --access public；本包为无 scope 名，public 是默认
```

- `package.json` 已声明 `engines.dsh`（`>=0.2.1-rc.5 <0.3.0`）：DSH 安装前会按它做兼容性门禁，超出范围会被拒绝；
- 版本号遵循 semver，DSH 的 registry 安装锁定精确版本；
- 名字 `dsh-git-bar` 目前在 npm 上已有一个 `0.0.1` 占位包，发布前需确认你对它有所有权。

## 演示数据（可删）

为了演示分支/图谱，本仓库附带：

- 分支 `demo/graph`：两个文档提交 + 一次合并，用来演示分叉泳道；
- 标签 `v0.1.0`。

不需要时：

```bash
git branch -D demo/graph
git tag -d v0.1.0
```

## 卸载

```text
plugin_manager  action=remove_bundle  target=dsh-git-bar
```

或在「设置 → 插件」里停用 `Git 胶囊`。

## 已知限制

- 「右栏审查」只在本机 Web 载体 + 存在会话面时可用；否则回退为胶囊内的审查视图。
- 图谱一次最多 120 条提交、最多 8 条泳道；更早的历史不画。
- 同一类标签只有一份：再点别的文件会聚焦同一个审查标签并换成新目标。
- 远程分支可以被检出成游离 HEAD，但不会替你创建本地跟踪分支。
- 主题 token 由宿主题提供；`color-mix()` 需要较新的 Chromium（老引擎上仅剩高亮左边框，不影响功能）。

## 许可

[MIT](LICENSE) © 2026 dsh-git-bar contributors

你可以自由使用、修改、分发（包括商用），只需在所有副本或实质部分中保留上面的版权与许可声明；软件按「现状」
提供，不带任何担保。想换成个人或公司名义，只改 `LICENSE` 第一行的版权持有人即可（已发布的 MIT 授权不可撤回，
但版权署名可以在后续提交里更正）。

