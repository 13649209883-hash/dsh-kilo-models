/**
 * dsh-kilo-models — 设置页「Kilo 模型」面板（Client 半边）。
 *
 * 以 dsh.client bundle 格式加载：window.__ModuleLoader__.load({ id, factory })，
 * id 必须等于 loader entry 名（dsh-kilo-models），否则 ModuleLoader 会报
 * "loaded without registering dsh-kilo-models"。
 *
 * 数据全部走宿主半边注册的 /dsh-kilo-models（GET 读缓存状态，POST 执行刷新/写回）。
 */
window.__ModuleLoader__.load({
  id: 'dsh-kilo-models',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const React = require('react')
    const h = React.createElement

    const CSS = [
      '.km-panel{display:flex;flex-direction:column;gap:12px;padding:4px 0;font-size:13px;color:var(--dsw-alias-label-primary)}',
      '.km-panel .row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}',
      '.km-panel .grow{flex:1}',
      '.km-panel button{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l1);border-radius:8px;padding:5px 12px;font-size:13px;cursor:pointer}',
      '.km-panel button:hover:not(:disabled){border-color:var(--dsw-alias-brand-primary)}',
      '.km-panel button:disabled{opacity:.5;cursor:default}',
      '.km-panel .primary{background:var(--dsw-alias-button-primary-fill);border-color:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary-foreground)}',
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
      '.km-panel .ms-ok{color:var(--dsw-alias-status-success)}',
      '.km-panel .ms-bad{color:var(--dsw-alias-status-error)}',
      '.km-panel .empty{padding:18px;text-align:center;color:var(--dsw-alias-label-secondary);font-size:12px}',
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

    function KiloPanel() {
      const [state, setState] = React.useState(null)
      const [busy, setBusy] = React.useState('')
      const [error, setError] = React.useState('')
      const [note, setNote] = React.useState('')
      const [sel, setSel] = React.useState({})

      React.useEffect(() => {
        ensureCss()
        let alive = true
        apiState()
          .then((s) => { if (alive) setState(s) })
          .catch((e) => { if (alive) setError(String(e.message || e)) })
        return () => { alive = false }
      }, [])

      // 刷新完成后默认勾选所有探活通过（或未探活）的免费模型
      React.useEffect(() => {
        if (!state || !state.models) return
        const next = {}
        for (const m of state.models) {
          if (m.status !== 'fail') next[m.id] = true
        }
        setSel((prev) => (Object.keys(prev).length ? prev : next))
      }, [state && state.at])

      const models = (state && state.models) || []
      const chosen = models.filter((m) => sel[m.id]).map((m) => m.id)
      const okCount = models.filter((m) => m.status === 'ok').length
      const failCount = models.filter((m) => m.status === 'fail').length

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

      const refresh = (probe) => run(probe ? '刷新并探测' : '刷新', async () => {
        const body = await apiPost('refresh', { probe })
        setState(body.state)
        setSel({})
        setNote(probe
          ? '已刷新：' + body.state.freeCount + ' 个免费模型，探活 ' + (body.state.probed || 0) + ' 个，用时 ' + Math.round((body.state.durationMs || 0) / 1000) + ' 秒'
          : '已刷新：' + body.state.freeCount + ' 个免费模型（未探测）')
      })

      const apply = () => run('写回配置', async () => {
        if (!chosen.length) throw new Error('先勾选要写回的模型')
        const body = await apiPost('apply', { ids: chosen })
        setNote('已写回 ' + body.result.written + ' 个模型到 cordis.patch.yml（备份：' + body.result.backup + '）。配置热加载后模型选择器就会更新。')
      })

      const toggle = (id) => setSel((prev) => Object.assign({}, prev, { [id]: !prev[id] }))

      return h('div', { className: 'km-panel' },
        h('div', { className: 'row' },
          h('button', { className: 'primary', disabled: !!busy, onClick: () => refresh(true) },
            busy === '刷新并探测' ? '探测中…' : '刷新并探测'),
          h('button', { disabled: !!busy, onClick: () => refresh(false) },
            busy === '刷新' ? '刷新中…' : '仅拉清单'),
          h('button', { disabled: !!busy || !chosen.length, onClick: apply },
            busy === '写回配置' ? '写入中…' : '写回 DSH 配置（' + chosen.length + '）'),
          h('div', { className: 'grow' }),
          h('span', { className: 'meta' },
            state && state.at
              ? '上次刷新 ' + ago(state.at) + ' · 免费 ' + (state.freeCount || models.length) + '/' + (state.total || '?') + ' · 可用 ' + okCount + ' · 失败 ' + failCount
              : '还没有数据'))
        ,
        error ? h('div', { className: 'err' }, error) : null,
        note ? h('div', { className: 'oknote' }, note) : null,
        models.length === 0
          ? h('div', { className: 'empty' }, busy ? '正在向 Kilo 拉取模型清单…' : '点「刷新并探测」拉一次 Kilo 免费模型清单。')
          : h('table', null, [
              h('thead', { key: 'head' }, h('tr', null, [
                h('th', { key: 'c', style: { width: 28 } }),
                h('th', { key: 't', style: { width: 34 } }, '级'),
                h('th', { key: 'm' }, '模型'),
                h('th', { key: 'x', style: { width: 56 } }, '上下文'),
                h('th', { key: 'g' }, '标签'),
                h('th', { key: 'p', style: { width: 70 } }, '探活'),
                h('th', { key: 'e', style: { width: 76 } }, '到期'),
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
                  h('td', { key: 'm' }, [
                    h('div', { key: 'n' }, m.name),
                    h('div', { key: 'i', className: 'id' }, m.id),
                  ]),
                  h('td', { key: 'x' }, ctxLabel(m.ctx)),
                  h('td', { key: 'g' }, (m.tags || []).map((t) => h('span', { key: t, className: 'chip' }, t))),
                  h('td', { key: 'p', className: m.status === 'ok' ? 'ms-ok' : (dead ? 'ms-bad' : '') }, probeText),
                  h('td', { key: 'e', className: left <= 30 ? 'ms-bad' : '' }, expireText),
                ])
              })),
            ])
        ,
        h('div', { className: 'meta' },
          '等级按上下文窗口：S=1M+ 旗舰，A=256–512K 主力，B=128–256K 中量，C=<128K 轻量；探活失败标 X。',
          '所有 Kilo 免费通道都会把 prompt 记为可训练（mayTrainOnYourPrompts=true），别喂敏感内容。')
      )
    }

    function apply(ctx) {
      const slots = ctx.get('slots')
      if (!slots) return
      slots.inject('settings.section', () => slots.register(
        { name: 'settings.section', id: 'kilo-models', order: 26, label: 'Kilo 模型' },
        () => h(KiloPanel),
      ))
    }

    exports.apply = apply
    exports.__test = { ctxLabel, ago, daysLeft }
    return module.exports
  },
})
