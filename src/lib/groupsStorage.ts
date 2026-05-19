import type { SavedTab, TabGroup } from '../types/tabs'
import { normalizeTagsArray } from './tags'

export const GROUPS_STORAGE_KEY = 'oneTabGroupsV1'

function normalizeTab(raw: SavedTab, groupSavedAt: string): SavedTab {
  const fallback = groupSavedAt || new Date().toISOString()
  const tags =
    raw && typeof raw === 'object' && 'tags' in raw
      ? normalizeTagsArray((raw as SavedTab).tags)
      : []
  return {
    ...raw,
    tags,
    addedAt:
      typeof raw.addedAt === 'string' && raw.addedAt
        ? raw.addedAt
        : fallback,
    viewed: raw.viewed === true,
  }
}

function normalizeGroup(g: TabGroup): TabGroup {
  const savedAt =
    typeof g.savedAt === 'string' && g.savedAt
      ? g.savedAt
      : new Date().toISOString()
  return {
    ...g,
    savedAt,
    expanded: g.expanded !== false,
    pinned: g.pinned === true,
    customTitle:
      typeof g.customTitle === 'string' && g.customTitle.trim()
        ? g.customTitle.trim()
        : undefined,
    tabs: Array.isArray(g.tabs)
      ? g.tabs.map((t) => normalizeTab(t as SavedTab, savedAt))
      : [],
  }
}

export async function loadGroups(): Promise<TabGroup[]> {
  const record = await chrome.storage.local.get(GROUPS_STORAGE_KEY)
  const raw = record[GROUPS_STORAGE_KEY]
  if (!Array.isArray(raw)) return []
  return raw.map((g) => normalizeGroup(g as TabGroup))
}

export async function saveGroups(groups: TabGroup[]): Promise<void> {
  await chrome.storage.local.set({ [GROUPS_STORAGE_KEY]: groups })
}

/** Garante campos derivados (ex.: `addedAt`) ao sincronizar do storage em tempo real. */
export function normalizeAllGroups(raw: TabGroup[] | unknown): TabGroup[] {
  if (!Array.isArray(raw)) return []
  return raw.map((g) => normalizeGroup(g as TabGroup))
}
