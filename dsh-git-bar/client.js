/**
 * dsh-git-bar — browser half.
 *
 * A compact git capsule in the Session header's right-aligned utilities list:
 * branch + change count when collapsed, a fixed-position popover with the
 * grouped changed files when expanded, and an in-panel unified-diff review
 * when a file row is clicked.
 *
 * Everything here is failure tolerant on purpose: the slot blanks its entry
 * when a component throws, so every render path, fetch, clipboard call, timer
 * and listener is wrapped or guarded, and all cleanups are returned.
 *
 * Hand-written ModuleLoader bundle — no build step, no JSX, only `react`.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-git-bar',
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
    var POLL_COLLAPSED = 20000
    var POLL_EXPANDED = 5000
    var MAX_DIFF_ROWS = 4000
    var LIST_VIEW = { mode: 'list' }

    // ── locale dictionaries ───────────────────────────────────────────────
    var DICT_ZH = {
      branch: '分支',
      staged: '已暂存',
      unstaged: '未暂存',
      untracked: '未跟踪',
      conflict: '冲突',
      commits: '最近提交',
      changes: '改动',
      clean: '工作区干净',
      notRepo: '不是 git 仓库',
      refresh: '刷新',
      close: '关闭',
      back: '返回',
      copyDiff: '复制 diff',
      copied: '已复制',
      noDiff: '无文本差异',
      truncated: '差异过大，已截断',
      detached: '游离 HEAD',
      loading: '读取中…',
      review: '审查',
      ahead: '领先',
      behind: '落后',
      error: '读取失败'
    }
    var DICT_EN = {
      branch: 'Branch',
      staged: 'Staged',
      unstaged: 'Unstaged',
      untracked: 'Untracked',
      conflict: 'Conflicts',
      commits: 'Recent commits',
      changes: 'changes',
      clean: 'Working tree clean',
      notRepo: 'Not a git repository',
      refresh: 'Refresh',
      close: 'Close',
      back: 'Back',
      copyDiff: 'Copy diff',
      copied: 'Copied',
      noDiff: 'No textual diff',
      truncated: 'Diff too large, truncated',
      detached: 'Detached HEAD',
      loading: 'Loading…',
      review: 'Review',
      ahead: 'Ahead',
      behind: 'Behind',
      error: 'Failed to read'
    }
    var DICTS = { zh: DICT_ZH, en: DICT_EN }
    var FALLBACK_DICT = DICT_ZH

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
    function computeAnchor(element, containingBlock) {
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

      var width = Math.max(220, Math.min(460, availableWidth - 24))
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

    // ── unified diff parsing ──────────────────────────────────────────────
    function stripDiffPrefix(path) {
      var text = toText(path).trim()
      if (!text) return ''
      if (text === '/dev/null') return ''
      if (text.length > 2 && (text.slice(0, 2) === 'a/' || text.slice(0, 2) === 'b/')) return text.slice(2)
      return text
    }

    function parseUnifiedDiff(text) {
      var body = toText(text)
      // Git output on this profile arrives with a UTF-8 BOM and CRLF endings;
      // both would otherwise leak into the first line and every line number.
      if (body.length > 0 && body.charCodeAt(0) === 0xfeff) body = body.slice(1)
      var rows = []
      var summary = { oldPath: '', newPath: '' }
      var oldLine = 0
      var newLine = 0
      if (!body) return { rows: rows, summary: summary }

      var lines = body.split(/\r?\n/)
      // A trailing newline produces one empty element that is not a diff line.
      if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()

      for (var index = 0; index < lines.length; index += 1) {
        var line = lines[index]
        if (line.slice(0, 11) === 'diff --git ') continue
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
          continue
        }
        if (line.slice(0, 2) === '@@') {
          var match = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line)
          if (match) {
            oldLine = toNumber(match[1]) || 0
            newLine = toNumber(match[2]) || 0
          }
          rows.push({ kind: 'hunk', text: line, oldNo: null, newNo: null })
          continue
        }
        if (line === '') {
          rows.push({ kind: 'context', text: '', oldNo: oldLine, newNo: newLine })
          oldLine += 1
          newLine += 1
          continue
        }
        var marker = line.charAt(0)
        if (marker === '+') {
          rows.push({ kind: 'add', text: line.slice(1), oldNo: null, newNo: newLine })
          newLine += 1
          continue
        }
        if (marker === '-') {
          rows.push({ kind: 'del', text: line.slice(1), oldNo: oldLine, newNo: null })
          oldLine += 1
          continue
        }
        if (marker === '\\') {
          rows.push({ kind: 'meta', text: line, oldNo: null, newNo: null })
          continue
        }
        rows.push({ kind: 'context', text: marker === ' ' ? line.slice(1) : line, oldNo: oldLine, newNo: newLine })
        oldLine += 1
        newLine += 1
      }
      return { rows: rows, summary: summary }
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
      '.gitbar-pill{display:inline-flex;align-items:center;gap:5px;box-sizing:border-box;height:26px;max-width:220px;min-width:0;padding:0 8px;border:1px solid var(--dsw-alias-border-l1);border-radius:13px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;font-weight:500;line-height:1;cursor:pointer;flex:0 1 auto;vertical-align:middle}',
      '.gitbar-pill:hover{background:var(--dsw-alias-bg-layer-2)}',
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
      '.gitbar-panel{position:fixed;box-sizing:border-box;display:flex;flex-direction:column;min-height:0;background:var(--dsw-alias-bg-overlay);border:1px solid var(--dsw-alias-border-l2);border-radius:12px;box-shadow:0 12px 32px color-mix(in srgb, var(--dsw-alias-label-primary) 20%, transparent);color:var(--dsw-alias-label-primary);font:inherit;font-size:12.5px;line-height:1.45;overflow:hidden;text-align:left}',
      '.gitbar-panelhead{display:flex;align-items:center;gap:6px;flex:0 0 auto;padding:7px 8px;border-bottom:1px solid var(--dsw-alias-border-l1)}',
      '.gitbar-headglyph{display:inline-flex;flex:0 0 auto;align-items:center;color:var(--dsw-alias-label-secondary)}',
      '.gitbar-headbranch{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600;font-size:12.5px}',
      '.gitbar-headmeta{display:inline-flex;align-items:center;gap:5px;min-width:0;flex:0 1 auto;overflow:hidden;color:var(--dsw-alias-label-secondary);font-size:11px;white-space:nowrap}',
      '.gitbar-upstream{overflow:hidden;text-overflow:ellipsis;min-width:0}',
      '.gitbar-ahead{color:var(--dsw-alias-state-success-primary)}',
      '.gitbar-behind{color:var(--dsw-alias-state-warn-primary)}',
      '.gitbar-spacer{flex:1 1 auto;min-width:4px}',
      '.gitbar-btn{display:inline-flex;align-items:center;justify-content:center;gap:4px;flex:0 0 auto;height:22px;min-width:22px;padding:0 6px;border:1px solid transparent;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:11.5px;line-height:1;cursor:pointer}',
      '.gitbar-btn:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}',
      '.gitbar-btn:focus-visible{outline:none;box-shadow:0 0 0 2px var(--dsw-alias-brand-primary)}',
      '.gitbar-btn svg{display:block}',
      '.gitbar-chips{display:flex;flex-wrap:wrap;gap:6px;flex:0 0 auto;padding:7px 9px 0}',
      '.gitbar-chip{font-size:11px;line-height:1.5;padding:0 7px;border-radius:9px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);white-space:nowrap}',
      '.gitbar-chip-error{border-color:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-state-error-primary)}',
      '.gitbar-body{display:flex;flex-direction:column;flex:1 1 auto;min-height:0;overflow:auto;overscroll-behavior:contain}',
      '.gitbar-list{padding:4px 5px 6px}',
      '.gitbar-group{padding:6px 6px 3px;font-size:11px;font-weight:600;color:var(--dsw-alias-label-secondary)}',
      '.gitbar-row{display:flex;align-items:center;gap:7px;width:100%;box-sizing:border-box;padding:4px 6px;border:none;border-radius:8px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;text-align:left;cursor:pointer}',
      '.gitbar-row:hover{background:var(--dsw-alias-bg-layer-2)}',
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
      '.gitbar-commitstoggle{display:flex;align-items:center;gap:6px;width:100%;box-sizing:border-box;padding:4px 6px;border:none;border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:11px;font-weight:600;text-align:left;cursor:pointer}',
      '.gitbar-commitstoggle:hover{background:var(--dsw-alias-bg-layer-2)}',
      '.gitbar-commitstoggle:focus-visible{outline:none;box-shadow:0 0 0 2px var(--dsw-alias-brand-primary)}',
      '.gitbar-commitstitle{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.gitbar-commitschev{flex:0 0 auto;display:inline-block;transition:transform 120ms ease}',
      '.gitbar-commitschev-open{transform:rotate(90deg)}',
      '.gitbar-commitlist{padding:2px 0 0}',
      '.gitbar-commit{display:flex;align-items:baseline;gap:7px;padding:2px 6px;font-size:11.5px}',
      '.gitbar-hash{flex:0 0 auto;font-family:ui-monospace,"Cascadia Code",Consolas,monospace;color:var(--dsw-alias-label-secondary)}',
      '.gitbar-subject{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.gitbar-when{flex:0 0 auto;color:var(--dsw-alias-label-secondary);font-size:11px}',
      '.gitbar-review{flex:0 0 auto;min-width:0}',
      '.gitbar-reviewhead{position:sticky;top:0;left:0;z-index:2;display:flex;align-items:center;gap:6px;width:100%;box-sizing:border-box;padding:6px 8px;background:var(--dsw-alias-bg-overlay);border-bottom:1px solid var(--dsw-alias-border-l1)}',
      '.gitbar-path{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:ui-monospace,"Cascadia Code",Consolas,monospace;font-size:11.5px;color:var(--dsw-alias-label-primary)}',
      '.gitbar-diff{flex:0 0 auto;width:max-content;min-width:100%;box-sizing:border-box;background:var(--dsw-alias-bg-base)}',
      '.gitbar-diffhead{position:sticky;left:0;z-index:1;padding:4px 9px;border-bottom:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary);font-size:11px;font-family:ui-monospace,"Cascadia Code",Consolas,monospace;white-space:nowrap}',
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
      '.gitbar-foot{flex:0 0 auto;padding:4px 9px;border-top:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary);font-size:11px}'
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

    /** Recent commits, collapsed behind a disclosure button. */
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
          open
            ? h(
              'div',
              { className: 'gitbar-commitlist' },
              commits.map(function (commit, index) {
                var safe = commit && typeof commit === 'object' ? commit : {}
                return h(
                  'div',
                  { className: 'gitbar-commit', key: 'commit-' + toText(safe.hash) + '-' + index },
                  h('span', { className: 'gitbar-hash' }, toText(safe.hash)),
                  h('span', { className: 'gitbar-subject', title: toText(safe.subject) }, toText(safe.subject)),
                  h('span', { className: 'gitbar-when' }, toText(safe.when))
                )
              })
            )
            : null
        )
      } catch (error) {
        return null
      }
    }

    /** The unified diff body of the review view. */
    function DiffBody(props) {
      var t = props.t || translate
      var diff = props.diff
      try {
        if (!diff || diff.loading === true) return h('div', { className: 'gitbar-empty' }, t('loading'))
        if (diff.ok !== true) return h('div', { className: 'gitbar-empty' }, t('error'))
        var parsed = parseUnifiedDiff(diff.text)
        var rows = parsed.rows
        if (rows.length === 0) return h('div', { className: 'gitbar-empty' }, t('noDiff'))

        var capped = rows.length > MAX_DIFF_ROWS
        var visible = capped ? rows.slice(0, MAX_DIFF_ROWS) : rows
        var summary = diffSummaryText(parsed.summary, props.path)
        var nodes = []
        if (summary) nodes.push(h('div', { className: 'gitbar-diffhead', key: 'diffhead' }, summary))
        var lines = []
        for (var index = 0; index < visible.length; index += 1) {
          var row = visible[index]
          var kind = row.kind
          var lineClass = 'gitbar-line'
          if (kind === 'add') lineClass += ' gitbar-line-add'
          else if (kind === 'del') lineClass += ' gitbar-line-del'
          else if (kind === 'hunk') lineClass += ' gitbar-line-hunk'
          else if (kind === 'meta') lineClass += ' gitbar-line-meta'
          var signature = kind === 'add' ? '+' : kind === 'del' ? '-' : kind === 'hunk' || kind === 'meta' ? '' : ' '
          lines.push(
            h(
              'div',
              { className: lineClass, key: 'diff-' + index },
              h('span', { className: 'gitbar-ln', 'aria-hidden': 'true' }, row.oldNo === null ? '' : String(row.oldNo)),
              h('span', { className: 'gitbar-ln', 'aria-hidden': 'true' }, row.newNo === null ? '' : String(row.newNo)),
              kind === 'hunk' || kind === 'meta' ? null : h('span', { className: 'gitbar-sig', 'aria-hidden': 'true' }, signature),
              h('span', { className: 'gitbar-code' }, row.text === '' ? ' ' : toText(row.text))
            )
          )
        }
        nodes.push(h('div', { className: 'gitbar-difflines', key: 'difflines' }, lines))
        if (capped || diff.truncated === true) nodes.push(h('div', { className: 'gitbar-foot', key: 'difffoot' }, t('truncated')))
        return h('div', { className: 'gitbar-diff' }, nodes)
      } catch (error) {
        return h('div', { className: 'gitbar-empty' }, t('error'))
      }
    }

    /** In-panel diff review: back button, path, badges, copy button, diff. */
    function DiffReview(props) {
      var t = props.t || translate
      var path = toText(props.path)
      var staged = props.staged === true
      var untracked = props.untracked === true
      var sessionId = toText(props.sessionId)
      var refreshToken = toNumber(props.token) || 0

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
        var disposed = false
        var controller = null
        try {
          if (typeof AbortController === 'function') controller = new AbortController()
        } catch (error) {
          controller = null
        }
        setDiff({ loading: true })
        try {
          if (typeof fetch !== 'function' || !path) {
            setDiff({ ok: false })
            return function () {
              disposed = true
            }
          }
          var url = withQuery(DIFF_URL, [
            { key: 'session', value: sessionId },
            { key: 'path', value: path },
            { key: 'staged', value: staged ? '1' : '0' }
          ])
          fetch(url, {
            cache: 'no-store',
            headers: { accept: 'application/json' },
            signal: controller ? controller.signal : undefined
          })
            .then(function (response) {
              return response.json()
            })
            .then(function (payload) {
              if (disposed) return
              if (payload && payload.ok === true && typeof payload.diff === 'string') {
                setDiff({
                  ok: true,
                  text: payload.diff,
                  truncated: payload.truncated === true,
                  untracked: payload.untracked === true
                })
              } else {
                setDiff({ ok: false })
              }
            })
            .catch(function () {
              if (!disposed) setDiff({ ok: false })
            })
        } catch (error) {
          if (!disposed) setDiff({ ok: false })
        }
        return function () {
          disposed = true
          try {
            if (controller) controller.abort()
          } catch (error) {
            /* ignore */
          }
        }
      }, [path, staged, sessionId, refreshToken])

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

    /** The expanded popover: header row, counts, file list or review. */
    function GitPanel(props) {
      var t = props.t || translate
      var data = props.data
      var view = props.view && props.view.mode === 'review' ? props.view : LIST_VIEW
      var pos = props.pos || { top: 56, right: 12, width: 460, maxHeight: 480 }
      var reviewMode = view.mode === 'review'
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

        var headRow = h(
          'div',
          { className: 'gitbar-panelhead', key: 'head' },
          h('span', { className: 'gitbar-headglyph', 'aria-hidden': 'true' }, branchGlyph(13)),
          h('span', { className: 'gitbar-headbranch', title: branchLabel }, branchLabel),
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

        var chips = []
        if (toNumber(counts.staged) > 0) chips.push(h('span', { className: 'gitbar-chip', key: 'chip-staged' }, t('staged') + ' ' + toNumber(counts.staged)))
        if (toNumber(counts.unstaged) > 0) chips.push(h('span', { className: 'gitbar-chip', key: 'chip-unstaged' }, t('unstaged') + ' ' + toNumber(counts.unstaged)))
        if (toNumber(counts.untracked) > 0) chips.push(h('span', { className: 'gitbar-chip', key: 'chip-untracked' }, t('untracked') + ' ' + toNumber(counts.untracked)))
        if (toNumber(counts.conflicted) > 0) {
          chips.push(h('span', { className: 'gitbar-chip gitbar-chip-error', key: 'chip-conflict' }, t('conflict') + ' ' + toNumber(counts.conflicted)))
        }
        var chipsRow = chips.length > 0 ? h('div', { className: 'gitbar-chips', key: 'chips' }, chips) : null

        var body
        if (reviewMode) {
          body = h(DiffReview, {
            t: t,
            path: view.path,
            staged: view.staged === true,
            untracked: view.untracked === true,
            sessionId: props.sessionId,
            token: props.token,
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

        var children = [headRow]
        if (chipsRow) children.push(chipsRow)
        children.push(h('div', { className: 'gitbar-body', key: 'body' }, body))
        if (!reviewMode && commits.length > 0) {
          children.push(h(CommitList, {
            key: 'commits',
            t: t,
            commits: commits,
            open: props.commitsOpen === true,
            onToggle: props.onToggleCommits
          }))
        }

        var panel = h(
          'div',
          {
            className: 'gitbar-panel',
            style: style,
            role: 'dialog',
            'aria-label': t('changes'),
            'data-dsh-git-bar': 'panel'
          },
          children
        )
        return Guard ? h(Guard, { fallback: h('div', { className: 'gitbar-panel', style: style, role: 'dialog' }, h('div', { className: 'gitbar-empty' }, t('error'))) }, panel) : panel
      } catch (error) {
        return h(
          'div',
          { className: 'gitbar-panel', style: style, role: 'dialog' },
          h('div', { className: 'gitbar-empty' }, t('error'))
        )
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
      var stateControllerRef = useRef(null)
      var containingBlockRef = useRef(null)
      var mountedRef = useRef(true)

      var dataHook = useState(null)
      var data = dataHook[0]
      var setData = dataHook[1]
      var failedHook = useState(false)
      var failed = failedHook[0]
      var setFailed = failedHook[1]
      var openHook = useState(false)
      var open = openHook[0]
      var setOpen = openHook[1]
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

      function loadState() {
        var controller = null
        try {
          if (stateControllerRef.current && typeof stateControllerRef.current.abort === 'function') {
            stateControllerRef.current.abort()
          }
        } catch (error) {
          /* ignore */
        }
        stateControllerRef.current = null
        try {
          if (typeof AbortController === 'function') controller = new AbortController()
        } catch (error) {
          controller = null
        }
        stateControllerRef.current = controller
        try {
          if (typeof fetch !== 'function') {
            if (mountedRef.current) setFailed(true)
            return
          }
          var url = withQuery(STATE_URL, [{ key: 'session', value: sessionRef.current }])
          fetch(url, {
            cache: 'no-store',
            headers: { accept: 'application/json' },
            signal: controller ? controller.signal : undefined
          })
            .then(function (response) {
              return response.json()
            })
            .then(function (payload) {
              if (!mountedRef.current) return
              if (payload && typeof payload === 'object') {
                setData(payload)
                setFailed(false)
              } else {
                setFailed(true)
              }
            })
            .catch(function () {
              if (mountedRef.current) setFailed(true)
            })
        } catch (error) {
          if (mountedRef.current) setFailed(true)
        }
      }
      var loadRef = useRef(loadState)
      loadRef.current = loadState

      // 1. Mount/unmount bookkeeping: stop in-flight work when the slot unmounts.
      useEffect(function () {
        mountedRef.current = true
        return function () {
          mountedRef.current = false
          try {
            if (stateControllerRef.current && typeof stateControllerRef.current.abort === 'function') {
              stateControllerRef.current.abort()
            }
          } catch (error) {
            /* ignore */
          }
          stateControllerRef.current = null
        }
      }, [])

      // 2. Fetch on mount and whenever the Session changes.
      useEffect(function () {
        setData(null)
        setFailed(false)
        setView(LIST_VIEW)
        setCommitsOpen(false)
        loadRef.current()
        return function () {
          try {
            if (stateControllerRef.current && typeof stateControllerRef.current.abort === 'function') {
              stateControllerRef.current.abort()
            }
          } catch (error) {
            /* ignore */
          }
          stateControllerRef.current = null
        }
      }, [sessionId])

      // 3. Fetch whenever the panel opens.
      useEffect(function () {
        if (!open) return undefined
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

      // 6. Keep the fixed popover anchored to the pill.
      useEffect(function () {
        if (!open) return undefined
        function update(remeasure) {
          try {
            var element = triggerRef.current
            if (!element) return
            if (remeasure === true) containingBlockRef.current = fixedContainingBlock(element)
            setPos(computeAnchor(element, containingBlockRef.current))
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
        update(true)
        try {
          window.addEventListener('resize', onResize)
          window.addEventListener('scroll', onScroll, true)
        } catch (error) {
          /* ignore */
        }
        return function () {
          try {
            window.removeEventListener('resize', onResize)
            window.removeEventListener('scroll', onScroll, true)
          } catch (error) {
            /* ignore */
          }
        }
      }, [open])

      // 7. Close on outside click or Escape.
      useEffect(function () {
        if (!open) return undefined
        function close() {
          setOpen(false)
          setView(LIST_VIEW)
        }
        function onPointerDown(event) {
          try {
            var root = rootRef.current
            var target = event ? event.target : null
            if (root && target && typeof root.contains === 'function' && root.contains(target)) return
            close()
          } catch (error) {
            close()
          }
        }
        function onKeyDown(event) {
          try {
            if (!event) return
            var key = event.key
            if (key === 'Escape' || key === 'Esc' || event.keyCode === 27) {
              close()
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
      }, [open])

      function closePanel() {
        setOpen(false)
        setView(LIST_VIEW)
      }

      function onToggle() {
        try {
          if (open) {
            closePanel()
            return
          }
          var element = triggerRef.current
          containingBlockRef.current = fixedContainingBlock(element)
          setPos(computeAnchor(element, containingBlockRef.current))
          setView(LIST_VIEW)
          setCommitsOpen(false)
          setOpen(true)
        } catch (error) {
          setOpen(true)
        }
      }

      function onRefresh() {
        loadRef.current()
        if (view && view.mode === 'review') setToken(function (value) { return value + 1 })
      }

      function onOpenFile(file, groupKey) {
        try {
          var target = file && typeof file === 'object' ? file : {}
          setView({
            mode: 'review',
            path: toText(target.path),
            staged: groupKey === 'staged',
            untracked: groupKey === 'untracked' || target.untracked === true
          })
        } catch (error) {
          /* stay on the list */
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

        var panel = null
        if (open && pos) {
          panel = h(GitPanel, {
            key: 'panel',
            t: t,
            data: data,
            failed: failed,
            pos: pos,
            view: view,
            token: token,
            sessionId: sessionId,
            commitsOpen: commitsOpen,
            onToggleCommits: function () {
              setCommitsOpen(function (value) { return !value })
            },
            onClose: closePanel,
            onRefresh: onRefresh,
            onBack: onBack,
            onOpenFile: onOpenFile
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
