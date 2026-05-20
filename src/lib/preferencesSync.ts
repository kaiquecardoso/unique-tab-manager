import { getApiUrl, getStoredToken } from './api'
import { getClientId } from './clientId'
import { createCloudSyncQueue } from './cloudSyncQueue'
import {
  clearLocalPreferencesEditPending,
  hasLocalPreferencesEditPending,
  markRemotePreferencesApply,
} from './preferencesLocalEdit'
import {
  clearPreferencesSyncFailed,
  markPreferencesSyncFailed,
} from './syncOutbox'
import { nextLocalUpdatedAtIso } from './syncMetaTime'
import {
  DEFAULT_PREFERENCES,
  loadLocalPreferences,
  saveLocalPreferencesFromRemote,
  type UserPreferences,
} from './preferencesStorage'

export const PREFERENCES_SYNC_META_KEY = 'oneTabPreferencesSyncV1'

const PREFERENCES_PUSH_DEBOUNCE_MS = 400

const preferencesPushQueue = createCloudSyncQueue()

export type PreferencesCloudPayload = {
  preferences: UserPreferences
  updatedAt: string
}

type PreferencesSyncMeta = {
  localUpdatedAt: string
  serverUpdatedAt: string | null
}

async function authHeaders(): Promise<HeadersInit | null> {
  const token = await getStoredToken()
  if (!token) return null
  const clientId = await getClientId()
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'X-Client-Id': clientId,
  }
}

async function getSyncMeta(): Promise<PreferencesSyncMeta | null> {
  const record = await chrome.storage.local.get(PREFERENCES_SYNC_META_KEY)
  const raw = record[PREFERENCES_SYNC_META_KEY]
  if (!raw || typeof raw !== 'object') return null
  const meta = raw as PreferencesSyncMeta
  if (typeof meta.localUpdatedAt !== 'string') return null
  return meta
}

async function setSyncMeta(meta: PreferencesSyncMeta): Promise<void> {
  await chrome.storage.local.set({ [PREFERENCES_SYNC_META_KEY]: meta })
}

function preferencesEqual(a: UserPreferences, b: UserPreferences): boolean {
  const normalize = (p: UserPreferences) =>
    JSON.stringify({
      theme: p.theme,
      simpleLayout: p.simpleLayout,
      search: p.search,
      activeTagFilters: [...p.activeTagFilters].sort(),
      groupDateRange: p.groupDateRange ?? null,
    })

  return normalize(a) === normalize(b)
}

export async function fetchCloudPreferences(): Promise<PreferencesCloudPayload> {
  const headers = await authHeaders()
  if (!headers) throw new Error('Não autenticado')

  const response = await fetch(`${getApiUrl()}/preferences`, { headers })
  if (!response.ok) {
    throw new Error('Não foi possível carregar preferências da nuvem.')
  }

  return (await response.json()) as PreferencesCloudPayload
}

export async function pushCloudPreferences(
  preferences: UserPreferences,
  options?: { keepalive?: boolean },
): Promise<PreferencesCloudPayload> {
  const headers = await authHeaders()
  if (!headers) throw new Error('Não autenticado')

  const response = await fetch(`${getApiUrl()}/preferences`, {
    method: 'PUT',
    headers,
    keepalive: options?.keepalive === true,
    body: JSON.stringify({ preferences }),
  })

  if (!response.ok) {
    throw new Error('Não foi possível enviar preferências para a nuvem.')
  }

  const data = (await response.json()) as PreferencesCloudPayload
  await setSyncMeta({
    localUpdatedAt: data.updatedAt,
    serverUpdatedAt: data.updatedAt,
  })
  await clearLocalPreferencesEditPending()
  return data
}

function queuePreferencesPush(keepalive = false): () => Promise<void> {
  return async () => {
    const token = await getStoredToken()
    if (!token) return

    const preferences = await loadLocalPreferences()
    const meta = await getSyncMeta()
    await setSyncMeta({
      localUpdatedAt: nextLocalUpdatedAtIso(meta?.serverUpdatedAt),
      serverUpdatedAt: meta?.serverUpdatedAt ?? null,
    })
    try {
      await pushCloudPreferences(preferences, { keepalive })
      await clearPreferencesSyncFailed()
    } catch (error) {
      await markPreferencesSyncFailed()
      throw error
    }
  }
}

export function schedulePreferencesPush(_preferences: UserPreferences): void {
  preferencesPushQueue.scheduleDebounced(
    PREFERENCES_PUSH_DEBOUNCE_MS,
    queuePreferencesPush(),
  )
}

export async function flushPreferencesPush(): Promise<void> {
  await preferencesPushQueue.runImmediate(queuePreferencesPush())
}

export function flushPendingPreferencesPush(options?: { keepalive?: boolean }): void {
  if (!preferencesPushQueue.hasPending()) return
  void preferencesPushQueue
    .runImmediate(queuePreferencesPush(options?.keepalive === true))
    .catch((error) => {
      console.error('[one-tab-manager] Falha ao enviar preferências pendentes:', error)
    })
}

export async function syncPreferencesWithCloud(): Promise<UserPreferences> {
  const token = await getStoredToken()
  if (!token) return loadLocalPreferences()

  await preferencesPushQueue.flush()

  const local = await loadLocalPreferences()
  const meta = await getSyncMeta()
  const remote = await fetchCloudPreferences()

  const localTime = Date.parse(meta?.localUpdatedAt ?? '1970-01-01T00:00:00.000Z')
  const remoteTime = Date.parse(remote.updatedAt)

  const remoteEmpty =
    remote.preferences.theme === DEFAULT_PREFERENCES.theme &&
    !remote.preferences.simpleLayout &&
    !remote.preferences.search &&
    remote.preferences.activeTagFilters.length === 0 &&
    !remote.preferences.groupDateRange

  if (preferencesEqual(local, remote.preferences)) {
    await saveLocalPreferencesFromRemote(remote.preferences)
    await clearLocalPreferencesEditPending()
    await setSyncMeta({
      localUpdatedAt: remote.updatedAt,
      serverUpdatedAt: remote.updatedAt,
    })
    return remote.preferences
  }

  let result: UserPreferences

  if (remoteEmpty && (local.search || local.activeTagFilters.length || local.groupDateRange)) {
    result = local
    await pushCloudPreferences(local)
  } else if (
    (await hasLocalPreferencesEditPending()) ||
    localTime > remoteTime
  ) {
    result = local
    await pushCloudPreferences(local)
  } else {
    result = remote.preferences
    await saveLocalPreferencesFromRemote(result)
    await clearLocalPreferencesEditPending()
    await setSyncMeta({
      localUpdatedAt: remote.updatedAt,
      serverUpdatedAt: remote.updatedAt,
    })
  }

  return result
}

export async function applyCloudPreferences(
  payload: PreferencesCloudPayload,
): Promise<UserPreferences> {
  if (await hasLocalPreferencesEditPending()) {
    return loadLocalPreferences()
  }

  markRemotePreferencesApply()
  const prefs = payload.preferences
  await saveLocalPreferencesFromRemote(prefs)
  await setSyncMeta({
    localUpdatedAt: payload.updatedAt,
    serverUpdatedAt: payload.updatedAt,
  })
  return payload.preferences
}
