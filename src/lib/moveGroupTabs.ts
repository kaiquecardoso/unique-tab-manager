import { isTabFavorite } from './groupsStorage'
import {
  createPrunableTabEntry,
  type PrunableTabEntry,
} from './pruneTabsByDate'
import type { TabGroup } from '../types/tabs'

export type GroupTrashScope = 'all' | 'viewed-only'

export function splitGroupTabsForTrash(
  group: TabGroup,
  scope: GroupTrashScope,
): {
  autoMove: PrunableTabEntry[]
  favoritePrompt: PrunableTabEntry[]
} {
  const entries = group.tabs.map((tab) => createPrunableTabEntry(group, tab))

  if (scope === 'all') {
    return {
      autoMove: entries.filter((entry) => !isTabFavorite(entry.tab)),
      favoritePrompt: entries.filter((entry) => isTabFavorite(entry.tab)),
    }
  }

  return {
    autoMove: entries.filter(
      (entry) => entry.tab.viewed === true && !isTabFavorite(entry.tab),
    ),
    favoritePrompt: [],
  }
}

export function countGroupViewedNonFavoriteTabs(group: TabGroup): number {
  return splitGroupTabsForTrash(group, 'viewed-only').autoMove.length
}

export function countGroupFavoriteTabs(group: TabGroup): number {
  return group.tabs.filter((tab) => isTabFavorite(tab)).length
}
