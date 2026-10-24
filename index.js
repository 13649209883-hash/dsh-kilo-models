/**
 * dsh-kilo-models — Kilo 免费模型名册：一键刷新 / 逐个探活 / 自动分级 / 写回 DSH 配置。
 *
 * 宿主半边（本文件）：
 *   - 从 Kilo 网关 GET /models 拉全量清单，按 isFree 过滤出免费模型；
 *   - 对每个免费模型 POST /chat/completions 发一次 "Reply with exactly: OK" 探活（带超时与并发上限）；
 *   - 按上下文窗口 + 模态 + 实测延迟给模型分级/打标签；
 *   - 把结果写 ~/.dsh/kilo-models/state.json（前端读它）；
 *   - 可选把选中的模型写回 ~/.dsh/profiles/desktop/cordis.patch.yml 的 llm-pi-ai.providers.kilo.models（带备份）。
 *   - HTTP API：GET/POST /dsh-kilo-models
 *
 * 为什么要有它：DSH 的模型清单是静态写死在 cordis.patch.yml 里的，上游随时下架/转付费
 * （2026-10-24 的 minimax-m3.1-flash:free 就是这么 400 的）。这个插件把"拉清单→探活→写回"
 * 变成设置页里的一个按钮。
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

export const name = 'kilo-models'
export const inject = ['webServer']

const DEFAULT_BASE = 'https://api.kilo.ai/api/gateway'
const PROBE_TIMEOUT_MS = 20000
const LIST_TIMEOUT_MS = 30000
const CONCURRENCY = 4

const dshHome = () => process.env.DSH_HOME || join(homedir(), '.dsh')
const stateDir = () => join(dshHome(), 'kilo-models')
const statePath = () => join(stateDir(), 'state.json')
const configPath = () => join(dshHome(), 'profiles', 'desktop', 'cordis.patch.yml')

function log(...args) {
  console.log('[kilo-models]', ...args)
}

// ---------------- 凭据 ----------------

/** 读 KILO_API_KEY：优先环境变量，其次 ~/.dsh/.credentials.yaml（只取该键，不打印）。 */
function apiKey() {
  const fromEnv = process.env.KILO_API_KEY
  if (fromEnv && fromEnv.trim()) return fromEnv.trim()
  const file = join(dshHome(), '.credentials.yaml')
  if (!existsSync(file)) return ''
  try {
    const text = readFileSync(file, 'utf8')
    const m = /^\s*KILO_API_KEY\s*:\s*['"]?([^'"\r\n]+)['"]?\s*$/m.exec(text)
    return m ? m[1].trim() : ''
  } catch {
    return ''
  }
}

function baseUrl() {
  return (process.env.KILO_MODELS_BASE || DEFAULT_BASE).replace(/\/+$/, '')
}

// ---------------- 拉清单 ----------------

function num(v) {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) && n > 0 ? n : null
}

function pickContext(row) {
  return num(row.context_length) ?? num(row.context_window) ?? num(row.limits?.context_window)
    ?? num(row.top_provider?.context_length) ?? null
}

function pickMaxOut(row) {
  return num(row.max_output_tokens) ?? num(row.limits?.max_output_tokens)
    ?? num(row.top_provider?.max_completion_tokens) ?? null
}

function pickMods(row) {
  const a = row.architecture?.input_modalities ?? row.input_modalities
  return Array.isArray(a) && a.length ? a.map(String) : null
}

function isFree(row) {
  return row.isFree === true || row.is_free === true
}

function displayName(row, id) {
  const n = row.name || row.display_name || row.displayName
  return typeof n === 'string' && n.trim() ? n.trim() : id
}

