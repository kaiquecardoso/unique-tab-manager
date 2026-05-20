/** Evita PUT com estado React desatualizado após sync remoto (WebSocket). */

let skipNextCloudPush = false
let localEditPending = false

export function markLocalPreferencesEdit(): void {
  localEditPending = true
}

export function markRemotePreferencesApply(): void {
  skipNextCloudPush = true
  localEditPending = false
}

export function consumeSkipPreferencesCloudPush(): boolean {
  if (!skipNextCloudPush) return false
  skipNextCloudPush = false
  return true
}

export function consumeLocalPreferencesEdit(): boolean {
  if (!localEditPending) return false
  localEditPending = false
  return true
}
