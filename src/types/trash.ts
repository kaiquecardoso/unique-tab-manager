import type { TabGroup } from './tabs'

export type TrashRestoreRef = {
  groupId: string
  savedAt: string
  customTitle?: string
}

/** Item na lixeira — grupo inteiro ou aba isolada. */
export type TrashedEntry = {
  id: string
  deletedAt: string
  kind: 'group' | 'tab'
  restore: TrashRestoreRef
  group: TabGroup
}
