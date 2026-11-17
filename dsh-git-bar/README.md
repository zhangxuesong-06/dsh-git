# Git 胶囊 (dsh-git-bar)

在会话标题栏右上角的工具区放一枚**可展开的胶囊**，实时显示当前工作区的 **git 分支**与**工作区改动**；展开后可分组查看改动文件、最近提交，并**点选任意文件进行差异审查**。

已安装到当前 `desktop` profile（bundle `@local/dsh-git-bar`），随 DSH 启动自动生效。

---

## 交互

| 操作 | 效果 |
| --- | --- |
| 默认 | 胶囊显示 `分支名 + 改动数`，圆点按状态着色（干净=空闲色，有改动=警告色，有冲突=错误色） |
| 点击胶囊 | 在胶囊下方弹出面板：分支、上游、`↑ahead ↓behind`、改动数、按 `已暂存 / 未暂存 / 未跟踪 / 冲突` 分组的文件列表、`最近提交` |
| 点击某个文件 | 进入**审查视图**：等宽字体的统一差异，带行号、`@@` 块头、`+`/`-` 着色、`复制 diff`、`返回` |
| 再次点击胶囊 / 点击面板外 / `Esc` | 收起面板 |
| 自动刷新 | 收起时 20s、展开时 5s；标签页隐藏时暂停；切换会话立即重取 |

## 数据来源

- 浏览器一半（`client.js`）只负责渲染，不读取任何文件。
- Host 一半（`index.js`）把**会话 ID** 映射到目录：`ctx.sessions.get(id)` → `ctx.workingDirectory.get(session)`，因此胶囊跟随**当前会话的工作区**，多工作区并存时各会话各看各的。
- Host 通过 `node:child_process` 以**无 shell 的固定 argv** 调用本机 git（读完结果即丢弃），并开三条只读 HTTP 路由：

| 路由 | 说明 |
| --- | --- |
| `GET /dsh-git-bar/state?session=<id>` | 分支、HEAD、上游与 ahead/behind、状态条目（含 `--numstat` 增删行数）、最近 12 条提交 |
| `GET /dsh-git-bar/diff?session=<id>&path=<相对路径>&staged=0或1` | 单个文件的统一差异；未跟踪文件合成「新文件」差异；超过上限截断 |
| `GET /dsh-git-bar/health` | 存活探针 |

安全约束：`path` 必须是仓库内相对路径（拒绝绝对路径、盘符与 `..`）；仓库根由 `git rev-parse --show-toplevel` 解析，浏览器从不直接指定目录。

## 文件结构

```
dsh-git-bar/
├── package.json        # bundle 补丁 + dsh.client 声明（platform: web, inject: ui-conversation）
├── cordis.patch.yml    # 插入 id: dsh-git-bar 的 Host 行
├── index.js            # Host 半边：会话目录解析 + git 读取 + 路由
├── client.js           # 浏览器半边：胶囊 / 面板 / 差异审查（纯 JS，仅 require('react')）
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

- 差异审查在面板内完成，不向会话发送消息（没有「让模型审查」的副作用）。
- 只读：不提供暂存、提交、切换分支等写操作。
- 仅在本机 Web 载体下工作（依赖 `ctx.webServer`）；没有 Web 载体的组合中插件会自动降级为不注册路由。
- 大仓库首次读取会跑多次 git 子进程（状态 + 两路 numstat + log），已被超时与输出上限保护。

## 卸载

在「设置 → 插件」中停用 `Git 胶囊`，或在本仓库外执行 `plugin_manager` 的 `remove_bundle`（目标 `@local/dsh-git-bar`）。
