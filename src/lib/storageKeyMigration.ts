import {
  EXCLUDED_SITES_STORAGE_KEY,
  GROUPS_STORAGE_KEY,
  GROUPS_WRITE_SOURCE_KEY,
  LIVEPIX_CLICKED_URLS_KEY,
  PREFERENCES_STORAGE_KEY,
  PREFERENCES_WRITE_SOURCE_KEY,
  SIMPLE_LAYOUT_STORAGE_KEY,
  THEME_STORAGE_KEY,
  TRASH_STORAGE_KEY,
} from './storageKeys'

const LEGACY_CHROME_STORAGE_KEYS: Record<string, string> = {
  oneTabPreferencesV1: PREFERENCES_STORAGE_KEY,
  oneTabPreferencesWriteSourceV1: PREFERENCES_WRITE_SOURCE_KEY,
  oneTabGroupsV1: GROUPS_STORAGE_KEY,
  oneTabGroupsWriteSourceV1: GROUPS_WRITE_SOURCE_KEY,
  oneTabTrashV1: TRASH_STORAGE_KEY,
  oneTabExcludedSitesV1: EXCLUDED_SITES_STORAGE_KEY,
  oneTabLivepixClickedUrls: LIVEPIX_CLICKED_URLS_KEY,
}

const LEGACY_THEME_KEY = 'one-tab-manager-theme'
const LEGACY_SIMPLE_LAYOUT_KEY = 'one-tab-manager-simple-layout'

export const LEGACY_LIVEPIX_SESSION_KEY = 'oneTabLivepixClickedUrls'

let migrationPromise: Promise<void> | undefined

function migrateLegacyBrowserStorage(): void {
  try {
    for (const [legacyKey, nextKey] of [
      [LEGACY_THEME_KEY, THEME_STORAGE_KEY],
      [LEGACY_SIMPLE_LAYOUT_KEY, SIMPLE_LAYOUT_STORAGE_KEY],
    ] as const) {
      for (const storage of [localStorage, sessionStorage]) {
        const value = storage.getItem(legacyKey)
        if (value == null) continue
        if (!storage.getItem(nextKey)) storage.setItem(nextKey, value)
        storage.removeItem(legacyKey)
      }
    }
  } catch {
    /* armazenamento indisponível */
  }
}

async function migrateLegacyChromeStorageKeys(): Promise<void> {
  const legacyKeys = Object.keys(LEGACY_CHROME_STORAGE_KEYS)
  const nextKeys = Object.values(LEGACY_CHROME_STORAGE_KEYS)
  const record = await chrome.storage.local.get([...legacyKeys, ...nextKeys])

  const updates: Record<string, unknown> = {}
  const toRemove: string[] = []

  for (const [legacyKey, nextKey] of Object.entries(LEGACY_CHROME_STORAGE_KEYS)) {
    if (record[legacyKey] === undefined) continue
    if (record[nextKey] === undefined) updates[nextKey] = record[legacyKey]
    toRemove.push(legacyKey)
  }

  if (Object.keys(updates).length > 0) {
    await chrome.storage.local.set(updates)
  }
  if (toRemove.length > 0) {
    await chrome.storage.local.remove(toRemove)
  }
}

export function migrateLegacyStorageKeys(): Promise<void> {
  if (!migrationPromise) {
    migrationPromise = (async () => {
      migrateLegacyBrowserStorage()
      await migrateLegacyChromeStorageKeys()
    })()
  }
  return migrationPromise
}
