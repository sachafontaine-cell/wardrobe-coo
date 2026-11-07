// Gemini tagging: one garment photo (plus any label photos) in, closet fields out.
import { COLORS, FABRICS, FITS, FORMALITIES, OCCASIONS, PATTERNS, SEASONS, TYPES, WEIGHTS, type Profile, defaultProfile } from './model'
import type { ColorFamily, Fabric, Fit, Formality, ItemType, Occasion, Pattern, Season, Weight } from './model'

const API = 'https://generativelanguage.googleapis.com/v1beta'

export interface Tagging {
  name?: string
  type?: ItemType
  colorFamily?: ColorFamily
  exactColor?: string
  pattern?: Pattern
  fabrics?: Fabric[]
  blend?: string
  fabricEstimated?: boolean
  brand?: string
  size?: string
  care?: string
  fit?: Fit
  formality?: Formality
  weight?: Weight
  season?: Season
  contexts?: Occasion[]
  hero?: boolean
  paletteFail?: boolean
  failReason?: string
}

export class GeminiError extends Error {
  /** retryable: a dropped connection, timeout or busy server — worth trying again. */
  constructor(message: string, readonly status = 0, readonly retryable = false) { super(message) }
}

/** Bumped when model choice changes, so saved keys get re-checked. */
export const MODEL_LOGIC = 2

/** Fast answers: thinking kept low (it adds latency and isn't needed to read a photo). */
function thinkingFor(model: string): object | undefined {
  if (/^gemini-2\.5/.test(model)) return { thinkingBudget: 0 }
  if (/^gemini-[3-9]|flash-latest/.test(model)) return { thinkingLevel: 'low' }
  return undefined
}

/**
 * One generateContent call with a time limit and readable errors.
 * Drops the thinking setting and tries again if the model rejects it.
 */
export async function generate(key: string, model: string, body: Record<string, unknown>, opts: { timeoutMs?: number; signal?: AbortSignal; thinking?: boolean } = {}): Promise<any> {
  const gen = { ...(body.generationConfig as object | undefined) } as Record<string, unknown>
  const thinking = opts.thinking !== false ? thinkingFor(model) : undefined
  if (thinking) gen.thinkingConfig = thinking
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort('timeout'), opts.timeoutMs ?? 75000)
  const onAbort = () => ctrl.abort('cancel')
  opts.signal?.addEventListener('abort', onAbort)
  let r: Response
  try {
    r = await fetch(`${API}/models/${model}:generateContent?key=${encodeURIComponent(key)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, generationConfig: gen }), signal: ctrl.signal,
    })
  } catch (e) {
    if (ctrl.signal.reason === 'cancel') throw new GeminiError('Skipped', 0, false)
    if (ctrl.signal.reason === 'timeout') throw new GeminiError('Gemini took too long to answer', 0, true)
    if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new GeminiError('Your phone is offline', 0, true)
    throw new GeminiError(`Lost the connection to Gemini (${(e as Error)?.message || 'network error'})`, 0, true)
  }
  const done = () => { clearTimeout(timer); opts.signal?.removeEventListener('abort', onAbort) }
  if (!r.ok) {
    done()
    let msg = ''
    try { msg = String((await r.json())?.error?.message ?? '') } catch { /* not JSON */ }
    if (r.status === 400 && thinking && /think/i.test(msg)) return generate(key, model, body, { ...opts, thinking: false })
    const short = msg.split(/(?<=\.)\s/)[0].slice(0, 140)
    if (r.status === 429) throw new GeminiError(`Free limit reached for now${short ? `: ${short}` : ''}`, 429, true)
    if (r.status === 400 || r.status === 403) throw new GeminiError(short || `Gemini refused the request (${r.status})`, r.status)
    if (r.status === 404) throw new GeminiError(`Model ${model} isn't available for this key`, 404)
    throw new GeminiError(`Gemini error ${r.status}${short ? `: ${short}` : ''}`, r.status, r.status >= 500)
  }
  // The time limit covers downloading the answer too, so nothing can hang.
  try { return await r.json() } catch (e) {
    if (ctrl.signal.reason === 'cancel') throw new GeminiError('Skipped', 0, false)
    throw new GeminiError(ctrl.signal.reason === 'timeout' ? 'Gemini took too long to answer' : `The answer was cut off (${(e as Error)?.message || 'network error'})`, 0, true)
  } finally { done() }
}

