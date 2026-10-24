/**
 * dsh-kilo-models — Kilo 免费模型名册：一键刷新 / 逐个探活 / 综合分级 / 写回 DSH 配置。
 *
 * 宿主半边（本文件）：
 *   - 从 Kilo 网关 GET /models 拉全量清单，按 isFree 过滤出免费模型；
 *   - 对每个免费模型 POST /chat/completions 发一次 "Reply with exactly: OK" 探活（带超时与并发上限）；
 *   - 分级不再只看上下文：榜单分（联网搜索 / 内置快照）+ 上下文分 + 版本新鲜度 加权；
 *   - 把结果写 ~/.dsh/kilo-models/state.json（前端读它）；
 *   - 可选把选中的模型写回 ~/.dsh/profiles/desktop/cordis.patch.yml 的 llm-pi-ai.providers.kilo.models（带备份）。
 *   - HTTP API：GET/POST /dsh-kilo-models
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
const STATE_VERSION = 5

/**
 * 评分规则（0.5.0 起）：
 * 上下文不参与打分，只用来"分桶"；桶内再按榜单分与版本新鲜度评分。
 */
const WEIGHTS = { rank: 0.7, fresh: 0.3 }
const BASELINE = 50

const dshHome = () => process.env.DSH_HOME || join(homedir(), '.dsh')
const stateDir = () => join(dshHome(), 'kilo-models')
const statePath = () => join(stateDir(), 'state.json')
const configPath = () => join(dshHome(), 'profiles', 'desktop', 'cordis.patch.yml')
const rankingsPath = () => new URL('./data/rankings.json', import.meta.url)

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

