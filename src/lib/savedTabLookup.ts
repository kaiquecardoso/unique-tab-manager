import { tabUrlKey } from './browserTab'
import type { SavedTab, TabGroup } from '../types/tabs'

export type SavedTabRef = {
  group: TabGroup
  tab: SavedTab
}

export function findSavedTabByUrl(
  groups: TabGroup[],
  url: string,
): SavedTabRef | undefined {
  const key = tabUrlKey(url)
  for (const group of groups) {
    for (const tab of group.tabs) {
      if (tabUrlKey(tab.url) === key) return { group, tab }
    }
  }
  return undefined
}

export function removeTabFromGroups(
  groups: TabGroup[],
  tabId: string,
): TabGroup[] {
  return groups
    .map((g) => ({
      ...g,
      tabs: g.tabs.filter((t) => t.id !== tabId),
    }))
    .filter((g) => g.tabs.length > 0)
}
