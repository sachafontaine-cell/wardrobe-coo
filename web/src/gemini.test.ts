import { describe, expect, it, vi } from 'vitest'
import { TIMING, parseLoose, tagGarment, tagQueued } from './gemini'

class FakeReader { result = ''; onload: (() => void) | null = null; onerror: (() => void) | null = null; readAsDataURL() { this.result = 'data:image/jpeg;base64,eA=='; setTimeout(() => this.onload?.()) } }
vi.stubGlobal('FileReader', FakeReader)

const sse = (chunks: string[], finish = 'STOP') => chunks.map((t, i) => `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: t }] }, ...(i === chunks.length - 1 ? { finishReason: finish } : {}) }] })}\r\n\r\n`).join('')
const answer = (o: object) => vi.fn(async () => new Response(sse([JSON.stringify(o)]), { status: 200 }))
/** A stream that sends these pieces, then (optionally) goes silent without closing. */
const streamOf = (pieces: string[], hang = false) => new Response(new ReadableStream({
  start(c) { const enc = new TextEncoder(); pieces.forEach((p) => c.enqueue(enc.encode(p))); if (!hang) c.close() },
}), { status: 200 })

describe('tagging answers', () => {
  it('accepts labels and lowercase instead of codes', async () => {
    vi.stubGlobal('fetch', answer({ name: 'tobacco knit polo', type: 'Polo', colorFamily: 'Tobacco', formality: 'Smart casual', weight: 'light', pattern: 'texture', fabrics: ['Cotton', 'polyester'], contexts: 'WFH, Family, date', season: 'Year-round', fit: 'regular' }))
    const t = await tagGarment('k', 'gemini-3.8-flash', new Blob(['x']))
    expect(t).toMatchObject({ name: 'Tobacco knit polo', type: 'POLO', colorFamily: 'TOBACCO', formality: 'SMART', weight: 'LIGHT', pattern: 'TEXTURE', fabrics: ['COTTON', 'POLYESTER'], contexts: ['WFH', 'FAMILY', 'DATE'], season: 'YEAR_ROUND', fit: 'REGULAR' })
  })
  it('fills color family from the name when missing', async () => {
    vi.stubGlobal('fetch', answer({ name: 'Tobacco knit polo', type: 'POLO' }))
    expect((await tagGarment('k', 'gemini-3.8-flash', new Blob(['x']))).colorFamily).toBe('TOBACCO')
  })
})

describe('patient tagging', () => {
  it('keeps trying through dropped connections and server errors, then succeeds', async () => {
    vi.useFakeTimers()
    const ok = answer({ name: 'Navy polo', type: 'POLO' })
    let n = 0
    vi.stubGlobal('fetch', vi.fn(async (...a: unknown[]) => {
      n++
      if (n === 1 || n === 2) throw new TypeError('Failed to fetch')
      if (n === 3) return new Response('{"error":{"message":"overloaded"}}', { status: 503 })
      return (ok as (...x: unknown[]) => Promise<Response>)(...a)
    }))
    const statuses: string[] = []
    const p = tagQueued('k', 'gemini-3.8-flash', new Blob(['x']), [], undefined, { onStatus: (s) => statuses.push(s) })
    await vi.advanceTimersByTimeAsync(30000)
    const t = await p
    expect(t.type).toBe('POLO')
    expect(n).toBe(4)
    expect(statuses.some((s) => s.startsWith('Lost the connection to Gemini (Failed to fetch). Try 2'))).toBe(true)
    vi.useRealTimers()
  })
  it('gives up only after about two minutes, with the reason', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
    const p = tagQueued('k', 'gemini-3.8-flash', new Blob(['x'])).then(() => new Error('no error'), (e: Error) => e)
    await vi.advanceTimersByTimeAsync(60000)
    let done = false
    p.then(() => { done = true })
    await vi.advanceTimersByTimeAsync(1)
    expect(done).toBe(false)
    await vi.advanceTimersByTimeAsync(70000)
    const e = await p
    expect(e.message).toContain('Failed to fetch')
    vi.useRealTimers()
  })
  it('does not retry a bad key', async () => {
    let tries = 0
    vi.stubGlobal('fetch', vi.fn(async (u: string) => { if (String(u).includes('Generate')) tries++; return new Response('{"error":{"message":"API key not valid"}}', { status: 400 }) }))
    await expect(tagQueued('bad', 'gemini-3.8-flash', new Blob(['x']))).rejects.toThrow()
    expect(tries).toBe(1)
  })
})

