import type { DateRange } from 'react-day-picker'

export const PREFERENCES_STORAGE_KEY = 'oneTabPreferencesV1'
export const PREFERENCES_WRITE_SOURCE_KEY = 'oneTabPreferencesWriteSourceV1'

export type PreferencesWriteSource = 'local' | 'remote'
export const THEME_STORAGE_KEY = 'one-tab-manager-theme'
export const SIMPLE_LAYOUT_STORAGE_KEY = 'one-tab-manager-simple-layout'

export type DateRangePreference = {
  from?: string
  to?: string
}

export type UserPreferences = {
  theme: 'light' | 'dark'
  simpleLayout: boolean
  search: string
  activeTagFilters: string[]
  groupDateRange?: DateRangePreference
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  theme: 'light',
  simpleLayout: false,
  search: '',
  activeTagFilters: [],
}

export function serializeDateRange(
  range: DateRange | undefined,
): DateRangePreference | undefined {
  if (!range?.from && !range?.to) return undefined
  return {
    from: range.from?.toISOString(),
    to: range.to?.toISOString(),
  }
}

export function parseDateRange(
  pref: DateRangePreference | undefined,
): DateRange | undefined {
  if (!pref?.from && !pref?.to) return undefined
  return {
    from: pref.from ? new Date(pref.from) : undefined,
    to: pref.to ? new Date(pref.to) : undefined,
  }
}

export async function migrateLegacyPreferences(): Promise<void> {
  const record = await chrome.storage.local.get(PREFERENCES_STORAGE_KEY)
  if (record[PREFERENCES_STORAGE_KEY]) return

  let theme: 'light' | 'dark' = 'light'
  let simpleLayout = false

  try {
    if (localStorage.getItem(THEME_STORAGE_KEY) === 'dark') theme = 'dark'
    if (localStorage.getItem(SIMPLE_LAYOUT_STORAGE_KEY) === 'true') simpleLayout = true
  } catch {
    /* contexto restrito */
  }

  await saveLocalPreferences({
    ...DEFAULT_PREFERENCES,
    theme,
    simpleLayout,
  })
}

export async function loadLocalPreferences(): Promise<UserPreferences> {
  await migrateLegacyPreferences()
  const record = await chrome.storage.local.get(PREFERENCES_STORAGE_KEY)
  const raw = record[PREFERENCES_STORAGE_KEY]
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_PREFERENCES }

  const p = raw as UserPreferences
  return {
    theme: p.theme === 'dark' ? 'dark' : 'light',
    simpleLayout: p.simpleLayout === true,
    search: typeof p.search === 'string' ? p.search : '',
    activeTagFilters: Array.isArray(p.activeTagFilters)
      ? p.activeTagFilters.filter((t): t is string => typeof t === 'string')
      : [],
    groupDateRange:
      p.groupDateRange && typeof p.groupDateRange === 'object'
        ? {
            from:
              typeof p.groupDateRange.from === 'string'
                ? p.groupDateRange.from
                : undefined,
            to:
              typeof p.groupDateRange.to === 'string' ? p.groupDateRange.to : undefined,
          }
        : undefined,
  }
}

export async function saveLocalPreferencesFromLocal(
  prefs: UserPreferences,
): Promise<void> {
  await chrome.storage.local.set({
    [PREFERENCES_WRITE_SOURCE_KEY]: 'local' satisfies PreferencesWriteSource,
    [PREFERENCES_STORAGE_KEY]: prefs,
  })
  await mirrorPreferencesToLocalStorage(prefs)
}

export async function saveLocalPreferencesFromRemote(
  prefs: UserPreferences,
): Promise<void> {
  await chrome.storage.local.set({
    [PREFERENCES_WRITE_SOURCE_KEY]: 'remote' satisfies PreferencesWriteSource,
    [PREFERENCES_STORAGE_KEY]: prefs,
  })
  await mirrorPreferencesToLocalStorage(prefs)
}

async function mirrorPreferencesToLocalStorage(prefs: UserPreferences): Promise<void> {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, prefs.theme)
    localStorage.setItem(
      SIMPLE_LAYOUT_STORAGE_KEY,
      prefs.simpleLayout ? 'true' : 'false',
    )
  } catch {
    /* armazenamento indisponível */
  }
}

export async function saveLocalPreferences(prefs: UserPreferences): Promise<void> {
  await saveLocalPreferencesFromLocal(prefs)
}
