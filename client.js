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
    var REVIEW_PAGE_ADDRESS = 'sidebar://git-review'
    var GRAPH_URL = '/dsh-git-bar/graph'
    var GRAPH_LIMIT = 120
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
      committed: '已提交',
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
      committed: 'Committed',
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
      '.gitbar-group{padding:6px 6px 3px;font-size:11px;font-weight:600;color:var(--dsw-alias-label-secondary)}',
      '.gitbar-row{display:flex;align-items:center;gap:7px;width:100%;box-sizing:border-box;padding:4px 6px;border:none;border-radius:8px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;text-align:left;cursor:pointer;transition:background-color 120ms ease,color 120ms ease}',
      '.gitbar-row:hover{background:var(--dsw-alias-bg-layer-2)}',
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
      '.gitbar-actions{flex:0 0 auto;display:flex;align-items:center;gap:6px;min-width:0;box-sizing:border-box;padding:4px 6px;border-top:1px solid var(--dsw-alias-border-l1)}',
      '.gitbar-actbtn{display:inline-flex;align-items:center;gap:5px;flex:0 0 auto;max-width:100%;box-sizing:border-box;padding:2px 9px;border:1px solid var(--dsw-alias-brand-primary);border-radius:8px;background:var(--dsw-alias-brand-primary);color:var(--dsw-alias-bg-overlay);font:inherit;font-size:11.5px;font-weight:600;white-space:nowrap;cursor:pointer;transition:opacity 120ms ease,transform 120ms ease}',
      '.gitbar-actbtn:hover:not(:disabled){opacity:.92}',
      '.gitbar-actbtn:active:not(:disabled){transform:scale(.99)}',
      '.gitbar-actbtn:focus-visible{outline:none;box-shadow:0 0 0 2px var(--dsw-alias-brand-primary)}',
      '.gitbar-actbtn:disabled{cursor:default;opacity:.55}',
      '.gitbar-actbtn-ready{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px;color:var(--dsw-alias-label-secondary)}',
      '.gitbar-actstatus{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px;color:var(--dsw-alias-state-error-primary)}',
      '@media (prefers-reduced-motion: reduce){.gitbar-panel-anim,.gitbar-panel-closing,.gitbar-pulse,.gitbar-picker,.gitbar-picker-row,.gitbar-commit-detail,.gitbar-body-back,.gitbar-body-forward,.gitbar-commits-shell,.gitbar-actbtn,.gitbar-flash,.gitbar-busy,.gitbar-row,.gitbar-branchrow,.gitbar-commit,.gitbar-filelink,.gitbar-pill,.gitbar-btn,.gitbar-branchbtn,.gitbar-commitstoggle,.gitbar-caret,.gitbar-commitschev,.gitbar-graph,.gitbar-graph-row,.gitbar-graph-status,.gitbar-confirm,.gitbar-graph-status-ok,.gitbar-graph-skeleton,.gitbar-graph-chip,.gitbar-graph-escape{animation:none !important;transition:none !important}}'
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

    /** One changed-file row inside the grouped list. */
    function ChangedFileRow(props) {
      var t = props.t || translate
      var file = props.file || {}
      var group = props.group || {}
      try {
        var path = toText(file.path)
        var parts = splitPath(path)
        var letter = statusLetter(file, group.key)
        var additions = toNumber(file.additions)
        var deletions = toNumber(file.deletions)
        var hasStats = additions !== null || deletions !== null
        var title = path + (group.title ? ' · ' + t(group.title) : '')
        return h(
          'button',
          {
            type: 'button',
            className: 'gitbar-row',
            title: title,
            onClick: function () {
              try {
                if (typeof props.onOpen === 'function') props.onOpen(file, group.key)
              } catch (error) {
                /* a broken handler must not break the list */
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
            : null
        )
      } catch (error) {
        return h('div', { className: 'gitbar-row' }, toText(file.path))
      }
    }

    /** Grouped changed files: 已暂存 / 未暂存 / 未跟踪 / 冲突. */
    function ChangedFileList(props) {
      var t = props.t || translate
      var groups = props.groups
      try {
        if (!groups || groups.length === 0) return h('div', { className: 'gitbar-empty' }, t('clean'))
        var nodes = []
        for (var groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {
          var group = groups[groupIndex]
          nodes.push(h('div', { className: 'gitbar-group', key: 'group-' + group.key }, t(group.title)))
          for (var fileIndex = 0; fileIndex < group.files.length; fileIndex += 1) {
            var file = group.files[fileIndex]
            nodes.push(
              h(ChangedFileRow, {
                key: group.key + ':' + toText(file.path) + ':' + fileIndex,
                t: t,
                file: file,
                group: group,
                onOpen: props.onOpen
              })
            )
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
                    h('span', { className: 'gitbar-when' }, toText(safe.when))
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
              toText(commit.when) +
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
                  h('span', { className: 'gitbar-graph-date', title: toText(commit.iso) }, toText(commit.iso)),
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
            h('div', { className: 'gitbar-graph-rows', key: 'rows' }, items)
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

      // Seed the remembered branch from the capsule's own state.
      useEffect(function () {
        if (stateDetached || !stateBranch) return
        if (graphMemory.previousBranch === stateBranch) return
        graphMemory.previousBranch = stateBranch
        setPreviousBranch(stateBranch)
      }, [stateBranch, stateDetached])

      // One graph fetch per open, and on every refresh token.
      useEffect(function () {
        setPayload({ loading: true })
        return requestJson(
          withQuery(GRAPH_URL, [
            { key: 'session', value: sessionId },
            { key: 'limit', value: String(GRAPH_LIMIT) }
          ]),
          null,
          function (data) {
            if (data && typeof data === 'object' && data.ok === true) {
              setPayload({ ok: true, data: data })
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
          }
        )
      }, [sessionId, refresh, token])

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
          ? { mode: 'commit', path: target.path, hash: target.hash, hashShort: target.hashShort }
          : { mode: 'worktree', path: target.path, staged: target.staged === true, untracked: target.untracked === true }
        right.openResource(REVIEW_ADDRESS, sidebarOpenOptions(params, REVIEW_KIND))
        return true
      } catch (error) {
        return false
      }
    }

    // ── panel ─────────────────────────────────────────────────────────────
    /** The expanded popover: header, counts, picker/list/commit/review body, commits. */
    /** The bottom action bar: auto-commit runs only on an explicit click. */
    function AutoCommitBar(props) {
      var t = props.t || translate
      var sessionId = toText(props.sessionId)
      var pendingHook = useState(false)
      var pending = pendingHook[0]
      var setPending = pendingHook[1]
      var statusHook = useState(null)
      var status = statusHook[0]
      var setStatus = statusHook[1]
      var alive = useRef(true)
      var abortRef = useRef(null)
      var statusTimer = useRef(null)

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
          try {
            if (statusTimer.current !== null) clearTimeout(statusTimer.current)
          } catch (error) {
            /* ignore */
          }
          statusTimer.current = null
        }
      }, [])

      var total = toNumber(props.total)
      if (total === null) total = 0
      var disabled = pending || total === 0

      function showStatus(text) {
        setStatus(toText(text))
        try {
          if (statusTimer.current !== null) clearTimeout(statusTimer.current)
        } catch (error) {
          /* ignore */
        }
        statusTimer.current = setTimeout(function () {
          if (alive.current) setStatus(null)
        }, 5000)
      }

      function reasonText(reason, detail) {
        var safe = toText(reason)
        if (safe === 'nothing-to-commit') return t('nothingToCommit')
        if (safe === 'conflicted') return t('commitConflicts')
        if (safe === 'detached') return t('commitDetached')
        if (safe === 'not-a-repository') return t('notRepo')
        var line = toText(detail).split('\n')[0]
        if (line.length > 120) line = line.slice(0, 120) + '…'
        return line ? t('commitFailed') + ' · ' + line : t('commitFailed')
      }

      function commit() {
        if (pending || total === 0) return
        setPending(true)
        setStatus(null)
        try {
          if (abortRef.current) abortRef.current()
        } catch (error) {
          /* ignore */
        }
        abortRef.current = requestJson(
          withQuery(AUTO_COMMIT_URL, [{ key: 'session', value: sessionId }]),
          { method: 'POST', body: '{}' },
          function (result) {
            if (!alive.current) return
            abortRef.current = null
            setPending(false)
            if (result && result.ok === true) {
              try {
                if (typeof props.onCommitted === 'function') props.onCommitted(result)
              } catch (error) {
                /* ignore */
              }
              return
            }
            showStatus(reasonText(result && result.reason, result && result.detail))
          }
        )
      }

      try {
        return h(
          'div',
          { className: 'gitbar-actions' },
          status
            ? h('span', { className: 'gitbar-actstatus', role: 'status', title: status }, status)
            : h('span', { className: 'gitbar-spacer' }),
          h(
            'button',
            {
              type: 'button',
              className: 'gitbar-actbtn gitbar-autocommit',
              disabled: disabled,
              'aria-busy': pending ? 'true' : 'false',
              'aria-disabled': disabled ? 'true' : 'false',
              title: total === 0 && !pending ? t('clean') : t('autoCommit'),
              onClick: commit
            },
            pending ? h('span', { className: 'gitbar-busy', 'aria-hidden': 'true' }) : null,
            pending ? t('loading') : t('autoCommit')
          )
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
      var notRepo = Boolean(data && data.ok === false)

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
            onBack: props.onBack
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
        } else {
          body = h(ChangedFileList, { t: t, groups: groupFiles(state), onOpen: props.onOpenFile })
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
        if (mode === 'list' && commits.length > 0) {
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
        if (mode === 'list' && !notRepo) {
          children.push(
            h(AutoCommitBar, {
              key: 'actions',
              t: t,
              sessionId: props.sessionId,
              total: toNumber((state && state.counts && state.counts.all) || 0) || 0,
              onCommitted: props.onAutoCommitted
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

      function loadState() {
        try {
          if (stateAbortRef.current) stateAbortRef.current()
        } catch (error) {
          /* ignore */
        }
        stateAbortRef.current = null
        stateAbortRef.current = requestJson(withQuery(STATE_URL, [{ key: 'session', value: sessionRef.current }]), null, function (payload) {
          if (!mountedRef.current) return
          if (payload.ok === true || payload.ok === false) {
            setData(payload)
            setFailed(false)
          } else {
            setFailed(true)
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
        setData(null)
        setFailed(false)
        setView(LIST_VIEW)
        setCommitsOpen(false)
        setBodyAnim('')
        clearFlashTimer()
        setFlash('')
        loadRef.current()
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
        loadRef.current()
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
          loadRef.current()
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
      }, [open, closing, viewMode])

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

      function onGraphSwitched() {
        try {
          loadRef.current()
        } catch (error) {
          /* ignore */
        }
      }

      function onAutoCommitted(result) {
        try {
          var safe = result && typeof result === 'object' ? result : {}
          var short = toText(safe.short)
          var subject = toText(safe.subject)
          if (subject.length > 48) subject = subject.slice(0, 48) + '…'
          flashMessage(t('committed') + (short ? ' ' + short : '') + (subject ? ' · ' + subject : ''))
          loadRef.current()
        } catch (error) {
          /* the commit itself already happened */
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
          setView({ mode: 'commit', hash: hash })
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
        if (state) {
          pillBranch = state.detached ? 'HEAD@' + toText(state.head) : toText(state.branch) || toText(state.head)
        }

        var title = pillTitle(state, notRepo, failed)

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
          notRepo
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
            onAutoCommitted: onAutoCommitted,
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