describe('streamed answers', () => {
  it('joins a reply sent in pieces', async () => {
    const json = JSON.stringify({ name: 'Navy polo', type: 'POLO', colorFamily: 'NAVY' })
    const raw = sse([json.slice(0, 10), json.slice(10, 25), json.slice(25)])
    vi.stubGlobal('fetch', vi.fn(async () => streamOf([raw.slice(0, 33), raw.slice(33, 90), raw.slice(90)])))
    expect(await tagGarment('k', 'gemini-3.8-flash', new Blob(['x']))).toMatchObject({ type: 'POLO', colorFamily: 'NAVY' })
  })
  it('cuts off a reply that runs on and keeps the finished fields', async () => {
    const start = '{"name": "Tobacco knit polo", "type": "POLO", "colorFamily": "TOBACCO",'
    vi.stubGlobal('fetch', vi.fn(async () => new Response(sse([start, ' '.repeat(200), ' '.repeat(5000)], 'MAX_TOKENS'))))
    const t = await tagGarment('k', 'gemini-3.8-flash', new Blob(['x']))
    expect(t).toMatchObject({ type: 'POLO', colorFamily: 'TOBACCO' })
  })
  it('keeps what arrived when the reply stalls mid-way', async () => {
    const was = { ...TIMING }
    TIMING.idleMs = 50
    vi.stubGlobal('fetch', vi.fn(async () => streamOf([sse(['{"name": "Stone chinos", "type": "PANT", "weight": "MID", "care": "Machine wa'])], true)))
    const t = await tagGarment('k', 'gemini-3.8-flash', new Blob(['x']))
    Object.assign(TIMING, was)
    expect(t).toMatchObject({ type: 'PANT', weight: 'MID' })
    expect(t.care).toBeUndefined()
  })
  it('a silent connection fails fast instead of hanging', async () => {
    const was = { ...TIMING }
    TIMING.firstMs = 50
    vi.stubGlobal('fetch', vi.fn(async () => streamOf([], true)))
    await expect(tagGarment('k', 'gemini-3.8-flash', new Blob(['x']))).rejects.toThrow('Gemini went quiet')
    Object.assign(TIMING, was)
  })
})

describe('parseLoose', () => {
  it('reads whole, trailing-garbage and cut-off answers', () => {
    expect(parseLoose('{"a":1}')).toEqual({ a: 1 })
    expect(parseLoose('```json\n{"a":1}\n``` and more')).toEqual({ a: 1 })
    expect(parseLoose('{"a":1,"b":["X","Y"],"c":"unfin')).toEqual({ a: 1, b: ['X', 'Y'] })
    expect(parseLoose('{"a":"x, y","b":2,')).toEqual({ a: 'x, y', b: 2 })
    expect(parseLoose('nothing')).toBeUndefined()
  })
})

describe('busy models', () => {
  it('moves to another model as soon as one is overloaded, and remembers it', async () => {
    const used: string[] = []
    const ok = answer({ name: 'Navy polo', type: 'POLO' }) as unknown as () => Promise<Response>
    const store: Record<string, string> = {}
    vi.stubGlobal('localStorage', { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v } })
    vi.stubGlobal('fetch', vi.fn(async (u: string) => {
      if (String(u).includes('/models?')) return new Response(JSON.stringify({ models: ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.5-flash-lite'].map((n) => ({ name: `models/${n}`, supportedGenerationMethods: ['generateContent'] })) }))
      const m = String(u).split('/models/')[1].split(':')[0]
      used.push(m)
      if (m === 'gemini-3.8-flash') return new Response('{"error":{"message":"This model is currently experiencing high demand."}}', { status: 503 })
      return ok()
    }))
    const t = await tagQueued('k2', 'gemini-3.8-flash', new Blob(['x']))
    expect(t.type).toBe('POLO')
    expect(used).toEqual(['gemini-3.8-flash', 'gemini-3.6-flash'])
    // Next time, the model that worked goes first.
    used.length = 0
    await tagQueued('k2', 'gemini-3.8-flash', new Blob(['x']))
    expect(used).toEqual(['gemini-3.6-flash'])
    vi.unstubAllGlobals()
    vi.stubGlobal('FileReader', FakeReader)
  })
})
