/**
 * dsh-git-bar — browser half.
 *
 * A compact git capsule in the Session header's right-aligned utilities list:
 * branch + change count when collapsed, a fixed-position popover with the
 * grouped changed files, a branch picker, a commit detail view, and a diff
 * review that hands off to the right Sidebar's own review tab.
 *
 * Everything here is failure tolerant on purpose: the slot blanks its entry
 * when a component throws, so every render path, fetch, clipboard call, timer
 * and listener is wrapped or guarded, and all cleanups are returned.
 *
 * Hand-written ModuleLoader bundle — no build step, no JSX, only `react`.
 */
window.__ModuleLoader__.load({
  id: 'dsh-git-bar',
  factory(require) {
    var React = null
    try {
      React = require('react')
    } catch (error) {
      React = null
    }
    var h = React && typeof React.createElement === 'function' ? React.createElement : null
    var useState = React && typeof React.useState === 'function' ? React.useState : null
    var useEffect = React && typeof React.useEffect === 'function' ? React.useEffect : null
    var useRef = React && typeof React.useRef === 'function' ? React.useRef : null
    if (!h || !useState || !useEffect || !useRef) {
      // A broken React peer must never stop the web client from booting.
      return { inject: ['slots'], apply: function () {} }
    }

    // ── constants ─────────────────────────────────────────────────────────
    var SLOT = 'conversation.session.header.utilities'
    var ENTRY_ID = 'dsh-git-bar'
    var NS = 'dshGitBar'
    var STATE_URL = '/dsh-git-bar/state'
    var DIFF_URL = '/dsh-git-bar/diff'
    var BRANCHES_URL = '/dsh-git-bar/branches'
    var SWITCH_URL = '/dsh-git-bar/switch'
    var COMMIT_URL = '/dsh-git-bar/commit'
    var COMMIT_DIFF_URL = '/dsh-git-bar/commit-diff'
    var AUTO_COMMIT_URL = '/dsh-git-bar/auto-commit'
    var PUSH_URL = '/dsh-git-bar/push'
    var STAGE_URL = '/dsh-git-bar/stage'
    var UNSTAGE_URL = '/dsh-git-bar/unstage'
    var DISCARD_URL = '/dsh-git-bar/discard'
    var CLEAN_URL = '/dsh-git-bar/clean'
    var RESOLVE_URL = '/dsh-git-bar/resolve'
    var UNDO_COMMIT_URL = '/dsh-git-bar/undo-commit'
    var GITHUB_BASE = '/dsh-git-bar/github'
    var GITHUB_STATUS_URL = GITHUB_BASE + '/status'
    var GITHUB_LOGIN_URL = GITHUB_BASE + '/login'
    var GITHUB_LOGOUT_URL = GITHUB_BASE + '/logout'
    var GITHUB_DEVICE_START_URL = GITHUB_BASE + '/device/start'
    var GITHUB_DEVICE_POLL_URL = GITHUB_BASE + '/device/poll'
    var GITHUB_REPOS_URL = GITHUB_BASE + '/repos'
    var GITHUB_CLONE_URL = GITHUB_BASE + '/clone'
    var GITHUB_CLONE_STATUS_URL = GITHUB_BASE + '/clone/status'
    var CLONE_POLL_MS = 1000
    var GITHUB_CONFIG_URL = GITHUB_BASE + '/config'
    var GITHUB_SEARCH_DEBOUNCE_MS = 300
    var GITHUB_REPO_LIMIT = 20
    var REVIEW_PAGE_ADDRESS = 'sidebar://git-review'
    var GRAPH_URL = '/dsh-git-bar/graph'
    var GRAPH_LIMIT = 120
    var GRAPH_MAX_LIMIT = 500
    var GRAPH_SEARCH_DEBOUNCE_MS = 250
    var GRAPH_PANEL_WIDTH = 720
    var GRAPH_ROW_HEIGHT = 34
    var GRAPH_LANE_WIDTH = 14
    var GRAPH_DOT_Y = 17
    var GRAPH_DOT_R = 3.5
    var GRAPH_LANE_INSET = 8
    var GRAPH_STAGGER_MS = 10
    var GRAPH_STAGGER_CAP = 12
    var GRAPH_PAGE_ROWS = 6
    var LANE_COUNT = 8
    var RETRY_DELAYS = [400, 800, 1600, 3000, 5000]
    var RETRY_WINDOW_MS = 10000
    var SLOW_RETRY_MS = 30000
    var POLL_COLLAPSED = 20000
    var POLL_EXPANDED = 5000
    var MAX_DIFF_ROWS = 4000
    var LIST_VIEW = { mode: 'list' }
    var PANEL_ENTER_MS = 150
    var PANEL_EXIT_MS = 120
    var PICKER_MS = 140
    var DETAIL_MS = 180
    var ROW_STAGGER_MS = 12
    var ROW_STAGGER_CAP = 8
    var FLASH_MS = 1600
    var REVIEW_TYPE_ID = 'dsh-git-bar/review'
    var REVIEW_KIND = 'git-review'
    var REVIEW_ADDRESS = 'dsh-resource://git-review/current'
    var REVIEW_ADDRESS_PREFIX = 'dsh-resource://git-review/'
    var REVIEW_PATTERN = 'dsh-resource://git-review/**'

    // ── locale dictionaries ───────────────────────────────────────────────
    var DICT_ZH = {
      branch: '分支',
      branches: '分支',
      staged: '已暂存',
      unstaged: '未暂存',
      untracked: '未跟踪',
      conflict: '冲突',
      conflicts: '工作区有未解决的冲突',
      commits: '最近提交',
      changes: '改动',
      clean: '工作区干净',
      notRepo: '不是 git 仓库',
      refresh: '刷新',
      autoCommit: '自动提交',
      identifyingWorkspace: '正在识别工作区',
      searchPlaceholder: '搜索提交：信息 / 作者 / 哈希',
      clearSearch: '清空搜索',
      resultCount: '共 {n} 条结果',
      noResults: '没有匹配的提交',
      loadMore: '加载更多',
      loadMoreFailed: '加载更多失败',
      loadingMore: '加载中…',
      searchFailed: '搜索失败',
      github: 'GitHub',
      githubSignIn: '登录 GitHub',
      githubSignOut: '退出',
      githubSignedIn: '已登录 GitHub',
      githubPatLabel: '访问令牌（PAT）',
      githubPatHint: '需要带 repo 权限的 Personal Access Token；令牌只提交一次，不会保存在本地。',
      githubPatSignIn: '用令牌登录',
      githubPatRequired: '请粘贴访问令牌',
      githubUseBrowser: '用浏览器登录',
      githubDeviceHint: '在浏览器打开下方地址，输入验证码：',
      githubDeviceUnavailable: '浏览器登录需要 OAuth App Client ID：可填自己的，或改用 PAT',
      githubClientIdLabel: '自己的 OAuth App Client ID',
      githubClientIdPlaceholder: 'Iv1.… 或 Ov23…',
      githubClientIdHint: '留空表示使用内置应用；保存后即可用浏览器登录。',
      githubClientIdCustom: '自定义',
      githubClientIdActive: '已用自定义应用',
      githubClientIdReset: '重置为内置应用',
      githubClientIdSaved: '已保存，可点用浏览器登录',
      githubSave: '保存',
      githubSaving: '保存中…',
      githubUsePat: '改用 PAT',
      githubDeviceShipped: '使用内置应用（dsh-git-bar）授权',
      githubDeviceCode: '验证码',
      githubDeviceWaiting: '等待授权…',
      githubDeviceOpen: '打开验证页',
      githubDeviceExpired: '验证码已过期，请重试',
      githubDeviceDenied: '授权被拒绝',
      githubDeviceMissingClientId: '未配置 GitHub OAuth Client ID',
      githubNewWorkspace: '从 GitHub 新建工作区',
      githubReposPlaceholder: '搜索仓库，或输入 owner/repo',
      githubReposEmpty: '没有匹配的仓库',
      githubCloneRoot: '克隆根目录',
      githubCloneRootChange: '修改',
      githubCloneTarget: '将克隆到',
      githubSaved: '已保存',
      githubCloneQueued: '排队中',
      githubCloneStarting: '准备中',
      githubCloneCounting: '统计对象',
      githubCloneReceiving: '正在接收对象',
      githubCloneResolving: '解析差异',
      githubCloneFinishing: '收尾',
      githubCloneDone: '克隆完成',
      githubOpenWorkspace: '打开工作区',
      githubCloneRetry: '重试',
      githubCloneFailed: '克隆失败',
      githubRepoNotFound: '仓库不存在或无权访问',
      githubAuthFailed: 'GitHub 授权失败',
      githubReauth: 'GitHub 授权已失效，请重新登录',
      githubUnknownJob: '克隆任务已丢失，请重试',
      githubClone: '克隆并打开',
      githubCloning: '克隆中…',
      githubRepoRequired: '请输入 owner/repo',
      githubClonePathCopied: '克隆完成，路径已复制',
      githubWorkspaceOpened: '已打开新工作区',
      githubIdentityLine: '将以 {login} 身份提交',
      githubIdentityOff: '使用 GitHub 身份提交',
      githubPrivate: '私有',
      githubBadCredentials: '访问令牌无效或缺少 repo 权限',
      githubNetworkError: '网络错误',
      githubLoginFailed: '登录失败：{detail}',
      githubReposFailed: '获取仓库失败：{detail}',
      githubCloneFailed: '克隆失败：{detail}',
      githubNotSignedIn: '请先登录 GitHub',
      githubBadRepo: '仓库格式应为 owner/repo',
      githubTargetExists: '目标目录已存在',
      githubSettingsFailed: '保存设置失败',
      stage: '暂存',
      unstage: '取消暂存',
      discardChanges: '丢弃改动',
      deleteUntracked: '删除',
      copyPath: '复制路径',
      copiedPath: '已复制路径',
      copyFailed: '复制失败',
      useOurs: '用我方',
      useTheirs: '用对方',
      stageAll: '全部暂存',
      confirmDiscard: '丢弃 {path} 的改动？',
      confirmDelete: '删除未跟踪文件 {path}？',
      undoCommit: '撤销上次提交',
      confirmUndo: '撤销提交 {short} {subject}？',
      undone: '已撤销',
      noPreviousCommit: '没有可撤销的提交',
      missingPaths: '操作参数无效',
      untrackedNeedsClean: '未跟踪文件请用删除',
      trackedNeedsDiscard: '已跟踪文件请用丢弃改动',
      conflictedNeedsResolve: '冲突文件请先用我方/对方解决',
      notConflicted: '该文件没有冲突',
      missingSide: '缺少解决方式',
      opFailed: '操作失败',
      justNow: '刚刚',
      pushNow: '推送',
      nothingToPush: '没有可推送的改动',
      pushOnlyHint: '当前无未提交改动，将直接推送 {n} 个提交',
      pushedCount: '已推送 {n} 个提交',
      commitMessage: '提交描述',
      commitMessagePlaceholder: '留空则自动生成提交信息',
      commitOnly: '仅提交',
      commitAndPush: '提交并推送',
      retryPush: '重试推送',
      pushed: '已推送',
      branchLabel: '分支名',
      detachedBranchHint: '游离 HEAD：提交前会创建这个分支',
      detachedNeedsBranch: '游离 HEAD，请填写分支名',
      invalidBranch: '分支名不合法',
      branchExists: '同名分支已存在',
      credentialHint: 'GitHub HTTPS 推送需用 Personal Access Token；SSH 推送填私钥口令',
      credentialUser: '用户名（可选，默认 git）',
      credentialPassword: '密码/令牌',
      committed: '已提交',
      committedPushed: '已提交并推送',
      pushIncomplete: '推送未完成',
      pushReasonSep: '：',
      pushNoRemote: '未配置 git 远端',
      pushOutOfDate: '远端有新提交，请先拉取',
      pushDetached: '分离 HEAD',
      autoCommitHint: '自动生成提交信息、提交并推送到远端',
      autoCommitPending: '提交并推送…',
      nothingToCommit: '没有可提交的改动',
      commitConflicts: '存在冲突，请先解决冲突',
      commitDetached: '分离 HEAD 下无法提交',
      commitFailed: '提交失败',
      close: '关闭',
      back: '返回',
      backToList: '返回列表',
      copyDiff: '复制 diff',
      copyHash: '复制完整哈希',
      copied: '已复制',
      noDiff: '无文本差异',
      truncated: '差异过大，已截断',
      detached: '游离 HEAD',
      loading: '读取中…',
      review: '审查',
      reviewTitle: 'Git 审查',
      ahead: '领先',
      behind: '落后',
      error: '读取失败',
      switchBranch: '切换分支',
      switched: '已切换到',
      switchFailed: '切换失败',
      current: '当前',
      noBranches: '没有本地分支',
      noTarget: '未选择文件',
      commitDetail: '提交详情',
      patch: '补丁',
      files: '文件',
      reviewGuideTitle: '代码审查',
      reviewGuideDescription: '查看工作区与提交中的文件差异',
      pickFileHint: '在胶囊里点一个文件，或从提交详情里点一个文件',
      commitChip: '提交',
      graphTitle: '图谱',
      openGraph: '打开图谱',
      reviewOpened: '已在右侧栏打开审查',
      switchTo: '切换到',
      detachedHead: '游离 HEAD',
      headDetached: '游离 HEAD',
      backToBranch: '回到分支',
      detachedCheckout: '检出该提交（游离 HEAD）',
      checkoutRemote: '检出远端提交（游离 HEAD）',
      confirmDetach: '切换到该版本（游离 HEAD）',
      confirm: '确认',
      cancel: '取消',
      emptyGraph: '还没有提交',
      graphHint: '点击分支切换，点击提交查看版本',
      graphColumnGraph: '图',
      graphColumnDescription: '描述',
      graphColumnDate: '日期',
      graphColumnAuthor: '作者',
      graphColumnCommit: '提交'
    }
    var DICT_EN = {
      branch: 'Branch',
      branches: 'Branches',
      staged: 'Staged',
      unstaged: 'Unstaged',
      untracked: 'Untracked',
      conflict: 'Conflicts',
      conflicts: 'Unresolved conflicts in the working tree',
      commits: 'Recent commits',
      changes: 'changes',
      clean: 'Working tree clean',
      notRepo: 'Not a git repository',
      refresh: 'Refresh',
      autoCommit: 'Auto-commit',
      identifyingWorkspace: 'Identifying workspace',
      searchPlaceholder: 'Search commits: message / author / hash',
      clearSearch: 'Clear search',
      resultCount: '{n} results',
      noResults: 'No matching commits',
      loadMore: 'Load more',
      loadMoreFailed: 'Failed to load more',
      loadingMore: 'Loading…',
      searchFailed: 'Search failed',
      github: 'GitHub',
      githubSignIn: 'Sign in to GitHub',
      githubSignOut: 'Sign out',
      githubSignedIn: 'Signed in',
      githubPatLabel: 'Personal access token',
      githubPatHint: 'Needs a token with repo scope. The token is sent once and never stored locally.',
      githubPatSignIn: 'Sign in with token',
      githubPatRequired: 'Paste a token first',
      githubUseBrowser: 'Sign in with browser',
      githubDeviceHint: 'Open the address below in a browser and enter the code:',
      githubDeviceUnavailable: 'Browser sign-in needs an OAuth App client id: add your own or use a PAT',
      githubClientIdLabel: 'OAuth App Client ID',
      githubClientIdPlaceholder: 'Iv1.… or Ov23…',
      githubClientIdHint: 'Leave empty to use the built-in app; saving makes browser sign-in available.',
      githubClientIdCustom: 'Custom',
      githubClientIdActive: 'Custom app in use',
      githubClientIdReset: 'Reset to the built-in app',
      githubClientIdSaved: 'Saved — browser sign-in is ready',
      githubSave: 'Save',
      githubSaving: 'Saving…',
      githubUsePat: 'Use a PAT',
      githubDeviceShipped: 'Uses the built-in app (dsh-git-bar)',
      githubDeviceCode: 'Code',
      githubDeviceWaiting: 'Waiting for authorization…',
      githubDeviceOpen: 'Open verification page',
      githubDeviceExpired: 'The code expired, please try again',
      githubDeviceDenied: 'Authorization denied',
      githubDeviceMissingClientId: 'No GitHub OAuth client id configured',
      githubNewWorkspace: 'New workspace from GitHub',
      githubReposPlaceholder: 'Search repos, or type owner/repo',
      githubReposEmpty: 'No matching repositories',
      githubCloneRoot: 'Clone root',
      githubCloneRootChange: 'Change',
      githubCloneTarget: 'Will clone to',
      githubSaved: 'Saved',
      githubCloneQueued: 'Queued',
      githubCloneStarting: 'Starting',
      githubCloneCounting: 'Counting objects',
      githubCloneReceiving: 'Receiving objects',
      githubCloneResolving: 'Resolving deltas',
      githubCloneFinishing: 'Finishing',
      githubCloneDone: 'Clone complete',
      githubOpenWorkspace: 'Open workspace',
      githubCloneRetry: 'Retry',
      githubCloneFailed: 'Clone failed',
      githubRepoNotFound: 'Repository not found or not accessible',
      githubAuthFailed: 'GitHub authorization failed',
      githubReauth: 'GitHub authorization expired, sign in again',
      githubUnknownJob: 'The clone job is gone, please retry',
      githubClone: 'Clone and open',
      githubCloning: 'Cloning…',
      githubRepoRequired: 'Type owner/repo',
      githubClonePathCopied: 'Cloned — path copied',
      githubWorkspaceOpened: 'Opened the new workspace',
      githubIdentityLine: 'Committing as {login}',
      githubIdentityOff: 'Commit with the GitHub identity',
      githubPrivate: 'Private',
      githubBadCredentials: 'Invalid token or missing repo scope',
      githubNetworkError: 'Network error',
      githubLoginFailed: 'Sign-in failed: {detail}',
      githubReposFailed: 'Loading repositories failed: {detail}',
      githubCloneFailed: 'Clone failed: {detail}',
      githubNotSignedIn: 'Sign in to GitHub first',
      githubBadRepo: 'Repository must look like owner/repo',
      githubTargetExists: 'Target directory already exists',
      githubSettingsFailed: 'Saving the setting failed',
      stage: 'Stage',
      unstage: 'Unstage',
      discardChanges: 'Discard changes',
      deleteUntracked: 'Delete',
      copyPath: 'Copy path',
      copiedPath: 'Path copied',
      copyFailed: 'Copy failed',
      useOurs: 'Use ours',
      useTheirs: 'Use theirs',
      stageAll: 'Stage all',
      confirmDiscard: 'Discard changes to {path}?',
      confirmDelete: 'Delete untracked file {path}?',
      undoCommit: 'Undo last commit',
      confirmUndo: 'Undo commit {short} {subject}?',
      undone: 'Undone',
      noPreviousCommit: 'No commit to undo',
      missingPaths: 'Invalid operation arguments',
      untrackedNeedsClean: 'Use delete for untracked files',
      trackedNeedsDiscard: 'Use discard for tracked files',
      conflictedNeedsResolve: 'Resolve conflicts with ours/theirs first',
      notConflicted: 'This file has no conflict',
      missingSide: 'Missing resolve side',
      opFailed: 'Operation failed',
      justNow: 'Just now',
      pushNow: 'Push',
      nothingToPush: 'Nothing to push',
      pushOnlyHint: 'No uncommitted changes; pushing {n} commits directly',
      pushedCount: 'Pushed {n} commits',
      commitMessage: 'Commit message',
      commitMessagePlaceholder: 'Leave empty to generate the message automatically',
      commitOnly: 'Commit only',
      commitAndPush: 'Commit & push',
      retryPush: 'Retry push',
      pushed: 'Pushed',
      branchLabel: 'Branch name',
      detachedBranchHint: 'Detached HEAD: this branch is created before committing',
      detachedNeedsBranch: 'Detached HEAD, please enter a branch name',
      invalidBranch: 'Invalid branch name',
      branchExists: 'Branch already exists',
      credentialHint: 'GitHub HTTPS pushes need a Personal Access Token; SSH pushes need the private-key passphrase',
      credentialUser: 'Username (optional, defaults to git)',
      credentialPassword: 'Password / token',
      committed: 'Committed',
      committedPushed: 'Committed & pushed',
      pushIncomplete: 'Push incomplete',
      pushReasonSep: ': ',
      pushNoRemote: 'No git remote configured',
      pushOutOfDate: 'Remote has newer commits, pull first',
      pushDetached: 'Detached HEAD',
      autoCommitHint: 'Generate a commit message, commit and push to the remote',
      autoCommitPending: 'Committing & pushing…',
      nothingToCommit: 'Nothing to commit',
      commitConflicts: 'Resolve conflicts before committing',
      commitDetached: 'Cannot commit while HEAD is detached',
      commitFailed: 'Commit failed',
      close: 'Close',
      back: 'Back',
      backToList: 'Back to list',
      copyDiff: 'Copy diff',
      copyHash: 'Copy full hash',
      copied: 'Copied',
      noDiff: 'No textual diff',
      truncated: 'Diff too large, truncated',
      detached: 'Detached HEAD',
      loading: 'Loading…',
      review: 'Review',
      reviewTitle: 'Git review',
      ahead: 'Ahead',
      behind: 'Behind',
      error: 'Failed to read',
      switchBranch: 'Switch branch',
      switched: 'Switched to',
      switchFailed: 'Switch failed',
      current: 'Current',
      noBranches: 'No local branches',
      noTarget: 'No file selected',
      commitDetail: 'Commit detail',
      patch: 'Patch',
      files: 'Files',
      reviewGuideTitle: 'Code review',
      reviewGuideDescription: 'Review workspace and commit file diffs',
      pickFileHint: 'Open a file from the capsule or from a commit',
      commitChip: 'Commit',
      graphTitle: 'Graph',
      openGraph: 'Open graph',
      reviewOpened: 'Opened in the review tab',
      switchTo: 'Switch to',
      detachedHead: 'Detached HEAD',
      headDetached: 'Detached HEAD',
      backToBranch: 'Back to branch',
      detachedCheckout: 'Check out this commit (detached HEAD)',
      checkoutRemote: 'Check out the remote commit (detached HEAD)',
      confirmDetach: 'Check out this version (detached HEAD)',
      confirm: 'Confirm',
      cancel: 'Cancel',
      emptyGraph: 'No commits yet',
      graphHint: 'Click a branch to switch, a commit to check out',
      graphColumnGraph: 'Graph',
      graphColumnDescription: 'Description',
      graphColumnDate: 'Date',
      graphColumnAuthor: 'Author',
      graphColumnCommit: 'Commit'
    }
    var DICTS = { zh: DICT_ZH, en: DICT_EN }
    var FALLBACK_DICT = DICT_ZH

    // ── motion (read once at module scope, refreshed by the capsule) ──────
    var REDUCED_MOTION = false
    var reducedMotionQuery = null

    function readReducedMotion() {
      var matched = false
      try {
        if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
          var query = window.matchMedia('(prefers-reduced-motion: reduce)')
          if (query && !reducedMotionQuery) reducedMotionQuery = query
          matched = Boolean(query && query.matches === true)
        }
      } catch (error) {
        matched = false
      }
      return matched
    }

    REDUCED_MOTION = readReducedMotion()

    function motionMs(milliseconds) {
      return REDUCED_MOTION ? 0 : milliseconds
    }

    /** Classes plus the closing flag the popover renders from. */
    function stateFor(open, closing) {
      var isOpen = open === true
      var isClosing = closing === true
      var animating = isOpen && !isClosing && !REDUCED_MOTION
      return {
        open: isOpen,
        closing: isClosing,
        animating: animating,
        className: isClosing ? 'gitbar-panel-closing' : animating ? 'gitbar-panel-anim' : ''
      }
    }

    /** Re-check the reduced-motion preference for the capsule's lifetime. */
    function watchReducedMotion() {
      var query = reducedMotionQuery
      if (!query) {
        readReducedMotion()
        query = reducedMotionQuery
      }
      if (!query) return function () {}
      function onChange(event) {
        try {
          REDUCED_MOTION = event && typeof event.matches === 'boolean' ? event.matches : readReducedMotion()
        } catch (error) {
          REDUCED_MOTION = false
        }
      }
      try {
        if (typeof query.addEventListener === 'function') {
          query.addEventListener('change', onChange)
          return function () {
            try {
              query.removeEventListener('change', onChange)
            } catch (error) {
              /* ignore */
            }
          }
        }
        if (typeof query.addListener === 'function') {
          query.addListener(onChange)
          return function () {
            try {
              query.removeListener(onChange)
            } catch (error) {
              /* ignore */
            }
          }
        }
      } catch (error) {
        return function () {}
      }
      return function () {}
    }

    // ── locale plumbing (bound lazily; falls back to the zh dictionary) ───
    var rootCtx = null
    var translator = null
    var localeRegistered = false

    function localeService() {
      var locale = null
      try {
        if (rootCtx && typeof rootCtx.get === 'function') locale = rootCtx.get('locale')
      } catch (error) {
        locale = null
      }
      if (!locale) {
        try {
          locale = rootCtx && rootCtx.locale ? rootCtx.locale : null
        } catch (error) {
          locale = null
        }
      }
      return locale || null
    }

    function bindTranslator() {
      if (translator) return translator
      var locale = localeService()
      if (!locale) return null
      try {
        if (!localeRegistered && typeof locale.register === 'function') {
          localeRegistered = true
          var register = function () {
            try {
              return locale.register(NS, DICTS)
            } catch (error) {
              localeRegistered = false
              return undefined
            }
          }
          if (rootCtx && typeof rootCtx.effect === 'function') rootCtx.effect(register, 'dsh-git-bar: dictionaries')
          else register()
        }
        if (typeof locale.bind === 'function') {
          var bound = locale.bind(NS)
          if (typeof bound === 'function') translator = bound
          else if (bound && typeof bound.t === 'function') {
            translator = function (key) {
              return bound.t(key)
            }
          }
        }
      } catch (error) {
        translator = null
      }
      return translator
    }

    /** The active language tag for Intl (zh-CN / en), best effort. */
    function localeTag() {
      try {
        var service = localeService()
        if (service) {
          var direct = service.locale || service.language || service.current || service.tag || null
          if (typeof direct === 'string' && direct) return direct
          if (direct && typeof direct.locale === 'string') return direct.locale
          if (typeof service.getLocale === 'function') {
            var fetched = service.getLocale()
            if (typeof fetched === 'string' && fetched) return fetched
            if (fetched && typeof fetched.locale === 'string') return fetched.locale
          }
        }
      } catch (error) {
        /* fall through to the probe */
      }
      try {
        var probe = translate('clean')
        if (probe && probe === DICTS.zh.clean) return 'zh-CN'
        if (probe && probe === DICTS.en.clean) return 'en'
      } catch (error) {
        /* keep the default */
      }
      return 'zh-CN'
    }

    /**
     * A commit time for humans: just now / N minutes / N hours / N days ago,
     * then an absolute date after 30 days. Falls back to the git `when`.
     */
    function formatWhen(iso, when) {
      var fallback = toText(when)
      var text = toText(iso)
      if (!text) return fallback
      try {
        var parsed = Date.parse(text)
        if (isNaN(parsed)) return fallback
        var seconds = (Date.now() - parsed) / 1000
        var abs = Math.abs(seconds)
        if (abs < 60) return translate('justNow')
        var tag = localeTag()
        var relative = typeof Intl !== 'undefined' && typeof Intl.RelativeTimeFormat === 'function' ? new Intl.RelativeTimeFormat(tag, { numeric: 'always' }) : null
        if (abs < 3600) return relative ? relative.format(-Math.round(seconds / 60), 'minute') : fallback
        if (abs < 86400) return relative ? relative.format(-Math.round(seconds / 3600), 'hour') : fallback
        if (abs < 30 * 86400) return relative ? relative.format(-Math.round(seconds / 86400), 'day') : fallback
        var date = new Date(parsed)
        var dateTag = /^en/i.test(tag) ? 'en-US' : 'zh-CN'
        if (typeof Intl !== 'undefined' && typeof Intl.DateTimeFormat === 'function') {
          return new Intl.DateTimeFormat(dateTag, { year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
        }
        return fallback
      } catch (error) {
        return fallback
      }
    }

    /** Every visible string goes through here; never throws, never returns ''. */
    function translate(key) {
      var bound = translator || bindTranslator()
      if (bound) {
        try {
          var value = bound(key)
          if (typeof value === 'string' && value.length > 0) return value
        } catch (error) {
          /* fall through to the built-in dictionary */
        }
      }
      var fallback = FALLBACK_DICT[key]
      return typeof fallback === 'string' && fallback.length > 0 ? fallback : String(key)
    }

    // ── small helpers ─────────────────────────────────────────────────────
    function toNumber(value) {
      if (typeof value === 'number' && isFinite(value)) return value
      if (typeof value === 'string' && value !== '' && isFinite(Number(value))) return Number(value)
      return null
    }

    function toText(value) {
      if (typeof value === 'string') return value
      if (typeof value === 'number' && isFinite(value)) return String(value)
      return ''
    }

    /**
     * One JSON request with its own AbortController. `done` receives a plain
     * object (never throws); the returned function cancels the request.
     */
    function requestJson(url, options, done) {
      var controller = null
      var disposed = false
      try {
        if (typeof AbortController === 'function') controller = new AbortController()
      } catch (error) {
        controller = null
      }
      function finish(payload) {
        if (disposed) return
        done(payload && typeof payload === 'object' ? payload : { ok: false })
      }
      try {
        if (typeof fetch !== 'function') {
          finish({ ok: false, reason: 'no-fetch' })
          return function () {
            disposed = true
          }
        }
        var init = {
          cache: 'no-store',
          headers: { accept: 'application/json' },
          signal: controller ? controller.signal : undefined
        }
        if (options && options.method) {
          init.method = options.method
          init.headers = { 'content-type': 'application/json', accept: 'application/json' }
        }
        if (options && options.body !== undefined) init.body = options.body
        fetch(url, init)
          .then(function (response) {
            return response.json()
          })
          .then(finish)
          .catch(function () {
            finish({ ok: false })
          })
      } catch (error) {
        finish({ ok: false })
      }
      return function () {
        disposed = true
        try {
          if (controller) controller.abort()
        } catch (error) {
          /* ignore */
        }
      }
    }

    /** Read the Session id from whichever prop shape the slot really passes. */
    function sessionIdOf(props) {
      if (!props || typeof props !== 'object') return ''
      var candidates = []
      try {
        candidates.push(props.sessionId)
        candidates.push(props.session && props.session.sessionId)
        candidates.push(props.session && props.session.id)
        candidates.push(props.sessionInfo && props.sessionInfo.sessionId)
        candidates.push(props.agent && props.agent.sessionId)
        // Extra shapes the header is likely to carry; harmless when absent.
        candidates.push(props.session && props.session.header && props.session.header.id)
        candidates.push(props.agentSession && props.agentSession.id)
        candidates.push(props.conversation && props.conversation.sessionId)
      } catch (error) {
        return ''
      }
      for (var index = 0; index < candidates.length; index += 1) {
        var candidate = candidates[index]
        if (typeof candidate === 'string' && candidate.length > 0) return candidate
      }
      return ''
    }

    /** Split a repository-relative path into leaf name + dimmed parent. */
    function splitPath(path) {
      var text = toText(path)
      var cut = text.lastIndexOf('/')
      if (cut < 0) return { name: text, dir: '' }
      return { name: text.slice(cut + 1), dir: text.slice(0, cut) }
    }

    function withQuery(base, pairs) {
      var parts = []
      for (var index = 0; index < pairs.length; index += 1) {
        var pair = pairs[index]
        if (!pair || !pair.value) continue
        parts.push(encodeURIComponent(pair.key) + '=' + encodeURIComponent(pair.value))
      }
      return parts.length > 0 ? base + '?' + parts.join('&') : base
    }

    /** Nearest ancestor that would become the containing block of a fixed child. */
    function fixedContainingBlock(element) {
      try {
        if (typeof window === 'undefined' || typeof window.getComputedStyle !== 'function') return null
        var node = element && element.parentElement
        while (node && node !== document.documentElement) {
          var style = null
          try {
            style = window.getComputedStyle(node)
          } catch (error) {
            style = null
          }
          if (style) {
            var transform = style.transform
            var filter = style.filter
            var perspective = style.perspective
            var backdrop = style.backdropFilter || style.webkitBackdropFilter
            var willChange = style.willChange
            var contain = style.contain
            if ((transform && transform !== 'none') ||
              (filter && filter !== 'none') ||
              (perspective && perspective !== 'none') ||
              (backdrop && backdrop !== 'none') ||
              (willChange && /transform|filter|perspective/i.test(willChange)) ||
              (contain && /paint|layout|strict|content/i.test(contain))) {
              return node
            }
          }
          node = node.parentElement
        }
      } catch (error) {
        /* ignore — the viewport is the fallback origin */
      }
      return null
    }

    /** Anchor the popover to the pill's own rect (never to another plugin's DOM). */
    function computeAnchor(element, containingBlock, wide) {
      var viewportWidth = 1024
      var viewportHeight = 768
      try {
        if (typeof window !== 'undefined') {
          viewportWidth = toNumber(window.innerWidth) || viewportWidth
          viewportHeight = toNumber(window.innerHeight) || viewportHeight
        }
      } catch (error) {
        /* keep the defaults */
      }

      var rect = null
      try {
        rect = element && typeof element.getBoundingClientRect === 'function' ? element.getBoundingClientRect() : null
      } catch (error) {
        rect = null
      }

      var origin = { left: 0, top: 0, right: viewportWidth, bottom: viewportHeight }
      if (containingBlock) {
        try {
          var blockRect = containingBlock.getBoundingClientRect()
          if (blockRect) origin = { left: blockRect.left, top: blockRect.top, right: blockRect.right, bottom: blockRect.bottom }
        } catch (error) {
          /* keep the viewport origin */
        }
      }
      var availableWidth = Math.max(160, origin.right - origin.left)
      var availableHeight = Math.max(160, origin.bottom - origin.top)

      var width = Math.max(220, Math.min(wide === true ? GRAPH_PANEL_WIDTH : 460, availableWidth - 24))
      var top = rect ? Math.round(rect.bottom + 6 - origin.top) : 56
      var right = rect ? Math.round(origin.right - rect.right) : 12
      var maxRight = Math.round(availableWidth - 8 - width)
      if (right > maxRight) right = maxRight
      if (right < 8) right = 8
      if (top < 8) top = 8
      var maxHeight = Math.round(Math.min(560, availableHeight * 0.7, availableHeight - top - 8))
      if (maxHeight < 160) maxHeight = Math.max(120, Math.round(availableHeight - top - 8))

      return { top: top, right: right, width: width, maxHeight: maxHeight }
    }

    // ── sidebar review store (module-level; the tab body cannot see capsule state) ──
    var gitbarReviewStore = (function () {
      var target = null
      var listeners = typeof Set === 'function' ? new Set() : null
      function notify() {
        if (!listeners) return
        var snapshot = target
        listeners.forEach(function (listener) {
          try {
            listener(snapshot)
          } catch (error) {
            /* a broken listener must not break the store */
          }
        })
      }
      function get() {
        return target
      }
      function set(next) {
        target = next && typeof next === 'object' ? next : null
        notify()
      }
      function subscribe(listener) {
        if (!listeners || typeof listener !== 'function') return function () {}
        listeners.add(listener)
        return function () {
          try {
            listeners.delete(listener)
          } catch (error) {
            /* ignore */
          }
        }
      }
      return { get: get, set: set, subscribe: subscribe }
    })()

    // ── background clone store (module level: the poll survives panel close) ──
    var gitbarCloneStore = (function () {
      var job = null
      var listeners = typeof Set === 'function' ? new Set() : null
      function notify() {
        if (!listeners) return
        var snapshot = job
        listeners.forEach(function (listener) {
          try {
            listener(snapshot)
          } catch (error) {
            /* a broken listener must not break the store */
          }
        })
      }
      function get() {
        return job
      }
      function set(next) {
        job = next && typeof next === 'object' ? next : null
        notify()
      }
      function subscribe(listener) {
        if (!listeners || typeof listener !== 'function') return function () {}
        listeners.add(listener)
        return function () {
          try {
            listeners.delete(listener)
          } catch (error) {
            /* ignore */
          }
        }
      }
      return { get: get, set: set, subscribe: subscribe }
    })()

    /** owner-name, matching the Host's clone folder rule. */
    function cloneFolderName(repo) {
      var name = toText(repo).trim().replace(/^https?:\/\/github\.com\//i, '')
      if (!name) return ''
      var parts = name.split('/')
      var owner = parts[0]
      var shortName = parts.length > 1 ? parts[1] : parts[0]
      shortName = shortName.replace(/\.git$/i, '')
      if (!owner) return ''
      return owner + '-' + shortName
    }

    function cloneJoinPath(root, folder) {
      var base = toText(root).trim()
      var leaf = toText(folder).trim()
      if (!base) return leaf
      if (!leaf) return base
      var last = base.charAt(base.length - 1)
      if (last === '/' || last === '\\') return base + leaf
      return base.indexOf('\\') >= 0 ? base + '\\' + leaf : base + '/' + leaf
    }

    function cloneStageText(t, stage) {
      var safe = toText(stage)
      if (safe === 'queued') return t('githubCloneQueued')
      if (safe === 'starting') return t('githubCloneStarting')
      if (safe === 'counting objects') return t('githubCloneCounting')
      if (safe === 'receiving objects') return t('githubCloneReceiving')
      if (safe === 'resolving deltas') return t('githubCloneResolving')
      if (safe === 'finishing') return t('githubCloneFinishing')
      if (safe === 'done') return t('githubCloneDone')
      return safe || t('githubCloneStarting')
    }

    function cloneReasonText(t, reason, detail) {
      var safe = toText(reason)
      if (safe === 'not-signed-in') return t('githubNotSignedIn')
      if (safe === 'bad-repo') return t('githubBadRepo')
      if (safe === 'target-exists') return t('githubTargetExists')
      if (safe === 'not-found') return t('githubRepoNotFound')
      if (safe === 'auth-failed') return t('githubAuthFailed')
      if (safe === 'reauth-required') return t('githubReauth')
      if (safe === 'unknown-job') return t('githubUnknownJob')
      var line = githubDetailText(detail)
      return line ? t('githubCloneFailed') + '：' + line : t('githubCloneFailed')
    }

    // ── unified diff parsing ──────────────────────────────────────────────
    function stripDiffPrefix(path) {
      var text = toText(path).trim()
      if (!text) return ''
      if (text === '/dev/null') return ''
      if (text.length > 2 && (text.slice(0, 2) === 'a/' || text.slice(0, 2) === 'b/')) return text.slice(2)
      return text
    }

    /** Path of a `diff --git a/x b/x` header; the `+++` line refines it later. */
    function pathFromDiffHeader(rest) {
      var text = toText(rest)
      var match = / b\/(.+)$/.exec(text)
      if (match) return match[1]
      var plain = / a\/(.+)$/.exec(text)
      return plain ? plain[1] : ''
    }

    function parseUnifiedDiff(text) {
      var body = toText(text)
      // Git output on this profile arrives with a UTF-8 BOM and CRLF endings;
      // both would otherwise leak into the first line and every line number.
      if (body.length > 0 && body.charCodeAt(0) === 0xfeff) body = body.slice(1)
      var rows = []
      var filePaths = []
      var summary = { oldPath: '', newPath: '' }
      var oldLine = 0
      var newLine = 0
      var fileIndex = -1
      if (!body) return { rows: rows, summary: summary, filePaths: filePaths }

      var lines = body.split(/\r?\n/)
      // A trailing newline produces one empty element that is not a diff line.
      if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()

      function pushRow(row) {
        if (fileIndex >= 0) row.file = fileIndex
        rows.push(row)
      }

      for (var index = 0; index < lines.length; index += 1) {
        var line = lines[index]
        if (line.slice(0, 11) === 'diff --git ') {
          filePaths.push(pathFromDiffHeader(line.slice(11)))
          fileIndex = filePaths.length - 1
          continue
        }
        if (line.slice(0, 6) === 'index ') continue
        if (line.slice(0, 13) === 'new file mode') continue
        if (line.slice(0, 17) === 'deleted file mode') continue
        if (line.slice(0, 8) === 'old mode') continue
        if (line.slice(0, 8) === 'new mode') continue
        if (line.slice(0, 16) === 'similarity index') continue
        if (line.slice(0, 11) === 'rename from') continue
        if (line.slice(0, 9) === 'rename to') continue
        if (line.slice(0, 4) === '--- ') {
          summary.oldPath = line.slice(4)
          continue
        }
        if (line.slice(0, 4) === '+++ ') {
          summary.newPath = line.slice(4)
          if (fileIndex >= 0 && !filePaths[fileIndex]) filePaths[fileIndex] = stripDiffPrefix(line.slice(4))
          continue
        }
        if (line.slice(0, 2) === '@@') {
          var match = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line)
          if (match) {
            oldLine = toNumber(match[1]) || 0
            newLine = toNumber(match[2]) || 0
          }
          pushRow({ kind: 'hunk', text: line, oldNo: null, newNo: null })
          continue
        }
        if (line === '') {
          pushRow({ kind: 'context', text: '', oldNo: oldLine, newNo: newLine })
          oldLine += 1
          newLine += 1
          continue
        }
        var marker = line.charAt(0)
        if (marker === '+') {
          pushRow({ kind: 'add', text: line.slice(1), oldNo: null, newNo: newLine })
          newLine += 1
          continue
        }
        if (marker === '-') {
          pushRow({ kind: 'del', text: line.slice(1), oldNo: oldLine, newNo: null })
          oldLine += 1
          continue
        }
        if (marker === '\\') {
          pushRow({ kind: 'meta', text: line, oldNo: null, newNo: null })
          continue
        }
        pushRow({ kind: 'context', text: marker === ' ' ? line.slice(1) : line, oldNo: oldLine, newNo: newLine })
        oldLine += 1
        newLine += 1
      }
      return { rows: rows, summary: summary, filePaths: filePaths }
    }

    function diffSummaryText(summary, fallbackPath) {
      var oldPath = stripDiffPrefix(summary && summary.oldPath)
      var newPath = stripDiffPrefix(summary && summary.newPath)
      if (oldPath && newPath && oldPath !== newPath) return oldPath + '  →  ' + newPath
      return newPath || oldPath || toText(fallbackPath)
    }

    // ── change grouping / badges ──────────────────────────────────────────
    function letterOf(value) {
      var text = toText(value)
      return text.length > 0 ? text.charAt(0).toUpperCase() : ''
    }

    function groupFiles(state) {
      var groups = []
      var files = state && state.files && typeof state.files.length === 'number' ? state.files : []
      var buckets = { staged: [], unstaged: [], untracked: [], conflict: [] }
      for (var index = 0; index < files.length; index += 1) {
        var file = files[index]
        if (!file || typeof file !== 'object') continue
        if (typeof file.path !== 'string' || file.path.length === 0) continue
        if (file.conflicted === true) buckets.conflict.push(file)
        else if (file.untracked === true) buckets.untracked.push(file)
        else {
          if (file.staged === true) buckets.staged.push(file)
          if (file.unstaged === true) buckets.unstaged.push(file)
        }
      }
      var order = [
        { key: 'staged', title: 'staged' },
        { key: 'unstaged', title: 'unstaged' },
        { key: 'untracked', title: 'untracked' },
        { key: 'conflict', title: 'conflict' }
      ]
      for (var at = 0; at < order.length; at += 1) {
        var group = order[at]
        var list = buckets[group.key]
        if (list && list.length > 0) groups.push({ key: group.key, title: group.title, files: list })
      }
      return groups
    }

    function statusLetter(file, groupKey) {
      if (groupKey === 'untracked') return '?'
      if (groupKey === 'conflict') return '!'
      if (groupKey === 'staged') return letterOf(file.index) || letterOf(file.worktree) || 'M'
      return letterOf(file.worktree) || letterOf(file.index) || 'M'
    }

    function badgeToneClass(letter) {
      if (letter === 'A') return 'gitbar-badge-add'
      if (letter === 'D') return 'gitbar-badge-del'
      if (letter === '?') return 'gitbar-badge-new'
      if (letter === '!' || letter === 'U') return 'gitbar-badge-conflict'
      return 'gitbar-badge-mod'
    }

    function pillTitle(state, notRepo, failed) {
      var parts = []
      if (state) {
        var branch = state.detached
          ? translate('detached') + ' ' + toText(state.head)
          : toText(state.branch) || toText(state.head)
        if (branch) parts.push(branch)
        if (state.upstream) {
          var track = toText(state.upstream)
          var counters = []
          if (toNumber(state.ahead) > 0) counters.push('↑' + toNumber(state.ahead))
          if (toNumber(state.behind) > 0) counters.push('↓' + toNumber(state.behind))
          if (counters.length > 0) track += ' ' + counters.join(' ')
          parts.push(track)
        }
        var counts = state.counts || {}
        var all = toNumber(counts.all) || 0
        if (all > 0) {
          parts.push(translate('changes') + ' ' + all)
          var detail = []
          if (toNumber(counts.staged) > 0) detail.push(translate('staged') + ' ' + toNumber(counts.staged))
          if (toNumber(counts.unstaged) > 0) detail.push(translate('unstaged') + ' ' + toNumber(counts.unstaged))
          if (toNumber(counts.untracked) > 0) detail.push(translate('untracked') + ' ' + toNumber(counts.untracked))
          if (toNumber(counts.conflicted) > 0) detail.push(translate('conflict') + ' ' + toNumber(counts.conflicted))
          if (detail.length > 0) parts.push('(' + detail.join(' · ') + ')')
        } else {
          parts.push(translate('clean'))
        }
      } else if (notRepo) {
        parts.push(translate('notRepo'))
      } else if (failed) {
        parts.push(translate('error'))
      } else {
        parts.push(translate('loading'))
      }
      if (failed && state) parts.push(translate('error'))
      return parts.join(' · ')
    }

    /** Map a switch failure to the line the picker shows. */
    function switchFailureText(reason, t) {
      if (reason === 'conflicts') return t('conflicts')
      if (reason === 'not-a-repository') return t('notRepo')
      return t('switchFailed')
    }

    // ── glyphs ────────────────────────────────────────────────────────────
    function branchGlyph(size) {
      var box = size || 13
      return h(
        'svg',
        { width: box, height: box, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true', focusable: 'false' },
        h('path', { d: 'M5 4.6v6.8', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round' }),
        h('path', { d: 'M5 7.4c0 2.6 6 0.6 6 3.2', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round' }),
        h('circle', { cx: 5, cy: 3.2, r: 1.5, stroke: 'currentColor', strokeWidth: 1.3 }),
        h('circle', { cx: 5, cy: 12.6, r: 1.5, stroke: 'currentColor', strokeWidth: 1.3 }),
        h('circle', { cx: 11.2, cy: 12.6, r: 1.5, stroke: 'currentColor', strokeWidth: 1.3 })
      )
    }

    function caretGlyph(open) {
      return h(
        'span',
        { className: 'gitbar-caret' + (open ? ' gitbar-caret-open' : ''), 'aria-hidden': 'true' },
        h(
          'svg',
          { width: 10, height: 10, viewBox: '0 0 16 16', fill: 'none', focusable: 'false' },
          h('path', { d: 'M4.5 6.5l3.5 3.5 3.5-3.5', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' })
        )
      )
    }

    function refreshGlyph() {
      return h(
        'svg',
        { width: 12, height: 12, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true', focusable: 'false' },
        h('path', { d: 'M13 8a5 5 0 1 1-1.7-3.8', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round' }),
        h('path', { d: 'M13.2 2.4v2.9h-2.9', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round' })
      )
    }

    function closeGlyph() {
      return h(
        'svg',
        { width: 12, height: 12, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true', focusable: 'false' },
        h('path', { d: 'M4.2 4.2l7.6 7.6M11.8 4.2l-7.6 7.6', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round' })
      )
    }

    // ── styles (theme tokens only, class prefix gitbar-) ──────────────────
    var CSS = [
      '.gitbar-root{display:inline-flex;align-items:center;min-width:0;max-width:220px;line-height:0;vertical-align:middle}',
      '.gitbar-pill{display:inline-flex;align-items:center;gap:5px;box-sizing:border-box;height:26px;max-width:220px;min-width:0;padding:0 8px;border:1px solid var(--dsw-alias-border-l1);border-radius:13px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;font-weight:500;line-height:1;cursor:pointer;flex:0 1 auto;vertical-align:middle;transition:background-color 120ms ease}',
      '.gitbar-pill:hover{background:var(--dsw-alias-bg-layer-2)}',
      '.gitbar-pill:active{transform:scale(.99)}',
      '.gitbar-pill:focus-visible{outline:none;box-shadow:0 0 0 2px var(--dsw-alias-brand-primary)}',
      '.gitbar-pill-open{background:var(--dsw-alias-bg-layer-2)}',
      '.gitbar-glyph{display:inline-flex;flex:0 0 auto;align-items:center;color:var(--dsw-alias-label-secondary)}',
      '.gitbar-branch{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;line-height:1.2}',
      '.gitbar-branch-muted{color:var(--dsw-alias-label-secondary);font-weight:400}',
      '.gitbar-dot{width:6px;height:6px;border-radius:50%;flex:0 0 auto;background:var(--dsw-alias-state-idle-primary)}',
      '.gitbar-dot-warn{background:var(--dsw-alias-state-warn-primary)}',
      '.gitbar-dot-error{background:var(--dsw-alias-state-error-primary)}',
      '.gitbar-count{flex:0 0 auto;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;font-size:11.5px}',
      '.gitbar-count-warn{color:var(--dsw-alias-state-warn-primary)}',
      '.gitbar-count-error{color:var(--dsw-alias-state-error-primary)}',
      '.gitbar-pulse{will-change:opacity;animation:gitbar-pulse 120ms ease both}',
      '@keyframes gitbar-pulse{from{opacity:.45}to{opacity:1}}',
      '.gitbar-panel{position:fixed;box-sizing:border-box;display:flex;flex-direction:column;min-height:0;background:var(--dsw-alias-bg-overlay);border:1px solid var(--dsw-alias-border-l2);border-radius:12px;box-shadow:0 12px 32px color-mix(in srgb, var(--dsw-alias-label-primary) 20%, transparent);color:var(--dsw-alias-label-primary);font:inherit;font-size:12.5px;line-height:1.45;overflow:hidden;text-align:left;transform-origin:top right}',
      '.gitbar-panel-anim{will-change:transform,opacity;animation:gitbar-panel-in 150ms cubic-bezier(0.2,0,0,1) both}',
      '.gitbar-panel-closing{will-change:transform,opacity;animation:gitbar-panel-out 120ms cubic-bezier(0.2,0,0,1) both;pointer-events:none}',
      '@keyframes gitbar-panel-in{from{opacity:0;transform:translateY(-4px) scale(.98)}to{opacity:1;transform:translateY(0) scale(1)}}',
      '@keyframes gitbar-panel-out{from{opacity:1;transform:translateY(0) scale(1)}to{opacity:0;transform:translateY(-4px) scale(.98)}}',
      '.gitbar-panelhead{display:flex;align-items:center;gap:6px;flex:0 0 auto;padding:7px 8px;border-bottom:1px solid var(--dsw-alias-border-l1)}',
      '.gitbar-headglyph{display:inline-flex;flex:0 0 auto;align-items:center;color:var(--dsw-alias-label-secondary)}',
      '.gitbar-branchbtn{display:inline-flex;align-items:center;gap:4px;min-width:0;max-width:100%;padding:1px 4px;border:1px solid transparent;border-radius:6px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-weight:600;font-size:12.5px;cursor:pointer;transition:background-color 120ms ease,color 120ms ease}',
      '.gitbar-branchbtn:hover{background:var(--dsw-alias-bg-layer-2)}',
      '.gitbar-branchbtn:active{transform:scale(.99)}',
      '.gitbar-branchbtn:focus-visible{outline:none;box-shadow:0 0 0 2px var(--dsw-alias-brand-primary)}',
      '.gitbar-branchbtn-label{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.gitbar-caret{display:inline-flex;flex:0 0 auto;color:var(--dsw-alias-label-secondary);transition:transform 120ms ease}',
      '.gitbar-caret-open{transform:rotate(180deg)}',
      '.gitbar-headmeta{display:inline-flex;align-items:center;gap:5px;min-width:0;flex:0 1 auto;overflow:hidden;color:var(--dsw-alias-label-secondary);font-size:11px;white-space:nowrap}',
      '.gitbar-upstream{overflow:hidden;text-overflow:ellipsis;min-width:0}',
      '.gitbar-ahead{color:var(--dsw-alias-state-success-primary)}',
      '.gitbar-behind{color:var(--dsw-alias-state-warn-primary)}',
      '.gitbar-spacer{flex:1 1 auto;min-width:4px}',
      '.gitbar-btn{display:inline-flex;align-items:center;justify-content:center;gap:4px;flex:0 0 auto;height:22px;min-width:22px;padding:0 6px;border:1px solid transparent;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:11.5px;line-height:1;cursor:pointer;transition:background-color 120ms ease,color 120ms ease}',
      '.gitbar-btn:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}',
      '.gitbar-btn:active{transform:scale(.99)}',
      '.gitbar-btn:focus-visible{outline:none;box-shadow:0 0 0 2px var(--dsw-alias-brand-primary)}',
      '.gitbar-btn svg{display:block}',
      '.gitbar-flash{flex:0 0 auto;padding:5px 10px;font-size:11.5px;color:var(--dsw-alias-state-success-primary);animation:gitbar-flash-out 1600ms ease both}',
      '@keyframes gitbar-flash-out{0%{opacity:1}70%{opacity:1}100%{opacity:0}}',
      '.gitbar-chips{display:flex;flex-wrap:wrap;gap:6px;flex:0 0 auto;padding:7px 9px 0}',
      '.gitbar-chip{font-size:11px;line-height:1.5;padding:0 7px;border-radius:9px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);white-space:nowrap}',
      '.gitbar-chip-error{border-color:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-state-error-primary)}',
      '.gitbar-body{display:flex;flex-direction:column;flex:1 1 auto;min-height:0;overflow:auto;overscroll-behavior:contain}',
      '.gitbar-body-back{will-change:transform,opacity;animation:gitbar-back-in 180ms cubic-bezier(0.2,0,0,1) both}',
      '@keyframes gitbar-back-in{from{opacity:0;transform:translateX(-12px)}to{opacity:1;transform:none}}',
      '.gitbar-body-forward{will-change:transform,opacity;animation:gitbar-forward-in 180ms cubic-bezier(0.2,0,0,1) both}',
      '@keyframes gitbar-forward-in{from{opacity:0;transform:translateX(10px)}to{opacity:1;transform:none}}',
      '.gitbar-body-forward .gitbar-commit-detail{animation:none}',
      '.gitbar-list{padding:4px 5px 6px}',
      '.gitbar-group{display:flex;align-items:center;gap:6px;padding:6px 6px 3px;font-size:11px;font-weight:600;color:var(--dsw-alias-label-secondary)}',
      '.gitbar-grouptitle{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.gitbar-groupstage{flex:0 0 auto;padding:0 6px;border:1px solid var(--dsw-alias-border-l2);border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:10px;font-weight:500;line-height:15px;cursor:pointer;transition:background-color 120ms ease,color 120ms ease}',
      '.gitbar-groupstage:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}',
      '.gitbar-groupstage:focus-visible{outline:none;box-shadow:0 0 0 2px var(--dsw-alias-brand-primary)}',
      '.gitbar-groupstage:disabled{cursor:default;opacity:.55}',
      '.gitbar-row{display:flex;align-items:center;gap:7px;width:100%;box-sizing:border-box;padding:4px 6px;border:none;border-radius:8px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;text-align:left;cursor:pointer;transition:background-color 120ms ease,color 120ms ease}',
      '.gitbar-row:hover{background:var(--dsw-alias-bg-layer-2)}',
      '.gitbar-rowactions{display:inline-flex;align-items:center;gap:1px;flex:0 0 auto;opacity:0;transition:opacity 120ms ease}',
      '.gitbar-row:hover .gitbar-rowactions,.gitbar-row:focus-within .gitbar-rowactions{opacity:1}',
      '.gitbar-rowact{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;padding:0;border:none;border-radius:5px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;line-height:1;cursor:pointer;transition:background-color 120ms ease,color 120ms ease}',
      '.gitbar-rowact:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}',
      '.gitbar-rowact:focus-visible{outline:none;box-shadow:0 0 0 2px var(--dsw-alias-brand-primary)}',
      '.gitbar-rowact-danger:hover:not(:disabled){color:var(--dsw-alias-state-error-primary)}',
      '.gitbar-rowact:disabled{cursor:default;opacity:.45}',
      '.gitbar-row-busy{opacity:.7}',
      '.gitbar-file{padding-right:2px}',
      '.gitbar-row:active{transform:scale(.99)}',
      '.gitbar-row:focus-visible{outline:none;box-shadow:0 0 0 2px var(--dsw-alias-brand-primary)}',
      '.gitbar-badge{flex:0 0 auto;width:13px;text-align:center;font-family:ui-monospace,"Cascadia Code",Consolas,monospace;font-size:11px;font-weight:700;color:var(--dsw-alias-label-secondary)}',
      '.gitbar-badge-add{color:var(--dsw-alias-state-success-primary)}',
      '.gitbar-badge-del{color:var(--dsw-alias-state-error-primary)}',
      '.gitbar-badge-new{color:var(--dsw-alias-state-success-primary)}',
      '.gitbar-badge-conflict{color:var(--dsw-alias-state-error-primary)}',
      '.gitbar-badge-mod{color:var(--dsw-alias-state-warn-primary)}',
      '.gitbar-file{flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.gitbar-dir{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-secondary);font-size:11px}',
      '.gitbar-stat{flex:0 0 auto;display:inline-flex;gap:6px;margin-left:auto;padding-left:6px;font-size:11px;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-secondary)}',
      '.gitbar-addstat{color:var(--dsw-alias-state-success-primary)}',
      '.gitbar-delstat{color:var(--dsw-alias-state-error-primary)}',
      '.gitbar-empty{padding:20px 12px;text-align:center;font-size:12px;color:var(--dsw-alias-label-secondary)}',
      '.gitbar-muted{color:var(--dsw-alias-label-secondary)}',
      '.gitbar-commits{flex:0 0 auto;border-top:1px solid var(--dsw-alias-border-l1);padding:4px 5px 5px}',
      '.gitbar-commitstoggle{display:flex;align-items:center;gap:6px;width:100%;box-sizing:border-box;padding:4px 6px;border:none;border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:11px;font-weight:600;text-align:left;cursor:pointer;transition:background-color 120ms ease}',
      '.gitbar-commitstoggle:hover{background:var(--dsw-alias-bg-layer-2)}',
      '.gitbar-commitstoggle:focus-visible{outline:none;box-shadow:0 0 0 2px var(--dsw-alias-brand-primary)}',
      '.gitbar-commitstitle{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.gitbar-commitschev{flex:0 0 auto;display:inline-block;transition:transform 120ms ease}',
      '.gitbar-commitschev-open{transform:rotate(90deg)}',
      '.gitbar-commitlist{padding:2px 0 0;overflow-x:hidden}',
      '.gitbar-commits-shell{display:grid;grid-template-rows:0fr;opacity:0;visibility:hidden;overflow:hidden;transition:grid-template-rows 180ms cubic-bezier(0.2,0,0,1),opacity 180ms cubic-bezier(0.2,0,0,1),visibility 0s linear 180ms}',
      '.gitbar-commits-shell-open{grid-template-rows:1fr;opacity:1;visibility:visible;transition:grid-template-rows 180ms cubic-bezier(0.2,0,0,1),opacity 180ms cubic-bezier(0.2,0,0,1),visibility 0s}',
      '.gitbar-commits-clip{min-height:0;min-width:0;overflow:hidden}',
      '.gitbar-commit{display:flex;align-items:baseline;gap:7px;width:100%;box-sizing:border-box;padding:2px 6px;border:none;border-radius:6px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:11.5px;text-align:left;cursor:pointer;transition:background-color 120ms ease,color 120ms ease}',
      '.gitbar-commit:hover{background:var(--dsw-alias-bg-layer-2)}',
      '.gitbar-commit:active{transform:scale(.99)}',
      '.gitbar-commit:focus-visible{outline:none;box-shadow:0 0 0 2px var(--dsw-alias-brand-primary)}',
      '.gitbar-hash{flex:0 0 auto;font-family:ui-monospace,"Cascadia Code",Consolas,monospace;color:var(--dsw-alias-label-secondary)}',
      '.gitbar-subject{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.gitbar-when{flex:0 0 auto;color:var(--dsw-alias-label-secondary);font-size:11px}',
      '.gitbar-picker{display:flex;flex-direction:column;min-height:0;animation:gitbar-picker-in 140ms cubic-bezier(0.2,0,0,1) both}',
      '@keyframes gitbar-picker-in{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:none}}',
      '.gitbar-picker-head{display:flex;align-items:center;gap:6px;padding:5px 8px;border-bottom:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary);font-size:11px;font-weight:600}',
      '.gitbar-picker-title{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.gitbar-picker-rows{display:flex;flex-direction:column;padding:4px 5px 6px}',
      '.gitbar-picker-row{animation:gitbar-row-in 140ms cubic-bezier(0.2,0,0,1) both}',
      '@keyframes gitbar-row-in{from{opacity:0;transform:translateY(-2px)}to{opacity:1;transform:none}}',
      '.gitbar-branchrow{display:flex;align-items:center;gap:7px;width:100%;box-sizing:border-box;padding:5px 6px;border:none;border-radius:8px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;text-align:left;cursor:pointer;transition:background-color 120ms ease,color 120ms ease}',
      '.gitbar-branchrow:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2)}',
      '.gitbar-branchrow:active:not(:disabled){transform:scale(.99)}',
      '.gitbar-branchrow:disabled{cursor:default;opacity:.75}',
      '.gitbar-branchrow:focus-visible{outline:none;box-shadow:0 0 0 2px var(--dsw-alias-brand-primary)}',
      '.gitbar-check{flex:0 0 auto;width:12px;text-align:center;color:var(--dsw-alias-brand-primary);font-size:11px;font-weight:700}',
      '.gitbar-branchrow-main{display:flex;flex-direction:column;gap:1px;flex:1 1 auto;min-width:0}',
      '.gitbar-branchrow-name{display:flex;align-items:baseline;gap:6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.gitbar-branchrow-up{color:var(--dsw-alias-label-secondary);font-size:10.5px;overflow:hidden;text-overflow:ellipsis}',
      '.gitbar-branchrow-sub{color:var(--dsw-alias-label-secondary);font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.gitbar-branchrow-when{flex:0 0 auto;color:var(--dsw-alias-label-secondary);font-size:11px}',
      '.gitbar-busy{flex:0 0 auto;width:10px;height:10px;border-radius:50%;border:1.5px solid var(--dsw-alias-brand-primary);border-top-color:transparent;animation:gitbar-spin 700ms linear infinite}',
      '@keyframes gitbar-spin{to{transform:rotate(360deg)}}',
      '.gitbar-picker-error{display:flex;align-items:flex-start;gap:6px;margin:4px 8px 6px;padding:6px 8px;border:1px solid var(--dsw-alias-state-error-primary);border-radius:8px;color:var(--dsw-alias-state-error-primary);font-size:11.5px}',
      '.gitbar-picker-errmsg{flex:1 1 auto;min-width:0;white-space:pre-wrap}',
      '.gitbar-switch-detail{flex:1 1 auto;min-width:0;margin:0;max-height:96px;overflow:auto;font-family:ui-monospace,"Cascadia Code",Consolas,monospace;font-size:11px;color:var(--dsw-alias-label-secondary);white-space:pre-wrap}',
      '.gitbar-commit-detail{display:flex;flex-direction:column;gap:6px;padding:6px 8px 8px;min-height:0;animation:gitbar-detail-in 180ms cubic-bezier(0.2,0,0,1) both}',
      '@keyframes gitbar-detail-in{from{opacity:0;transform:translateX(12px)}to{opacity:1;transform:none}}',
      '.gitbar-commit-head{display:flex;align-items:center;gap:6px;flex-wrap:wrap}',
      '.gitbar-commit-hash{font-family:ui-monospace,"Cascadia Code",Consolas,monospace;font-size:11.5px;color:var(--dsw-alias-label-secondary)}',
      '.gitbar-commit-subject{font-weight:600;font-size:12.5px;overflow-wrap:anywhere}',
      '.gitbar-commit-meta{font-size:11px;color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere}',
      '.gitbar-commit-body{font-size:11.5px;color:var(--dsw-alias-label-secondary);white-space:pre-wrap;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere}',
      '.gitbar-files{border-top:1px solid var(--dsw-alias-border-l1);padding-top:4px;display:flex;flex-direction:column}',
      '.gitbar-files-title{font-size:11px;font-weight:600;color:var(--dsw-alias-label-secondary);padding:2px 4px}',
      '.gitbar-filelink{display:flex;align-items:center;gap:7px;width:100%;box-sizing:border-box;padding:3px 5px;border:none;border-radius:6px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:11.5px;text-align:left;cursor:pointer;transition:background-color 120ms ease,color 120ms ease}',
      '.gitbar-filelink:hover{background:var(--dsw-alias-bg-layer-2)}',
      '.gitbar-filelink:active{transform:scale(.99)}',
      '.gitbar-filelink:focus-visible{outline:none;box-shadow:0 0 0 2px var(--dsw-alias-brand-primary)}',
      '.gitbar-filelink-path{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.gitbar-review{flex:0 0 auto;min-width:0}',
      '.gitbar-reviewhead{position:sticky;top:0;left:0;z-index:2;display:flex;align-items:center;gap:6px;width:100%;box-sizing:border-box;padding:6px 8px;background:var(--dsw-alias-bg-overlay);border-bottom:1px solid var(--dsw-alias-border-l1)}',
      '.gitbar-path{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:ui-monospace,"Cascadia Code",Consolas,monospace;font-size:11.5px;color:var(--dsw-alias-label-primary)}',
      '.gitbar-diff{flex:0 0 auto;width:max-content;min-width:100%;box-sizing:border-box;background:var(--dsw-alias-bg-base)}',
      '.gitbar-diffhead{position:sticky;left:0;z-index:1;padding:4px 9px;border-bottom:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary);font-size:11px;font-family:ui-monospace,"Cascadia Code",Consolas,monospace;white-space:nowrap}',
      '.gitbar-diff-files{display:flex;flex-direction:column}',
      '.gitbar-diff-file{display:flex;flex-direction:column}',
      '.gitbar-diff-filehead{position:sticky;left:0;z-index:1;padding:4px 9px;border-bottom:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary);font-size:11px;font-family:ui-monospace,"Cascadia Code",Consolas,monospace;white-space:nowrap;background:var(--dsw-alias-bg-layer-1)}',
      '.gitbar-difflines{font-family:ui-monospace,"Cascadia Code",Consolas,monospace;font-size:12px;line-height:1.5}',
      '.gitbar-line{display:flex;align-items:flex-start;white-space:pre}',
      '.gitbar-ln{flex:0 0 auto;width:32px;padding-right:5px;text-align:right;color:var(--dsw-alias-label-secondary);opacity:.65;user-select:none;-webkit-user-select:none;font-variant-numeric:tabular-nums}',
      '.gitbar-sig{flex:0 0 auto;width:9px;text-align:center;color:var(--dsw-alias-label-secondary);user-select:none;-webkit-user-select:none}',
      '.gitbar-code{flex:0 0 auto;padding-right:14px;color:var(--dsw-alias-label-primary)}',
      '.gitbar-line-add{background:color-mix(in srgb, var(--dsw-alias-state-success-primary) 14%, transparent)}',
      '.gitbar-line-del{background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 14%, transparent)}',
      '.gitbar-line-hunk{background:var(--dsw-alias-bg-layer-2)}',
      '.gitbar-line-hunk .gitbar-code{color:var(--dsw-alias-label-secondary)}',
      '.gitbar-line-meta .gitbar-code{color:var(--dsw-alias-label-secondary);font-style:italic}',
      '.gitbar-foot{flex:0 0 auto;padding:4px 9px;border-top:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary);font-size:11px}',
      '.gitbar-sidebar{display:flex;flex-direction:column;min-height:0;height:100%;box-sizing:border-box;color:var(--dsw-alias-label-primary);font:inherit;font-size:12.5px;line-height:1.45;text-align:left}',
      '.gitbar-sidebar-body{flex:1 1 auto;min-height:0;overflow:auto;overscroll-behavior:contain}',
      '.gitbar-graph{display:flex;flex-direction:column;flex:1 1 auto;min-height:0;box-sizing:border-box;color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;line-height:1.45;text-align:left;--gitbar-lane-w:22px;--gitbar-lane-0:var(--dsw-alias-brand-primary);--gitbar-lane-1:var(--dsw-alias-state-success-primary);--gitbar-lane-2:var(--dsw-alias-state-warn-primary);--gitbar-lane-3:var(--dsw-alias-state-error-primary);--gitbar-lane-4:var(--dsw-alias-state-idle-primary);--gitbar-lane-5:#7f9fbf;--gitbar-lane-6:#b08cb8;--gitbar-lane-7:#9aa08a;animation:gitbar-graph-in 180ms cubic-bezier(0.2,0,0,1) both}',
      '@keyframes gitbar-graph-in{from{opacity:0;transform:translateX(10px)}to{opacity:1;transform:none}}',
      '.gitbar-graph-table{display:flex;flex-direction:column;flex:1 1 auto;min-height:0}',
      '.gitbar-graph-toolbar{display:flex;align-items:center;gap:6px;flex:0 0 auto;padding:6px 8px;border-bottom:1px solid var(--dsw-alias-border-l1)}',
      '.gitbar-graph-current{flex:0 0 auto;border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary);background:transparent;font-weight:600}',
      '.gitbar-graph-current-detached{border-color:var(--dsw-alias-state-warn-primary);color:var(--dsw-alias-state-warn-primary);cursor:pointer}',
      '.gitbar-graph-current-detached:hover{background:var(--dsw-alias-bg-layer-2)}',
      '.gitbar-graph-back{flex:0 0 auto;padding:1px 8px;margin-right:2px}',
      '.gitbar-graph-escape{flex:0 0 auto;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:1px 8px;border-color:var(--dsw-alias-state-warn-primary);color:var(--dsw-alias-state-warn-primary);font-weight:600}',
      '.gitbar-graph-escape:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-state-warn-primary)}',
      '.gitbar-spacer{flex:1 1 auto}',
      '.gitbar-graph-status{display:flex;align-items:flex-start;gap:6px;flex:0 0 auto;padding:5px 8px;border-bottom:1px solid var(--dsw-alias-border-l1);font-size:11px;animation:gitbar-graph-row-in 140ms ease both}',
      '.gitbar-graph-status-ok{color:var(--dsw-alias-state-success-primary);animation:gitbar-flash-out 1600ms ease both}',
      '.gitbar-graph-status-error{color:var(--dsw-alias-state-error-primary)}',
      '.gitbar-graph-status-text{flex:1 1 auto;min-width:0;white-space:pre-wrap}',
      '.gitbar-graph-status-detail{margin:2px 0 0;max-height:82px;overflow:auto;font-family:ui-monospace,"Cascadia Code",Consolas,monospace;font-size:10.5px;line-height:1.4;white-space:pre-wrap;color:var(--dsw-alias-label-secondary)}',
      '.gitbar-body-graph{overflow:hidden}',
      '.gitbar-graph-body{position:relative;flex:1 1 auto;min-height:0;overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain;scrollbar-width:thin;scrollbar-color:var(--dsw-alias-border-l2) transparent}',
      '.gitbar-graph-body:focus-visible{outline:none;box-shadow:inset 0 0 0 2px var(--dsw-alias-brand-primary)}',
      '.gitbar-graph-body::-webkit-scrollbar{width:8px;height:8px}',
      '.gitbar-graph-body::-webkit-scrollbar-track{background:transparent}',
      '.gitbar-graph-body::-webkit-scrollbar-thumb{background:var(--dsw-alias-border-l2);border-radius:4px}',
      '.gitbar-graph-body::-webkit-scrollbar-thumb:hover{background:var(--dsw-alias-label-secondary)}',
      '.gitbar-graph-canvas{position:absolute;top:0;left:8px;pointer-events:none}',
      '.gitbar-graph-rows{position:relative;z-index:1}',
      '.gitbar-graph-item{display:flex;flex-direction:column;border-bottom:1px solid var(--dsw-alias-border-l1)}',
      '.gitbar-graph-row{display:grid;grid-template-columns:var(--gitbar-lane-w) minmax(0,1fr) 68px 96px 56px;gap:8px;align-items:center;height:34px;box-sizing:border-box;padding:0 8px;margin:0;border:none;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer;animation:gitbar-graph-row-in 160ms ease both;transition:background-color 120ms ease}',
      '.gitbar-graph-row:hover{background:var(--dsw-alias-bg-layer-2)}',
      '.gitbar-graph-row:focus-visible{outline:none;box-shadow:inset 0 0 0 2px var(--dsw-alias-brand-primary)}',
      '.gitbar-graph-row-head{box-shadow:inset 2px 0 0 0 var(--dsw-alias-brand-primary)}',
      '.gitbar-graph-row-current{box-shadow:inset 3px 0 0 0 var(--dsw-alias-brand-primary);background:color-mix(in srgb, var(--dsw-alias-brand-primary) 8%, transparent)}',
      '.gitbar-graph-row-current:hover{background:color-mix(in srgb, var(--dsw-alias-brand-primary) 14%, transparent)}',
      '.gitbar-graph-now{flex:0 0 auto;margin-left:2px;padding:0 4px;border-radius:4px;background:var(--dsw-alias-brand-primary);color:var(--dsw-alias-bg-overlay);font-size:9.5px;line-height:14px;font-weight:600}',
      '.gitbar-graph-lane{display:block;height:34px}',
      '.gitbar-graph-desc{display:flex;align-items:center;gap:5px;min-width:0;overflow:hidden}',
      '.gitbar-graph-subject{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.gitbar-graph-chip{flex:0 0 auto;max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:10px;line-height:15px;padding:0 5px;border-radius:4px;border:1px solid transparent;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);cursor:pointer;font-family:inherit}',
      '.gitbar-graph-chip-head{background:var(--dsw-alias-brand-primary);color:var(--dsw-alias-bg-overlay)}',
      '.gitbar-graph-chip-current{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary);background:transparent}',
      '.gitbar-graph-chip-branch{border-color:var(--dsw-alias-border-l2);color:var(--dsw-alias-label-primary);background:transparent}',
      '.gitbar-graph-chip-remote,.gitbar-graph-chip-tag{border-color:transparent;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary)}',
      '.gitbar-graph-chip:hover{background:var(--dsw-alias-bg-layer-2)}',
      '.gitbar-graph-chip-head:hover{background:var(--dsw-alias-brand-primary);opacity:.9}',
      '.gitbar-graph-chip:focus-visible{outline:none;box-shadow:0 0 0 2px var(--dsw-alias-brand-primary)}',
      '.gitbar-graph-date{color:var(--dsw-alias-label-secondary);font-size:10.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:right}',
      '.gitbar-graph-author{color:var(--dsw-alias-label-secondary);font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.gitbar-graph-hash{color:var(--dsw-alias-label-secondary);font-family:ui-monospace,"Cascadia Code",Consolas,monospace;font-size:10.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.gitbar-graph-skeleton{display:grid;grid-template-columns:var(--gitbar-lane-w) minmax(0,1fr) 68px;gap:8px;align-items:center;height:34px;padding:0 8px;border-bottom:1px solid var(--dsw-alias-border-l1);animation:gitbar-skeleton-pulse 900ms ease-in-out infinite alternate}',
      '.gitbar-graph-skeleton span{display:block;height:8px;border-radius:4px;background:var(--dsw-alias-bg-layer-2)}',
      '@keyframes gitbar-skeleton-pulse{from{opacity:.55}to{opacity:1}}',
      '@keyframes gitbar-graph-row-in{from{opacity:0;transform:translateY(-3px)}to{opacity:1;transform:none}}',
      '.gitbar-confirm{display:flex;align-items:center;gap:6px;padding:4px 8px 6px;font-size:11px;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-1);animation:gitbar-confirm-in 140ms ease both}',
      '.gitbar-confirm-text{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '@keyframes gitbar-confirm-in{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}',
      '.gitbar-graph-empty{padding:22px 12px;text-align:center;font-size:12px;color:var(--dsw-alias-label-secondary)}',
      '@media (max-width:620px){.gitbar-graph-row{grid-template-columns:var(--gitbar-lane-w) minmax(0,1fr) 44px 56px}.gitbar-graph-author{display:none}.gitbar-graph-skeleton{grid-template-columns:var(--gitbar-lane-w) minmax(0,1fr) 44px}}',
      '.gitbar-sidebar-list{display:flex;flex-direction:column;min-height:0}',
      '.gitbar-sidebar-hint{padding:8px 10px 4px;font-size:11.5px;color:var(--dsw-alias-label-secondary);border-bottom:1px solid var(--dsw-alias-border-l1)}',
      '.gitbar-chip-commit{flex:0 0 auto;font-family:ui-monospace,"Cascadia Code",Consolas,monospace}',
      '.gitbar-graph-search{position:relative;display:flex;align-items:center;flex:0 1 200px;min-width:64px}',
      '.gitbar-graph-searchinput{width:100%;box-sizing:border-box;height:22px;padding:0 20px 0 7px;border:1px solid var(--dsw-alias-border-l1);border-radius:6px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:11.5px}',
      '.gitbar-graph-searchinput::placeholder{color:var(--dsw-alias-label-tertiary)}',
      '.gitbar-graph-searchinput:focus{outline:none;border-color:var(--dsw-alias-brand-primary)}',
      '.gitbar-graph-searchclear{position:absolute;right:2px;top:50%;transform:translateY(-50%);display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;padding:0;border:none;border-radius:4px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;line-height:1;cursor:pointer}',
      '.gitbar-graph-searchclear:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2)}',
      '.gitbar-graph-searchclear:focus-visible{outline:none;box-shadow:0 0 0 2px var(--dsw-alias-brand-primary)}',
      '.gitbar-graph-count{flex:0 0 auto;padding:5px 8px 3px;font-size:11px;color:var(--dsw-alias-label-secondary)}',
      '.gitbar-graph-results{display:flex;flex-direction:column;min-width:0}',
      '.gitbar-graph-result{display:flex;align-items:center;gap:8px;width:100%;box-sizing:border-box;padding:4px 8px;border:none;border-radius:6px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;text-align:left;cursor:pointer;transition:background-color 120ms ease}',
      '.gitbar-graph-result:hover{background:var(--dsw-alias-bg-layer-2)}',
      '.gitbar-graph-result:focus-visible{outline:none;box-shadow:0 0 0 2px var(--dsw-alias-brand-primary)}',
      '.gitbar-graph-result-hash{flex:0 0 auto;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px;color:var(--dsw-alias-label-secondary)}',
      '.gitbar-graph-result-subject{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.gitbar-graph-result-author{flex:0 1 auto;max-width:32%;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-secondary);font-size:11px}',
      '.gitbar-graph-result-when{flex:0 0 auto;color:var(--dsw-alias-label-secondary);font-size:11px}',
      '.gitbar-graph-morewrap{display:flex;justify-content:center;padding:8px 0 10px}',
      '.gitbar-graph-more{flex:0 0 auto;padding:3px 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:11.5px;cursor:pointer}',
      '.gitbar-graph-more:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}',
      '.gitbar-graph-more:focus-visible{outline:none;box-shadow:0 0 0 2px var(--dsw-alias-brand-primary)}',
      '.gitbar-graph-more:disabled{cursor:default;opacity:.6}',
      '@media (pointer: coarse){.gitbar-rowactions{opacity:1}}',
      '.gitbar-graph-commitbtn{display:inline-flex;align-items:center;justify-content:center;flex:0 0 auto;width:24px;height:24px;box-sizing:border-box;padding:0;border:1px solid var(--dsw-alias-border-l2);border-radius:7px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:14px;line-height:1;cursor:pointer;transition:background-color 120ms ease,color 120ms ease,border-color 120ms ease}',
      '.gitbar-graph-commitbtn:hover{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary)}',
      '.gitbar-graph-commitbtn:active{transform:scale(.97)}',
      '.gitbar-graph-commitbtn:focus-visible{outline:none;box-shadow:0 0 0 2px var(--dsw-alias-brand-primary)}',
      '.gitbar-graph-commiticon{display:block;transform:translateY(-1px)}',
      '.gitbar-commitpanel{position:absolute;left:0;right:0;top:0;bottom:0;z-index:2;display:flex;flex-direction:column;gap:7px;box-sizing:border-box;padding:8px 9px 9px;background:var(--dsw-alias-bg-overlay);border-radius:inherit;overflow:auto;animation:gitbar-commitpanel-in 140ms cubic-bezier(0.2,0,0,1) both}',
      '@keyframes gitbar-commitpanel-in{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}',
      '.gitbar-commitpanel-head{display:flex;align-items:center;gap:6px;flex:0 0 auto}',
      '.gitbar-commitpanel-title{flex:1 1 auto;min-width:0;font-size:12px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.gitbar-commitpanel-field{display:flex;flex-direction:column;gap:3px;min-width:0;flex:0 0 auto}',
      '.gitbar-commitpanel-label{font-size:10.5px;color:var(--dsw-alias-label-secondary);font-weight:600}',
      '.gitbar-commitpanel-input{width:100%;box-sizing:border-box;min-width:0;padding:4px 7px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:11.5px;resize:none}',
      'textarea.gitbar-commitpanel-input{min-height:44px}',
      '.gitbar-commitpanel-input:focus-visible{outline:none;border-color:var(--dsw-alias-brand-primary);box-shadow:0 0 0 2px var(--dsw-alias-brand-primary)}',
      '.gitbar-commitpanel-hint{font-size:10.5px;color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere}',
      '.gitbar-commitpanel-note{font-size:11px;color:var(--dsw-alias-state-success-primary)}',
      '.gitbar-commitpanel-status{padding:4px 7px;border-radius:7px;border:1px solid var(--dsw-alias-border-l2);font-size:11px;overflow-wrap:anywhere}',
      '.gitbar-commitpanel-status-ok{color:var(--dsw-alias-state-success-primary)}',
      '.gitbar-commitpanel-status-warn{color:var(--dsw-alias-state-warn-primary)}',
      '.gitbar-commitpanel-status-error{color:var(--dsw-alias-state-error-primary)}',
      '.gitbar-commitpanel-actions{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:auto;flex:0 0 auto}',
      '.gitbar-commitpanel-btn{flex:0 1 auto}',
      '.gitbar-commitpanel-undo{flex:0 0 auto;padding:2px 4px;border:none;border-radius:6px;background:transparent;color:var(--dsw-alias-state-error-primary);font:inherit;font-size:11px;cursor:pointer;transition:background-color 120ms ease}',
      '.gitbar-commitpanel-undo:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2)}',
      '.gitbar-commitpanel-undo:focus-visible{outline:none;box-shadow:0 0 0 2px var(--dsw-alias-brand-primary)}',
      '.gitbar-commitpanel-undo:disabled{cursor:default;opacity:.5}',
      '.gitbar-commitpanel-primary{border-color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-brand-primary);color:var(--dsw-alias-bg-overlay)}',
      '.gitbar-commitpanel-primary:hover{opacity:.92}',
      '.gitbar-github{display:flex;flex-direction:column;flex:0 0 auto;border-bottom:1px solid var(--dsw-alias-border-l1)}',
      '.gitbar-github-row{display:flex;align-items:center;gap:6px;min-width:0;padding:5px 8px}',
      '.gitbar-github-avatar{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;flex:0 0 auto;border-radius:50%;overflow:hidden;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);font-size:9px;font-weight:600}',
      '.gitbar-github-avatar img{width:100%;height:100%;object-fit:cover;display:block}',
      '.gitbar-github-name{flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;font-weight:600}',
      '.gitbar-github-meta{flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px;color:var(--dsw-alias-label-secondary)}',
      '.gitbar-github-btn{flex:0 0 auto;padding:1px 8px;font-size:11px}',
      '.gitbar-github-primary{flex:0 0 auto;padding:1px 8px;font-size:11px;border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary)}',
      '.gitbar-github-caret{flex:0 0 auto;width:18px;height:18px;padding:0;border:none;border-radius:5px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:10px;line-height:1;cursor:pointer}',
      '.gitbar-github-caret:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}',
      '.gitbar-github-panel{display:flex;flex-direction:column;gap:6px;padding:2px 8px 8px;border-top:1px solid var(--dsw-alias-border-l1);animation:gitbar-github-in 140ms cubic-bezier(0.2,0,0,1) both}',
      '.gitbar-github-tabs{display:flex;gap:4px;flex:0 0 auto;padding-top:6px}',
      '.gitbar-github-tab{flex:0 0 auto;padding:1px 7px;border:1px solid transparent;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:11px;cursor:pointer}',
      '.gitbar-github-tab:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}',
      '.gitbar-github-tab-on{border-color:var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font-weight:600}',
      '.gitbar-github-input{width:100%;box-sizing:border-box;height:24px;padding:0 7px;border:1px solid var(--dsw-alias-border-l1);border-radius:6px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:11.5px}',
      '.gitbar-github-input:focus{outline:none;border-color:var(--dsw-alias-brand-primary)}',
      '.gitbar-github-hint{font-size:10.5px;line-height:1.45;color:var(--dsw-alias-label-secondary)}',
      '.gitbar-github-actions{display:flex;align-items:center;gap:6px;flex:0 0 auto}',
      '.gitbar-github-code{display:inline-flex;align-items:center;gap:6px;flex:0 0 auto;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;font-weight:600;letter-spacing:.08em;padding:1px 8px;border:1px dashed var(--dsw-alias-border-l2);border-radius:6px;color:var(--dsw-alias-label-primary)}',
      '.gitbar-github-link{color:var(--dsw-alias-brand-primary);text-decoration:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.gitbar-github-link:hover{text-decoration:underline}',
      '.gitbar-github-repos{display:flex;flex-direction:column;max-height:132px;overflow-y:auto;overscroll-behavior:contain;border:1px solid var(--dsw-alias-border-l1);border-radius:6px}',
      '.gitbar-github-repo{display:flex;align-items:center;gap:6px;min-width:0;padding:3px 7px;border:none;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:11.5px;text-align:left;cursor:pointer}',
      '.gitbar-github-repo:hover{background:var(--dsw-alias-bg-layer-2)}',
      '.gitbar-github-repo-on{background:var(--dsw-alias-bg-layer-2)}',
      '.gitbar-github-repo-name{flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.gitbar-github-repo-desc{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:10.5px;color:var(--dsw-alias-label-secondary)}',
      '.gitbar-github-tag{flex:0 0 auto;padding:0 5px;border:1px solid var(--dsw-alias-border-l2);border-radius:5px;font-size:9.5px;color:var(--dsw-alias-label-secondary)}',
      '.gitbar-github-error{display:flex;align-items:flex-start;gap:6px;padding:4px 8px;font-size:11px;color:var(--dsw-alias-state-error-primary);border-bottom:1px solid var(--dsw-alias-border-l1);white-space:pre-wrap}',
      '.gitbar-github-empty{padding:4px 7px;font-size:11px;color:var(--dsw-alias-label-secondary)}',
      '.gitbar-github-path{display:flex;align-items:center;gap:6px;min-width:0;padding:2px 7px;font-size:10.5px;color:var(--dsw-alias-label-secondary)}',
      '.gitbar-github-path span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}',
      '.gitbar-commitpanel-identity{display:flex;align-items:center;gap:6px;padding:2px 10px 4px;font-size:11px;color:var(--dsw-alias-label-secondary)}',
      '.gitbar-commitpanel-identity input{margin:0;accent-color:var(--dsw-alias-brand-primary)}',
      '.gitbar-clone{display:flex;flex-direction:column;gap:4px;padding:2px 0 2px}',
      '.gitbar-clone-row{display:flex;align-items:center;gap:6px;min-width:0;font-size:11px}',
      '.gitbar-clone-label{flex:0 0 auto;color:var(--dsw-alias-label-secondary)}',
      '.gitbar-clone-value{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:10.5px;color:var(--dsw-alias-label-primary)}',
      '.gitbar-clone-bar{position:relative;flex:0 0 auto;width:100%;height:6px;border-radius:3px;background:var(--dsw-alias-bg-layer-2);overflow:hidden}',
      '.gitbar-clone-fill{display:block;height:100%;border-radius:3px;background:var(--dsw-alias-brand-primary);transition:width 200ms linear}',
      '.gitbar-clone-meta{flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:10.5px;color:var(--dsw-alias-label-secondary)}',
      '.gitbar-clone-done{font-size:11px;color:var(--dsw-alias-state-success-primary)}',
      '.gitbar-clone-error{font-size:11px;color:var(--dsw-alias-state-error-primary);white-space:pre-wrap}',
      '@keyframes gitbar-github-in{from{opacity:0;transform:translateY(-2px)}to{opacity:1;transform:none}}',
      '@media (prefers-reduced-motion: reduce){.gitbar-panel-anim,.gitbar-panel-closing,.gitbar-pulse,.gitbar-picker,.gitbar-picker-row,.gitbar-commit-detail,.gitbar-body-back,.gitbar-body-forward,.gitbar-commits-shell,.gitbar-commitpanel,.gitbar-graph-commitbtn,.gitbar-commitpanel-primary,.gitbar-rowactions,.gitbar-rowact,.gitbar-groupstage,.gitbar-commitpanel-undo,.gitbar-graph-result,.gitbar-graph-more,.gitbar-github-panel,.gitbar-github-repo,.gitbar-github-tab,.gitbar-github-caret,.gitbar-clone-fill,.gitbar-clone,.gitbar-flash,.gitbar-busy,.gitbar-row,.gitbar-branchrow,.gitbar-commit,.gitbar-filelink,.gitbar-pill,.gitbar-btn,.gitbar-branchbtn,.gitbar-commitstoggle,.gitbar-caret,.gitbar-commitschev,.gitbar-graph,.gitbar-graph-row,.gitbar-graph-status,.gitbar-confirm,.gitbar-graph-status-ok,.gitbar-graph-skeleton,.gitbar-graph-chip,.gitbar-graph-escape{animation:none !important;transition:none !important}}'
    ].join('')

    // ── components ────────────────────────────────────────────────────────
    var Guard = null
    if (React && typeof React.Component === 'function') {
      try {
        Guard = (function () {
          function Boundary(props) {
            React.Component.call(this, props)
            this.state = { failed: false }
          }
          Boundary.prototype = Object.create(React.Component.prototype)
          Boundary.prototype.constructor = Boundary
          Boundary.getDerivedStateFromError = function () {
            return { failed: true }
          }
          Boundary.prototype.render = function () {
            if (this.state && this.state.failed) return this.props && this.props.fallback ? this.props.fallback : null
            return this.props ? this.props.children : null
          }
          return Boundary
        })()
      } catch (error) {
        Guard = null
      }
    }

    /** Map a file-operation failure to one readable line. */
    function operationErrorText(reason, detail) {
      var safe = toText(reason)
      if (safe === 'missing-paths') return translate('missingPaths')
      if (safe === 'not-a-repository') return translate('notRepo')
      if (safe === 'untracked-needs-clean') return translate('untrackedNeedsClean')
      if (safe === 'tracked-needs-discard') return translate('trackedNeedsDiscard')
      if (safe === 'conflicted-needs-resolve') return translate('conflictedNeedsResolve')
      if (safe === 'not-conflicted') return translate('notConflicted')
      if (safe === 'missing-side') return translate('missingSide')
      if (safe === 'no-previous-commit') return translate('noPreviousCommit')
      var line = toText(detail).split('\n')[0]
      if (line.length > 120) line = line.slice(0, 120) + '…'
      return line || translate('opFailed')
    }

    // The single dismissable inline confirm strip (file rows, undo commit).
    var activeConfirmDismiss = null
    function setActiveConfirmDismiss(fn) {
      activeConfirmDismiss = typeof fn === 'function' ? fn : null
    }
    function clearActiveConfirmDismiss(fn) {
      if (activeConfirmDismiss === fn) activeConfirmDismiss = null
    }

    // While the graph search box has focus and text, Esc clears it instead of
    // closing/switching anything.
    var activeSearchEsc = null
    function setActiveSearchEsc(fn) {
      activeSearchEsc = typeof fn === 'function' ? fn : null
    }
    function clearActiveSearchEsc(fn) {
      if (activeSearchEsc === fn) activeSearchEsc = null
    }

    /** One changed-file row inside the grouped list. */
    function ChangedFileRow(props) {
      var t = props.t || translate
      var file = props.file || {}
      var group = props.group || {}
      var busy = props.busy === true
      try {
        var path = toText(file.path)
        var parts = splitPath(path)
        var letter = statusLetter(file, group.key)
        var additions = toNumber(file.additions)
        var deletions = toNumber(file.deletions)
        var hasStats = additions !== null || deletions !== null
        var title = path + (group.title ? ' · ' + t(group.title) : '')

        function action(kind, icon, label, danger) {
          return h(
            'button',
            {
              type: 'button',
              key: 'act-' + kind,
              className: 'gitbar-rowact' + (danger ? ' gitbar-rowact-danger' : ''),
              title: label,
              'aria-label': label,
              disabled: busy,
              onClick: function (event) {
                try {
                  if (event && typeof event.stopPropagation === 'function') event.stopPropagation()
                  if (typeof props.onAction === 'function') props.onAction(kind, file, group)
                } catch (error) {
                  /* ignore */
                }
              }
            },
            icon
          )
        }

        var actions = []
        if (group.key === 'conflict') {
          actions.push(action('ours', 'O', t('useOurs'), false))
          actions.push(action('theirs', 'T', t('useTheirs'), false))
        } else if (group.key === 'untracked') {
          actions.push(action('clean', '×', t('deleteUntracked'), true))
        } else if (group.key === 'staged') {
          actions.push(action('unstage', '−', t('unstage'), false))
          actions.push(action('discard', '↺', t('discardChanges'), true))
        } else {
          actions.push(action('stage', '+', t('stage'), false))
          actions.push(action('discard', '↺', t('discardChanges'), true))
        }
        actions.push(action('copy', '⧉', t('copyPath'), false))

        return h(
          'div',
          {
            className: 'gitbar-row' + (busy ? ' gitbar-row-busy' : ''),
            role: 'button',
            tabIndex: 0,
            title: title,
            'aria-busy': busy ? 'true' : 'false',
            'aria-disabled': busy ? 'true' : 'false',
            onClick: function () {
              try {
                if (busy) return
                if (typeof props.onOpen === 'function') props.onOpen(file, group.key)
              } catch (error) {
                /* a broken handler must not break the list */
              }
            },
            onKeyDown: function (event) {
              try {
                if (!event) return
                if (event.key !== 'Enter' && event.key !== ' ' && event.keyCode !== 13 && event.keyCode !== 32) return
                if (busy) return
                if (typeof event.preventDefault === 'function') event.preventDefault()
                if (typeof props.onOpen === 'function') props.onOpen(file, group.key)
              } catch (error) {
                /* ignore */
              }
            }
          },
          h('span', { className: 'gitbar-badge ' + badgeToneClass(letter), 'aria-hidden': 'true' }, letter),
          h('span', { className: 'gitbar-file' }, parts.name || path),
          parts.dir ? h('span', { className: 'gitbar-dir', title: parts.dir }, parts.dir) : null,
          hasStats
            ? h(
              'span',
              { className: 'gitbar-stat' },
              additions !== null ? h('span', { className: 'gitbar-addstat' }, '+' + additions) : null,
              deletions !== null ? h('span', { className: 'gitbar-delstat' }, '−' + deletions) : null
            )
            : null,
          h('span', { className: 'gitbar-rowactions' }, actions)
        )
      } catch (error) {
        return h('div', { className: 'gitbar-row' }, toText(file.path))
      }
    }

    /** Grouped changed files with per-row git actions and inline confirms. */
    function ChangedFileList(props) {
      var t = props.t || translate
      var groups = props.groups
      var sessionId = toText(props.sessionId)
      var opHook = useState(null)
      var op = opHook[0]
      var setOp = opHook[1]
      var confirmHook = useState(null)
      var confirm = confirmHook[0]
      var setConfirm = confirmHook[1]
      var allHook = useState(false)
      var allBusy = allHook[0]
      var setAllBusy = allHook[1]
      var alive = useRef(true)
      var abortRef = useRef(null)

      useEffect(function () {
        alive.current = true
        return function () {
          alive.current = false
          try {
            if (abortRef.current) abortRef.current()
          } catch (error) {
            /* ignore */
          }
          abortRef.current = null
        }
      }, [])

      // Esc dismisses the inline confirm before anything else.
      var dismiss = function () {
        setConfirm(null)
      }
      useEffect(function () {
        if (!confirm) return undefined
        setActiveConfirmDismiss(dismiss)
        return function () {
          clearActiveConfirmDismiss(dismiss)
        }
      }, [confirm])

      function flash(text) {
        try {
          if (typeof props.onFlash === 'function') props.onFlash(toText(text))
        } catch (error) {
          /* ignore */
        }
      }

      function copyPath(path) {
        try {
          var clipboard = typeof navigator !== 'undefined' ? navigator.clipboard : null
          if (!clipboard || typeof clipboard.writeText !== 'function') {
            flash(t('copyFailed'))
            return
          }
          var result = clipboard.writeText(path)
          if (result && typeof result.then === 'function') {
            result.then(
              function () {
                if (alive.current) flash(t('copiedPath'))
              },
              function () {
                if (alive.current) flash(t('copyFailed'))
              }
            )
          } else {
            flash(t('copiedPath'))
          }
        } catch (error) {
          flash(t('copyFailed'))
        }
      }

      function send(url, body, kind, path) {
        setOp({ kind: kind, path: path })
        try {
          if (abortRef.current) abortRef.current()
        } catch (error) {
          /* ignore */
        }
        abortRef.current = requestJson(withQuery(url, [{ key: 'session', value: sessionId }]), { method: 'POST', body: JSON.stringify(body) }, function (result) {
          if (!alive.current) return
          abortRef.current = null
          setOp(null)
          if (result && result.ok === true) {
            setConfirm(null)
            try {
              if (typeof props.onChanged === 'function') props.onChanged()
            } catch (error) {
              /* ignore */
            }
            return
          }
          flash(operationErrorText(result && result.reason, result && result.detail))
        })
      }

      function stageAll() {
        if (allBusy || op) return
        setAllBusy(true)
        setConfirm(null)
        try {
          if (abortRef.current) abortRef.current()
        } catch (error) {
          /* ignore */
        }
        abortRef.current = requestJson(withQuery(STAGE_URL, [{ key: 'session', value: sessionId }]), { method: 'POST', body: JSON.stringify({ all: true }) }, function (result) {
          if (!alive.current) return
          abortRef.current = null
          setAllBusy(false)
          if (result && result.ok === true) {
            try {
              if (typeof props.onChanged === 'function') props.onChanged()
            } catch (error) {
              /* ignore */
            }
            return
          }
          flash(operationErrorText(result && result.reason, result && result.detail))
        })
      }

      function run(kind, file, group, side) {
        var path = toText(file && file.path)
        if (!path || allBusy || op) return
        if (kind === 'stage') return send(STAGE_URL, { paths: [path] }, kind, path)
        if (kind === 'unstage') return send(UNSTAGE_URL, { paths: [path] }, kind, path)
        if (kind === 'discard') return send(DISCARD_URL, { paths: [path] }, kind, path)
        if (kind === 'clean') return send(CLEAN_URL, { paths: [path] }, kind, path)
        if (kind === 'ours' || kind === 'theirs') return send(RESOLVE_URL, { paths: [path], side: side }, kind, path)
      }

      function onAction(kind, file, group) {
        try {
          var path = toText(file && file.path)
          if (!path) return
          if (kind === 'copy') {
            copyPath(path)
            return
          }
          if (kind === 'discard' || kind === 'clean') {
            setConfirm({ kind: kind, path: path })
            return
          }
          run(kind, file, group, kind === 'ours' ? 'ours' : kind === 'theirs' ? 'theirs' : undefined)
        } catch (error) {
          /* ignore */
        }
      }

      function confirmLabel() {
        if (!confirm) return ''
        var template = confirm.kind === 'clean' ? t('confirmDelete') : t('confirmDiscard')
        return toText(template).replace('{path}', confirm.path)
      }

      function runConfirmed() {
        if (!confirm) return
        var kind = confirm.kind
        var path = confirm.path
        setConfirm(null)
        run(kind, { path: path }, {}, kind === 'clean' ? undefined : undefined)
      }

      try {
        if (!groups || groups.length === 0) return h('div', { className: 'gitbar-empty' }, t('clean'))
        var nodes = []
        for (var groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {
          var group = groups[groupIndex]
          var stageable = group.key === 'unstaged' || group.key === 'untracked' || group.key === 'conflict'
          nodes.push(
            h(
              'div',
              { className: 'gitbar-group', key: 'group-' + group.key },
              h('span', { className: 'gitbar-grouptitle' }, t(group.title)),
              stageable
                ? h(
                  'button',
                  {
                    type: 'button',
                    className: 'gitbar-groupstage',
                    title: t('stageAll'),
                    'aria-label': t('stageAll'),
                    disabled: allBusy || Boolean(op),
                    onClick: stageAll
                  },
                  t('stageAll')
                )
                : null
            )
          )
          for (var fileIndex = 0; fileIndex < group.files.length; fileIndex += 1) {
            var file = group.files[fileIndex]
            var path = toText(file && file.path)
            var rowBusy = Boolean(op && op.path === path) || allBusy
            nodes.push(
              h(ChangedFileRow, {
                key: group.key + ':' + path + ':' + fileIndex,
                t: t,
                file: file,
                group: group,
                busy: rowBusy,
                onOpen: props.onOpen,
                onAction: onAction
              })
            )
            if (confirm && confirm.path === path) {
              nodes.push(
                h(
                  'div',
                  { className: 'gitbar-confirm', key: 'confirm-' + group.key + ':' + path },
                  h('span', { className: 'gitbar-confirm-text' }, confirmLabel()),
                  h('button', { type: 'button', className: 'gitbar-btn', onClick: runConfirmed }, t('confirm')),
                  h('button', { type: 'button', className: 'gitbar-btn', onClick: dismiss }, t('cancel'))
                )
              )
            }
          }
        }
        return h('div', { className: 'gitbar-list' }, nodes)
      } catch (error) {
        return h('div', { className: 'gitbar-empty' }, t('error'))
      }
    }

    /** Recent commits, collapsed behind a disclosure button; each row opens the commit detail. */
    function CommitList(props) {
      var t = props.t || translate
      var commits = props.commits
      var open = props.open === true
      try {
        if (!commits || commits.length === 0) return null
        return h(
          'div',
          { className: 'gitbar-commits' },
          h(
            'button',
            {
              type: 'button',
              className: 'gitbar-commitstoggle',
              'aria-expanded': open ? 'true' : 'false',
              onClick: function () {
                try {
                  if (typeof props.onToggle === 'function') props.onToggle()
                } catch (error) {
                  /* ignore */
                }
              }
            },
            h('span', { className: 'gitbar-commitstitle' }, t('commits') + ' · ' + commits.length),
            h(
              'span',
              { className: 'gitbar-commitschev' + (open ? ' gitbar-commitschev-open' : ''), 'aria-hidden': 'true' },
              '›'
            )
          ),
          h(
            'div',
            {
              className: 'gitbar-commits-shell' + (open ? ' gitbar-commits-shell-open' : ''),
              'aria-hidden': open ? 'false' : 'true'
            },
            h(
              'div',
              { className: 'gitbar-commits-clip' },
              h(
                'div',
                { className: 'gitbar-commitlist' },
                commits.map(function (commit, index) {
                  var safe = commit && typeof commit === 'object' ? commit : {}
                  var subject = toText(safe.subject)
                  return h(
                    'button',
                    {
                      type: 'button',
                      className: 'gitbar-commit',
                      key: 'commit-' + toText(safe.full || safe.hash) + '-' + index,
                      title: subject,
                      tabIndex: open ? 0 : -1,
                      onClick: function () {
                        try {
                          if (typeof props.onOpen === 'function') props.onOpen(safe)
                        } catch (error) {
                          /* ignore */
                        }
                      }
                    },
                    h('span', { className: 'gitbar-hash' }, toText(safe.hash)),
                    h('span', { className: 'gitbar-subject' }, subject),
                    h('span', { className: 'gitbar-when' }, formatWhen(safe.iso, safe.when))
                  )
                })
              )
            )
          )
        )
      } catch (error) {
        return null
      }
    }

    /** The branch picker, replacing the panel body while open. */
    function BranchPicker(props) {
      var t = props.t || translate
      var sessionId = toText(props.sessionId)
      var token = toNumber(props.token) || 0
      var listingHook = useState(null)
      var listing = listingHook[0]
      var setListing = listingHook[1]
      var pendingHook = useState('')
      var pending = pendingHook[0]
      var setPending = pendingHook[1]
      var failureHook = useState(null)
      var failure = failureHook[0]
      var setFailure = failureHook[1]
      var switchAbort = useRef(null)
      var alive = useRef(true)

      useEffect(function () {
        alive.current = true
        return function () {
          alive.current = false
          try {
            if (switchAbort.current) switchAbort.current()
          } catch (error) {
            /* ignore */
          }
          switchAbort.current = null
        }
      }, [])

      useEffect(function () {
        setListing({ loading: true })
        return requestJson(withQuery(BRANCHES_URL, [{ key: 'session', value: sessionId }]), null, function (payload) {
          if (payload.ok === true && payload.branches && typeof payload.branches.length === 'number') {
            setListing({ ok: true, current: toText(payload.current), branches: payload.branches })
          } else {
            setListing({ ok: false, reason: toText(payload.reason) })
          }
        })
      }, [sessionId, token])

      function choose(branchName) {
        var name = toText(branchName)
        if (!name || pending) return
        if (listing && listing.ok === true && name === listing.current) return
        try {
          if (switchAbort.current) switchAbort.current()
        } catch (error) {
          /* ignore */
        }
        setFailure(null)
        setPending(name)
        switchAbort.current = requestJson(
          withQuery(SWITCH_URL, [{ key: 'session', value: sessionId }]),
          { method: 'POST', body: JSON.stringify({ branch: name }) },
          function (payload) {
            if (!alive.current) return
            setPending('')
            switchAbort.current = null
            if (payload.ok === true) {
              try {
                if (typeof props.onSwitched === 'function') props.onSwitched(toText(payload.branch) || name)
              } catch (error) {
                /* ignore */
              }
              return
            }
            setFailure({ reason: toText(payload.reason), detail: toText(payload.detail) })
          }
        )
      }

      try {
        var branches = listing && listing.ok === true ? listing.branches : []
        var rows = []
        for (var index = 0; index < branches.length; index += 1) {
          var branch = branches[index] && typeof branches[index] === 'object' ? branches[index] : {}
          var name = toText(branch.name)
          var isCurrent = branch.current === true || name === (listing && listing.current)
          var isPending = pending === name
          rows.push(
            h(
              'div',
              {
                className: 'gitbar-picker-row',
                key: 'branch-' + name + '-' + index,
                style: { animationDelay: Math.min(index, ROW_STAGGER_CAP) * ROW_STAGGER_MS + 'ms' }
              },
              h(
                'button',
                {
                  type: 'button',
                  className: 'gitbar-branchrow',
                  disabled: pending !== '' || isCurrent,
                  'aria-current': isCurrent ? 'true' : undefined,
                  title: name,
                  onClick: function (boundName) {
                    return function () {
                      choose(boundName)
                    }
                  }(name)
                },
                h('span', { className: 'gitbar-check', 'aria-hidden': 'true' }, isCurrent ? '✓' : ''),
                h(
                  'span',
                  { className: 'gitbar-branchrow-main' },
                  h(
                    'span',
                    { className: 'gitbar-branchrow-name' },
                    name,
                    branch.upstream ? h('span', { className: 'gitbar-branchrow-up' }, toText(branch.upstream)) : null
                  ),
                  h('span', { className: 'gitbar-branchrow-sub' }, toText(branch.subject))
                ),
                isPending ? h('span', { className: 'gitbar-busy', 'aria-hidden': 'true' }) : null,
                h('span', { className: 'gitbar-branchrow-when' }, toText(branch.when))
              )
            )
          )
        }

        var failureNode = failure
          ? h(
            'div',
            { className: 'gitbar-picker-error', role: 'alert' },
            h('span', { className: 'gitbar-picker-errmsg' }, switchFailureText(failure.reason, t)),
            failure.detail ? h('pre', { className: 'gitbar-switch-detail' }, failure.detail) : null,
            h(
              'button',
              {
                type: 'button',
                className: 'gitbar-btn',
                title: t('close'),
                'aria-label': t('close'),
                onClick: function () {
                  setFailure(null)
                }
              },
              closeGlyph()
            )
          )
          : null

        var content
        if (!listing || listing.loading === true) content = h('div', { className: 'gitbar-empty' }, t('loading'))
        else if (listing.ok !== true) content = h('div', { className: 'gitbar-empty' }, t('error'))
        else if (rows.length === 0) content = h('div', { className: 'gitbar-empty' }, t('noBranches'))
        else content = h('div', { className: 'gitbar-picker-rows' }, rows)

        return h(
          'div',
          { className: 'gitbar-picker', 'aria-busy': pending ? 'true' : 'false' },
          h(
            'div',
            { className: 'gitbar-picker-head' },
            h('span', { className: 'gitbar-picker-title' }, t('switchBranch')),
            h(
              'button',
              {
                type: 'button',
                className: 'gitbar-btn',
                title: t('backToList'),
                'aria-label': t('backToList'),
                onClick: function () {
                  try {
                    if (typeof props.onClose === 'function') props.onClose()
                  } catch (error) {
                    /* ignore */
                  }
                }
              },
              closeGlyph()
            )
          ),
          failureNode,
          content
        )
      } catch (error) {
        return h('div', { className: 'gitbar-empty' }, t('error'))
      }
    }

    /** The commit detail view: metadata, file stats, and the commit's patch. */
    function CommitDetail(props) {
      var t = props.t || translate
      var hash = toText(props.hash)
      var fallbackIso = toText(props.iso)
      var fallbackWhen = toText(props.when)
      var sessionId = toText(props.sessionId)
      var retryHook = useState(0)
      var retry = retryHook[0]
      var setRetry = retryHook[1]
      var payloadHook = useState(null)
      var payload = payloadHook[0]
      var setPayload = payloadHook[1]
      var copiedHook = useState(false)
      var copied = copiedHook[0]
      var setCopied = copiedHook[1]
      var copiedTimer = useRef(null)
      var alive = useRef(true)

      useEffect(function () {
        alive.current = true
        return function () {
          alive.current = false
          try {
            if (copiedTimer.current !== null) clearTimeout(copiedTimer.current)
          } catch (error) {
            /* ignore */
          }
          copiedTimer.current = null
        }
      }, [])

      useEffect(function () {
        setPayload({ loading: true })
        return requestJson(
          withQuery(COMMIT_URL, [{ key: 'session', value: sessionId }, { key: 'hash', value: hash }]),
          null,
          function (data) {
            if (data.ok === true && data.commit) setPayload({ ok: true, data: data })
            else setPayload({ ok: false, reason: toText(data.reason) })
          }
        )
      }, [hash, sessionId, retry])

      function copyHash() {
        try {
          var full = payload && payload.ok === true && payload.data.commit ? toText(payload.data.commit.full) : hash
          if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            var result = navigator.clipboard.writeText(full)
            if (result && typeof result.catch === 'function') result.catch(function () {})
          }
          setCopied(true)
          if (copiedTimer.current !== null) clearTimeout(copiedTimer.current)
          copiedTimer.current = setTimeout(function () {
            if (alive.current) setCopied(false)
          }, 1600)
        } catch (error) {
          /* clipboard is best-effort */
        }
      }

      /**
       * A commit file row: hand the target to the capsule, which opens the
       * Sidebar review (or the in-panel review when it is unavailable) and
       * keeps the popover open.
       */
      function pickFile(targetFile, fullHash, shortHash) {
        var file = targetFile && typeof targetFile === 'object' ? targetFile : {}
        var path = toText(file.path)
        if (!path) return
        var target = {
          mode: 'commit',
          path: path,
          hash: toText(fullHash) || hash,
          hashShort: toText(shortHash) || (toText(fullHash) || hash).slice(0, 7),
          iso: fallbackIso,
          when: fallbackWhen,
          sessionId: sessionId
        }
        try {
          if (typeof props.onHandoff === 'function') props.onHandoff(target)
        } catch (error) {
          /* ignore */
        }
      }

      function goBack() {
        try {
          if (typeof props.onBack === 'function') props.onBack()
        } catch (error) {
          /* ignore */
        }
      }

      var backButton = h(
        'button',
        { type: 'button', className: 'gitbar-btn', title: t('backToList'), onClick: goBack },
        '←' + t('backToList')
      )

      try {
        if (!payload || payload.loading === true) {
          return h('div', { className: 'gitbar-commit-detail' }, backButton, h('div', { className: 'gitbar-empty' }, t('loading')))
        }
        if (payload.ok !== true) {
          return h(
            'div',
            { className: 'gitbar-commit-detail' },
            backButton,
            h(
              'div',
              { className: 'gitbar-empty' },
              h('div', null, t('error')),
              h(
                'button',
                {
                  type: 'button',
                  className: 'gitbar-btn',
                  onClick: function () {
                    setRetry(function (value) {
                      return value + 1
                    })
                  }
                },
                t('refresh')
              )
            )
          )
        }

        var data = payload.data || {}
        var commit = data.commit && typeof data.commit === 'object' ? data.commit : {}
        var files = data.files && typeof data.files.length === 'number' ? data.files : []
        var additions = toNumber(data.additions) || 0
        var deletions = toNumber(data.deletions) || 0
        var bodyText = toText(commit.body)
        var fullHash = toText(commit.full) || hash
        var shortHash = toText(commit.hash) || fullHash.slice(0, 7)

        var fileNodes = []
        for (var index = 0; index < files.length; index += 1) {
          var file = files[index] && typeof files[index] === 'object' ? files[index] : {}
          var path = toText(file.path)
          var fileAdd = toNumber(file.additions)
          var fileDel = toNumber(file.deletions)
          fileNodes.push(
            h(
              'button',
              {
                type: 'button',
                className: 'gitbar-filelink',
                key: 'commit-file-' + path + '-' + index,
                title: path,
                onClick: function (boundFile, boundHash, boundShort) {
                  return function () {
                    pickFile(boundFile, boundHash, boundShort)
                  }
                }(file, fullHash, shortHash)
              },
              h('span', { className: 'gitbar-addstat' }, '+' + (fileAdd === null ? 0 : fileAdd)),
              h('span', { className: 'gitbar-delstat' }, '−' + (fileDel === null ? 0 : fileDel)),
              h('span', { className: 'gitbar-filelink-path' }, path)
            )
          )
        }

        return h(
          'div',
          { className: 'gitbar-commit-detail' },
          h(
            'div',
            { className: 'gitbar-commit-head' },
            backButton,
            h('span', { className: 'gitbar-commit-hash', title: toText(commit.full) }, toText(commit.hash)),
            h(
              'button',
              {
                type: 'button',
                className: 'gitbar-btn',
                title: t('copyHash'),
                'aria-label': t('copyHash'),
                onClick: copyHash
              },
              copied ? t('copied') : t('copyHash')
            )
          ),
          h('div', { className: 'gitbar-commit-subject' }, toText(commit.subject)),
          h(
            'div',
            { className: 'gitbar-commit-meta' },
            toText(commit.author) +
              (toText(commit.email) ? ' <' + toText(commit.email) + '>' : '') +
              ' · ' +
              formatWhen(commit.iso || fallbackIso, commit.when || fallbackWhen) +
              ' · +' +
              additions +
              ' −' +
              deletions
          ),
          bodyText ? h('div', { className: 'gitbar-commit-body', title: bodyText }, bodyText) : null,
          files.length > 0
            ? h('div', { className: 'gitbar-files' }, h('div', { className: 'gitbar-files-title' }, t('files') + ' · ' + files.length), fileNodes)
            : null
        )
      } catch (error) {
        return h('div', { className: 'gitbar-commit-detail' }, h('div', { className: 'gitbar-empty' }, t('error')))
      }
    }

    /** The unified diff body: per-file segments, line numbers, tints. */
    function DiffBody(props) {
      var t = props.t || translate
      var diff = props.diff

      try {
        if (!diff || diff.loading === true) return h('div', { className: 'gitbar-empty' }, t('loading'))
        if (diff.ok !== true) return h('div', { className: 'gitbar-empty' }, t('error'))
        var parsed = parseUnifiedDiff(diff.text)
        var filePaths = parsed.filePaths || []
        var rows = parsed.rows
        if (rows.length === 0) return h('div', { className: 'gitbar-empty' }, t('noDiff'))

        var capped = rows.length > MAX_DIFF_ROWS
        var visible = capped ? rows.slice(0, MAX_DIFF_ROWS) : rows

        // Group rows into per-file segments so multi-file patches get headings.
        var segments = []
        for (var index = 0; index < visible.length; index += 1) {
          var row = visible[index]
          var file = typeof row.file === 'number' ? row.file : 0
          if (segments.length === 0 || segments[segments.length - 1].file !== file) segments.push({ file: file, rows: [] })
          segments[segments.length - 1].rows.push(row)
        }

        function lineNode(lineRow, at) {
          var kind = lineRow.kind
          var lineClass = 'gitbar-line'
          if (kind === 'add') lineClass += ' gitbar-line-add'
          else if (kind === 'del') lineClass += ' gitbar-line-del'
          else if (kind === 'hunk') lineClass += ' gitbar-line-hunk'
          else if (kind === 'meta') lineClass += ' gitbar-line-meta'
          var signature = kind === 'add' ? '+' : kind === 'del' ? '-' : kind === 'hunk' || kind === 'meta' ? '' : ' '
          return h(
            'div',
            { className: lineClass, key: 'diff-' + at },
            h('span', { className: 'gitbar-ln', 'aria-hidden': 'true' }, lineRow.oldNo === null ? '' : String(lineRow.oldNo)),
            h('span', { className: 'gitbar-ln', 'aria-hidden': 'true' }, lineRow.newNo === null ? '' : String(lineRow.newNo)),
            kind === 'hunk' || kind === 'meta' ? null : h('span', { className: 'gitbar-sig', 'aria-hidden': 'true' }, signature),
            h('span', { className: 'gitbar-code' }, lineRow.text === '' ? ' ' : toText(lineRow.text))
          )
        }

        var multiFile = segments.length > 1
        var segmentNodes = []
        for (var segmentIndex = 0; segmentIndex < segments.length; segmentIndex += 1) {
          var segment = segments[segmentIndex]
          var segmentPath = filePaths[segment.file] || ''
          var segmentRows = []
          for (var rowIndex = 0; rowIndex < segment.rows.length; rowIndex += 1) {
            segmentRows.push(lineNode(segment.rows[rowIndex], rowIndex))
          }
          segmentNodes.push(
            h(
              'div',
              { className: 'gitbar-diff-file', key: 'segment-' + segmentIndex },
              multiFile && segmentPath ? h('div', { className: 'gitbar-diff-filehead' }, segmentPath) : null,
              h('div', { className: 'gitbar-difflines' }, segmentRows)
            )
          )
        }

        var summary = multiFile ? '' : diffSummaryText(parsed.summary, props.path)
        return h(
          'div',
          { className: 'gitbar-diff' },
          summary ? h('div', { className: 'gitbar-diffhead', key: 'diffhead' }, summary) : null,
          h('div', { className: 'gitbar-diff-files', key: 'files' }, segmentNodes),
          capped || diff.truncated === true ? h('div', { className: 'gitbar-foot', key: 'difffoot' }, t('truncated')) : null
        )
      } catch (error) {
        return h('div', { className: 'gitbar-empty' }, t('error'))
      }
    }

    /** In-panel diff review (the fallback path when the Sidebar is unavailable). */
    function DiffReview(props) {
      var t = props.t || translate
      var path = toText(props.path)
      var staged = props.staged === true
      var untracked = props.untracked === true
      var sessionId = toText(props.sessionId)
      var refreshToken = toNumber(props.token) || 0
      var hash = toText(props.hash)
      var hashShort = toText(props.hashShort)

      var diffHook = useState(null)
      var diff = diffHook[0]
      var setDiff = diffHook[1]
      var copiedHook = useState(false)
      var copied = copiedHook[0]
      var setCopied = copiedHook[1]
      var copiedTimer = useRef(null)
      var alive = useRef(true)

      useEffect(function () {
        alive.current = true
        return function () {
          alive.current = false
          try {
            if (copiedTimer.current !== null) clearTimeout(copiedTimer.current)
          } catch (error) {
            /* ignore */
          }
          copiedTimer.current = null
        }
      }, [])

      useEffect(function () {
        setDiff({ loading: true })
        if (!path) {
          setDiff({ ok: false })
          return function () {}
        }
        var url = hash
          ? withQuery(COMMIT_DIFF_URL, [
            { key: 'session', value: sessionId },
            { key: 'path', value: path },
            { key: 'hash', value: hash }
          ])
          : withQuery(DIFF_URL, [
            { key: 'session', value: sessionId },
            { key: 'path', value: path },
            { key: 'staged', value: staged ? '1' : '0' }
          ])
        return requestJson(url, null, function (payload) {
          if (payload.ok === true && typeof payload.diff === 'string') {
            setDiff({
              ok: true,
              text: payload.diff,
              truncated: payload.truncated === true,
              untracked: hash ? false : payload.untracked === true
            })
          } else {
            setDiff({ ok: false })
          }
        })
      }, [path, staged, sessionId, refreshToken, hash])

      function onCopy() {
        try {
          var text = diff && diff.ok === true ? toText(diff.text) : ''
          if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            var result = navigator.clipboard.writeText(text)
            if (result && typeof result.catch === 'function') result.catch(function () {})
          }
          setCopied(true)
          if (copiedTimer.current !== null) clearTimeout(copiedTimer.current)
          copiedTimer.current = setTimeout(function () {
            if (alive.current) setCopied(false)
          }, 1600)
        } catch (error) {
          /* clipboard is best-effort */
        }
      }

      function onBack() {
        try {
          if (typeof props.onBack === 'function') props.onBack()
        } catch (error) {
          /* ignore */
        }
      }

      try {
        return h(
          'div',
          { className: 'gitbar-review' },
          h(
            'div',
            { className: 'gitbar-reviewhead' },
            h(
              'button',
              {
                type: 'button',
                className: 'gitbar-btn',
                title: t('back'),
                'aria-label': t('back'),
                onClick: onBack
              },
              '←' + t('back')
            ),
            h('span', { className: 'gitbar-path', title: path }, path),
            staged ? h('span', { className: 'gitbar-chip' }, t('staged')) : null,
            untracked ? h('span', { className: 'gitbar-chip' }, t('untracked')) : null,
            hash ? h('span', { className: 'gitbar-chip', title: hash }, hashShort || hash.slice(0, 7)) : null,
            h(
              'button',
              {
                type: 'button',
                className: 'gitbar-btn',
                title: t('copyDiff'),
                'aria-label': t('copyDiff'),
                onClick: onCopy
              },
              copied ? t('copied') : t('copyDiff')
            )
          ),
          h(DiffBody, { t: t, diff: diff, path: path })
        )
      } catch (error) {
        return h('div', { className: 'gitbar-empty' }, t('error'))
      }
    }

    /** The review header shared by the Sidebar body: path, mode chips, refresh, copy. */
    function ReviewHeader(props) {
      var t = props.t || translate
      try {
        var chips = []
        if (props.mode === 'commit') {
          if (props.hashShort) {
            chips.push(
              h(
                'span',
                { className: 'gitbar-chip gitbar-chip-commit', key: 'commit', title: toText(props.hash) || props.hashShort },
                t('commitChip') + ' ' + props.hashShort
              )
            )
          }
        } else {
          if (props.staged) chips.push(h('span', { className: 'gitbar-chip', key: 'staged' }, t('staged')))
          if (props.untracked) chips.push(h('span', { className: 'gitbar-chip', key: 'untracked' }, t('untracked')))
        }
        return h(
          'div',
          { className: 'gitbar-reviewhead' },
          props.onBack
            ? h(
              'button',
              { type: 'button', className: 'gitbar-btn', title: t('backToList'), onClick: props.onBack },
              '←' + t('backToList')
            )
            : null,
          h('span', { className: 'gitbar-path', title: props.path }, props.path || t('reviewTitle')),
          props.mode === 'commit' && (toText(props.iso) || toText(props.when))
            ? h('span', { className: 'gitbar-when' }, formatWhen(props.iso, props.when))
            : null,
          chips.length > 0 ? chips : null,
          h('span', { className: 'gitbar-spacer' }),
          h(
            'button',
            {
              type: 'button',
              className: 'gitbar-btn',
              title: t('refresh'),
              'aria-label': t('refresh'),
              onClick: function () {
                try {
                  if (typeof props.onRefresh === 'function') props.onRefresh()
                } catch (error) {
                  /* ignore */
                }
              }
            },
            refreshGlyph()
          ),
          props.showCopy === false
            ? null
            : h(
              'button',
              {
                type: 'button',
                className: 'gitbar-btn',
                title: t('copyDiff'),
                'aria-label': t('copyDiff'),
                onClick: function () {
                  try {
                    if (typeof props.onCopy === 'function') props.onCopy()
                  } catch (error) {
                    /* ignore */
                  }
                }
              },
              props.copied ? t('copied') : t('copyDiff')
            )
        )
      } catch (error) {
        return h('div', { className: 'gitbar-reviewhead' }, h('span', { className: 'gitbar-path' }, t('error')))
      }
    }

    /** The guide-opened body: a hint plus the grouped working-tree changes. */
    function SidebarFileList(props) {
      var t = props.t || translate
      var state = props.state
      try {
        var hint = h('div', { className: 'gitbar-sidebar-hint' }, t('pickFileHint'))
        if (!state || state.loading === true) {
          return h('div', { className: 'gitbar-sidebar-list' }, hint, h('div', { className: 'gitbar-empty' }, t('loading')))
        }
        if (state.ok !== true) {
          return h('div', { className: 'gitbar-sidebar-list' }, hint, h('div', { className: 'gitbar-empty' }, t('error')))
        }
        var data = state.data && typeof state.data === 'object' ? state.data : {}
        if (data.ok !== true) {
          return h('div', { className: 'gitbar-sidebar-list' }, hint, h('div', { className: 'gitbar-empty' }, t('notRepo')))
        }
        return h(
          'div',
          { className: 'gitbar-sidebar-list' },
          hint,
          h(ChangedFileList, { t: t, groups: groupFiles(data), onOpen: props.onPick })
        )
      } catch (error) {
        return h('div', { className: 'gitbar-empty' }, t('error'))
      }
    }

    /** The Sidebar review tab body: driven by the module store, never animated in. */
    function SidebarReview(props) {
      var safe = props && typeof props === 'object' ? props : {}
      var t = typeof safe.t === 'function' ? safe.t : translate

      var storeHook = useState(function () {
        return gitbarReviewStore.get()
      })
      var storeTarget = storeHook[0]
      var setStoreTarget = storeHook[1]
      var selectedHook = useState(null)
      var selected = selectedHook[0]
      var setSelected = selectedHook[1]
      var listHook = useState(null)
      var listState = listHook[0]
      var setListState = listHook[1]
      var diffHook = useState(null)
      var diff = diffHook[0]
      var setDiff = diffHook[1]
      var refreshHook = useState(0)
      var refresh = refreshHook[0]
      var setRefresh = refreshHook[1]
      var copiedHook = useState(false)
      var copied = copiedHook[0]
      var setCopied = copiedHook[1]
      var copiedTimer = useRef(null)
      var alive = useRef(true)
      var sessionRef = useRef('')

      useEffect(function () {
        alive.current = true
        var unsubscribe = gitbarReviewStore.subscribe(function (next) {
          setStoreTarget(next)
        })
        setStoreTarget(gitbarReviewStore.get())
        return function () {
          alive.current = false
          try {
            unsubscribe()
          } catch (error) {
            /* ignore */
          }
          try {
            if (copiedTimer.current !== null) clearTimeout(copiedTimer.current)
          } catch (error) {
            /* ignore */
          }
          copiedTimer.current = null
        }
      }, [])

      // Prefer the slot's own navigation params when it hands them over.
      var fromProps = null
      try {
        var tabInfo = safe.tab && typeof safe.tab === 'object' ? safe.tab : null
        var navigation = tabInfo && tabInfo.navigation && typeof tabInfo.navigation === 'object' ? tabInfo.navigation : null
        if (!navigation && safe.navigation && typeof safe.navigation === 'object') navigation = safe.navigation
        if (navigation && navigation.params && typeof navigation.params === 'object') fromProps = navigation.params
      } catch (error) {
        fromProps = null
      }

      var external = fromProps || storeTarget || null
      var target = external || selected || null
      var mode = target && target.mode === 'commit' ? 'commit' : 'worktree'
      var targetPath = target ? toText(target.path) : ''
      var targetStaged = target ? target.staged === true : false
      var targetUntracked = target ? target.untracked === true : false
      var targetHash = target ? toText(target.hash) : ''
      var targetHashShort = target ? toText(target.hashShort) || targetHash.slice(0, 7) : ''
      var sessionId =
        toText(safe.sessionId) ||
        (external ? toText(external.sessionId) : '') ||
        (selected ? toText(selected.sessionId) : '') ||
        lastSidebarSessionId ||
        sessionRef.current
      if (sessionId) {
        lastSidebarSessionId = sessionId
        sessionRef.current = sessionId
      }

      var externalKey = external
        ? (external.mode === 'commit' ? 'commit' : 'worktree') + '|' + toText(external.path) + '|' + toText(external.hash)
        : ''

      // A hand-off from the capsule/commit detail wins over a local pick.
      useEffect(function () {
        if (externalKey) setSelected(null)
      }, [externalKey])

      var targetKey = target
        ? mode === 'commit'
          ? 'commit|' + targetPath + '|' + targetHash
          : 'worktree|' + targetPath + '|' + (targetStaged ? '1' : '0') + (targetUntracked ? 'u' : '')
        : ''

      // One diff request for the current target: /commit-diff for a commit target.
      useEffect(function () {
        if (!targetKey) {
          setDiff(null)
          return function () {}
        }
        setDiff({ loading: true })
        var url = mode === 'commit'
          ? withQuery(COMMIT_DIFF_URL, [
            { key: 'session', value: sessionId },
            { key: 'hash', value: targetHash },
            { key: 'path', value: targetPath }
          ])
          : withQuery(DIFF_URL, [
            { key: 'session', value: sessionId },
            { key: 'path', value: targetPath },
            { key: 'staged', value: targetStaged ? '1' : '0' }
          ])
        return requestJson(url, null, function (payload) {
          if (payload.ok === true && typeof payload.diff === 'string') {
            setDiff({ ok: true, text: payload.diff, truncated: payload.truncated === true })
          } else {
            setDiff({ ok: false })
          }
        })
      }, [targetKey, sessionId, refresh])

      // The guide-opened body lists the working tree when no hand-off is active.
      useEffect(function () {
        if (externalKey) return function () {}
        setListState({ loading: true })
        return requestJson(withQuery(STATE_URL, [{ key: 'session', value: sessionId }]), null, function (payload) {
          if (payload && typeof payload === 'object' && (payload.ok === true || payload.ok === false)) {
            setListState({ ok: true, data: payload })
          } else {
            setListState({ ok: false })
          }
        })
      }, [externalKey, sessionId, refresh])

      function refreshAll() {
        setRefresh(function (value) {
          return value + 1
        })
      }

      function onCopy() {
        try {
          var text = diff && diff.ok === true ? toText(diff.text) : ''
          if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            var result = navigator.clipboard.writeText(text)
            if (result && typeof result.catch === 'function') result.catch(function () {})
          }
          setCopied(true)
          if (copiedTimer.current !== null) clearTimeout(copiedTimer.current)
          copiedTimer.current = setTimeout(function () {
            if (alive.current) setCopied(false)
          }, 1600)
        } catch (error) {
          /* clipboard is best-effort */
        }
      }

      function pickFromList(file, groupKey) {
        try {
          var safeFile = file && typeof file === 'object' ? file : {}
          setSelected({
            mode: 'worktree',
            path: toText(safeFile.path),
            staged: groupKey === 'staged',
            untracked: groupKey === 'untracked' || safeFile.untracked === true,
            sessionId: sessionId
          })
        } catch (error) {
          /* keep the list */
        }
      }

      try {
        var header = h(ReviewHeader, {
          t: t,
          mode: mode,
          path: targetPath,
          staged: targetStaged,
          untracked: targetUntracked,
          hash: targetHash,
          hashShort: targetHashShort,
          iso: target ? toText(target.iso) : '',
          when: target ? toText(target.when) : '',
          onBack: !external && selected
            ? function () {
              setSelected(null)
            }
            : null,
          onRefresh: refreshAll,
          onCopy: onCopy,
          copied: copied,
          showCopy: !!targetPath
        })
        var body = targetPath
          ? h(DiffBody, { t: t, diff: diff, path: targetPath })
          : h(SidebarFileList, { t: t, state: listState, onPick: pickFromList })
        return h(
          'div',
          { className: 'gitbar-sidebar' },
          h('style', { key: 'gitbar-sidebar-style' }, CSS),
          header,
          h('div', { className: 'gitbar-sidebar-body' }, body)
        )
      } catch (error) {
        return h('div', { className: 'gitbar-panel' }, h('div', { className: 'gitbar-empty' }, t('error')))
      }
    }

    /** Slot wrapper that always hands the tab body a translator. */
    function SidebarReviewEntry(slotProps) {
      var merged = {}
      try {
        if (slotProps && typeof slotProps === 'object') {
          for (var key in slotProps) {
            if (Object.prototype.hasOwnProperty.call(slotProps, key)) merged[key] = slotProps[key]
          }
        }
      } catch (error) {
        merged = {}
      }
      merged.t = typeof merged.t === 'function' ? merged.t : translate
      return h(SidebarReview, merged)
    }

    // ── graph geometry: one SVG for the whole list ────────────────────────
    /** Module-level memory of the branch a detached checkout left behind. */
    var graphMemory = { previousBranch: '' }

    /** Muted lane palette: five theme-token lanes, three artwork lanes. */
    function laneColor(lane) {
      var index = toNumber(lane)
      if (index === null || index < 0) index = 0
      return 'var(--gitbar-lane-' + (index % LANE_COUNT) + ')'
    }

    /** full hash -> row index, for edge lookups. */
    function graphIndex(commits) {
      var map = {}
      for (var index = 0; index < commits.length; index += 1) {
        var commit = commits[index]
        if (commit && typeof commit.full === 'string') map[commit.full] = index
      }
      return map
    }

    /**
     * One geometry pass for the whole list: a cubic per visible parent edge, a
     * downward stub for parents outside the window, and the in-flight vertical
     * threads that keep every lane continuous between rows.
     */
    function graphGeometry(commits) {
      var rows = commits.length
      var height = rows * GRAPH_ROW_HEIGHT
      var index = graphIndex(commits)
      var edges = []
      var stubs = []
      var threads = []
      for (var band = 0; band < rows; band += 1) threads.push(typeof Set === 'function' ? new Set() : null)

      function dotOf(commit, row) {
        var lane = toNumber(commit && commit.lane)
        if (lane === null || lane < 0) lane = 0
        return { x: lane * GRAPH_LANE_WIDTH + GRAPH_LANE_WIDTH / 2, y: row * GRAPH_ROW_HEIGHT + GRAPH_DOT_Y, lane: lane }
      }

      for (var at = 0; at < rows; at += 1) {
        var commit = commits[at]
        if (!commit) continue
        var from = dotOf(commit, at)
        var parents = commit.parents && typeof commit.parents.length === 'number' ? commit.parents : []
        for (var parentAt = 0; parentAt < parents.length; parentAt += 1) {
          var to = index[parents[parentAt]]
          if (typeof to !== 'number' || to === at) {
            stubs.push({ x: from.x, y1: from.y, y2: Math.min(height, from.y + GRAPH_ROW_HEIGHT), lane: from.lane })
            continue
          }
          var target = dotOf(commits[to], to)
          edges.push({ x1: from.x, y1: from.y, x2: target.x, y2: target.y, lane: from.lane })
          // The parent's lane stays in flight across every band until its row.
          for (var through = at; through < to; through += 1) {
            if (threads[through] && typeof threads[through].add === 'function') threads[through].add(target.lane)
          }
        }
      }

      var lines = []
      for (var bandAt = 0; bandAt < rows - 1; bandAt += 1) {
        var set = threads[bandAt]
        if (!set || typeof set.forEach !== 'function') continue
        set.forEach(function (lane) {
          lines.push({
            x: lane * GRAPH_LANE_WIDTH + GRAPH_LANE_WIDTH / 2,
            y1: bandAt * GRAPH_ROW_HEIGHT + GRAPH_DOT_Y,
            y2: (bandAt + 1) * GRAPH_ROW_HEIGHT + GRAPH_DOT_Y,
            lane: lane
          })
        })
      }
      return { edges: edges, stubs: stubs, lines: lines, rows: rows, height: height }
    }

    function edgePath(edge) {
      var span = edge.y2 - edge.y1
      return 'M ' + edge.x1 + ' ' + edge.y1 +
        ' C ' + edge.x1 + ' ' + (edge.y1 + span * 0.45) +
        ', ' + edge.x2 + ' ' + (edge.y2 - span * 0.45) +
        ', ' + edge.x2 + ' ' + edge.y2
    }

    /** The whole lane picture: threads, edges, stubs, then dotted commits. */
    function GraphCanvas(props) {
      try {
        var commits = props.commits || []
        var geometry = props.geometry
        var columns = Math.max(1, Math.min(LANE_COUNT, toNumber(props.columns) || 1))
        var width = columns * GRAPH_LANE_WIDTH
        var nodes = []
        for (var lineAt = 0; lineAt < geometry.lines.length; lineAt += 1) {
          var line = geometry.lines[lineAt]
          nodes.push(
            h('line', {
              key: 'thread-' + lineAt,
              x1: line.x,
              y1: line.y1,
              x2: line.x,
              y2: line.y2,
              stroke: laneColor(line.lane),
              strokeWidth: 1.5,
              strokeLinecap: 'round'
            })
          )
        }
        for (var edgeAt = 0; edgeAt < geometry.edges.length; edgeAt += 1) {
          var edge = geometry.edges[edgeAt]
          nodes.push(
            h('path', {
              key: 'edge-' + edgeAt,
              d: edgePath(edge),
              stroke: laneColor(edge.lane),
              strokeWidth: 1.5,
              fill: 'none',
              strokeLinecap: 'round'
            })
          )
        }
        for (var stubAt = 0; stubAt < geometry.stubs.length; stubAt += 1) {
          var stub = geometry.stubs[stubAt]
          nodes.push(
            h('line', {
              key: 'stub-' + stubAt,
              x1: stub.x,
              y1: stub.y1,
              x2: stub.x,
              y2: stub.y2,
              stroke: laneColor(stub.lane),
              strokeWidth: 1.5,
              strokeLinecap: 'round'
            })
          )
        }
        for (var commitAt = 0; commitAt < commits.length; commitAt += 1) {
          var commit = commits[commitAt] || {}
          var lane = toNumber(commit.lane)
          if (lane === null || lane < 0) lane = 0
          nodes.push(
            h('circle', {
              key: 'dot-' + commitAt,
              cx: lane * GRAPH_LANE_WIDTH + GRAPH_LANE_WIDTH / 2,
              cy: commitAt * GRAPH_ROW_HEIGHT + GRAPH_DOT_Y,
              r: GRAPH_DOT_R,
              fill: laneColor(lane),
              stroke: 'var(--dsw-alias-bg-overlay)',
              strokeWidth: 1.5
            })
          )
        }
        return h(
          'svg',
          {
            className: 'gitbar-graph-canvas',
            width: width,
            height: geometry.height,
            viewBox: '0 0 ' + width + ' ' + geometry.height,
            'aria-hidden': 'true',
            focusable: 'false'
          },
          nodes
        )
      } catch (error) {
        return null
      }
    }

    /** The graph table: toolbar (current ref, escape, refresh), status, rows, confirms. */
    function GraphTable(props) {
      var t = props.t || translate
      var payload = props.payload
      var data = payload && payload.ok === true && payload.data && typeof payload.data === 'object' ? payload.data : null
      var commits = data && data.commits && typeof data.commits.length === 'number' ? data.commits : []
      var columns = Math.max(1, Math.min(LANE_COUNT, toNumber(props.columns) || 1))
      var current = data ? toText(data.current) : ''
      var detached = Boolean(data && data.detached)
      var head = data ? toText(data.head) : ''
      var headFull = data ? toText(data.headFull) : ''
      var geometry = graphGeometry(commits)
      var status = props.status
      var confirmRow = toText(props.confirmRow)
      var confirmKind = toText(props.confirmKind)

      // Keep the scroller keyboard-navigable: PageUp/PageDown/Home/End only.
      function onBodyKeyDown(event) {
        try {
          if (!event) return
          var target = event.target
          if (target && typeof target.closest === 'function' && target.closest('button,input,select,textarea,a')) return
          var node = props.listRef && props.listRef.current
          if (!node || typeof node.scrollTop !== 'number') return
          var key = event.key
          var code = event.keyCode
          var page = GRAPH_ROW_HEIGHT * GRAPH_PAGE_ROWS
          var top = toNumber(node.scrollTop) || 0
          if (key === 'PageDown' || code === 34) node.scrollTop = top + page
          else if (key === 'PageUp' || code === 33) node.scrollTop = Math.max(0, top - page)
          else if (key === 'Home' || code === 36) node.scrollTop = 0
          else if (key === 'End' || code === 35) node.scrollTop = toNumber(node.scrollHeight) || 0
          else return
          if (typeof event.preventDefault === 'function') event.preventDefault()
        } catch (error) {
          /* ignore */
        }
      }

      function scroller(children) {
        return h(
          'div',
          { className: 'gitbar-graph-body', ref: props.listRef, tabIndex: 0, onKeyDown: onBodyKeyDown },
          children
        )
      }

      // A long history opens at HEAD instead of at the top of the list.
      useEffect(function () {
        if (props.autoScroll !== true) return
        var effectHeadFull = props.payload && props.payload.ok === true && props.payload.data && typeof props.payload.data === 'object' ? toText(props.payload.data.headFull) : ''
        var node = props.listRef && props.listRef.current
        if (!node || typeof node.scrollTop !== 'number') return
        var headIndex = -1
        for (var at = 0; at < commits.length; at += 1) {
          var commit = commits[at] && typeof commits[at] === 'object' ? commits[at] : {}
          var refs = commit.refs && typeof commit.refs.length === 'number' ? commit.refs : []
          var rowIsHead = commit.isHead === true || (effectHeadFull !== '' && toText(commit.full) === effectHeadFull)
          for (var refAt = 0; !rowIsHead && refAt < refs.length; refAt += 1) {
            if (refs[refAt] && refs[refAt].kind === 'head') rowIsHead = true
          }
          if (rowIsHead) {
            headIndex = at
            break
          }
        }
        try {
          node.scrollTop = headIndex > 0 ? Math.max(0, headIndex * GRAPH_ROW_HEIGHT - GRAPH_ROW_HEIGHT) : 0
        } catch (error) {
          /* ignore */
        }
      }, [props.payload, props.autoScroll])

      try {
        var currentChip = !data
          ? h('span', { className: 'gitbar-chip gitbar-graph-current' }, t('loading'))
          : detached
            ? h(
              'button',
              {
                type: 'button',
                className: 'gitbar-chip gitbar-graph-current gitbar-graph-current-detached',
                title: t('headDetached') + ' ' + head,
                onClick: function () {
                  try {
                    if (typeof props.onOpenPicker === 'function') props.onOpenPicker()
                  } catch (error) {
                    /* ignore */
                  }
                }
              },
              t('headDetached') + ' ' + head
            )
            : h(
              'span',
              { className: 'gitbar-chip gitbar-graph-current', title: current },
              current || t('headDetached')
            )

        var searchNode = h(
          'div',
          { className: 'gitbar-graph-search' },
          h('input', {
            type: 'text',
            className: 'gitbar-graph-searchinput',
            value: toText(props.query),
            placeholder: t('searchPlaceholder'),
            'aria-label': t('searchPlaceholder'),
            autoComplete: 'off',
            spellCheck: false,
            onChange: function (event) {
              try {
                if (typeof props.onQueryChange === 'function') props.onQueryChange(event && event.target ? event.target.value : '')
              } catch (error) {
                /* ignore */
              }
            }
          }),
          toText(props.query)
            ? h(
              'button',
              {
                type: 'button',
                className: 'gitbar-graph-searchclear',
                title: t('clearSearch'),
                'aria-label': t('clearSearch'),
                onClick: function () {
                  try {
                    if (typeof props.onClearQuery === 'function') props.onClearQuery()
                  } catch (error) {
                    /* ignore */
                  }
                }
              },
              '×'
            )
            : null
        )

        var toolbar = h(
          'div',
          { className: 'gitbar-graph-toolbar' },
          h(
            'button',
            {
              type: 'button',
              className: 'gitbar-btn gitbar-graph-back',
              title: t('backToList'),
              'aria-label': t('backToList'),
              onClick: function () {
                try {
                  if (typeof props.onBack === 'function') props.onBack()
                } catch (error) {
                  /* ignore */
                }
              }
            },
            '←' + t('backToList')
          ),
          currentChip,
          detached && props.escapeTarget
            ? h(
              'button',
              {
                type: 'button',
                className: 'gitbar-btn gitbar-graph-escape',
                title: t('backToBranch') + ' ' + props.escapeTarget,
                onClick: function () {
                  try {
                    if (typeof props.onEscape === 'function') props.onEscape(props.escapeTarget)
                  } catch (error) {
                    /* ignore */
                  }
                }
              },
              '← ' + t('backToBranch') + ' ' + props.escapeTarget
            )
            : null,
          searchNode,
          h('span', { className: 'gitbar-spacer' }),
          h(
            'button',
            {
              type: 'button',
              className: 'gitbar-graph-commitbtn',
              title: t('autoCommit'),
              'aria-label': t('autoCommit'),
              onClick: function () {
                try {
                  if (typeof props.onCommit === 'function') props.onCommit()
                } catch (error) {
                  /* ignore */
                }
              }
            },
            h('span', { className: 'gitbar-graph-commiticon', 'aria-hidden': 'true' }, '↑')
          ),
          h(
            'button',
            {
              type: 'button',
              className: 'gitbar-btn',
              title: t('refresh'),
              'aria-label': t('refresh'),
              onClick: function () {
                try {
                  if (typeof props.onRefresh === 'function') props.onRefresh()
                } catch (error) {
                  /* ignore */
                }
              }
            },
            refreshGlyph()
          )
        )

        var statusNode = status && typeof status === 'object'
          ? h(
            'div',
            {
              className: 'gitbar-graph-status ' + (status.kind === 'ok' ? 'gitbar-graph-status-ok' : 'gitbar-graph-status-error'),
              role: 'status'
            },
            h(
              'div',
              { className: 'gitbar-graph-status-text' },
              h('div', null, toText(status.text)),
              status.detail ? h('pre', { className: 'gitbar-graph-status-detail' }, toText(status.detail)) : null
            ),
            status.kind === 'ok'
              ? null
              : h(
                'button',
                {
                  type: 'button',
                  className: 'gitbar-btn',
                  title: t('close'),
                  'aria-label': t('close'),
                  onClick: function () {
                    try {
                      if (typeof props.onDismissStatus === 'function') props.onDismissStatus()
                    } catch (error) {
                      /* ignore */
                    }
                  }
                },
                closeGlyph()
              )
          )
          : null

        var moreButton = props.hasMore === true
          ? h(
            'div',
            { className: 'gitbar-graph-morewrap' },
            h(
              'button',
              {
                type: 'button',
                className: 'gitbar-graph-more',
                disabled: props.loadingMore === true,
                'aria-busy': props.loadingMore === true ? 'true' : 'false',
                onClick: function () {
                  try {
                    if (typeof props.onLoadMore === 'function') props.onLoadMore()
                  } catch (error) {
                    /* ignore */
                  }
                }
              },
              props.loadingMore === true ? t('loadingMore') : t('loadMore')
            )
          )
          : null

        function openResult(commit) {
          try {
            if (typeof props.onOpenCommit === 'function') props.onOpenCommit(commit)
          } catch (error) {
            /* ignore */
          }
        }

        var body
        if (!payload || payload.loading === true) {
          var skeletons = []
          for (var skeleton = 0; skeleton < 3; skeleton += 1) {
            skeletons.push(
              h('div', { className: 'gitbar-graph-skeleton', key: 'skeleton-' + skeleton }, h('span', null), h('span', null), h('span', null))
            )
          }
          body = scroller([h('div', { className: 'gitbar-graph-empty', key: 'loading' }, t('loading'))].concat(skeletons))
        } else if (!data) {
          body = scroller(
            h(
              'div',
              { className: 'gitbar-graph-empty' },
              h('div', null, payload.reason === 'not-a-repository' ? t('notRepo') : t('error')),
              h(
                'button',
                {
                  type: 'button',
                  className: 'gitbar-btn',
                  onClick: function () {
                    try {
                      if (typeof props.onRetry === 'function') props.onRetry()
                    } catch (error) {
                      /* ignore */
                    }
                  }
                },
                t('refresh')
              )
            )
          )
        } else if (data.filtered === true) {
          var resultTotal = toNumber(props.total)
          if (resultTotal === null) resultTotal = commits.length
          var resultNodes = []
          for (var resultAt = 0; resultAt < commits.length; resultAt += 1) {
            var resultCommit = commits[resultAt] && typeof commits[resultAt] === 'object' ? commits[resultAt] : {}
            resultNodes.push(
              h(
                'div',
                {
                  className: 'gitbar-graph-result',
                  role: 'button',
                  tabIndex: 0,
                  key: 'result-' + (toText(resultCommit.full) || resultAt),
                  title: toText(resultCommit.subject),
                  onClick: function (boundCommit) {
                    return function () {
                      openResult(boundCommit)
                    }
                  }(resultCommit),
                  onKeyDown: function (boundCommit) {
                    return function (event) {
                      try {
                        if (!event) return
                        if (event.key !== 'Enter' && event.key !== ' ' && event.keyCode !== 13 && event.keyCode !== 32) return
                        if (typeof event.preventDefault === 'function') event.preventDefault()
                        openResult(boundCommit)
                      } catch (error) {
                        /* ignore */
                      }
                    }
                  }(resultCommit)
                },
                h('span', { className: 'gitbar-graph-result-hash', title: toText(resultCommit.full) }, toText(resultCommit.hash)),
                h('span', { className: 'gitbar-graph-result-subject' }, toText(resultCommit.subject)),
                h('span', { className: 'gitbar-graph-result-author', title: toText(resultCommit.author) }, toText(resultCommit.author)),
                h('span', { className: 'gitbar-graph-result-when' }, formatWhen(resultCommit.iso, resultCommit.when))
              )
            )
          }
          body = scroller([
            h('div', { className: 'gitbar-graph-count', key: 'count' }, toText(t('resultCount')).replace('{n}', String(resultTotal))),
            commits.length === 0
              ? h('div', { className: 'gitbar-graph-empty', key: 'noresults' }, t('noResults'))
              : h('div', { className: 'gitbar-graph-results', key: 'results' }, resultNodes),
            moreButton
          ])
        } else if (data.empty === true || commits.length === 0) {
          body = scroller(h('div', { className: 'gitbar-graph-empty' }, t('emptyGraph')))
        } else {
          var items = []
          for (var at = 0; at < commits.length; at += 1) {
            var commit = commits[at] && typeof commits[at] === 'object' ? commits[at] : {}
            var full = toText(commit.full)
            var refs = commit.refs && typeof commit.refs.length === 'number' ? commit.refs : []
            var ordered = []
            for (var orderHead = 0; orderHead < refs.length; orderHead += 1) {
              var headRef = refs[orderHead] && typeof refs[orderHead] === 'object' ? refs[orderHead] : {}
              if (toText(headRef.kind) === 'head') ordered.push(headRef)
            }
            for (var orderBranch = 0; orderBranch < refs.length; orderBranch += 1) {
              var branchRef = refs[orderBranch] && typeof refs[orderBranch] === 'object' ? refs[orderBranch] : {}
              if (toText(branchRef.kind) === 'branch') ordered.push(branchRef)
            }
            for (var orderRemote = 0; orderRemote < refs.length; orderRemote += 1) {
              var remoteRef = refs[orderRemote] && typeof refs[orderRemote] === 'object' ? refs[orderRemote] : {}
              if (toText(remoteRef.kind) === 'remote') ordered.push(remoteRef)
            }
            for (var orderTag = 0; orderTag < refs.length; orderTag += 1) {
              var tagRef = refs[orderTag] && typeof refs[orderTag] === 'object' ? refs[orderTag] : {}
              if (toText(tagRef.kind) === 'tag') ordered.push(tagRef)
            }

            var chips = []
            for (var refAt = 0; refAt < ordered.length; refAt += 1) {
              var ref = ordered[refAt]
              var kind = toText(ref.kind)
              var name = toText(ref.name)
              var tone = kind === 'head'
                ? 'gitbar-graph-chip-head'
                : kind === 'branch'
                  ? (ref.current === true ? 'gitbar-graph-chip-current' : 'gitbar-graph-chip-branch')
                  : kind === 'tag'
                    ? 'gitbar-graph-chip-tag'
                    : 'gitbar-graph-chip-remote'
              chips.push(
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'gitbar-graph-chip ' + tone,
                    key: 'ref-' + kind + '-' + name + '-' + refAt,
                    title: kind === 'tag' ? 'tag ' + name : (kind === 'remote' ? t('checkoutRemote') : name),
                    onClick: function (boundRef, boundCommit, event) {
                      return function (clickEvent) {
                        try {
                          if (clickEvent && typeof clickEvent.stopPropagation === 'function') clickEvent.stopPropagation()
                        } catch (error) {
                          /* ignore */
                        }
                        try {
                          if (typeof props.onChipClick === 'function') props.onChipClick(boundRef, boundCommit)
                        } catch (error) {
                          /* ignore */
                        }
                      }
                    }(ref, commit)
                  },
                  kind === 'tag' ? 'tag ' + name : name
                )
              )
            }

            var isHead = commit.isHead === true || (headFull !== '' && full === headFull)
            var headRefPresent = false
            for (var headAt = 0; headAt < refs.length; headAt += 1) {
              if (refs[headAt] && refs[headAt].kind === 'head') headRefPresent = true
            }
            if (headRefPresent) isHead = true
            // The local branch this row is the tip of, if any (the current one wins).
            var branchTip = null
            for (var branchAt = 0; branchAt < refs.length; branchAt += 1) {
              var candidateBranch = refs[branchAt]
              if (!candidateBranch || candidateBranch.kind !== 'branch') continue
              if (!branchTip || candidateBranch.current === true) branchTip = candidateBranch
              if (candidateBranch.current === true) break
            }
            var rowClass = 'gitbar-graph-row'
            if (headRefPresent) rowClass += ' gitbar-graph-row-head'
            if (isHead) rowClass += ' gitbar-graph-row-current'

            // Row click order: current row -> no-op, branch tip -> switch, else detach.
            var rowAction = isHead ? 'current' : branchTip ? 'branch' : 'detach'
            var rowBranchName = branchTip ? toText(branchTip.name) : ''
            var rowBranchCurrent = Boolean(branchTip && branchTip.current === true)

            items.push(
              h(
                'div',
                { className: 'gitbar-graph-item', key: 'item-' + (full || at) },
                h(
                  'div',
                  {
                    className: rowClass,
                    role: 'button',
                    tabIndex: 0,
                    style: { animationDelay: Math.min(at, GRAPH_STAGGER_CAP) * GRAPH_STAGGER_MS + 'ms' },
                    onClick: function (boundFull, boundAction, boundBranch, boundBranchCurrent) {
                      return function () {
                        try {
                          if (boundAction === 'current') {
                            if (typeof props.onCurrent === 'function') props.onCurrent()
                            return
                          }
                          if (boundAction === 'branch') {
                            if (typeof props.onBranchRow === 'function') props.onBranchRow(boundBranch, boundBranchCurrent)
                            return
                          }
                          if (typeof props.onRowClick === 'function') props.onRowClick(boundFull)
                        } catch (error) {
                          /* ignore */
                        }
                      }
                    }(full, rowAction, rowBranchName, rowBranchCurrent),
                    onKeyDown: function (boundFull, boundAction, boundBranch, boundBranchCurrent) {
                      return function (event) {
                        try {
                          if (!event) return
                          if (event.key !== 'Enter' && event.key !== ' ' && event.keyCode !== 13 && event.keyCode !== 32) return
                          if (typeof event.preventDefault === 'function') event.preventDefault()
                          if (boundAction === 'current') {
                            if (typeof props.onCurrent === 'function') props.onCurrent()
                            return
                          }
                          if (boundAction === 'branch') {
                            if (typeof props.onBranchRow === 'function') props.onBranchRow(boundBranch, boundBranchCurrent)
                            return
                          }
                          if (typeof props.onRowClick === 'function') props.onRowClick(boundFull)
                        } catch (error) {
                          /* ignore */
                        }
                      }
                    }(full, rowAction, rowBranchName, rowBranchCurrent)
                  },
                  h('span', { className: 'gitbar-graph-lane', 'aria-hidden': 'true' }),
                  h(
                    'span',
                    { className: 'gitbar-graph-desc' },
                    chips.length > 0 ? chips : null,
                    isHead ? h('span', { className: 'gitbar-graph-now', title: t('current') }, t('current')) : null,
                    h('span', { className: 'gitbar-graph-subject', title: toText(commit.subject) }, toText(commit.subject))
                  ),
                  h('span', { className: 'gitbar-graph-date', title: toText(commit.iso) || toText(commit.when) }, formatWhen(commit.iso, commit.when)),
                  h('span', { className: 'gitbar-graph-author', title: toText(commit.author) }, toText(commit.author)),
                  h('span', { className: 'gitbar-graph-hash', title: toText(commit.full) }, toText(commit.hash))
                ),
                confirmRow && confirmRow === full
                  ? h(
                    'div',
                    { className: 'gitbar-confirm' },
                    h(
                      'span',
                      { className: 'gitbar-confirm-text' },
                      (confirmKind === 'remote' ? t('checkoutRemote') : t('detachedCheckout')) + ' · ' + toText(commit.hash)
                    ),
                    h(
                      'button',
                      {
                        type: 'button',
                        className: 'gitbar-btn',
                        disabled: props.pending !== '',
                        onClick: function (boundFull) {
                          return function () {
                            try {
                              if (typeof props.onConfirm === 'function') props.onConfirm(boundFull)
                            } catch (error) {
                              /* ignore */
                            }
                          }
                        }(full)
                      },
                      t('confirm')
                    ),
                    h(
                      'button',
                      {
                        type: 'button',
                        className: 'gitbar-btn',
                        onClick: function () {
                          try {
                            if (typeof props.onCancel === 'function') props.onCancel()
                          } catch (error) {
                            /* ignore */
                          }
                        }
                      },
                      t('cancel')
                    )
                  )
                  : null
              )
            )
          }
          body = scroller([
            h(GraphCanvas, { key: 'canvas', commits: commits, columns: columns, geometry: geometry }),
            h('div', { className: 'gitbar-graph-rows', key: 'rows' }, items),
            moreButton
          ])
        }

        return h('div', { className: 'gitbar-graph-table' }, toolbar, statusNode, body)
      } catch (error) {
        return h('div', { className: 'gitbar-graph-empty' }, t('error'))
      }
    }

    /** The popover's graph mode: fetch, switch, escape, confirm, status. */
    function GraphView(props) {
      var safe = props && typeof props === 'object' ? props : {}
      var t = typeof safe.t === 'function' ? safe.t : translate
      var sessionId = toText(safe.sessionId)
      var token = toNumber(safe.token) || 0
      var stateBranch = toText(safe.stateBranch)
      var stateDetached = safe.stateDetached === true

      var payloadHook = useState(null)
      var payload = payloadHook[0]
      var setPayload = payloadHook[1]
      var refreshHook = useState(0)
      var refresh = refreshHook[0]
      var setRefresh = refreshHook[1]
      var statusHook = useState(null)
      var status = statusHook[0]
      var setStatus = statusHook[1]
      var pendingHook = useState('')
      var pending = pendingHook[0]
      var setPending = pendingHook[1]
      var confirmHook = useState('')
      var confirmRow = confirmHook[0]
      var setConfirmRow = confirmHook[1]
      var confirmKindHook = useState('commit')
      var confirmKind = confirmKindHook[0]
      var setConfirmKind = confirmKindHook[1]
      var previousHook = useState(graphMemory.previousBranch)
      var previousBranch = previousHook[0]
      var setPreviousBranch = previousHook[1]
      var branchesHook = useState(null)
      var branchList = branchesHook[0]
      var setBranchList = branchesHook[1]
      var branchesAsked = useRef(false)
      var alive = useRef(true)
      var statusTimer = useRef(null)
      var listRef = useRef(null)
      var scrollRef = useRef(null)
      var switchAbort = useRef(null)
      var headScrolled = useRef(false)
      var hostPrevious = ''
      var query = toText(safe.query)
      var appliedQuery = toText(safe.appliedQuery)
      var loadedCount = toNumber(safe.loadedCount)
      if (loadedCount === null) loadedCount = 0
      var moreHook = useState(false)
      var loadingMore = moreHook[0]
      var setLoadingMore = moreHook[1]
      var moreAbort = useRef(null)
      var searchTimer = useRef(null)

      // Seed the remembered branch from the capsule's own state.
      useEffect(function () {
        if (stateDetached || !stateBranch) return
        if (graphMemory.previousBranch === stateBranch) return
        graphMemory.previousBranch = stateBranch
        setPreviousBranch(stateBranch)
      }, [stateBranch, stateDetached])

      // One graph fetch per open, per refresh, and per applied search term.
      useEffect(function () {
        try {
          if (moreAbort.current) moreAbort.current()
        } catch (error) {
          /* ignore */
        }
        moreAbort.current = null
        setLoadingMore(false)
        setPayload({ loading: true })
        var baseLimit = loadedCount > GRAPH_LIMIT ? loadedCount : GRAPH_LIMIT
        if (baseLimit > GRAPH_MAX_LIMIT) baseLimit = GRAPH_MAX_LIMIT
        var pairs = [
          { key: 'session', value: sessionId },
          { key: 'limit', value: String(baseLimit) },
          { key: 'skip', value: '0' }
        ]
        if (appliedQuery !== '') pairs.push({ key: 'q', value: appliedQuery })
        return requestJson(withQuery(GRAPH_URL, pairs), null, function (data) {
          if (data && typeof data === 'object' && data.ok === true) {
            setPayload({ ok: true, data: data })
            try {
              if (typeof props.onLoadedChange === 'function') {
                props.onLoadedChange(data.commits && typeof data.commits.length === 'number' ? data.commits.length : 0)
              }
            } catch (error) {
              /* ignore */
            }
            var fromHost = toText(data.previousBranch)
            if (fromHost) {
              graphMemory.previousBranch = fromHost
              setPreviousBranch(fromHost)
            } else if (data.detached !== true && toText(data.current) && graphMemory.previousBranch !== toText(data.current)) {
              graphMemory.previousBranch = toText(data.current)
              setPreviousBranch(toText(data.current))
            }
          } else {
            setPayload({ ok: false, reason: toText(data && data.reason) })
          }
          setConfirmRow('')
        })
      }, [sessionId, refresh, token, appliedQuery])

      // 250ms debounce: only the last typed term becomes a request.
      useEffect(function () {
        var next = toText(query).trim()
        if (next === appliedQuery) return undefined
        try {
          if (searchTimer.current !== null) clearTimeout(searchTimer.current)
        } catch (error) {
          /* ignore */
        }
        searchTimer.current = setTimeout(function () {
          searchTimer.current = null
          if (!alive.current) return
          try {
            if (typeof props.onApplyQuery === 'function') props.onApplyQuery(next)
          } catch (error) {
            /* ignore */
          }
        }, GRAPH_SEARCH_DEBOUNCE_MS)
        return function () {
          try {
            if (searchTimer.current !== null) clearTimeout(searchTimer.current)
          } catch (error) {
            /* ignore */
          }
          searchTimer.current = null
        }
      }, [query, appliedQuery])

      // Restore the scroll position after a switch-driven refetch.
      useEffect(function () {
        if (scrollRef.current === null) return
        var node = listRef.current
        if (node) {
          try {
            node.scrollTop = scrollRef.current
          } catch (error) {
            /* ignore */
          }
        }
        scrollRef.current = null
      }, [payload])

      // Only the first successful load auto-scrolls to HEAD; later refreshes keep the offset.
      useEffect(function () {
        if (!payload || payload.ok !== true) return
        if (headScrolled.current) return
        headScrolled.current = true
      }, [payload])

      // Stop everything this mode started when it unmounts.
      useEffect(function () {
        alive.current = true
        return function () {
          alive.current = false
          try {
            if (statusTimer.current !== null) clearTimeout(statusTimer.current)
          } catch (error) {
            /* ignore */
          }
          statusTimer.current = null
          try {
            if (searchTimer.current !== null) clearTimeout(searchTimer.current)
          } catch (error) {
            /* ignore */
          }
          searchTimer.current = null
          try {
            if (moreAbort.current) moreAbort.current()
          } catch (error) {
            /* ignore */
          }
          moreAbort.current = null
          try {
            if (switchAbort.current) switchAbort.current()
          } catch (error) {
            /* ignore */
          }
          switchAbort.current = null
        }
      }, [])

      var data = payload && payload.ok === true && payload.data && typeof payload.data === 'object' ? payload.data : null
      var detached = Boolean(data && data.detached)
      hostPrevious = data ? toText(data.previousBranch) : ''
      var branchNames = []
      if (branchList && branchList.ok === true && branchList.branches && typeof branchList.branches.length === 'number') {
        for (var branchAt = 0; branchAt < branchList.branches.length; branchAt += 1) {
          var branch = branchList.branches[branchAt]
          var name = toText(branch && branch.name)
          if (name && branchNames.indexOf(name) < 0) branchNames.push(name)
        }
      }

      // The escape needs the local list only when nothing was remembered.
      useEffect(function () {
        if (!detached || hostPrevious || previousBranch) return function () {}
        if (branchesAsked.current) return function () {}
        branchesAsked.current = true
        setBranchList({ loading: true })
        return requestJson(withQuery(BRANCHES_URL, [{ key: 'session', value: sessionId }]), null, function (result) {
          if (result.ok === true && result.branches && typeof result.branches.length === 'number') {
            setBranchList({ ok: true, branches: result.branches })
          } else {
            setBranchList({ ok: false })
          }
        })
      }, [detached, hostPrevious, previousBranch, sessionId])

      // previousBranch from the Host -> our memory -> main -> master -> first local -> none.
      var escapeTarget = ''
      if (detached) {
        if (hostPrevious) escapeTarget = hostPrevious
        else if (previousBranch) escapeTarget = previousBranch
        else if (branchNames.length > 0) {
          if (branchNames.indexOf('main') >= 0) escapeTarget = 'main'
          else if (branchNames.indexOf('master') >= 0) escapeTarget = 'master'
          else escapeTarget = branchNames[0]
        }
      }

      function noteOk(text) {
        setStatus({ kind: 'ok', text: text })
        try {
          if (statusTimer.current !== null) clearTimeout(statusTimer.current)
        } catch (error) {
          /* ignore */
        }
        statusTimer.current = setTimeout(function () {
          if (alive.current) setStatus(null)
        }, FLASH_MS)
      }

      function rememberScroll() {
        try {
          scrollRef.current = listRef.current && typeof listRef.current.scrollTop === 'number' ? listRef.current.scrollTop : null
        } catch (error) {
          scrollRef.current = null
        }
      }

      function loadMore() {
        if (loadingMore) return
        var currentData = payload && payload.ok === true && payload.data && typeof payload.data === 'object' ? payload.data : null
        if (!currentData || currentData.hasMore !== true) return
        var skip = currentData.commits && typeof currentData.commits.length === 'number' ? currentData.commits.length : 0
        setLoadingMore(true)
        try {
          if (moreAbort.current) moreAbort.current()
        } catch (error) {
          /* ignore */
        }
        var pairs = [
          { key: 'session', value: sessionId },
          { key: 'limit', value: String(GRAPH_LIMIT) },
          { key: 'skip', value: String(skip) }
        ]
        if (appliedQuery !== '') pairs.push({ key: 'q', value: appliedQuery })
        moreAbort.current = requestJson(withQuery(GRAPH_URL, pairs), null, function (result) {
          if (!alive.current) return
          moreAbort.current = null
          setLoadingMore(false)
          if (!(result && result.ok === true)) {
            setStatus({ kind: 'error', text: t('loadMoreFailed') })
            return
          }
          setPayload(function (previous) {
            if (!(previous && previous.ok === true && previous.data && typeof previous.data === 'object')) return previous
            var merged = {}
            var key
            for (key in result) {
              if (Object.prototype.hasOwnProperty.call(result, key)) merged[key] = result[key]
            }
            var oldCommits = previous.data.commits && typeof previous.data.commits.length === 'number' ? previous.data.commits : []
            var newCommits = result.commits && typeof result.commits.length === 'number' ? result.commits : []
            merged.commits = oldCommits.concat(newCommits)
            return { ok: true, data: merged }
          })
          try {
            if (typeof props.onLoadedChange === 'function') {
              var alreadyLoaded = currentData.commits && typeof currentData.commits.length === 'number' ? currentData.commits.length : 0
              var addedLoaded = result.commits && typeof result.commits.length === 'number' ? result.commits.length : 0
              props.onLoadedChange(alreadyLoaded + addedLoaded)
            }
          } catch (error) {
            /* ignore */
          }
        })
      }

      function postSwitch(body, token2) {
        try {
          if (switchAbort.current) switchAbort.current()
        } catch (error) {
          /* ignore */
        }
        setPending(token2)
        setStatus(null)
        switchAbort.current = requestJson(
          withQuery(SWITCH_URL, [{ key: 'session', value: sessionId }]),
          { method: 'POST', body: JSON.stringify(body) },
          function (result) {
            if (!alive.current) return
            switchAbort.current = null
            setPending('')
            if (result && result.ok === true) {
              var branchName = result.branch ? toText(result.branch) : ''
              if (branchName) {
                graphMemory.previousBranch = branchName
                setPreviousBranch(branchName)
              }
              noteOk(t('switched') + ' ' + (branchName || toText(result.hash) || toText(result.detach).slice(0, 7)))
              setConfirmRow('')
              rememberScroll()
              setRefresh(function (value) {
                return value + 1
              })
              try {
                if (typeof props.onSwitched === 'function') props.onSwitched()
              } catch (error) {
                /* ignore */
              }
              return
            }
            setStatus({
              kind: 'error',
              text: switchFailureText(toText(result && result.reason), t),
              detail: toText(result && result.detail)
            })
          }
        )
      }

      function onChipClick(ref, commit) {
        var kind = toText(ref && ref.kind)
        var name = toText(ref && ref.name)
        var full = toText(commit && commit.full)
        if (kind === 'head') {
          noteOk(t('current'))
          return
        }
        if (kind === 'branch') {
          if (ref && ref.current === true) noteOk(t('current'))
          else postSwitch({ branch: name }, 'branch:' + name)
          return
        }
        if (kind === 'remote') {
          if (full) {
            setConfirmKind('remote')
            setConfirmRow(full)
          }
          return
        }
        if (full) {
          setConfirmKind('commit')
          setConfirmRow(full)
        }
      }

      function onRowClick(full) {
        if (!full) return
        setConfirmKind('commit')
        setConfirmRow(full)
      }

      function onConfirm(full) {
        if (!full) return
        postSwitch({ detach: toText(full) }, 'detach:' + toText(full))
      }

      try {
        var columns = Math.max(1, Math.min(LANE_COUNT, toNumber(data && data.columns) || 1))
        var laneWidth = columns * GRAPH_LANE_WIDTH + GRAPH_LANE_INSET
        return h(
          'div',
          { className: 'gitbar-graph', style: { '--gitbar-lane-w': laneWidth + 'px' } },
          h(GraphTable, {
            t: t,
            payload: payload,
            columns: columns,
            confirmRow: confirmRow,
            confirmKind: confirmKind,
            pending: pending,
            status: status,
            escapeTarget: escapeTarget,
            autoScroll: headScrolled.current !== true,
            listRef: listRef,
            onRefresh: function () {
              rememberScroll()
              setRefresh(function (value) {
                return value + 1
              })
            },
            onRetry: function () {
              setRefresh(function (value) {
                return value + 1
              })
            },
            onEscape: function (target) {
              if (target) postSwitch({ branch: toText(target) }, 'escape:' + toText(target))
            },
            onOpenPicker: function () {
              try {
                if (typeof props.onOpenPicker === 'function') props.onOpenPicker()
              } catch (error) {
                /* ignore */
              }
            },
            onBack: function () {
              try {
                if (typeof props.onBack === 'function') props.onBack()
              } catch (error) {
                /* ignore */
              }
            },
            onCommit: function () {
              try {
                if (typeof props.onCommit === 'function') props.onCommit()
              } catch (error) {
                /* ignore */
              }
            },
            query: query,
            onQueryChange: function (next) {
              try {
                if (typeof props.onQueryChange === 'function') props.onQueryChange(toText(next))
              } catch (error) {
                /* ignore */
              }
            },
            onClearQuery: function () {
              try {
                if (typeof props.onClearQuery === 'function') props.onClearQuery()
              } catch (error) {
                /* ignore */
              }
            },
            filtered: Boolean(data && data.filtered === true),
            total: data ? toNumber(data.total) : null,
            hasMore: Boolean(data && data.hasMore === true),
            loadingMore: loadingMore,
            onLoadMore: loadMore,
            onOpenCommit: props.onOpenCommit,
            onCurrent: function () {
              noteOk(t('current'))
            },
            onRowClick: onRowClick,
            onBranchRow: function (name, isCurrent) {
              if (!name) return
              if (isCurrent) {
                noteOk(t('current'))
                return
              }
              postSwitch({ branch: name }, 'branch:' + name)
            },
            onChipClick: onChipClick,
            onConfirm: onConfirm,
            onCancel: function () {
              setConfirmRow('')
            },
            onDismissStatus: function () {
              try {
                if (statusTimer.current !== null) clearTimeout(statusTimer.current)
              } catch (error) {
                /* ignore */
              }
              statusTimer.current = null
              setStatus(null)
            }
          })
        )
      } catch (error) {
        return h('div', { className: 'gitbar-graph' }, h('div', { className: 'gitbar-graph-empty' }, t('error')))
      }
    }

    // ── sidebar registration (tab type + body) ────────────────────────────
    var sidebarRegistered = false
    var lastSidebarSessionId = ''

    function serviceOf(ctx, name) {
      var service = null
      try {
        if (ctx && typeof ctx.get === 'function') service = ctx.get(name)
      } catch (error) {
        service = null
      }
      if (!service) {
        try {
          service = ctx && ctx[name] ? ctx[name] : null
        } catch (error) {
          service = null
        }
      }
      return service || null
    }

    function sidebarTabDefinition() {
      return {
        id: REVIEW_TYPE_ID,
        kind: REVIEW_KIND,
        patterns: [REVIEW_PATTERN, REVIEW_PAGE_ADDRESS],
        priority: 'extension',
        title: function () {
          return translate('reviewTitle')
        },
        canOpen: function (address) {
          return typeof address === 'string' &&
            (address === REVIEW_PAGE_ADDRESS || address.indexOf(REVIEW_ADDRESS_PREFIX) === 0)
        },
        keepMounted: true,
        guide: [
          {
            id: 'review',
            order: 40,
            title: function () {
              return translate('reviewGuideTitle')
            },
            description: function () {
              return translate('reviewGuideDescription')
            }
          }
        ]
      }
    }

    /**
     * Register the review tab type and its body once. Returns false when the
     * sidebar registries are absent, so the in-popover review stays the fallback.
     */
    function registerSidebarSurfaces(ctx) {
      if (sidebarRegistered) return true
      if (!ctx || !ctx.slots || typeof ctx.slots.inject !== 'function' || typeof ctx.slots.register !== 'function') return false
      var tabs = serviceOf(ctx, 'sidebarRightTabs')
      if (!tabs || typeof tabs.register !== 'function') return false
      try {
        var registerReview = function () {
          return tabs.register(sidebarTabDefinition())
        }
        if (typeof ctx.effect === 'function') ctx.effect(registerReview, 'dsh-git-bar: review tab type')
        else registerReview()
      } catch (error) {
        return false
      }
      sidebarRegistered = true
      try {
        var registerReviewBody = function () {
          return ctx.slots.inject('sidebar.right.pane.tab', function () {
            return ctx.slots.register({ name: 'sidebar.right.pane.tab', key: REVIEW_TYPE_ID }, SidebarReviewEntry)
          })
        }
        if (typeof ctx.effect === 'function') ctx.effect(registerReviewBody, 'dsh-git-bar: review tab body')
        else registerReviewBody()
      } catch (error) {
        /* the in-popover review stays the fallback */
      }
      return true
    }

    function sidebarController() {
      return serviceOf(rootCtx, 'sidebarRight')
    }

    /**
     * Options for one resource open: replace an active guide tab, and an active
     * review tab, so repeated hand-offs reuse a single review tab. Never
     * replaces any other plugin's tab.
     */
    function sidebarOpenOptions(params, ownKind) {
      var options = { params: params && typeof params === 'object' ? params : {} }
      var right = sidebarController()
      if (!right) return options
      var active = null
      try {
        active = typeof right.active === 'function' ? right.active() : null
      } catch (error) {
        active = null
      }
      try {
        var activeId = active && typeof active === 'object' ? toText(active.id) : ''
        var activeKind = active && typeof active === 'object'
          ? toText(active.kind) || (active.record && typeof active.record === 'object' ? toText(active.record.kind) : '')
          : ''
        if (activeId && (activeKind === 'guide' || activeKind === ownKind)) options.replaceTab = activeId
      } catch (error) {
        /* junk from active(): open normally */
      }
      return options
    }

    /**
     * Hand a review target off to the Sidebar; false means the caller must
     * fall back to the in-popover review.
     */
    function openSidebarReview(target) {
      if (!sidebarRegistered) return false
      var right = sidebarController()
      if (!right || typeof right.openResource !== 'function') return false
      try {
        gitbarReviewStore.set(target)
        if (target && typeof target.sessionId === 'string' && target.sessionId) lastSidebarSessionId = target.sessionId
        var params = target && target.mode === 'commit'
          ? { mode: 'commit', path: target.path, hash: target.hash, hashShort: target.hashShort, iso: toText(target.iso), when: toText(target.when) }
          : { mode: 'worktree', path: target.path, staged: target.staged === true, untracked: target.untracked === true }
        right.openResource(REVIEW_ADDRESS, sidebarOpenOptions(params, REVIEW_KIND))
        return true
      } catch (error) {
        return false
      }
    }

    // ── panel ─────────────────────────────────────────────────────────────
    /** The expanded popover: header, counts, picker/list/commit/review body, commits. */
    /** wip/<yyyyMMdd-HHmm>, the default branch offered for a detached HEAD. */
    function defaultWipBranch() {
      try {
        var now = new Date()
        function pad(value) {
          return (value < 10 ? '0' : '') + String(value)
        }
        return 'wip/' + String(now.getFullYear()) + pad(now.getMonth() + 1) + pad(now.getDate()) + '-' + pad(now.getHours()) + pad(now.getMinutes())
      } catch (error) {
        return 'wip'
      }
    }

    /**
     * The auto-commit sheet: a message, an optional detached-HEAD branch, and
     * one-shot push credentials. User-triggered only; credentials live in this
     * component's state and die with it (never stored, never reused).
     */
    // ── GitHub: account card, login (PAT / device flow), clone workspace ───
    function githubUrl(pathname, sessionId, extra) {
      var pairs = [{ key: 'session', value: toText(sessionId) }]
      if (extra && extra.length > 0) pairs = pairs.concat(extra)
      return withQuery(GITHUB_BASE + pathname, pairs)
    }

    function githubDetailText(detail) {
      var line = toText(detail).split('\n')[0]
      if (line.length > 120) line = line.slice(0, 120) + '…'
      return line
    }

    function resolveWorkspaceServices() {
      var workspaces = null
      var uiWorkspace = null
      try {
        if (rootCtx && typeof rootCtx.get === 'function') {
          workspaces = rootCtx.get('workspaces')
          uiWorkspace = rootCtx.get('uiWorkspace')
        }
      } catch (error) {
        workspaces = null
        uiWorkspace = null
      }
      if (!workspaces || typeof workspaces.create !== 'function') return null
      if (!uiWorkspace || typeof uiWorkspace.openWorkspace !== 'function') return null
      return { workspaces: workspaces, uiWorkspace: uiWorkspace }
    }

    function GitHubSection(props) {
      var t = props.t || translate
      var sessionId = toText(props.sessionId)
      var status = props.status && props.status.ok === true ? props.status : null
      var signedIn = Boolean(status && status.signedIn === true)
      var account = status && status.account && typeof status.account === 'object' ? status.account : null
      var deviceInfo = status && status.device && typeof status.device === 'object' ? status.device : null
      var deviceReady = deviceInfo ? deviceInfo.ready !== false : true
      var deviceIsCustom = Boolean(deviceInfo && deviceInfo.custom === true)
      var savedClientId = status && status.config && typeof status.config.deviceClientId === 'string' ? status.config.deviceClientId : ''
      var cloneRoot = status && status.config && typeof status.config.cloneRoot === 'string' ? status.config.cloneRoot : ''
      var shippedHint = deviceInfo && deviceReady && !deviceIsCustom
        ? h('div', { className: 'gitbar-github-hint', key: 'dev-shipped' }, t('githubDeviceShipped'))
        : null

      var expandedHook = useState(false)
      var expanded = expandedHook[0]
      var setExpanded = expandedHook[1]
      var modeHook = useState('pat')
      var mode = modeHook[0]
      var setMode = modeHook[1]
      var patHook = useState('')
      var pat = patHook[0]
      var setPat = patHook[1]
      var pendingHook = useState('')
      var pending = pendingHook[0]
      var setPending = pendingHook[1]
      var errorHook = useState('')
      var error = errorHook[0]
      var setError = errorHook[1]
      var deviceHook = useState(null)
      var device = deviceHook[0]
      var setDevice = deviceHook[1]
      var deviceStateHook = useState('')
      var deviceState = deviceStateHook[0]
      var setDeviceState = deviceStateHook[1]
      var repoQueryHook = useState('')
      var repoQuery = repoQueryHook[0]
      var setRepoQuery = repoQueryHook[1]
      var repoHook = useState('')
      var repo = repoHook[0]
      var setRepo = repoHook[1]
      var reposHook = useState(null)
      var repos = reposHook[0]
      var setRepos = reposHook[1]
      var clientIdHook = useState('')
      var clientId = clientIdHook[0]
      var setClientId = clientIdHook[1]
      var clientFormHook = useState(false)
      var clientFormOpen = clientFormHook[0]
      var setClientFormOpen = clientFormHook[1]
      var rootEditHook = useState(false)
      var rootEdit = rootEditHook[0]
      var setRootEdit = rootEditHook[1]
      var rootDraftHook = useState('')
      var rootDraft = rootDraftHook[0]
      var setRootDraft = rootDraftHook[1]
      var rootPendingHook = useState(false)
      var rootPending = rootPendingHook[0]
      var setRootPending = rootPendingHook[1]
      var configPendingHook = useState(false)
      var configPending = configPendingHook[0]
      var setConfigPending = configPendingHook[1]
      var cloneResultHook = useState(null)
      var cloneResult = cloneResultHook[0]
      var setCloneResult = cloneResultHook[1]
      var alive = useRef(true)
      var requestAbort = useRef(null)
      var reposAbort = useRef(null)
      var deviceAbort = useRef(null)
      var deviceTimer = useRef(null)
      var deviceRef = useRef(null)
      var searchTimer = useRef(null)

      useEffect(function () {
        alive.current = true
        return function () {
          alive.current = false
          try {
            if (requestAbort.current) requestAbort.current()
          } catch (error2) {
            /* ignore */
          }
          requestAbort.current = null
          try {
            if (reposAbort.current) reposAbort.current()
          } catch (error2) {
            /* ignore */
          }
          reposAbort.current = null
          try {
            if (deviceAbort.current) deviceAbort.current()
          } catch (error2) {
            /* ignore */
          }
          deviceAbort.current = null
          try {
            if (deviceTimer.current !== null) clearTimeout(deviceTimer.current)
          } catch (error2) {
            /* ignore */
          }
          deviceTimer.current = null
          try {
            if (searchTimer.current !== null) clearTimeout(searchTimer.current)
          } catch (error2) {
            /* ignore */
          }
          searchTimer.current = null
          deviceRef.current = null
        }
      }, [])

      // Host never echoes the saved client id? It does via config.deviceClientId.
      useEffect(function () {
        setClientId(savedClientId)
      }, [savedClientId])

      useEffect(function () {
        if (!rootEdit) setRootDraft(cloneRoot)
      }, [cloneRoot, rootEdit])

      function flash(text) {
        try {
          if (typeof props.onFlash === 'function') props.onFlash(toText(text))
        } catch (error2) {
          /* ignore */
        }
      }

      function send(url, body, done) {
        try {
          if (requestAbort.current) requestAbort.current()
        } catch (error2) {
          /* ignore */
        }
        requestAbort.current = requestJson(url, { method: 'POST', body: JSON.stringify(body || {}) }, function (result) {
          if (!alive.current) return
          requestAbort.current = null
          done(result && typeof result === 'object' ? result : {})
        })
      }

      function sendDevice(body, done) {
        try {
          if (deviceAbort.current) deviceAbort.current()
        } catch (error2) {
          /* ignore */
        }
        deviceAbort.current = requestJson(githubUrl('/device/poll', sessionId), { method: 'POST', body: JSON.stringify(body) }, function (result) {
          if (!alive.current) return
          deviceAbort.current = null
          done(result && typeof result === 'object' ? result : {})
        })
      }

      function loginErrorText(result) {
        var safe = toText(result && result.reason)
        var detail = githubDetailText(result && result.detail)
        var reason = detail || safe
        if (safe === 'bad-credentials') reason = t('githubBadCredentials')
        if (safe === 'network') reason = t('githubNetworkError')
        return toText(t('githubLoginFailed')).replace('{detail}', reason || t('error'))
      }

      function cloneErrorText(result) {
        var safe = toText(result && result.reason)
        if (safe === 'not-signed-in') return t('githubNotSignedIn')
        if (safe === 'bad-repo') return t('githubBadRepo')
        if (safe === 'target-exists') return t('githubTargetExists')
        var detail = githubDetailText(result && result.detail) || safe || t('error')
        return toText(t('githubCloneFailed')).replace('{detail}', detail)
      }

      function stopDevice() {
        deviceRef.current = null
        setDevice(null)
        setDeviceState('')
        try {
          if (deviceTimer.current !== null) clearTimeout(deviceTimer.current)
        } catch (error2) {
          /* ignore */
        }
        deviceTimer.current = null
        try {
          if (deviceAbort.current) deviceAbort.current()
        } catch (error2) {
          /* ignore */
        }
        deviceAbort.current = null
      }

      function schedulePoll() {
        var current = deviceRef.current
        if (!current || !current.id) return
        try {
          if (deviceTimer.current !== null) clearTimeout(deviceTimer.current)
        } catch (error2) {
          /* ignore */
        }
        var wait = toNumber(current.interval)
        if (wait === null || wait < 1) wait = 5
        deviceTimer.current = setTimeout(function () {
          deviceTimer.current = null
          var still = deviceRef.current
          if (!alive.current || !still) return
          sendDevice({ id: still.id }, function (result) {
            if (!deviceRef.current) return
            var state = toText(result.state)
            if (result.ok !== true) {
              stopDevice()
              setError(t('githubDeviceMissingClientId'))
              return
            }
            if (state === 'done') {
              stopDevice()
              setExpanded(false)
              setError('')
              setPending('')
              if (result.account && typeof props.onStatus === 'function') {
                props.onStatus({ ok: true, signedIn: true, account: result.account, config: status && status.config ? status.config : {} })
              } else if (typeof props.onReload === 'function') {
                props.onReload()
              }
              flash(t('githubSignedIn'))
              return
            }
            if (state === 'expired' || state === 'denied') {
              stopDevice()
              setError(t(state === 'expired' ? 'githubDeviceExpired' : 'githubDeviceDenied'))
              return
            }
            if (state === 'slow-down') {
              still.interval = (toNumber(still.interval) || 5) + 5
              setDeviceState('slow-down')
            } else {
              setDeviceState('pending')
            }
            schedulePoll()
          })
        }, wait * 1000)
      }

      function startDevice() {
        setPending('device')
        setError('')
        setDeviceState('')
        send(githubUrl('/device/start', sessionId), {}, function (result) {
          setPending('')
          if (result.ok !== true) {
            setError(
              toText(result.reason) === 'missing-client-id'
                ? t('githubDeviceMissingClientId')
                : toText(t('githubLoginFailed')).replace('{detail}', githubDetailText(result.detail) || toText(result.reason) || t('error'))
            )
            return
          }
          var id = toText(result.id)
          if (!id) {
            setError(t('error'))
            return
          }
          var interval = toNumber(result.interval)
          deviceRef.current = { id: id, interval: interval === null ? 5 : interval }
          setDevice({
            id: id,
            userCode: toText(result.userCode),
            verificationUri: toText(result.verificationUri),
            expiresAt: toNumber(result.expiresAt)
          })
          setDeviceState('pending')
          setMode('device')
          schedulePoll()
        })
      }

      function loginWithPat() {
        var token = toText(pat).trim()
        if (!token) {
          setError(t('githubPatRequired'))
          return
        }
        setPending('login')
        setError('')
        send(githubUrl('/login', sessionId), { token: token }, function (result) {
          setPending('')
          // The token is one-shot: never keep it in component state.
          setPat('')
          if (result.ok === true) {
            setExpanded(false)
            if (typeof props.onStatus === 'function') props.onStatus(result)
            else if (typeof props.onReload === 'function') props.onReload()
            flash(t('githubSignedIn'))
            return
          }
          setError(loginErrorText(result))
        })
      }

      function logout() {
        setPending('logout')
        setError('')
        send(githubUrl('/logout', sessionId), {}, function (result) {
          setPending('')
          setExpanded(false)
          setCloneResult(null)
          setRepos(null)
          setRepo('')
          setRepoQuery('')
          setPat('')
          stopDevice()
          if (result.ok === true && typeof props.onStatus === 'function') {
            props.onStatus({ ok: true, signedIn: false, account: null, tokenKind: null, connectedAt: null, config: status && status.config ? status.config : {} })
          } else if (typeof props.onReload === 'function') {
            props.onReload()
          }
        })
      }

      function loadRepos() {
        var query = toText(repoQuery).trim()
        setRepos({ loading: true })
        try {
          if (reposAbort.current) reposAbort.current()
        } catch (error2) {
          /* ignore */
        }
        reposAbort.current = requestJson(
          withQuery(GITHUB_REPOS_URL, [
            { key: 'session', value: sessionId },
            { key: 'q', value: query },
            { key: 'limit', value: String(GITHUB_REPO_LIMIT) }
          ]),
          null,
          function (result) {
            if (!alive.current) return
            reposAbort.current = null
            if (result && result.ok === true) {
              setRepos({ ok: true, repos: result.repos && typeof result.repos.length === 'number' ? result.repos : [] })
              return
            }
            var detail = githubDetailText(result && result.detail) || toText(result && result.reason) || t('error')
            setRepos({ ok: false, error: toText(t('githubReposFailed')).replace('{detail}', detail) })
          }
        )
      }

      useEffect(function () {
        if (!expanded || !signedIn) return undefined
        try {
          if (searchTimer.current !== null) clearTimeout(searchTimer.current)
        } catch (error2) {
          /* ignore */
        }
        searchTimer.current = setTimeout(function () {
          searchTimer.current = null
          if (!alive.current) return
          loadRepos()
        }, GITHUB_SEARCH_DEBOUNCE_MS)
        return function () {
          try {
            if (searchTimer.current !== null) clearTimeout(searchTimer.current)
          } catch (error2) {
            /* ignore */
          }
          searchTimer.current = null
        }
      }, [expanded, signedIn, repoQuery])

      function copyClonedPath(path) {
        try {
          if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            var written = navigator.clipboard.writeText(path)
            if (written && typeof written.then === 'function') written.then(function () {}, function () {})
          }
        } catch (error2) {
          /* ignore */
        }
        flash(t('githubClonePathCopied'))
      }

      function openClonedWorkspace(path) {
        if (!path) return
        var services = props.services && typeof props.services === 'object' ? props.services : resolveWorkspaceServices()
        if (!services || !services.workspaces || typeof services.workspaces.create !== 'function' || !services.uiWorkspace || typeof services.uiWorkspace.openWorkspace !== 'function') {
          copyClonedPath(path)
          return
        }
        Promise.resolve()
          .then(function () {
            return services.workspaces.create({ path: path })
          })
          .then(function (workspace) {
            var id = workspace && (workspace.id || workspace.workspaceId) ? workspace.id || workspace.workspaceId : ''
            if (!id) throw new Error('no-workspace-id')
            return Promise.resolve(services.uiWorkspace.openWorkspace(id))
          })
          .then(
            function () {
              if (!alive.current) return
              setExpanded(false)
              flash(t('githubWorkspaceOpened'))
            },
            function () {
              if (!alive.current) return
              copyClonedPath(path)
            }
          )
      }

      function saveClientId(forceEmpty) {
        if (configPending) return
        var value = forceEmpty === true ? '' : toText(clientId).trim()
        setConfigPending(true)
        setError('')
        send(githubUrl('/config', sessionId), { deviceClientId: value }, function (result) {
          setConfigPending(false)
          if (result.ok === true) {
            setClientId(value)
            setClientFormOpen(false)
            if (typeof props.onReload === 'function') props.onReload()
            flash(t('githubClientIdSaved'))
            return
          }
          var detail = githubDetailText(result && result.detail)
          setError(detail || t('githubSettingsFailed'))
        })
      }

      function saveCloneRoot() {
        if (rootPending) return
        setRootPending(true)
        setError('')
        send(githubUrl('/config', sessionId), { cloneRoot: toText(rootDraft).trim() }, function (result) {
          setRootPending(false)
          if (result.ok === true) {
            setRootEdit(false)
            if (typeof props.onReload === 'function') props.onReload()
            flash(t('githubSaved'))
            return
          }
          setError(githubDetailText(result && result.detail) || t('githubSettingsFailed'))
        })
      }

      function cloneRepo(repoOverride) {
        var name = toText(repoOverride !== undefined && repoOverride !== null ? repoOverride : repo).trim()
        if (!name) {
          setError(t('githubRepoRequired'))
          return
        }
        setPending('clone')
        setError('')
        setCloneResult(null)
        send(githubUrl('/clone', sessionId), { repo: name, background: true }, function (result) {
          setPending('')
          if (result.ok !== true) {
            setError(cloneErrorText(result))
            return
          }
          setRepo(name)
          if (toText(result.id)) {
            if (typeof props.onCloneStart === 'function') {
              props.onCloneStart({
                id: toText(result.id),
                repo: toText(result.repo) || name,
                root: toText(result.root),
                path: toText(result.path),
                folder: toText(result.folder),
                state: toText(result.state) || 'queued',
                percent: 0,
                stage: 'starting',
                startedAt: Date.now(),
                result: null,
                reason: '',
                detail: ''
              })
            }
            return
          }
          // Legacy synchronous response (tests only).
          var path = toText(result.path)
          setCloneResult({ path: path, folder: toText(result.folder), branch: toText(result.branch) })
          openClonedWorkspace(path)
        })
      }

      try {
        if (!status) return null
        var avatarText = signedIn && account ? (toText(account.login).slice(0, 1) || 'G').toUpperCase() : 'GH'
        var avatarUrl = signedIn && account ? toText(account.avatarUrl) : ''
        var avatar = h(
          'span',
          { className: 'gitbar-github-avatar', 'aria-hidden': 'true' },
          avatarUrl ? h('img', { src: avatarUrl, alt: '', loading: 'lazy' }) : avatarText
        )
        var caret = h(
          'button',
          {
            type: 'button',
            className: 'gitbar-github-caret',
            title: expanded ? t('close') : signedIn ? t('githubNewWorkspace') : t('githubSignIn'),
            'aria-label': expanded ? t('close') : signedIn ? t('githubNewWorkspace') : t('githubSignIn'),
            'aria-expanded': expanded ? 'true' : 'false',
            onClick: function () {
              setExpanded(function (value) {
                return !value
              })
              setError('')
            }
          },
          expanded ? '▾' : '▸'
        )
        var actions = []
        var loginName = signedIn && account ? toText(account.login) : ''
        var loginRealName = signedIn && account ? toText(account.name) : ''
        if (signedIn) {
          actions.push(
            h(
              'button',
              {
                type: 'button',
                className: 'gitbar-btn gitbar-github-btn',
                key: 'signout',
                title: t('githubSignOut'),
                disabled: pending === 'logout',
                onClick: logout
              },
              t('githubSignOut')
            )
          )
        } else {
          actions.push(
            h(
              'button',
              {
                type: 'button',
                className: 'gitbar-btn gitbar-github-primary',
                key: 'signin',
                title: t('githubSignIn'),
                disabled: pending === 'login' || pending === 'device',
                onClick: function () {
                  setExpanded(function (value) {
                    return !value
                  })
                  setError('')
                }
              },
              t('githubSignIn')
            )
          )
        }

        var rows = [
          h(
            'div',
            { className: 'gitbar-github-row', key: 'row' },
            avatar,
            h(
              'span',
              { className: 'gitbar-github-name', title: loginName || t('github') },
              loginName || t('github')
            ),
            signedIn && loginRealName && loginRealName !== loginName
              ? h('span', { className: 'gitbar-github-meta', title: loginRealName }, loginRealName)
              : null,
            h('span', { className: 'gitbar-spacer' }),
            actions,
            caret
          )
        ]

        if (expanded) {
          var content = []
          var showClientForm = !deviceReady || deviceIsCustom || clientFormOpen
          var clientIdForm = showClientForm
            ? [
              h('div', { className: 'gitbar-github-hint', key: 'dev-client-label' }, t('githubClientIdLabel')),
              h(
                'div',
                { className: 'gitbar-github-actions', key: 'dev-client' },
                h('input', {
                  type: 'text',
                  className: 'gitbar-github-input',
                  value: clientId,
                  placeholder: t('githubClientIdPlaceholder'),
                  'aria-label': t('githubClientIdLabel'),
                  autoComplete: 'off',
                  spellCheck: false,
                  disabled: configPending,
                  onChange: function (event) {
                    setClientId(event && event.target ? event.target.value : '')
                  }
                }),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'gitbar-btn gitbar-github-primary',
                    disabled: configPending,
                    onClick: function () {
                      saveClientId(false)
                    }
                  },
                  configPending ? t('githubSaving') : t('githubSave')
                )
              ),
              h('div', { className: 'gitbar-github-hint', key: 'dev-client-hint' }, t('githubClientIdHint'))
            ]
            : null
          var customActiveRow = deviceIsCustom
            ? h(
              'div',
              { className: 'gitbar-github-actions', key: 'dev-custom-active' },
              h('span', { className: 'gitbar-github-hint' }, t('githubClientIdActive')),
              h(
                'button',
                {
                  type: 'button',
                  className: 'gitbar-btn gitbar-github-btn',
                  disabled: configPending,
                  onClick: function () {
                    saveClientId(true)
                  }
                },
                t('githubClientIdReset')
              )
            )
            : null
          var customToggleRow =
            !deviceIsCustom && deviceInfo && deviceReady
              ? h(
                'div',
                { className: 'gitbar-github-actions', key: 'dev-custom-toggle' },
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'gitbar-btn gitbar-github-btn',
                    'aria-expanded': clientFormOpen ? 'true' : 'false',
                    onClick: function () {
                      setClientFormOpen(function (value) {
                        return !value
                      })
                    }
                  },
                  t('githubClientIdCustom')
                )
              )
              : null
          var cloneJob = props.clone && typeof props.clone === 'object' ? props.clone : null
          var cloneJobId = cloneJob ? toText(cloneJob.id) : ''
          var cloneJobState = cloneJob ? toText(cloneJob.state) : ''
          var cloneRunning = cloneJobId !== '' && cloneJobState !== 'done' && cloneJobState !== 'failed'
          var previewFolder = cloneFolderName(toText(repo) || (cloneJob ? toText(cloneJob.repo) : ''))
          var previewPath = cloneJoinPath(cloneRoot, previewFolder)
          var rootRow = h(
            'div',
            { className: 'gitbar-clone-row', key: 'root' },
            h('span', { className: 'gitbar-clone-label' }, t('githubCloneRoot')),
            rootEdit
              ? h('input', {
                type: 'text',
                className: 'gitbar-github-input',
                value: rootDraft,
                placeholder: '/path/to/clones',
                'aria-label': t('githubCloneRoot'),
                autoComplete: 'off',
                spellCheck: false,
                disabled: rootPending,
                onChange: function (event) {
                  setRootDraft(event && event.target ? event.target.value : '')
                }
              })
              : h('span', { className: 'gitbar-clone-value', title: cloneRoot }, cloneRoot || '—'),
            rootEdit
              ? h(
                'span',
                { className: 'gitbar-github-actions' },
                h('button', { type: 'button', className: 'gitbar-btn gitbar-github-primary', disabled: rootPending, onClick: saveCloneRoot }, t('githubSave')),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'gitbar-btn',
                    onClick: function () {
                      setRootEdit(false)
                      setRootDraft(cloneRoot)
                    }
                  },
                  t('cancel')
                )
              )
              : h(
                'button',
                {
                  type: 'button',
                  className: 'gitbar-btn gitbar-github-btn',
                  onClick: function () {
                    setRootDraft(cloneRoot)
                    setRootEdit(true)
                  }
                },
                t('githubCloneRootChange')
              )
          )
          var previewRow = h(
            'div',
            { className: 'gitbar-clone-row', key: 'preview' },
            h('span', { className: 'gitbar-clone-label' }, t('githubCloneTarget')),
            h('span', { className: 'gitbar-clone-value', title: previewPath }, previewPath || '—')
          )
          var cloneJobNode = null
          if (cloneJobId) {
            var cloneJobPath = toText(cloneJob.path) || previewPath
            if (cloneJobState === 'done') {
              cloneJobNode = h(
                'div',
                { className: 'gitbar-clone', key: 'clone' },
                h(
                  'div',
                  { className: 'gitbar-clone-row' },
                  h('span', { className: 'gitbar-clone-done' }, t('githubCloneDone')),
                  h('span', { className: 'gitbar-clone-value', title: cloneJobPath }, cloneJobPath)
                ),
                h(
                  'div',
                  { className: 'gitbar-github-actions' },
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'gitbar-btn gitbar-github-primary',
                      onClick: function () {
                        openClonedWorkspace(cloneJobPath)
                      }
                    },
                    t('githubOpenWorkspace')
                  )
                )
              )
            } else if (cloneJobState === 'failed') {
              cloneJobNode = h(
                'div',
                { className: 'gitbar-clone', key: 'clone' },
                h('div', { className: 'gitbar-clone-error' }, cloneReasonText(t, cloneJob.reason, cloneJob.detail)),
                h(
                  'div',
                  { className: 'gitbar-github-actions' },
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'gitbar-btn gitbar-github-primary',
                      disabled: pending === 'clone',
                      onClick: function () {
                        setRepo(toText(cloneJob.repo))
                        cloneRepo(toText(cloneJob.repo))
                      }
                    },
                    t('githubCloneRetry')
                  )
                )
              )
            } else {
              var rawPercent = toNumber(cloneJob.percent)
              var clonePercent = rawPercent === null ? 0 : Math.max(0, Math.min(100, rawPercent))
              cloneJobNode = h(
                'div',
                { className: 'gitbar-clone', key: 'clone' },
                h(
                  'div',
                  { className: 'gitbar-clone-row' },
                  h(
                    'span',
                    { className: 'gitbar-clone-meta' },
                    cloneStageText(t, cloneJob.stage || cloneJobState) + (clonePercent > 0 ? ' ' + clonePercent + '%' : '…')
                  ),
                  h('span', { className: 'gitbar-spacer' }),
                  h('span', { className: 'gitbar-clone-value', title: cloneJobPath }, cloneJobPath)
                ),
                h(
                  'div',
                  { className: 'gitbar-clone-bar' },
                  h('span', { className: 'gitbar-clone-fill', style: { width: clonePercent + '%' } })
                )
              )
            }
          }
          if (error) {
            content.push(h('div', { className: 'gitbar-github-error', key: 'error', role: 'alert' }, error))
          }

          if (!signedIn) {
            content.push(
              h(
                'div',
                { className: 'gitbar-github-tabs', key: 'tabs' },
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'gitbar-github-tab' + (mode === 'pat' ? ' gitbar-github-tab-on' : ''),
                    onClick: function () {
                      setMode('pat')
                    }
                  },
                  t('githubPatLabel')
                ),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'gitbar-github-tab' + (mode === 'device' ? ' gitbar-github-tab-on' : ''),
                    onClick: function () {
                      setMode('device')
                    }
                  },
                  t('githubUseBrowser')
                )
              )
            )
            if (mode === 'pat') {
              content.push(
                h('div', { className: 'gitbar-github-hint', key: 'pat-hint' }, t('githubPatHint')),
                h(
                  'div',
                  { className: 'gitbar-github-actions', key: 'pat-row' },
                  h('input', {
                    type: 'password',
                    className: 'gitbar-github-input',
                    value: pat,
                    placeholder: 'ghp_…',
                    'aria-label': t('githubPatLabel'),
                    autoComplete: 'off',
                    spellCheck: false,
                    disabled: pending === 'login',
                    onChange: function (event) {
                      setPat(event && event.target ? event.target.value : '')
                    }
                  }),
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'gitbar-btn gitbar-github-primary',
                      disabled: pending === 'login' || toText(pat).trim() === '',
                      onClick: loginWithPat
                    },
                    t('githubPatSignIn')
                  )
                )
              )
            } else if (!deviceReady) {
              // No OAuth app to talk to: tell the user instead of failing at
              // /device/start, and offer the token path.
              content.push(
                h('div', { className: 'gitbar-github-hint', key: 'dev-off' }, t('githubDeviceUnavailable')),
                clientIdForm,
                customActiveRow,
                h(
                  'div',
                  { className: 'gitbar-github-actions', key: 'dev-off-actions' },
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'gitbar-btn gitbar-github-primary',
                      onClick: function () {
                        setMode('pat')
                      }
                    },
                    t('githubUsePat')
                  )
                )
              )
            } else if (!device) {
              content.push(
                h('div', { className: 'gitbar-github-hint', key: 'dev-hint' }, t('githubDeviceHint')),
                shippedHint,
                customActiveRow,
                customToggleRow,
                clientIdForm,
                h(
                  'div',
                  { className: 'gitbar-github-actions', key: 'dev-start' },
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'gitbar-btn gitbar-github-primary',
                      disabled: pending === 'device',
                      onClick: startDevice
                    },
                    t('githubUseBrowser')
                  )
                )
              )
            } else {
              content.push(
                h(
                  'div',
                  { className: 'gitbar-github-actions', key: 'dev-code' },
                  h('span', { className: 'gitbar-github-code' }, t('githubDeviceCode') + ' ' + device.userCode),
                  device.verificationUri
                    ? h(
                      'a',
                      {
                        className: 'gitbar-github-link',
                        href: device.verificationUri,
                        target: '_blank',
                        rel: 'noreferrer noopener',
                        title: t('githubDeviceOpen')
                      },
                      device.verificationUri
                    )
                    : null
                ),
                shippedHint,
                h('div', { className: 'gitbar-github-hint', key: 'dev-wait' }, t('githubDeviceWaiting')),
                h(
                  'div',
                  { className: 'gitbar-github-actions', key: 'dev-cancel' },
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'gitbar-btn',
                      onClick: function () {
                        stopDevice()
                        setError('')
                      }
                    },
                    t('cancel')
                  )
                )
              )
            }
          } else {
            content.push(
              h('div', { className: 'gitbar-github-hint', key: 'clone-title' }, t('githubNewWorkspace')),
              rootRow,
              previewRow,
              cloneJobNode,
              h(
                'div',
                { className: 'gitbar-github-actions', key: 'search' },
                h('input', {
                  type: 'text',
                  className: 'gitbar-github-input',
                  value: repoQuery,
                  placeholder: t('githubReposPlaceholder'),
                  'aria-label': t('githubReposPlaceholder'),
                  autoComplete: 'off',
                  spellCheck: false,
                  disabled: pending === 'clone',
                  onChange: function (event) {
                    setRepoQuery(event && event.target ? event.target.value : '')
                  }
                })
              )
            )
            if (repos && repos.loading === true) {
              content.push(h('div', { className: 'gitbar-github-empty', key: 'repos-loading' }, t('loading')))
            } else if (repos && repos.ok === false) {
              content.push(h('div', { className: 'gitbar-github-error', key: 'repos-error' }, repos.error))
            } else if (repos && repos.ok === true) {
              var repoRows = []
              var list = repos.repos && typeof repos.repos.length === 'number' ? repos.repos : []
              for (var repoAt = 0; repoAt < list.length; repoAt += 1) {
                var entry = list[repoAt] && typeof list[repoAt] === 'object' ? list[repoAt] : {}
                var fullName = toText(entry.fullName)
                if (!fullName) continue
                repoRows.push(
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'gitbar-github-repo' + (toText(repo).trim() === fullName ? ' gitbar-github-repo-on' : ''),
                      key: 'repo-' + fullName,
                      title: fullName,
                      onClick: function (boundName) {
                        return function () {
                          setRepo(boundName)
                          setError('')
                        }
                      }(fullName)
                    },
                    h('span', { className: 'gitbar-github-repo-name' }, fullName),
                    entry.private === true ? h('span', { className: 'gitbar-github-tag' }, t('githubPrivate')) : null,
                    toText(entry.description) ? h('span', { className: 'gitbar-github-repo-desc' }, toText(entry.description)) : null
                  )
                )
              }
              content.push(
                repoRows.length > 0
                  ? h('div', { className: 'gitbar-github-repos', key: 'repos' }, repoRows)
                  : h('div', { className: 'gitbar-github-empty', key: 'repos-empty' }, t('githubReposEmpty'))
              )
            }
            content.push(
              h(
                'div',
                { className: 'gitbar-github-actions', key: 'clone' },
                h('input', {
                  type: 'text',
                  className: 'gitbar-github-input',
                  value: repo,
                  placeholder: 'owner/repo',
                  'aria-label': t('githubClone'),
                  autoComplete: 'off',
                  spellCheck: false,
                  disabled: pending === 'clone',
                  onChange: function (event) {
                    setRepo(event && event.target ? event.target.value : '')
                  }
                }),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'gitbar-btn gitbar-github-primary',
                    disabled: pending === 'clone' || cloneRunning || toText(repo).trim() === '',
                    onClick: cloneRepo
                  },
                  pending === 'clone' ? t('githubCloning') : t('githubClone')
                )
              )
            )
            if (cloneResult && cloneResult.path) {
              content.push(
                h(
                  'div',
                  { className: 'gitbar-github-path', key: 'cloned', title: cloneResult.path },
                  h('span', null, cloneResult.path)
                )
              )
            }
          }

          rows.push(h('div', { className: 'gitbar-github-panel', key: 'panel' }, content))
        }

        return h('div', { className: 'gitbar-github' }, rows)
      } catch (error2) {
        return null
      }
    }

    function CommitPanel(props) {
      var t = props.t || translate
      var sessionId = toText(props.sessionId)
      var detached = props.detached === true

      var countsAll = toNumber(props.countsAll)
      if (countsAll === null) countsAll = 0
      var ahead = toNumber(props.ahead)
      if (ahead === null) ahead = 0
      var upstream = toText(props.upstream)
      var canCommit = countsAll > 0
      var canPush = countsAll > 0 || ahead > 0 || upstream === ''

      var messageHook = useState('')
      var message = messageHook[0]
      var setMessage = messageHook[1]
      var branchHook = useState(defaultWipBranch())
      var branch = branchHook[0]
      var setBranch = branchHook[1]
      var userHook = useState('git')
      var username = userHook[0]
      var setUsername = userHook[1]
      var passwordHook = useState('')
      var password = passwordHook[0]
      var setPassword = passwordHook[1]
      var phaseHook = useState('form')
      var phase = phaseHook[0]
      var setPhase = phaseHook[1]
      var committedHook = useState(null)
      var committed = committedHook[0]
      var setCommitted = committedHook[1]
      var statusHook = useState(null)
      var status = statusHook[0]
      var setStatus = statusHook[1]
      var pendingHook = useState('')
      var pending = pendingHook[0]
      var setPending = pendingHook[1]
      var alive = useRef(true)
      var commitAbort = useRef(null)
      var pushAbort = useRef(null)
      var undoHook = useState(false)
      var undoConfirm = undoHook[0]
      var setUndoConfirm = undoHook[1]
      var undoPendingHook = useState(false)
      var undoPending = undoPendingHook[0]
      var setUndoPending = undoPendingHook[1]
      var undoAbort = useRef(null)

      useEffect(function () {
        alive.current = true
        return function () {
          alive.current = false
          try {
            if (commitAbort.current) commitAbort.current()
          } catch (error) {
            /* ignore */
          }
          commitAbort.current = null
          try {
            if (pushAbort.current) pushAbort.current()
          } catch (error) {
            /* ignore */
          }
          pushAbort.current = null
          try {
            if (undoAbort.current) undoAbort.current()
          } catch (error) {
            /* ignore */
          }
          undoAbort.current = null
          // One-shot credentials never outlive the panel.
          try {
            setPassword('')
          } catch (error) {
            /* ignore */
          }
        }
      }, [])

      // Esc dismisses the undo confirm before closing the sheet.
      useEffect(function () {
        if (!undoConfirm) return undefined
        var dismiss = function () {
          setUndoConfirm(false)
        }
        setActiveConfirmDismiss(dismiss)
        return function () {
          clearActiveConfirmDismiss(dismiss)
        }
      }, [undoConfirm])

      function lastCommitInfo() {
        var safe = props.lastCommit && typeof props.lastCommit === 'object' ? props.lastCommit : {}
        var short = toText(safe.hash) || toText(safe.short) || (toText(safe.full) || '').slice(0, 7)
        var subject = toText(safe.subject)
        if (subject.length > 48) subject = subject.slice(0, 48) + '…'
        return { short: short, subject: subject }
      }

      function undoLastCommit() {
        if (undoPending) return
        setUndoPending(true)
        setStatus(null)
        try {
          if (undoAbort.current) undoAbort.current()
        } catch (error) {
          /* ignore */
        }
        undoAbort.current = requestJson(
          withQuery(UNDO_COMMIT_URL, [{ key: 'session', value: sessionId }]),
          { method: 'POST', body: '{}' },
          function (result) {
            if (!alive.current) return
            undoAbort.current = null
            setUndoPending(false)
            setUndoConfirm(false)
            if (result && result.ok === true) {
              try {
                if (typeof props.onUndone === 'function') props.onUndone(result)
              } catch (error) {
                /* ignore */
              }
              return
            }
            setStatus({ tone: 'error', text: operationErrorText(result && result.reason, result && result.detail) })
          }
        )
      }

      function detailLine(detail) {
        var line = toText(detail).split('\n')[0]
        if (line.length > 120) line = line.slice(0, 120) + '…'
        return line
      }

      function pushReasonText(reason, detail) {
        var safe = toText(reason)
        if (safe === 'no-remote') return t('pushNoRemote')
        if (safe === 'out-of-date') return t('pushOutOfDate')
        if (safe === 'detached') return t('pushDetached')
        var line = detailLine(detail)
        return line || t('pushIncomplete')
      }

      function failureText(reason, detail) {
        var safe = toText(reason)
        if (safe === 'nothing-to-commit') return t('nothingToCommit')
        if (safe === 'conflicted') return t('commitConflicts')
        if (safe === 'invalid-branch') return t('invalidBranch')
        if (safe === 'branch-exists') return t('branchExists')
        if (safe === 'not-a-repository') return t('notRepo')
        if (safe === 'detached') return t('detachedNeedsBranch')
        if (safe === 'nothing-to-push') return t('nothingToPush')
        var line = detailLine(detail)
        return line || t('commitFailed')
      }

      function closePanel() {
        try {
          setPassword('')
        } catch (error) {
          /* ignore */
        }
        try {
          if (typeof props.onClose === 'function') props.onClose()
        } catch (error) {
          /* ignore */
        }
      }

      function submit(shouldPush) {
        if (pending !== '') return
        if (shouldPush === true ? !canPush : !canCommit) return
        setPending('commit')
        setStatus(null)
        var body = { message: toText(message).trim(), push: shouldPush === true }
        if (detached) body.branch = toText(branch).trim()
        try {
          if (commitAbort.current) commitAbort.current()
        } catch (error) {
          /* ignore */
        }
        commitAbort.current = requestJson(
          withQuery(AUTO_COMMIT_URL, [{ key: 'session', value: sessionId }]),
          { method: 'POST', body: JSON.stringify(body) },
          function (result) {
            if (!alive.current) return
            commitAbort.current = null
            setPending('')
            if (result && result.ok === true) {
              var short = toText(result.short)
              var subject = toText(result.subject)
              var committedNow = result.committed === true
              setCommitted({ short: short, subject: subject, committed: committedNow })
              if (result.pushed === true) {
                try {
                  if (typeof props.onDone === 'function') props.onDone(result)
                } catch (error) {
                  /* ignore */
                }
                return
              }
              // The commit landed; tell the capsule to refresh once, then deal
              // with the push in this panel.
              try {
                if (typeof props.onCommitted === 'function') props.onCommitted(result)
              } catch (error) {
                /* ignore */
              }
              if (result.needsCredentials === true) {
                setPhase('credentials')
                setStatus(null)
                return
              }
              setPhase('retry')
              setStatus({
                tone: 'warn',
                text:
                  (committedNow && short ? t('committed') + ' ' + short + ' · ' : '') +
                  t('pushIncomplete') + t('pushReasonSep') + pushReasonText(result.pushReason, result.pushDetail)
              })
              return
            }
            setStatus({ tone: 'error', text: failureText(result && result.reason, result && result.detail) })
          }
        )
      }

      function retryPush() {
        if (pending !== '') return
        setPending('push')
        setStatus(null)
        var body = {}
        var user = toText(username).trim()
        if (user) body.username = user
        if (toText(password)) body.password = toText(password)
        try {
          if (pushAbort.current) pushAbort.current()
        } catch (error) {
          /* ignore */
        }
        pushAbort.current = requestJson(
          withQuery(PUSH_URL, [{ key: 'session', value: sessionId }]),
          { method: 'POST', body: JSON.stringify(body) },
          function (result) {
            if (!alive.current) return
            pushAbort.current = null
            setPending('')
            if (result && result.ok === true) {
              try {
                if (typeof props.onPushed === 'function') props.onPushed(result, toText(branch))
              } catch (error) {
                /* ignore */
              }
              return
            }
            setStatus({ tone: 'error', text: pushReasonText(result && result.reason, result && result.pushDetail) })
            if (result && result.needsCredentials === true) setPhase('credentials')
          }
        )
      }

      try {
        var busy = pending !== ''
        var retryMode = phase === 'credentials' || phase === 'retry'
        var children = []

        children.push(
          h(
            'div',
            { className: 'gitbar-commitpanel-head', key: 'head' },
            h('span', { className: 'gitbar-commitpanel-title' }, t('autoCommit')),
            h(
              'button',
              {
                type: 'button',
                className: 'gitbar-btn',
                title: t('close'),
                'aria-label': t('close'),
                onClick: closePanel
              },
              closeGlyph()
            )
          )
        )

        if (!retryMode && toText(props.githubLogin)) {
          children.push(
            h(
              'label',
              { className: 'gitbar-commitpanel-identity', key: 'identity' },
              h('input', {
                type: 'checkbox',
                checked: props.githubIdentity === true,
                disabled: busy,
                'aria-label': toText(t('githubIdentityLine')).replace('{login}', toText(props.githubLogin)),
                onChange: function (event) {
                  try {
                    if (typeof props.onGithubIdentity === 'function') {
                      props.onGithubIdentity(Boolean(event && event.target && event.target.checked))
                    }
                  } catch (error) {
                    /* ignore */
                  }
                }
              }),
              h('span', null, toText(t('githubIdentityLine')).replace('{login}', toText(props.githubLogin)))
            )
          )
        }

        if (!retryMode) {
          children.push(
            h(
              'label',
              { className: 'gitbar-commitpanel-field', key: 'message' },
              h('span', { className: 'gitbar-commitpanel-label' }, t('commitMessage')),
              h('textarea', {
                className: 'gitbar-commitpanel-input',
                rows: 2,
                maxLength: 300,
                placeholder: t('commitMessagePlaceholder'),
                value: message,
                disabled: busy,
                onChange: function (event) {
                  try {
                    setMessage(event && event.target ? event.target.value : '')
                  } catch (error) {
                    /* ignore */
                  }
                }
              })
            )
          )
        }

        if (!retryMode && detached) {
          children.push(
            h(
              'label',
              { className: 'gitbar-commitpanel-field', key: 'branch' },
              h('span', { className: 'gitbar-commitpanel-label' }, t('branchLabel')),
              h('input', {
                type: 'text',
                className: 'gitbar-commitpanel-input',
                value: branch,
                disabled: busy,
                placeholder: 'wip/20240101-1200',
                onChange: function (event) {
                  try {
                    setBranch(event && event.target ? event.target.value : '')
                  } catch (error) {
                    /* ignore */
                  }
                }
              }),
              h('span', { className: 'gitbar-commitpanel-hint' }, t('detachedBranchHint'))
            )
          )
        }

        if (retryMode && committed && committed.committed !== false && committed.short) {
          children.push(
            h('div', { className: 'gitbar-commitpanel-note', key: 'note' }, t('committed') + ' ' + committed.short)
          )
        }

        if (retryMode) {
          children.push(
            h(
              'div',
              { className: 'gitbar-commitpanel-hint', key: 'credhint' },
              t('credentialHint')
            )
          )
          children.push(
            h(
              'label',
              { className: 'gitbar-commitpanel-field', key: 'user' },
              h('span', { className: 'gitbar-commitpanel-label' }, t('credentialUser')),
              h('input', {
                type: 'text',
                className: 'gitbar-commitpanel-input',
                value: username,
                disabled: busy,
                autoComplete: 'off',
                onChange: function (event) {
                  try {
                    setUsername(event && event.target ? event.target.value : '')
                  } catch (error) {
                    /* ignore */
                  }
                }
              })
            )
          )
          children.push(
            h(
              'label',
              { className: 'gitbar-commitpanel-field', key: 'password' },
              h('span', { className: 'gitbar-commitpanel-label' }, t('credentialPassword')),
              h('input', {
                type: 'password',
                className: 'gitbar-commitpanel-input',
                value: password,
                disabled: busy,
                autoComplete: 'off',
                spellCheck: false,
                onChange: function (event) {
                  try {
                    setPassword(event && event.target ? event.target.value : '')
                  } catch (error) {
                    /* ignore */
                  }
                }
              })
            )
          )
        }

        if (!retryMode && canPush && countsAll === 0 && ahead > 0) {
          children.push(
            h(
              'div',
              { className: 'gitbar-commitpanel-hint', key: 'pushonly' },
              t('pushOnlyHint').replace('{n}', String(ahead))
            )
          )
        }

        if (status && status.text) {
          children.push(
            h(
              'div',
              {
                className: 'gitbar-commitpanel-status gitbar-commitpanel-status-' + (status.tone === 'warn' ? 'warn' : status.tone === 'ok' ? 'ok' : 'error'),
                role: 'status',
                key: 'status'
              },
              status.text
            )
          )
        }

        var actions = []
        if (!retryMode) {
          actions.push(
            h(
              'button',
              {
                type: 'button',
                key: 'undo',
                className: 'gitbar-commitpanel-undo',
                title: t('undoCommit'),
                disabled: busy || undoPending,
                onClick: function () {
                  setUndoConfirm(true)
                }
              },
              t('undoCommit')
            )
          )
          actions.push(h('span', { className: 'gitbar-spacer', key: 'undogap' }))
          actions.push(
            h(
              'button',
              {
                type: 'button',
                key: 'only',
                className: 'gitbar-btn gitbar-commitpanel-btn',
                disabled: busy || !canCommit,
                title: canCommit ? t('commitOnly') : t('nothingToCommit'),
                onClick: function () {
                  submit(false)
                }
              },
              t('commitOnly')
            )
          )
          actions.push(
            h(
              'button',
              {
                type: 'button',
                key: 'push',
                className: 'gitbar-btn gitbar-commitpanel-btn gitbar-commitpanel-primary',
                disabled: busy || !canPush,
                title: canPush ? t('pushNow') : t('nothingToPush'),
                onClick: function () {
                  submit(true)
                }
              },
              t('pushNow')
            )
          )
          actions.push(
            h(
              'button',
              {
                type: 'button',
                key: 'cancel',
                className: 'gitbar-btn gitbar-commitpanel-btn',
                disabled: busy,
                onClick: closePanel
              },
              t('cancel')
            )
          )
        } else {
          actions.push(
            h(
              'button',
              {
                type: 'button',
                key: 'retry',
                className: 'gitbar-btn gitbar-commitpanel-btn gitbar-commitpanel-primary',
                disabled: busy,
                onClick: retryPush
              },
              t('retryPush')
            )
          )
          actions.push(
            h(
              'button',
              {
                type: 'button',
                key: 'close',
                className: 'gitbar-btn gitbar-commitpanel-btn',
                disabled: busy,
                onClick: closePanel
              },
              t('close')
            )
          )
        }
        if (undoConfirm) {
          var undoInfo = lastCommitInfo()
          children.push(
            h(
              'div',
              { className: 'gitbar-confirm', key: 'undoconfirm' },
              h(
                'span',
                { className: 'gitbar-confirm-text' },
                toText(t('confirmUndo')).replace('{short}', undoInfo.short).replace('{subject}', undoInfo.subject)
              ),
              h('button', { type: 'button', className: 'gitbar-btn', disabled: undoPending, onClick: undoLastCommit }, t('confirm')),
              h('button', { type: 'button', className: 'gitbar-btn', disabled: undoPending, onClick: function () { setUndoConfirm(false) } }, t('cancel'))
            )
          )
        }
        children.push(h('div', { className: 'gitbar-commitpanel-actions', key: 'actions' }, actions))

        return h(
          'div',
          {
            className: 'gitbar-commitpanel',
            role: 'dialog',
            'aria-label': t('autoCommit'),
            'aria-busy': busy ? 'true' : 'false'
          },
          children
        )
      } catch (error) {
        return null
      }
    }

    function GitPanel(props) {
      var t = props.t || translate
      var data = props.data
      var view = props.view && typeof props.view === 'object' ? props.view : LIST_VIEW
      var pos = props.pos || { top: 56, right: 12, width: 460, maxHeight: 480 }
      var mode = view.mode === 'branches' || view.mode === 'commit' || view.mode === 'review' || view.mode === 'graph' ? view.mode : 'list'
      var state = data && data.ok === true ? data : null
      var briefState = Boolean(state && state.brief === true)
      var notRepo = Boolean(data && data.ok === false)
      // The graph search + pagination state lives here, so opening a commit
      // detail (which unmounts GraphView) keeps the typed query.
      var graphQueryHook = useState('')
      var graphQuery = graphQueryHook[0]
      var setGraphQuery = graphQueryHook[1]
      var graphAppliedHook = useState('')
      var graphApplied = graphAppliedHook[0]
      var setGraphApplied = graphAppliedHook[1]
      var graphLoadedHook = useState(0)
      var graphLoaded = graphLoadedHook[0]
      var setGraphLoaded = graphLoadedHook[1]

      useEffect(function () {
        setGraphQuery('')
        setGraphApplied('')
        setGraphLoaded(0)
      }, [props.sessionId])

      var searchEsc = function () {
        try {
          if (mode !== 'graph') return false
          if (toText(graphQuery).trim() === '') return false
          var doc = typeof document !== 'undefined' ? document : null
          var active = doc && doc.activeElement ? doc.activeElement : null
          if (!active) return false
          var activeClass = typeof active.className === 'string' ? active.className : ''
          if (activeClass.indexOf('gitbar-graph-searchinput') < 0) return false
          setGraphQuery('')
          setGraphApplied('')
          setGraphLoaded(0)
          return true
        } catch (error) {
          return false
        }
      }
      useEffect(function () {
        setActiveSearchEsc(searchEsc)
        return function () {
          clearActiveSearchEsc(searchEsc)
        }
      }, [mode, graphQuery, props.sessionId])

      var style = {
        position: 'fixed',
        top: String(pos.top) + 'px',
        right: String(pos.right) + 'px',
        left: 'auto',
        width: String(pos.width) + 'px',
        maxHeight: String(pos.maxHeight) + 'px',
        zIndex: 2147483000
      }

      try {
        var counts = (state && state.counts) || {}
        var commits = state && state.commits && typeof state.commits.length === 'number' ? state.commits : []
        var branchLabel = state
          ? state.detached
            ? 'HEAD@' + toText(state.head)
            : toText(state.branch) || toText(state.head) || 'HEAD'
          : notRepo
            ? t('notRepo')
            : t('error')

        var headBits = []
        if (state && state.detached) headBits.push(h('span', { className: 'gitbar-chip', key: 'detached' }, t('detached')))
        if (state && state.upstream) {
          if (toNumber(state.ahead) > 0) {
            headBits.push(h('span', { className: 'gitbar-ahead', key: 'ahead', title: t('ahead') }, '↑' + toNumber(state.ahead)))
          }
          if (toNumber(state.behind) > 0) {
            headBits.push(h('span', { className: 'gitbar-behind', key: 'behind', title: t('behind') }, '↓' + toNumber(state.behind)))
          }
          headBits.push(h('span', { className: 'gitbar-upstream', key: 'upstream', title: toText(state.upstream) }, toText(state.upstream)))
        }

        // Always a control, in every state: in graph mode it toggles the body
        // back to the list even when HEAD is detached or state is unavailable.
        var branchControl = h(
          'button',
          {
            type: 'button',
            className: 'gitbar-branchbtn',
            title: mode === 'graph' ? t('backToList') : t('openGraph'),
            'aria-expanded': mode === 'graph' || mode === 'branches' ? 'true' : 'false',
            'aria-haspopup': 'dialog',
            onClick: function () {
              try {
                if (typeof props.onOpenGraph === 'function') props.onOpenGraph()
              } catch (error) {
                /* ignore */
              }
            }
          },
          h('span', { className: 'gitbar-branchbtn-label' }, branchLabel),
          caretGlyph(mode === 'branches')
        )

        var headRow = h(
          'div',
          { className: 'gitbar-panelhead', key: 'head' },
          h('span', { className: 'gitbar-headglyph', 'aria-hidden': 'true' }, branchGlyph(13)),
          branchControl,
          headBits.length > 0 ? h('span', { className: 'gitbar-headmeta' }, headBits) : null,
          h('span', { className: 'gitbar-spacer' }),
          h(
            'button',
            {
              type: 'button',
              className: 'gitbar-btn',
              title: t('refresh'),
              'aria-label': t('refresh'),
              onClick: function () {
                try {
                  if (typeof props.onRefresh === 'function') props.onRefresh()
                } catch (error) {
                  /* ignore */
                }
              }
            },
            refreshGlyph()
          ),
          h(
            'button',
            {
              type: 'button',
              className: 'gitbar-btn',
              title: t('close'),
              'aria-label': t('close'),
              onClick: function () {
                try {
                  if (typeof props.onClose === 'function') props.onClose()
                } catch (error) {
                  /* ignore */
                }
              }
            },
            closeGlyph()
          )
        )

        var flashRow = props.flash ? h('div', { className: 'gitbar-flash', key: 'flash', role: 'status' }, toText(props.flash)) : null

        var chips = []
        if (mode === 'list') {
          if (toNumber(counts.staged) > 0) chips.push(h('span', { className: 'gitbar-chip', key: 'chip-staged' }, t('staged') + ' ' + toNumber(counts.staged)))
          if (toNumber(counts.unstaged) > 0) chips.push(h('span', { className: 'gitbar-chip', key: 'chip-unstaged' }, t('unstaged') + ' ' + toNumber(counts.unstaged)))
          if (toNumber(counts.untracked) > 0) chips.push(h('span', { className: 'gitbar-chip', key: 'chip-untracked' }, t('untracked') + ' ' + toNumber(counts.untracked)))
          if (toNumber(counts.conflicted) > 0) {
            chips.push(h('span', { className: 'gitbar-chip gitbar-chip-error', key: 'chip-conflict' }, t('conflict') + ' ' + toNumber(counts.conflicted)))
          }
        }
        var chipsRow = chips.length > 0 ? h('div', { className: 'gitbar-chips', key: 'chips' }, chips) : null

        var body
        if (mode === 'branches') {
          body = h(BranchPicker, {
            t: t,
            sessionId: props.sessionId,
            token: props.branchesToken,
            onSwitched: props.onSwitched,
            onClose: props.onTogglePicker
          })
        } else if (mode === 'commit') {
          body = h(CommitDetail, {
            t: t,
            sessionId: props.sessionId,
            hash: view.hash,
            iso: view.iso,
            when: view.when,
            onBack: props.onCommitBack,
            onHandoff: props.onCommitFile
          })
        } else if (mode === 'review') {
          body = h(DiffReview, {
            t: t,
            path: view.path,
            hash: toText(view.hash),
            hashShort: toText(view.hashShort),
            staged: view.staged === true,
            untracked: view.untracked === true,
            sessionId: props.sessionId,
            token: props.token,
            onBack: props.onBack
          })
        } else if (mode === 'graph') {
          body = h(GraphView, {
            t: t,
            sessionId: props.sessionId,
            token: props.graphToken,
            stateBranch: state && state.detached !== true ? toText(state.branch) : '',
            stateDetached: Boolean(state && state.detached),
            onSwitched: props.onGraphSwitched,
            onOpenPicker: props.onOpenPicker,
            onBack: props.onBack,
            onCommit: props.onCommitPanel,
            query: graphQuery,
            appliedQuery: graphApplied,
            loadedCount: graphLoaded,
            onQueryChange: function (next) {
              setGraphQuery(toText(next))
            },
            onApplyQuery: function (next) {
              setGraphApplied(toText(next).trim())
              setGraphLoaded(0)
            },
            onClearQuery: function () {
              setGraphQuery('')
              setGraphApplied('')
              setGraphLoaded(0)
            },
            onLoadedChange: function (count) {
              var loaded = toNumber(count)
              setGraphLoaded(loaded === null ? 0 : loaded)
            },
            onOpenCommit: props.onOpenCommit
          })
        } else if (notRepo) {
          body = h(
            'div',
            { className: 'gitbar-empty' },
            h('div', null, t('notRepo')),
            toText(data && data.cwd) ? h('div', { className: 'gitbar-muted', style: { marginTop: 4 } }, toText(data && data.cwd)) : null
          )
        } else if (!state) {
          body = h('div', { className: 'gitbar-empty' }, props.failed === true ? t('error') : t('loading'))
        } else if (briefState) {
          // A collapsed-mode brief payload carries no files yet: wait for the
          // full fetch that the open effect already kicked off.
          body = h('div', { className: 'gitbar-empty' }, t('loading'))
        } else {
          body = [
            h(GitHubSection, {
              key: 'github',
              t: t,
              sessionId: props.sessionId,
              status: props.github,
              clone: props.clone,
              onCloneStart: props.onCloneStart,
              onStatus: props.onGithubStatus,
              onReload: props.onGithubReload,
              onFlash: props.onFlash
            }),
            h(ChangedFileList, {
              key: 'files',
              t: t,
              groups: groupFiles(state),
              sessionId: props.sessionId,
              onOpen: props.onOpenFile,
              onChanged: props.onListChanged,
              onFlash: props.onFlash
            })
          ]
        }

        var bodyNode = h(
          'div',
          {
            className: 'gitbar-body' + (mode === 'graph' ? ' gitbar-body-graph' : '') + (props.bodyAnim ? ' ' + props.bodyAnim : ''),
            key: 'body-' + (toNumber(props.bodyKey) || 0),
            onAnimationEnd: function (event) {
              try {
                if (!event || event.target !== event.currentTarget) return
                if (typeof props.onBodyAnimEnd === 'function') props.onBodyAnimEnd()
              } catch (error) {
                /* ignore */
              }
            }
          },
          body
        )

        var children = [headRow]
        if (flashRow) children.push(flashRow)
        if (chipsRow) children.push(chipsRow)
        children.push(bodyNode)
        if (mode === 'list' && commits.length > 0 && !briefState) {
          children.push(
            h(CommitList, {
              key: 'commits',
              t: t,
              commits: commits,
              open: props.commitsOpen === true,
              onToggle: props.onToggleCommits,
              onOpen: props.onOpenCommit
            })
          )
        }
        if (props.commitPanelOpen === true) {
          children.push(
            h(CommitPanel, {
              key: 'commitpanel',
              t: t,
              sessionId: props.sessionId,
              detached: Boolean(state && state.detached),
              lastCommit: state && state.commits && state.commits.length > 0 ? state.commits[0] : null,
              onUndone: props.onCommitUndone,
              githubLogin: props.github && props.github.ok === true && props.github.signedIn === true && props.github.account ? toText(props.github.account.login) : '',
              githubIdentity: Boolean(props.github && props.github.ok === true && props.github.config && props.github.config.useGithubIdentity === true),
              onGithubIdentity: props.onGithubIdentity,
              countsAll: toNumber(state && state.counts && state.counts.all) || 0,
              ahead: toNumber(state && state.ahead) || 0,
              upstream: state ? toText(state.upstream) : '',
              onClose: props.onCloseCommitPanel,
              onDone: props.onCommitDone,
              onCommitted: props.onCommitCommitted,
              onPushed: props.onPushDone
            })
          )
        }

        var panel = h(
          'div',
          {
            className: 'gitbar-panel' + (props.panelClass ? ' ' + props.panelClass : ''),
            style: style,
            role: 'dialog',
            'aria-label': t('changes'),
            'data-dsh-git-bar': 'panel',
            onAnimationEnd: function (event) {
              try {
                if (!event || event.target !== event.currentTarget) return
                if (typeof props.onPanelEntered === 'function') props.onPanelEntered()
              } catch (error) {
                /* ignore */
              }
            }
          },
          children
        )
        return Guard
          ? h(
            Guard,
            { fallback: h('div', { className: 'gitbar-panel', style: style, role: 'dialog' }, h('div', { className: 'gitbar-empty' }, t('error'))) },
            panel
          )
          : panel
      } catch (error) {
        return h('div', { className: 'gitbar-panel', style: style, role: 'dialog' }, h('div', { className: 'gitbar-empty' }, t('error')))
      }
    }

    /**
     * The registered slot entry: compact pill + anchored popover.
     * Hooks are unconditional; every listener, timer, observer and request is
     * torn down, and the render body cannot throw into the slot.
     */
    function GitCapsule(props) {
      var safeProps = props && typeof props === 'object' ? props : {}
      var t = typeof safeProps.t === 'function' ? safeProps.t : translate
      var sessionId = sessionIdOf(safeProps)

      var sessionRef = useRef(sessionId)
      sessionRef.current = sessionId
      var rootRef = useRef(null)
      var triggerRef = useRef(null)
      var stateAbortRef = useRef(null)
      var containingBlockRef = useRef(null)
      var mountedRef = useRef(true)
      var closeTimerRef = useRef(null)
      var flashTimerRef = useRef(null)
      var settleRef = useRef(null)
      var previousCountRef = useRef(-1)

      var dataHook = useState(null)
      var data = dataHook[0]
      var setData = dataHook[1]
      var failedHook = useState(false)
      var failed = failedHook[0]
      var setFailed = failedHook[1]
      var openHook = useState(false)
      var open = openHook[0]
      var setOpen = openHook[1]
      var closingHook = useState(false)
      var closing = closingHook[0]
      var setClosing = closingHook[1]
      var enteredHook = useState(false)
      var entered = enteredHook[0]
      var setEntered = enteredHook[1]
      var posHook = useState(null)
      var pos = posHook[0]
      var setPos = posHook[1]
      var viewHook = useState(LIST_VIEW)
      var view = viewHook[0]
      var setView = viewHook[1]
      var commitsHook = useState(false)
      var commitsOpen = commitsHook[0]
      var setCommitsOpen = commitsHook[1]
      var tokenHook = useState(0)
      var token = tokenHook[0]
      var setToken = tokenHook[1]
      var branchesTokenHook = useState(0)
      var branchesToken = branchesTokenHook[0]
      var setBranchesToken = branchesTokenHook[1]
      var graphTokenHook = useState(0)
      var graphToken = graphTokenHook[0]
      var setGraphToken = graphTokenHook[1]
      var wideMode = Boolean(view && view.mode === 'graph')
      var viewMode = view && typeof view.mode === 'string' ? view.mode : 'list'
      var flashHook = useState('')
      var flash = flashHook[0]
      var setFlash = flashHook[1]
      var pulseHook = useState(false)
      var pulse = pulseHook[0]
      var setPulse = pulseHook[1]
      var bodyAnimHook = useState('')
      var bodyAnim = bodyAnimHook[0]
      var setBodyAnim = bodyAnimHook[1]
      var bodyKeyHook = useState(0)
      var bodyKey = bodyKeyHook[0]
      var setBodyKey = bodyKeyHook[1]
      var pendingHook = useState(true)
      var pending = pendingHook[0]
      var setPending = pendingHook[1]
      var retryTimerRef = useRef(null)
      var retryIndexRef = useRef(0)
      var pendingSinceRef = useRef(Date.now())
      var settledRef = useRef(false)
      var slowTimerRef = useRef(null)
      var slowActiveRef = useRef(false)
      var cloneHook = useState(function () {
        return gitbarCloneStore.get()
      })
      var cloneJob = cloneHook[0]
      var setCloneJob = cloneHook[1]
      var githubHook = useState(null)
      var githubStatus = githubHook[0]
      var setGithubStatus = githubHook[1]
      var githubAbortRef = useRef(null)
      var commitPanelHook = useState(false)
      var commitPanelOpen = commitPanelHook[0]
      var setCommitPanelOpen = commitPanelHook[1]

      function clearRetryTimer() {
        try {
          if (retryTimerRef.current !== null) clearTimeout(retryTimerRef.current)
        } catch (error) {
          /* ignore */
        }
        retryTimerRef.current = null
      }

      /** One step of the 400/800/1600/3000/5000ms backoff (~10s total). */
      function scheduleRetry() {
        var index = retryIndexRef.current
        if (index >= RETRY_DELAYS.length) return false
        retryIndexRef.current = index + 1
        clearRetryTimer()
        retryTimerRef.current = setTimeout(function () {
          retryTimerRef.current = null
          if (!mountedRef.current) return
          try {
            loadRef.current(true)
          } catch (error) {
            /* ignore */
          }
        }, RETRY_DELAYS[index])
        return true
      }

      function clearSlowRetry() {
        slowActiveRef.current = false
        try {
          if (slowTimerRef.current !== null) clearTimeout(slowTimerRef.current)
        } catch (error) {
          /* ignore */
        }
        slowTimerRef.current = null
      }

      /** While nothing definitive arrived, keep a quiet retry every 30s. */
      function scheduleSlowRetry() {
        if (slowTimerRef.current !== null) return
        slowActiveRef.current = true
        slowTimerRef.current = setTimeout(function () {
          slowTimerRef.current = null
          if (!mountedRef.current) return
          try {
            loadRef.current(true)
          } catch (error) {
            /* ignore */
          }
        }, SLOW_RETRY_MS)
      }

      // Mirror the module-level clone job so the popover can be closed while the
      // poll keeps running here (the capsule outlives the panel).
      useEffect(function () {
        var unsubscribe = gitbarCloneStore.subscribe(function (next) {
          setCloneJob(next)
        })
        setCloneJob(gitbarCloneStore.get())
        return function () {
          try {
            unsubscribe()
          } catch (error) {
            /* ignore */
          }
        }
      }, [])

      useEffect(function () {
        var job = cloneJob
        if (!job || !toText(job.id)) return undefined
        if (job.state === 'done' || job.state === 'failed') return undefined
        var cancelled = false
        var timer = null
        var abort = null
        function schedule() {
          if (cancelled) return
          if (timer !== null) {
            try {
              clearTimeout(timer)
            } catch (error) {
              /* ignore */
            }
          }
          timer = setTimeout(poll, CLONE_POLL_MS)
        }
        function poll() {
          timer = null
          if (cancelled) return
          var current = gitbarCloneStore.get()
          if (!current || toText(current.id) !== toText(job.id)) return
          if (current.state === 'done' || current.state === 'failed') return
          try {
            if (abort) abort()
          } catch (error) {
            /* ignore */
          }
          abort = requestJson(
            withQuery(GITHUB_CLONE_STATUS_URL, [
              { key: 'session', value: sessionRef.current },
              { key: 'id', value: toText(current.id) }
            ]),
            null,
            function (result) {
              if (cancelled) return
              abort = null
              var now = gitbarCloneStore.get()
              if (!now || toText(now.id) !== toText(job.id)) return
              if (result && result.ok === true) {
                var percent = toNumber(result.percent)
                var next = {
                  id: toText(result.id) || now.id,
                  repo: toText(result.repo) || now.repo,
                  root: toText(result.root) || now.root,
                  path: toText(result.path) || now.path,
                  folder: toText(result.folder) || now.folder,
                  state: toText(result.state) || now.state,
                  percent: percent === null ? (toNumber(now.percent) === null ? 0 : now.percent) : percent,
                  stage: toText(result.stage) || now.stage,
                  startedAt: now.startedAt,
                  result: result.result && typeof result.result === 'object' ? result.result : now.result,
                  reason: toText(result.reason),
                  detail: toText(result.detail)
                }
                gitbarCloneStore.set(next)
                if (next.state !== 'done' && next.state !== 'failed') schedule()
                return
              }
              if (toText(result && result.reason) === 'unknown-job') {
                gitbarCloneStore.set({
                  id: now.id,
                  repo: now.repo,
                  root: now.root,
                  path: now.path,
                  state: 'failed',
                  percent: now.percent,
                  stage: now.stage,
                  startedAt: now.startedAt,
                  result: null,
                  reason: 'unknown-job',
                  detail: ''
                })
                return
              }
              schedule()
            }
          )
        }
        schedule()
        return function () {
          cancelled = true
          if (timer !== null) {
            try {
              clearTimeout(timer)
            } catch (error) {
              /* ignore */
            }
          }
          timer = null
          try {
            if (abort) abort()
          } catch (error) {
            /* ignore */
          }
          abort = null
        }
      }, [cloneJob && cloneJob.id, cloneJob && cloneJob.state])

      function loadGithubStatus() {
        try {
          if (githubAbortRef.current) githubAbortRef.current()
        } catch (error) {
          /* ignore */
        }
        githubAbortRef.current = requestJson(
          withQuery(GITHUB_STATUS_URL, [{ key: 'session', value: sessionRef.current }]),
          null,
          function (result) {
            if (!mountedRef.current) return
            githubAbortRef.current = null
            if (result && typeof result === 'object' && result.ok === true) setGithubStatus(result)
            else setGithubStatus({ ok: false })
          }
        )
      }

      function onGithubStatus(result) {
        if (result && typeof result === 'object' && result.ok === true) setGithubStatus(result)
        else loadGithubStatus()
      }

      function onGithubIdentity(next) {
        var wanted = next === true
        setGithubStatus(function (previous) {
          if (!(previous && previous.ok === true)) return previous
          var config = previous.config && typeof previous.config === 'object' ? previous.config : {}
          var copy = {}
          for (var key in config) {
            if (Object.prototype.hasOwnProperty.call(config, key)) copy[key] = config[key]
          }
          copy.useGithubIdentity = wanted
          return {
            ok: true,
            signedIn: previous.signedIn === true,
            account: previous.account || null,
            tokenKind: previous.tokenKind || null,
            connectedAt: previous.connectedAt || null,
            config: copy
          }
        })
        requestJson(
          withQuery(GITHUB_CONFIG_URL, [{ key: 'session', value: sessionRef.current }]),
          { method: 'POST', body: JSON.stringify({ useGithubIdentity: wanted }) },
          function (result) {
            if (!mountedRef.current) return
            if (result && result.ok === true && result.config) {
              setGithubStatus(function (previous) {
                if (!(previous && previous.ok === true)) return previous
                var next2 = {}
                for (var key in previous) {
                  if (Object.prototype.hasOwnProperty.call(previous, key)) next2[key] = previous[key]
                }
                next2.config = result.config
                return next2
              })
              return
            }
            flashMessage(t('githubSettingsFailed'))
            loadGithubStatus()
          }
        )
      }

      function loadState(brief) {
        try {
          if (stateAbortRef.current) stateAbortRef.current()
        } catch (error) {
          /* ignore */
        }
        stateAbortRef.current = null
        var session = toText(sessionRef.current)
        // Without a Session id the Host could only answer for its own cwd.
        if (!session) {
          setPending(true)
          setFailed(false)
          return
        }
        var stateUrl = brief === true
          ? withQuery(STATE_URL, [
            { key: 'session', value: session },
            { key: 'brief', value: '1' }
          ])
          : withQuery(STATE_URL, [{ key: 'session', value: session }])
        stateAbortRef.current = requestJson(stateUrl, null, function (payload) {
          if (!mountedRef.current) return
          var reason = toText(payload && payload.reason)
          if (!payload || payload.ok !== true) {
            var withinWindow = Date.now() - pendingSinceRef.current < RETRY_WINDOW_MS
            var retryable = reason === 'session-pending' || (reason === 'not-a-repository' && withinWindow)
            if (retryable && scheduleRetry()) {
              // After a settled result a transient pending must not blank the pill.
              if (!settledRef.current) setPending(true)
              return
            }
            if (reason === 'session-pending') {
              // Still not ready after the window: settle on the neutral failure.
              settledRef.current = true
              clearRetryTimer()
              setPending(false)
              setData({ ok: false, reason: 'not-a-repository', detail: toText(payload && payload.detail) })
              setFailed(false)
              scheduleSlowRetry()
              return
            }
          }
          settledRef.current = true
          clearRetryTimer()
          setPending(false)
          if (!payload || payload.ok !== true) scheduleSlowRetry()
          else clearSlowRetry()
          if (payload.ok === true || payload.ok === false) {
            setData(payload)
            setFailed(false)
          } else {
            setFailed(true)
            scheduleSlowRetry()
          }
        })
      }
      var loadRef = useRef(loadState)
      loadRef.current = loadState

      function clearCloseTimer() {
        try {
          if (closeTimerRef.current !== null) clearTimeout(closeTimerRef.current)
        } catch (error) {
          /* ignore */
        }
        closeTimerRef.current = null
      }

      function clearFlashTimer() {
        try {
          if (flashTimerRef.current !== null) clearTimeout(flashTimerRef.current)
        } catch (error) {
          /* ignore */
        }
        flashTimerRef.current = null
      }

      function finishClose() {
        clearCloseTimer()
        setOpen(false)
        setClosing(false)
        setEntered(false)
        setView(LIST_VIEW)
        setCommitsOpen(false)
        setBodyAnim('')
      }

      // 1. Mount/unmount bookkeeping: stop in-flight work and every timer.
      useEffect(function () {
        mountedRef.current = true
        var unwatchMotion = watchReducedMotion()
        return function () {
          mountedRef.current = false
          try {
            unwatchMotion()
          } catch (error) {
            /* ignore */
          }
          clearCloseTimer()
          clearFlashTimer()
          clearRetryTimer()
          clearSlowRetry()
          try {
            if (githubAbortRef.current) githubAbortRef.current()
          } catch (error) {
            /* ignore */
          }
          githubAbortRef.current = null
          try {
            if (stateAbortRef.current) stateAbortRef.current()
          } catch (error) {
            /* ignore */
          }
          stateAbortRef.current = null
        }
      }, [])

      // 2. Fetch on mount and whenever the Session changes.
      useEffect(function () {
        pendingSinceRef.current = Date.now()
        retryIndexRef.current = 0
        settledRef.current = false
        clearRetryTimer()
        clearSlowRetry()
        setPending(true)
        setData(null)
        setFailed(false)
        setView(LIST_VIEW)
        setCommitsOpen(false)
        setBodyAnim('')
        clearFlashTimer()
        setFlash('')
        loadRef.current(true)
        loadGithubStatus()
        return function () {
          try {
            if (stateAbortRef.current) stateAbortRef.current()
          } catch (error) {
            /* ignore */
          }
          stateAbortRef.current = null
        }
      }, [sessionId])

      // 3. Fetch whenever the panel opens.
      useEffect(function () {
        if (!open || closing) return undefined
        loadRef.current(false)
        loadGithubStatus()
        return undefined
      }, [open])

      // 4. Poll: 20s collapsed, 5s expanded, paused while the tab is hidden.
      useEffect(function () {
        var timer = null
        function tick() {
          try {
            if (typeof document !== 'undefined' && document.hidden === true) return
          } catch (error) {
            /* treat as visible */
          }
          if (slowActiveRef.current) return
          loadRef.current(!open)
        }
        function arm() {
          if (timer !== null) {
            try {
              clearInterval(timer)
            } catch (error) {
              /* ignore */
            }
            timer = null
          }
          timer = setInterval(tick, open ? POLL_EXPANDED : POLL_COLLAPSED)
        }
        function onVisibility() {
          try {
            if (typeof document !== 'undefined' && document.hidden === true) return
          } catch (error) {
            /* treat as visible */
          }
          tick()
          arm()
        }
        arm()
        try {
          document.addEventListener('visibilitychange', onVisibility)
        } catch (error) {
          /* ignore */
        }
        return function () {
          try {
            document.removeEventListener('visibilitychange', onVisibility)
          } catch (error) {
            /* ignore */
          }
          if (timer !== null) {
            try {
              clearInterval(timer)
            } catch (error) {
              /* ignore */
            }
          }
          timer = null
        }
      }, [open])

      // 5. Keep the fixed popover anchored to the pill.
      useEffect(function () {
        if (!open) return undefined
        function update(remeasure) {
          try {
            var element = triggerRef.current
            if (!element) return
            if (remeasure === true) containingBlockRef.current = fixedContainingBlock(element)
            setPos(computeAnchor(element, containingBlockRef.current, wideMode))
          } catch (error) {
            /* keep the last position */
          }
        }
        function onResize() {
          update(true)
        }
        function onScroll() {
          update(false)
        }
        // Track the column while the right Sidebar opens/closes: the pill moves
        // left, so a single measurement would leave the panel covering it.
        var settleFrames = []
        var settleTimers = []
        function settleAnchor() {
          update(true)
          try {
            if (typeof requestAnimationFrame === 'function') {
              for (var frameAt = 0; frameAt < 10; frameAt += 1) {
                settleFrames.push(
                  requestAnimationFrame(function () {
                    update(true)
                  })
                )
              }
            }
          } catch (error) {
            /* frames are best-effort */
          }
          try {
            settleTimers.push(setTimeout(function () {
              update(true)
            }, 180))
            settleTimers.push(setTimeout(function () {
              update(true)
            }, 360))
          } catch (error) {
            /* timers are best-effort */
          }
        }
        settleRef.current = settleAnchor
        var observer = null
        try {
          var pill = triggerRef.current
          var host = pill && pill.parentElement ? pill.parentElement : pill
          if (host && typeof ResizeObserver === 'function') {
            observer = new ResizeObserver(function () {
              update(true)
            })
            observer.observe(host)
          }
        } catch (error) {
          observer = null
        }
        update(true)
        try {
          window.addEventListener('resize', onResize)
          window.addEventListener('scroll', onScroll, true)
        } catch (error) {
          /* ignore */
        }
        return function () {
          settleRef.current = null
          for (var frameIndex = 0; frameIndex < settleFrames.length; frameIndex += 1) {
            try {
              if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(settleFrames[frameIndex])
            } catch (error) {
              /* ignore */
            }
          }
          settleFrames.length = 0
          for (var timerIndex = 0; timerIndex < settleTimers.length; timerIndex += 1) {
            try {
              clearTimeout(settleTimers[timerIndex])
            } catch (error) {
              /* ignore */
            }
          }
          settleTimers.length = 0
          try {
            if (observer) observer.disconnect()
          } catch (error) {
            /* ignore */
          }
          observer = null
          try {
            window.removeEventListener('resize', onResize)
            window.removeEventListener('scroll', onScroll, true)
          } catch (error) {
            /* ignore */
          }
        }
      }, [open, wideMode])

      // 6. Close on outside click or Escape.
      useEffect(function () {
        if (!open) return undefined
        function onPointerDown(event) {
          try {
            var root = rootRef.current
            var target = event ? event.target : null
            if (root && target && typeof root.contains === 'function' && root.contains(target)) return
            closePanel()
          } catch (error) {
            finishClose()
          }
        }
        function onKeyDown(event) {
          try {
            if (!event) return
            var key = event.key
            if (key === 'Escape' || key === 'Esc' || event.keyCode === 27) {
              if (popLevel()) {
                if (typeof event.preventDefault === 'function') event.preventDefault()
                if (typeof event.stopPropagation === 'function') event.stopPropagation()
                return
              }
              closePanel()
              if (triggerRef.current && typeof triggerRef.current.focus === 'function') triggerRef.current.focus()
            }
          } catch (error) {
            /* ignore */
          }
        }
        try {
          document.addEventListener('mousedown', onPointerDown, true)
          document.addEventListener('keydown', onKeyDown, true)
        } catch (error) {
          /* ignore */
        }
        return function () {
          try {
            document.removeEventListener('mousedown', onPointerDown, true)
            document.removeEventListener('keydown', onKeyDown, true)
          } catch (error) {
            /* ignore */
          }
        }
      }, [open, closing, viewMode, commitPanelOpen])

      // 7. Pulse the pill's count when the number changes.
      useEffect(function () {
        try {
          var state = data && data.ok === true ? data : null
          if (!state) return undefined
          var total = toNumber((state.counts || {}).all)
          if (total === null) return undefined
          var previous = previousCountRef.current
          previousCountRef.current = total
          if (previous < 0 || previous === total || REDUCED_MOTION) return undefined
          setPulse(true)
          var timer = setTimeout(function () {
            if (mountedRef.current) setPulse(false)
          }, motionMs(120))
          return function () {
            try {
              clearTimeout(timer)
            } catch (error) {
              /* ignore */
            }
          }
        } catch (error) {
          return undefined
        }
      }, [data])

      function closePanel() {
        setCommitPanelOpen(false)
        if (!open || closing) return
        if (motionMs(PANEL_EXIT_MS) === 0) {
          finishClose()
          return
        }
        setClosing(true)
        clearCloseTimer()
        closeTimerRef.current = setTimeout(function () {
          if (mountedRef.current) finishClose()
        }, PANEL_EXIT_MS)
      }

      function onToggle() {
        try {
          if (closing) {
            clearCloseTimer()
            setClosing(false)
            setEntered(false)
            return
          }
          if (open) {
            closePanel()
            return
          }
          clearCloseTimer()
          setEntered(false)
          var element = triggerRef.current
          containingBlockRef.current = fixedContainingBlock(element)
          setPos(computeAnchor(element, containingBlockRef.current))
          setView(LIST_VIEW)
          setCommitsOpen(false)
          setBodyAnim('')
          setOpen(true)
        } catch (error) {
          setOpen(true)
        }
      }

      function onRefresh() {
        loadRef.current()
        if (view && view.mode === 'review') setToken(function (value) { return value + 1 })
        if (view && view.mode === 'branches') setBranchesToken(function (value) { return value + 1 })
        if (view && view.mode === 'graph') setGraphToken(function (value) { return value + 1 })
      }

      function onTogglePicker() {
        try {
          setView(view && view.mode === 'branches' ? LIST_VIEW : { mode: 'branches' })
        } catch (error) {
          setView(LIST_VIEW)
        }
      }

      function onOpenGraph() {
        try {
          var leavingGraph = Boolean(view && view.mode === 'graph')
          setView(leavingGraph ? LIST_VIEW : { mode: 'graph' })
          setBodyAnim(motionMs(DETAIL_MS) === 0 ? '' : leavingGraph ? 'gitbar-body-back' : 'gitbar-body-forward')
          setBodyKey(function (value) { return value + 1 })
        } catch (error) {
          setView(LIST_VIEW)
        }
      }

      /** Escape pops one level: any sub-body returns to the list first. */
      function popLevel() {
        try {
          if (activeSearchEsc && activeSearchEsc()) return true
          if (activeConfirmDismiss) {
            activeConfirmDismiss()
            return true
          }
          if (commitPanelOpen) {
            setCommitPanelOpen(false)
            return true
          }
          if (viewMode !== 'list') {
            setView(LIST_VIEW)
            setBodyAnim(motionMs(DETAIL_MS) === 0 ? '' : 'gitbar-body-back')
            setBodyKey(function (value) { return value + 1 })
            return true
          }
        } catch (error) {
          return false
        }
        return false
      }

      function onListChanged() {
        try {
          loadRef.current(false)
        } catch (error) {
          /* ignore */
        }
      }

      function onCommitUndone(result) {
        try {
          setCommitPanelOpen(false)
          var safe = result && typeof result === 'object' ? result : {}
          flashMessage(t('undone') + (toText(safe.undone) ? ' ' + toText(safe.undone) : ''))
          loadRef.current(false)
          setGraphToken(function (value) { return value + 1 })
        } catch (error) {
          /* the commit is already undone */
        }
      }

      function onGraphSwitched() {
        try {
          loadRef.current()
        } catch (error) {
          /* ignore */
        }
      }

      function onOpenCommitPanel() {
        try {
          setCommitPanelOpen(true)
        } catch (error) {
          /* ignore */
        }
      }

      function onCloseCommitPanel() {
        try {
          setCommitPanelOpen(false)
        } catch (error) {
          /* ignore */
        }
      }

      /** Commit accepted by the panel: close it and celebrate. */
      function onCommitDone(result) {
        try {
          setCommitPanelOpen(false)
          var safe = result && typeof result === 'object' ? result : {}
          var short = toText(safe.short)
          var subject = toText(safe.subject)
          if (subject.length > 48) subject = subject.slice(0, 48) + '…'
          if (safe.committed === false) {
            flashMessage(t('pushedCount').replace('{n}', String(toNumber(safe.ahead) || 0)))
          } else if (safe.pushed === true) {
            flashMessage(t('committedPushed') + (short ? ' ' + short : '') + (subject ? ' · ' + subject : ''))
          } else {
            flashMessage(t('committed') + (short ? ' ' + short : ''))
          }
          loadRef.current()
          setGraphToken(function (value) { return value + 1 })
        } catch (error) {
          /* the commit itself already happened */
        }
      }

      /** Partial success: the commit exists, the panel explains the push. */
      function onCommitCommitted(result) {
        try {
          var safe = result && typeof result === 'object' ? result : {}
          if (toText(safe.createdBranch)) setBranchesToken(function (value) { return value + 1 })
          loadRef.current()
        } catch (error) {
          /* ignore */
        }
      }

      /** A retried push landed: close and flash where it went. */
      function onPushDone(result, branchName) {
        try {
          setCommitPanelOpen(false)
          var safe = result && typeof result === 'object' ? result : {}
          var where = toText(safe.upstream) || toText(branchName)
          flashMessage(t('pushed') + (where ? ' · ' + where : ''))
          loadRef.current()
          setGraphToken(function (value) { return value + 1 })
        } catch (error) {
          /* the push itself already happened */
        }
      }

      function onSwitched(branchName) {
        try {
          setBranchesToken(function (value) { return value + 1 })
          setView(LIST_VIEW)
          loadRef.current()
          flashMessage(t('switched') + ' ' + toText(branchName))
        } catch (error) {
          /* the switch itself already happened */
        }
      }

      function onOpenCommit(commit) {
        try {
          var safe = commit && typeof commit === 'object' ? commit : {}
          var hash = toText(safe.full) || toText(safe.hash)
          if (!hash) return
          setView({ mode: 'commit', hash: hash, iso: toText(safe.iso), when: toText(safe.when) })
          setBodyAnim(motionMs(DETAIL_MS) === 0 ? '' : 'gitbar-body-forward')
          setBodyKey(function (value) { return value + 1 })
        } catch (error) {
          /* stay on the list */
        }
      }

      function onCommitBack() {
        setView(LIST_VIEW)
        setBodyAnim(motionMs(DETAIL_MS) === 0 ? '' : 'gitbar-body-back')
        setBodyKey(function (value) { return value + 1 })
        loadRef.current()
      }

      function onBodyAnimEnd() {
        setBodyAnim('')
      }

      function onOpenFile(file, groupKey) {
        try {
          var target = file && typeof file === 'object' ? file : {}
          var path = toText(target.path)
          if (!path) return
          handToReview({
            mode: 'worktree',
            path: path,
            staged: groupKey === 'staged',
            untracked: groupKey === 'untracked' || target.untracked === true,
            sessionId: sessionRef.current
          })
        } catch (error) {
          /* stay on the list */
        }
      }

      function onCommitFile(target) {
        try {
          var safe = target && typeof target === 'object' ? target : {}
          var path = toText(safe.path)
          if (!path) return
          handToReview({
            mode: 'commit',
            path: path,
            hash: toText(safe.hash),
            hashShort: toText(safe.hashShort),
            iso: toText(safe.iso),
            when: toText(safe.when),
            sessionId: sessionRef.current
          })
        } catch (error) {
          /* ignore */
        }
      }

      /**
       * One hand-off path for both review kinds: open the Sidebar tab (or the
       * in-panel review when it is unavailable) and keep the popover open, so
       * the next file is one click away; the flash confirms where it went.
       */
      function handToReview(review) {
        var handed = false
        try {
          handed = openSidebarReview(review)
        } catch (error) {
          handed = false
        }
        if (handed) {
          flashMessage(t('reviewOpened'))
          try {
            if (settleRef.current) settleRef.current()
          } catch (error) {
            /* ignore */
          }
          return
        }
        setView({
          mode: 'review',
          path: review.path,
          hash: review.hash,
          hashShort: review.hashShort,
          staged: review.staged === true,
          untracked: review.untracked === true
        })
        setToken(function (value) { return value + 1 })
      }

      function flashMessage(text) {
        try {
          setFlash(toText(text))
          clearFlashTimer()
          flashTimerRef.current = setTimeout(function () {
            if (mountedRef.current) setFlash('')
          }, FLASH_MS)
        } catch (error) {
          /* ignore */
        }
      }

      function onBack() {
        setView(LIST_VIEW)
        loadRef.current()
      }

      try {
        var state = data && data.ok === true ? data : null
        var notRepo = Boolean(data && data.ok === false)
        var counts = (state && state.counts) || {}
        var all = toNumber(counts.all) || 0
        var conflicts = toNumber(counts.conflicted) || 0

        var dotClass = 'gitbar-dot'
        if (failed) dotClass += ' gitbar-dot-error'
        else if (conflicts > 0) dotClass += ' gitbar-dot-error'
        else if (all > 0) dotClass += ' gitbar-dot-warn'

        var countClass = 'gitbar-count'
        if (conflicts > 0) countClass += ' gitbar-count-error'
        else if (all > 0) countClass += ' gitbar-count-warn'
        if (pulse) countClass += ' gitbar-pulse'

        var pillBranch = ''
        if (pending) pillBranch = '…'
        else if (state) {
          pillBranch = state.detached ? 'HEAD@' + toText(state.head) : toText(state.branch) || toText(state.head)
        }

        var title = pending ? t('identifyingWorkspace') : pillTitle(state, notRepo, failed)

        var pill = h(
          'button',
          {
            type: 'button',
            ref: triggerRef,
            className: 'gitbar-pill' + (open ? ' gitbar-pill-open' : ''),
            title: title,
            'aria-label': title,
            'aria-haspopup': 'true',
            'aria-expanded': open ? 'true' : 'false',
            onClick: onToggle
          },
          h('span', { className: 'gitbar-glyph', 'aria-hidden': 'true' }, branchGlyph(12)),
          pending
            ? h('span', { className: 'gitbar-branch gitbar-branch-muted' }, pillBranch)
            : notRepo
              ? h('span', { className: 'gitbar-branch gitbar-branch-muted' }, t('notRepo'))
              : pillBranch
                ? h('span', { className: 'gitbar-branch' }, pillBranch)
                : null,
          h('span', { className: dotClass, 'aria-hidden': 'true' }),
          state ? h('span', { className: countClass }, String(all)) : null
        )

        var panelClass = stateFor(open || closing, closing).className
        if (entered && panelClass === 'gitbar-panel-anim') panelClass = ''

        var panel = null
        if ((open || closing) && pos) {
          panel = h(GitPanel, {
            key: 'panel',
            t: t,
            data: data,
            failed: failed,
            pos: pos,
            view: view,
            token: token,
            branchesToken: branchesToken,
            graphToken: graphToken,
            sessionId: sessionId,
            commitsOpen: commitsOpen,
            flash: flash,
            panelClass: panelClass,
            bodyAnim: bodyAnim,
            bodyKey: bodyKey,
            onToggleCommits: function () {
              setCommitsOpen(function (value) { return !value })
            },
            onClose: closePanel,
            onRefresh: onRefresh,
            onBack: onBack,
            onOpenFile: onOpenFile,
            onOpenCommit: onOpenCommit,
            onCommitBack: onCommitBack,
            onCommitFile: onCommitFile,
            onTogglePicker: onTogglePicker,
            onOpenGraph: onOpenGraph,
            github: githubStatus,
            clone: cloneJob,
            onCloneStart: function (job) {
              gitbarCloneStore.set(job)
            },
            onGithubStatus: onGithubStatus,
            onGithubReload: loadGithubStatus,
            onGithubIdentity: onGithubIdentity,
            commitPanelOpen: commitPanelOpen,
            onListChanged: onListChanged,
            onFlash: flashMessage,
            onCommitUndone: onCommitUndone,
            onCommitPanel: onOpenCommitPanel,
            onCloseCommitPanel: onCloseCommitPanel,
            onCommitDone: onCommitDone,
            onCommitCommitted: onCommitCommitted,
            onPushDone: onPushDone,
            onOpenPicker: onTogglePicker,
            onGraphSwitched: onGraphSwitched,
            onSwitched: onSwitched,
            onBodyAnimEnd: onBodyAnimEnd,
            onPanelEntered: function () {
              setEntered(true)
            }
          })
        }

        return h(
          'span',
          { className: 'gitbar-root', ref: rootRef },
          h('style', { key: 'gitbar-style' }, CSS),
          pill,
          panel
        )
      } catch (error) {
        // Last resort: keep a harmless, non-throwing pill in the header.
        return h('span', { className: 'gitbar-root' }, h('style', { key: 'gitbar-style' }, CSS), h('span', { className: 'gitbar-pill', title: t('error') }, branchGlyph(12)))
      }
    }

    // ── plugin registration ───────────────────────────────────────────────
    function apply(ctx) {
      try {
        rootCtx = ctx || null
        bindTranslator()
        if (!ctx || !ctx.slots || typeof ctx.slots.inject !== 'function' || typeof ctx.slots.register !== 'function') return

        ctx.slots.inject(SLOT, function () {
          return ctx.slots.register(
            { name: SLOT, id: ENTRY_ID, order: 40 },
            function (slotProps) {
              var merged = {}
              try {
                if (slotProps && typeof slotProps === 'object') {
                  for (var key in slotProps) {
                    if (Object.prototype.hasOwnProperty.call(slotProps, key)) merged[key] = slotProps[key]
                  }
                }
              } catch (error) {
                merged = {}
              }
              merged.t = translate
              return h(GitCapsule, merged)
            }
          )
        })

        // Right Sidebar review tab: the type and its body are registered once.
        // When the registries are missing the popover review stays the fallback.
        var registered = false
        try {
          registered = registerSidebarSurfaces(ctx)
        } catch (error) {
          registered = false
        }
        if (!registered) {
          try {
            if (typeof ctx.inject === 'function') {
              ctx.inject(['sidebarRightTabs'], function (scope) {
                try {
                  registerSidebarSurfaces(scope && typeof scope.get === 'function' ? scope : ctx)
                } catch (error) {
                  /* the fallback stays available */
                }
              })
            }
          } catch (error) {
            /* ignore */
          }
        }
      } catch (error) {
        /* a broken apply must never take the web client down */
      }
    }

    var api = { inject: ['slots'], apply: apply }
    try {
      Object.defineProperty(api, Symbol.toStringTag, { value: 'Module' })
    } catch (error) {
      /* ignore */
    }
    return api
  }
})
