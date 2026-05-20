import type { TabGroup } from '../types/tabs'
import { getApiUrl, getStoredToken } from './api'
import { getClientId } from './clientId'
import { createCloudSyncQueue } from './cloudSyncQueue'
import {
  loadGroups,
  normalizeAllGroups,
  saveGroupsFromLocal,
  saveGroupsFromRemote,
} from './groupsStorage'
import {
  clearLocalGroupsEditPending,
  hasLocalGroupsEditPending,
  markLocalGroupsEdit,
  stashDeferredRemoteGroups,
  takeDeferredRemoteGroups,
} from './groupsLocalEdit'
import { clearGroupsSyncFailed, markGroupsSyncFailed } from './syncOutbox'
import { nextLocalUpdatedAtIso } from './syncMetaTime'

export const SYNC_META_STORAGE_KEY = 'oneTabGroupsSyncV1'

const GROUPS_PUSH_DEBOUNCE_MS = 800

const groupsPushQueue = createCloudSyncQueue()

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

function groupsSnapshotEqual(a: TabGroup[], b: TabGroup[]): boolean {
  return (
    JSON.stringify(normalizeAllGroups(a)) === JSON.stringify(normalizeAllGroups(b))
  )
}

function countTabs(groups: TabGroup[]): number {
  return groups.reduce((total, group) => total + group.tabs.length, 0)
}

async function putCloudGroupsOnce(
  groups: TabGroup[],
  options?: { keepalive?: boolean },
): Promise<GroupsCloudPayload> {
  const headers = await authHeaders()
  if (!headers) {
    throw new Error('Não autenticado')
  }

  const response = await fetch(`${getApiUrl()}/groups`, {
    method: 'PUT',
    headers,
    keepalive: options?.keepalive === true,
    body: JSON.stringify({ groups }),
  })

  if (!response.ok) {
    throw new Error('Não foi possível enviar os dados para a nuvem.')
  }

  const data = (await response.json()) as GroupsCloudPayload
  const responseGroups = normalizeAllGroups(data.groups)

  await setSyncMeta({
    localUpdatedAt: data.updatedAt,
    serverUpdatedAt: data.updatedAt,
  })

  return {
    groups: responseGroups,
    updatedAt: data.updatedAt,
  }
}

export async function pushCloudGroups(
  groups: TabGroup[],
  options?: { keepalive?: boolean },
): Promise<GroupsCloudPayload> {
  const normalized = normalizeAllGroups(groups)
  let result = await putCloudGroupsOnce(normalized, options)

  if (!groupsSnapshotEqual(normalized, result.groups)) {
    await touchLocalSyncMeta()
    result = await putCloudGroupsOnce(normalized, options)
  }

  await saveGroupsFromRemote(result.groups)
  await clearLocalGroupsEditPending()
  await clearGroupsSyncFailed()
  await applyDeferredRemoteIfAny()
  return result
}

async function applyDeferredRemoteIfAny(): Promise<void> {
  const deferred = await takeDeferredRemoteGroups()
  if (!deferred) return
  if (await hasLocalGroupsEditPending()) {
    await stashDeferredRemoteGroups(deferred)
    return
  }
  await saveGroupsFromRemote(normalizeAllGroups(deferred.groups))
  await setSyncMeta({
    localUpdatedAt: deferred.updatedAt,
    serverUpdatedAt: deferred.updatedAt,
  })
}

function queueGroupsPush(keepalive = false): () => Promise<void> {
  return async () => {
    const token = await getStoredToken()
    if (!token) return

    const toPush = await loadGroups()
    await pushCloudGroups(toPush, { keepalive })
  }
}

/** Envia grupos à nuvem imediatamente (sempre lê o storage — snapshot mais recente). */
export async function flushCloudPush(): Promise<void> {
  try {
    await groupsPushQueue.runImmediate(queueGroupsPush())
  } catch (error) {
    console.error('[one-tab-manager] Falha ao enviar grupos para a nuvem:', error)
    await markGroupsSyncFailed()
    throw error
  }
}