// ---- Streaming: tagging reads the answer as it is written ----
// A steady trickle keeps phone networks from dropping a quiet connection, a stall is
// noticed in seconds instead of minutes, and a reply that runs on (a known Gemini
// glitch with structured answers) is cut short and the finished fields kept.

export type Stage = 'send' | 'look' | 'write'
export interface StreamResult { text: string; finish?: string; cut?: 'runaway' | 'stall'; firstMs?: number }
/** Tunable for tests. */
export const TIMING = { firstMs: 45000, idleMs: 20000 }

export async function streamGenerate(key: string, model: string, body: Record<string, unknown>,
  opts: { totalMs: number; signal?: AbortSignal; thinking?: boolean; onStage?: (s: Stage, chars: number) => void }): Promise<StreamResult> {
  const gen = { ...(body.generationConfig as object | undefined) } as Record<string, unknown>
  const thinking = opts.thinking !== false ? thinkingFor(model) : undefined
  if (thinking) gen.thinkingConfig = thinking
  const ctrl = new AbortController()
  const t0 = Date.now()
  const total = setTimeout(() => ctrl.abort('timeout'), opts.totalMs)
  let idle = 0 as unknown as ReturnType<typeof setTimeout>
  const arm = (ms: number) => { clearTimeout(idle); idle = setTimeout(() => ctrl.abort('stall'), ms) }
  const onAbort = () => ctrl.abort('cancel')
  opts.signal?.addEventListener('abort', onAbort)
  const cleanup = () => { clearTimeout(total); clearTimeout(idle); opts.signal?.removeEventListener('abort', onAbort) }
  const why = (stage: Stage, e: unknown): GeminiError => {
    const r = ctrl.signal.reason
    if (r === 'cancel') return new GeminiError('Skipped', 0, false)
    if (r === 'timeout') return new GeminiError('Gemini took too long to answer', 0, true)
    if (r === 'stall') return new GeminiError(stage === 'send' ? 'No response from Gemini' : stage === 'look' ? 'Gemini went quiet' : 'The reply stalled', 0, true)
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return new GeminiError('Your phone is offline', 0, true)
    return new GeminiError(`Lost the connection to Gemini (${(e as Error)?.message || 'network error'})`, 0, true)
  }
  let stage: Stage = 'send'
  let text = ''
  let finish: string | undefined
  let firstMs: number | undefined
  const take = (ev: string) => {
    for (const line of ev.split(/\r?\n/)) {
      if (!line.startsWith('data:')) continue
      let j: any
      try { j = JSON.parse(line.slice(5).trim()) } catch { continue }
      if (j?.error) throw new GeminiError(`Gemini error: ${String(j.error.message ?? '').slice(0, 140)}`, Number(j.error.code) || 0, true)
      const cand = j?.candidates?.[0]
      for (const part of cand?.content?.parts ?? []) if (typeof part.text === 'string' && !part.thought) text += part.text
      if (cand?.finishReason) finish = cand.finishReason
    }
  }
  try {
    opts.onStage?.('send', 0)
    arm(TIMING.firstMs)
    let r: Response
    try {
      r = await fetch(`${API}/models/${model}:streamGenerateContent?alt=sse&key=${encodeURIComponent(key)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, generationConfig: gen }), signal: ctrl.signal,
      })
    } catch (e) { throw why(stage, e) }
    if (!r.ok) {
      let msg = ''
      try { msg = String((await r.json())?.error?.message ?? '') } catch { /* not JSON */ }
      if (r.status === 400 && thinking && /think/i.test(msg)) { cleanup(); return streamGenerate(key, model, body, { ...opts, thinking: false }) }
      const short = msg.split(/(?<=\.)\s/)[0].slice(0, 140)
      if (r.status === 429) throw new GeminiError(`Free limit reached for now${short ? `: ${short}` : ''}`, 429, true)
      if (r.status === 400 || r.status === 403) throw new GeminiError(short || `Gemini refused the request (${r.status})`, r.status)
      if (r.status === 404) throw new GeminiError(`Model ${model} isn't available for this key`, 404)
      throw new GeminiError(`Gemini error ${r.status}${short ? `: ${short}` : ''}`, r.status, r.status >= 500)
    }
    stage = 'look'
    opts.onStage?.('look', 0)
    arm(TIMING.firstMs)
    const reader = r.body!.getReader()
    // Stop reading the moment we give up, even if the network layer doesn't.
    ctrl.signal.addEventListener('abort', () => { reader.cancel().catch(() => {}) }, { once: true })
    const dec = new TextDecoder()
    let buf = ''
    for (;;) {
      let chunk: ReadableStreamReadResult<Uint8Array>
      try { chunk = await reader.read() } catch (e) {
        // Keep what arrived: a cut-off reply often already holds most fields.
        if (text && ctrl.signal.reason !== 'cancel') return { text, finish, cut: 'stall', firstMs }
        throw why(stage, e)
      }
      if (chunk.done) {
        if (!ctrl.signal.aborted) break
        if (text && ctrl.signal.reason !== 'cancel') return { text, finish, cut: 'stall', firstMs }
        throw why(stage, undefined)
      }
      buf += dec.decode(chunk.value, { stream: true })
      const events = buf.split(/\r?\n\r?\n/)
      buf = events.pop() ?? ''
      events.forEach(take)
      arm(TIMING.idleMs)
      if (text) {
        if (firstMs === undefined) firstMs = Date.now() - t0
        stage = 'write'
        opts.onStage?.('write', text.length)
        if (runsOn(text)) { ctrl.abort('runaway'); return { text, finish, cut: 'runaway', firstMs } }
      }
    }
    take(buf)
    return { text, finish, firstMs }
  } finally { cleanup() }
}

/** The answer is a few hundred characters; endless spaces or a looping phrase means it ran on. */
function runsOn(t: string): boolean {
  if (t.length > 6000) return true
  const tail = t.slice(-400)
  return /\s{60,}$/.test(tail) || /([\s\S]{2,40}?)\1{12,}$/.test(tail)
}

/** Reads a JSON answer, even one cut off part-way: keeps every field that finished. */
export function parseLoose(text: string): Record<string, unknown> | undefined {
  const start = text.indexOf('{')
  if (start < 0) return undefined
  const body = text.slice(start)
  try { return JSON.parse(body) } catch { /* repair below */ }
  let depth = 0, inStr = false, esc = false, lastComma = -1
  for (let i = 0; i < body.length; i++) {
    const c = body[i]
    if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue }
    if (c === '"') inStr = true
    else if (c === '{' || c === '[') depth++
    else if (c === '}' || c === ']') {
      depth--
      if (depth === 0) { try { return JSON.parse(body.slice(0, i + 1)) } catch { return undefined } }
    } else if (c === ',' && depth === 1) lastComma = i
  }
  if (lastComma < 0) return undefined
  try { return JSON.parse(body.slice(0, lastComma) + '}') } catch { return undefined }
}

