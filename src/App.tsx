import {
  Fragment,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import type { DateRange } from 'react-day-picker'
import { DayPicker } from 'react-day-picker'
import { I18nProvider, useI18n } from './i18n/context'
import { SUPPORTED_LOCALES, type SupportedLocale } from './i18n/types'
import {
  loadGroups,
  saveGroups,
  GROUPS_STORAGE_KEY,
  isTabFavorite,
} from './lib/groupsStorage'
import {
  loadTrash,
  saveTrash,
  sortTrashEntries,
  TRASH_STORAGE_KEY,
} from './lib/trashStorage'
import {
  countDuplicateTabs,
  deduplicateGroups,
  listDuplicateRemovalPreview,
  type DedupeKeepStrategy,
  type DuplicateRemovalEntry,
} from './lib/deduplicateTabs'
import {
  countViewedTabs,
  moveViewedTabsToTrash,
} from './lib/moveViewedTabs'
import {
  countGroupFavoriteTabs,
  countGroupViewedNonFavoriteTabs,
  splitGroupTabsForTrash,
  type GroupTrashScope,
} from './lib/moveGroupTabs'
import {
  applyPruneEntriesToTrash,
  applyPruneTabEntryToTrash,
  countTabsBeforeDate,
  createPrunableTabEntry,
  listTabsBeforeDate,
  splitTabsBeforeDate,
  type PrunableTabEntry,
} from './lib/pruneTabsByDate'
import {
  createTrashedGroup,
  createTrashedTab,
  restoreSingleTabFromTrashedEntry,
  restoreTrashedEntries,
} from './lib/trashOps'
import { groupSavedInDateRange } from './lib/groupDateRangeFilter'
import {
  groupTrashEntriesBySavedDay,
  isTrashDayExpanded,
  trashDayKey,
  trashDayLatestDeletedAt,
  trashDayTabCount,
} from './lib/groupTrashByDay'
import { buildDayViewedStatsByLocalDay } from './lib/tabsPerCalendarDay'
import {
  findOpenBrowserTab,
  focusBrowserTab,
  tabUrlsMatch,
} from './lib/browserTab'
import { mergeNewTags } from './lib/tags'
import { toggleThemeWithViewTransition } from './lib/themeViewTransition'
import {
  applyThemeToDocument,
  loadLocalPreferences,
  readInitialThemeFromDocument,
  serializeDateRange,
  parseDateRange,
  PREFERENCES_STORAGE_KEY,
  PREFERENCES_WRITE_SOURCE_KEY,
  saveLocalPreferencesFromLocal,
  type UserPreferences,
  type PreferencesWriteSource,
} from './lib/preferencesStorage'
import {
  markLocalPreferencesEdit,
  markRemotePreferencesApply,
  consumeLocalPreferencesEdit,
} from './lib/preferencesLocalEdit'
import {
  applyImportAddMissing,
  applyImportReplace,
  buildImportPreview,
  filterImportedGroupsByUrls,
  findImportTrashOverlap,
  parseGroupsFromExportPayload,
  removeTabsFromTrashByUrlKeys,
  type ImportPreview,
} from './lib/importGroups'
import { createSidebarCalendarDayButton } from './SidebarCalendarDayButton'
import { ModalDatePicker } from './ModalDatePicker'
import 'react-day-picker/style.css'
import type { SavedTab, TabGroup } from './types/tabs'
import type { TrashedEntry } from './types/trash'
import './App.css'

function faviconUrl(url: string): string {
  try {
    const host = new URL(url).hostname
    return `https://www.google.com/s2/favicons?domain=${host}&sz=64`
  } catch {
    return 'https://www.google.com/s2/favicons?domain=example.com&sz=64'
  }
}

/** Modo normal: URL completa sem `https://www.` / `http://www.`. Compacto: só hostname. */
function formatTabHostLabel(url: string, simpleLayout: boolean): string {
  try {
    if (simpleLayout) {
      return new URL(url).hostname.replace(/^www\./i, '')
    }
    return url
      .trim()
      .replace(/^https:\/\/www\./i, '')
      .replace(/^http:\/\/www\./i, '')
  } catch {
    return url
  }
}

function sortGroupsList(list: TabGroup[]): TabGroup[] {
  return [...list].sort((a, b) => {
    const ap = a.pinned ? 1 : 0
    const bp = b.pinned ? 1 : 0
    if (bp !== ap) return bp - ap
    return new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime()
  })
}

function IconLogo() {
  return (
    <svg
      className="app-logo"
      width="36"
      height="36"
      viewBox="0 0 36 36"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <rect width="36" height="36" rx="14" fill="var(--accent)" />
      <path
        d="M18 8.5 27 13l-9 4.5L9 13l9-4.5Z"
        fill="white"
      />
      <path
        d="m10.8 16.9 7.2 3.6 7.2-3.6 1.8.9-9 4.5-9-4.5 1.8-.9Z"
        fill="white"
        opacity="0.78"
      />
      <path
        d="m10.8 21.1 7.2 3.6 7.2-3.6 1.8.9-9 4.5-9-4.5 1.8-.9Z"
        fill="white"
        opacity="0.58"
      />
    </svg>
  )
}

function IconSearch() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15ZM21 21l-4.35-4.35"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function IconMenu() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 7h16M4 12h16M4 17h16"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}

function IconChevron({ open }: { open: boolean }) {
  return (
    <svg
      className={`chevron ${open ? 'chevron--open' : ''}`}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <path
        d="M9 6l6 6-6 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function IconFolder() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M3 7a2 2 0 0 1 2-2h4.2l1.6 2H19a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function IconClock() {
  return (
    <svg
      className="group-meta-clock"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.75" />
      <path
        d="M12 7v5l3 2"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function IconPin({ pinned }: { pinned: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M9 2h6v7l3 3v1H6v-1l3-3V2z M10 13v9h4v-9"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      {!pinned ? (
        <path
          d="M3 21L20 4"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      ) : null}
    </svg>
  )
}

function IconOpenTabs() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M5 8.5h9.5a2 2 0 0 1 2 2V19H7a2 2 0 0 1-2-2V8.5Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M8 5h9.5a2 2 0 0 1 2 2v8.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M10 13h5m0 0-2-2m2 2-2 2"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function IconPencil() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 20h9M4.5 15.5L15 5l4 4L8.5 19.5H4v-4z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function IconEye() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx="12"
        cy="12"
        r="2.5"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  )
}

function IconEyeOff() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7S2 12 2 12Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx="12"
        cy="12"
        r="2.5"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M4 4l16 16"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

