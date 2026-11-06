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
  size?: string
  care?: string
  /** Number of label photos stored for this item. */
  labels?: number
  notes?: string
  hasPhoto: boolean
  photoRev?: number
  added: string
  lastWorn?: string
  eligibleDaysUnworn: number
  donatedOn?: string
  /** Closet check: "Keep" until this review date. */
  keptUntil?: string
  /** Latest fit check result, e.g. "Loose · Nov 2026". */
  fitNote?: string
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
  condKey?: string
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
  checkSnoozeUntil?: string
  reviewsDone?: string[]
  tonight?: { date: string; text: string }
}

export interface ReviewEntry { date: string; type: 'closet_check' | 'big_review' | 'fit_check'; itemId?: string; action: 'keep' | 'donate' | 'replace' | 'fit' | 'note'; notes?: string }

export interface FitEntry { date: string; weightLb?: number; waistIn?: number }

export interface Profile {
  updated?: string
  heightFt?: number; heightIn?: number; weightLb?: number
  build?: string; torso?: string
  chest?: number; waist?: number; inseam?: number; neck?: number; sleeve?: number
  shirtSize?: string; poloSize?: string; teeSize?: string; pantSize?: string; shortSize?: string; shoeSize?: string
  fitOverall: string; pantBreak: string; rise: string
  colorSeason: string; coreColors: string[]; accentColors: string[]; avoidColors: string[]; blackRule: boolean
  styleWords: string[]; hardNos: string[]
  neverIron: boolean; noDryCleanCasual: boolean
  fabricUse: string[]; fabricReject: string[]
  brands1: string[]; brands2: string[]; brands3: string[]
  lifeMix: Record<'WFH' | 'FAMILY' | 'ACTIVE' | 'EXEC' | 'DATE', number>
  location: { name: string; lat: number; lon: number }
  fitHistory: FitEntry[]
}

export const defaultProfile = (): Profile => ({
  fitOverall: 'Trim', pantBreak: 'Slight', rise: 'Mid',
  colorSeason: 'True Autumn',
  coreColors: ['olive', 'stone', 'cream', 'tobacco', 'camel', 'warm navy', 'espresso', 'dark denim'],
  accentColors: ['rust', 'burgundy', 'forest green'],
  avoidColors: ['stark white', 'cool grey', 'icy blue', 'brights', 'loud patterns'],
  blackRule: true,
  styleWords: ['Silver Fox', 'refined', 'timeless', 'modern'],
  hardNos: ['stuffy', 'preppy', 'trends', 'boxy fits', 'shiny fabrics', 'big logos'],
  neverIron: true, noDryCleanCasual: true,
  fabricUse: ['cotton-elastane 2–5%', 'cotton-performance blends', 'performance wovens', 'high-twist stretch wool'],
  fabricReject: ['linen', 'cotton-silk', '100% cotton dress shirts', 'non-iron needing touch-up', 'dry-clean-only casual', 'heavy wool', 'shiny polyester', 'delicates'],
  brands1: ['Vuori', 'Rhone', 'Mizzen+Main', 'TravisMathew'],
  brands2: ['Peter Millar', 'Marine Layer', 'Buck Mason', 'Faherty'],
  brands3: ['Suitsupply', 'Spier & Mackay', 'Outlier', 'Ministry of Supply', 'Asket', 'Lululemon', 'Uniqlo'],
  lifeMix: { WFH: 35, FAMILY: 35, ACTIVE: 15, EXEC: 10, DATE: 5 },
  location: { name: 'La Jolla, CA', lat: 32.8328, lon: -117.2713 },
  fitHistory: [],
})

export interface AppData { v: 1; items: Item[]; history: HistoryEntry[]; prefs: Prefs; profile?: Profile; reviews?: ReviewEntry[] }

/** Profile with defaults filled in for any missing field. */
export const profileOf = (d: AppData): Profile => ({ ...defaultProfile(), ...(d.profile ?? {}) })

export const emptyPrefs = (): Prefs => ({ swaps: [], blockedCombos: [], snoozes: {}, occasionOverride: {}, closetFilters: {}, closetSort: 'TYPE' })
export const emptyData = (): AppData => ({ v: 1, items: [], history: [], prefs: emptyPrefs() })

const TYPE_BY = Object.fromEntries(TYPES.map((t) => [t.code, t]))
export const slotOf = (t: ItemType): Slot => TYPE_BY[t].slot
export const typeLabel = (t: ItemType): string => TYPE_BY[t].label
export const COLOR_BY = Object.fromEntries(COLORS.map((c) => [c.code, c])) as Record<ColorFamily, (typeof COLORS)[number]>

export const labelOf = (opts: readonly Opt[], code?: string): string => opts.find((x) => x.code === code)?.label ?? ''
