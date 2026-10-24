/**
 * dsh-kilo-models — Client 半边。
 *
 * 三块界面：
 *   1. 设置 →「Kilo 模型」：刷新 / 探活 / 联网查榜单 / 写回配置，表格带分数与分级依据；
 *   2. 设置 →「可用模型」：只列探活通过的模型，方便挑；
 *   3. 模型选择器的名称位（conversation.input.model.label）：在模型名后面挂能力徽标
 *      （👁 视觉 / 🎬 视频 / 🔊 音频 / 🧰 工具 / 🧠 推理 / ⏳ 即将到期）。
 *
 * 以 dsh.client bundle 格式加载：window.__ModuleLoader__.load({ id, factory })，
 * id 必须等于 loader entry 名（dsh-kilo-models）。
 */
window.__ModuleLoader__.load({
  id: 'dsh-kilo-models',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const React = require('react')
    const h = React.createElement

    const EVENT = 'dsh-kilo-models:state'

    const CSS = [
      '.km-panel{display:flex;flex-direction:column;gap:12px;padding:4px 0;font-size:13px;color:var(--dsw-alias-label-primary)}',
      '.km-panel .row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}',
      '.km-panel .grow{flex:1}',
      '.km-panel button{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l1);border-radius:8px;padding:5px 12px;font-size:13px;cursor:pointer}',
      '.km-panel button:hover:not(:disabled){border-color:var(--dsw-alias-brand-primary)}',
      '.km-panel button:disabled{opacity:.5;cursor:default}',
      '.km-panel .primary{background:var(--dsw-alias-button-primary-fill);border-color:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary-foreground)}',
      '.km-panel label.toggle{display:inline-flex;gap:5px;align-items:center;font-size:12px;color:var(--dsw-alias-label-secondary)}',
      '.km-panel .meta{font-size:12px;color:var(--dsw-alias-label-secondary)}',
      '.km-panel .err{padding:7px 12px;border-radius:8px;background:color-mix(in srgb,var(--dsw-alias-status-error) 14%,transparent);border:1px solid var(--dsw-alias-status-error);color:var(--dsw-alias-label-primary);font-size:12px;white-space:pre-wrap}',
      '.km-panel .oknote{padding:7px 12px;border-radius:8px;background:color-mix(in srgb,var(--dsw-alias-brand-primary) 10%,transparent);border:1px solid var(--dsw-alias-brand-primary);font-size:12px}',
      '.km-panel table{width:100%;border-collapse:collapse;font-size:12px}',
      '.km-panel th{text-align:left;font-weight:600;color:var(--dsw-alias-label-secondary);padding:6px 8px;border-bottom:1px solid var(--dsw-alias-border-l1);white-space:nowrap}',
      '.km-panel td{padding:6px 8px;border-bottom:1px solid var(--dsw-alias-border-l1);vertical-align:top}',
      '.km-panel tr.dead td{opacity:.55}',
      '.km-panel .id{font-family:ui-monospace,Consolas,monospace;font-size:11px;color:var(--dsw-alias-label-secondary);word-break:break-all}',
      '.km-panel .chip{display:inline-block;padding:1px 7px;border-radius:999px;font-size:11px;line-height:1.6;border:1px solid var(--dsw-alias-border-l1);margin-right:4px;white-space:nowrap}',
      '.km-panel .tier{font-weight:700;min-width:22px;text-align:center}',
      '.km-panel .tier-S{background:color-mix(in srgb,var(--dsw-alias-brand-primary) 22%,transparent);border-color:var(--dsw-alias-brand-primary)}',
      '.km-panel .tier-A{background:color-mix(in srgb,var(--dsw-alias-brand-primary) 12%,transparent)}',
      '.km-panel .tier-X{background:color-mix(in srgb,var(--dsw-alias-status-error) 16%,transparent);border-color:var(--dsw-alias-status-error)}',
      '.km-panel .score{font-variant-numeric:tabular-nums;font-weight:600}',
      '.km-panel .why{font-size:11px;color:var(--dsw-alias-label-secondary);white-space:nowrap}',
      '.km-panel .ms-ok{color:var(--dsw-alias-status-success)}',
      '.km-panel .ms-bad{color:var(--dsw-alias-status-error)}',
      '.km-panel .empty{padding:18px;text-align:center;color:var(--dsw-alias-label-secondary);font-size:12px}',
      '.km-panel .cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:10px}',
      '.km-panel .card{border:1px solid var(--dsw-alias-border-l1);border-radius:10px;padding:10px 12px;display:flex;flex-direction:column;gap:6px}',
      '.km-panel .card .top{display:flex;gap:6px;align-items:center}',
      '.km-panel .card .nm{font-weight:600;font-size:13px}',
      '.km-label{display:inline-flex;align-items:center;gap:3px;min-width:0}',
      '.km-badge{font-size:10px;line-height:1;opacity:.75;letter-spacing:-1px}',
    ].join('\n')

    function ensureCss() {
      if (typeof document === 'undefined') return
      if (document.getElementById('dsh-kilo-models-css')) return
      const style = document.createElement('style')
      style.id = 'dsh-kilo-models-css'
      style.textContent = CSS
      document.head.appendChild(style)
    }

    async function apiPost(op, payload) {
      const res = await fetch('/dsh-kilo-models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.assign({ op }, payload || {})),
      })
      let body = {}
      try {
        body = await res.json()
      } catch {
        body = { ok: false, error: '响应不是 JSON' }
      }
      if (!body.ok) throw new Error(body.error || ('HTTP ' + res.status))
      return body
    }

    async function apiState() {
      const res = await fetch('/dsh-kilo-models', { headers: { Accept: 'application/json' } })
      const body = await res.json()
      if (!body.ok) throw new Error(body.error || '读取状态失败')
      return body.state
    }

    // 模型选择器徽标用的缓存：一次拉取，之后跟着 EVENT 失效
    const cache = { at: 0, byId: new Map(), loading: null }

    function ensureState(force) {
      if (!force && cache.byId.size && Date.now() - cache.at < 5 * 60_000) return Promise.resolve(cache)
      if (cache.loading) return cache.loading
      cache.loading = apiState()
        .then((state) => {
          cache.at = Date.now()
          cache.byId = new Map((state.models || []).map((m) => [m.id, m]))
          cache.loading = null
          return cache
        })
        .catch((err) => {
          cache.loading = null
          throw err
        })
      return cache.loading
    }

    function broadcast() {
      cache.at = 0
      if (typeof window === 'undefined') return
      window.dispatchEvent(new Event(EVENT))
    }

    function ctxLabel(ctx) {
      if (!ctx) return '—'
      if (ctx >= 1000000) return Math.round(ctx / 1000000) + 'M'
      if (ctx >= 1000) return Math.round(ctx / 1000) + 'K'
      return String(ctx)
    }

    function ago(iso) {
      if (!iso) return '从未刷新'
      const t = Date.parse(iso)
      if (!Number.isFinite(t)) return iso
      const min = Math.round((Date.now() - t) / 60000)
      if (min < 1) return '刚刚'
      if (min < 60) return min + ' 分钟前'
      const hours = Math.round(min / 60)
      if (hours < 48) return hours + ' 小时前'
      return Math.round(hours / 24) + ' 天前'
    }

    function daysLeft(dateStr) {
      const t = Date.parse(dateStr + 'T23:59:59Z')
      if (!Number.isFinite(t)) return Infinity
      return Math.ceil((t - Date.now()) / 86400000)
    }

    const BADGES = [
      ['image', '👁', '支持图片输入'],
      ['video', '🎬', '支持视频输入'],
      ['audio', '🔊', '支持音频输入'],
    ]

    function badgesOf(m) {
      const out = []
      const mods = (m && m.mods) || []
      for (const [key, glyph, title] of BADGES) if (mods.includes(key)) out.push({ glyph, title })
      if (m && m.tools) out.push({ glyph: '🧰', title: '支持工具调用' })
      if (m && m.reasoning) out.push({ glyph: '🧠', title: '支持推理' })
      if (m && m.expires && daysLeft(m.expires) <= 30) out.push({ glyph: '⏳', title: '即将到期：' + m.expires })
      return out
    }

    function chipsOf(m) {
      return (m.tags || []).map((t) => h('span', { key: t, className: 'chip' }, t))
    }

    /** 模型选择器里的名称位：名字 + 能力徽标。 */
    function ModelLabel(props) {
      const model = (props && props.model) || {}
      const name = model.name || model.id
      const [, bump] = React.useState(0)
      React.useEffect(() => {
        let alive = true
        ensureState(false).then(() => { if (alive) bump((x) => x + 1) }).catch(() => {})
        const on = () => bump((x) => x + 1)
        if (typeof window !== 'undefined') window.addEventListener(EVENT, on)
        return () => {
          alive = false
          if (typeof window !== 'undefined') window.removeEventListener(EVENT, on)
        }
      }, [])
      const info = cache.byId.get(model.id)
      if (!info) return h('span', { className: 'km-label' }, name)
      const badges = badgesOf(info)
      if (!badges.length) return h('span', { className: 'km-label' }, name)
      return h('span', { className: 'km-label' },
        name,
        badges.map((b, i) => h('span', { key: i, className: 'km-badge', title: b.title }, b.glyph)),
      )
    }

    function usePanelState() {
      const [state, setState] = React.useState(null)
      const [busy, setBusy] = React.useState('')
      const [error, setError] = React.useState('')
      const [note, setNote] = React.useState('')

      React.useEffect(() => {
        ensureCss()
        let alive = true
        apiState()
          .then((s) => { if (alive) setState(s) })
          .catch((e) => { if (alive) setError(String(e.message || e)) })
        return () => { alive = false }
      }, [])

      const run = async (label, fn) => {
        setBusy(label)
        setError('')
        setNote('')
        try {
          await fn()
        } catch (e) {
          setError(String(e.message || e))
        } finally {
          setBusy('')
        }
      }

      return { state, setState, busy, error, setError, note, setNote, run }
    }

    function boardLine(state) {
      const b = state && state.leaderboard
      if (!b) return '分级：上下文 + 版本新鲜度（还没查过榜单）'
      const src = b.source === 'web' ? '联网榜单' : b.source === 'bundled' ? '内置榜单快照' : '无榜单'
      return '分级依据：' + src + '（' + (b.entries ? b.entries.length : 0) + ' 条）' + (b.at ? ' · ' + b.at : '')
    }

    function KiloPanel() {
      const { state, setState, busy, error, note, run } = usePanelState()
      const [sel, setSel] = React.useState({})
      const [useBoard, setUseBoard] = React.useState(true)

      React.useEffect(() => {
        if (!state || !state.models) return
        const next = {}
        for (const m of state.models) if (m.status !== 'fail') next[m.id] = true
        setSel((prev) => (Object.keys(prev).length ? prev : next))
      }, [state && state.at])

      const models = (state && state.models) || []
      const chosen = models.filter((m) => sel[m.id]).map((m) => m.id)
      const okCount = models.filter((m) => m.status === 'ok').length
      const failCount = models.filter((m) => m.status === 'fail').length

      const refresh = (probe) => run(probe ? '刷新并探测' : '刷新', async () => {
        const body = await apiPost('refresh', { probe, leaderboard: useBoard })
        setState(body.state)
        setSel({})
        broadcast()
        setNote(probe
          ? '已刷新：' + body.state.freeCount + ' 个免费模型，探活 ' + (body.state.probed || 0) + ' 个，榜单来源 ' + (body.state.leaderboard?.source || 'none') + '，用时 ' + Math.round((body.state.durationMs || 0) / 1000) + ' 秒'
          : '已刷新：' + body.state.freeCount + ' 个免费模型（未探测）')
      })

      const relist = () => run('联网查榜单', async () => {
        const body = await apiPost('leaderboard', {})
        setState(body.state)
        broadcast()
        setNote('榜单已更新：来源 ' + body.state.leaderboard.source + '，' + body.state.leaderboard.entries.length + ' 条。' + (body.state.leaderboard.note || ''))
      })

      const apply = () => run('写回配置', async () => {
        if (!chosen.length) throw new Error('先勾选要写回的模型')
        const body = await apiPost('apply', { ids: chosen })
        setNote('已写回 ' + body.result.written + ' 个模型到 cordis.patch.yml（备份：' + body.result.backup + '）。配置热加载后模型选择器就会更新。')
      })

      const toggle = (id) => setSel((prev) => Object.assign({}, prev, { [id]: !prev[id] }))

      return h('div', { className: 'km-panel' },
        h('div', { className: 'row' }, [
          h('button', { key: 'r', className: 'primary', disabled: !!busy, onClick: () => refresh(true) },
            busy === '刷新并探测' ? '探测中…' : '刷新并探测'),
          h('button', { key: 'l', disabled: !!busy, onClick: () => refresh(false) },
            busy === '刷新' ? '刷新中…' : '仅拉清单'),
          h('button', { key: 'b', disabled: !!busy || !models.length, onClick: relist },
            busy === '联网查榜单' ? '查询中…' : '联网查榜单'),
          h('button', { key: 'a', disabled: !!busy || !chosen.length, onClick: apply },
            busy === '写回配置' ? '写入中…' : '写回 DSH 配置（' + chosen.length + '）'),
          h('label', { key: 't', className: 'toggle', title: '刷新时顺带用 DeepSeek 联网搜索查榜单分数' },
            h('input', { type: 'checkbox', checked: useBoard, onChange: (e) => setUseBoard(e.target.checked) }),
            '刷新时联网查榜单'),
          h('div', { key: 'g', className: 'grow' }),
          h('span', { key: 'm', className: 'meta' },
            state && state.at
              ? '上次刷新 ' + ago(state.at) + ' · 免费 ' + (state.freeCount || models.length) + '/' + (state.total || '?') + ' · 可用 ' + okCount + ' · 失败 ' + failCount
              : '还没有数据'),
        ]),
        error ? h('div', { className: 'err' }, error) : null,
        note ? h('div', { className: 'oknote' }, note) : null,
        models.length === 0
          ? h('div', { className: 'empty' }, busy ? '正在向 Kilo 拉取模型清单…' : '点「刷新并探测」拉一次 Kilo 免费模型清单。')
          : h('table', null, [
              h('thead', { key: 'head' }, h('tr', null, [
                h('th', { key: 'c', style: { width: 28 } }),
                h('th', { key: 't', style: { width: 34 } }, '级'),
                h('th', { key: 's', style: { width: 44 } }, '分'),
                h('th', { key: 'm' }, '模型'),
                h('th', { key: 'x', style: { width: 56 } }, '上下文'),
                h('th', { key: 'g' }, '标签'),
                h('th', { key: 'w' }, '依据'),
                h('th', { key: 'p', style: { width: 66 } }, '探活'),
                h('th', { key: 'e', style: { width: 74 } }, '到期'),
              ])),
              h('tbody', { key: 'body' }, models.map((m) => {
                const dead = m.status === 'fail'
                const left = m.expires ? daysLeft(m.expires) : Infinity
                const probeText = m.status === 'ok'
                  ? (m.probe && m.probe.ms ? m.probe.ms + 'ms' : 'ok')
                  : dead ? '✗' : '未测'
                const expireText = !m.expires ? '—' : (left >= 0 ? m.expires + ' (' + left + '天)' : '已过期')
                return h('tr', { key: m.id, className: dead ? 'dead' : '' }, [
                  h('td', { key: 'c' }, h('input', {
                    type: 'checkbox',
                    checked: !!sel[m.id],
                    onChange: () => toggle(m.id),
                  })),
                  h('td', { key: 't' }, h('span', { className: 'chip tier tier-' + m.tier, title: m.tierLabel }, m.tier)),
                  h('td', { key: 's' }, h('span', { className: 'score' }, m.score == null ? '—' : String(m.score))),
                  h('td', { key: 'm' }, [
                    h('div', { key: 'n' }, m.name),
                    h('div', { key: 'i', className: 'id' }, m.id),
                  ]),
                  h('td', { key: 'x' }, ctxLabel(m.ctx)),
                  h('td', { key: 'g' }, chipsOf(m)),
                  h('td', { key: 'w' }, h('span', { className: 'why', title: m.tierReason }, m.tierReason || '')),
                  h('td', { key: 'p', className: m.status === 'ok' ? 'ms-ok' : (dead ? 'ms-bad' : '') }, probeText),
                  h('td', { key: 'e', className: left <= 30 ? 'ms-bad' : '' }, expireText),
                ])
              })),
            ])
        ,
        h('div', { className: 'meta' }, boardLine(state)),
        h('div', { className: 'meta' },
          '分级 = 榜单分 ×0.5 + 上下文分 ×0.35 + 版本新鲜度 ×0.15（没有榜单分时按 上下文 0.7 / 新鲜度 0.3）；S≥75、A≥60、B≥45，探活失败标 X。'),
        h('div', { className: 'meta' },
          '所有 Kilo 免费通道都会把 prompt 记为可训练（mayTrainOnYourPrompts=true），别喂敏感内容。'),
      )
    }

    /** 单独一页：只看现在能用的模型。 */
    function AvailablePanel() {
      const { state, busy, error, note, run } = usePanelState()
      const [copied, setCopied] = React.useState('')
      const models = ((state && state.models) || []).filter((m) => m.status === 'ok')

      const copy = (id) => {
        const done = () => { setCopied(id); setTimeout(() => setCopied(''), 1200) }
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(id).then(done, done)
        else done()
      }

      return h('div', { className: 'km-panel' },
        h('div', { className: 'row' }, [
          h('button', { key: 'r', className: 'primary', disabled: !!busy, onClick: () => run('探测', async () => {
            const body = await apiPost('refresh', { probe: true, leaderboard: false })
            broadcast()
            return body
          }) }, busy === '探测' ? '探测中…' : '重新探测'),
          h('div', { key: 'g', className: 'grow' }),
          h('span', { key: 'm', className: 'meta' },
            models.length ? '可用 ' + models.length + ' 个' + (state && state.at ? ' · 数据来自 ' + ago(state.at) : '') : '没有可用模型'),
        ]),
        error ? h('div', { className: 'err' }, error) : null,
        note ? h('div', { className: 'oknote' }, note) : null,
        models.length === 0
          ? h('div', { className: 'empty' }, '还没有探活通过的模型。去「Kilo 模型」页点「刷新并探测」。')
          : h('div', { className: 'cards' }, models.map((m) => h('div', { key: m.id, className: 'card' }, [
              h('div', { key: 'top', className: 'top' }, [
                h('span', { key: 't', className: 'chip tier tier-' + m.tier }, m.tier),
                h('span', { key: 'n', className: 'nm' }, m.name),
              ]),
              h('div', { key: 'i', className: 'id' }, m.id),
              h('div', { key: 'g' }, chipsOf(m)),
              h('div', { key: 'x', className: 'meta' },
                ctxLabel(m.ctx) + ' 上下文 · 分 ' + (m.score == null ? '—' : m.score) + ' · ' + (m.tierReason || '')),
              h('div', { key: 'b' }, h('button', { onClick: () => copy(m.id), title: '复制模型 id' }, copied === m.id ? '已复制' : '复制 id')),
            ]))),
      )
    }

    function apply(ctx) {
      const slots = ctx.get('slots')
      if (!slots) return
      slots.inject('settings.section', () => slots.register(
        { name: 'settings.section', id: 'kilo-models', order: 26, label: 'Kilo 模型' },
        () => h(KiloPanel),
      ))
      slots.inject('settings.section', () => slots.register(
        { name: 'settings.section', id: 'kilo-models-available', order: 27, label: '可用模型' },
        () => h(AvailablePanel),
      ))
      // 模型选择器（composer 与 /model）里的名称位：名字后面挂能力徽标
      slots.inject('conversation.input.model.label', () => slots.register(
        { name: 'conversation.input.model.label' },
        ModelLabel,
      ))
    }

    exports.apply = apply
    exports.__test = { ctxLabel, ago, daysLeft, badgesOf, parse: null }
    return module.exports
  },
})