async function fetchListing() {
  const key = apiKey()
  if (!key) throw new Error('缺少 KILO_API_KEY（环境变量或 ~/.dsh/.credentials.yaml）')
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), LIST_TIMEOUT_MS)
  try {
    const res = await fetch(`${baseUrl()}/models`, {
      headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
      signal: ctrl.signal,
    })
    if (!res.ok) throw new Error(`GET /models → HTTP ${res.status}`)
    const body = await res.json()
    const rows = Array.isArray(body?.data) ? body.data : Array.isArray(body?.models) ? body.models : []
    return rows.map((row) => {
      const id = String(row.id ?? '').trim()
      return {
        id,
        name: displayName(row, id),
        ctx: pickContext(row),
        maxOut: pickMaxOut(row),
        mods: pickMods(row),
        free: isFree(row),
        // 上游给的到期日（如 2026-10-31），null 表示不限期
        expires: typeof row.expiration_date === 'string' && row.expiration_date ? row.expiration_date : null,
        // 免费池都会提示"可能拿你的 prompt 训练"，显式记下来给界面用
        train: row.mayTrainOnYourPrompts === true,
        tools: Array.isArray(row.supported_parameters) && row.supported_parameters.includes('tools'),
        reasoning: !!(row.opencode && (row.opencode.variants || row.opencode.reasoning_options)),
      }
    }).filter((m) => m.id)
  } finally {
    clearTimeout(timer)
  }
}

// ---------------- 探活 ----------------

