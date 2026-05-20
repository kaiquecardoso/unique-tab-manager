import { getStoredToken } from './api'
import { isCloudEnabled } from './cloudEnabled'

export const SYNC_OUTBOX_KEY = 'oneTabSyncOutboxV1'

type SyncOutboxState = {
  groupsFailedAt: string | null
  preferencesFailedAt: string | null
}

async function getOutbox(): Promise<SyncOutboxState> {
  const record = await chrome.storage.local.get(SYNC_OUTBOX_KEY)
  const raw = record[SYNC_OUTBOX_KEY]
  if (!raw || typeof raw !== 'object') {
    return { groupsFailedAt: null, preferencesFailedAt: null }
  }
  const state = raw as SyncOutboxState
  return {
    groupsFailedAt:
      typeof state.groupsFailedAt === 'string' ? state.groupsFailedAt : null,
    preferencesFailedAt:
      typeof state.preferencesFailedAt === 'string' ? state.preferencesFailedAt : null,
  }
}

export async function markGroupsSyncFailed(): Promise<void> {
  const outbox = await getOutbox()
  await chrome.storage.local.set({
    [SYNC_OUTBOX_KEY]: {
      ...outbox,
      groupsFailedAt: new Date().toISOString(),
    },
  })
}

export async function markPreferencesSyncFailed(): Promise<void> {
  const outbox = await getOutbox()
  await chrome.storage.local.set({
    [SYNC_OUTBOX_KEY]: {
      ...outbox,
      preferencesFailedAt: new Date().toISOString(),
    },
  })
}

export async function clearGroupsSyncFailed(): Promise<void> {
  const outbox = await getOutbox()
  await chrome.storage.local.set({
    [SYNC_OUTBOX_KEY]: { ...outbox, groupsFailedAt: null },
  })
}

export async function clearPreferencesSyncFailed(): Promise<void> {
  const outbox = await getOutbox()
  await chrome.storage.local.set({
    [SYNC_OUTBOX_KEY]: { ...outbox, preferencesFailedAt: null },
  })
}

export async function hasSyncOutboxWork(): Promise<boolean> {
  const token = await getStoredToken()
  if (!token) return false
  const outbox = await getOutbox()
  return Boolean(outbox.groupsFailedAt || outbox.preferencesFailedAt)
}

/** Reenvia alterações locais pendentes (offline-first). */
export async function flushSyncOutbox(): Promise<void> {
  if (!isCloudEnabled) return

  const token = await getStoredToken()
  if (!token) return

  const outbox = await getOutbox()
  const errors: unknown[] = []

  if (outbox.groupsFailedAt) {
    try {
      const { flushCloudPush } = await import('./groupsSync')
      await flushCloudPush()
      await clearGroupsSyncFailed()
    } catch (error) {
      errors.push(error)
    }
  }

  if (outbox.preferencesFailedAt) {
    try {
      const { flushPreferencesPush } = await import('./preferencesSync')
      await flushPreferencesPush()
      await clearPreferencesSyncFailed()
    } catch (error) {
      errors.push(error)
    }
  }

  if (errors.length > 0) {
    throw errors[0]
  }
}

export function registerSyncOutboxListeners(): void {
  if (!isCloudEnabled) return

  chrome.alarms.create('one-tab-sync-outbox', { periodInMinutes: 1 })

  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name !== 'one-tab-sync-outbox') return
    void flushSyncOutbox().catch(() => undefined)
  })

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes[SYNC_OUTBOX_KEY]) return
    void flushSyncOutbox().catch(() => undefined)
  })

  self.addEventListener('online', () => {
    void flushSyncOutbox().catch(() => undefined)
  })
}
