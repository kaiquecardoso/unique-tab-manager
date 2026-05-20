import type { TrashedEntry } from '../types/trash'
import { normalizeAllGroups } from './groupsStorage'
export const TRASH_STORAGE_KEY = 'oneTabTrashV1'

function normalizeEntry(raw: TrashedEntry): TrashedEntry {
  const deletedAt =
    typeof raw.deletedAt === 'string' && raw.deletedAt
      ? raw.deletedAt
      : new Date().toISOString()
  const groups = normalizeAllGroups([raw.group])
  const group = groups[0] ?? {
    id: `g-trash-${Date.now()}`,
    savedAt: deletedAt,
    expanded: true,
    tabs: [],
  }
  const restore = raw.restore ?? {
    groupId: group.id,
    savedAt: group.savedAt,
  }
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : `tr-${Date.now()}`,
    deletedAt,
    kind: raw.kind === 'tab' ? 'tab' : 'group',
    restore: {
      groupId: restore.groupId,
      savedAt: restore.savedAt,
      customTitle:
        typeof restore.customTitle === 'string' && restore.customTitle.trim()
          ? restore.customTitle.trim()
          : undefined,
    },
    group,
  }
}

export async function loadTrash(): Promise<TrashedEntry[]> {
  const record = await chrome.storage.local.get(TRASH_STORAGE_KEY)
  const raw = record[TRASH_STORAGE_KEY]
  if (!Array.isArray(raw)) return []
  return raw.map((e) => normalizeEntry(e as TrashedEntry))
}

export async function saveTrash(entries: TrashedEntry[]): Promise<void> {
  await chrome.storage.local.set({ [TRASH_STORAGE_KEY]: entries })
}

export function sortTrashEntries(entries: TrashedEntry[]): TrashedEntry[] {
  return [...entries].sort(
    (a, b) => Date.parse(b.deletedAt) - Date.parse(a.deletedAt),
  )
}