/** Quick round trip to confirm the key and model work. Returns seconds taken. */
export async function testGemini(key: string, model: string): Promise<number> {
  const t0 = performance.now()
  const j = await generate(key, model, { contents: [{ role: 'user', parts: [{ text: 'Reply with the word OK.' }] }] }, { timeoutMs: 30000 })
  if (!j?.candidates?.[0]) throw new GeminiError('Gemini answered with nothing')
  return (performance.now() - t0) / 1000
}

/** Finds the best current "Flash" model this key can use. */
async function modelNames(key: string): Promise<string[]> {
  const r = await fetch(`${API}/models?pageSize=200&key=${encodeURIComponent(key)}`)
  if (r.status === 400 || r.status === 403) throw new GeminiError('That key was rejected. Copy it again from AI Studio.', r.status)
  if (!r.ok) throw new GeminiError(`Gemini error ${r.status}`, r.status)
  const j = (await r.json()) as { models?: { name: string; supportedGenerationMethods?: string[] }[] }
  return (j.models ?? []).filter((m) => m.supportedGenerationMethods?.includes('generateContent')).map((m) => m.name.replace(/^models\//, ''))
}

const byVersion = (a: string, b: string) => parseFloat(b.slice(7)) - parseFloat(a.slice(7))
let names$: Promise<string[]> | undefined
/** A second model to try when the main one keeps failing on a photo. */
export async function fallbackModel(key: string, current: string): Promise<string | undefined> {
  try {
    const names = await (names$ ??= modelNames(key))
    const stable = names.filter((n) => /^gemini-[\d.]+-flash$/.test(n) && n !== current).sort(byVersion)
    if (stable[0]) return stable[0]
    if (current !== 'gemini-flash-latest' && names.includes('gemini-flash-latest')) return 'gemini-flash-latest'
    return names.filter((n) => /^gemini-[\d.]+-flash-lite$/.test(n) && n !== current).sort(byVersion)[0]
  } catch { names$ = undefined; return undefined }
}

export async function pickModel(key: string): Promise<string> {
  const names = await modelNames(key)
  // Newest stable Flash (e.g. gemini-3.8-flash). The "latest" alias can jump to a slow preview.
  const stable = names.filter((n) => /^gemini-[\d.]+-flash$/.test(n)).sort((a, b) => parseFloat(b.slice(7)) - parseFloat(a.slice(7)))
  if (stable.length) return stable[0]
  if (names.includes('gemini-flash-latest')) return 'gemini-flash-latest'
  const pool = names.filter((n) => /^gemini-[\d.]+-flash/.test(n) && !/lite|image|tts|live|audio|thinking|exp/.test(n))
  pool.sort((a, b) => parseFloat(b.slice(7)) - parseFloat(a.slice(7)))
  if (!pool.length) throw new GeminiError('No Gemini Flash model is available for this key.')
  return pool[0]
}

const list = (opts: readonly { code: string; label: string }[]) => opts.map((o) => `${o.code} (${o.label})`).join(', ')
const enumOf = (opts: readonly { code: string }[]) => ({ type: 'STRING', enum: opts.map((o) => o.code) })

const promptFor = (p: Profile) => `You catalog one garment for Sacha's wardrobe app. Look at the garment photo (and any label photos: care label, size tag, brand tag) and fill EVERY field below with your best judgment. A stylist would always pick a color family, formality, weight, pattern, season, fit, contexts and likely fabrics from the photo; do the same. Only brand, size, care and blend may be left out, when no label or logo shows them. For coded fields, answer with the exact UPPERCASE code shown (e.g. TOBACCO, SMART), never the words in brackets.

name: 2–4 words, color + garment, e.g. "Olive knit polo", "Stone chinos", "Tobacco suede loafers".
type: one of ${list(TYPES)}. Overshirts, blazers, jackets, sweaters, hoodies = LAYER.
colorFamily: closest of ${list(COLORS)}. Cool grey, stark white, icy blue and brights = OTHER (or BLACK).
exactColor: plain words, e.g. "deep olive".
pattern: ${list(PATTERNS)}. Subtle knit or pique texture = TEXTURE.
fabrics: every fiber present, from ${list(FABRICS)}. Spandex/Lycra = ELASTANE, merino = WOOL, rayon/modal/lyocell/Tencel = VISCOSE. If label photos are given, read fibers and percentages from them and set fabricEstimated false. Otherwise estimate from the look and set fabricEstimated true.
blend: the exact label text for fibers, e.g. "96% cotton / 4% elastane". Only when read from a label.
brand: from a label or a clearly visible logo.
size: exactly as printed on a label, e.g. "M", "L Tall", "32x30", "40R", "10.5". US size if several are listed. Only from a label.
care: short wash instructions from a care label, e.g. "Machine wash cold, tumble dry low" or "Dry clean only". Only from a label.
fit: ${list(FITS)}.
formality: ${list(FORMALITIES)}.
weight: LIGHT for warm days (polos, tees, shorts, thin shirts), MID for mild days (overshirts, heavier chinos, denim), HEAVY for cold (sweaters, jackets).
season: ${list(SEASONS)}.
contexts: where it fits, from ${list(OCCASIONS)}. EXEC = customer meetings and conferences, WFH = working from home on video, FAMILY = kids and weekends, DATE = dinners out, BEACH, ACTIVE = workout only.
hero: true if people would notice it repeating: rust, burgundy or forest color, any pattern beyond solid or subtle texture, a visible logo, or a standout piece.
paletteFail: Sacha is a ${p.colorSeason}. In palette: ${p.coreColors.join(', ')}; accents ${p.accentColors.join(', ')}. Avoid near the face: ${p.avoidColors.join(', ')}${p.blackRule ? ', and black' : ''}. Tops and layers outside the palette fail. Bottoms and shoes only fail for brights or loud patterns.
failReason: 8 words or fewer, only when paletteFail is true.

Keep every text value short (care: 12 words or fewer, in English). Answer with the JSON object once, with no extra spaces or line breaks.`

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    name: { type: 'STRING' }, type: enumOf(TYPES), colorFamily: enumOf(COLORS), exactColor: { type: 'STRING' },
    pattern: enumOf(PATTERNS), fabrics: { type: 'ARRAY', items: enumOf(FABRICS) }, blend: { type: 'STRING' },
    fabricEstimated: { type: 'BOOLEAN' }, brand: { type: 'STRING' }, size: { type: 'STRING' }, care: { type: 'STRING' }, fit: enumOf(FITS), formality: enumOf(FORMALITIES),
    weight: enumOf(WEIGHTS), season: enumOf(SEASONS), contexts: { type: 'ARRAY', items: enumOf(OCCASIONS) },
    hero: { type: 'BOOLEAN' }, paletteFail: { type: 'BOOLEAN' }, failReason: { type: 'STRING' },
  },
  required: ['name', 'type', 'colorFamily', 'exactColor', 'pattern', 'fabrics', 'fit', 'formality', 'weight', 'season', 'contexts', 'hero', 'paletteFail'],
}

