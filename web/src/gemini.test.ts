import { describe, expect, it, vi } from 'vitest'
import { tagGarment } from './gemini'

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
