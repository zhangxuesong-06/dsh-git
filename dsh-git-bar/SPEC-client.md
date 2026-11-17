# client.js contract — Git capsule (browser half)

Implement **only** `D:\DSH WorkSpace\git\dsh-git-bar\client.js`. Do not edit any other file
(`index.js`, `package.json`, `cordis.patch.yml`, `locale/*`, `icon.svg` are owned by the Lead).

## Where it renders

The Session header's right-aligned utilities list. Registration:

```js
window.__ModuleLoader__.load({
  id: '@local/dsh-git-bar',            // MUST equal the package name
  factory(require) {
    const React = require('react')     // the only allowed module request
    const h = React.createElement
    // ...components here...
    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.slots.inject('conversation.session.header.utilities', () =>
          ctx.slots.register(
            { name: 'conversation.session.header.utilities', id: 'dsh-git-bar', order: 40 },
            GitCapsule,
          ),
        )
      },
    }
  },
})
```

Rules that follow from the Harness plugin practices:

- Plain ES5-friendly JavaScript only: no JSX, no `import`, no bundler syntax, no optional chaining needed
  (it is fine, Chromium supports it), no top-level side effects outside `factory`/`apply`.
- Only `require('react')`. Never import a Harness Client package.
- No `document.body` writes, no global stylesheet files. Any `<style>` you need is rendered **inside your own
  component tree** (`h('style', null, css)`) so unmounting removes it. Scope every class with `gitbar-`.
- Never read other plugins' DOM. Position your popover from your own trigger's `getBoundingClientRect()`.
- All visible text goes through the Client locale service (see below), defaulting to Chinese in this profile.
- A throwing component blanks the slot entry, so every render path and every fetch must be failure-tolerant.

## Slot props (unknown — discover, do not assume)

The entry receives slot props. Read the Session id defensively, trying in order:
`props.sessionId`, `props.session && props.session.sessionId`, `props.session && props.session.id`,
`props.sessionInfo && props.sessionInfo.sessionId`, `props.agent && props.agent.sessionId`.
Guard every step with typeof checks. `undefined` is acceptable: the Host then falls back to the process default
working directory.

**Probe (required in the first version):** on mount, once per mount, POST
`JSON.stringify(props, propReplacer)` to `/dsh-git-bar/probe` (same origin) so the Lead can read the real prop
shape from `.dsh-git-bar-probe.json`. The replacer must drop functions and React elements and truncate long
strings to 300 chars, and must not throw on cycles (track a `Set`). This POST must never break the capsule.

## Host routes (same origin, JSON, `cache-control: no-store`)

### `GET /dsh-git-bar/state?session=<sessionId>`

```ts
type State = {
  ok: true
  cwd: string
  root: string                  // repository top level
  branch: string                // '' when detached
  detached: boolean
  head: string                  // short commit sha
  upstream: string              // '' when the branch has no upstream
  ahead: number
  behind: number
  files: Array<{
    path: string                // repository-relative, forward slashes
    originalPath: string | null
    index: string | null        // staged status letter (M A D R C U ...) or null
    worktree: string | null     // working-tree status letter or null
    untracked: boolean
    conflicted: boolean
    staged: boolean
    unstaged: boolean
    additions: number | null
    deletions: number | null
  }>
  counts: { all: number; staged: number; unstaged: number; untracked: number; conflicted: number }
  commits: Array<{ hash: string; author: string; when: string; subject: string }>
  generatedAt: number
}
```

Failure: `{ ok: false, reason: 'not-a-repository' | ..., detail?: string, cwd: string }`.
Treat `ok: false` as a normal state: show a muted "不是 git 仓库" pill instead of an error, and do not retry faster
than the normal interval.

### `GET /dsh-git-bar/diff?session=<sessionId>&path=<repo-relative path>&staged=1|0`

```ts
type Diff = {
  ok: true
  path: string
  staged: boolean
  untracked: boolean
  diff: string          // unified diff text, may be ''
  truncated: boolean
} | { ok: false; reason: string; detail?: string }
```

`diff` is empty for a binary or unchanged file — render "无文本差异" then.

## Behaviour

1. **Collapsed capsule** (always, once state is known): one compact pill —
   branch glyph, branch name (`detached` → `HEAD@<short sha>`), then the change count
   (e.g. `3`), coloured by state: clean = idle dot, changes = warn dot, conflicts = error dot.
   `title` (tooltip) = branch + counts. It must fit the header: `max-width: 220px`, ellipsis on the branch name,
   height and radius consistent with the header's other compact controls, `border: 1px solid var(--dsw-alias-border-l1)`,
   background `var(--dsw-alias-bg-layer-1)`, text `var(--dsw-alias-label-primary)`.
