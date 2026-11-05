import { COLORS, FORMALITIES, type Item, OCCASIONS, TYPES, WEIGHTS } from '../model'
import { type Draft, patch, remove } from '../drafts'
import { lookalike } from '../ops'
import { Chips, Picture } from '../ui'

interface Props { drafts: Draft[]; existing: Item[]; onAddMore: () => void; onSaveAll: () => void; onBack: () => void }

export function Review({ drafts, existing, onAddMore, onSaveAll, onBack }: Props) {
  const untyped = drafts.filter((d) => d.photo && !d.type).length
  const processing = drafts.some((d) => !d.photo && !d.failed)
  const ready = drafts.some((d) => d.photo)
  return (
    <div class="shell">
      <div class="main stack" style={{ gap: 12, paddingTop: 'calc(env(safe-area-inset-top) + 8px)' }}>
        <div class="row">
          <button class="back press" style={{ fontSize: 26 }} onClick={onBack} aria-label="Back">‹</button>
          <h1 class="title grow">Review {drafts.length} item{drafts.length === 1 ? '' : 's'}</h1>
          <button class="press" style={{ fontSize: 15, fontWeight: 500, height: 44 }} onClick={onAddMore}>+ More</button>
        </div>
        <div class="muted">Pick a type for each item. Everything else is optional and can be changed later.</div>
        {drafts.map((d) => <DraftCard key={d.key} d={d} existing={existing} />)}
      </div>
      <div style={{ padding: '12px 16px calc(env(safe-area-inset-bottom) + 12px)', background: 'var(--bg)', borderTop: '1px solid var(--border)' }}>
        <button class="btn btn-primary press" style={{ width: '100%' }} disabled={processing || untyped > 0 || !ready} onClick={onSaveAll}>
          {processing ? 'Preparing photos…' : untyped ? `Pick a type for ${untyped} item${untyped === 1 ? '' : 's'}` : 'Save all'}
        </button>
      </div>
    </div>
  )
}

function DraftCard({ d, existing }: { d: Draft; existing: Item[] }) {
  const twin = lookalike(existing, d.type, d.colorFamily)
  const toggle = <T extends string>(cur: T | undefined, c: T) => (cur === c ? undefined : c)
  return (
    <div class="card card-pad stack" style={{ gap: 10, padding: 12 }}>
      <div class="row">
        <div style={{ width: 92, height: 92, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {d.photo ? <Picture src={d.thumbUrl} class="thumb92" /> : d.failed ? <span style={{ fontSize: 12, color: 'var(--red-text)' }}>Couldn't read photo</span> : <div class="spinner" />}
        </div>
        <div class="grow stack" style={{ gap: 6 }}>
          <input class="field" style={{ height: 44 }} placeholder="Name (optional)" value={d.name} onInput={(e) => patch(d.key, { name: (e.target as HTMLInputElement).value })} />
          <button class="press" style={{ color: 'var(--danger)', fontSize: 14, alignSelf: 'flex-start', height: 32 }} onClick={() => remove(d.key)}>Remove</button>
        </div>
      </div>
      <div class="label">Type</div>
      <Chips options={TYPES} selected={d.type ? [d.type] : []} onToggle={(c) => patch(d.key, { type: c })} />
      <div class="label">Color family</div>
      <Chips options={COLORS} selected={d.colorFamily ? [d.colorFamily] : []} onToggle={(c) => patch(d.key, { colorFamily: toggle(d.colorFamily, c) })} />
      <div class="label">Weight</div>
      <Chips options={WEIGHTS} selected={d.weight ? [d.weight] : []} onToggle={(c) => patch(d.key, { weight: toggle(d.weight, c) })} />
      <div class="label">Formality</div>
      <Chips options={FORMALITIES} selected={d.formality ? [d.formality] : []} onToggle={(c) => patch(d.key, { formality: toggle(d.formality, c) })} />
      <div class="label">Context</div>
      <Chips options={OCCASIONS} selected={d.contexts} onToggle={(c) => patch(d.key, { contexts: d.contexts.includes(c) ? d.contexts.filter((x) => x !== c) : [...d.contexts, c] })} />
      <div class="row" style={{ gap: 20, alignItems: 'flex-start' }}>
        <div class="stack" style={{ gap: 6 }}>
          <div class="label">Hero</div>
          <Chips options={[{ code: 'Y', label: 'Yes' }, { code: 'N', label: 'No' }]} selected={[d.hero ? 'Y' : 'N']} onToggle={(c) => patch(d.key, { hero: c === 'Y' })} />
        </div>
        <div class="stack" style={{ gap: 6 }}>
          <div class="label">Palette</div>
          <Chips options={[{ code: 'PASS', label: 'Pass' }, { code: 'FAIL', label: 'Fail' }]} selected={[d.paletteFail ? 'FAIL' : 'PASS']} onToggle={(c) => patch(d.key, { paletteFail: c === 'FAIL' })} />
        </div>
      </div>
      {twin && <div class="note">Looks like {twin.id} ({twin.name}). Save anyway?</div>}
    </div>
  )
}
