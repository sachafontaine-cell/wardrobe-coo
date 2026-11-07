// Fit check: compare weight, waist and photos with last time; pick items worth trying on.
import { type AppData, type Item, profileOf } from './model'
import { generate, withModels } from './gemini'

const TOPS = ['POLO', 'TEE', 'SHIRT', 'LAYER']
const BOTTOMS = ['PANT', 'SHORT', 'SUIT']

export interface PhotoChange { change: 'none' | 'slimmer' | 'heavier'; areas: string[]; note: string }

const fmt = (n: number, unit: string) => `${n > 0 ? 'up' : 'down'} ${Math.abs(Math.round(n * 10) / 10)}${unit}`

export function fitFlags(d: AppData, weightLb?: number, waistIn?: number, photo?: PhotoChange): { items: Item[]; note: string } {
  const p = profileOf(d)
  const last = p.fitHistory[p.fitHistory.length - 1]
  const prevW = last?.weightLb ?? p.weightLb
  const prevWaist = last?.waistIn ?? p.waist
  const dW = weightLb !== undefined && prevW !== undefined ? weightLb - prevW : 0
  const dWaist = waistIn !== undefined && prevWaist !== undefined ? waistIn - prevWaist : 0
  const tops = Math.abs(dW) >= 5 || (photo?.change !== 'none' && photo?.areas.some((a) => /chest|shoulder|arm|belly|torso/i.test(a)))
  const bottoms = Math.abs(dWaist) >= 1 || Math.abs(dW) >= 8 || (photo?.change !== 'none' && photo?.areas.some((a) => /waist|hip|leg|thigh|seat/i.test(a)))
  const snug = (i: Item) => !i.fit || i.fit === 'TRIM' || i.fit === 'TAILORED'
  const items = d.items
    .filter((i) => i.status === 'ACTIVE' && snug(i) && ((tops && TOPS.includes(i.type)) || (bottoms && BOTTOMS.includes(i.type))))
    .sort((a, b) => (b.lastWorn ?? '').localeCompare(a.lastWorn ?? ''))
    .slice(0, 6)
  const changes = [dW && Math.abs(dW) >= 1 ? `weight ${fmt(dW, ' lb')}` : '', dWaist && Math.abs(dWaist) >= 0.5 ? `waist ${fmt(dWaist, '″')}` : ''].filter(Boolean)
  let note: string
  if (prevW === undefined && prevWaist === undefined && !photo) note = 'Baseline saved. Next time I compare against today.'
  else if (!items.length) note = `${changes.length ? `${changes.join(', ')}. ` : ''}No real change in fit. Nothing to try on.`
  else note = `${changes.length ? changes.join(', ').replace(/^./, (c) => c.toUpperCase()) + '. ' : ''}${photo && photo.change !== 'none' ? photo.note + ' ' : ''}Try on these ${items.length}; they may now be ${dW < 0 || dWaist < 0 || photo?.change === 'slimmer' ? 'loose' : 'tight'}.`
  return { items, note }
}

const b64 = (b: Blob) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(b) })

/** Asks Gemini whether build visibly changed between two front photos. */
export async function comparePhotos(key: string, model: string, before: Blob, after: Blob): Promise<PhotoChange> {
  const body = {
    contents: [{ role: 'user', parts: [
      { text: 'Two front photos of the same man, months apart (BEFORE then AFTER). Did his build visibly change in a way that affects clothing fit? Be conservative: say "none" unless the change is clear. areas: body areas that changed (chest, shoulders, arms, belly, waist, hips, legs). note: one short sentence.' },
      { text: 'BEFORE:' }, { inline_data: { mime_type: before.type || 'image/jpeg', data: await b64(before) } },
      { text: 'AFTER:' }, { inline_data: { mime_type: after.type || 'image/jpeg', data: await b64(after) } },
    ] }],
    generationConfig: { responseMimeType: 'application/json', temperature: 0.1, responseSchema: { type: 'OBJECT', properties: {
      change: { type: 'STRING', enum: ['none', 'slimmer', 'heavier'] }, areas: { type: 'ARRAY', items: { type: 'STRING' } }, note: { type: 'STRING' } }, required: ['change'] } },
  }
  const j = await withModels(key, model, (m) => generate(key, m, body))
  const t = JSON.parse(j?.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}')
  return { change: ['slimmer', 'heavier'].includes(t.change) ? t.change : 'none', areas: Array.isArray(t.areas) ? t.areas : [], note: typeof t.note === 'string' ? t.note : '' }
}