2. **Expand on click.** The expanded panel is a popover anchored under the pill:
   `position: fixed`, right edge aligned to the pill's right edge, `top = rect.bottom + 6`,
   max height `min(70vh, 560px)`, width `min(460px, calc(100vw - 24px))`, `z-index` high enough to sit above the
   progress rows (use `2147483000`), background `var(--dsw-alias-bg-overlay)`, border
   `1px solid var(--dsw-alias-border-l2)`, radius 12px, soft shadow. Recompute on window resize/scroll while open.
   Close on: second click on the pill, a click outside (listen on `document` with capture, remove on cleanup),
   and `Escape`. The panel contains, in order:
   - header row: branch name + `↑ahead ↓behind` + upstream + a refresh button + a close button;
   - counts row: staged / unstaged / untracked / conflict chips, hidden when 0;
   - the changed-file list, grouped `已暂存` / `未暂存` / `未跟踪` / `冲突` (skip empty groups). Each row:
     status letter badge, file name, dimmed parent directory, `+N −N` on the right. Clicking a row opens the review
     view for that file (see 3). Rows are `<button>`s with `type="button"`, keyboard focusable, hover background
     `var(--dsw-alias-bg-layer-2)`.
   - a muted `最近提交` section listing `commits` (short hash, subject, relative time). Collapsed under a
     disclosure button that expands inside the panel; hidden entirely when empty.
3. **Review view** (the file click result): replaces the list inside the same panel; a back button returns to the
   list. It shows the file path in monospace at the top, `staged`/`untracked` badges, and the unified diff with
   line numbers: strip `diff --git`, `index`, `---`, `+++` header lines into a compact header instead of rendering
   them as content; keep `@@` hunk headers as muted rows; render `+` lines with a green-tinted background
   (`color-mix(in srgb, var(--dsw-alias-state-success-primary) 14%, transparent)`) and `-` lines with a red-tinted
   one (`--dsw-alias-state-error-primary`), context lines plain; use a monospace stack
   (`ui-monospace, "Cascadia Code", Consolas, monospace`) at 12px; horizontal overflow scrolls, never wraps the
   code. Show `truncated` as a muted footer line. Empty diff → centered muted "无文本差异".
   Add a `复制 diff` button (uses `navigator.clipboard.writeText`, ignores failure).
4. **Refresh.** Fetch `state` on mount, whenever the panel opens, after every review close, and on a timer:
   15s while the session header is mounted is too noisy — use 20s collapsed, 5s while expanded, and pause while
   `document.hidden` (listen to `visibilitychange`, remove on cleanup). Abort in-flight requests on unmount
   (`AbortController`). Never show a spinner over already-rendered data: keep the last good state and only mark a
   subtle failure dot when a refresh fails.

## Theme + locale

Use only these tokens (no literal colors except the diff tints above): `--dsw-alias-bg-base`,
`--dsw-alias-bg-layer-1`, `--dsw-alias-bg-layer-2`, `--dsw-alias-bg-overlay`, `--dsw-alias-border-l1`,
`--dsw-alias-border-l2`, `--dsw-alias-brand-primary`, `--dsw-alias-label-primary`, `--dsw-alias-label-secondary`,
`--dsw-alias-state-error-primary`, `--dsw-alias-state-idle-primary`, `--dsw-alias-state-success-primary`,
`--dsw-alias-state-warn-primary`.

In `apply`, register a dictionary for both locales and bind a translator; use it for every string:

```js
ctx.locale.register('dshGitBar', {
  zh: { branch: '分支', staged: '已暂存', unstaged: '未暂存', untracked: '未跟踪', conflict: '冲突',
        commits: '最近提交', changes: '改动', clean: '工作区干净', notRepo: '不是 git 仓库',
        refresh: '刷新', close: '关闭', back: '返回', copyDiff: '复制 diff', copied: '已复制',
        noDiff: '无文本差异', truncated: '差异过大，已截断', detached: '游离 HEAD', loading: '读取中…',
        review: '审查', ahead: '领先', behind: '落后', error: '读取失败' },
  en: { /* the same keys in English */ },
})
const t = ctx.locale.bind('dshGitBar')
```

Pass `t` down as a prop; components are plain functions.

## Done means

- `node --check` passes on the file (it is CommonJS-in-factory form inside a script; run the check anyway and also
  run a brace/paren sanity check with node's parser through `new Function` if `--check` rejects the file form).
- No literal `document.body`, no `require(` other than `'react'`, no JSX, no `import`.
- Every effect returns its cleanup.
- Report back: the file path, the exported component names, and anything about the props you could not determine.
