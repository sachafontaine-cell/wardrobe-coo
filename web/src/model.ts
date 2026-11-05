// Data model, ported from the Android version. Values are stored by code (e.g. "POLO").

export type Slot = 'TOP' | 'BOTTOM' | 'SHOES' | 'LAYER' | 'NONE'

export interface Opt<C extends string = string> { code: C; label: string }

const o = <C extends string>(code: C, label: string): Opt<C> => ({ code, label })

export const TYPES = [
  { ...o('POLO', 'Polo'), slot: 'TOP' as Slot },
  { ...o('TEE', 'Tee'), slot: 'TOP' as Slot },
  { ...o('SHIRT', 'Dress shirt'), slot: 'TOP' as Slot },
  { ...o('PANT', 'Pants'), slot: 'BOTTOM' as Slot },
  { ...o('SHORT', 'Shorts'), slot: 'BOTTOM' as Slot },
  { ...o('LAYER', 'Layer'), slot: 'LAYER' as Slot },
  { ...o('SUIT', 'Suit'), slot: 'NONE' as Slot },
  { ...o('SHOE', 'Shoes'), slot: 'SHOES' as Slot },
  { ...o('SWIM', 'Swim'), slot: 'NONE' as Slot },
  { ...o('WORKOUT', 'Workout'), slot: 'NONE' as Slot },
  { ...o('ACCESSORY', 'Accessory'), slot: 'NONE' as Slot },
] as const
export type ItemType = (typeof TYPES)[number]['code']

export const OCCASIONS = [o('EXEC', 'Exec'), o('WFH', 'WFH'), o('FAMILY', 'Family'), o('DATE', 'Date'), o('BEACH', 'Beach'), o('ACTIVE', 'Active')] as const
export type Occasion = (typeof OCCASIONS)[number]['code']

export const WEIGHTS = [o('LIGHT', 'Lightweight'), o('MID', 'Midweight'), o('HEAVY', 'Heavyweight')] as const
export type Weight = (typeof WEIGHTS)[number]['code']

export const FORMALITIES = [o('CASUAL', 'Casual'), o('SMART', 'Smart casual'), o('BUSINESS', 'Business')] as const
export type Formality = (typeof FORMALITIES)[number]['code']

export const COLORS = [
  { ...o('OLIVE', 'Olive'), swatch: '#6B6B3A', core: true, accent: false },
  { ...o('STONE', 'Stone'), swatch: '#C9BBA0', core: true, accent: false },
  { ...o('CREAM', 'Cream'), swatch: '#EDE3CF', core: true, accent: false },
  { ...o('TOBACCO', 'Tobacco'), swatch: '#8A5A2B', core: true, accent: false },
  { ...o('CAMEL', 'Camel'), swatch: '#B98A55', core: true, accent: false },
  { ...o('NAVY', 'Navy'), swatch: '#22304F', core: true, accent: false },
  { ...o('ESPRESSO', 'Espresso'), swatch: '#4A3222', core: true, accent: false },
  { ...o('DENIM', 'Denim'), swatch: '#2F3E5C', core: true, accent: false },
  { ...o('RUST', 'Rust'), swatch: '#A0482A', core: false, accent: true },
  { ...o('BURGUNDY', 'Burgundy'), swatch: '#6E2B33', core: false, accent: true },
  { ...o('FOREST', 'Forest'), swatch: '#2F4A36', core: false, accent: true },
  { ...o('BLACK', 'Black'), swatch: '#1C1C1C', core: false, accent: false },
  { ...o('OTHER', 'Other'), swatch: '#A3A8AE', core: false, accent: false },
] as const
export type ColorFamily = (typeof COLORS)[number]['code']

export const PATTERNS = [o('SOLID', 'Solid'), o('TEXTURE', 'Texture'), o('STRIPE', 'Stripe'), o('CHECK', 'Check'), o('PRINT', 'Print')] as const
export type Pattern = (typeof PATTERNS)[number]['code']

