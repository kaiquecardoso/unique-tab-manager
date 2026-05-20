import type { TabGroup } from '../types/tabs'
import { getApiUrl, getStoredToken } from './api'
import { getClientId } from './clientId'
import { createCloudSyncQueue } from './cloudSyncQueue'
import { loadGroups, normalizeAllGroups, saveGroups } from './groupsStorage'
import {
  clearLocalGroupsEditPending,
  hasLocalGroupsEditPending,
  markLocalGroupsEdit,
  markLocalGroupsStorageWrite,
} from './groupsLocalEdit'
import { nextLocalUpdatedAtIso } from './syncMetaTime'

export const SYNC_META_STORAGE_KEY = 'oneTabGroupsSyncV1'

const GROUPS_PUSH_DEBOUNCE_MS = 400

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

  if (groupsSnapshotEqual(groups, responseGroups)) {
    await setSyncMeta({
      localUpdatedAt: data.updatedAt,
      serverUpdatedAt: data.updatedAt,
    })
  }

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

  if (!groupsSnapshotEqual(normalized, result.groups)) {
    throw new Error(
      'O servidor devolveu uma versão antiga dos grupos. Use Sincronizar ou tente de novo.',
    )
  }

  await saveGroups(result.groups)
  clearLocalGroupsEditPending()
  return result
}

function queueGroupsPush(groups?: TabGroup[], keepalive = false): () => Promise<void> {
  return async () => {
    const token = await getStoredToken()
    if (!token) return

    const toPush = groups ?? (await loadGroups())
    await pushCloudGroups(toPush, { keepalive })
  }
}

/** Envia grupos à nuvem imediatamente (service worker e flush ao sair da página). */
export async function flushCloudPush(groups?: TabGroup[]): Promise<void> {
  try {
    await groupsPushQueue.runImmediate(queueGroupsPush(groups))
  } catch (error) {
    console.error('[one-tab-manager] Falha ao enviar grupos para a nuvem:', error)
    throw error
  }
}

/** Agenda PUT com debounce; sempre envia o snapshot mais recente. */
export function scheduleCloudPush(groups?: TabGroup[]): void {
  groupsPushQueue.scheduleDebounced(GROUPS_PUSH_DEBOUNCE_MS, async () => {
    try {
      await queueGroupsPush(groups)()
    } catch (error) {
      console.error('[one-tab-manager] Falha ao enviar grupos para a nuvem:', error)
      throw error
    }
  })
}

/** Dispara PUT pendente antes de fechar/recarregar a página. */
export function flushPendingCloudGroupsPush(options?: { keepalive?: boolean }): void {
  if (!groupsPushQueue.hasPending()) return
  void groupsPushQueue
    .runImmediate(queueGroupsPush(undefined, options?.keepalive === true))
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

  if (
    hasLocalGroupsEditPending() ||
    (!groupsSnapshotEqual(local, remote.groups) &&
      (countTabs(local) > countTabs(remote.groups) || localTime > remoteTime))
  ) {
    const pushed = await pushCloudGroups(local)
    return pushed.groups
  }

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
  const meta = await getSyncMeta()
  await setSyncMeta({
    localUpdatedAt: nextLocalUpdatedAtIso(meta?.serverUpdatedAt),
    serverUpdatedAt: meta?.serverUpdatedAt ?? null,
  })
}

/** Salva grupos no storage local e envia à nuvem (push imediato no service worker). */
export async function saveGroupsAndSyncCloud(groups: TabGroup[]): Promise<void> {
  const token = await getStoredToken()
  markLocalGroupsEdit()
  await touchLocalSyncMeta()
  markLocalGroupsStorageWrite()
  await saveGroups(groups)
  if (!token) return
  try {
    await flushCloudPush(groups)
  } catch (error) {
    console.error('[one-tab-manager] Falha ao sincronizar grupos com a nuvem:', error)
    throw error
  }
}

export { markRemoteGroupsApply } from './groupsLocalEdit.js'
