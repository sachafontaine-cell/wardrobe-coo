import { useEffect, useState } from 'preact/hooks'
import { type AppData, COLOR_BY, type Item, emptyData, typeLabel } from './model'
import { FALLBACK } from './picker'
import * as Ops from './ops'
import { deletePhotos, getData, getPhotoBlob, loadFailed, preloadThumbs, putPhoto, replaceAll, update, useData } from './store'
import { addPhoto, clearDrafts, getDrafts, useDrafts } from './drafts'
import { processPhoto } from './photo'
import { addDays, daysBetween, todayStr } from './dates'
import { Icons, Toast } from './ui'
import { Today } from './screens/today'
import { Closet } from './screens/closet'
import { ItemDetail } from './screens/item'
import { Camera } from './screens/camera'
import { Review } from './screens/review'
import { Profile } from './screens/profile'

const VERSION = '0.2.0'
const cond = FALLBACK // Phase 1: no weather yet

type Tab = 'today' | 'closet' | 'profile'
type Sub = { kind: 'detail'; id: string } | { kind: 'camera'; replaceId?: string } | { kind: 'review' }

/** Daily upkeep and today's pick. Safe to call often. */
export function refreshDay(): string {
  const today = todayStr()
  let expired: string[] = []
  update((d) => {
    const m = Ops.dailyMaintenance(d, today)
    expired = m.expired
    return Ops.ensurePick(m.data, today, cond)
  })
  expired.forEach((id) => deletePhotos(id))
  return today
}

