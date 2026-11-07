// One chip editor for every place an item's tags are shown: the review queue and the
// item screen. Tap a chip to change it; the exact color and the label blend sit under
// their chip groups instead of being separate fields.
import { useState } from 'preact/hooks'
import {
  COLORS, CONDITIONS, type ColorFamily, type Condition, FABRICS, FITS, FORMALITIES, type Fabric, type Fit, type Formality,
  type ItemType, OCCASIONS, type Occasion, PATTERNS, type Pattern, TYPES, WEIGHTS, type Weight,
} from '../model'
import { Chips } from '../ui'

export interface Tags {
  type?: ItemType
  colorFamily?: ColorFamily
  exactColor?: string
  weight?: Weight
  formality?: Formality
  contexts: Occasion[]
  pattern?: Pattern
  fabrics: Fabric[]
  blend?: string
  fabricEstimated?: boolean
  fit?: Fit
  hero: boolean
  paletteFail: boolean
  failReason?: string
  condition?: Condition
}

const toggle = <T extends string>(cur: T | undefined, c: T) => (cur === c ? undefined : c)
const flip = <T extends string>(list: T[], c: T) => (list.includes(c) ? list.filter((x) => x !== c) : [...list, c])

export function TagEditor({ v, set, showCondition = false }: { v: Tags; set: (change: Partial<Tags>) => void; showCondition?: boolean }) {
  return (
    <div class="stack" style={{ gap: 8 }}>
      <div class="label">Type</div>
      <Chips options={TYPES} selected={v.type ? [v.type] : []} onToggle={(c) => set({ type: c })} />
      <div class="label">Color</div>
      <Chips options={COLORS} selected={v.colorFamily ? [v.colorFamily] : []} onToggle={(c) => set({ colorFamily: toggle(v.colorFamily, c) })} />
      <InlineText value={v.exactColor} placeholder="Add exact shade, e.g. deep olive" onSave={(t) => set({ exactColor: t || undefined })} />
      <div class="label">Weight</div>
      <Chips options={WEIGHTS} selected={v.weight ? [v.weight] : []} onToggle={(c) => set({ weight: toggle(v.weight, c) })} />
      <div class="label">Formality</div>
      <Chips options={FORMALITIES} selected={v.formality ? [v.formality] : []} onToggle={(c) => set({ formality: toggle(v.formality, c) })} />
      <div class="label">Context</div>
      <Chips options={OCCASIONS} selected={v.contexts} onToggle={(c) => set({ contexts: flip(v.contexts, c) })} />
      <div class="label">Pattern</div>
      <Chips options={PATTERNS} selected={v.pattern ? [v.pattern] : []} onToggle={(c) => set({ pattern: toggle(v.pattern, c) })} />
      <div class="label">Fabric{v.fabricEstimated ? ' (estimated)' : ''}</div>
      <Chips options={FABRICS} selected={v.fabrics} onToggle={(c) => set({ fabrics: flip(v.fabrics, c), fabricEstimated: false })} />
      <InlineText value={v.blend} placeholder="Add exact blend from the label" onSave={(t) => set({ blend: t || undefined })} />
      <div class="label">Fit</div>
      <Chips options={FITS} selected={v.fit ? [v.fit] : []} onToggle={(c) => set({ fit: toggle(v.fit, c) })} />
      <div class="row" style={{ gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div class="stack" style={{ gap: 8 }}>
          <div class="label">Hero</div>
          <Chips options={[{ code: 'Y', label: 'Yes' }, { code: 'N', label: 'No' }]} selected={[v.hero ? 'Y' : 'N']} onToggle={(c) => set({ hero: c === 'Y' })} />
        </div>
        <div class="stack" style={{ gap: 8 }}>
          <div class="label">Palette</div>
          <Chips options={[{ code: 'PASS', label: 'Pass' }, { code: 'FAIL', label: 'Fail' }]} selected={[v.paletteFail ? 'FAIL' : 'PASS']} onToggle={(c) => set({ paletteFail: c === 'FAIL' })} />
        </div>
      </div>
      {v.paletteFail && v.failReason && <div class="muted">Off palette: {v.failReason}</div>}
      {showCondition && <>
        <div class="label">Condition</div>
        <Chips options={CONDITIONS} selected={v.condition ? [v.condition] : []} onToggle={(c) => set({ condition: c })} />
      </>}
    </div>
  )
}

/** Shows a value as text; tap to edit in place. Saves on Enter or when you tap away. */
function InlineText({ value, placeholder, onSave }: { value?: string; placeholder: string; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false)
  if (editing) {
    return (
      <input class="field" style={{ height: 44 }} autoFocus defaultValue={value ?? ''} placeholder={placeholder}
        onBlur={(e) => { onSave((e.target as HTMLInputElement).value.trim()); setEditing(false) }}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
    )
  }
  return (
    <button class="press" style={{ textAlign: 'left', fontSize: 14, minHeight: 32, color: value ? 'var(--text)' : 'var(--muted)' }} onClick={() => setEditing(true)}>
      {value ? <>{value} <span class="muted">✎</span></> : <u>{placeholder}</u>}
    </button>
  )
}
