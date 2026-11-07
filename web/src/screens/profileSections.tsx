// Profile sections: each is a row with a one-line summary that opens an editor sheet.
import { useState } from 'preact/hooks'
import type { Profile } from '../model'
import { geocode } from '../weather'
import { Chip, Chips, Sheet } from '../ui'

type Field =
  | { kind: 'num'; key: keyof Profile; label: string; unit: string; step?: number }
  | { kind: 'text'; key: keyof Profile; label: string }
  | { kind: 'one'; key: keyof Profile; label: string; options: string[] }
  | { kind: 'list'; key: keyof Profile; label: string }
  | { kind: 'toggle'; key: keyof Profile; label: string }

interface Section { title: string; summary: (p: Profile) => string; fields?: Field[]; custom?: 'mix' | 'location' }

const join = (xs: (string | number | undefined | false)[], sep = ' · ') => xs.filter((x) => x !== undefined && x !== '' && x !== false).join(sep)
const height = (p: Profile) => (p.heightFt ? `${p.heightFt}′${p.heightIn ?? 0}″` : undefined)

export const SECTIONS: Section[] = [
  {
    title: 'Body', summary: (p) => join([height(p), p.weightLb && `${p.weightLb} lb`, p.build]) || 'Add yours',
    fields: [
      { kind: 'num', key: 'heightFt', label: 'Height (ft)', unit: 'ft' }, { kind: 'num', key: 'heightIn', label: 'Height (in)', unit: 'in' },
      { kind: 'num', key: 'weightLb', label: 'Weight', unit: 'lb' },
      { kind: 'one', key: 'build', label: 'Build', options: ['Slim', 'Average', 'Athletic', 'Broad', 'Stocky'] },
      { kind: 'one', key: 'torso', label: 'Torso vs legs', options: ['Short torso', 'Balanced', 'Long torso'] },
    ],
  },
  {
    title: 'Sizes', summary: (p) => join([p.waist && `${p.waist}″ waist`, p.poloSize && `polo ${p.poloSize}`, p.shoeSize && `shoe ${p.shoeSize}`]) || 'Not set',
    fields: [
      { kind: 'num', key: 'chest', label: 'Chest', unit: 'in', step: 0.5 }, { kind: 'num', key: 'waist', label: 'Waist', unit: 'in', step: 0.5 },
      { kind: 'num', key: 'inseam', label: 'Inseam', unit: 'in', step: 0.5 }, { kind: 'num', key: 'neck', label: 'Neck', unit: 'in', step: 0.5 },
      { kind: 'num', key: 'sleeve', label: 'Sleeve', unit: 'in', step: 0.5 },
      { kind: 'text', key: 'shirtSize', label: 'Shirt size' }, { kind: 'text', key: 'poloSize', label: 'Polo size' }, { kind: 'text', key: 'teeSize', label: 'Tee size' },
      { kind: 'text', key: 'pantSize', label: 'Pant size' }, { kind: 'text', key: 'shortSize', label: 'Short size' }, { kind: 'text', key: 'shoeSize', label: 'Shoe size' },
    ],
  },
  {
    title: 'Fit', summary: (p) => join([p.fitOverall, `${p.pantBreak.toLowerCase()} break`, `${p.rise.toLowerCase()} rise`]),
    fields: [
      { kind: 'one', key: 'fitOverall', label: 'Overall fit', options: ['Trim', 'Tailored', 'Regular'] },
      { kind: 'one', key: 'pantBreak', label: 'Pant break', options: ['None', 'Slight', 'Full'] },
      { kind: 'one', key: 'rise', label: 'Rise', options: ['Low', 'Mid', 'Mid-high', 'High'] },
    ],
  },
  {
    title: 'Colors', summary: (p) => p.colorSeason,
    fields: [
      { kind: 'text', key: 'colorSeason', label: 'Season' }, { kind: 'list', key: 'coreColors', label: 'Core colors' },
      { kind: 'list', key: 'accentColors', label: 'Accent colors (max one per outfit)' }, { kind: 'list', key: 'avoidColors', label: 'Avoid near the face' },
      { kind: 'toggle', key: 'blackRule', label: 'No black near the face' },
    ],
  },
  {
    title: 'Style', summary: (p) => p.styleWords[0] ?? 'Not set',
    fields: [{ kind: 'list', key: 'styleWords', label: 'Style words' }, { kind: 'list', key: 'hardNos', label: 'Hard nos' }],
  },
  {
    title: 'Care', summary: (p) => join([p.neverIron && 'No ironing', p.noDryCleanCasual && 'no dry-clean casual'], ', ') || 'No rules',
    fields: [{ kind: 'toggle', key: 'neverIron', label: 'Never iron' }, { kind: 'toggle', key: 'noDryCleanCasual', label: 'No dry-clean-only casual' }],
  },
  {
    title: 'Fabrics', summary: (p) => `${p.fabricUse.length} liked · ${p.fabricReject.length} avoided`,
    fields: [{ kind: 'list', key: 'fabricUse', label: 'Liked' }, { kind: 'list', key: 'fabricReject', label: 'Avoided' }],
  },
  {
    title: 'Brands', summary: (p) => `${p.brands1.length + p.brands2.length + p.brands3.length} brands`,
    fields: [
      { kind: 'list', key: 'brands1', label: 'Tier 1 · buy freely' }, { kind: 'list', key: 'brands2', label: 'Tier 2 · check the fabric' },
      { kind: 'list', key: 'brands3', label: 'Tier 3 · specific items' },
    ],
  },
  { title: 'Life mix', summary: (p) => `WFH ${p.lifeMix.WFH}% · Family ${p.lifeMix.FAMILY}%`, custom: 'mix' },
  { title: 'Location', summary: (p) => p.location.name, custom: 'location' },
]

