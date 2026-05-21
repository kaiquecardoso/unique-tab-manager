/** Evita loop ao aplicar preferências vindas do storage. */

let prefsUiEditPending = false

export function markLocalPreferencesEdit(): void {
  prefsUiEditPending = true
}

export function consumeLocalPreferencesEdit(): boolean {
  if (!prefsUiEditPending) return false
  prefsUiEditPending = false
  return true
}

export function markRemotePreferencesApply(): void {
  prefsUiEditPending = false
}