const toBase64 = (b: Blob) => new Promise<string>((res, rej) => {
  const r = new FileReader()
  r.onload = () => res(String(r.result).split(',')[1])
  r.onerror = rej
  r.readAsDataURL(b)
})

/** Smaller upload = faster and less likely to drop. Falls back to the original if resizing isn't possible. */
async function shrink(b: Blob, longSide: number, quality: number): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(b)
    const scale = Math.min(1, longSide / Math.max(bmp.width, bmp.height))
    const c = new OffscreenCanvas(Math.round(bmp.width * scale), Math.round(bmp.height * scale))
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
    bmp.close()
    return await c.convertToBlob({ type: 'image/jpeg', quality })
  } catch { return b }
}

export interface TagLogEntry { at: string; model: string; kb: number; sec: number; first?: number; chars: number; outcome: string }
const LOG = 'wardrobe-coo:taglog'
export function tagLog(): TagLogEntry[] { try { return JSON.parse(localStorage.getItem(LOG) ?? '[]') } catch { return [] } }
function logTry(e: TagLogEntry) { try { localStorage.setItem(LOG, JSON.stringify([e, ...tagLog()].slice(0, 12))) } catch { /* no storage */ } }

export interface TagTry { signal?: AbortSignal; lite?: boolean; timeoutMs?: number; onStage?: (s: Stage, chars: number) => void }