/** 上游 created 是 unix 秒；转 ISO，拿不到就 null。 */
function pickCreated(row) {
  const t = num(row.created)
  if (!t) return null
  const ms = t > 1e12 ? t : t * 1000
  const d = new Date(ms)
  return Number.isFinite(d.getTime()) ? d.toISOString() : null
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
        created: pickCreated(row),
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
      // 429/408/5xx 是服务端临时状况，不等于模型没了——标成 limited，别当成不可用
      const transient = res.status === 429 || res.status === 408 || res.status >= 500
      return { ok: false, ms, transient, status: res.status, error: `HTTP ${res.status}: ${detail}` }
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

// ---------------- 榜单 ----------------

/** 内置快照：data/rankings.json（家族 → 参考分 0–100，人工整理，非精确 Elo）。 */
function bundledLeaderboard() {
  try {
    const raw = readFileSync(rankingsPath(), 'utf8')
    const data = JSON.parse(raw)
    const entries = Array.isArray(data.entries) ? data.entries : []
    return {
      source: 'bundled',
      at: data.updated || null,
      note: data.note || '内置快照',
      entries: entries
        .map((e) => ({ match: String(e.match || '').toLowerCase(), score: Number(e.score) }))
        .filter((e) => e.match && Number.isFinite(e.score)),
    }
  } catch {
    return { source: 'bundled', at: null, note: '缺少 data/rankings.json', entries: [] }
  }
}

const FAMILIES = [
  'nemotron', 'laguna', 'north', 'lfm', 'dots', 'flint', 'glyph',
  'xingchen', 'kimi', 'deepseek', 'qwen', 'glm', 'minimax', 'mistral', 'llama', 'gpt',
]

/**
 * 从联网搜索结果里抠分数：在家族名之后 90 字符内找第一个 3–4 位数，把 1000–1600 当 Elo 折算成 0–100。
 * 只认已知家族；数字必须紧跟在家族名后面（否则会把前一个家族的分算到后一个头上）。
 */
function parseLeaderboard(sources) {
  const text = (sources || []).map((s) => `${s.title || ''} ${s.snippet || ''}`).join('\n')
  const out = new Map()
  const lower = text.toLowerCase()
  for (const fam of FAMILIES) {
    let from = 0
    while (true) {
      const at = lower.indexOf(fam, from)
      if (at < 0) break
      from = at + fam.length
      const seg = text.slice(at + fam.length, at + fam.length + 90)
      const m = /(?<!\d)(\d{3,4})(?!\d)/.exec(seg)
      if (!m) continue
      const n = Number(m[1])
      if (!Number.isFinite(n) || n < 950 || n > 1600) continue
      const score = Math.max(0, Math.min(100, Math.round((n - 950) / 6)))
      // 同一家族保留最高的一次命中
      if (!out.has(fam) || (out.get(fam).score || 0) < score) out.set(fam, { match: fam, score, raw: n })
    }
  }
  return [...out.values()]
}

/** 联网查榜单（走 ctx.web.search，DeepSeek 原生搜索）；失败返回 null，由调用方回落内置快照。 */
async function webLeaderboard(ctx) {
  const web = ctx?.web ?? (typeof ctx?.get === 'function' ? ctx.get('web') : undefined)
  if (!web || typeof web.search !== 'function') return null
  try {
    const result = await web.search({
      query: 'LMArena leaderboard top models Elo scores 2026 open weights',
      maxResults: 8,
    })
    const entries = parseLeaderboard(result?.sources || [])
    return {
      source: 'web',
      at: new Date().toISOString(),
      note: `DeepSeek 联网搜索：${(result?.sources || []).length} 条来源，抠出 ${entries.length} 个家族分数`,
      entries,
    }
  } catch (err) {
    log('联网查榜单失败：', String(err?.message || err))
    return null
  }
}

function mergeLeaderboard(bundled, live) {
  const map = new Map()
  for (const e of bundled?.entries || []) map.set(e.match, { ...e, from: 'bundled' })
  for (const e of live?.entries || []) map.set(e.match, { ...e, from: 'web' })
  const entries = [...map.values()]
  const source = live?.entries?.length ? 'web' : (bundled?.entries?.length ? 'bundled' : 'none')
  return {
    source,
    at: live?.entries?.length ? live.at : (bundled?.at || null),
    note: [bundled?.note, live?.note].filter(Boolean).join('；'),
    entries,
  }
}

// ---------------- 分级 ----------------

/** 先按上下文大小分桶，桶内再评分。 */
const BUCKETS = [
  { key: 'M1', label: '≥1M', min: 1_000_000 },
  { key: 'M512', label: '512K–1M', min: 512_000 },
  { key: 'M256', label: '256K–512K', min: 256_000 },
  { key: 'M128', label: '128K–256K', min: 128_000 },
  { key: 'SMALL', label: '<128K', min: 0 },
]
const TIER_ORDER = { M1: 0, M512: 1, M256: 2, M128: 3, SMALL: 4, X: 9 }

function bucketOf(ctx) {
  const n = Number(ctx) || 0
  const i = BUCKETS.findIndex((b) => n >= b.min)
  const b = BUCKETS[i < 0 ? BUCKETS.length - 1 : i]
  return { key: b.key, label: b.label }
}

function freshScore(created) {
  if (!created) return 50
  const days = (Date.now() - Date.parse(created)) / 86_400_000
  if (!Number.isFinite(days)) return 50
  if (days <= 180) return 95
  if (days <= 365) return 80
  if (days <= 730) return 60
  return 45
}

/** 在榜单里找这条模型：先精确 id，再家族前缀，再名字片段；同类命中优先联网结果。 */
function rankScoreOf(leaderboard, model) {
  const entries = leaderboard?.entries || []
  if (!entries.length) return null
  const id = String(model.id || '').toLowerCase()
  const name = String(model.name || '').toLowerCase()
  const preferWeb = (list) => {
    if (!list.length) return null
    const web = list.find((e) => e.from === 'web')
    return web || list[0]
  }
  const exact = entries.filter((e) => e.match === id)
  if (exact.length) return preferWeb(exact)
  return preferWeb(entries.filter((e) => id.includes(e.match) || name.includes(e.match)))
}

function tagsOf(m, probe) {
  const tags = []
  const mods = m.mods || []
  if (mods.includes('image')) tags.push('视觉')
  if (mods.includes('video')) tags.push('视频')
  if (mods.includes('audio')) tags.push('音频')
  if (mods.includes('image') && (mods.includes('video') || mods.includes('audio'))) tags.push('多模态')
  if (/code|coder|swe|devstral|laguna|north-mini|flint|poolside|qwen.*cod/i.test(`${m.id} ${m.name}`)) tags.push('代码')
  if (/content-safety|guard|moderation/i.test(m.id)) tags.push('审核')
  if (/kilo-auto/i.test(m.id)) tags.push('自动选型')
  if (m.tools) tags.push('工具')
  if (m.reasoning) tags.push('推理')
  if (m.status === 'limited') tags.push('限流')
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

function classify(models, leaderboard) {
  return models.map((m) => {
    const usable = m.status !== 'fail'
    const rank = rankScoreOf(leaderboard, m)
    // 分数就是排行榜分：查到就用它，查不到就「没有分」（排序时沉到本组末尾），不再掺新鲜度
    const rounded = rank ? Math.round(rank.score) : null
    const reason = rank
      ? `榜 ${rank.score}` + (rank.from === 'web' ? '（联网）' : '（内置）')
      : '无榜单分'
    const bucket = bucketOf(m.ctx)
    const tier = usable ? { key: bucket.key, label: bucket.label } : { key: 'X', label: '不可用' }
    return {
      ...m,
      score: rounded,
      rank: rank ? rank.score : null,
      rankFrom: rank ? rank.from : null,
      tier: tier.key,
      tierLabel: tier.label,
      tierReason: reason,
      tags: tagsOf(m, m.probe),
    }
  }).sort((a, b) => {
    const t = TIER_ORDER[a.tier] - TIER_ORDER[b.tier]
    if (t !== 0) return t
    // 有分的在前，没分的沉到本组末尾
    const ha = a.rank == null ? 1 : 0
    const hb = b.rank == null ? 1 : 0
    if (ha !== hb) return ha - hb
    const d = (b.score ?? -1) - (a.score ?? -1)
    if (d !== 0) return d
    const st = (m) => (m.status === 'ok' ? 0 : m.status === 'limited' ? 1 : 2)
    const r = st(a) - st(b)
    if (r !== 0) return r
    return (b.ctx || 0) - (a.ctx || 0) || a.id.localeCompare(b.id)
  })
}

// ---------------- 刷新 ----------------

let inFlight = null

async function runRefresh(ctx, { probe = true, leaderboard = true } = {}) {
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
        m.status = result.ok ? 'ok' : result.transient ? 'limited' : 'fail'
        m.probe = { ok: result.ok, ms: result.ms, reply: result.reply || '', error: result.error || '' }
        m.checkedAt = new Date().toISOString()
        probed++
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, models.length) }, worker))
  }

  let board = mergeLeaderboard(bundledLeaderboard(), null)
  if (leaderboard) {
    const live = await webLeaderboard(ctx)
    if (live && live.entries.length) board = mergeLeaderboard(bundledLeaderboard(), live)
    else if (live) board = { ...mergeLeaderboard(bundledLeaderboard(), live), note: `${board.note}；联网结果未解析出分数，按内置快照` }
  }

  const state = {
    version: STATE_VERSION,
    base: baseUrl(),
    at: new Date().toISOString(),
    durationMs: Date.now() - started,
    probed,
    total: rows.length,
    freeCount: free.length,
    leaderboard: board,
    models: classify(models, board),
  }
  mkdirSync(stateDir(), { recursive: true })
  writeFileSync(statePath(), JSON.stringify(state, null, 2), 'utf8')
  log(`刷新完成：${state.freeCount} 个免费模型，探活 ${probed} 个，榜单 ${board.source}，用时 ${state.durationMs}ms`)
  return state
}