export function App() {
  const data = useData()
  const drafts = useDrafts()
  const [today, setToday] = useState(todayStr())
  const [tab, setTab] = useState<Tab>('today')
  const [stack, setStack] = useState<Sub[]>([])
  const [query, setQuery] = useState('')
  const [toast, setToast] = useState<{ text: string; action?: string; run?: () => void } | null>(null)
  const top = stack[stack.length - 1]

  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') setToday(refreshDay()) }
    document.addEventListener('visibilitychange', onVisible)
    preloadThumbs(getData().items.filter((i) => i.hasPhoto && i.status === 'ACTIVE').map((i) => i.id))
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])

  // Phone back button / gesture closes the top screen.
  useEffect(() => {
    const onPop = () => setStack((s) => {
      const last = s[s.length - 1]
      if (last?.kind === 'review') clearDrafts()
      return s.slice(0, -1)
    })
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(t)
  }, [toast])

  const push = (s: Sub) => { history.pushState({ d: stack.length + 1 }, ''); setStack((st) => [...st, s]) }
  const pop = () => history.back()
  const replaceTop = (s: Sub) => setStack((st) => [...st.slice(0, -1), s])

  const startAdd = () => { clearDrafts(); push({ kind: 'camera' }) }

  const saveAll = async () => {
    const ready = getDrafts().filter((d) => d.photo && d.type)
    const added: Item[] = []
    const taken: string[] = []
    for (const d of ready) {
      const id = Ops.nextId(getData().items, d.type!, taken)
      taken.push(id)
      await putPhoto(id, d.photo!.full, d.photo!.thumb)
      const color = d.colorFamily && d.colorFamily !== 'OTHER' ? COLOR_BY[d.colorFamily].label + ' ' : ''
      added.push({
        id, name: d.name.trim() || (color + typeLabel(d.type!).toLowerCase()).replace(/^./, (c) => c.toUpperCase()),
        type: d.type!, contexts: d.contexts, weight: d.weight, formality: d.formality, colorFamily: d.colorFamily,
        fabrics: [], hero: d.hero, paletteFail: d.paletteFail, condition: 'GOOD', status: 'ACTIVE', hasPhoto: true,
        added: today, eligibleDaysUnworn: 0,
      })
    }
    update((dt) => Ops.ensurePick({ ...dt, items: [...dt.items, ...added] }, today, cond))
    clearDrafts()
    const depth = stack.length
    setStack([])
    history.go(-depth)
    setTab('closet')
    setToast({ text: `Saved ${added.length} item${added.length === 1 ? '' : 's'}` })
  }

  const replacePhoto = async (id: string, blob: Blob) => {
    const p = await processPhoto(blob)
    await putPhoto(id, p.full, p.thumb)
    update((d) => ({ ...d, items: d.items.map((i) => (i.id === id ? { ...i, hasPhoto: true } : i)) }))
  }

  const buildBackup = async (): Promise<File> => {
    const d = getData()
    const toUrl = (b?: Blob) => (b ? new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.readAsDataURL(b) }) : Promise.resolve(undefined))
    const photos: Record<string, { full?: string; thumb?: string }> = {}
    for (const i of d.items.filter((x) => x.hasPhoto)) photos[i.id] = { full: await toUrl(await getPhotoBlob(i.id, false)), thumb: await toUrl(await getPhotoBlob(i.id, true)) }
    return new File([JSON.stringify({ app: 'wardrobe-coo', v: 1, data: d, photos })], `wardrobe-backup-${today}.json`, { type: 'application/json' })
  }

  /** Hands the file to Android's share sheet (pick Drive), or downloads it. Records the date on success. */
  const shareBackup = async (file: File) => {
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: 'Wardrobe backup' }) } catch (e) { if ((e as Error).name === 'AbortError') return; throw e }
    } else {
      const a = document.createElement('a')
      a.href = URL.createObjectURL(file); a.download = file.name; a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 5000)
    }
    update((d) => ({ ...d, prefs: { ...d.prefs, lastBackup: today, backupSnoozeUntil: undefined } }))
    setToast({ text: 'Closet backed up' })
  }

  const exportBackup = async () => shareBackup(await buildBackup())

  // Every 4 weeks, offer a one-tap backup right after OK. The file is prepared
  // ahead so "Back up" opens the share sheet instantly.
  const backupDue = data.items.length > 0 && !!Ops.loggedToday(data, today) &&
    (!data.prefs.lastBackup || daysBetween(data.prefs.lastBackup, today) >= 28) &&
    (!data.prefs.backupSnoozeUntil || data.prefs.backupSnoozeUntil <= today)
  const [prepared, setPrepared] = useState<File | null>(null)
  useEffect(() => {
    if (!backupDue) return
    let live = true
    buildBackup().then((f) => { if (live) setPrepared(f) })
    return () => { live = false }
  }, [backupDue])

  const importBackup = async (f: File): Promise<string> => {
    try {
      const j = JSON.parse(await f.text())
      if (j.app !== 'wardrobe-coo' || !j.data?.items) return "That file isn't a Wardrobe backup."
      for (const [id, p] of Object.entries<{ full?: string; thumb?: string }>(j.photos ?? {})) {
        if (p.full && p.thumb) await putPhoto(id, await (await fetch(p.full)).blob(), await (await fetch(p.thumb)).blob())
      }
      replaceAll({ ...emptyData(), ...j.data } as AppData)
      setToday(refreshDay())
      return `Restored ${j.data.items.length} items.`
    } catch {
      return "Couldn't read that file."
    }
  }

  // ---- Sub screens ----
  if (top?.kind === 'camera') {
    const single = !!top.replaceId
    return <Camera single={single} taken={drafts.length}
      onShot={(b) => (single ? replacePhoto(top.replaceId!, b) : addPhoto(b))}
      onPicked={(files) => (single ? replacePhoto(top.replaceId!, files[0]) : files.forEach(addPhoto))}
      onDone={() => {
        if (single) pop()
        else if (stack[stack.length - 2]?.kind === 'review') pop()
        else replaceTop({ kind: 'review' })
      }}
      onClose={() => { if (!single && !stack.some((s) => s.kind === 'review')) clearDrafts(); pop() }} />
  }
  if (top?.kind === 'review') {
    return <Review drafts={drafts} existing={data.items} onAddMore={() => push({ kind: 'camera' })} onSaveAll={saveAll} onBack={pop} />
  }
  if (top?.kind === 'detail') {
    const item = data.items.find((i) => i.id === top.id)
    if (!item) { setTimeout(pop, 0); return null }
    return (
      <div class="shell">
        <ItemDetail item={item} onBack={pop}
          onChange={(i) => update((d) => Ops.ensurePick({ ...d, items: d.items.map((x) => (x.id === i.id ? i : x)) }, today, cond))}
          onDonate={() => {
            if (item.status === 'DONATED') { update((d) => Ops.restore(d, item.id)); return }
            update((d) => Ops.ensurePick(Ops.donate(d, item.id, today), today, cond))
            pop()
            setToast({ text: `Donated ${item.name}`, action: 'Undo', run: () => update((d) => Ops.ensurePick(Ops.restore(d, item.id), today, cond)) })
          }}
          onTakePhoto={() => push({ kind: 'camera', replaceId: item.id })}
          onPickedPhoto={(f) => replacePhoto(item.id, f)} />
      </div>
    )
  }

  // ---- Tabs ----
  return (
    <div class="shell">
      {tab === 'today' && <Today data={data} today={today} cond={cond} loadFailed={loadFailed}
        onOk={() => update((d) => Ops.ok(d, today))}
        onUndo={() => update((d) => Ops.undo(d, today))}
        onSwap={() => update((d) => Ops.swapOutfit(d, today))}
        onSwapTile={(s) => update((d) => Ops.swapTile(d, today, s, cond))}
        onOccasion={(o) => update((d) => Ops.ensurePick(Ops.setOccasion(d, today, o), today, cond))}
        onAdd={startAdd}
        backup={backupDue ? {
          lastBackup: data.prefs.lastBackup,
          onYes: () => { (prepared ? shareBackup(prepared) : exportBackup()).catch(() => setToast({ text: "Backup didn't finish. Try again from Profile." })) },
          onLater: () => update((d) => ({ ...d, prefs: { ...d.prefs, backupSnoozeUntil: addDays(today, 3) } })),
        } : undefined} />}
      {tab === 'closet' && <Closet data={data} today={today} query={query} setQuery={setQuery}
        onOpen={(id) => push({ kind: 'detail', id })} onAdd={startAdd}
        onFilters={(f) => update((d) => ({ ...d, prefs: { ...d.prefs, closetFilters: f } }))}
        onSort={(s) => update((d) => ({ ...d, prefs: { ...d.prefs, closetSort: s } }))} />}
      {tab === 'profile' && <Profile data={data} version={VERSION} onExport={exportBackup} onImport={importBackup} />}
      {toast && <Toast text={toast.text} action={toast.action} onAction={() => { toast.run?.(); setToast(null) }} />}
      <nav class="tabbar">
        {(['today', 'closet', 'profile'] as Tab[]).map((t) => (
          <button key={t} class={`tab ${tab === t ? 'on' : ''}`} onClick={() => setTab(t)}>
            {Icons[t]}<span>{t === 'today' ? 'Today' : t === 'closet' ? 'Closet' : 'Profile'}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}
