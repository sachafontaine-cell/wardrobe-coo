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
  constructor(message: string, readonly status = 0) { super(message) }
}

/** Finds the best current "Flash" model this key can use. */
export async function pickModel(key: string): Promise<string> {
  const r = await fetch(`${API}/models?pageSize=200&key=${encodeURIComponent(key)}`)
  if (r.status === 400 || r.status === 403) throw new GeminiError('That key was rejected. Copy it again from AI Studio.', r.status)
  if (!r.ok) throw new GeminiError(`Gemini error ${r.status}`, r.status)
  const j = (await r.json()) as { models?: { name: string; supportedGenerationMethods?: string[] }[] }
  const names = (j.models ?? []).filter((m) => m.supportedGenerationMethods?.includes('generateContent')).map((m) => m.name.replace(/^models\//, ''))
  if (names.includes('gemini-flash-latest')) return 'gemini-flash-latest'
  const stable = names.filter((n) => /^gemini-[\d.]+-flash$/.test(n))
  const pool = stable.length ? stable : names.filter((n) => /^gemini-[\d.]+-flash/.test(n) && !/lite|image|tts|live|audio|thinking|exp/.test(n))
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

export async function tagGarment(key: string, model: string, garment: Blob, labels: Blob[] = [], profile: Profile = defaultProfile()): Promise<Tagging> {
  const parts: object[] = [{ text: promptFor(profile) }, { text: 'Garment photo:' }, { inline_data: { mime_type: 'image/jpeg', data: await toBase64(garment) } }]
  for (const [n, label] of labels.slice(0, 4).entries()) parts.push({ text: `Label photo ${n + 1}:` }, { inline_data: { mime_type: 'image/jpeg', data: await toBase64(label) } })
  const body = JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig: { responseMimeType: 'application/json', responseSchema: SCHEMA, temperature: 0.2 } })
  const r = await fetch(`${API}/models/${model}:generateContent?key=${encodeURIComponent(key)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })
  if (!r.ok) throw new GeminiError(r.status === 429 ? 'Gemini is busy' : `Gemini error ${r.status}`, r.status)
  const j = await r.json()
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

export async function tagQueued(key: string, model: string, garment: Blob, labels: Blob[] = [], profile?: Profile): Promise<Tagging> {
  await slot()
  try {
    for (let attempt = 0; ; attempt++) {
      try {
        return await tagGarment(key, model, garment, labels, profile)
      } catch (e) {
        const s = (e as GeminiError).status
        if ((s === 429 || s === 500 || s === 503) && attempt < 4) { await new Promise((r) => setTimeout(r, 4000 * 2 ** attempt)); continue }
        throw e
      }
    }
  } finally {
    release()
  }
}
