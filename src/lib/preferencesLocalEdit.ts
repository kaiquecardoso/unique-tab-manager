/** Preferências: gatilho em memória (UI) + pending persistido (bloqueio remoto). */

export const PREFERENCES_LOCAL_SYNC_KEY = 'oneTabPreferencesLocalSyncV1'

export type PreferencesLocalSyncState = {
  pendingCloudPush: boolean
}

let prefsUiEditPending = false
let skipNextCloudPush = false

export async function getPreferencesLocalSyncState(): Promise<PreferencesLocalSyncState> {
  const record = await chrome.storage.local.get(PREFERENCES_LOCAL_SYNC_KEY)
  const raw = record[PREFERENCES_LOCAL_SYNC_KEY]
  if (!raw || typeof raw !== 'object') return { pendingCloudPush: false }
  return { pendingCloudPush: (raw as PreferencesLocalSyncState).pendingCloudPush === true }
}

export function markLocalPreferencesEdit(): void {
  prefsUiEditPending = true
  void chrome.storage.local.set({
    [PREFERENCES_LOCAL_SYNC_KEY]: { pendingCloudPush: true },
  })
}

export function consumeLocalPreferencesEdit(): boolean {
  if (!prefsUiEditPending) return false
  prefsUiEditPending = false
  return true
}

export async function hasLocalPreferencesEditPending(): Promise<boolean> {
  const state = await getPreferencesLocalSyncState()
  return state.pendingCloudPush
}

export async function clearLocalPreferencesEditPending(): Promise<void> {
  await chrome.storage.local.set({
    [PREFERENCES_LOCAL_SYNC_KEY]: { pendingCloudPush: false },
  })
}

export function markRemotePreferencesApply(): void {
  skipNextCloudPush = true
  prefsUiEditPending = false
  void clearLocalPreferencesEditPending()
}

export function consumeSkipPreferencesCloudPush(): boolean {
  if (!skipNextCloudPush) return false
  skipNextCloudPush = false
  return true
}
