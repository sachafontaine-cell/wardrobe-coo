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
  } finally {
    clearTimeout(timer)
    opts.signal?.removeEventListener('abort', onAbort)
  }
  if (!r.ok) {
    let msg = ''
    try { msg = String((await r.json())?.error?.message ?? '') } catch { /* not JSON */ }
    if (r.status === 400 && thinking && /think/i.test(msg)) return generate(key, model, body, { ...opts, thinking: false })
    const short = msg.split(/(?<=\.)\s/)[0].slice(0, 140)
    if (r.status === 429) throw new GeminiError(`Free limit reached for now${short ? `: ${short}` : ''}`, 429, true)
    if (r.status === 400 || r.status === 403) throw new GeminiError(short || `Gemini refused the request (${r.status})`, r.status)
    if (r.status === 404) throw new GeminiError(`Model ${model} isn't available for this key`, 404)
    throw new GeminiError(`Gemini error ${r.status}${short ? `: ${short}` : ''}`, r.status, r.status >= 500)
  }
  try { return await r.json() } catch (e) { throw new GeminiError(`The answer was cut off (${(e as Error)?.message || 'network error'})`, 0, true) }
}

/** Quick round trip to confirm the key and model work. Returns seconds taken. */
export async function testGemini(key: string, model: string): Promise<number> {
  const t0 = performance.now()
  const j = await generate(key, model, { contents: [{ role: 'user', parts: [{ text: 'Reply with the word OK.' }] }] }, { timeoutMs: 30000 })
  if (!j?.candidates?.[0]) throw new GeminiError('Gemini answered with nothing')
  return (performance.now() - t0) / 1000
}

/** Finds the best current "Flash" model this key can use. */
export async function pickModel(key: string): Promise<string> {
  const r = await fetch(`${API}/models?pageSize=200&key=${encodeURIComponent(key)}`)
  if (r.status === 400 || r.status === 403) throw new GeminiError('That key was rejected. Copy it again from AI Studio.', r.status)
  if (!r.ok) throw new GeminiError(`Gemini error ${r.status}`, r.status)
  const j = (await r.json()) as { models?: { name: string; supportedGenerationMethods?: string[] }[] }
  const names = (j.models ?? []).filter((m) => m.supportedGenerationMethods?.includes('generateContent')).map((m) => m.name.replace(/^models\//, ''))
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
failReason: 8 words or fewer, only when paletteFail is true.`

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

export async function tagGarment(key: string, model: string, garment: Blob, labels: Blob[] = [], profile: Profile = defaultProfile(), signal?: AbortSignal, lite = false, timeoutMs = 60000): Promise<Tagging> {
  // The garment only needs to show color and cut; labels need enough pixels to read text.
  const g = await shrink(garment, lite ? 640 : 1024, lite ? 0.7 : 0.8)
  const ls = await Promise.all(labels.slice(0, 4).map((l) => shrink(l, lite ? 960 : 1280, lite ? 0.75 : 0.85)))
  const parts: object[] = [{ text: promptFor(profile) }, { text: 'Garment photo:' }, { inline_data: { mime_type: 'image/jpeg', data: await toBase64(g) } }]
  for (const [n, label] of ls.entries()) parts.push({ text: `Label photo ${n + 1}:` }, { inline_data: { mime_type: 'image/jpeg', data: await toBase64(label) } })
  const j = await generate(key, model, { contents: [{ role: 'user', parts }], generationConfig: { responseMimeType: 'application/json', responseSchema: SCHEMA, temperature: 0.2 } }, { signal, timeoutMs })
  const text: string | undefined = j?.candidates?.[0]?.content?.parts?.find((p: { text?: string }) => p.text)?.text
  if (!text) throw new GeminiError('Gemini returned nothing for this photo', 0, true)
  let raw: Record<string, unknown>
  try { raw = JSON.parse(text) } catch { throw new GeminiError('Gemini sent an incomplete answer', 0, true) }
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
  let note = 'Tagging…'
  const tick = () => opts.onStatus?.(`${note} ${Math.round((Date.now() - start) / 1000)} s`)
  const slow = setInterval(tick, 1000)
  try {
    let failures = 0
    for (let attempt = 1; ; attempt++) {
      const left = TAG_BUDGET_MS - (Date.now() - start)
      try {
        // After two dropped attempts, send smaller photos.
        return await tagGarment(key, model, garment, labels, profile, opts.signal, failures >= 2, Math.max(15000, Math.min(60000, left)))
      } catch (e) {
        const err = e as GeminiError
        failures++
        const wait = err.status === 429 ? 20000 : Math.min(8000, 2000 * failures)
        if (!err.retryable || opts.signal?.aborted || Date.now() - start + wait + 15000 > TAG_BUDGET_MS) throw e
        note = err.status ? 'Gemini is busy, still trying…' : 'Connection hiccup, still trying…'
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
