// Ask: a Gemini chat that knows the closet, the profile and today. Uses Google Search
// for shopping and trips. Changes come back as a small actions block the app applies.
import { type AppData, COLOR_BY, type Item, type ItemType, type Occasion, type Profile, profileOf, typeLabel } from './model'
import { GeminiError, generate, withModels } from './gemini'
import { gaps } from './review'

export interface Turn { role: 'user' | 'model'; text: string }

export type Action =
  | { type: 'donate'; id: string }
  | { type: 'condition'; id: string; value: 'GOOD' | 'FADING' | 'WORN' }
  | { type: 'tonight'; text: string }
  | { type: 'add'; item: { name: string; type: ItemType; colorFamily?: string; formality?: string; weight?: string; contexts?: Occasion[] } }

export interface Answer { text: string; actions: Action[]; sources: { title: string; url: string }[] }

const line = (i: Item) => [
  i.id, i.name, typeLabel(i.type), i.colorFamily ? COLOR_BY[i.colorFamily].label : '', i.weight ?? '', i.formality ?? '',
  i.contexts.join('/'), i.fabrics.join('/'), i.condition !== 'GOOD' ? i.condition : '', i.hero ? 'hero' : '', i.paletteFail ? 'off-palette' : '',
  i.lastWorn ? `worn ${i.lastWorn}` : 'never worn', i.hasPhoto ? '' : 'no photo',
].filter(Boolean).join(' | ')

function profileText(p: Profile): string {
  const h = p.heightFt ? `${p.heightFt}'${p.heightIn ?? 0}"` : 'height not set'
  return [
    `Body: ${h}, ${p.weightLb ? p.weightLb + ' lb' : 'weight not set'}, build ${p.build ?? 'not set'}, ${p.torso ?? ''}.`,
    `Sizes: chest ${p.chest ?? '?'}, waist ${p.waist ?? '?'}, inseam ${p.inseam ?? '?'}, neck ${p.neck ?? '?'}, sleeve ${p.sleeve ?? '?'}; shirt ${p.shirtSize ?? '?'}, polo ${p.poloSize ?? '?'}, tee ${p.teeSize ?? '?'}, pant ${p.pantSize ?? '?'}, short ${p.shortSize ?? '?'}, shoe ${p.shoeSize ?? '?'}.`,
    `Fit: ${p.fitOverall}, ${p.pantBreak} break, ${p.rise} rise. Never boxy or muscle-tight.${p.fitOverall === 'Tailored' ? ' Shaped with room through the middle: no trim or slim cuts; straight or slightly tapered pants, not slim.' : ''}`,
    `Colors (${p.colorSeason}): core ${p.coreColors.join(', ')}; accents ${p.accentColors.join(', ')} (max one per outfit); avoid near face ${p.avoidColors.join(', ')}${p.blackRule ? '; no black near the face (fine for shoes, belts, pants)' : ''}. Max 3 colors per outfit, tonal preferred.`,
    `Style: ${p.styleWords.join(', ')}. Hard nos: ${p.hardNos.join(', ')}.`,
    `Care: ${p.neverIron ? 'never irons; wash, dry, wear only' : ''}${p.noDryCleanCasual ? '; no dry-clean-only casual' : ''}.`,
    `Fabrics liked: ${p.fabricUse.join(', ')}. Avoided: ${p.fabricReject.join(', ')}.`,
    `Brands tier 1 (buy freely): ${p.brands1.join(', ')}. Tier 2 (check fabric): ${p.brands2.join(', ')}. Tier 3: ${p.brands3.join(', ')}.`,
    `Life mix: ${Object.entries(p.lifeMix).map(([k, v]) => `${k} ${v}%`).join(', ')}.`,
    `Home: ${p.location.name}.`,
  ].join('\n')
}

export interface TodayInfo { date: string; weather?: string; occasion: string; plan?: string; outfit?: string[] }

