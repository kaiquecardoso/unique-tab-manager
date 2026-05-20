/** Evita que sync remoto apague alterações locais ainda não enviadas. */

let skipRemoteGroupsApply = false
let skipStorageEcho = false
let localGroupsEditPending = false

export function markLocalGroupsEdit(): void {
  localGroupsEditPending = true
}

/** Próxima escrita em `chrome.storage` veio deste cliente (não é sync remoto). */
export function markLocalGroupsStorageWrite(): void {
  skipStorageEcho = true
}

export function consumeSkipGroupsStorageEcho(): boolean {
  if (!skipStorageEcho) return false
  skipStorageEcho = false
  return true
}

export function markRemoteGroupsApply(): void {
  skipRemoteGroupsApply = true
  localGroupsEditPending = false
}

export function consumeSkipRemoteGroupsApply(): boolean {
  if (!skipRemoteGroupsApply) return false
  skipRemoteGroupsApply = false
  return true
}

export function hasLocalGroupsEditPending(): boolean {
  return localGroupsEditPending
}

export function clearLocalGroupsEditPending(): void {
  localGroupsEditPending = false
}