export async function tagGarment(key: string, model: string, garment: Blob, labels: Blob[] = [], profile: Profile = defaultProfile(), o: TagTry = {}): Promise<Tagging> {
  // The garment only needs to show color and cut; labels need enough pixels to read text.
  const g = await shrink(garment, o.lite ? 640 : 1024, o.lite ? 0.7 : 0.8)
  const ls = await Promise.all(labels.slice(0, 4).map((l) => shrink(l, o.lite ? 960 : 1280, o.lite ? 0.75 : 0.85)))
  const parts: object[] = [{ text: promptFor(profile) }, { text: 'Garment photo:' }, { inline_data: { mime_type: 'image/jpeg', data: await toBase64(g) } }]
  for (const [n, label] of ls.entries()) parts.push({ text: `Label photo ${n + 1}:` }, { inline_data: { mime_type: 'image/jpeg', data: await toBase64(label) } })
  const kb = Math.round([g, ...ls].reduce((n, b) => n + b.size, 0) * 1.37 / 1024)
  const t0 = Date.now()
  const entry = (outcome: string, r?: StreamResult): TagLogEntry => ({ at: new Date().toISOString(), model, kb, sec: Math.round((Date.now() - t0) / 100) / 10, first: r?.firstMs && Math.round(r.firstMs / 100) / 10, chars: r?.text.length ?? 0, outcome })
  let r: StreamResult
  try {
    r = await streamGenerate(key, model, {
      contents: [{ role: 'user', parts }],
      generationConfig: { responseMimeType: 'application/json', responseSchema: SCHEMA, temperature: 0.2, maxOutputTokens: 4096 },
    }, { totalMs: o.timeoutMs ?? 60000, signal: o.signal, onStage: o.onStage })
  } catch (e) {
    if ((e as Error).message !== 'Skipped') logTry(entry((e as Error).message))
    throw e
  }
  const raw = parseLoose(r.text)
  if (!raw?.type) {
    const msg = r.cut === 'runaway' ? 'Gemini rambled instead of answering' : r.cut === 'stall' ? 'The reply stalled' :
      r.finish && r.finish !== 'STOP' ? `Gemini stopped early (${r.finish.toLowerCase()})` : r.text ? 'Gemini sent an incomplete answer' : 'Gemini returned nothing for this photo'
    logTry(entry(msg, r))
    throw new GeminiError(msg, 0, true)
  }
  logTry(entry(r.cut || (r.finish && r.finish !== 'STOP') ? `OK, kept ${Object.keys(raw).length} fields (${r.cut ?? r.finish})` : 'OK', r))
  return clean(raw)
}