export function systemPrompt(d: AppData, today: TodayInfo): string {
  const p = profileOf(d)
  const active = d.items.filter((i) => i.status === 'ACTIVE')
  return `You are Sacha's Wardrobe COO: stylist, inventory keeper, replacement planner and buyer. Be decisive. Remove decisions; never add them.

How to write:
- Ultra concise. No filler, no preamble. Short lines a phone can show.
- Bullets for lists, numbered steps for steps. End with one line starting "Bottom line:".
- Refer to closet items ONLY as [[ID]] (e.g. [[POLO-003]]); the app shows the photo and name. Never invent IDs.
- For an outfit, put its item tokens on one line, e.g. "**WFH:** [[POLO-001]] [[PANT-002]] [[SHOE-001]]".
- Flag tradeoffs honestly. Don't confirm obvious, rule-consistent choices.

Duties:
- Shopping: use Google Search. Name exact products with links (brand sites over Amazon). Don't default to the priciest. Score: maintenance 40% (wash-dry-wear, never below 8/10), fit 25% (tailoring counts toward price), versatility 20% (pairs with half the closet), longevity 15%. Gate: in palette, 5+ new outfits and 30+ wears (state the estimate in one line), replaces a weaker item or fills a named gap (one in, one out), no ironing. Reject athletic logos outside the gym, cargo shorts, near-duplicates. If alterations exceed 25% of price, pick a better-fitting item.
- Packing: list from the closet by day for the trip's weather (search the forecast) and length. Use [[IDs]].
- Visual board: one outfit per life context from the closet, one line each.
- "Dinner out tonight" or similar: give the smallest change to today's outfit and return a "tonight" action.
- Add or donate by text, or an item worn out: apply it with an action and confirm in one line.
- Never let workout gear cross into other contexts. Never expand past targets: replace, don't add.

Actions: only when Sacha asks for a change, end your reply with a fenced block exactly like:
\`\`\`actions
[{"type":"donate","id":"TEE-001"}]
\`\`\`
Types: {"type":"donate","id"}, {"type":"condition","id","value":"GOOD|FADING|WORN"}, {"type":"tonight","text":"Dinner 7 pm: swap in [item names]."}, {"type":"add","item":{"name","type":"POLO|TEE|SHIRT|PANT|SHORT|LAYER|SUIT|SHOE|SWIM|WORKOUT|ACCESSORY","colorFamily":"OLIVE|STONE|CREAM|TOBACCO|CAMEL|NAVY|ESPRESSO|DENIM|RUST|BURGUNDY|FOREST|BLACK|OTHER","formality":"CASUAL|SMART|BUSINESS","weight":"LIGHT|MID|HEAVY","contexts":["EXEC","WFH","FAMILY","DATE","BEACH","ACTIVE"]}}.

Profile:
${profileText(p)}

Today: ${today.date}. Weather: ${today.weather ?? 'unknown'}. Occasion: ${today.occasion}${today.plan ? ` (${today.plan})` : ''}.
Today's outfit: ${today.outfit?.length ? today.outfit.map((id) => `[[${id}]]`).join(' ') : 'none yet'}.

Gaps vs targets: ${gaps(d.items).join('; ') || 'none'}.

Closet (${active.length} active items; ID | name | type | color | weight | formality | contexts | fabrics | flags | last worn):
${active.map(line).join('\n') || '(empty)'}`
}

export function parse(raw: string, validIds: Set<string>): { text: string; actions: Action[] } {
  let actions: Action[] = []
  const m = raw.match(/```actions\s*([\s\S]*?)```/)
  if (m) {
    try {
      const arr = JSON.parse(m[1])
      if (Array.isArray(arr)) actions = arr.filter((a) => a && typeof a === 'object' && (
        (a.type === 'donate' && validIds.has(a.id)) ||
        (a.type === 'condition' && validIds.has(a.id) && ['GOOD', 'FADING', 'WORN'].includes(a.value)) ||
        (a.type === 'tonight' && typeof a.text === 'string') ||
        (a.type === 'add' && a.item && typeof a.item.name === 'string' && typeof a.item.type === 'string')))
    } catch { /* ignore bad block */ }
  }
  return { text: raw.replace(/```actions[\s\S]*?```/, '').trim(), actions }
}

export async function ask(key: string, model: string, system: string, turns: Turn[], validIds: Set<string>): Promise<Answer> {
  const body = (search: boolean) => ({
    systemInstruction: { parts: [{ text: system }] },
    contents: turns.slice(-12).map((t) => ({ role: t.role, parts: [{ text: t.text }] })),
    ...(search ? { tools: [{ google_search: {} }] } : {}),
    generationConfig: { temperature: 0.5 },
  })
  let search = true
  let j: any
  for (let attempt = 0; ; attempt++) {
    try {
      j = await withModels(key, model, (m) => generate(key, m, body(search), { timeoutMs: 90000 }))
      break
    } catch (e) {
      const err = e as GeminiError
      if (err.status === 400 && search) { search = false; continue } // search not available for this key or model
      if (!err.retryable || attempt >= 2) throw err
      await new Promise((res) => setTimeout(res, err.status === 429 ? 20000 : 4000))
    }
  }
  const cand = j?.candidates?.[0]
  const raw = (cand?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? '').join('').trim()
  if (!raw) throw new GeminiError('No answer. Try rephrasing.')
  const chunks: { web?: { uri?: string; title?: string } }[] = cand?.groundingMetadata?.groundingChunks ?? []
  const sources = chunks.map((c) => ({ title: c.web?.title ?? '', url: c.web?.uri ?? '' })).filter((s) => s.url).slice(0, 5)
  return { ...parse(raw, validIds), sources }
}

export const SUGGESTIONS: { label: string; prompt: string }[] = [
  { label: 'Shop for …', prompt: 'Shop for ' },
  { label: 'Pack for a trip', prompt: 'Pack for a trip to ' },
  { label: 'Visual board', prompt: 'Make a visual board: one outfit per life context.' },
  { label: 'Dinner out tonight', prompt: "I'm going out to dinner tonight. What should I change?" },
  { label: 'Add item', prompt: 'Add ' },
  { label: 'Donate item', prompt: 'Donate ' },
]