export function SectionSheet({ section, profile, onSave, onClose }: { section: Section; profile: Profile; onSave: (p: Profile) => void; onClose: () => void }) {
  const [p, setP] = useState<Profile>(profile)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k: keyof Profile, v: unknown) => setP({ ...p, [k]: v })

  const save = async () => {
    if (section.custom === 'mix') {
      const total = Object.values(p.lifeMix).reduce((a, b) => a + b, 0)
      if (total !== 100) { setErr(`These add up to ${total}%. Make them total 100%.`); return }
    }
    if (section.custom === 'location' && p.location.name !== profile.location.name) {
      setBusy(true); setErr('Finding it…')
      const hit = await geocode(p.location.name).catch(() => undefined)
      setBusy(false)
      if (!hit) { setErr("Couldn't find that place. Try “City, State”."); return }
      onSave({ ...p, location: hit }); return
    }
    onSave(p)
  }

  return (
    <Sheet title={section.title} onClose={onClose} foot={<button class="btn btn-primary press grow" disabled={busy} onClick={save}>Save</button>}>
      {section.fields?.map((f) => <FieldEditor key={String(f.key)} f={f} value={p[f.key]} onChange={(v) => set(f.key, v)} />)}
      {section.custom === 'mix' && (
        <div class="stack" style={{ gap: 10 }}>
          <div class="muted">How your weeks split. Used to balance the closet.</div>
          {(['WFH', 'FAMILY', 'ACTIVE', 'EXEC', 'DATE'] as const).map((k) => (
            <label key={k} class="row" style={{ gap: 10 }}>
              <span class="grow">{{ WFH: 'Work from home', FAMILY: 'Family', ACTIVE: 'Active', EXEC: 'Executive', DATE: 'Date & trips' }[k]}</span>
              <input class="field" style={{ width: 90 }} type="number" inputMode="numeric" value={p.lifeMix[k]}
                onInput={(e) => setP({ ...p, lifeMix: { ...p.lifeMix, [k]: Number((e.target as HTMLInputElement).value) || 0 } })} />
              <span>%</span>
            </label>
          ))}
          <div class="muted">Total: {Object.values(p.lifeMix).reduce((a, b) => a + b, 0)}%</div>
        </div>
      )}
      {section.custom === 'location' && (
        <div class="stack" style={{ gap: 8 }}>
          <div class="label">City</div>
          <input class="field" value={p.location.name} onInput={(e) => setP({ ...p, location: { ...p.location, name: (e.target as HTMLInputElement).value } })} />
          <div class="muted">Used for the daily weather.</div>
        </div>
      )}
      {err && <div class="muted">{err}</div>}
    </Sheet>
  )
}

function FieldEditor({ f, value, onChange }: { f: Field; value: unknown; onChange: (v: unknown) => void }) {
  if (f.kind === 'num') return (
    <label class="stack" style={{ gap: 6 }}>
      <span class="label">{f.label}</span>
      <div class="row" style={{ gap: 8 }}>
        <input class="field grow" type="number" inputMode="decimal" step={f.step ?? 1} value={(value as number | undefined) ?? ''}
          onInput={(e) => { const v = (e.target as HTMLInputElement).value; onChange(v === '' ? undefined : Number(v)) }} />
        <span class="muted">{f.unit}</span>
      </div>
    </label>
  )
  if (f.kind === 'text') return (
    <label class="stack" style={{ gap: 6 }}>
      <span class="label">{f.label}</span>
      <input class="field" value={(value as string | undefined) ?? ''} onInput={(e) => onChange((e.target as HTMLInputElement).value || undefined)} />
    </label>
  )
  if (f.kind === 'one') return (
    <div class="stack" style={{ gap: 6 }}>
      <span class="label">{f.label}</span>
      <Chips options={f.options.map((o) => ({ code: o, label: o }))} selected={value ? [String(value)] : []} onToggle={(c) => onChange(value === c ? undefined : c)} />
    </div>
  )
  if (f.kind === 'toggle') return (
    <div class="row">
      <span class="grow">{f.label}</span>
      <Chip label={value ? 'On' : 'Off'} on={!!value} onClick={() => onChange(!value)} />
    </div>
  )
  return <ListEditor label={f.label} value={(value as string[]) ?? []} onChange={onChange} />
}

function ListEditor({ label, value, onChange }: { label: string; value: string[]; onChange: (v: string[]) => void }) {
  const [draft, setDraft] = useState('')
  const add = () => { const t = draft.trim(); if (t && !value.includes(t)) onChange([...value, t]); setDraft('') }
  return (
    <div class="stack" style={{ gap: 8 }}>
      <span class="label">{label}</span>
      <div class="chips">{value.map((v) => <Chip key={v} label={`${v}  ×`} on onClick={() => onChange(value.filter((x) => x !== v))} />)}</div>
      <div class="row" style={{ gap: 8 }}>
        <input class="field grow" placeholder="Add…" value={draft} onInput={(e) => setDraft((e.target as HTMLInputElement).value)} onKeyDown={(e) => { if (e.key === 'Enter') add() }} />
        <button class="btn btn-secondary btn-sm press" onClick={add}>Add</button>
      </div>
    </div>
  )
}
