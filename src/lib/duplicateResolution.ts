import {
  showDuplicatePrompt,
  type DuplicatePromptOptions,
  type DuplicateSaveChoice,
} from './duplicatePrompt'
import { loadGroups } from './groupsStorage'
import { findSavedTabByUrl, removeTabFromGroups, type SavedTabRef } from './savedTabLookup'
import { createTrashedTab } from './trashOps'
import { loadTrash, saveTrash, sortTrashEntries } from './trashStorage'
import type { TabGroup } from '../types/tabs'

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => globalThis.setTimeout(resolve, ms))
}

function isDuplicateSaveChoice(value: unknown): value is DuplicateSaveChoice {
  return value === 'keep-new' || value === 'keep-old' || value === 'cancel'
}

async function focusTabForPrompt(tabId: number): Promise<void> {
  try {
    const tab = await chrome.tabs.get(tabId)
    if (typeof tab.windowId === 'number') {
      await chrome.windows.update(tab.windowId, { focused: true })
    }
    await chrome.tabs.update(tabId, { active: true })
    await sleep(180)
  } catch {
    /* aba pode ter sido fechada */
  }
}

async function runDuplicatePromptInTab(
  tabId: number,
  options: DuplicatePromptOptions,
): Promise<DuplicateSaveChoice | undefined> {
  const targets = [{ tabId }, { tabId, allFrames: true as const }]

  for (const attempt of [0, 1, 2]) {
    if (attempt > 0) await sleep(120)

    for (const target of targets) {
      try {
        const [viaGlobal] = await chrome.scripting.executeScript({
          target,
          func: (opts: DuplicatePromptOptions) => {
            const fn = (
              globalThis as {
                __OTM_showDuplicatePrompt?: (
                  o: DuplicatePromptOptions,
                ) => Promise<DuplicateSaveChoice>
              }
            ).__OTM_showDuplicatePrompt
            return typeof fn === 'function' ? fn(opts) : undefined
          },
          args: [options],
        })
        if (isDuplicateSaveChoice(viaGlobal?.result)) return viaGlobal.result

        const [direct] = await chrome.scripting.executeScript({
          target,
          func: showDuplicatePrompt,
          args: [options],
        })
        if (isDuplicateSaveChoice(direct?.result)) return direct.result
      } catch {
        /* frame restrito */
      }
    }
  }

  return undefined
}

export async function askDuplicateChoice(
  tabId: number,
  options: DuplicatePromptOptions,
): Promise<DuplicateSaveChoice> {
  if (options.batchMode) {
    await focusTabForPrompt(tabId)
  }

  const injected = await runDuplicatePromptInTab(tabId, options)
  if (isDuplicateSaveChoice(injected)) return injected

  const payload = {
    type: 'duplicate-prompt' as const,
    ...options,
  }

  for (const delay of [0, 120, 280]) {
    if (delay > 0) await sleep(delay)
    try {
      const response = (await chrome.tabs.sendMessage(tabId, payload)) as
        | { choice?: DuplicateSaveChoice }
        | undefined
      if (isDuplicateSaveChoice(response?.choice)) return response.choice
    } catch {
      /* content script indisponível */
    }
  }

  return 'cancel'
}

export async function trashSavedTabRef(ref: SavedTabRef): Promise<void> {
  const trash = await loadTrash()
  const entry = createTrashedTab(ref.group, ref.tab)
  await saveTrash(sortTrashEntries([entry, ...trash]))
}

export async function resolveDuplicateBeforeSave(
  url: string,
  promptTabId: number | undefined,
  newTitle: string | undefined,
  options?: {
    batchMode?: boolean
    progress?: DuplicatePromptOptions['progress']
    groups?: TabGroup[]
  },
): Promise<{
  proceed: boolean
  groups: TabGroup[]
  choice?: DuplicateSaveChoice
}> {
  const groups = options?.groups ?? (await loadGroups())
  const duplicate = findSavedTabByUrl(groups, url)
  if (!duplicate) return { proceed: true, groups }

  const choice =
    typeof promptTabId === 'number'
      ? await askDuplicateChoice(promptTabId, {
          url,
          existingTitle: duplicate.tab.title,
          existingAddedAt: duplicate.tab.addedAt,
          newTitle,
          batchMode: options?.batchMode,
          progress: options?.progress,
        })
      : 'cancel'

  if (choice === 'keep-old' || choice === 'cancel') {
    return { proceed: false, groups, choice }
  }

  await trashSavedTabRef(duplicate)
  return {
    proceed: true,
    groups: removeTabFromGroups(groups, duplicate.tab.id),
    choice,
  }
}