/** Agenda PUT com debounce; sempre envia o snapshot mais recente do storage local. */
export function scheduleCloudPush(): void {
  groupsPushQueue.scheduleDebounced(GROUPS_PUSH_DEBOUNCE_MS, async () => {
    try {
      await queueGroupsPush()()
    } catch (error) {
      console.error('[one-tab-manager] Falha ao enviar grupos para a nuvem:', error)
      await markGroupsSyncFailed()
      throw error
    }
  })
}

/** Dispara PUT pendente antes de fechar/recarregar a página. */
export function flushPendingCloudGroupsPush(options?: { keepalive?: boolean }): void {
  if (!groupsPushQueue.hasPending()) return
  void groupsPushQueue
    .runImmediate(queueGroupsPush(options?.keepalive === true))
    .catch((error) => {
      console.error('[one-tab-manager] Falha ao enviar grupos pendentes:', error)
    })
}

export function hasPendingGroupsCloudPush(): boolean {
  return groupsPushQueue.hasPending()
}

/** Mescla nuvem ↔ local após login ou sync manual. Retorna grupos finais. */
export async function syncGroupsWithCloud(): Promise<TabGroup[]> {
  const token = await getStoredToken()
  if (!token) {
    return loadGroups()
  }

  await groupsPushQueue.flush()

  const local = await loadGroups()
  const meta = await getSyncMeta()
  const remote = await fetchCloudGroups()

  const localTime = Date.parse(meta?.localUpdatedAt ?? '1970-01-01T00:00:00.000Z')
  const remoteTime = Date.parse(remote.updatedAt)

  if (groupsSnapshotEqual(local, remote.groups)) {
    await clearLocalGroupsEditPending()
    await setSyncMeta({
      localUpdatedAt: remote.updatedAt,
      serverUpdatedAt: remote.updatedAt,
    })
    await applyDeferredRemoteIfAny()
    return local
  }

  const pending = await hasLocalGroupsEditPending()
  const remoteClearlyAhead =
    remoteTime > localTime && countTabs(remote.groups) > countTabs(local)
  const shouldPushLocal =
    !remoteClearlyAhead &&
    (countTabs(local) > countTabs(remote.groups) ||
      localTime > remoteTime ||
      (pending && localTime >= remoteTime))

  if (shouldPushLocal) {
    const pushed = await pushCloudGroups(local)
    return pushed.groups
  }

  let result: TabGroup[]

  if (remote.groups.length === 0 && local.length > 0) {
    const pushed = await pushCloudGroups(local)
    result = pushed.groups
  } else if (remote.groups.length > 0 && local.length === 0) {
    result = remote.groups
    await saveGroupsFromRemote(result)
    await clearLocalGroupsEditPending()
    await setSyncMeta({
      localUpdatedAt: remote.updatedAt,
      serverUpdatedAt: remote.updatedAt,
    })
  } else if (remoteTime >= localTime) {
    result = remote.groups
    await saveGroupsFromRemote(result)
    await clearLocalGroupsEditPending()
    await setSyncMeta({
      localUpdatedAt: remote.updatedAt,
      serverUpdatedAt: remote.updatedAt,
    })
  } else {
    const pushed = await pushCloudGroups(local)
    result = pushed.groups
  }

  await applyDeferredRemoteIfAny()
  return result
}

export async function touchLocalSyncMeta(): Promise<void> {
  const meta = await getSyncMeta()
  await setSyncMeta({
    localUpdatedAt: nextLocalUpdatedAtIso(meta?.serverUpdatedAt),
    serverUpdatedAt: meta?.serverUpdatedAt ?? null,
  })
}

/** Salva grupos no storage local e envia à nuvem (push imediato no service worker). */
export async function saveGroupsAndSyncCloud(groups: TabGroup[]): Promise<void> {
  const token = await getStoredToken()
  await markLocalGroupsEdit()
  await touchLocalSyncMeta()
  await saveGroupsFromLocal(groups)
  if (!token) return
  try {
    await flushCloudPush()
  } catch (error) {
    console.error('[one-tab-manager] Falha ao sincronizar grupos com a nuvem:', error)
    await markGroupsSyncFailed()
    throw error
  }
}

export { markRemoteGroupsApply } from './groupsLocalEdit'