/** Keeps only valid codes; drops anything off-list. */
function clean(raw: Record<string, unknown>): Tagging {
  // Lenient: accept the code or its label, any case ("Tobacco", "tobacco", "TOBACCO", "Smart casual").
  const norm = (x: unknown) => String(x ?? '').trim().toUpperCase().replace(/[\s-]+/g, '_')
  const match = <T extends string>(opts: readonly { code: T; label: string }[], v: unknown) =>
    opts.find((o) => o.code === norm(v) || norm(o.label) === norm(v))?.code
  const one = <T extends string>(opts: readonly { code: T; label: string }[], v: unknown) => match(opts, v)
  const many = <T extends string>(opts: readonly { code: T; label: string }[], v: unknown) => {
    const arr = Array.isArray(v) ? v : typeof v === 'string' ? v.split(/[,;/]/) : null
    if (!arr) return undefined
    const out = [...new Set(arr.map((x) => match(opts, x)).filter(Boolean) as T[])]
    return out.length ? out : undefined
  }
  const str = (v: unknown, n = 60) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : undefined)
  const bool = (v: unknown) => (typeof v === 'boolean' ? v : undefined)
  const t: Tagging = {
    name: str(raw.name, 40), type: one(TYPES, raw.type), colorFamily: one(COLORS, raw.colorFamily), exactColor: str(raw.exactColor),
    pattern: one(PATTERNS, raw.pattern), fabrics: many(FABRICS, raw.fabrics), blend: str(raw.blend), fabricEstimated: bool(raw.fabricEstimated),
    brand: str(raw.brand), size: str(raw.size, 20), care: str(raw.care, 80), fit: one(FITS, raw.fit), formality: one(FORMALITIES, raw.formality), weight: one(WEIGHTS, raw.weight),
    season: one(SEASONS, raw.season), contexts: many(OCCASIONS, raw.contexts), hero: bool(raw.hero), paletteFail: bool(raw.paletteFail),
    failReason: raw.paletteFail === true ? str(raw.failReason, 60) : undefined,
  }
  if (!t.colorFamily) {
    const words = `${t.exactColor ?? ''} ${t.name ?? ''}`.toLowerCase()
    t.colorFamily = COLORS.find((c) => c.code !== 'OTHER' && words.includes(c.label.toLowerCase()))?.code
      ?? (/\b(brown|chocolate|coffee)\b/.test(words) ? 'ESPRESSO' : /\b(khaki|beige|sand|tan)\b/.test(words) ? 'STONE' : /\b(green)\b/.test(words) ? 'OLIVE' : /\b(blue)\b/.test(words) ? 'NAVY' : /\b(white|ivory|ecru)\b/.test(words) ? 'CREAM' : undefined)
  }
  if (t.name) t.name = t.name.charAt(0).toUpperCase() + t.name.slice(1)
  for (const k of Object.keys(t) as (keyof Tagging)[]) if (t[k] === undefined) delete t[k]
  return t
}