function readState() {
  if (!existsSync(statePath())) return { version: STATE_VERSION, at: null, models: [] }
  try {
    return JSON.parse(readFileSync(statePath(), 'utf8'))
  } catch {
    return { version: STATE_VERSION, at: null, models: [], error: 'state.json 解析失败' }
  }
}

/** 只重查榜单并重算分级（不重新拉清单、不探活）。 */
async function refreshLeaderboard(ctx) {
  const state = readState()
  if (!state.models?.length) throw new Error('还没有模型清单，先刷新一次')
  const live = await webLeaderboard(ctx)
  const board = live && live.entries.length
    ? mergeLeaderboard(bundledLeaderboard(), live)
    : { ...mergeLeaderboard(bundledLeaderboard(), live), note: '联网结果未解析出分数，按内置快照' }
  state.leaderboard = board
  state.models = classify(state.models, board)
  state.version = STATE_VERSION
  state.leaderboardAt = new Date().toISOString()
  mkdirSync(stateDir(), { recursive: true })
  writeFileSync(statePath(), JSON.stringify(state, null, 2), 'utf8')
  log(`榜单已更新：来源 ${board.source}，${board.entries.length} 条`)
  return state
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
    const label = [base, m.tierLabel].filter(Boolean).join(' · ')
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

async function handle(ctx, req, res) {
  if (denyNonLoopback(req, res)) return
  if (req.method === 'GET') {
    send(res, { ok: true, state: readState() })
    return
  }
  const body = await readBody(req)
  const op = String(body.op || '')
  try {
    if (op === 'refresh') {
      const state = await (inFlight ?? (inFlight = runRefresh(ctx, {
        probe: body.probe !== false,
        leaderboard: body.leaderboard !== false,
      })))
      inFlight = null
      send(res, { ok: true, state })
      return
    }
    if (op === 'leaderboard') {
      const state = await refreshLeaderboard(ctx)
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
    handler: (req, res) => handle(ctx, req, res),
  }), 'kilo-models: /dsh-kilo-models API')
  log(`已挂载 /dsh-kilo-models（${baseUrl()}）`)
}
