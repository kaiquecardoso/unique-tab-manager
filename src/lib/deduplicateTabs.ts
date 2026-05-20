import type { SavedTab, TabGroup } from '../types/tabs'
import type { TrashedEntry } from '../types/trash'
import { tabUrlKey } from './browserTab'
import { createTrashedTab } from './trashOps'

export type DedupeKeepStrategy = 'newest' | 'oldest'

type TabRef = { group: TabGroup; tab: SavedTab }

export type DuplicateRemovalEntry = {
  tab: SavedTab
  groupId: string
  groupSavedAt: string
  groupCustomTitle?: string
}

/** Entrada achatada para a lista do modal (com URL do grupo duplicado). */
export type DuplicateRemovalListItem = DuplicateRemovalEntry & {
  urlKey: string
  urlLabel: string
}

/** Um link com mais de uma aba salva e quais cópias serão removidas. */
export type DuplicateUrlSet = {
  urlKey: string
  urlLabel: string
  keeper: DuplicateRemovalEntry
  removing: DuplicateRemovalEntry[]
}

export function formatUrlLabel(urlKey: string): string {
  try {
    const u = new URL(urlKey)
    const host = u.hostname.replace(/^www\./, '')
    const path = `${u.pathname}${u.search}${u.hash}`
    return path && path !== '/' ? `${host}${path}` : host
  } catch {
    return urlKey
  }
}

function toEntry(ref: TabRef): DuplicateRemovalEntry {
  return {
    tab: ref.tab,
    groupId: ref.group.id,
    groupSavedAt: ref.group.savedAt,
    groupCustomTitle: ref.group.customTitle,
  }
}

function collectByUrl(groups: TabGroup[]): Map<string, TabRef[]> {
  const byUrl = new Map<string, TabRef[]>()
  for (const group of groups) {
    for (const tab of group.tabs) {
      const key = tabUrlKey(tab.url)
      const list = byUrl.get(key) ?? []
      list.push({ group, tab })
      byUrl.set(key, list)
    }
  }
  return byUrl
}

/** Pré-visualização do que será removido para cada URL repetida. */
export function previewDuplicateRemoval(
  groups: TabGroup[],
  keep: DedupeKeepStrategy,
): DuplicateUrlSet[] {
  const result: DuplicateUrlSet[] = []

  for (const entries of collectByUrl(groups).values()) {
    if (entries.length <= 1) continue

    const sorted = [...entries].sort(
      (a, b) => tabAddedAtMs(a.tab) - tabAddedAtMs(b.tab),
    )
    const keeperRef =
      keep === 'newest' ? sorted[sorted.length - 1]! : sorted[0]!

    const removing = entries
      .filter((e) => e.tab.id !== keeperRef.tab.id)
      .map(toEntry)
      .sort((a, b) => tabAddedAtMs(b.tab) - tabAddedAtMs(a.tab))

    result.push({
      urlKey: tabUrlKey(keeperRef.tab.url),
      urlLabel: formatUrlLabel(tabUrlKey(keeperRef.tab.url)),
      keeper: toEntry(keeperRef),
      removing,
    })
  }

  return result
}

/** Abas que serão removidas, mais recentes primeiro. */
export function listDuplicateRemovalPreview(
  groups: TabGroup[],
  keep: DedupeKeepStrategy,
): DuplicateRemovalListItem[] {
  const items: DuplicateRemovalListItem[] = []
  for (const set of previewDuplicateRemoval(groups, keep)) {
    for (const entry of set.removing) {
      items.push({
        ...entry,
        urlKey: set.urlKey,
        urlLabel: set.urlLabel,
      })
    }
  }
  return items.sort((a, b) => tabAddedAtMs(b.tab) - tabAddedAtMs(a.tab))
}

function tabAddedAtMs(tab: SavedTab): number {
  const t = Date.parse(tab.addedAt)
  return Number.isFinite(t) ? t : 0
}

/** Conta abas cuja URL já apareceu antes (comparação normalizada por URL). */
export function countDuplicateTabs(groups: TabGroup[]): number {
  const seen = new Set<string>()
  let count = 0
  for (const group of groups) {
    for (const tab of group.tabs) {
      const key = tabUrlKey(tab.url)
      if (seen.has(key)) count++
      else seen.add(key)
    }
  }
  return count
}

/**
 * Remove duplicatas por URL; mantém uma aba por link conforme `keep`
 * (data de `addedAt`). As demais vão para a lixeira.
 */
export function deduplicateGroups(
  groups: TabGroup[],
  keep: DedupeKeepStrategy,
): {
  groups: TabGroup[]
  trashEntries: TrashedEntry[]
  removedCount: number
} {
  const removeTabIds = new Set<string>()
  const trashEntries: TrashedEntry[] = []

  for (const entries of collectByUrl(groups).values()) {
    if (entries.length <= 1) continue

    const sorted = [...entries].sort(
      (a, b) => tabAddedAtMs(a.tab) - tabAddedAtMs(b.tab),
    )
    const keeper =
      keep === 'newest' ? sorted[sorted.length - 1]! : sorted[0]!

    for (const entry of entries) {
      if (entry.tab.id === keeper.tab.id) continue
      removeTabIds.add(entry.tab.id)
      trashEntries.push(createTrashedTab(entry.group, entry.tab))
    }
  }

  const nextGroups = groups
    .map((g) => ({
      ...g,
      tabs: g.tabs.filter((t) => !removeTabIds.has(t.id)),
    }))
    .filter((g) => g.tabs.length > 0)

  return {
    groups: nextGroups,
    trashEntries,
    removedCount: removeTabIds.size,
  }
}
