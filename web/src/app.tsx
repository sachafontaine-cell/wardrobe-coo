import { useEffect, useState } from 'preact/hooks'
import { type AppData, COLOR_BY, type Item, emptyData, typeLabel } from './model'
import * as Ops from './ops'
import { deletePhotos, getData, getPhotoBlob, loadFailed, preloadThumbs, putPhoto, replaceAll, update, useData } from './store'
import { addPhoto, clearDrafts, getDrafts, useDrafts } from './drafts'
import { processLabel, processPhoto } from './photo'
import { addDays, daysBetween, todayStr } from './dates'
import { getContext, onContextChange, refreshContext, setDay, useContext } from './context'
import { getSettings, setSettings, useSettings } from './settings'
import { uploadBackup } from './google'
import { type Tagging, tagQueued } from './gemini'
import { Icons, Toast } from './ui'
import { Today } from './screens/today'
import { Closet } from './screens/closet'
import { ItemDetail } from './screens/item'
import { Camera } from './screens/camera'
import { Review } from './screens/review'
import { Profile } from './screens/profile'

const VERSION = '0.3.0'

type Tab = 'today' | 'closet' | 'profile'
type Sub = { kind: 'detail'; id: string } | { kind: 'camera'; replaceId?: string } | { kind: 'review' }

/** Daily upkeep and today's pick. Safe to call often. */
export function refreshDay(): string {
  const today = todayStr()
  setDay(today)
  let expired: string[] = []
  update((d) => {
    const m = Ops.dailyMaintenance(d, today)
    expired = m.expired
    return Ops.ensurePick(m.data, today, getContext().cond)
  })
  expired.forEach((id) => deletePhotos(id))
  return today
}

// When fresh weather or calendar arrives, re-pick (only if nothing is logged yet).
onContextChange(() => update((d) => Ops.ensurePick(d, todayStr(), getContext().cond)))

const toDataUrl = (b?: Blob) =>
  b ? new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.readAsDataURL(b) }) : Promise.resolve(undefined)

async function backupJson(): Promise<string> {
  const d = getData()
  const photos: Record<string, { full?: string; thumb?: string }> = {}
  for (const i of d.items.filter((x) => x.hasPhoto)) photos[i.id] = { full: await toDataUrl(await getPhotoBlob(i.id, false)), thumb: await toDataUrl(await getPhotoBlob(i.id, true)) }
  // The Google link travels with the backup so a restore reconnects; the Gemini key does not.
  return JSON.stringify({ app: 'wardrobe-coo', v: 1, data: d, photos, google: getSettings().google })
}

/** Fills only fields that are still empty. */
function mergeTagging(item: Item, t: Tagging, fromLabel: boolean): Item {
  const out: Item = { ...item }
  const fill = <K extends keyof Item>(k: K, v: Item[K] | undefined) => {
    if (v === undefined) return
    const cur = out[k]
    if (cur === undefined || cur === '' || (Array.isArray(cur) && cur.length === 0)) out[k] = v
  }
  fill('colorFamily', t.colorFamily); fill('exactColor', t.exactColor); fill('pattern', t.pattern); fill('fit', t.fit)
  fill('formality', t.formality); fill('weight', t.weight); fill('season', t.season); fill('contexts', t.contexts); fill('brand', t.brand)
  if (fromLabel) { if (t.fabrics?.length) out.fabrics = t.fabrics; if (t.blend) out.blend = t.blend; if (t.brand) out.brand = t.brand }
  else { fill('fabrics', t.fabrics); fill('blend', t.blend) }
  if (t.paletteFail && !item.paletteFail) { out.paletteFail = true; out.failReason = t.failReason }
  if (t.hero && !item.hero) out.hero = true
  return out
}

const markBackedUp = () => update((d) => ({ ...d, prefs: { ...d.prefs, lastBackup: todayStr(), backupSnoozeUntil: undefined } }))

async function backupToDrive() {
  await uploadBackup(`wardrobe-backup-${todayStr()}.json`, await backupJson())
  markBackedUp()
}

/** With Google connected: back up to Drive weekly, silently. */
let backingUp = false
async function autoBackup() {
  const d = getData()
  if (backingUp || !getSettings().google || !d.items.length) return
  if (d.prefs.lastBackup && daysBetween(d.prefs.lastBackup, todayStr()) < 7) return
  backingUp = true
  try { await backupToDrive() } catch { /* try again next open; the 4-week prompt is the fallback */ }
  backingUp = false
}

