import type { DateRange } from 'react-day-picker'
import {
  DEFAULT_LOCALE,
  detectBrowserLocale,
  isSupportedLocale,
  type SupportedLocale,
} from '../i18n'
import { migrateLegacyStorageKeys } from './storageKeyMigration'
import {
  PREFERENCES_STORAGE_KEY,
  PREFERENCES_WRITE_SOURCE_KEY,
  SIMPLE_LAYOUT_STORAGE_KEY,
  THEME_STORAGE_KEY,
} from './storageKeys'

export {
  PREFERENCES_STORAGE_KEY,
  PREFERENCES_WRITE_SOURCE_KEY,
  THEME_STORAGE_KEY,
  SIMPLE_LAYOUT_STORAGE_KEY,
} from './storageKeys'

export type PreferencesWriteSource = 'local' | 'remote'
export const THEME_BOOT_ATTR = 'data-theme-boot'

const THEME_MAIN_BG: Record<'light' | 'dark', string> = {
  light: '#f5f5f7',
  dark: '#111111',
}

export type DateRangePreference = {
  from?: string
  to?: string
}

export type UserPreferences = {
  theme: 'light' | 'dark'
  simpleLayout: boolean
  locale: SupportedLocale
  search: string
  activeTagFilters: string[]
  groupDateRange?: DateRangePreference
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  theme: 'light',
  simpleLayout: false,
  locale: detectBrowserLocale(),
  search: '',
  activeTagFilters: [],
}

/** Lê o tema já aplicado no HTML (script inline) ou espelhado no localStorage. */
export function readInitialThemeFromDocument(): 'light' | 'dark' {
  const attr = document.documentElement.getAttribute('data-theme')
  if (attr === 'dark') return 'dark'
  if (attr === 'light') return 'light'
  try {
    const session = sessionStorage.getItem(THEME_STORAGE_KEY)
    if (session === 'dark' || session === 'light') return session
    return localStorage.getItem(THEME_STORAGE_KEY) === 'dark' ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

export function applyThemeToDocument(theme: 'light' | 'dark'): void {
  const html = document.documentElement
  html.setAttribute('data-theme', theme)
  html.style.colorScheme = theme
  if (!html.hasAttribute(THEME_BOOT_ATTR)) return
  const bg = THEME_MAIN_BG[theme]
  html.style.background = bg
  if (document.body) document.body.style.background = bg
}

/** Habilita transições de tema após o primeiro paint com cores corretas. */
export function finishThemeBoot(): void {
  const html = document.documentElement
  html.removeAttribute(THEME_BOOT_ATTR)
  html.style.background = ''
  html.style.colorScheme = ''
  if (document.body) document.body.style.background = ''
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
  await migrateLegacyStorageKeys()
  await migrateLegacyPreferences()
  const record = await chrome.storage.local.get(PREFERENCES_STORAGE_KEY)
  const raw = record[PREFERENCES_STORAGE_KEY]
  if (!raw || typeof raw !== 'object') {
    const defaults = { ...DEFAULT_PREFERENCES }
    await mirrorPreferencesToLocalStorage(defaults)
    return defaults
  }

  const p = raw as UserPreferences
  const prefs: UserPreferences = {
    theme: p.theme === 'dark' ? 'dark' : 'light',
    simpleLayout: p.simpleLayout === true,
    locale: isSupportedLocale(p.locale) ? p.locale : DEFAULT_LOCALE,
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
  await mirrorPreferencesToLocalStorage(prefs)
  return prefs
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
    sessionStorage.setItem(THEME_STORAGE_KEY, prefs.theme)
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