// ---- Queue: at most 2 at once, retry when busy (free tier has a per-minute limit). ----
let running = 0
const waiting: (() => void)[] = []
const slot = () => new Promise<void>((res) => { if (running < 2) { running++; res() } else waiting.push(() => { running++; res() }) })
const release = () => { running--; waiting.shift()?.() }

export interface TagOpts { signal?: AbortSignal; onStatus?: (s: string) => void }

const sleep = (ms: number, signal?: AbortSignal) => new Promise<void>((res, rej) => {
  const t = setTimeout(res, ms)
  signal?.addEventListener('abort', () => { clearTimeout(t); rej(new GeminiError('Skipped')) }, { once: true })
})

// Keep the screen on while Gemini works: a sleeping phone drops the connection.
let wake: { release: () => Promise<void> } | null = null
async function wakeLock(on: boolean) {
  try {
    if (on && !wake && typeof document !== 'undefined' && document.visibilityState === 'visible') wake = (await (navigator as any).wakeLock?.request('screen')) ?? null
    else if (!on && wake) { const w = wake; wake = null; await w.release() }
  } catch { wake = null }
}

/** Total time to keep trying before giving up. Patience beats making you tap Retry. */
export const TAG_BUDGET_MS = 120000

export async function tagQueued(key: string, model: string, garment: Blob, labels: Blob[] = [], profile?: Profile, opts: TagOpts = {}): Promise<Tagging> {
  opts.onStatus?.(running >= 2 ? 'Waiting for Gemini…' : 'Tagging…')
  await slot()
  wakeLock(true)
  const start = Date.now()
  let note = 'Sending photos…'
  let retryNote = ''
  const tick = () => opts.onStatus?.(`${retryNote}${note} ${Math.round((Date.now() - start) / 1000)} s`)
  const slow = setInterval(tick, 1000)
  const onStage = (s: Stage, chars: number) => { note = s === 'send' ? 'Sending photos…' : s === 'look' ? 'Gemini is looking…' : `Writing tags (${chars})…`; tick() }
  try {
    let failures = 0
    let fb: string | undefined | null = null
    for (let attempt = 1; ; attempt++) {
      const left = TAG_BUDGET_MS - (Date.now() - start)
      // After two misses: alternate with a second model, and send smaller photos.
      if (failures >= 2 && fb === null) fb = await fallbackModel(key, model)
      const m = failures >= 2 && failures % 2 === 0 && fb ? fb : model
      try {
        return await tagGarment(key, m, garment, labels, profile, { signal: opts.signal, lite: failures >= 2, timeoutMs: Math.max(15000, Math.min(60000, left)), onStage })
      } catch (e) {
        const err = e as GeminiError
        failures++
        const wait = err.status === 429 ? 20000 : Math.min(8000, 2000 * failures)
        // "Busy" (free limit) is worth waiting out longer; other misses get the 2-minute budget.
        const over = err.status === 429 ? attempt >= 10 : Date.now() - start + wait + 15000 > TAG_BUDGET_MS
        if (!err.retryable || opts.signal?.aborted || over) {
          if (err.retryable && failures > 1) throw new GeminiError(`${err.message} (${failures} tries, ${Math.round((Date.now() - start) / 1000)} s)`, err.status, true)
          throw e
        }
        retryNote = `${err.message}. Try ${failures + 1}: `
        note = 'waiting…'
        tick()
        await sleep(wait, opts.signal)
      }
    }
  } finally {
    clearInterval(slow)
    release()
    if (running === 0) wakeLock(false)
  }
}
