import type { TabGroup } from '../types/tabs'
import { normalizeAllGroups, saveGroupsFromLocal } from './groupsStorage'

/** Grava grupos no dispositivo e avisa a página de opções. */
export async function saveGroupsLocally(groups: TabGroup[]): Promise<void> {
  await saveGroupsFromLocal(normalizeAllGroups(groups))
  await notifyGroupsUpdated()
}

export async function notifyGroupsUpdated(): Promise<void> {
  try {
    await chrome.runtime.sendMessage({ type: 'groups:updated' })
  } catch {
    /* página de opções fechada */
  }
}
