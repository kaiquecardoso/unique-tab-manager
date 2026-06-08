import {
  detectBrowserLocale,
  isSupportedLocale,
} from './core'
import {
  DEFAULT_LOCALE,
  type SupportedLocale,
} from './types'

const PREFERENCES_STORAGE_KEY = 'oneTabPreferencesV1'

type StoredPreferences = {
  locale?: string
}

export async function loadStoredLocale(): Promise<SupportedLocale> {
  try {
    const record = await chrome.storage.local.get(PREFERENCES_STORAGE_KEY)
    const raw = record[PREFERENCES_STORAGE_KEY] as StoredPreferences | undefined
    if (raw?.locale && isSupportedLocale(raw.locale)) {
      return raw.locale
    }
  } catch {
    /* storage indisponível */
  }

  return detectBrowserLocale()
}

export function resolveLocale(value: unknown): SupportedLocale {
  if (isSupportedLocale(value)) return value
  return DEFAULT_LOCALE
}
