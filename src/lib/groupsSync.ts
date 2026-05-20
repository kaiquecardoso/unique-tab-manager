import type { TabGroup } from '../types/tabs'
import { getApiUrl, getStoredToken } from './api'
import { getClientId } from './clientId'
import { loadGroups, normalizeAllGroups, saveGroups } from './groupsStorage'

export const SYNC_META_STORAGE_KEY = 'oneTabGroupsSyncV1'

export type GroupsCloudPayload = {
  groups: TabGroup[]
  updatedAt: string
}

export type SyncMeta = {
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

export async function getSyncMeta(): Promise<SyncMeta | null> {
  const record = await chrome.storage.local.get(SYNC_META_STORAGE_KEY)
  const raw = record[SYNC_META_STORAGE_KEY]
  if (!raw || typeof raw !== 'object') return null
  const meta = raw as SyncMeta
  if (typeof meta.localUpdatedAt !== 'string') return null
  return meta
}

async function setSyncMeta(meta: SyncMeta): Promise<void> {
  await chrome.storage.local.set({ [SYNC_META_STORAGE_KEY]: meta })
}

export async function fetchCloudGroups(): Promise<GroupsCloudPayload> {
  const headers = await authHeaders()
  if (!headers) {
    throw new Error('Não autenticado')
  }

  const response = await fetch(`${getApiUrl()}/groups`, { headers })

  if (!response.ok) {
    throw new Error('Não foi possível carregar os dados da nuvem.')
  }

  const data = (await response.json()) as GroupsCloudPayload
  return {
    groups: normalizeAllGroups(data.groups),
    updatedAt: data.updatedAt,
  }
}

export async function pushCloudGroups(groups: TabGroup[]): Promise<GroupsCloudPayload> {
  const headers = await authHeaders()
  if (!headers) {
    throw new Error('Não autenticado')
  }

  const meta = await getSyncMeta()
  const response = await fetch(`${getApiUrl()}/groups`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      groups,
      updatedAt: meta?.localUpdatedAt,
    }),
  })

  if (!response.ok) {
    throw new Error('Não foi possível enviar os dados para a nuvem.')
  }

  const data = (await response.json()) as GroupsCloudPayload
  const now = data.updatedAt

  await setSyncMeta({
    localUpdatedAt: now,
    serverUpdatedAt: now,
  })

  return {
    groups: normalizeAllGroups(data.groups),
    updatedAt: now,
  }
}

let pushTimer: ReturnType<typeof setTimeout> | null = null

/** Envia grupos à nuvem imediatamente (obrigatório no service worker — timers podem não disparar). */
export async function flushCloudPush(groups?: TabGroup[]): Promise<void> {
  if (pushTimer) {
    clearTimeout(pushTimer)
    pushTimer = null
  }

  const token = await getStoredToken()
  if (!token) return

  const toPush = groups ?? (await loadGroups())
  await pushCloudGroups(toPush)
}

export function scheduleCloudPush(groups?: TabGroup[]): void {
  if (pushTimer) {
    clearTimeout(pushTimer)
  }

  pushTimer = setTimeout(() => {
    pushTimer = null
    void flushCloudPush(groups).catch((error) => {
      console.error('[one-tab-manager] Falha ao enviar grupos para a nuvem:', error)
    })
  }, 800)
}

/** Mescla nuvem ↔ local após login ou sync manual. Retorna grupos finais. */
export async function syncGroupsWithCloud(): Promise<TabGroup[]> {
  const token = await getStoredToken()
  if (!token) {
    return loadGroups()
  }

  const local = await loadGroups()
  const meta = await getSyncMeta()
  const remote = await fetchCloudGroups()

  const localTime = Date.parse(meta?.localUpdatedAt ?? '1970-01-01T00:00:00.000Z')
  const remoteTime = Date.parse(remote.updatedAt)

  let result: TabGroup[]

  if (remote.groups.length === 0 && local.length > 0) {
    const pushed = await pushCloudGroups(local)
    result = pushed.groups
  } else if (remote.groups.length > 0 && local.length === 0) {
    result = remote.groups
    await saveGroups(result)
    await setSyncMeta({
      localUpdatedAt: remote.updatedAt,
      serverUpdatedAt: remote.updatedAt,
    })
  } else if (remoteTime >= localTime) {
    result = remote.groups
    await saveGroups(result)
    await setSyncMeta({
      localUpdatedAt: remote.updatedAt,
      serverUpdatedAt: remote.updatedAt,
    })
  } else {
    const pushed = await pushCloudGroups(local)
    result = pushed.groups
  }

  return result
}

export async function touchLocalSyncMeta(): Promise<void> {
  const now = new Date().toISOString()
  const meta = await getSyncMeta()
  await setSyncMeta({
    localUpdatedAt: now,
    serverUpdatedAt: meta?.serverUpdatedAt ?? null,
  })
}

/** Salva grupos no storage local e envia à nuvem (push imediato no service worker). */
export async function saveGroupsAndSyncCloud(groups: TabGroup[]): Promise<void> {
  await saveGroups(groups)
  const token = await getStoredToken()
  if (!token) return
  await touchLocalSyncMeta()
  try {
    await flushCloudPush(groups)
  } catch (error) {
    console.error('[one-tab-manager] Falha ao sincronizar grupos com a nuvem:', error)
  }
}