function IconTrash() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 7h16M10 11v6M14 11v6M6 7l1 12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-12M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function IconStar({ filled }: { filled: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
      <path
        d="M12 3.5l2.35 4.76 5.25.77-3.8 3.7.9 5.23L12 15.9l-4.7 2.46.9-5.23-3.8-3.7 5.25-.77L12 3.5z"
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function IconRestore() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M3 10a9 9 0 1 1 2.4 6M3 10V4m0 6h6"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function IconDownload() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 4v10m0 0l3.5-3.5M12 14l-3.5-3.5M5 18h14"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function IconUpload() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 20V10m0 0l3.5 3.5M12 10l-3.5 3.5M5 6h14"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function IconDedupe() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M8 7h11a2 2 0 0 1 2 2v11M7 8V6a2 2 0 0 1 2-2h11M5 17H4a2 2 0 0 1-2-2v-1"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function IconCalendarPeriod() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect
        x="3"
        y="4"
        width="18"
        height="18"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M16 2v4M8 2v4M3 10h18"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

function filterGroups(
  groups: TabGroup[],
  q: string,
  activeTags: Set<string>,
  dateRange: DateRange | undefined,
): TabGroup[] {
  const needle = q.trim().toLowerCase()
  const tagFiltering = activeTags.size > 0

  return groups
    .filter((g) => groupSavedInDateRange(g, dateRange))
    .map((g) => {
      const tabs = g.tabs.filter((t) => {
        if (tagFiltering && !t.tags.some((tag) => activeTags.has(tag))) {
          return false
        }
        if (!needle) return true
        return (
          t.title.toLowerCase().includes(needle) ||
          t.url.toLowerCase().includes(needle) ||
          t.tags.some((tag) => tag.includes(needle))
        )
      })
      return { ...g, tabs }
    })
    .filter((g) => g.tabs.length > 0)
}

function IconClose() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M4 4l8 8M12 4l-8 8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

function SidebarDropdownSection({
  id,
  title,
  open,
  onToggle,
  children,
}: {
  id: string
  title: string
  open: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  const panelId = `sidebar-dropdown-panel-${id}`
  const triggerId = `sidebar-dropdown-trigger-${id}`

  return (
    <div
      className={`sidebar-dropdown sidebar-section-card${open ? ' sidebar-dropdown--open' : ''}`}
    >
      <button
        type="button"
        id={triggerId}
        className="sidebar-dropdown-trigger"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
      >
        <span className="sidebar-dropdown-title">{title}</span>
        <IconChevron open={open} />
      </button>
      <div
        id={panelId}
        className={`sidebar-dropdown-panel${open ? ' sidebar-dropdown-panel--open' : ''}`}
        role="region"
        aria-labelledby={triggerId}
      >
        <div className="sidebar-dropdown-panel-inner" inert={!open}>
          {children}
        </div>
      </div>
    </div>
  )
}

function TabRow({
  tab,
  simpleLayout,
  onRequestRemove,
  onRequestEditTitle,
  onOpenTab,
  onToggleViewed,
  onSetTags,
  existingTagOptions,
  showFavorite = false,
  onToggleFavorite,
  onRestore,
  tagsReadOnly = false,
  removeLabel,
}: {
  tab: SavedTab
  simpleLayout: boolean
  onRequestRemove: () => void
  onRequestEditTitle: () => void
  onOpenTab: () => void
  onToggleViewed: () => void
  onSetTags: (tags: string[]) => void
  /** Tags já usadas em alguma aba (ordenadas), sugeridas no mesmo campo de nova tag. */
  existingTagOptions: string[]
  showFavorite?: boolean
  onToggleFavorite?: () => void
  onRestore?: () => void
  tagsReadOnly?: boolean
  removeLabel: string
}) {
  const { t, formatTabAddedAt } = useI18n()
  const tagInputPlaceholder = t('tab.tag.placeholder')
  const tagDropdownId = useId()
  const tagPickerRef = useRef<HTMLSpanElement>(null)
  const [tagDraft, setTagDraft] = useState('')

  const selectableExistingTags = useMemo(
    () => existingTagOptions.filter((tagName) => !tab.tags.includes(tagName)),
    [existingTagOptions, tab.tags],
  )
  const hasTagSuggestions = selectableExistingTags.length > 0
  const [tagDropdownOpen, setTagDropdownOpen] = useState(false)

  useEffect(() => {
    if (!tagDropdownOpen) return

    function handlePointerDown(e: PointerEvent) {
      if (!tagPickerRef.current?.contains(e.target as Node)) {
        setTagDropdownOpen(false)
      }
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setTagDropdownOpen(false)
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [tagDropdownOpen])

  function commitTagDraft() {
    const raw = tagDraft
    setTagDraft('')
    setTagDropdownOpen(false)
    const next = mergeNewTags(tab.tags, raw)
    if (JSON.stringify(next) !== JSON.stringify(tab.tags)) onSetTags(next)
  }

  function addExistingTag(tagName: string) {
    const next = mergeNewTags(tab.tags, tagName)
    if (JSON.stringify(next) !== JSON.stringify(tab.tags)) onSetTags(next)
    setTagDropdownOpen(false)
  }

  const hostLabel = formatTabHostLabel(tab.url, simpleLayout)

  function openTab() {
    onOpenTab()
  }

  const tagInputSize = Math.min(
    44,
    Math.max(
      8,
      tagDraft.length > 0
        ? tagDraft.length + 1
        : tagInputPlaceholder.length,
    ),
  )

  return (
    <div className={`tab-row${simpleLayout ? ' tab-row--simple' : ''}`}>
      <div className="tab-row-top">
        <div
          className="tab-row-main"
          role="button"
          tabIndex={0}
          onClick={openTab}
          onKeyDown={(e) => {
            if (e.key !== 'Enter' && e.key !== ' ') return
            e.preventDefault()
            openTab()
          }}
        >
          <img
            className="tab-favicon"
            src={faviconUrl(tab.url)}
            alt=""
            width={simpleLayout ? 20 : 32}
            height={simpleLayout ? 20 : 32}
            loading="lazy"
          />
          <div className="tab-text">
            <div className="tab-title-row">
              <div
                className={`tab-title${tab.viewed ? ' tab-title--viewed' : ''}`}
                title={tab.title}
              >
                {tab.title}
              </div>
              {simpleLayout ? (
                <>
                  <span className="tab-title-time-sep" aria-hidden>
                    ·
                  </span>
                  <time
                    className="tab-added tab-added--inline"
                    dateTime={tab.addedAt}
                  >
                    {formatTabAddedAt(tab.addedAt)}
                  </time>
                </>
              ) : null}
              <button
                type="button"
                className="tab-title-edit"
                aria-label={t('tab.title.editAria', { title: tab.title })}
                title={t('tab.title.edit')}
                onClick={(e) => {
                  e.stopPropagation()
                  onRequestEditTitle()
                }}
              >
                <IconPencil />
              </button>
              <button
                type="button"
                className={`tab-title-edit tab-title-viewed-toggle${tab.viewed ? ' tab-title-viewed-toggle--viewed' : ''}`}
                aria-label={
                  tab.viewed
                    ? t('tab.viewed.unmarkAria', { title: tab.title })
                    : t('tab.viewed.markAria', { title: tab.title })
                }
                title={
                  tab.viewed
                    ? t('tab.viewed.unmark')
                    : t('tab.viewed.mark')
                }
                onClick={(e) => {
                  e.stopPropagation()
                  onToggleViewed()
                }}
              >
                {tab.viewed ? <IconEyeOff /> : <IconEye />}
              </button>
            </div>
            {!simpleLayout ? (
              <div className="tab-subline">
                <span className="tab-host" title={tab.url}>
                  {hostLabel}
                </span>
                <span className="tab-subline-sep" aria-hidden>
                  ·
                </span>
                <time className="tab-added" dateTime={tab.addedAt}>
                  {formatTabAddedAt(tab.addedAt)}
                </time>
              </div>
            ) : null}
          </div>
        </div>
        <div className="tab-row-tags-field">
          {tab.tags.map((tagName) => (
            <span key={tagName} className="tab-chip">
              {tagName}
              {!tagsReadOnly ? (
                <button
                  type="button"
                  className="tab-chip-remove"
                  aria-label={t('tab.tag.remove', { tag: tagName })}
                  title={t('tab.tag.remove', { tag: tagName })}
                  onClick={(e) => {
                    e.stopPropagation()
                    onSetTags(tab.tags.filter((x) => x !== tagName))
                  }}
                >
                  ×
                </button>
              ) : null}
            </span>
          ))}
          {!tagsReadOnly ? (
          <span
            ref={tagPickerRef}
            className={
              hasTagSuggestions
                ? `tab-tag-input-shell${tagDropdownOpen ? ' tab-tag-input-shell--open' : ''}`
                : 'tab-tag-input-shell tab-tag-input-shell--pass-through'
            }
          >
            <input
              className={
                hasTagSuggestions
                  ? 'tab-tag-input tab-tag-input--in-shell'
                  : 'tab-tag-input'
              }
              type="text"
              value={tagDraft}
              size={hasTagSuggestions ? undefined : tagInputSize}
              onChange={(e) => setTagDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  commitTagDraft()
                }
              }}
              onBlur={() => {
                commitTagDraft()
              }}
              onClick={(e) => e.stopPropagation()}
              placeholder={tagInputPlaceholder}
              aria-label={t('tab.tag.ariaLabel')}
              maxLength={64}
            />
            {hasTagSuggestions ? (
              <>
                <button
                  type="button"
                  className="tab-tag-dropdown-trigger"
                  aria-label={t('tab.tag.showExisting')}
                  title={t('tab.tag.showExisting')}
                  aria-haspopup="listbox"
                  aria-expanded={tagDropdownOpen}
                  aria-controls={tagDropdownId}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={(e) => {
                    e.stopPropagation()
                    setTagDropdownOpen((open) => !open)
                  }}
                >
                  <span aria-hidden />
                </button>
                <div
                  id={tagDropdownId}
                  className={`tab-tag-dropdown${tagDropdownOpen ? ' tab-tag-dropdown--open' : ''}`}
                  role="listbox"
                  aria-label={t('tab.tag.existingList')}
                >
                  {selectableExistingTags.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      className="tab-tag-dropdown-option"
                      role="option"
                      aria-selected={false}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={(e) => {
                        e.stopPropagation()
                        addExistingTag(tag)
                      }}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </>
            ) : null}
          </span>
          ) : null}
        </div>
        {onRestore ? (
          <button
            type="button"
            className="tab-row-restore"
            aria-label={t('tab.restore')}
            title={t('tab.restore')}
            onClick={(e) => {
              e.stopPropagation()
              onRestore()
            }}
          >
            <IconRestore />
          </button>
        ) : null}
        {showFavorite && onToggleFavorite ? (
          <button
            type="button"
            className={`tab-row-favorite${tab.favorite ? ' tab-row-favorite--on' : ''}`}
            aria-label={
              tab.favorite ? t('tab.favorite.remove') : t('tab.favorite.add')
            }
            title={
              tab.favorite ? t('tab.favorite.remove') : t('tab.favorite.add')
            }
            onClick={(e) => {
              e.stopPropagation()
              onToggleFavorite()
            }}
          >
            <IconStar filled={tab.favorite === true} />
          </button>
        ) : null}
        <button
          type="button"
          className="tab-row-delete"
          aria-label={removeLabel}
          title={removeLabel}
          onClick={(e) => {
            e.stopPropagation()
            onRequestRemove()
          }}
        >
          <IconClose />
        </button>
      </div>
    </div>
  )
}

type MainView = 'saved' | 'favorites' | 'trash'

type ConfirmDeleteAction =
  | { variant: 'all' }
  | { variant: 'group'; groupId: string }
  | { variant: 'tab'; groupId: string; tabId: string }
  | { variant: 'trash-entry'; trashId: string }
  | { variant: 'trash-all' }
  | { variant: 'remove-duplicates' }
  | { variant: 'prune-by-date' }

type EditTitleAction =
  | { variant: 'tab'; groupId: string; tabId: string; title: string }
  | { variant: 'group'; groupId: string; title: string }

type RedirectToOpenTabAction = {
  chromeTabId: number
  groupId: string
  tabId: string
}

type PendingGroupsImport = {
  groups: TabGroup[]
  preview: ImportPreview
}

type PendingImportTrashResolution = PendingGroupsImport & {
  mode: 'replace' | 'add-missing'
  overlapCount: number
}

const GROUPS_EXPORT_VERSION = 1

const MAIN_VIEWS = ['saved', 'favorites', 'trash'] as const satisfies readonly MainView[]

function MainViewTabIcon({ view }: { view: MainView }) {
  if (view === 'saved') {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
        />
      </svg>
    )
  }
  if (view === 'favorites') {
    return <IconStar filled={false} />
  }
  return <IconTrash />
}

type AppProps = {
  initialPrefs?: UserPreferences
}

export default function App({ initialPrefs }: AppProps = {}) {
  const [locale, setLocale] = useState<SupportedLocale>(
    () => initialPrefs?.locale ?? 'pt-BR',
  )
  return (
    <I18nProvider locale={locale}>
      <AppInner
        initialPrefs={initialPrefs}
        locale={locale}
        setLocale={setLocale}
      />
    </I18nProvider>
  )
}

function AppInner({
  initialPrefs,
  locale,
  setLocale,
}: {
  initialPrefs?: UserPreferences
  locale: SupportedLocale
  setLocale: (l: SupportedLocale) => void
}) {
  const {
    t,
    plural,
    formatTabCount,
    formatShortDate,
    formatCalendarDate,
    formatGroupMetaLine,
    formatRelativeAgo,
    dateFnsLocale,
    intlLocale,
  } = useI18n()

  const [groups, setGroups] = useState<TabGroup[]>([])
  const [trash, setTrash] = useState<TrashedEntry[]>([])
  const [mainView, setMainView] = useState<MainView>('saved')
  const [search, setSearch] = useState('')
  const [activeTagFilters, setActiveTagFilters] = useState<string[]>([])
  const [groupDateRange, setGroupDateRange] = useState<
    DateRange | undefined
  >()
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const [darkMode, setDarkMode] = useState(
    () =>
      initialPrefs?.theme === 'dark' ||
      readInitialThemeFromDocument() === 'dark',
  )
  const [simpleLayout, setSimpleLayout] = useState(
    () => initialPrefs?.simpleLayout === true,
  )
  const prefsHydratedRef = useRef(false)
  const groupsRef = useRef<TabGroup[]>([])
  const trashRef = useRef<TrashedEntry[]>([])
  const [preferenceSectionsOpen, setPreferenceSectionsOpen] = useState({
    backup: false,
    appearance: false,
    exclusion: false,
  })

  function togglePreferenceSection(section: 'backup' | 'appearance' | 'exclusion') {
    setPreferenceSectionsOpen((prev) => ({
      ...prev,
      [section]: !prev[section],
    }))
  }

  const [confirmModalMounted, setConfirmModalMounted] = useState(false)
  const [confirmModalOpen, setConfirmModalOpen] = useState(false)
  const confirmModalOpenRef = useRef(false)
  const [confirmAction, setConfirmAction] =
    useState<ConfirmDeleteAction | null>(null)
  const [dedupeKeepStrategy, setDedupeKeepStrategy] =
    useState<DedupeKeepStrategy>('newest')
  const [pruneBeforeDate, setPruneBeforeDate] = useState<Date | undefined>(
    undefined,
  )
  const [editTitleModalMounted, setEditTitleModalMounted] = useState(false)
  const [editTitleModalOpen, setEditTitleModalOpen] = useState(false)
  const editTitleModalOpenRef = useRef(false)
  const editTitleInputRef = useRef<HTMLInputElement>(null)
  const importGroupsInputRef = useRef<HTMLInputElement>(null)
  const themeSwitchRef = useRef<HTMLButtonElement>(null)
  const [editTitleAction, setEditTitleAction] =
    useState<EditTitleAction | null>(null)
  const [editTitleDraft, setEditTitleDraft] = useState('')
  const [groupsImportStatus, setGroupsImportStatus] = useState('')
  const [importModalMounted, setImportModalMounted] = useState(false)
  const [importModalOpen, setImportModalOpen] = useState(false)
  const importModalOpenRef = useRef(false)
  const [pendingImport, setPendingImport] = useState<PendingGroupsImport | null>(
    null,
  )
  const pendingImportTrashAfterCloseRef = useRef(false)
  const [importTrashModalMounted, setImportTrashModalMounted] = useState(false)
  const [importTrashModalOpen, setImportTrashModalOpen] = useState(false)
  const importTrashModalOpenRef = useRef(false)
  const [pendingImportTrash, setPendingImportTrash] =
    useState<PendingImportTrashResolution | null>(null)
  const [redirectModalMounted, setRedirectModalMounted] = useState(false)
  const [redirectModalOpen, setRedirectModalOpen] = useState(false)
  const redirectModalOpenRef = useRef(false)
  const [redirectAction, setRedirectAction] =
    useState<RedirectToOpenTabAction | null>(null)
  const [favoritePruneModalMounted, setFavoritePruneModalMounted] =
    useState(false)
  const [favoritePruneModalOpen, setFavoritePruneModalOpen] = useState(false)
  const favoritePruneModalOpenRef = useRef(false)
  const [favoritePruneQueue, setFavoritePruneQueue] = useState<PrunableTabEntry[]>(
    [],
  )
  const [favoritePruneIndex, setFavoritePruneIndex] = useState(0)
  const favoritePruneStatsRef = useRef<{
    beforeDate: Date
    autoMoved: number
    favoriteMoved: number
    favoriteKept: number
  } | null>(null)

  useEffect(() => {
    confirmModalOpenRef.current = confirmModalOpen
  }, [confirmModalOpen])

  useEffect(() => {
    editTitleModalOpenRef.current = editTitleModalOpen
  }, [editTitleModalOpen])

  useEffect(() => {
    redirectModalOpenRef.current = redirectModalOpen
  }, [redirectModalOpen])

  useEffect(() => {
    importModalOpenRef.current = importModalOpen
  }, [importModalOpen])

  useEffect(() => {
    importTrashModalOpenRef.current = importTrashModalOpen
  }, [importTrashModalOpen])

  useEffect(() => {
    favoritePruneModalOpenRef.current = favoritePruneModalOpen
  }, [favoritePruneModalOpen])

  const confirmCopy = useMemo(() => {
    switch (confirmAction?.variant) {
      case 'all':
        return {
          title: t('confirm.moveAll.title'),
          body: t('confirm.moveAll.body'),
          confirmLabel: t('confirm.moveAll.confirmLabel'),
        }
      case 'group': {
        const group = groups.find((g) => g.id === confirmAction.groupId)
        if (!group) {
          return {
            title: t('confirm.moveGroup.title'),
            body: t('confirm.moveGroup.body.default'),
            confirmLabel: t('confirm.moveGroup.confirmLabel'),
          }
        }
        const favoriteCount = countGroupFavoriteTabs(group)
        const viewedNonFavoriteCount = countGroupViewedNonFavoriteTabs(group)
        const parts = [
          t('confirm.moveGroup.body.hasTabs', {
            tabCount: formatTabCount(group.tabs.length),
          }),
        ]
        if (favoriteCount > 0) {
          parts.push(
            plural('confirm.moveGroup.body.favoritePrompt', favoriteCount, {
              count: favoriteCount,
            }),
          )
        }
        if (viewedNonFavoriteCount > 0) {
          parts.push(
            plural(
              'confirm.moveGroup.body.viewedNonFavorite',
              viewedNonFavoriteCount,
              { count: viewedNonFavoriteCount },
            ),
          )
        }
        return {
          title: t('confirm.moveGroup.title'),
          body: parts.join(' '),
          confirmLabel: t('confirm.moveGroup.confirmLabel'),
        }
      }
      case 'tab':
        return {
          title: t('confirm.moveTab.title'),
          body: t('confirm.moveTab.body'),
          confirmLabel: t('confirm.moveTab.confirmLabel'),
        }
      case 'trash-entry':
        return {
          title: t('confirm.trashEntry.title'),
          body: t('confirm.trashEntry.body'),
          confirmLabel: t('confirm.trashEntry.confirmLabel'),
        }
      case 'trash-all':
        return {
          title: t('confirm.trashAll.title'),
          body: t('confirm.trashAll.body'),
          confirmLabel: t('confirm.trashAll.confirmLabel'),
        }
      case 'remove-duplicates': {
        const n = countDuplicateTabs(groups)
        return {
          title: t('confirm.removeDuplicates.title'),
          body: plural('confirm.removeDuplicates.body', n, { count: n }),
          confirmLabel: t('confirm.removeDuplicates.confirmLabel'),
        }
      }
      case 'prune-by-date': {
        if (!pruneBeforeDate) {
          return {
            title: t('confirm.pruneByDate.title'),
            body: t('confirm.pruneByDate.body.pickDate'),
            confirmLabel: t('confirm.pruneByDate.confirmLabel'),
          }
        }

        const { autoMove, favoritePrompt } = splitTabsBeforeDate(
          groups,
          pruneBeforeDate,
        )
        const dateLabel = formatCalendarDate(pruneBeforeDate)
        const total = autoMove.length + favoritePrompt.length
        if (total === 0) {
          return {
            title: t('confirm.pruneByDate.title'),
            body: t('confirm.pruneByDate.body.noneUntil', { dateLabel }),
            confirmLabel: t('confirm.pruneByDate.confirmLabel'),
          }
        }

        const details: string[] = []
        if (autoMove.length > 0) {
          details.push(
            plural('confirm.pruneByDate.body.autoMove', autoMove.length, {
              count: autoMove.length,
            }),
          )
        }
        if (favoritePrompt.length > 0) {
          details.push(
            plural('confirm.pruneByDate.body.favoritePrompt', favoritePrompt.length, {
              count: favoritePrompt.length,
            }),
          )
        }

        return {
          title: t('confirm.pruneByDate.title'),
          body: t('confirm.pruneByDate.body.summary', {
            dateLabel,
            details: details.join(' '),
          }),
          confirmLabel: t('confirm.pruneByDate.confirmLabel'),
        }
      }
      default:
        return {
          title: '',
          body: '',
          confirmLabel: t('confirm.common.confirm'),
        }
    }
  }, [confirmAction, groups, pruneBeforeDate, t, plural, formatTabCount, formatCalendarDate])

  type GroupsPersistInput =
    | TabGroup[]
    | ((current: TabGroup[]) => TabGroup[])

  const reloadGroupsFromStorage = useCallback(async () => {
    const loaded = await loadGroups()
    const sorted = sortGroupsList(loaded)
    groupsRef.current = sorted
    setGroups(sorted)
  }, [])

  const persist = useCallback((nextOrUpdater: GroupsPersistInput) => {
    const sorted = sortGroupsList(
      typeof nextOrUpdater === 'function'
        ? nextOrUpdater(groupsRef.current)
        : nextOrUpdater,
    )
    groupsRef.current = sorted
    setGroups(sorted)
    void saveGroups(sorted)
  }, [])

  const persistTrash = useCallback((next: TrashedEntry[]) => {
    const sorted = sortTrashEntries(next)
    trashRef.current = sorted
    setTrash(sorted)
    void saveTrash(sorted)
  }, [])

  useEffect(() => {
    if (
      !confirmModalMounted &&
      !editTitleModalMounted &&
      !redirectModalMounted &&
      !importModalMounted &&
      !importTrashModalMounted &&
      !favoritePruneModalMounted &&
      !mobileSidebarOpen
    )
      return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [
    confirmModalMounted,
    editTitleModalMounted,
    redirectModalMounted,
    importModalMounted,
    importTrashModalMounted,
    favoritePruneModalMounted,
    mobileSidebarOpen,
  ])

  useEffect(() => {
    if (!confirmModalMounted) return
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => setConfirmModalOpen(true))
    })
    return () => cancelAnimationFrame(id)
  }, [confirmModalMounted])

  useEffect(() => {
    if (!editTitleModalMounted) return
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setEditTitleModalOpen(true)
        editTitleInputRef.current?.focus()
        editTitleInputRef.current?.select()
      })
    })
    return () => cancelAnimationFrame(id)
  }, [editTitleModalMounted])

  useEffect(() => {
    if (!redirectModalMounted) return
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => setRedirectModalOpen(true))
    })
    return () => cancelAnimationFrame(id)
  }, [redirectModalMounted])

  useEffect(() => {
    if (!importModalMounted) return
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => setImportModalOpen(true))
    })
    return () => cancelAnimationFrame(id)
  }, [importModalMounted])

  useEffect(() => {
    if (!importTrashModalMounted) return
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => setImportTrashModalOpen(true))
    })
    return () => cancelAnimationFrame(id)
  }, [importTrashModalMounted])

  useEffect(() => {
    if (!favoritePruneModalMounted) return
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => setFavoritePruneModalOpen(true))
    })
    return () => cancelAnimationFrame(id)
  }, [favoritePruneModalMounted])

  const applyPreferences = useCallback(
    (prefs: UserPreferences, fromRemote = false) => {
      if (fromRemote) {
        markRemotePreferencesApply()
      }
      setDarkMode(prefs.theme === 'dark')
      setSimpleLayout(prefs.simpleLayout)
      setLocale(prefs.locale)
      setSearch(prefs.search)
      setActiveTagFilters(prefs.activeTagFilters)
      setGroupDateRange(parseDateRange(prefs.groupDateRange))
    },
    [setLocale],
  )

  useEffect(() => {
    applyThemeToDocument(darkMode ? 'dark' : 'light')
  }, [darkMode])

  useEffect(() => {
    document.documentElement.setAttribute(
      'data-simple-layout',
      simpleLayout ? 'true' : 'false',
    )
  }, [simpleLayout])

  useEffect(() => {
    if (initialPrefs) {
      prefsHydratedRef.current = true
      return
    }
    void loadLocalPreferences().then((prefs) => {
      applyPreferences(prefs)
      prefsHydratedRef.current = true
    })
  }, [applyPreferences, initialPrefs])

  useEffect(() => {
    if (!prefsHydratedRef.current) return
    if (!consumeLocalPreferencesEdit()) return

    const prefs: UserPreferences = {
      theme: darkMode ? 'dark' : 'light',
      simpleLayout,
      locale,
      search,
      activeTagFilters,
      groupDateRange: serializeDateRange(groupDateRange),
    }

    void saveLocalPreferencesFromLocal(prefs)
  }, [darkMode, simpleLayout, locale, search, activeTagFilters, groupDateRange])

  useEffect(() => {
    groupsRef.current = groups
  }, [groups])

  useEffect(() => {
    void Promise.all([loadGroups(), loadTrash()]).then(([loaded, loadedTrash]) => {
      const sorted = sortGroupsList(loaded)
      groupsRef.current = sorted
      setGroups(sorted)
      const sortedTrash = sortTrashEntries(loadedTrash)
      trashRef.current = sortedTrash
      setTrash(sortedTrash)
    })
  }, [])

  useEffect(() => {
    const onMessage = (message: unknown) => {
      if (!message || typeof message !== 'object' || !('type' in message)) return
      if (message.type === 'groups:updated') {
        void reloadGroupsFromStorage()
      }
    }
    chrome.runtime.onMessage.addListener(onMessage)
    return () => chrome.runtime.onMessage.removeListener(onMessage)
  }, [reloadGroupsFromStorage])

  useEffect(() => {
    const onChange = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string,
    ) => {
      if (area !== 'local') return

      if (changes[GROUPS_STORAGE_KEY]) {
        void reloadGroupsFromStorage()
      }

      if (changes[TRASH_STORAGE_KEY]) {
        const next = changes[TRASH_STORAGE_KEY].newValue as TrashedEntry[] | undefined
        if (Array.isArray(next)) {
          const sorted = sortTrashEntries(next)
          trashRef.current = sorted
          setTrash(sorted)
        }
      }

      if (changes[PREFERENCES_STORAGE_KEY]) {
        const next = changes[PREFERENCES_STORAGE_KEY].newValue as
          | UserPreferences
          | undefined
        const source = changes[PREFERENCES_WRITE_SOURCE_KEY]?.newValue as
          | PreferencesWriteSource
          | undefined
        if (next && typeof next === 'object' && source !== 'local') {
          applyPreferences(next, true)
        }
      }
    }
    chrome.storage.onChanged.addListener(onChange)
    return () => chrome.storage.onChanged.removeListener(onChange)
  }, [applyPreferences, reloadGroupsFromStorage])

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void reloadGroupsFromStorage()
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [reloadGroupsFromStorage])

  useEffect(() => {
    if (!confirmModalMounted) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') requestCloseConfirmModal()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [confirmModalMounted])

  useEffect(() => {
    if (!editTitleModalMounted) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') requestCloseEditTitleModal()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [editTitleModalMounted])

  useEffect(() => {
    if (!redirectModalMounted) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') requestCloseRedirectModal()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [redirectModalMounted])

  useEffect(() => {
    if (!importModalMounted) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') requestCloseImportModal()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [importModalMounted])

  useEffect(() => {
    if (!importTrashModalMounted) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') requestCloseImportTrashModal()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [importTrashModalMounted])

  useEffect(() => {
    if (!favoritePruneModalMounted) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') answerFavoritePrune(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [favoritePruneModalMounted, favoritePruneIndex, favoritePruneQueue])

  useEffect(() => {
    if (!mobileSidebarOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileSidebarOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mobileSidebarOpen])

  function requestCloseConfirmModal() {
    confirmModalOpenRef.current = false
    setConfirmModalOpen(false)
  }

  function requestCloseEditTitleModal() {
    editTitleModalOpenRef.current = false
    setEditTitleModalOpen(false)
  }

  function requestCloseRedirectModal() {
    redirectModalOpenRef.current = false
    setRedirectModalOpen(false)
  }

  function requestCloseFavoritePruneModal() {
    favoritePruneModalOpenRef.current = false
    setFavoritePruneModalOpen(false)
  }

  function handleFavoritePruneModalBackdropTransitionEnd(
    e: React.TransitionEvent<HTMLDivElement>,
  ) {
    if (e.target !== e.currentTarget || e.propertyName !== 'opacity') return
    if (!favoritePruneModalOpenRef.current) {
      setFavoritePruneModalMounted(false)
      setFavoritePruneQueue([])
      setFavoritePruneIndex(0)
    }
  }

  function buildPruneByDateStatusMessage(stats: {
    beforeDate: Date
    autoMoved: number
    favoriteMoved: number
    favoriteKept: number
  }): string {
    const dateLabel = formatCalendarDate(stats.beforeDate)
    const moved = stats.autoMoved + stats.favoriteMoved
    if (moved === 0) {
      if (stats.favoriteKept === 0) return ''
      return plural('status.pruneFavoriteKept', stats.favoriteKept, {
        count: stats.favoriteKept,
        dateLabel,
      })
    }

    const parts = [
      plural('status.pruneMoved', moved, { count: moved, dateLabel }),
    ]
    if (stats.favoriteKept > 0) {
      parts.push(
        plural('status.pruneFavoriteKeptSuffix', stats.favoriteKept, {
          count: stats.favoriteKept,
        }),
      )
    }
    return `${parts.join('; ')}.`
  }

  function finishFavoritePruneFlow() {
    const stats = favoritePruneStatsRef.current
    const message = stats ? buildPruneByDateStatusMessage(stats) : ''
    if (message) setGroupsImportStatus(message)
    favoritePruneStatsRef.current = null
    requestCloseFavoritePruneModal()
  }

  function openFavoriteTabTrashPrompt(group: TabGroup, tab: SavedTab) {
    favoritePruneStatsRef.current = null
    setFavoritePruneQueue([createPrunableTabEntry(group, tab)])
    setFavoritePruneIndex(0)
    setFavoritePruneModalMounted(true)
  }

  function answerFavoritePrune(moveToTrash: boolean) {
    const entry = favoritePruneQueue[favoritePruneIndex]
    if (!entry) {
      finishFavoritePruneFlow()
      return
    }

    const stats = favoritePruneStatsRef.current

    if (moveToTrash) {
      const { groups: next, trashEntry } = applyPruneTabEntryToTrash(
        groupsRef.current,
        entry,
      )
      if (trashEntry) {
        persist(next)
        persistTrash([trashEntry, ...trashRef.current])
        if (stats) stats.favoriteMoved += 1
      }
    } else if (stats) {
      stats.favoriteKept += 1
    }

    const nextIndex = favoritePruneIndex + 1
    if (nextIndex >= favoritePruneQueue.length) {
      finishFavoritePruneFlow()
      return
    }

    setFavoritePruneIndex(nextIndex)
  }

  function handleConfirmModalBackdropTransitionEnd(
    e: React.TransitionEvent<HTMLDivElement>,
  ) {
    if (e.target !== e.currentTarget || e.propertyName !== 'opacity') return
    if (!confirmModalOpenRef.current) {
      setConfirmModalMounted(false)
      setConfirmAction(null)
    }
  }

  function handleEditTitleModalBackdropTransitionEnd(
    e: React.TransitionEvent<HTMLDivElement>,
  ) {
    if (e.target !== e.currentTarget || e.propertyName !== 'opacity') return
    if (!editTitleModalOpenRef.current) {
      setEditTitleModalMounted(false)
      setEditTitleAction(null)
      setEditTitleDraft('')
    }
  }

  function handleRedirectModalBackdropTransitionEnd(
    e: React.TransitionEvent<HTMLDivElement>,
  ) {
    if (e.target !== e.currentTarget || e.propertyName !== 'opacity') return
    if (!redirectModalOpenRef.current) {
      setRedirectModalMounted(false)
      setRedirectAction(null)
    }
  }

  function openConfirmDeleteModal(action: ConfirmDeleteAction) {
    if (action.variant === 'remove-duplicates') {
      setDedupeKeepStrategy('newest')
    }
    if (action.variant === 'prune-by-date') {
      setPruneBeforeDate(undefined)
    }
    if (action.variant === 'tab') {
      const group = groups.find((g) => g.id === action.groupId)
      const tab = group?.tabs.find((t) => t.id === action.tabId)
      if (group && tab && isTabFavorite(tab)) {
        openFavoriteTabTrashPrompt(group, tab)
        return
      }
    }
    setConfirmAction(action)
    setConfirmModalMounted(true)
  }

  function openEditTabTitleModal(action: Extract<EditTitleAction, { variant: 'tab' }>) {
    setEditTitleAction(action)
    setEditTitleDraft(action.title)
    setEditTitleModalMounted(true)
  }

  function openEditGroupTitleModal(groupId: string) {
    const group = groups.find((g) => g.id === groupId)
    if (!group) return
    const title =
      group.customTitle ?? formatShortDate(new Date(group.savedAt))
    setEditTitleAction({ variant: 'group', groupId, title })
    setEditTitleDraft(title)
    setEditTitleModalMounted(true)
  }

  function openRedirectToTabModal(action: RedirectToOpenTabAction) {
    setRedirectAction(action)
    setRedirectModalMounted(true)
  }

  async function handleOpenSavedTab(
    groupId: string,
    savedTabId: string,
    url: string,
    viewed: boolean,
  ) {
    const existing = await findOpenBrowserTab(url)
    if (existing?.id != null) {
      openRedirectToTabModal({
        chromeTabId: existing.id,
        groupId,
        tabId: savedTabId,
      })
      return
    }

    if (!viewed) setTabViewed(groupId, savedTabId, true)
    await chrome.tabs.create({ url, active: false })
  }

  async function confirmRedirectToOpenTab() {
    if (!redirectAction) return
    const { chromeTabId, groupId, tabId } = redirectAction

    const savedTab = groups
      .find((g) => g.id === groupId)
      ?.tabs.find((tab) => tab.id === tabId)
    if (savedTab && !savedTab.viewed) setTabViewed(groupId, tabId, true)

    try {
      const tab = await chrome.tabs.get(chromeTabId)
      await focusBrowserTab(tab)
    } catch {
      /* aba pode ter sido fechada antes da confirmação */
    }

    requestCloseRedirectModal()
  }

  const orderedGroups = useMemo(() => sortGroupsList(groups), [groups])

  const activeTagSet = useMemo(
    () => new Set(activeTagFilters),
    [activeTagFilters],
  )

  const tagIndex = useMemo(() => {
    const map = new Map<string, number>()
    for (const g of groups) {
      for (const t of g.tabs) {
        for (const tag of t.tags) {
          map.set(tag, (map.get(tag) ?? 0) + 1)
        }
      }
    }
    return [...map.entries()]
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => a.tag.localeCompare(b.tag, intlLocale))
  }, [groups, intlLocale])

  const viewedByDayMap = useMemo(
    () => buildDayViewedStatsByLocalDay(groups),
    [groups],
  )

  const sidebarCalendarDayButton = useMemo(
    () => createSidebarCalendarDayButton(viewedByDayMap),
    [viewedByDayMap],
  )

  const favoriteGroups = useMemo(
    () =>
      groups
        .map((g) => ({
          ...g,
          tabs: g.tabs.filter((t) => t.favorite === true),
        }))
        .filter((g) => g.tabs.length > 0),
    [groups],
  )

  const listSource = useMemo(() => {
    if (mainView === 'favorites') return sortGroupsList(favoriteGroups)
    return orderedGroups
  }, [mainView, favoriteGroups, orderedGroups])

  const visible = useMemo(
    () =>
      filterGroups(
        listSource,
        search,
        activeTagSet,
        mainView === 'saved' ? groupDateRange : undefined,
      ),
    [listSource, search, activeTagSet, groupDateRange, mainView],
  )

  const visibleTabs = useMemo(
    () => visible.reduce((n, g) => n + g.tabs.length, 0),
    [visible],
  )

  const visibleTrash = useMemo(() => {
    const needle = search.trim().toLowerCase()
    if (!needle) return trash
    return trash.filter((entry) =>
      entry.group.tabs.some(
        (t) =>
          t.title.toLowerCase().includes(needle) ||
          t.url.toLowerCase().includes(needle),
      ),
    )
  }, [trash, search])

  const visibleTrashByDay = useMemo(
    () => groupTrashEntriesBySavedDay(visibleTrash),
    [visibleTrash],
  )

  const favoriteTabCount = useMemo(
    () => favoriteGroups.reduce((n, g) => n + g.tabs.length, 0),
    [favoriteGroups],
  )

  const trashTabCount = useMemo(
    () => trash.reduce((n, e) => n + e.group.tabs.length, 0),
    [trash],
  )

  const mainViewTabCounts: Pick<Record<MainView, number>, 'favorites' | 'trash'> =
    {
      favorites: favoriteTabCount,
      trash: trashTabCount,
    }

  const duplicateTabCount = useMemo(
    () => countDuplicateTabs(groups),
    [groups],
  )

  const savedTabCount = useMemo(
    () => groups.reduce((n, g) => n + g.tabs.length, 0),
    [groups],
  )

  const viewedTabCount = useMemo(() => countViewedTabs(groups), [groups])

  const pruneByDateCount = useMemo(
    () => countTabsBeforeDate(groups, pruneBeforeDate),
    [groups, pruneBeforeDate],
  )

  const duplicateRemovalPreview = useMemo(() => {
    if (confirmAction?.variant !== 'remove-duplicates') return []
    return listDuplicateRemovalPreview(groups, dedupeKeepStrategy)
  }, [confirmAction, groups, dedupeKeepStrategy])

  const pruneByDatePreview = useMemo(() => {
    if (confirmAction?.variant !== 'prune-by-date') return []
    return listTabsBeforeDate(groups, pruneBeforeDate)
  }, [confirmAction, groups, pruneBeforeDate])

  const groupTrashTarget = useMemo(() => {
    if (confirmAction?.variant !== 'group') return null
    const group = groups.find((g) => g.id === confirmAction.groupId)
    if (!group) return null
    const allSplit = splitGroupTabsForTrash(group, 'all')
    const viewedSplit = splitGroupTabsForTrash(group, 'viewed-only')
    return {
      group,
      allAutoCount: allSplit.autoMove.length,
      allFavoriteCount: allSplit.favoritePrompt.length,
      viewedCount: viewedSplit.autoMove.length,
    }
  }, [confirmAction, groups])

  function dedupeEntryGroupLabel(entry: DuplicateRemovalEntry): string {
    return (
      entry.groupCustomTitle ??
      formatShortDate(new Date(entry.groupSavedAt))
    )
  }

  function pruneEntryGroupLabel(entry: PrunableTabEntry): string {
    return (
      entry.groupCustomTitle ??
      formatShortDate(new Date(entry.groupSavedAt))
    )
  }

  function setTabTags(groupId: string, tabId: string, tags: string[]) {
    persist(
      groups.map((g) =>
        g.id !== groupId
          ? g
          : {
              ...g,
              tabs: g.tabs.map((tab) =>
                tab.id === tabId ? { ...tab, tags } : tab,
              ),
            },
      ),
    )
  }

  function setTabTitle(groupId: string, tabId: string, title: string) {
    persist(
      groups.map((g) =>
        g.id !== groupId
          ? g
          : {
              ...g,
              tabs: g.tabs.map((tab) =>
                tab.id === tabId ? { ...tab, title } : tab,
              ),
            },
      ),
    )
  }

  function setTabViewed(groupId: string, tabId: string, viewed: boolean) {
    persist(
      groups.map((g) =>
        g.id !== groupId
          ? g
          : {
              ...g,
              tabs: g.tabs.map((tab) =>
                tab.id === tabId
                  ? { ...tab, viewed: viewed || undefined }
                  : tab,
              ),
            },
      ),
    )
  }

  function submitEditTitle() {
    if (!editTitleAction) return
    const title = editTitleDraft.trim()

    if (editTitleAction.variant === 'tab') {
      if (title && title !== editTitleAction.title) {
        setTabTitle(editTitleAction.groupId, editTitleAction.tabId, title)
      }
    } else {
      const group = groups.find((g) => g.id === editTitleAction.groupId)
      const previousCustom = group?.customTitle?.trim() ?? ''
      if (title !== previousCustom) {
        persist(
          groups.map((gr) =>
            gr.id === editTitleAction.groupId
              ? { ...gr, customTitle: title || undefined }
              : gr,
          ),
        )
      }
    }

    requestCloseEditTitleModal()
  }

  function exportGroups() {
    const payload = {
      app: 'Unique Tab Manager',
      version: GROUPS_EXPORT_VERSION,
      exportedAt: new Date().toISOString(),
      groups,
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const stamp = new Date().toISOString().slice(0, 10)
    a.href = url
    a.download = `onetab-manager-grupos-${stamp}.json`
    a.click()
    URL.revokeObjectURL(url)
    setGroupsImportStatus(t('status.exportGenerated'))
  }

  function requestCloseImportModal() {
    importModalOpenRef.current = false
    setImportModalOpen(false)
  }

  function handleImportModalBackdropTransitionEnd(
    e: React.TransitionEvent<HTMLDivElement>,
  ) {
    if (e.target !== e.currentTarget || e.propertyName !== 'opacity') return
    if (!importModalOpenRef.current) {
      setImportModalMounted(false)
      setPendingImport(null)
      if (pendingImportTrashAfterCloseRef.current) {
        pendingImportTrashAfterCloseRef.current = false
        setImportTrashModalMounted(true)
      }
    }
  }

  function requestCloseImportTrashModal() {
    importTrashModalOpenRef.current = false
    setImportTrashModalOpen(false)
  }

  function handleImportTrashModalBackdropTransitionEnd(
    e: React.TransitionEvent<HTMLDivElement>,
  ) {
    if (e.target !== e.currentTarget || e.propertyName !== 'opacity') return
    if (!importTrashModalOpenRef.current) {
      setImportTrashModalMounted(false)
      setPendingImportTrash(null)
    }
  }

  function finishGroupsImport(next: TabGroup[], statusMessage: string) {
    persist(next)
    setGroupsImportStatus(statusMessage)
    requestCloseImportModal()
    requestCloseImportTrashModal()
  }

  function finishImportReplace(groupsToImport: TabGroup[]) {
    const importedTabCount = groupsToImport.reduce(
      (total, group) => total + group.tabs.length,
      0,
    )
    finishGroupsImport(
      applyImportReplace(groupsToImport),
      t('status.importReplace', {
        groupCount: groupsToImport.length,
        tabCount: formatTabCount(importedTabCount),
      }),
    )
  }

  function finishImportAddMissing(groupsToImport: TabGroup[]) {
    const next = applyImportAddMissing(groupsRef.current, groupsToImport)
    const addedCount =
      next.reduce((total, group) => total + group.tabs.length, 0) -
      groupsRef.current.reduce((total, group) => total + group.tabs.length, 0)
    if (addedCount === 0) {
      setGroupsImportStatus(t('status.importNoNewTabs'))
      requestCloseImportModal()
      requestCloseImportTrashModal()
      return
    }
    finishGroupsImport(
      next,
      plural('plural.linkAdded', addedCount, { count: addedCount }),
    )
  }

  function beginImportExecution(mode: 'replace' | 'add-missing') {
    if (!pendingImport) return
    if (mode === 'add-missing' && pendingImport.preview.newTabCount === 0) return

    const { tabCount } = findImportTrashOverlap(
      pendingImport.groups,
      trashRef.current,
    )
    if (tabCount > 0) {
      setPendingImportTrash({
        groups: pendingImport.groups,
        preview: pendingImport.preview,
        mode,
        overlapCount: tabCount,
      })
      pendingImportTrashAfterCloseRef.current = true
      requestCloseImportModal()
      return
    }

    if (mode === 'replace') {
      finishImportReplace(pendingImport.groups)
    } else {
      finishImportAddMissing(pendingImport.groups)
    }
  }

  function executeImportWithTrashChoice(restoreFromTrash: boolean) {
    if (!pendingImportTrash) return

    const { groups: imported, mode } = pendingImportTrash
    const { urlKeys } = findImportTrashOverlap(imported, trashRef.current)
    const groupsToImport = restoreFromTrash
      ? imported
      : filterImportedGroupsByUrls(imported, urlKeys)

    if (restoreFromTrash && urlKeys.size > 0) {
      persistTrash(removeTabsFromTrashByUrlKeys(trashRef.current, urlKeys))
    }

    if (mode === 'replace') {
      finishImportReplace(groupsToImport)
    } else {
      finishImportAddMissing(groupsToImport)
    }
  }

  function executeImportReplace() {
    beginImportExecution('replace')
  }

  function executeImportAddMissing() {
    beginImportExecution('add-missing')
  }

  async function importGroupsFromFile(file: File) {
    try {
      const parsed = JSON.parse(await file.text()) as unknown
      const importedGroups = parseGroupsFromExportPayload(parsed)

      if (importedGroups.length === 0) {
        setGroupsImportStatus(t('status.importNoValidGroups'))
        return
      }

      const preview = buildImportPreview(groupsRef.current, importedGroups)
      setPendingImport({ groups: importedGroups, preview })
      setImportModalMounted(true)
    } catch {
      setGroupsImportStatus(t('status.importFailed'))
    }
  }

  function handleImportGroupsFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    void importGroupsFromFile(file)
  }

  function toggleExpanded(id: string) {
    const next = groups.map((g) =>
      g.id === id ? { ...g, expanded: !g.expanded } : g,
    )
    persist(next)
  }

  function toggleTrashDayExpanded(dayKey: string) {
    const bucket = trash.filter(
      (e) => trashDayKey(e.restore.savedAt) === dayKey,
    )
    if (bucket.length === 0) return
    const nextExpanded = !bucket.some((e) => e.group.expanded)
    persistTrash(
      trash.map((e) =>
        trashDayKey(e.restore.savedAt) !== dayKey
          ? e
          : { ...e, group: { ...e.group, expanded: nextExpanded } },
      ),
    )
  }

  function executeConfirmDelete() {
    const a = confirmAction
    if (!a) return
    if (a.variant === 'all') {
      persistTrash([...groups.map(createTrashedGroup), ...trash])
      persist([])
    } else if (a.variant === 'tab') {
      const group = groups.find((g) => g.id === a.groupId)
      const tab = group?.tabs.find((t) => t.id === a.tabId)
      if (group && tab) {
        persistTrash([createTrashedTab(group, tab), ...trash])
      }
      const next = groups
        .map((g) =>
          g.id === a.groupId
            ? { ...g, tabs: g.tabs.filter((t) => t.id !== a.tabId) }
            : g,
        )
        .filter((g) => g.tabs.length > 0)
      persist(next)
    } else if (a.variant === 'trash-entry') {
      persistTrash(trash.filter((e) => e.id !== a.trashId))
    } else if (a.variant === 'trash-all') {
      persistTrash([])
    }
    requestCloseConfirmModal()
  }

  function executeMoveGroupToTrash(groupId: string, scope: GroupTrashScope) {
    const group = groupsRef.current.find((g) => g.id === groupId)
    if (!group) return

    const { autoMove, favoritePrompt } = splitGroupTabsForTrash(group, scope)

    requestCloseConfirmModal()

    if (autoMove.length > 0) {
      const { groups: next, trashEntries } = applyPruneEntriesToTrash(
        groupsRef.current,
        autoMove,
      )
      persist(next)
      persistTrash([...trashEntries, ...trashRef.current])
    }

    if (favoritePrompt.length > 0) {
      favoritePruneStatsRef.current = null
      setFavoritePruneQueue(favoritePrompt)
      setFavoritePruneIndex(0)
      setFavoritePruneModalMounted(true)
    }
  }

  function executeRemoveDuplicates(keep: 'newest' | 'oldest') {
    const { groups: next, trashEntries, removedCount } = deduplicateGroups(
      groups,
      keep,
    )
    if (removedCount > 0) {
      persistTrash([...trashEntries, ...trash])
      persist(next)
      setGroupsImportStatus(
        plural('status.duplicateRemoved', removedCount, {
          count: removedCount,
          keepStrategy: t(
            `status.duplicateRemoved.keepStrategy.${keep === 'newest' ? 'newest' : 'oldest'}`,
          ),
        }),
      )
    }
    requestCloseConfirmModal()
  }

  function executePruneByDate() {
    if (!pruneBeforeDate) return

    const beforeDate = pruneBeforeDate
    const { autoMove, favoritePrompt } = splitTabsBeforeDate(
      groupsRef.current,
      beforeDate,
    )

    requestCloseConfirmModal()

    let autoMoved = 0
    if (autoMove.length > 0) {
      const { groups: next, trashEntries, removedCount } =
        applyPruneEntriesToTrash(groupsRef.current, autoMove)
      autoMoved = removedCount
      if (removedCount > 0) {
        persist(next)
        persistTrash([...trashEntries, ...trashRef.current])
      }
    }

    if (favoritePrompt.length > 0) {
      favoritePruneStatsRef.current = {
        beforeDate,
        autoMoved,
        favoriteMoved: 0,
        favoriteKept: 0,
      }
      setFavoritePruneQueue(favoritePrompt)
      setFavoritePruneIndex(0)
      setFavoritePruneModalMounted(true)
      return
    }

    const message = buildPruneByDateStatusMessage({
      beforeDate,
      autoMoved,
      favoriteMoved: 0,
      favoriteKept: 0,
    })
    if (message) setGroupsImportStatus(message)
  }

  function executeMoveViewedToTrash() {
    const { groups: next, trashEntries, removedCount } = moveViewedTabsToTrash(groups)
    if (removedCount > 0) {
      persistTrash([...trashEntries, ...trash])
      persist(next)
      setGroupsImportStatus(
        plural('status.viewedMoved', removedCount, { count: removedCount }),
      )
    }
    requestCloseConfirmModal()
  }

  function restoreTabFromTrash(trashId: string, tabId: string) {
    const entry = trash.find((e) => e.id === trashId)
    if (!entry) return

    const { groups: next, updatedEntry } = restoreSingleTabFromTrashedEntry(
      groups,
      entry,
      tabId,
    )
    persist(next.filter((g) => g.tabs.length > 0))
    persistTrash(
      updatedEntry
        ? trash.map((e) => (e.id === trashId ? updatedEntry : e))
        : trash.filter((e) => e.id !== trashId),
    )
  }

  function restoreTrashDay(dayKey: string) {
    const dayEntries = trash.filter(
      (e) => trashDayKey(e.restore.savedAt) === dayKey,
    )
    if (dayEntries.length === 0) return

    const next = restoreTrashedEntries(groups, dayEntries)
    persist(next.filter((g) => g.tabs.length > 0))
    persistTrash(
      trash.filter((e) => trashDayKey(e.restore.savedAt) !== dayKey),
    )
  }

  function toggleTabFavorite(groupId: string, tabId: string) {
    persist((current) =>
      current.map((g) =>
        g.id !== groupId
          ? g
          : {
              ...g,
              tabs: g.tabs.map((tab) =>
                tab.id !== tabId
                  ? tab
                  : {
                      ...tab,
                      favorite: tab.favorite ? undefined : true,
                    },
              ),
            },
      ),
    )
  }

  function togglePin(groupId: string) {
    persist(
      groups.map((g) =>
        g.id === groupId
          ? { ...g, pinned: !(g.pinned === true) }
          : g,
      ),
    )
  }

  async function openGroupTabs(groupId: string, tabs: SavedTab[]) {
    const unviewed = tabs.filter((t) => !t.viewed)
    if (unviewed.length === 0) return

    const unviewedIds = new Set(unviewed.map((t) => t.id))
    persist(
      groups.map((g) =>
        g.id !== groupId
          ? g
          : {
              ...g,
              tabs: g.tabs.map((tab) =>
                unviewedIds.has(tab.id) ? { ...tab, viewed: true } : tab,
              ),
            },
      ),
    )

    const openBrowserTabs = await chrome.tabs.query({})
    let activateNext = true
    for (const tab of unviewed) {
      const alreadyOpen = openBrowserTabs.some(
        (t) => typeof t.url === 'string' && tabUrlsMatch(tab.url, t.url),
      )
      if (alreadyOpen) continue

      await chrome.tabs.create({ url: tab.url, active: activateNext })
      activateNext = false
    }
  }

  return (
    <Fragment>
      <div className="shell">
      <header className="mobile-header">
        <div className="mobile-header-brand">
          <IconLogo />
          <div>
            <div className="mobile-header-title">{t('app.brandTitle')}</div>
            <div className="mobile-header-sub">{t('app.brandSub')}</div>
          </div>
        </div>
        <button
          type="button"
          className="mobile-menu-btn"
          aria-label={
            mobileSidebarOpen
              ? t('mobile.menu.close')
              : t('mobile.menu.open')
          }
          aria-expanded={mobileSidebarOpen}
          aria-controls="app-sidebar"
          onClick={() => setMobileSidebarOpen((open) => !open)}
        >
          {mobileSidebarOpen ? <IconClose /> : <IconMenu />}
        </button>
      </header>
      <button
        type="button"
        className={`sidebar-scrim${mobileSidebarOpen ? ' sidebar-scrim--open' : ''}`}
        aria-label={t('mobile.menu.close')}
        onClick={() => setMobileSidebarOpen(false)}
      />
      <aside
        id="app-sidebar"
        className={`sidebar${mobileSidebarOpen ? ' sidebar--open' : ''}`}
      >
        <div className="sidebar-scroll">
        <header className="sidebar-brand">
          <IconLogo />
          <div>
            <div className="brand-title">{t('app.brandTitle')}</div>
            <div className="brand-sub">{t('app.brandSub')}</div>
          </div>
        </header>

        <label className="search-wrap">
          <IconSearch />
          <input
            className="search-input"
            type="search"
            placeholder={t('search.placeholder')}
            value={search}
            onChange={(e) => {
              markLocalPreferencesEdit()
              setSearch(e.target.value)
            }}
            autoComplete="off"
          />
        </label>

        <div className="stats">
          <div className="stat-card">
            <div className="stat-value">
              {mainView === 'trash' ? visibleTrash.length : visible.length}
            </div>
            <div className="stat-label">
              {mainView === 'trash' ? t('stats.items') : t('stats.groups')}
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-value">
              {mainView === 'trash' ? trashTabCount : visibleTabs}
            </div>
            <div className="stat-label">{t('stats.tabs')}</div>
          </div>
        </div>

        <div className="sidebar-calendar-card">
          <DayPicker
            mode="range"
            selected={groupDateRange}
            onSelect={(range) => {
              markLocalPreferencesEdit()
              setGroupDateRange(range)
            }}
            locale={dateFnsLocale}
            weekStartsOn={1}
            showOutsideDays
            fixedWeeks
            className="sidebar-day-picker"
            components={{ DayButton: sidebarCalendarDayButton }}
          />
          {groupDateRange?.from ? (
            <div className="sidebar-calendar-footer">
              <button
                type="button"
                className="sidebar-calendar-clear"
                onClick={() => {
                  markLocalPreferencesEdit()
                  setGroupDateRange(undefined)
                }}
              >
                {t('calendar.clear')}
              </button>
            </div>
          ) : null}
        </div>

        <section className="sidebar-preferences" aria-label={t('preferences.ariaLabel')}>
          <SidebarDropdownSection
            id="appearance"
            title={t('preferences.appearance.title')}
            open={preferenceSectionsOpen.appearance}
            onToggle={() => togglePreferenceSection('appearance')}
          >
              <div className="sidebar-toggle-row">
                <span
                  className="sidebar-toggle-row-label"
                  id="theme-switch-label"
                >
                  {t('preferences.appearance.darkMode')}
                </span>
                <button
                  ref={themeSwitchRef}
                  type="button"
                  className="theme-switch"
                  role="switch"
                  aria-checked={darkMode}
                  aria-labelledby="theme-switch-label"
                  onClick={() => {
                    markLocalPreferencesEdit()
                    void toggleThemeWithViewTransition(
                      setDarkMode,
                      !darkMode,
                      themeSwitchRef.current,
                    )
                  }}
                >
                  <span className="theme-switch__knob" aria-hidden />
                </button>
              </div>
              <div className="sidebar-section-divider" role="separator" aria-hidden />
              <div className="sidebar-toggle-row">
                <span
                  className="sidebar-toggle-row-label"
                  id="compact-mode-switch-label"
                >
                  {t('preferences.appearance.compactMode')}
                </span>
                <button
                  type="button"
                  className="theme-switch"
                  role="switch"
                  aria-checked={simpleLayout}
                  aria-labelledby="compact-mode-switch-label"
                  onClick={() => {
                    markLocalPreferencesEdit()
                    setSimpleLayout((v) => !v)
                  }}
                >
                  <span className="theme-switch__knob" aria-hidden />
                </button>
              </div>
              <div className="sidebar-section-divider" role="separator" aria-hidden />
              <div className="sidebar-locale-field">
                <label className="sidebar-locale-label" htmlFor="locale-select">
                  {t('preferences.appearance.language')}
                </label>
                <div className="sidebar-locale-select-wrap">
                  <select
                    id="locale-select"
                    className="sidebar-locale-select"
                    value={locale}
                    onChange={(e) => {
                      markLocalPreferencesEdit()
                      setLocale(e.target.value as SupportedLocale)
                    }}
                  >
                    {SUPPORTED_LOCALES.map((l) => (
                      <option key={l} value={l}>
                        {t(`locale.${l}`)}
                      </option>
                    ))}
                  </select>
                  <span className="sidebar-locale-select-chevron" aria-hidden>
                    <IconChevron open={false} />
                  </span>
                </div>
              </div>
          </SidebarDropdownSection>

          <SidebarDropdownSection
            id="backup"
            title={t('preferences.backup.title')}
            open={preferenceSectionsOpen.backup}
            onToggle={() => togglePreferenceSection('backup')}
          >
            <div className="sidebar-action-list">
                <button
                  type="button"
                  className="sidebar-action-row"
                  onClick={exportGroups}
                  disabled={groups.length === 0}
                >
                  <span className="sidebar-action-row-icon" aria-hidden>
                    <IconDownload />
                  </span>
                  <span className="sidebar-action-row-body">
                    <span className="sidebar-action-row-label">
                      {t('preferences.backup.export.label')}
                    </span>
                    <span className="sidebar-action-row-hint">
                      {t('preferences.backup.export.hint')}
                    </span>
                  </span>
                </button>
                <div
                  className="sidebar-section-divider"
                  role="separator"
                  aria-hidden
                />
                <button
                  type="button"
                  className="sidebar-action-row"
                  onClick={() => importGroupsInputRef.current?.click()}
                >
                  <span className="sidebar-action-row-icon" aria-hidden>
                    <IconUpload />
                  </span>
                  <span className="sidebar-action-row-body">
                    <span className="sidebar-action-row-label">
                      {t('preferences.backup.import.label')}
                    </span>
                    <span className="sidebar-action-row-hint">
                      {t('preferences.backup.import.hint')}
                    </span>
                  </span>
                </button>
              </div>
              <input
                ref={importGroupsInputRef}
                className="sidebar-transfer-input"
                type="file"
                accept="application/json,.json"
                onChange={handleImportGroupsFile}
              />
            {groupsImportStatus ? (
              <p className="sidebar-section-footnote">{groupsImportStatus}</p>
            ) : null}
          </SidebarDropdownSection>

          <SidebarDropdownSection
            id="exclusion"
            title={t('preferences.exclusion.title')}
            open={preferenceSectionsOpen.exclusion}
            onToggle={() => togglePreferenceSection('exclusion')}
          >
            <div className="sidebar-action-list">
              <button
                type="button"
                className="sidebar-action-row"
                disabled={duplicateTabCount === 0}
                onClick={() => openConfirmDeleteModal({ variant: 'remove-duplicates' })}
              >
                <span className="sidebar-action-row-icon" aria-hidden>
                  <IconDedupe />
                </span>
                <span className="sidebar-action-row-body">
                  <span className="sidebar-action-row-label">
                    {t('preferences.exclusion.removeDuplicates.label')}
                  </span>
                  <span className="sidebar-action-row-hint">
                    {plural('misc.duplicateUrl', duplicateTabCount, {
                      count: duplicateTabCount,
                    })}
                  </span>
                </span>
              </button>
              <div className="sidebar-section-divider" role="separator" aria-hidden />
              <button
                type="button"
                className="sidebar-action-row"
                disabled={savedTabCount === 0}
                onClick={() => openConfirmDeleteModal({ variant: 'prune-by-date' })}
              >
                <span className="sidebar-action-row-icon" aria-hidden>
                  <IconCalendarPeriod />
                </span>
                <span className="sidebar-action-row-body">
                  <span className="sidebar-action-row-label">
                    {t('preferences.exclusion.pruneByDate.label')}
                  </span>
                  <span className="sidebar-action-row-hint">
                    {t('preferences.exclusion.pruneByDate.hint')}
                  </span>
                </span>
              </button>
              <div className="sidebar-section-divider" role="separator" aria-hidden />
              <button
                type="button"
                className="sidebar-action-row sidebar-action-row--danger"
                disabled={groups.length === 0}
                onClick={() => openConfirmDeleteModal({ variant: 'all' })}
              >
                <span
                  className="sidebar-action-row-icon sidebar-action-row-icon--danger"
                  aria-hidden
                >
                  <IconTrash />
                </span>
                <span className="sidebar-action-row-body">
                  <span className="sidebar-action-row-label">
                    {t('preferences.exclusion.moveToTrash.label')}
                  </span>
                  <span className="sidebar-action-row-hint">
                    {t('preferences.exclusion.moveToTrash.hint')}
                  </span>
                </span>
              </button>
            </div>
          </SidebarDropdownSection>
        </section>

        <p className="sidebar-hint">
          {t('sidebar.hint.saveTab')}{' '}
          <strong>{t('sidebar.hint.openList')}</strong>.
        </p>
        </div>

        <footer className="sidebar-footer" aria-label={t('sidebar.footer.ariaLabel')}>
          <p className="sidebar-hint">{t('sidebar.footer.localOnly')}</p>
        </footer>
      </aside>

      <main className={`main${simpleLayout ? ' main--simple' : ''}`}>
        <div className="main-tabs-wrap">
          <nav className="main-tabs" role="tablist" aria-label={t('mainView.ariaLabel')}>
            <div className="main-tabs-slider" aria-hidden>
              <div
                className="main-tabs-slider-rect"
                style={{
                  transform: `translateX(${MAIN_VIEWS.indexOf(mainView) * 100}%)`,
                }}
              />
            </div>
            <div className="main-tabs-list">
              {MAIN_VIEWS.map((view) => (
                <button
                  key={view}
                  type="button"
                  role="tab"
                  className={`main-tab${mainView === view ? ' main-tab--active' : ''}`}
                  aria-selected={mainView === view}
                  onClick={() => setMainView(view)}
                >
                  <span className="main-tab-leading">
                    <span className="main-tab-icon" aria-hidden>
                      <MainViewTabIcon view={view} />
                    </span>
                    {view !== 'saved' && mainViewTabCounts[view] > 0 ? (
                      <span className="main-tab-badge">
                        {mainViewTabCounts[view]}
                      </span>
                    ) : null}
                  </span>
                  <span className="main-tab-label main-tab-label--long">
                    {t(`mainView.${view}`)}
                  </span>
                  <span className="main-tab-label main-tab-label--short">
                    {t(`mainView.${view}Short`)}
                  </span>
                </button>
              ))}
            </div>
          </nav>
        </div>

        {mainView === 'trash' && trash.length > 0 ? (
          <div className="trash-toolbar">
            <button
              type="button"
              className="btn btn-outline btn-danger trash-toolbar-btn"
              onClick={() => openConfirmDeleteModal({ variant: 'trash-all' })}
            >
              <IconTrash />
              {t('trash.emptyAll')}
            </button>
          </div>
        ) : null}

        {mainView !== 'trash' && tagIndex.length > 0 ? (
          <section
            className="tag-filter-bar"
            aria-label={t('tagFilter.ariaLabel')}
          >
            <div className="tag-filter-bar-head">
              <span className="tag-filter-title">{t('tagFilter.title')}</span>
              {activeTagFilters.length > 0 ? (
                <button
                  type="button"
                  className="tag-filter-clear"
                  onClick={() => {
                    markLocalPreferencesEdit()
                    setActiveTagFilters([])
                  }}
                >
                  {t('tagFilter.clear')}
                </button>
              ) : null}
            </div>
            <div className="tag-filter-pills">
              {tagIndex.map(({ tag, count }) => {
                const on = activeTagFilters.includes(tag)
                return (
                  <button
                    key={tag}
                    type="button"
                    className={`tag-filter-pill${on ? ' tag-filter-pill--active' : ''}`}
                    aria-pressed={on}
                    onClick={() => {
                      markLocalPreferencesEdit()
                      setActiveTagFilters((prev) =>
                        prev.includes(tag)
                          ? prev.filter((x) => x !== tag)
                          : [...prev, tag],
                      )
                    }}
                  >
                    {tag}
                    <span className="tag-filter-pill-count">{count}</span>
                  </button>
                )
              })}
            </div>
            {activeTagFilters.length > 1 ? (
              <p className="tag-filter-hint">
                {t('tagFilter.multiTagHint').split(
                  t('tagFilter.multiTagHint.emphasis'),
                )[0]}
                <strong>{t('tagFilter.multiTagHint.emphasis')}</strong>
                {t('tagFilter.multiTagHint').split(
                  t('tagFilter.multiTagHint.emphasis'),
                )[1]}
              </p>
            ) : null}
          </section>
        ) : null}

        <div className="group-list">
          {mainView === 'trash' ? (
            visibleTrash.length === 0 ? (
              <div className="empty-state">
                {trash.length === 0
                  ? t('trash.empty')
                  : t('trash.emptySearch')}
              </div>
            ) : (
              visibleTrashByDay.map((day) => {
                const expanded = isTrashDayExpanded(day)
                const tabCount = trashDayTabCount(day)
                const deleted = trashDayLatestDeletedAt(day)
                const groupTitle =
                  day.customTitle ??
                  formatShortDate(new Date(day.savedAt))
                return (
                  <article
                    key={day.dayKey}
                    className={`group-card group-card--trash${simpleLayout ? ' group-card--simple' : ''}`}
                  >
                    <div className="group-header">
                      <button
                        type="button"
                        className="group-header-lead"
                        id={`trash-header-${day.dayKey}`}
                        title={
                          expanded ? t('trash.collapse') : t('trash.expand')
                        }
                        onClick={() => toggleTrashDayExpanded(day.dayKey)}
                        aria-expanded={expanded}
                        aria-controls={`trash-panel-${day.dayKey}`}
                      >
                        <IconChevron open={expanded} />
                        <span className="group-folder-icon" aria-hidden>
                          <IconFolder />
                        </span>
                        <span className="group-date" title={groupTitle}>
                          {groupTitle}
                        </span>
                      </button>
                      <div className="group-header-meta">
                        <IconClock />
                        <span>
                          {t('trash.deletedMeta', {
                            relativeAgo: formatRelativeAgo(deleted),
                            tabCount: formatTabCount(tabCount),
                          })}
                        </span>
                      </div>
                      <span className="group-badge">{tabCount}</span>
                      <div className="group-header-tools">
                        <button
                          type="button"
                          className="group-tool-btn"
                          aria-label={t('trash.restoreDay')}
                          title={t('trash.restoreDay')}
                          onClick={(e) => {
                            e.stopPropagation()
                            restoreTrashDay(day.dayKey)
                          }}
                        >
                          <IconRestore />
                        </button>
                      </div>
                    </div>
                    <div
                      className={`group-accordion${expanded ? ' group-accordion--open' : ''}`}
                      id={`trash-panel-${day.dayKey}`}
                      role="region"
                      aria-labelledby={`trash-header-${day.dayKey}`}
                    >
                      <div
                        className="group-accordion-inner"
                        inert={!expanded}
                      >
                        <div className="group-body">
                          {day.entries.map((entry) =>
                            entry.group.tabs.map((tab) => (
                              <TabRow
                                key={`${entry.id}-${tab.id}`}
                                tab={tab}
                                simpleLayout={simpleLayout}
                                existingTagOptions={[]}
                                tagsReadOnly
                                removeLabel={t('tab.remove.deletePermanent')}
                                onRequestRemove={() =>
                                  openConfirmDeleteModal({
                                    variant: 'trash-entry',
                                    trashId: entry.id,
                                  })
                                }
                                onSetTags={() => {}}
                                onRequestEditTitle={() =>
                                  openEditTabTitleModal({
                                    variant: 'tab',
                                    groupId: entry.restore.groupId,
                                    tabId: tab.id,
                                    title: tab.title,
                                  })
                                }
                                onOpenTab={() =>
                                  void handleOpenSavedTab(
                                    entry.restore.groupId,
                                    tab.id,
                                    tab.url,
                                    tab.viewed === true,
                                  )
                                }
                                onToggleViewed={() =>
                                  setTabViewed(
                                    entry.restore.groupId,
                                    tab.id,
                                    !tab.viewed,
                                  )
                                }
                                onRestore={() => restoreTabFromTrash(entry.id, tab.id)}
                              />
                            )),
                          )}
                        </div>
                      </div>
                    </div>
                  </article>
                )
              })
            )
          ) : visible.length === 0 ? (
            <div className="empty-state">
              {mainView === 'favorites'
                ? favoriteGroups.length === 0
                  ? t('empty.favorites.none')
                  : search.trim() !== '' || activeTagFilters.length > 0
                    ? t('empty.favorites.noResults')
                    : t('empty.generic')
                : groups.length === 0
                  ? t('empty.saved.none')
                  : search.trim() !== '' ||
                      activeTagFilters.length > 0 ||
                      groupDateRange?.from
                    ? t('empty.saved.noResults')
                    : t('empty.generic')}
            </div>
          ) : (
            visible.map((g) => {
              const saved = new Date(g.savedAt)
              return (
                <article
                  key={g.id}
                  className={`group-card${simpleLayout ? ' group-card--simple' : ''}`}
                >
                  <div className="group-header">
                    {(() => {
                      const groupTitle =
                        g.customTitle ?? formatShortDate(saved)
                      return (
                    <button
                      type="button"
                      className="group-header-lead"
                      id={`group-header-${g.id}`}
                      title={
                        g.expanded
                          ? t('group.collapse')
                          : t('group.expand')
                      }
                      onClick={() => toggleExpanded(g.id)}
                      aria-expanded={g.expanded}
                      aria-controls={`group-panel-${g.id}`}
                    >
                      <IconChevron open={g.expanded} />
                      <span className="group-folder-icon" aria-hidden>
                        <IconFolder />
                      </span>
                      <span className="group-date" title={groupTitle}>
                        {groupTitle}
                      </span>
                    </button>
                      )
                    })()}
                    <div className="group-header-meta">
                      <IconClock />
                      <span>{formatGroupMetaLine(saved)}</span>
                    </div>
                    <span className="group-badge">{g.tabs.length}</span>
                    <div className="group-header-tools">
                      <button
                        type="button"
                        className="group-tool-btn"
                        aria-label={
                          g.pinned ? t('group.unpin') : t('group.pin')
                        }
                        title={g.pinned ? t('group.unpin') : t('group.pin')}
                        onClick={(e) => {
                          e.stopPropagation()
                          togglePin(g.id)
                        }}
                      >
                        <IconPin pinned={g.pinned === true} />
                      </button>
                      <button
                        type="button"
                        className="group-tool-btn"
                        aria-label={t('group.openUnviewed')}
                        title={t('group.openUnviewed')}
                        onClick={(e) => {
                          e.stopPropagation()
                          void openGroupTabs(g.id, g.tabs)
                        }}
                      >
                        <IconOpenTabs />
                      </button>
                      <button
                        type="button"
                        className="group-tool-btn"
                        aria-label={t('group.editName')}
                        title={t('group.editName')}
                        onClick={(e) => {
                          e.stopPropagation()
                          openEditGroupTitleModal(g.id)
                        }}
                      >
                        <IconPencil />
                      </button>
                      <button
                        type="button"
                        className="group-tool-btn group-tool-btn--danger"
                        aria-label={t('group.moveToTrash')}
                        title={t('group.moveToTrash')}
                        onClick={(e) => {
                          e.stopPropagation()
                          openConfirmDeleteModal({
                            variant: 'group',
                            groupId: g.id,
                          })
                        }}
                      >
                        <IconTrash />
                      </button>
                    </div>
                  </div>
                  <div
                    className={`group-accordion${g.expanded ? ' group-accordion--open' : ''}`}
                    id={`group-panel-${g.id}`}
                    role="region"
                    aria-labelledby={`group-header-${g.id}`}
                  >
                    <div
                      className="group-accordion-inner"
                      inert={!g.expanded}
                    >
                      <div className="group-body">
                        {g.tabs.map((tab) => (
                          <TabRow
                            key={tab.id}
                            tab={tab}
                            simpleLayout={simpleLayout}
                            existingTagOptions={tagIndex.map((x) => x.tag)}
                            removeLabel={t('tab.remove.moveToTrash')}
                            onRequestRemove={() =>
                              openConfirmDeleteModal({
                                variant: 'tab',
                                groupId: g.id,
                                tabId: tab.id,
                              })
                            }
                            onSetTags={(tags) => setTabTags(g.id, tab.id, tags)}
                            onRequestEditTitle={() =>
                              openEditTabTitleModal({
                                variant: 'tab',
                                groupId: g.id,
                                tabId: tab.id,
                                title: tab.title,
                              })
                            }
                            onOpenTab={() =>
                              void handleOpenSavedTab(
                                g.id,
                                tab.id,
                                tab.url,
                                tab.viewed === true,
                              )
                            }
                            onToggleViewed={() =>
                              setTabViewed(g.id, tab.id, !tab.viewed)
                            }
                            showFavorite
                            onToggleFavorite={() =>
                              toggleTabFavorite(g.id, tab.id)
                            }
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </article>
              )
            })
          )}
        </div>
      </main>
    </div>

      {editTitleModalMounted && editTitleAction
        ? createPortal(
            <div
              className={`modal-backdrop${editTitleModalOpen ? ' modal-backdrop--open' : ''}`}
              role="presentation"
              onClick={requestCloseEditTitleModal}
              onTransitionEnd={handleEditTitleModalBackdropTransitionEnd}
            >
              <form
                className="modal-dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby="edit-title-modal-title"
                aria-describedby="edit-title-modal-desc"
                onClick={(e) => e.stopPropagation()}
                onSubmit={(e) => {
                  e.preventDefault()
                  submitEditTitle()
                }}
              >
                <h2 id="edit-title-modal-title" className="modal-title">
                  {editTitleAction.variant === 'group'
                    ? t('editTitle.group.title')
                    : t('editTitle.tab.title')}
                </h2>
                <p id="edit-title-modal-desc" className="modal-body">
                  {editTitleAction.variant === 'group'
                    ? t('editTitle.group.body')
                    : t('editTitle.tab.body')}
                </p>
                <label className="modal-field">
                  <span className="modal-field-label">
                    {editTitleAction.variant === 'group'
                      ? t('editTitle.group.fieldLabel')
                      : t('editTitle.tab.fieldLabel')}
                  </span>
                  <input
                    ref={editTitleInputRef}
                    className="modal-input"
                    type="text"
                    value={editTitleDraft}
                    onChange={(e) => setEditTitleDraft(e.target.value)}
                    maxLength={editTitleAction.variant === 'group' ? 120 : 160}
                  />
                </label>
                <div className="modal-actions">
                  <button
                    type="button"
                    className="btn btn-outline modal-btn"
                    onClick={requestCloseEditTitleModal}
                  >
                    {t('editTitle.cancel')}
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary modal-btn"
                    disabled={
                      editTitleAction.variant === 'tab' &&
                      editTitleDraft.trim().length === 0
                    }
                  >
                    {t('editTitle.save')}
                  </button>
                </div>
              </form>
            </div>,
            document.body,
          )
        : null}

      {redirectModalMounted && redirectAction
        ? createPortal(
            <div
              className={`modal-backdrop${redirectModalOpen ? ' modal-backdrop--open' : ''}`}
              role="presentation"
              onClick={requestCloseRedirectModal}
              onTransitionEnd={handleRedirectModalBackdropTransitionEnd}
            >
              <div
                className="modal-dialog"
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="redirect-modal-title"
                aria-describedby="redirect-modal-desc"
                onClick={(e) => e.stopPropagation()}
              >
                <h2 id="redirect-modal-title" className="modal-title">
                  {t('redirect.title')}
                </h2>
                <p id="redirect-modal-desc" className="modal-body">
                  {t('redirect.body')}
                </p>
                <div className="modal-actions">
                  <button
                    type="button"
                    className="btn btn-outline modal-btn"
                    onClick={requestCloseRedirectModal}
                  >
                    {t('redirect.cancel')}
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary modal-btn"
                    onClick={() => void confirmRedirectToOpenTab()}
                  >
                    {t('redirect.confirm')}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {favoritePruneModalMounted && favoritePruneQueue[favoritePruneIndex]
        ? createPortal(
            <div
              className={`modal-backdrop${favoritePruneModalOpen ? ' modal-backdrop--open' : ''}`}
              role="presentation"
              onClick={() => answerFavoritePrune(false)}
              onTransitionEnd={handleFavoritePruneModalBackdropTransitionEnd}
            >
              <div
                className="modal-dialog modal-dialog--dedupe"
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="favorite-prune-modal-title"
                aria-describedby="favorite-prune-modal-desc"
                onClick={(e) => e.stopPropagation()}
              >
                <h2 id="favorite-prune-modal-title" className="modal-title">
                  {t('favoritePrune.title')}
                </h2>
                <p id="favorite-prune-modal-desc" className="modal-body">
                  {t('favoritePrune.body')}
                  {favoritePruneQueue.length > 1 ? (
                    <>
                      {' '}
                      {t('favoritePrune.progress', {
                        current: favoritePruneIndex + 1,
                        total: favoritePruneQueue.length,
                      })}
                    </>
                  ) : null}
                </p>
                <div className="favorite-prune-preview">
                  <img
                    className="dedupe-preview-favicon"
                    src={faviconUrl(favoritePruneQueue[favoritePruneIndex].tab.url)}
                    alt=""
                    width={24}
                    height={24}
                    loading="lazy"
                  />
                  <div className="dedupe-preview-text">
                    <span
                      className="dedupe-preview-title"
                      title={favoritePruneQueue[favoritePruneIndex].tab.title}
                    >
                      {favoritePruneQueue[favoritePruneIndex].tab.title}
                    </span>
                    <span className="dedupe-preview-meta">
                      {favoritePruneQueue[favoritePruneIndex].urlLabel}
                      <span aria-hidden> · </span>
                      {pruneEntryGroupLabel(favoritePruneQueue[favoritePruneIndex])}
                    </span>
                  </div>
                </div>
                <div className="modal-actions">
                  <button
                    type="button"
                    className="btn btn-outline modal-btn"
                    onClick={() => answerFavoritePrune(false)}
                  >
                    {t('favoritePrune.keep')}
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger-solid modal-btn"
                    onClick={() => answerFavoritePrune(true)}
                  >
                    <IconTrash />
                    {t('favoritePrune.moveToTrash')}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {confirmModalMounted && confirmAction
        ? createPortal(
            <div
              className={`modal-backdrop${confirmModalOpen ? ' modal-backdrop--open' : ''}`}
              role="presentation"
              onClick={requestCloseConfirmModal}
              onTransitionEnd={handleConfirmModalBackdropTransitionEnd}
            >
              <div
                className={`modal-dialog${confirmAction.variant === 'remove-duplicates' || confirmAction.variant === 'prune-by-date' ? ' modal-dialog--dedupe' : ''}${confirmAction.variant === 'all' || confirmAction.variant === 'group' ? ' modal-dialog--import' : ''}`}
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="confirm-modal-title"
                aria-describedby="confirm-modal-desc"
                onClick={(e) => e.stopPropagation()}
              >
                <h2 id="confirm-modal-title" className="modal-title">
                  {confirmCopy.title}
                </h2>
                <p id="confirm-modal-desc" className="modal-body">
                  {confirmCopy.body}
                </p>
                {confirmAction.variant === 'remove-duplicates' ? (
                  <>
                    <div
                      className="dedupe-keep-toggle"
                      role="group"
                      aria-label={t('confirm.removeDuplicates.keepStrategy.ariaLabel')}
                    >
                      <button
                        type="button"
                        className={`dedupe-keep-btn${dedupeKeepStrategy === 'newest' ? ' dedupe-keep-btn--active' : ''}`}
                        aria-pressed={dedupeKeepStrategy === 'newest'}
                        onClick={() => setDedupeKeepStrategy('newest')}
                      >
                        {t('confirm.removeDuplicates.keepStrategy.newest')}
                      </button>
                      <button
                        type="button"
                        className={`dedupe-keep-btn${dedupeKeepStrategy === 'oldest' ? ' dedupe-keep-btn--active' : ''}`}
                        aria-pressed={dedupeKeepStrategy === 'oldest'}
                        onClick={() => setDedupeKeepStrategy('oldest')}
                      >
                        {t('confirm.removeDuplicates.keepStrategy.oldest')}
                      </button>
                    </div>
                    <ul
                      className="dedupe-preview-list"
                      aria-label={t('confirm.removeDuplicates.preview.ariaLabel')}
                    >
                      {duplicateRemovalPreview.map((entry) => (
                        <li key={entry.tab.id} className="dedupe-preview-item">
                          <button
                            type="button"
                            className="dedupe-preview-open"
                            title={entry.urlKey}
                            onClick={() =>
                              void handleOpenSavedTab(
                                entry.groupId,
                                entry.tab.id,
                                entry.tab.url,
                                entry.tab.viewed === true,
                              )
                            }
                          >
                            <img
                              className="dedupe-preview-favicon"
                              src={faviconUrl(entry.tab.url)}
                              alt=""
                              width={20}
                              height={20}
                              loading="lazy"
                            />
                            <div className="dedupe-preview-text">
                              <span
                                className="dedupe-preview-title"
                                title={entry.tab.title}
                              >
                                {entry.tab.title}
                              </span>
                              <span className="dedupe-preview-meta">
                                {entry.urlLabel}
                                <span aria-hidden> · </span>
                                {dedupeEntryGroupLabel(entry)}
                              </span>
                            </div>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : null}
                {confirmAction.variant === 'group' && groupTrashTarget ? (
                  <div
                    className="import-choice-list"
                    role="group"
                    aria-label={t('confirm.moveGroup.ariaLabel')}
                  >
                    <button
                      type="button"
                      className="import-choice-btn import-choice-btn--danger"
                      disabled={groupTrashTarget.group.tabs.length === 0}
                      onClick={() =>
                        executeMoveGroupToTrash(confirmAction.groupId, 'all')
                      }
                    >
                      <span className="import-choice-btn__title">
                        {t('confirm.moveGroup.choice.moveAll.title')}
                      </span>
                      <span className="import-choice-btn__hint">
                        {groupTrashTarget.group.tabs.length === 0
                          ? t('confirm.moveGroup.choice.moveAll.hint.empty')
                          : groupTrashTarget.allFavoriteCount === 0
                            ? plural(
                                'confirm.moveGroup.choice.moveAll.hint.noFavorites',
                                groupTrashTarget.group.tabs.length,
                                {
                                  tabCount: formatTabCount(
                                    groupTrashTarget.group.tabs.length,
                                  ),
                                },
                              )
                            : plural(
                                'confirm.moveGroup.choice.moveAll.hint.withFavorites',
                                groupTrashTarget.allAutoCount,
                                {
                                  autoCount: formatTabCount(
                                    groupTrashTarget.allAutoCount,
                                  ),
                                  favoriteCount: groupTrashTarget.allFavoriteCount,
                                },
                              )}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="import-choice-btn import-choice-btn--primary"
                      disabled={groupTrashTarget.viewedCount === 0}
                      onClick={() =>
                        executeMoveGroupToTrash(
                          confirmAction.groupId,
                          'viewed-only',
                        )
                      }
                    >
                      <span className="import-choice-btn__title">
                        {t('confirm.moveGroup.choice.moveViewed.title')}
                      </span>
                      <span className="import-choice-btn__hint">
                        {groupTrashTarget.viewedCount === 0
                          ? t('confirm.moveGroup.choice.moveViewed.hint.zero')
                          : plural(
                              'confirm.moveGroup.choice.moveViewed.hint',
                              groupTrashTarget.viewedCount,
                              {
                                tabCount: formatTabCount(
                                  groupTrashTarget.viewedCount,
                                ),
                              },
                            )}
                      </span>
                    </button>
                  </div>
                ) : null}
                {confirmAction.variant === 'all' ? (
                  <div
                    className="import-choice-list"
                    role="group"
                    aria-label={t('confirm.moveAll.ariaLabel')}
                  >
                    <button
                      type="button"
                      className="import-choice-btn import-choice-btn--danger"
                      onClick={executeConfirmDelete}
                    >
                      <span className="import-choice-btn__title">
                        {t('confirm.moveAll.choice.moveAll.title')}
                      </span>
                      <span className="import-choice-btn__hint">
                        {groups.length === 0
                          ? t('confirm.moveAll.choice.moveAll.hint.zero')
                          : plural('confirm.moveAll.choice.moveAll.hint', groups.length, {
                              groupCount: groups.length,
                              tabCount: formatTabCount(savedTabCount),
                            })}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="import-choice-btn import-choice-btn--primary"
                      disabled={viewedTabCount === 0}
                      onClick={executeMoveViewedToTrash}
                    >
                      <span className="import-choice-btn__title">
                        {t('confirm.moveAll.choice.moveViewed.title')}
                      </span>
                      <span className="import-choice-btn__hint">
                        {viewedTabCount === 0
                          ? t('confirm.moveAll.choice.moveViewed.hint.zero')
                          : plural(
                              'confirm.moveAll.choice.moveViewed.hint',
                              viewedTabCount,
                              { tabCount: formatTabCount(viewedTabCount) },
                            )}
                      </span>
                    </button>
                  </div>
                ) : null}
                {confirmAction.variant === 'prune-by-date' ? (
                  <>
                    <div className="modal-field modal-field--prune-date">
                      <ModalDatePicker
                        label={t('confirm.pruneByDate.dateLabel')}
                        value={pruneBeforeDate}
                        maxDate={new Date()}
                        onChange={setPruneBeforeDate}
                      />
                    </div>
                    {pruneByDatePreview.length > 0 ? (
                      <ul
                        className="dedupe-preview-list"
                        aria-label={t('confirm.pruneByDate.preview.ariaLabel')}
                      >
                        {pruneByDatePreview.map((entry) => (
                          <li key={entry.tab.id} className="dedupe-preview-item">
                            <button
                              type="button"
                              className="dedupe-preview-open"
                              title={entry.tab.url}
                              onClick={() =>
                                void handleOpenSavedTab(
                                  entry.groupId,
                                  entry.tab.id,
                                  entry.tab.url,
                                  entry.tab.viewed === true,
                                )
                              }
                            >
                              <img
                                className="dedupe-preview-favicon"
                                src={faviconUrl(entry.tab.url)}
                                alt=""
                                width={20}
                                height={20}
                                loading="lazy"
                              />
                              <div className="dedupe-preview-text">
                                <span
                                  className="dedupe-preview-title"
                                  title={entry.tab.title}
                                >
                                  {entry.tab.title}
                                </span>
                                <span className="dedupe-preview-meta">
                                  {entry.urlLabel}
                                  <span aria-hidden> · </span>
                                  {pruneEntryGroupLabel(entry)}
                                  {isTabFavorite(entry.tab) ? (
                                    <>
                                      <span aria-hidden> · </span>
                                      {t('confirm.pruneByDate.preview.favoriteNote')}
                                    </>
                                  ) : null}
                                </span>
                              </div>
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </>
                ) : null}
                <div className="modal-actions">
                  <button
                    type="button"
                    className="btn btn-outline modal-btn"
                    onClick={requestCloseConfirmModal}
                  >
                    {t('confirm.common.cancel')}
                  </button>
                  {confirmAction.variant === 'remove-duplicates' ? (
                    <button
                      type="button"
                      className="btn btn-danger-solid modal-btn"
                      onClick={() =>
                        executeRemoveDuplicates(dedupeKeepStrategy)
                      }
                    >
                      <IconDedupe />
                      {t('confirm.removeDuplicates.confirmLabel')}
                    </button>
                  ) : confirmAction.variant === 'prune-by-date' ? (
                    <button
                      type="button"
                      className="btn btn-danger-solid modal-btn"
                      disabled={!pruneBeforeDate || pruneByDateCount === 0}
                      onClick={executePruneByDate}
                    >
                      <IconCalendarPeriod />
                      {t('confirm.pruneByDate.confirmLabel')}
                    </button>
                  ) : confirmAction.variant === 'all' ||
                    confirmAction.variant === 'group' ? null : (
                    <button
                      type="button"
                      className="btn btn-danger-solid modal-btn"
                      onClick={executeConfirmDelete}
                    >
                      {confirmCopy.confirmLabel}
                    </button>
                  )}
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {importModalMounted && pendingImport
        ? createPortal(
            <div
              className={`modal-backdrop${importModalOpen ? ' modal-backdrop--open' : ''}`}
              role="presentation"
              onClick={requestCloseImportModal}
              onTransitionEnd={handleImportModalBackdropTransitionEnd}
            >
              <div
                className="modal-dialog modal-dialog--import"
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="import-modal-title"
                aria-describedby="import-modal-desc"
                onClick={(e) => e.stopPropagation()}
              >
                <h2 id="import-modal-title" className="modal-title">
                  {t('import.title')}
                </h2>
                <p id="import-modal-desc" className="modal-body">
                  {pendingImport.preview.currentTabCount === 0
                    ? t('import.body.emptyCurrent', {
                        groupCount: pendingImport.preview.importedGroupCount,
                        tabCount: formatTabCount(
                          pendingImport.preview.importedTabCount,
                        ),
                      })
                    : t('import.body.withCurrent', {
                        groupCount: pendingImport.preview.importedGroupCount,
                        importedTabCount: formatTabCount(
                          pendingImport.preview.importedTabCount,
                        ),
                        currentTabCount: formatTabCount(
                          pendingImport.preview.currentTabCount,
                        ),
                      })}
                </p>
                <div
                  className="import-choice-list"
                  role="group"
                  aria-label={t('import.ariaLabel')}
                >
                  <button
                    type="button"
                    className="import-choice-btn import-choice-btn--primary"
                    disabled={pendingImport.preview.newTabCount === 0}
                    onClick={executeImportAddMissing}
                  >
                    <span className="import-choice-btn__title">
                      {t('import.choice.addMissing.title')}
                    </span>
                    <span className="import-choice-btn__hint">
                      {pendingImport.preview.newTabCount === 0
                        ? t('import.choice.addMissing.hint.allExist')
                        : pendingImport.preview.duplicateTabCount > 0
                          ? plural(
                              'import.choice.addMissing.hint.addNewWithDuplicates',
                              pendingImport.preview.duplicateTabCount,
                              {
                                newTabCount: formatTabCount(
                                  pendingImport.preview.newTabCount,
                                ),
                                duplicateTabCount: formatTabCount(
                                  pendingImport.preview.duplicateTabCount,
                                ),
                              },
                            )
                          : t('import.choice.addMissing.hint.addNew', {
                              newTabCount: formatTabCount(
                                pendingImport.preview.newTabCount,
                              ),
                            })}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="import-choice-btn import-choice-btn--danger"
                    onClick={executeImportReplace}
                  >
                    <span className="import-choice-btn__title">
                      {t('import.choice.replace.title')}
                    </span>
                    <span className="import-choice-btn__hint">
                      {t('import.choice.replace.hint')}
                    </span>
                  </button>
                </div>
                <div className="modal-actions">
                  <button
                    type="button"
                    className="btn btn-outline modal-btn"
                    onClick={requestCloseImportModal}
                  >
                    {t('import.cancel')}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {importTrashModalMounted && pendingImportTrash
        ? createPortal(
            <div
              className={`modal-backdrop${importTrashModalOpen ? ' modal-backdrop--open' : ''}`}
              role="presentation"
              onClick={requestCloseImportTrashModal}
              onTransitionEnd={handleImportTrashModalBackdropTransitionEnd}
            >
              <div
                className="modal-dialog modal-dialog--import"
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="import-trash-modal-title"
                aria-describedby="import-trash-modal-desc"
                onClick={(e) => e.stopPropagation()}
              >
                <h2 id="import-trash-modal-title" className="modal-title">
                  {t('importTrash.title')}
                </h2>
                <p id="import-trash-modal-desc" className="modal-body">
                  {plural('importTrash.body', pendingImportTrash.overlapCount, {
                    tabCount: formatTabCount(pendingImportTrash.overlapCount),
                  })}
                </p>
                <div
                  className="import-choice-list"
                  role="group"
                  aria-label={t('importTrash.ariaLabel')}
                >
                  <button
                    type="button"
                    className="import-choice-btn import-choice-btn--primary"
                    onClick={() => executeImportWithTrashChoice(true)}
                  >
                    <span className="import-choice-btn__title">
                      {t('importTrash.choice.restore.title')}
                    </span>
                    <span className="import-choice-btn__hint">
                      {t('importTrash.choice.restore.hint')}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="import-choice-btn"
                    onClick={() => executeImportWithTrashChoice(false)}
                  >
                    <span className="import-choice-btn__title">
                      {t('importTrash.choice.keep.title')}
                    </span>
                    <span className="import-choice-btn__hint">
                      {t('importTrash.choice.keep.hint')}
                    </span>
                  </button>
                </div>
                <div className="modal-actions">
                  <button
                    type="button"
                    className="btn btn-outline modal-btn"
                    onClick={requestCloseImportTrashModal}
                  >
                    {t('importTrash.cancel')}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

    </Fragment>
  )
}

