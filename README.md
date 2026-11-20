# dsh-git-bar · DSH 的 Git 胶囊

给 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）Web GUI 加一枚**会话标题栏右上角的 Git 胶囊**：一眼看到当前工作区的分支与改动，点开看改动文件、最近提交，点分支名看**带连线泳道的 Git 图谱**并切分支/切版本，点文件把差异送进**右侧栏审查**。

> 纯本地插件：不联网、不上传代码、不读凭据；只在本机用 `git` 读你的仓库，写操作仅限「切分支 / 检出某个提交（先确认）」。

---

## 功能一览

| 位置 | 能力 |
| --- | --- |
| 胶囊（收起） | 分支名 + 改动数；圆点按状态着色（干净 / 有改动 / 有冲突）；游离 HEAD 时显示 `HEAD@<短哈希>` |
| 胶囊（展开） | 上游与 `↑ahead ↓behind`、分组文件列表（已暂存 / 未暂存 / 未跟踪 / 冲突）、`最近提交`；20s/5s 自动刷新，切会话立即重取 |
| 底部「自动提交」 | 用户点击才提交：自动生成 Conventional Commit 信息（文档→`docs`、测试→`test`、其余→`chore`）并提交全部改动；冲突 / 游离 HEAD / 无改动会拒绝并说明原因；从不推送、不 amend、不重写历史 |
| 点分支名 | 同一面板切成 **Git 图谱**（宽度 720px，右边缘不动）：单画布连线、泳道、`HEAD`/分支/远程/标签芯片、当前行高亮与「当前」标记、纵向滚动与 `PageUp/PageDown/Home/End` |
| 点图谱里的分支芯片 | 直接切换分支 |
| 点图谱里的远程/标签芯片，或非顶点行 | 确认条 → 检出为游离 HEAD |
| 游离 HEAD | 工具条 `← 回到分支 <名字>`（Host 从 reflog 推断）+「游离 HEAD」芯片就地打开分支选择器 |
| 点提交名 | 提交详情：哈希、作者、时间、`+N −M`、文件清单（不内嵌补丁）；点文件进该提交的该文件审查 |
| 点改动文件 | 在右侧栏「Git 审查」标签里打开差异，**面板保持打开**并自动让位，方便连续点下一个 |
| 右侧栏「开始」页 | 一张「代码审查」卡片：没选文件时列出现有改动，点一条即审查 |

所有过渡（展开/收起、`最近提交` 展开、进入提交详情、进入/退出图谱、图谱行入场、确认条、悬停、计数变化）都是平滑动画，并且遵守系统 `prefers-reduced-motion`；只有「进入审查」这一刻是瞬时的。

## 安装

在 DSH 的 **设置 → 插件 → 添加**（或 `plugin_manager` 工具）里，任选一种：

| 方式 | 输入 |
| --- | --- |
| npm 包（已发布） | `dsh-git-bar`（跟随 latest），或锁定版本 `dsh-git-bar@1.0.3` |
| GitHub 仓库 | `git+https://github.com/zhangxuesong-06/dsh-git.git` |
| 本地目录（开发） | `link:<仓库绝对路径>` |
| 离线包 | `file:<仓库绝对路径>/dsh-git-bar-1.0.3.tgz` |

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
- 本机 `git` 2.x（应用进程 PATH 里找不到时会再试常见安装路径，也可用环境变量 `DSH_GIT_BIN` 指定）。

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
| `GET /dsh-git-bar/state?session=` | 分支、HEAD、上游、ahead/behind、状态条目（含 `--numstat`）、最近提交（短/完整哈希） |
| `GET /dsh-git-bar/diff?session=&path=&staged=` | 单文件统一差异（未跟踪文件合成「新文件」差异） |
| `GET /dsh-git-bar/branches?session=` | 本地分支列表（当前分支标记、上游、最后一条提交） |
| `POST /dsh-git-bar/switch` | `{branch}` 切分支 / `{detach}` 检出为游离 HEAD；拒绝 `-` 开头、未知目标、有冲突的工作区，git 报错原样回传 |
| `GET /dsh-git-bar/graph?session=&limit=` | 提交图（`--all --topo-order`）：父提交、泳道、`HEAD`/分支/远程/标签装饰、`headFull`、`isHead`、`previousBranch` |
| `GET /dsh-git-bar/commit?session=&hash=` | 单提交元信息、逐文件增删、完整补丁 |
| `GET /dsh-git-bar/commit-diff?session=&hash=&path=` | 单提交里某个文件的补丁 |
| `POST /dsh-git-bar/auto-commit` | 由用户点击触发：`git add -A` 后用生成的提交信息提交全部改动（消息体列出文件）；拒绝冲突/游离 HEAD/无改动；从不推送、不 amend、不重写历史 |
| `GET /dsh-git-bar/health` | 存活探针 |

安全约束：`path` 必须是仓库内相对路径（拒绝绝对路径、盘符、`..`）；`hash` 只接受十六进制；分支/标签名必须来自
`git for-each-ref` 的实际结果；仓库根由 `git rev-parse --show-toplevel` 解析，浏览器从不直接指定目录。插件的所有
git 调用都只读，写操作只有三种：切分支、检出为游离 HEAD、以及**用户点击触发的自动提交**（没有任何后台定时提交）。

## 仓库结构

仓库根目录就是 **npm 包本体**（这样 `npm publish` 与 `git+https://…` 两种安装都能直接工作）：

```
.
├── package.json          # 包清单：dsh.bundle 补丁 + dsh.client（platform: web）
├── cordis.patch.yml      # 插入 id: dsh-git-bar 的 Host 行
├── index.js              # Host 半边：会话目录 → git → HTTP 路由
├── client.js             # 浏览器半边：胶囊 / 面板 / 图谱 / 审查（纯 JS，仅 require('react')）
├── locale/en.json        # 插件管理页显示名与描述
├── locale/zh.json
├── icon.svg              # 插件图标（原始绘制）
├── README.md             # 本文件（npm 页也会展示）
├── LICENSE
├── .gitignore
└── docs/PLUGIN.md        # 插件级深文档：交互细节、实现要点、可调参数
```

## 开发与调试

- 语法检查：`node --check index.js` 与 `node --check client.js`。
- 打包预览：`npm pack --dry-run`（应只包含运行需要的文件）。
- 热重载：`plugin_manager action=set_plugin target=include:dsh-git-bar enabled=false` 再 `enabled=true`，Host 与浏览器两半都会换成磁盘上的最新文件（仅 `link:` 安装时跟随磁盘）。
- 浏览器半边的约束：`window.__ModuleLoader__.load({ id, factory })` 形式（`id` 必须等于包名 `dsh-git-bar`）、只用
  `require('react')`、无 JSX/`import`、样式只用主题 token（`--dsw-alias-*`）、`<style>` 渲染在组件自身子树内、所有 effect 成对清理。
- 审查标签体拿不到 `useTabInfo()`，所以审查目标放在模块内可订阅 store 里；右侧栏不可用时自动回退到面板内审查。

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