async function probeModel(modelId) {
  const key = apiKey()
  if (!key) return { ok: false, ms: 0, error: '无 KILO_API_KEY' }
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS)
  const started = Date.now()
  try {
    const res = await fetch(`${baseUrl()}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      signal: ctrl.signal,
      body: JSON.stringify({
        model: modelId,
        messages: [{ role: 'user', content: 'Reply with exactly: OK' }],
        // 给足预算：推理型模型会把 32 token 全吃在 thinking 上，content 为空
        max_tokens: 200,
        temperature: 0,
        stream: false,
      }),
    })
    const ms = Date.now() - started
    const text = await res.text()
    if (!res.ok) {
      let detail = text.slice(0, 300)
      try {
        const j = JSON.parse(text)
        detail = j?.error?.message || j?.message || detail
      } catch { /* 原文即可 */ }
      return { ok: false, ms, error: `HTTP ${res.status}: ${detail}` }
    }
    let content = ''
    try {
      const j = JSON.parse(text)
      content = j?.choices?.[0]?.message?.content ?? ''
    } catch { /* 忽略 */ }
    return { ok: true, ms, reply: String(content).slice(0, 40) }
  } catch (err) {
    const ms = Date.now() - started
    const msg = err?.name === 'AbortError' ? `超时 ${PROBE_TIMEOUT_MS}ms` : String(err?.message || err)
    return { ok: false, ms, error: msg }
  } finally {
    clearTimeout(timer)
  }
}

// ---------------- 分级 ----------------

const TIER_ORDER = { S: 0, A: 1, B: 2, C: 3, X: 9 }

function tierOf(ctx, ok) {
  if (!ok) return { key: 'X', label: '不可用' }
  if (!ctx) return { key: 'B', label: '中量' }
  if (ctx >= 1_000_000) return { key: 'S', label: '旗舰' }
  if (ctx >= 512_000) return { key: 'A', label: '主力+' }
  if (ctx >= 256_000) return { key: 'A', label: '主力' }
  if (ctx >= 128_000) return { key: 'B', label: '中量' }
  return { key: 'C', label: '轻量' }
}

function tagsOf(m, probe) {
  const tags = []
  const mods = m.mods || []
  if (mods.includes('image')) tags.push('视觉')
  if (mods.includes('video')) tags.push('视频')
  if (mods.includes('audio')) tags.push('音频')
  if (/code|coder|swe|devstral|laguna|north-mini|flint|poolside|qwen.*cod/i.test(`${m.id} ${m.name}`)) tags.push('代码')
  if (/content-safety|guard|moderation/i.test(m.id)) tags.push('审核')
  if (/kilo-auto/i.test(m.id)) tags.push('自动选型')
  if (m.tools) tags.push('工具')
  if (m.reasoning) tags.push('推理')
  if (m.expires && daysLeft(m.expires) <= 30) tags.push('即将到期')
  if (probe?.ok && probe.ms <= 1500) tags.push('极速')
  else if (probe?.ok && probe.ms >= 8000) tags.push('慢')
  return tags
}

/** 距到期日还有几天；解析失败返回 Infinity。 */
function daysLeft(dateStr) {
  const t = Date.parse(`${dateStr}T23:59:59Z`)
  if (!Number.isFinite(t)) return Number.POSITIVE_INFINITY
  return Math.ceil((t - Date.now()) / 86_400_000)
}

function classify(models) {
  return models.map((m) => {
    // 只有探活失败才算不可用；没探测过的仍按上下文给等级，界面显示「未测」
    const usable = m.status !== 'fail'
    const tier = tierOf(m.ctx, usable)
    return { ...m, tier: tier.key, tierLabel: tier.label, tags: tagsOf(m, m.probe) }
  }).sort((a, b) => {
    const t = TIER_ORDER[a.tier] - TIER_ORDER[b.tier]
    if (t !== 0) return t
    return (b.ctx || 0) - (a.ctx || 0) || a.id.localeCompare(b.id)
  })
}

// ---------------- 刷新 ----------------

let inFlight = null

async function runRefresh({ probe = true } = {}) {
  const started = Date.now()
  const rows = await fetchListing()
  const free = rows.filter((r) => r.free)
  const models = free.map((r) => ({ ...r, status: 'unknown', probe: null, checkedAt: null }))
  let probed = 0

  if (probe) {
    let cursor = 0
    const worker = async () => {
      while (cursor < models.length) {
        const i = cursor++
        const m = models[i]
        const result = await probeModel(m.id)
        m.status = result.ok ? 'ok' : 'fail'
        m.probe = { ok: result.ok, ms: result.ms, reply: result.reply || '', error: result.error || '' }
        m.checkedAt = new Date().toISOString()
        probed++
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, models.length) }, worker))
  }

  const state = {
    version: 2,
    base: baseUrl(),
    at: new Date().toISOString(),
    durationMs: Date.now() - started,
    probed,
    total: rows.length,
    freeCount: free.length,
    models: classify(models),
  }
  mkdirSync(stateDir(), { recursive: true })
  writeFileSync(statePath(), JSON.stringify(state, null, 2), 'utf8')
  log(`刷新完成：${state.freeCount} 个免费模型，探活 ${probed} 个，用时 ${state.durationMs}ms`)
  return state
}

function readState() {
  if (!existsSync(statePath())) return { version: 2, at: null, models: [] }
  try {
    return JSON.parse(readFileSync(statePath(), 'utf8'))
  } catch {
    return { version: 2, at: null, models: [], error: 'state.json 解析失败' }
  }
}

// ---------------- 写回配置 ----------------

function yamlSafe(s) {
  return String(s).replace(/'/g, "''")
}

function yamlBlock(models, indent = '        ') {
  const lines = [`${indent}models:`]
  for (const m of models) {
    lines.push(`${indent}  - id: '${yamlSafe(m.id)}'`)
    lines.push(`${indent}    name: '${yamlSafe(m.name)}'`)
    if (m.ctx) lines.push(`${indent}    contextWindow: ${m.ctx}`)
    if (Array.isArray(m.mods) && m.mods.length > 1) lines.push(`${indent}    inputModalities: [ ${m.mods.join(', ')} ]`)
  }
  return lines.join('\n')
}

/** 把 cordis.patch.yml 里 llm-pi-ai.providers.kilo.models 整段换掉，其余文本一字不动。 */
function spliceModels(text, block) {
  const lines = text.split('\n')
  const kiloAt = lines.findIndex((l) => /^\s{6}kilo:\s*$/.test(l))
  if (kiloAt < 0) throw new Error('cordis.patch.yml 里找不到 providers.kilo 区块')
  let start = -1
  for (let i = kiloAt + 1; i < lines.length; i++) {
    const line = lines[i]
    if (/^\s{8}models:\s*$/.test(line)) { start = i; break }
    if (line.trim() && !/^\s{8,}/.test(line)) break
  }
  if (start < 0) throw new Error('providers.kilo 下找不到 models 列表')
  let end = lines.length
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i]
    if (line.trim() === '' || /^\s{8,}/.test(line)) continue
    end = i
    break
  }
  const head = lines.slice(0, start)
  const tail = lines.slice(end)
  return `${head.join('\n')}\n${block}\n${tail.join('\n')}`
}

function ctxLabel(ctx) {
  if (ctx >= 1_000_000) return `${Math.round(ctx / 1_000_000)}M`
  if (ctx >= 1_000) return `${Math.round(ctx / 1_000)}K`
  return String(ctx)
}

function applyToConfig(ids) {
  const state = readState()
  const byId = new Map((state.models || []).map((m) => [m.id, m]))
  const picked = []
  for (const id of ids) {
    const m = byId.get(id)
    if (!m) throw new Error(`名册里没有 ${id}，先刷新一次`)
    const base = m.name.replace(/\s*\(free\)\s*$/i, '').split(' · ')[0]
    const label = [base, m.ctx ? ctxLabel(m.ctx) : '', m.tierLabel].filter(Boolean).join(' · ')
    picked.push({ ...m, name: label })
  }
  if (!picked.length) throw new Error('没有选中任何模型')
  const file = configPath()
  if (!existsSync(file)) throw new Error(`配置文件不存在：${file}`)
  const before = readFileSync(file, 'utf8')
  const after = spliceModels(before, yamlBlock(picked))
  mkdirSync(stateDir(), { recursive: true })
  const backup = join(stateDir(), `cordis.patch.yml.${Date.now()}.bak`)
  copyFileSync(file, backup)
  writeFileSync(file, after, 'utf8')
  log(`已写回 ${picked.length} 个模型到 ${file}（备份 ${backup}）`)
  return { written: picked.length, backup, ids: picked.map((m) => m.id) }
}

// ---------------- HTTP ----------------

function denyNonLoopback(req, res) {
  const addr = req.socket?.remoteAddress || ''
  const ok = addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1'
  if (!ok) {
    res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({ ok: false, error: 'loopback only' }))
  }
  return !ok
}

function send(res, obj, status = 200) {
  const body = JSON.stringify(obj)
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(body)
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = []
    let size = 0
    req.on('data', (c) => {
      size += c.length
      if (size > 1_000_000) { req.destroy(); return }
      chunks.push(c)
    })
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'))
      } catch {
        resolve({})
      }
    })
    req.on('error', () => resolve({}))
  })
}

async function handle(req, res) {
  if (denyNonLoopback(req, res)) return
  if (req.method === 'GET') {
    send(res, { ok: true, state: readState() })
    return
  }
  const body = await readBody(req)
  const op = String(body.op || '')
  try {
    if (op === 'refresh') {
      const state = await (inFlight ?? (inFlight = runRefresh({ probe: body.probe !== false })))
      inFlight = null
      send(res, { ok: true, state })
      return
    }
    if (op === 'apply') {
      const ids = Array.isArray(body.ids) ? body.ids.map(String) : []
      const result = applyToConfig(ids)
      send(res, { ok: true, result })
      return
    }
    if (op === 'probe') {
      const result = await probeModel(String(body.id || ''))
      send(res, { ok: true, result })
      return
    }
    send(res, { ok: false, error: `未知操作 ${op}` }, 400)
  } catch (err) {
    inFlight = null
    send(res, { ok: false, error: String(err?.message || err) }, 500)
  }
}

export function apply(ctx) {
  const webServer = ctx.webServer ?? ctx.get('webServer')
  if (!webServer) {
    log('没有 webServer 服务，设置界面不可用')
    return
  }
  ctx.effect(() => webServer.register({
    kind: 'exact',
    path: '/dsh-kilo-models',
    handler: handle,
  }), 'kilo-models: /dsh-kilo-models API')
  log(`已挂载 /dsh-kilo-models（${baseUrl()}）`)
}
