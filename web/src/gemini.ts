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
  } catch {
    if (ctrl.signal.reason === 'cancel') throw new GeminiError('Skipped', 0, false)
    if (ctrl.signal.reason === 'timeout') throw new GeminiError('Gemini took too long to answer', 0, true)
    throw new GeminiError('Lost the connection to Gemini', 0, true)
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
  return r.json()
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

const promptFor = (p: Profile) => `You catalog one garment for Sacha's wardrobe app. Look at the garment photo (and any label photos: care label, size tag, brand tag) and fill the fields. Never guess wildly: leave a field out if you can't tell.

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
  required: ['name', 'type'],
}

const toBase64 = (b: Blob) => new Promise<string>((res, rej) => {
  const r = new FileReader()
  r.onload = () => res(String(r.result).split(',')[1])
  r.onerror = rej
  r.readAsDataURL(b)
})

export async function tagGarment(key: string, model: string, garment: Blob, labels: Blob[] = [], profile: Profile = defaultProfile(), signal?: AbortSignal): Promise<Tagging> {
  const parts: object[] = [{ text: promptFor(profile) }, { text: 'Garment photo:' }, { inline_data: { mime_type: 'image/jpeg', data: await toBase64(garment) } }]
  for (const [n, label] of labels.slice(0, 4).entries()) parts.push({ text: `Label photo ${n + 1}:` }, { inline_data: { mime_type: 'image/jpeg', data: await toBase64(label) } })
  const j = await generate(key, model, { contents: [{ role: 'user', parts }], generationConfig: { responseMimeType: 'application/json', responseSchema: SCHEMA, temperature: 0.2 } }, { signal })
  const text: string | undefined = j?.candidates?.[0]?.content?.parts?.find((p: { text?: string }) => p.text)?.text
  if (!text) throw new GeminiError('Gemini returned nothing for this photo.')
  return clean(JSON.parse(text) as Record<string, unknown>)
}

/** Keeps only valid codes; drops anything off-list. */
function clean(raw: Record<string, unknown>): Tagging {
  const one = <T extends string>(opts: readonly { code: T }[], v: unknown) => (opts.some((o) => o.code === v) ? (v as T) : undefined)
  const many = <T extends string>(opts: readonly { code: T }[], v: unknown) => (Array.isArray(v) ? [...new Set(v.filter((x) => opts.some((o) => o.code === x)) as T[])] : undefined)
  const str = (v: unknown, n = 60) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : undefined)
  const bool = (v: unknown) => (typeof v === 'boolean' ? v : undefined)
  const t: Tagging = {
    name: str(raw.name, 40), type: one(TYPES, raw.type), colorFamily: one(COLORS, raw.colorFamily), exactColor: str(raw.exactColor),
    pattern: one(PATTERNS, raw.pattern), fabrics: many(FABRICS, raw.fabrics), blend: str(raw.blend), fabricEstimated: bool(raw.fabricEstimated),
    brand: str(raw.brand), size: str(raw.size, 20), care: str(raw.care, 80), fit: one(FITS, raw.fit), formality: one(FORMALITIES, raw.formality), weight: one(WEIGHTS, raw.weight),
    season: one(SEASONS, raw.season), contexts: many(OCCASIONS, raw.contexts), hero: bool(raw.hero), paletteFail: bool(raw.paletteFail),
    failReason: raw.paletteFail === true ? str(raw.failReason, 60) : undefined,
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

export async function tagQueued(key: string, model: string, garment: Blob, labels: Blob[] = [], profile?: Profile, opts: TagOpts = {}): Promise<Tagging> {
  opts.onStatus?.(running >= 2 ? 'Waiting for Gemini…' : 'Tagging…')
  await slot()
  try {
    for (let attempt = 0; ; attempt++) {
      opts.onStatus?.(attempt ? `Tagging… (try ${attempt + 1} of 3)` : 'Tagging…')
      try {
        return await tagGarment(key, model, garment, labels, profile, opts.signal)
      } catch (e) {
        const err = e as GeminiError
        if (!err.retryable || attempt >= 2 || opts.signal?.aborted) throw e
        const wait = err.status === 429 ? 20 : 5
        for (let s = wait; s > 0; s--) { opts.onStatus?.(`${err.message}. Retrying in ${s} s…`); await sleep(1000, opts.signal) }
      }
    }
  } finally {
    release()
  }
}