export const FABRICS = [
  o('COTTON', 'Cotton'), o('POLYESTER', 'Polyester'), o('NYLON', 'Nylon'), o('ELASTANE', 'Elastane'), o('WOOL', 'Wool'),
  o('LINEN', 'Linen'), o('VISCOSE', 'Viscose'), o('LEATHER', 'Leather'), o('SUEDE', 'Suede'), o('OTHER', 'Other'),
] as const
export type Fabric = (typeof FABRICS)[number]['code']

export const SEASONS = [o('YEAR_ROUND', 'Year-round'), o('SUMMER', 'Summer'), o('WINTER', 'Winter')] as const
export type Season = (typeof SEASONS)[number]['code']

export const FITS = [o('TRIM', 'Trim'), o('TAILORED', 'Tailored'), o('REGULAR', 'Regular'), o('RELAXED', 'Relaxed')] as const
export type Fit = (typeof FITS)[number]['code']

export const CONDITIONS = [o('GOOD', 'Good'), o('FADING', 'Fading'), o('WORN', 'Worn')] as const
export type Condition = (typeof CONDITIONS)[number]['code']

export const STATUSES = [o('ACTIVE', 'Active'), o('DONATED', 'Donated')] as const
export type Status = (typeof STATUSES)[number]['code']

export interface Item {
  id: string
  name: string
  type: ItemType
  contexts: Occasion[]
  weight?: Weight
  formality?: Formality
  colorFamily?: ColorFamily
  pattern?: Pattern
  fabrics: Fabric[]
  season?: Season
  fit?: Fit
  hero: boolean
  paletteFail: boolean
  failReason?: string
  condition: Condition
  status: Status
  brand?: string
  exactColor?: string
  blend?: string
  notes?: string
  hasPhoto: boolean
  photoRev?: number
  added: string
  lastWorn?: string
  eligibleDaysUnworn: number
  donatedOn?: string
}

export interface PrevValue { lastWorn?: string; eligibleDaysUnworn: number }

export interface HistoryEntry {
  date: string
  topId: string
  bottomId: string
  shoeId: string
  layerId?: string
  occasion: Occasion
  source: string
  prev: Record<string, PrevValue>
}

export interface Outfit { topId: string; bottomId: string; shoeId: string; layerId?: string }

export const outfitIds = (o: Outfit): string[] => [o.topId, o.bottomId, o.shoeId, ...(o.layerId ? [o.layerId] : [])]

export interface SwapRecord { topId: string; bottomId: string; date: string }

export interface TodayPick {
  date: string
  occasion: Occasion
  outfits: Outfit[]
  index: number
  note: string
  shown?: Outfit
  skipped: Partial<Record<Slot, string[]>>
}

export interface Prefs {
  swaps: SwapRecord[]
  blockedCombos: SwapRecord[]
  snoozes: Record<string, string>
  lastEligibilityDate?: string
  occasionOverride: Record<string, Occasion>
  todayPick?: TodayPick
  closetFilters: Record<string, string[]>
  closetSort: string
  lastBackup?: string
  backupSnoozeUntil?: string
}

export interface AppData { v: 1; items: Item[]; history: HistoryEntry[]; prefs: Prefs }

export const emptyPrefs = (): Prefs => ({ swaps: [], blockedCombos: [], snoozes: {}, occasionOverride: {}, closetFilters: {}, closetSort: 'TYPE' })
export const emptyData = (): AppData => ({ v: 1, items: [], history: [], prefs: emptyPrefs() })

const TYPE_BY = Object.fromEntries(TYPES.map((t) => [t.code, t]))
export const slotOf = (t: ItemType): Slot => TYPE_BY[t].slot
export const typeLabel = (t: ItemType): string => TYPE_BY[t].label
export const COLOR_BY = Object.fromEntries(COLORS.map((c) => [c.code, c])) as Record<ColorFamily, (typeof COLORS)[number]>

export const labelOf = (opts: readonly Opt[], code?: string): string => opts.find((x) => x.code === code)?.label ?? ''