export function App() {
  const data = useData()
  const drafts = useDrafts()
  const ctx = useContext()
  const settings = useSettings()
  const [today, setToday] = useState(todayStr())
  const [tab, setTab] = useState<Tab>('today')
  const [stack, setStack] = useState<Sub[]>([])
  const [query, setQuery] = useState('')
  const [toast, setToast] = useState<{ text: string; action?: string; run?: () => void } | null>(null)
  const top = stack[stack.length - 1]
  const cond = ctx.cond

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      setToday(refreshDay())
      refreshContext().then(autoBackup)
    }
    document.addEventListener('visibilitychange', onVisible)
    preloadThumbs(getData().items.filter((i) => i.hasPhoto && i.status === 'ACTIVE').map((i) => i.id))
    refreshContext().then(autoBackup)
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
  const goSetup = () => { const depth = stack.length; if (depth) { setStack([]); history.go(-depth) } setTab('profile') }

  const startAdd = () => { clearDrafts(); push({ kind: 'camera' }) }

  const saveAll = async () => {
    const ready = getDrafts().filter((d) => d.photo && d.type)
    const added: Item[] = []
    const taken: string[] = []
    const day = todayStr()
    for (const d of ready) {
      const id = Ops.nextId(getData().items, d.type!, taken)
      taken.push(id)
      await putPhoto(id, d.photo!.full, d.photo!.thumb)
      const color = d.colorFamily && d.colorFamily !== 'OTHER' ? COLOR_BY[d.colorFamily].label + ' ' : ''
      added.push({
        id, name: d.name.trim() || (color + typeLabel(d.type!).toLowerCase()).replace(/^./, (c) => c.toUpperCase()),
        type: d.type!, contexts: d.contexts, weight: d.weight, formality: d.formality, colorFamily: d.colorFamily, exactColor: d.exactColor,
        pattern: d.pattern, fabrics: d.fabrics, blend: d.blend, brand: d.brand, fit: d.fit, season: d.season,
        hero: d.hero, paletteFail: d.paletteFail, failReason: d.paletteFail ? d.failReason : undefined,
        condition: 'GOOD', status: 'ACTIVE', hasPhoto: true, added: day, eligibleDaysUnworn: 0,
      })
    }
    update((dt) => Ops.ensurePick({ ...dt, items: [...dt.items, ...added] }, day, getContext().cond))
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

  /** Re-tag a saved item from its photo, or from a care label photo. Fills empty fields only. */
  const retag = async (id: string, labelFile?: File): Promise<string> => {
    const s = getSettings()
    if (!s.geminiKey || !s.geminiModel) { goSetup(); return '' }
    const photo = await getPhotoBlob(id, false)
    if (!photo) return 'Add a photo first.'
    try {
      const label = labelFile ? await processLabel(labelFile) : undefined
      const t = await tagQueued(s.geminiKey, s.geminiModel, photo, label)
      update((d) => ({ ...d, items: d.items.map((i) => (i.id === id ? mergeTagging(i, t, !!label) : i)) }))
      return label ? 'Fibers and brand read from the label.' : 'Filled in the empty fields.'
    } catch (e) {
      return `Couldn't tag: ${(e as Error).message}`
    }
  }

  // ---- Backups ----

  const shareBackup = async (file: File) => {
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: 'Wardrobe backup' }) } catch (e) { if ((e as Error).name === 'AbortError') return; throw e }
    } else {
      const a = document.createElement('a')
      a.href = URL.createObjectURL(file); a.download = file.name; a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 5000)
    }
    markBackedUp()
    setToast({ text: 'Closet backed up' })
  }
  const backupFile = async () => new File([await backupJson()], `wardrobe-backup-${todayStr()}.json`, { type: 'application/json' })
  const exportBackup = async () => shareBackup(await backupFile())


  // Without Google: every 4 weeks, offer a one-tap backup right after OK. The file is
  // prepared ahead so "Back up" opens the share sheet instantly.
  const backupDue = data.items.length > 0 && !!Ops.loggedToday(data, today) &&
    (!data.prefs.lastBackup || daysBetween(data.prefs.lastBackup, today) >= 28) &&
    (!data.prefs.backupSnoozeUntil || data.prefs.backupSnoozeUntil <= today)
  const [prepared, setPrepared] = useState<File | null>(null)
  useEffect(() => {
    if (!backupDue || settings.google) return
    let live = true
    backupFile().then((f) => { if (live) setPrepared(f) })
    return () => { live = false }
  }, [backupDue, !!settings.google])

  const importBackup = async (f: File): Promise<string> => {
    try {
      const j = JSON.parse(await f.text())
      if (j.app !== 'wardrobe-coo' || !j.data?.items) return "That file isn't a Wardrobe backup."
      for (const [id, p] of Object.entries<{ full?: string; thumb?: string }>(j.photos ?? {})) {
        if (p.full && p.thumb) await putPhoto(id, await (await fetch(p.full)).blob(), await (await fetch(p.thumb)).blob())
      }
      replaceAll({ ...emptyData(), ...j.data } as AppData)
      if (j.google && !getSettings().google) setSettings({ google: j.google })
      setToday(refreshDay())
      refreshContext(true)
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
    return <Review drafts={drafts} existing={data.items} onAddMore={() => push({ kind: 'camera' })} onSaveAll={saveAll} onBack={pop} onSetup={goSetup} />
  }
  if (top?.kind === 'detail') {
    const item = data.items.find((i) => i.id === top.id)
    if (!item) { setTimeout(pop, 0); return null }
    return (
      <div class="shell">
        <ItemDetail item={item} onBack={pop} canTag={!!settings.geminiKey}
          onChange={(i) => update((d) => Ops.ensurePick({ ...d, items: d.items.map((x) => (x.id === i.id ? i : x)) }, today, cond))}
          onDonate={() => {
            if (item.status === 'DONATED') { update((d) => Ops.restore(d, item.id)); return }
            update((d) => Ops.ensurePick(Ops.donate(d, item.id, today), today, cond))
            pop()
            setToast({ text: `Donated ${item.name}`, action: 'Undo', run: () => update((d) => Ops.ensurePick(Ops.restore(d, item.id), today, cond)) })
          }}
          onTakePhoto={() => push({ kind: 'camera', replaceId: item.id })}
          onPickedPhoto={(f) => replacePhoto(item.id, f)}
          onRetag={(label) => retag(item.id, label)} />
      </div>
    )
  }

  // ---- Tabs ----
  const showSetup = !settings.setupHidden && (!settings.geminiKey || !settings.google)
  return (
    <div class="shell">
      {tab === 'today' && <Today data={data} today={today} ctx={ctx} loadFailed={loadFailed}
        showSetup={showSetup} onSetup={goSetup} onHideSetup={() => setSettings({ setupHidden: true })}
        onOk={() => update((d) => Ops.ok(d, today))}
        onUndo={() => update((d) => Ops.undo(d, today))}
        onSwap={() => update((d) => Ops.swapOutfit(d, today))}
        onSwapTile={(s) => update((d) => Ops.swapTile(d, today, s, cond))}
        onOccasion={(o) => update((d) => Ops.ensurePick(Ops.setOccasion(d, today, o), today, cond))}
        onAdd={startAdd}
        backup={backupDue && !settings.google ? {
          lastBackup: data.prefs.lastBackup,
          onYes: () => { (prepared ? shareBackup(prepared) : exportBackup()).catch(() => setToast({ text: "Backup didn't finish. Try again from Profile." })) },
          onLater: () => update((d) => ({ ...d, prefs: { ...d.prefs, backupSnoozeUntil: addDays(today, 3) } })),
        } : undefined} />}
      {tab === 'closet' && <Closet data={data} today={today} query={query} setQuery={setQuery}
        onOpen={(id) => push({ kind: 'detail', id })} onAdd={startAdd}
        onFilters={(f) => update((d) => ({ ...d, prefs: { ...d.prefs, closetFilters: f } }))}
        onSort={(s) => update((d) => ({ ...d, prefs: { ...d.prefs, closetSort: s } }))} />}
      {tab === 'profile' && <Profile data={data} version={VERSION} onExport={exportBackup} onImport={importBackup}
        onBackupNow={backupToDrive} onConnected={() => { refreshContext(true).then(autoBackup) }} />}
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
