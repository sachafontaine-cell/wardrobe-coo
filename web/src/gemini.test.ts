import { describe, expect, it, vi } from 'vitest'
import { tagGarment, tagQueued } from './gemini'

class FakeReader { result = ''; onload: (() => void) | null = null; onerror: (() => void) | null = null; readAsDataURL() { this.result = 'data:image/jpeg;base64,eA=='; setTimeout(() => this.onload?.()) } }
vi.stubGlobal('FileReader', FakeReader)

const answer = (o: object) => vi.fn(async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(o) }] } }] }), { status: 200 }))

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
    expect(statuses.some((s) => s.startsWith('Connection hiccup'))).toBe(true)
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
    const f = vi.fn(async () => new Response('{"error":{"message":"API key not valid"}}', { status: 400 }))
    vi.stubGlobal('fetch', f)
    await expect(tagQueued('k', 'gemini-3.8-flash', new Blob(['x']))).rejects.toThrow()
    expect(f).toHaveBeenCalledTimes(1)
  })
})
