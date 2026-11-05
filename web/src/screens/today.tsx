import { useState } from 'preact/hooks'
import { type AppData, type Item, OCCASIONS, type Occasion, type Slot, labelOf } from '../model'
import { loggedToday, occasionFor, shownOutfit } from '../ops'
import { type DayConditions, reason } from '../picker'
import { prettyDate } from '../dates'
import { Crest, Picture } from '../ui'

interface Props {
  data: AppData
  today: string
  cond: DayConditions
  loadFailed: boolean
  onOk: () => void
  onUndo: () => void
  onSwap: () => void
  onSwapTile: (s: Slot) => void
  onOccasion: (o: Occasion) => void
  onAdd: () => void
}

export function Today({ data, today, cond, loadFailed, onOk, onUndo, onSwap, onSwapTile, onOccasion, onAdd }: Props) {
  const items = new Map(data.items.map((i) => [i.id, i]))
  const pick = data.prefs.todayPick?.date === today ? data.prefs.todayPick : undefined
  const outfit = shownOutfit(data, today)
  const logged = !!loggedToday(data, today)
  const occ = occasionFor(data, today)

  return (
    <div class="main stack">
      <div class="row">
        <Crest />
        <div class="grow">
          <h1 class="title">{prettyDate(today)}</h1>
          {!cond.known && <div class="muted">Weather arrives in the next update</div>}
        </div>
      </div>

      <OccasionChip current={occ} onPick={onOccasion} />

      {loadFailed ? (
        <div class="card card-pad">I can't read your closet data, so I can't pick an outfit right now.</div>
      ) : !outfit ? (
        <Empty data={data} onAdd={onAdd} />
      ) : (
        <>
          <div class="outfit">
            {([['TOP', outfit.topId], ['BOTTOM', outfit.bottomId], ['SHOES', outfit.shoeId], ...(outfit.layerId ? [['LAYER', outfit.layerId]] : [])] as [Slot, string][]).map(([slot, id]) => {
              const it = items.get(id)
              return (
                <button key={slot} class="tile press" disabled={logged} onClick={() => onSwapTile(slot)} aria-label={`Swap ${it?.name ?? ''}`}>
                  <Picture id={id} hasPhoto={it?.hasPhoto} type={it?.type} color={it?.colorFamily} />
                  <span class="tile-name">{it?.name}</span>
                </button>
              )
            })}
          </div>
          <div style={{ fontSize: 16 }}>{reason(outfit, items, cond, pick?.note ?? '')}</div>
          {logged ? (
            <div class="row" style={{ gap: 10 }}>
              <div class="btn logged grow">✓&nbsp; Logged</div>
              <button class="btn-ghost press" onClick={onUndo}>Undo</button>
            </div>
          ) : (
            <div class="row" style={{ gap: 10 }}>
              <button class="btn btn-primary grow press" onClick={onOk}>OK</button>
              <button class="btn btn-secondary press" style={{ width: 112 }} onClick={onSwap}>Swap</button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function OccasionChip({ current, onPick }: { current: Occasion; onPick: (o: Occasion) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ position: 'relative', alignSelf: 'flex-start' }}>
      <button class="pill press" onClick={() => setOpen(!open)}>{labelOf(OCCASIONS, current)} <span aria-hidden="true">▾</span></button>
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 25 }} onClick={() => setOpen(false)} />
          <div class="menu" style={{ top: 50, left: 0 }}>
            {OCCASIONS.map((o) => <button key={o.code} onClick={() => { setOpen(false); onPick(o.code) }}>{o.label}</button>)}
          </div>
        </>
      )}
    </div>
  )
}

function Empty({ data, onAdd }: { data: AppData; onAdd: () => void }) {
  const active = data.items.filter((i: Item) => i.status === 'ACTIVE')
  const has = (s: string[]) => active.some((i) => s.includes(i.type))
  const missing = [!has(['POLO', 'TEE', 'SHIRT']) && 'a top', !has(['PANT', 'SHORT']) && 'a bottom', !has(['SHOE']) && 'shoes'].filter(Boolean) as string[]
  const text = missing.length
    ? `Add ${missing.length > 1 ? missing.slice(0, -1).join(', ') + ' and ' + missing[missing.length - 1] : missing[0]} to get your first outfit.`
    : "Nothing fits today's rules. Add a few more pieces, or change today's occasion."
  return (
    <div class="card card-pad stack">
      <div>{text}</div>
      <button class="btn btn-primary press" onClick={onAdd}>Add clothes</button>
    </div>
  )
}
