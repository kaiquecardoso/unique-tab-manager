/** Estado de edição local persistido — compartilhado entre SW e página de opções. */

import type { TabGroup } from '../types/tabs'

export type DeferredGroupsCloudPayload = {
  groups: TabGroup[]
  updatedAt: string
}

export const GROUPS_LOCAL_SYNC_KEY = 'oneTabGroupsLocalSyncV1'
export const GROUPS_DEFERRED_REMOTE_KEY = 'oneTabGroupsDeferredRemoteV1'

export type GroupsLocalSyncState = {
  pendingCloudPush: boolean
  localRevision: number
}

const DEFAULT_LOCAL_SYNC_STATE: GroupsLocalSyncState = {
  pendingCloudPush: false,
  localRevision: 0,
}

export async function getGroupsLocalSyncState(): Promise<GroupsLocalSyncState> {
  const record = await chrome.storage.local.get(GROUPS_LOCAL_SYNC_KEY)
  const raw = record[GROUPS_LOCAL_SYNC_KEY]
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_LOCAL_SYNC_STATE }
  const state = raw as GroupsLocalSyncState
  return {
    pendingCloudPush: state.pendingCloudPush === true,
    localRevision:
      typeof state.localRevision === 'number' && state.localRevision >= 0
        ? state.localRevision
        : 0,
  }
}

async function setGroupsLocalSyncState(state: GroupsLocalSyncState): Promise<void> {
  await chrome.storage.local.set({ [GROUPS_LOCAL_SYNC_KEY]: state })
}

export async function markLocalGroupsEdit(): Promise<void> {
  const state = await getGroupsLocalSyncState()
  await setGroupsLocalSyncState({
    pendingCloudPush: true,
    localRevision: state.localRevision + 1,
  })
}

export async function hasLocalGroupsEditPending(): Promise<boolean> {
  const state = await getGroupsLocalSyncState()
  return state.pendingCloudPush
}

export async function clearLocalGroupsEditPending(): Promise<void> {
  const state = await getGroupsLocalSyncState()
  await setGroupsLocalSyncState({
    pendingCloudPush: false,
    localRevision: state.localRevision,
  })
}

export async function stashDeferredRemoteGroups(
  payload: DeferredGroupsCloudPayload,
): Promise<void> {
  await chrome.storage.local.set({
    [GROUPS_DEFERRED_REMOTE_KEY]: {
      payload,
      receivedAt: new Date().toISOString(),
    },
  })
}

export async function takeDeferredRemoteGroups(): Promise<DeferredGroupsCloudPayload | null> {
  const record = await chrome.storage.local.get(GROUPS_DEFERRED_REMOTE_KEY)
  const raw = record[GROUPS_DEFERRED_REMOTE_KEY]
  await chrome.storage.local.remove(GROUPS_DEFERRED_REMOTE_KEY)
  if (!raw || typeof raw !== 'object') return null
  const entry = raw as { payload?: DeferredGroupsCloudPayload }
  if (!entry.payload || !Array.isArray(entry.payload.groups)) return null
  return entry.payload
}

/** Legado em memória — UI evita reagir ao próprio PUT bem-sucedido. */
let skipRemoteGroupsApply = false

export function markRemoteGroupsApply(): void {
  skipRemoteGroupsApply = true
}

export function consumeSkipRemoteGroupsApply(): boolean {
  if (!skipRemoteGroupsApply) return false
  skipRemoteGroupsApply = false
  return true
}
