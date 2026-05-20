import { tabUrlKey } from './browserTab'

const STORAGE_KEY = 'oneTabLivepixClickedUrls'
const LEGACY_SESSION_KEY = 'oneTabLivepixClickedUrls'
const RETENTION_MS = 3 * 24 * 60 * 60 * 1000

const clickedAtByKey = new Map<string, number>()
let loadPromise: Promise<void> | undefined

function pruneExpired(now = Date.now()): void {
  for (const [key, clickedAt] of clickedAtByKey) {
    if (now - clickedAt > RETENTION_MS) clickedAtByKey.delete(key)
  }
}

function parseStoredRecord(raw: unknown): void {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return

  for (const [key, clickedAt] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof key !== 'string' || !key) continue
    if (typeof clickedAt !== 'number' || !Number.isFinite(clickedAt)) continue
    clickedAtByKey.set(key, clickedAt)
  }
}

function migrateLegacySessionStorage(): void {
  try {
    const raw = sessionStorage.getItem(LEGACY_SESSION_KEY)
    if (!raw) return

    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return

    const now = Date.now()
    for (const item of parsed) {
      if (typeof item === 'string' && item) clickedAtByKey.set(item, now)
    }

    sessionStorage.removeItem(LEGACY_SESSION_KEY)
  } catch {
    // ignorar migracao legada.
  }
}

async function persistClickedKeys(): Promise<void> {
  pruneExpired()
  const payload: Record<string, number> = {}
  for (const [key, clickedAt] of clickedAtByKey) {
    payload[key] = clickedAt
  }

  try {
    await chrome.storage.local.set({ [STORAGE_KEY]: payload })
  } catch {
    // storage indisponivel.
  }
}

async function loadFromStorage(): Promise<void> {
  migrateLegacySessionStorage()

  try {
    const record = await chrome.storage.local.get(STORAGE_KEY)
    parseStoredRecord(record[STORAGE_KEY])
  } catch {
    // storage indisponivel.
  }

  pruneExpired()
  await persistClickedKeys()
}

export function ensureLivepixClickedLinksLoaded(): Promise<void> {
  if (!loadPromise) loadPromise = loadFromStorage()
  return loadPromise
}

export async function markLivepixLinkClicked(url: string): Promise<void> {
  await ensureLivepixClickedLinksLoaded()

  const key = tabUrlKey(url)
  if (!key) return

  clickedAtByKey.set(key, Date.now())
  pruneExpired()
  await persistClickedKeys()
}

export function isLivepixLinkClicked(url: string): boolean {
  pruneExpired()
  const key = tabUrlKey(url)
  if (!key) return false
  return clickedAtByKey.has(key)
}
