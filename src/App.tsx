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
import { ptBR } from 'date-fns/locale'
import {
  loadGroups,
  saveGroups,
  GROUPS_STORAGE_KEY,
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
  countPrunableViewedTabs,
  DEFAULT_VIEWED_PRUNE_MONTHS,
  listPrunableViewedTabs,
  pruneOldViewedTabs,
  type PrunableViewedEntry,
} from './lib/pruneViewedTabs'
import {
  createTrashedGroup,
  createTrashedTab,
  restoreTrashedEntry,
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
  loadLocalPreferences,
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
  parseGroupsFromExportPayload,
  type ImportPreview,
} from './lib/importGroups'
import { createSidebarCalendarDayButton } from './SidebarCalendarDayButton'
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

function formatShortDate(d: Date): string {
  return new Intl.DateTimeFormat('pt-BR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(d)
}

/** Rótulo principal do grupo (só data, sem horário — hora fica na meta à direita). */
function formatGroupPrimary(d: Date): string {
  return formatShortDate(d)
}

function formatTimeOnly(d: Date): string {
  return new Intl.DateTimeFormat('pt-BR', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(d)
}

function formatRelativeAgo(saved: Date): string {
  const sec = Math.round((Date.now() - saved.getTime()) / 1000)
  if (sec < 45) return 'agora'
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min} min atrás`
  const h = Math.floor(min / 60)
  if (h < 48) return `${h} h atrás`
  const days = Math.floor(h / 24)
  return `${days} d atrás`
}

function formatGroupMetaLine(d: Date): string {
  return `${formatShortDate(d)} | ${formatTimeOnly(d)} | ${formatRelativeAgo(d)}`
}

function formatTabAddedAt(iso: string): string {
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(iso))
  } catch {
    return ''
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

function IconPruneViewed() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 8v4l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
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

const TAG_INPUT_PLACEHOLDER = 'Nova tag…'

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
  tab: t,
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
  removeLabel = 'Mover para a lixeira',
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
  removeLabel?: string
}) {
  const tagDropdownId = useId()
  const tagPickerRef = useRef<HTMLSpanElement>(null)
  const [tagDraft, setTagDraft] = useState('')

  const selectableExistingTags = useMemo(
    () => existingTagOptions.filter((tag) => !t.tags.includes(tag)),
    [existingTagOptions, t.tags],
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
    const next = mergeNewTags(t.tags, raw)
    if (JSON.stringify(next) !== JSON.stringify(t.tags)) onSetTags(next)
  }

  function addExistingTag(tag: string) {
    const next = mergeNewTags(t.tags, tag)
    if (JSON.stringify(next) !== JSON.stringify(t.tags)) onSetTags(next)
    setTagDropdownOpen(false)
  }

  const hostLabel = formatTabHostLabel(t.url, simpleLayout)

  function openTab() {
    onOpenTab()
  }

  const tagInputSize = Math.min(
    44,
    Math.max(
      8,
      tagDraft.length > 0
        ? tagDraft.length + 1
        : TAG_INPUT_PLACEHOLDER.length,
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
            src={faviconUrl(t.url)}
            alt=""
            width={simpleLayout ? 20 : 32}
            height={simpleLayout ? 20 : 32}
            loading="lazy"
          />
          <div className="tab-text">
            <div className="tab-title-row">
              <div
                className={`tab-title${t.viewed ? ' tab-title--viewed' : ''}`}
                title={t.title}
              >
                {t.title}
              </div>
              {simpleLayout ? (
                <>
                  <span className="tab-title-time-sep" aria-hidden>
                    ·
                  </span>
                  <time
                    className="tab-added tab-added--inline"
                    dateTime={t.addedAt}
                  >
                    {formatTabAddedAt(t.addedAt)}
                  </time>
                </>
              ) : null}
              <button
                type="button"
                className="tab-title-edit"
                aria-label={`Editar título de ${t.title}`}
                title="Editar título"
                onClick={(e) => {
                  e.stopPropagation()
                  onRequestEditTitle()
                }}
              >
                <IconPencil />
              </button>
              <button
                type="button"
                className={`tab-title-edit tab-title-viewed-toggle${t.viewed ? ' tab-title-viewed-toggle--viewed' : ''}`}
                aria-label={
                  t.viewed
                    ? `Desmarcar ${t.title} como visualizado`
                    : `Marcar ${t.title} como visualizado`
                }
                title={
                  t.viewed
                    ? 'Desmarcar como visualizado'
                    : 'Marcar como visualizado'
                }
                onClick={(e) => {
                  e.stopPropagation()
                  onToggleViewed()
                }}
              >
                {t.viewed ? <IconEyeOff /> : <IconEye />}
              </button>
            </div>
            {!simpleLayout ? (
              <div className="tab-subline">
                <span className="tab-host" title={t.url}>
                  {hostLabel}
                </span>
                <span className="tab-subline-sep" aria-hidden>
                  ·
                </span>
                <time className="tab-added" dateTime={t.addedAt}>
                  {formatTabAddedAt(t.addedAt)}
                </time>
              </div>
            ) : null}
          </div>
        </div>
        <div className="tab-row-tags-field">
          {t.tags.map((tag) => (
            <span key={tag} className="tab-chip">
              {tag}
              {!tagsReadOnly ? (
                <button
                  type="button"
                  className="tab-chip-remove"
                  aria-label={`Remover tag ${tag}`}
                  title={`Remover tag ${tag}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    onSetTags(t.tags.filter((x) => x !== tag))
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
              placeholder={TAG_INPUT_PLACEHOLDER}
              aria-label="Nova tag"
              maxLength={64}
            />
            {hasTagSuggestions ? (
              <>
                <button
                  type="button"
                  className="tab-tag-dropdown-trigger"
                  aria-label="Mostrar tags existentes"
                  title="Mostrar tags existentes"
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
                  aria-label="Tags existentes"
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
            aria-label="Restaurar"
            title="Restaurar"
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
            className={`tab-row-favorite${t.favorite ? ' tab-row-favorite--on' : ''}`}
            aria-label={
              t.favorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'
            }
            title={
              t.favorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'
            }
            onClick={(e) => {
              e.stopPropagation()
              onToggleFavorite()
            }}
          >
            <IconStar filled={t.favorite === true} />
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
  | { variant: 'prune-viewed' }

type EditTabTitleAction = {
  groupId: string
  tabId: string
  title: string
}

type RedirectToOpenTabAction = {
  chromeTabId: number
  groupId: string
  tabId: string
}

type PendingGroupsImport = {
  groups: TabGroup[]
  preview: ImportPreview
}

const GROUPS_EXPORT_VERSION = 1

function formatTabCount(count: number): string {
  return `${count} aba${count === 1 ? '' : 's'}`
}

const MAIN_VIEWS = ['saved', 'favorites', 'trash'] as const satisfies readonly MainView[]

const MAIN_VIEW_LABELS: Record<MainView, string> = {
  saved: 'Abas Salvas',
  favorites: 'Favoritos',
  trash: 'Lixeira',
}

const MAIN_VIEW_SHORT_LABELS: Record<MainView, string> = {
  saved: 'Salvas',
  favorites: 'Favoritos',
  trash: 'Lixeira',
}

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

function App() {
  const [groups, setGroups] = useState<TabGroup[]>([])
  const [trash, setTrash] = useState<TrashedEntry[]>([])
  const [mainView, setMainView] = useState<MainView>('saved')
  const [ready, setReady] = useState(false)
  const [search, setSearch] = useState('')
  const [activeTagFilters, setActiveTagFilters] = useState<string[]>([])
  const [groupDateRange, setGroupDateRange] = useState<
    DateRange | undefined
  >()
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const [darkMode, setDarkMode] = useState(false)
  const [simpleLayout, setSimpleLayout] = useState(false)
  const prefsHydratedRef = useRef(false)
  const groupsRef = useRef<TabGroup[]>([])
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
  const [editTitleModalMounted, setEditTitleModalMounted] = useState(false)
  const [editTitleModalOpen, setEditTitleModalOpen] = useState(false)
  const editTitleModalOpenRef = useRef(false)
  const editTitleInputRef = useRef<HTMLInputElement>(null)
  const importGroupsInputRef = useRef<HTMLInputElement>(null)
  const themeSwitchRef = useRef<HTMLButtonElement>(null)
  const [editTitleAction, setEditTitleAction] =
    useState<EditTabTitleAction | null>(null)
  const [editTitleDraft, setEditTitleDraft] = useState('')
  const [groupsImportStatus, setGroupsImportStatus] = useState('')
  const [importModalMounted, setImportModalMounted] = useState(false)
  const [importModalOpen, setImportModalOpen] = useState(false)
  const importModalOpenRef = useRef(false)
  const [pendingImport, setPendingImport] = useState<PendingGroupsImport | null>(
    null,
  )
  const [redirectModalMounted, setRedirectModalMounted] = useState(false)
  const [redirectModalOpen, setRedirectModalOpen] = useState(false)
  const redirectModalOpenRef = useRef(false)
  const [redirectAction, setRedirectAction] =
    useState<RedirectToOpenTabAction | null>(null)

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

  const confirmCopy = useMemo(() => {
    switch (confirmAction?.variant) {
      case 'all':
        return {
          title: 'Mover tudo para a lixeira?',
          body:
            'Todos os grupos e abas salvas serão movidos para a lixeira. Você poderá restaurá-los depois.',
          confirmLabel: 'Mover para a lixeira',
        }
      case 'group':
        return {
          title: 'Mover grupo para a lixeira?',
          body:
            'Todas as abas deste grupo serão movidas para a lixeira. Você poderá restaurá-las depois.',
          confirmLabel: 'Mover para a lixeira',
        }
      case 'tab':
        return {
          title: 'Mover aba para a lixeira?',
          body:
            'A aba sairá da lista salva e ficará na lixeira até você restaurar ou apagar de vez.',
          confirmLabel: 'Mover para a lixeira',
        }
      case 'trash-entry':
        return {
          title: 'Apagar permanentemente?',
          body:
            'Este item será removido da lixeira e não poderá ser recuperado.',
          confirmLabel: 'Apagar permanentemente',
        }
      case 'trash-all':
        return {
          title: 'Esvaziar lixeira?',
          body:
            'Todos os itens da lixeira serão apagados permanentemente. Esta ação não pode ser desfeita.',
          confirmLabel: 'Esvaziar lixeira',
        }
      case 'remove-duplicates': {
        const n = countDuplicateTabs(groups)
        return {
          title: 'Remover abas duplicadas?',
          body:
            n === 1
              ? 'Esta aba será movida para a lixeira.'
              : `Estas ${n} abas serão movidas para a lixeira.`,
          confirmLabel: 'Remover duplicadas',
        }
      }
      case 'prune-viewed': {
        const n = countPrunableViewedTabs(groups)
        const monthsLabel = `${DEFAULT_VIEWED_PRUNE_MONTHS} meses`
        return {
          title: 'Limpar abas vistas antigas?',
          body:
            n === 1
              ? `Esta aba foi aberta na lista há mais de ${monthsLabel} e será movida para a lixeira. Favoritos não são removidos.`
              : `Estas ${n} abas foram abertas na lista há mais de ${monthsLabel} e serão movidas para a lixeira. Favoritos não são removidos.`,
          confirmLabel: 'Limpar vistas antigas',
        }
      }
      default:
        return {
          title: '',
          body: '',
          confirmLabel: 'Confirmar',
        }
    }
  }, [confirmAction, groups])

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
    setTrash(sorted)
    void saveTrash(sorted)
  }, [])

  useEffect(() => {
    if (
      !confirmModalMounted &&
      !editTitleModalMounted &&
      !redirectModalMounted &&
      !importModalMounted &&
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

  const applyPreferences = useCallback(
    (prefs: UserPreferences, fromRemote = false) => {
      if (fromRemote) {
        markRemotePreferencesApply()
      }
      setDarkMode(prefs.theme === 'dark')
      setSimpleLayout(prefs.simpleLayout)
      setSearch(prefs.search)
      setActiveTagFilters(prefs.activeTagFilters)
      setGroupDateRange(parseDateRange(prefs.groupDateRange))
    },
    [],
  )

  useEffect(() => {
    document.documentElement.setAttribute(
      'data-theme',
      darkMode ? 'dark' : 'light',
    )
  }, [darkMode])

  useEffect(() => {
    document.documentElement.setAttribute(
      'data-simple-layout',
      simpleLayout ? 'true' : 'false',
    )
  }, [simpleLayout])

  useEffect(() => {
    void loadLocalPreferences().then((prefs) => {
      applyPreferences(prefs)
      prefsHydratedRef.current = true
    })
  }, [applyPreferences])

  useEffect(() => {
    if (!prefsHydratedRef.current) return
    if (!consumeLocalPreferencesEdit()) return

    const prefs: UserPreferences = {
      theme: darkMode ? 'dark' : 'light',
      simpleLayout,
      search,
      activeTagFilters,
      groupDateRange: serializeDateRange(groupDateRange),
    }

    void saveLocalPreferencesFromLocal(prefs)
  }, [darkMode, simpleLayout, search, activeTagFilters, groupDateRange])

  useEffect(() => {
    groupsRef.current = groups
  }, [groups])

  useEffect(() => {
    void Promise.all([loadGroups(), loadTrash()]).then(([loaded, loadedTrash]) => {
      const sorted = sortGroupsList(loaded)
      groupsRef.current = sorted
      setGroups(sorted)
      setTrash(sortTrashEntries(loadedTrash))
      setReady(true)
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
          setTrash(sortTrashEntries(next))
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
    setConfirmAction(action)
    setConfirmModalMounted(true)
  }

  function openEditTabTitleModal(action: EditTabTitleAction) {
    setEditTitleAction(action)
    setEditTitleDraft(action.title)
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
      .sort((a, b) => a.tag.localeCompare(b.tag, 'pt-BR'))
  }, [groups])

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

  const prunableViewedCount = useMemo(
    () => countPrunableViewedTabs(groups),
    [groups],
  )

  const duplicateRemovalPreview = useMemo(() => {
    if (confirmAction?.variant !== 'remove-duplicates') return []
    return listDuplicateRemovalPreview(groups, dedupeKeepStrategy)
  }, [confirmAction, groups, dedupeKeepStrategy])

  const prunableViewedPreview = useMemo(() => {
    if (confirmAction?.variant !== 'prune-viewed') return []
    return listPrunableViewedTabs(groups)
  }, [confirmAction, groups])

  function dedupeEntryGroupLabel(entry: DuplicateRemovalEntry): string {
    return (
      entry.groupCustomTitle ??
      formatGroupPrimary(new Date(entry.groupSavedAt))
    )
  }

  function prunableViewedEntryGroupLabel(entry: PrunableViewedEntry): string {
    return (
      entry.groupCustomTitle ??
      formatGroupPrimary(new Date(entry.groupSavedAt))
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

  function submitEditTabTitle() {
    if (!editTitleAction) return
    const title = editTitleDraft.trim()
    if (title && title !== editTitleAction.title) {
      setTabTitle(editTitleAction.groupId, editTitleAction.tabId, title)
    }
    requestCloseEditTitleModal()
  }

  function exportGroups() {
    const payload = {
      app: 'OneTab Manager',
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
    setGroupsImportStatus('Exportação gerada.')
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
    }
  }

  function finishGroupsImport(next: TabGroup[], statusMessage: string) {
    persist(next)
    setGroupsImportStatus(statusMessage)
    requestCloseImportModal()
  }

  function executeImportReplace() {
    if (!pendingImport) return
    const next = applyImportReplace(pendingImport.groups)
    const { importedGroupCount, importedTabCount } = pendingImport.preview
    finishGroupsImport(
      next,
      `Lista substituída — ${importedGroupCount} grupo${importedGroupCount === 1 ? '' : 's'}, ${formatTabCount(importedTabCount)}.`,
    )
  }

  function executeImportAddMissing() {
    if (!pendingImport) return
    const { preview } = pendingImport
    if (preview.newTabCount === 0) return

    const next = applyImportAddMissing(groupsRef.current, pendingImport.groups)
    finishGroupsImport(
      next,
      `${preview.newTabCount} link${preview.newTabCount === 1 ? '' : 's'} novo${preview.newTabCount === 1 ? '' : 's'} adicionado${preview.newTabCount === 1 ? '' : 's'}.`,
    )
  }

  async function importGroupsFromFile(file: File) {
    try {
      const parsed = JSON.parse(await file.text()) as unknown
      const importedGroups = parseGroupsFromExportPayload(parsed)

      if (importedGroups.length === 0) {
        setGroupsImportStatus('Nenhum grupo válido encontrado no arquivo.')
        return
      }

      const preview = buildImportPreview(groupsRef.current, importedGroups)
      setPendingImport({ groups: importedGroups, preview })
      setImportModalMounted(true)
    } catch {
      setGroupsImportStatus('Não foi possível importar este arquivo.')
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
    } else if (a.variant === 'group') {
      const group = groups.find((g) => g.id === a.groupId)
      if (group) {
        persistTrash([createTrashedGroup(group), ...trash])
      }
      persist(groups.filter((g) => g.id !== a.groupId))
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

  function executeRemoveDuplicates(keep: 'newest' | 'oldest') {
    const { groups: next, trashEntries, removedCount } = deduplicateGroups(
      groups,
      keep,
    )
    if (removedCount > 0) {
      persistTrash([...trashEntries, ...trash])
      persist(next)
      setGroupsImportStatus(
        `${removedCount} duplicada${removedCount === 1 ? '' : 's'} movida${removedCount === 1 ? '' : 's'} para a lixeira (mantida a mais ${keep === 'newest' ? 'recente' : 'antiga'}).`,
      )
    }
    requestCloseConfirmModal()
  }

  function executePruneViewedTabs() {
    const { groups: next, trashEntries, removedCount } = pruneOldViewedTabs(groups)
    if (removedCount > 0) {
      persistTrash([...trashEntries, ...trash])
      persist(next)
      setGroupsImportStatus(
        `${removedCount} aba${removedCount === 1 ? '' : 's'} vista${removedCount === 1 ? '' : 's'} antiga${removedCount === 1 ? '' : 's'} movida${removedCount === 1 ? '' : 's'} para a lixeira.`,
      )
    }
    requestCloseConfirmModal()
  }

  function restoreFromTrash(trashId: string) {
    const entry = trash.find((e) => e.id === trashId)
    if (!entry) return
    const next = restoreTrashedEntry(groups, entry)
    persist(next.filter((g) => g.tabs.length > 0))
    persistTrash(trash.filter((e) => e.id !== trashId))
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

  function editGroupTitle(groupId: string) {
    const g = groups.find((x) => x.id === groupId)
    if (!g) return
    const defaultLabel =
      g.customTitle ?? formatGroupPrimary(new Date(g.savedAt))
    const value = window.prompt('Nome do grupo', defaultLabel)
    if (value === null) return
    const trimmed = value.trim()
    persist(
      groups.map((gr) =>
        gr.id === groupId
          ? { ...gr, customTitle: trimmed || undefined }
          : gr,
      ),
    )
  }

  if (!ready) {
    return (
      <div className="shell shell--loading">
        <p className="loading-text">Carregando…</p>
      </div>
    )
  }

  return (
    <Fragment>
      <div className="shell">
      <header className="mobile-header">
        <div className="mobile-header-brand">
          <IconLogo />
          <div>
            <div className="mobile-header-title">OneTab Manager</div>
            <div className="mobile-header-sub">GERENCIADOR DE ABAS</div>
          </div>
        </div>
        <button
          type="button"
          className="mobile-menu-btn"
          aria-label={mobileSidebarOpen ? 'Fechar menu' : 'Abrir menu'}
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
        aria-label="Fechar menu"
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
            <div className="brand-title">OneTab Manager</div>
            <div className="brand-sub">GERENCIADOR DE ABAS</div>
          </div>
        </header>

        <label className="search-wrap">
          <IconSearch />
          <input
            className="search-input"
            type="search"
            placeholder="Buscar por título, URL ou tag…"
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
              {mainView === 'trash' ? 'itens' : 'grupos'}
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-value">
              {mainView === 'trash' ? trashTabCount : visibleTabs}
            </div>
            <div className="stat-label">abas</div>
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
            locale={ptBR}
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
                Limpar
              </button>
            </div>
          ) : null}
        </div>

        <section className="sidebar-preferences" aria-label="Preferências">
          <SidebarDropdownSection
            id="appearance"
            title="Aparência"
            open={preferenceSectionsOpen.appearance}
            onToggle={() => togglePreferenceSection('appearance')}
          >
              <div className="sidebar-toggle-row">
                <span
                  className="sidebar-toggle-row-label"
                  id="theme-switch-label"
                >
                  Modo escuro
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
                  Modo compacto
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
          </SidebarDropdownSection>

          <SidebarDropdownSection
            id="backup"
            title="Backup"
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
                      Exportar grupos
                    </span>
                    <span className="sidebar-action-row-hint">
                      Salvar arquivo JSON no dispositivo
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
                      Importar grupos
                    </span>
                    <span className="sidebar-action-row-hint">
                      Carregar grupos de um arquivo JSON
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
            title="Exclusão"
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
                  <span className="sidebar-action-row-label">Remover duplicadas</span>
                  <span className="sidebar-action-row-hint">
                    {duplicateTabCount === 0
                      ? 'Nenhuma URL repetida'
                      : duplicateTabCount === 1
                        ? '1 aba com URL repetida'
                        : `${duplicateTabCount} abas com URL repetida`}
                  </span>
                </span>
              </button>
              <div className="sidebar-section-divider" role="separator" aria-hidden />
              <button
                type="button"
                className="sidebar-action-row"
                disabled={prunableViewedCount === 0}
                onClick={() => openConfirmDeleteModal({ variant: 'prune-viewed' })}
              >
                <span className="sidebar-action-row-icon" aria-hidden>
                  <IconPruneViewed />
                </span>
                <span className="sidebar-action-row-body">
                  <span className="sidebar-action-row-label">Limpar vistas antigas</span>
                  <span className="sidebar-action-row-hint">
                    {prunableViewedCount === 0
                      ? `Nenhuma vista há mais de ${DEFAULT_VIEWED_PRUNE_MONTHS} meses`
                      : prunableViewedCount === 1
                        ? '1 aba vista antiga (exceto favoritos)'
                        : `${prunableViewedCount} abas vistas antigas (exceto favoritos)`}
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
                    Mover tudo para a lixeira
                  </span>
                  <span className="sidebar-action-row-hint">
                    Todos os grupos e abas salvas
                  </span>
                </span>
              </button>
            </div>
          </SidebarDropdownSection>
        </section>

        <p className="sidebar-hint">
          Clique no ícone da extensão para salvar a aba atual. Botão direito no
          ícone → <strong>Abrir lista de abas salvas</strong>.
        </p>
        </div>

        <footer className="sidebar-footer" aria-label="Armazenamento local">
          <p className="sidebar-hint">
            Dados salvos apenas neste navegador.
          </p>
        </footer>
      </aside>

      <main className={`main${simpleLayout ? ' main--simple' : ''}`}>
        <div className="main-tabs-wrap">
          <nav className="main-tabs" role="tablist" aria-label="Seções">
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
                    {MAIN_VIEW_LABELS[view]}
                  </span>
                  <span className="main-tab-label main-tab-label--short">
                    {MAIN_VIEW_SHORT_LABELS[view]}
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
              Esvaziar lixeira
            </button>
          </div>
        ) : null}

        {mainView !== 'trash' && tagIndex.length > 0 ? (
          <section
            className="tag-filter-bar"
            aria-label="Filtrar listagem por tags"
          >
            <div className="tag-filter-bar-head">
              <span className="tag-filter-title">Filtrar por tag</span>
              {activeTagFilters.length > 0 ? (
                <button
                  type="button"
                  className="tag-filter-clear"
                  onClick={() => {
                    markLocalPreferencesEdit()
                    setActiveTagFilters([])
                  }}
                >
                  Limpar filtros
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
                Mostrando abas que tenham{' '}
                <strong>qualquer uma</strong> das tags selecionadas.
              </p>
            ) : null}
          </section>
        ) : null}

        <div className="group-list">
          {mainView === 'trash' ? (
            visibleTrash.length === 0 ? (
              <div className="empty-state">
                {trash.length === 0
                  ? 'A lixeira está vazia. Itens excluídos aparecerão aqui para você restaurar ou apagar de vez.'
                  : 'Nenhum resultado na lixeira para essa busca.'}
              </div>
            ) : (
              visibleTrashByDay.map((day) => {
                const expanded = isTrashDayExpanded(day)
                const tabCount = trashDayTabCount(day)
                const deleted = trashDayLatestDeletedAt(day)
                const groupTitle =
                  day.customTitle ??
                  formatGroupPrimary(new Date(day.savedAt))
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
                        title={expanded ? 'Recolher' : 'Expandir'}
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
                          Excluído {formatRelativeAgo(deleted)} ·{' '}
                          {tabCount === 1 ? '1 aba' : `${tabCount} abas`}
                        </span>
                      </div>
                      <span className="group-badge">{tabCount}</span>
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
                            entry.group.tabs.map((t) => (
                              <TabRow
                                key={`${entry.id}-${t.id}`}
                                tab={t}
                                simpleLayout={simpleLayout}
                                existingTagOptions={[]}
                                tagsReadOnly
                                removeLabel="Apagar permanentemente"
                                onRequestRemove={() =>
                                  openConfirmDeleteModal({
                                    variant: 'trash-entry',
                                    trashId: entry.id,
                                  })
                                }
                                onSetTags={() => {}}
                                onRequestEditTitle={() =>
                                  openEditTabTitleModal({
                                    groupId: entry.restore.groupId,
                                    tabId: t.id,
                                    title: t.title,
                                  })
                                }
                                onOpenTab={() =>
                                  void handleOpenSavedTab(
                                    entry.restore.groupId,
                                    t.id,
                                    t.url,
                                    t.viewed === true,
                                  )
                                }
                                onToggleViewed={() =>
                                  setTabViewed(
                                    entry.restore.groupId,
                                    t.id,
                                    !t.viewed,
                                  )
                                }
                                onRestore={() => restoreFromTrash(entry.id)}
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
                  ? 'Nenhuma aba favorita. Toque na estrela em uma aba salva para adicionar aos favoritos.'
                  : search.trim() !== '' || activeTagFilters.length > 0
                    ? 'Nenhum favorito para essa busca ou filtro de tags.'
                    : 'Nenhum resultado.'
                : groups.length === 0
                  ? 'Nenhuma aba salva ainda. Clique no ícone da extensão na barra de ferramentas para salvar a aba em foco.'
                  : search.trim() !== '' ||
                      activeTagFilters.length > 0 ||
                      groupDateRange?.from
                    ? 'Nenhum resultado para essa busca, tags ou intervalo de datas.'
                    : 'Nenhum resultado.'}
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
                        g.customTitle ?? formatGroupPrimary(saved)
                      return (
                    <button
                      type="button"
                      className="group-header-lead"
                      id={`group-header-${g.id}`}
                      title={g.expanded ? 'Recolher grupo' : 'Expandir grupo'}
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
                          g.pinned ? 'Desfixar grupo' : 'Fixar grupo'
                        }
                        title={g.pinned ? 'Desfixar grupo' : 'Fixar grupo'}
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
                        aria-label="Abrir abas não vistas do grupo"
                        title="Abrir abas não vistas do grupo"
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
                        aria-label="Editar nome do grupo"
                        title="Editar nome do grupo"
                        onClick={(e) => {
                          e.stopPropagation()
                          editGroupTitle(g.id)
                        }}
                      >
                        <IconPencil />
                      </button>
                      <button
                        type="button"
                        className="group-tool-btn group-tool-btn--danger"
                        aria-label="Mover grupo para a lixeira"
                        title="Mover grupo para a lixeira"
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
                        {g.tabs.map((t) => (
                          <TabRow
                            key={t.id}
                            tab={t}
                            simpleLayout={simpleLayout}
                            existingTagOptions={tagIndex.map((x) => x.tag)}
                            onRequestRemove={() =>
                              openConfirmDeleteModal({
                                variant: 'tab',
                                groupId: g.id,
                                tabId: t.id,
                              })
                            }
                            onSetTags={(tags) => setTabTags(g.id, t.id, tags)}
                            onRequestEditTitle={() =>
                              openEditTabTitleModal({
                                groupId: g.id,
                                tabId: t.id,
                                title: t.title,
                              })
                            }
                            onOpenTab={() =>
                              void handleOpenSavedTab(
                                g.id,
                                t.id,
                                t.url,
                                t.viewed === true,
                              )
                            }
                            onToggleViewed={() =>
                              setTabViewed(g.id, t.id, !t.viewed)
                            }
                            showFavorite
                            onToggleFavorite={() =>
                              toggleTabFavorite(g.id, t.id)
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
                  submitEditTabTitle()
                }}
              >
                <h2 id="edit-title-modal-title" className="modal-title">
                  Editar título do site
                </h2>
                <p id="edit-title-modal-desc" className="modal-body">
                  Altere como este site aparece na sua lista de abas salvas.
                </p>
                <label className="modal-field">
                  <span className="modal-field-label">Título</span>
                  <input
                    ref={editTitleInputRef}
                    className="modal-input"
                    type="text"
                    value={editTitleDraft}
                    onChange={(e) => setEditTitleDraft(e.target.value)}
                    maxLength={160}
                  />
                </label>
                <div className="modal-actions">
                  <button
                    type="button"
                    className="btn btn-outline modal-btn"
                    onClick={requestCloseEditTitleModal}
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary modal-btn"
                    disabled={editTitleDraft.trim().length === 0}
                  >
                    Salvar
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
                  Aba já aberta
                </h2>
                <p id="redirect-modal-desc" className="modal-body">
                  Essa aba já está aberta. Deseja ser redirecionado para ela?
                </p>
                <div className="modal-actions">
                  <button
                    type="button"
                    className="btn btn-outline modal-btn"
                    onClick={requestCloseRedirectModal}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary modal-btn"
                    onClick={() => void confirmRedirectToOpenTab()}
                  >
                    Ir para a aba
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
                className={`modal-dialog${confirmAction.variant === 'remove-duplicates' || confirmAction.variant === 'prune-viewed' ? ' modal-dialog--dedupe' : ''}`}
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
                      aria-label="Qual cópia manter em cada URL"
                    >
                      <button
                        type="button"
                        className={`dedupe-keep-btn${dedupeKeepStrategy === 'newest' ? ' dedupe-keep-btn--active' : ''}`}
                        aria-pressed={dedupeKeepStrategy === 'newest'}
                        onClick={() => setDedupeKeepStrategy('newest')}
                      >
                        Manter a mais recente
                      </button>
                      <button
                        type="button"
                        className={`dedupe-keep-btn${dedupeKeepStrategy === 'oldest' ? ' dedupe-keep-btn--active' : ''}`}
                        aria-pressed={dedupeKeepStrategy === 'oldest'}
                        onClick={() => setDedupeKeepStrategy('oldest')}
                      >
                        Manter a mais antiga
                      </button>
                    </div>
                    <ul className="dedupe-preview-list" aria-label="Abas duplicadas">
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
                {confirmAction.variant === 'prune-viewed' ? (
                  <ul
                    className="dedupe-preview-list"
                    aria-label="Abas vistas antigas"
                  >
                    {prunableViewedPreview.map((entry) => (
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
                              {prunableViewedEntryGroupLabel(entry)}
                            </span>
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <div className="modal-actions">
                  <button
                    type="button"
                    className="btn btn-outline modal-btn"
                    onClick={requestCloseConfirmModal}
                  >
                    Cancelar
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
                      Remover duplicadas
                    </button>
                  ) : confirmAction.variant === 'prune-viewed' ? (
                    <button
                      type="button"
                      className="btn btn-danger-solid modal-btn"
                      onClick={executePruneViewedTabs}
                    >
                      <IconPruneViewed />
                      Limpar vistas antigas
                    </button>
                  ) : (
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
                  Como importar este backup?
                </h2>
                <p id="import-modal-desc" className="modal-body">
                  {pendingImport.preview.currentTabCount === 0 ? (
                    <>
                      O arquivo traz {pendingImport.preview.importedGroupCount}{' '}
                      grupo
                      {pendingImport.preview.importedGroupCount === 1 ? '' : 's'}{' '}
                      com {formatTabCount(pendingImport.preview.importedTabCount)}.
                    </>
                  ) : (
                    <>
                      O backup tem {pendingImport.preview.importedGroupCount}{' '}
                      grupo
                      {pendingImport.preview.importedGroupCount === 1 ? '' : 's'}{' '}
                      ({formatTabCount(pendingImport.preview.importedTabCount)}). Você
                      tem {formatTabCount(pendingImport.preview.currentTabCount)} salvas
                      agora.
                    </>
                  )}
                </p>
                <div
                  className="import-choice-list"
                  role="group"
                  aria-label="Modo de importação"
                >
                  <button
                    type="button"
                    className="import-choice-btn import-choice-btn--primary"
                    disabled={pendingImport.preview.newTabCount === 0}
                    onClick={executeImportAddMissing}
                  >
                    <span className="import-choice-btn__title">
                      Manter e completar
                    </span>
                    <span className="import-choice-btn__hint">
                      {pendingImport.preview.newTabCount === 0
                        ? 'Todos os links do arquivo já estão na sua lista.'
                        : `Adiciona ${formatTabCount(pendingImport.preview.newTabCount)} que ainda não estão salvas${
                            pendingImport.preview.duplicateTabCount > 0
                              ? `; ${formatTabCount(pendingImport.preview.duplicateTabCount)} repetida${pendingImport.preview.duplicateTabCount === 1 ? '' : 's'} ${pendingImport.preview.duplicateTabCount === 1 ? 'é ignorada' : 'são ignoradas'}.`
                              : '.'
                          }`}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="import-choice-btn import-choice-btn--danger"
                    onClick={executeImportReplace}
                  >
                    <span className="import-choice-btn__title">Substituir tudo</span>
                    <span className="import-choice-btn__hint">
                      Apaga a lista atual e usa somente o conteúdo do arquivo. Esta
                      ação não pode ser desfeita automaticamente.
                    </span>
                  </button>
                </div>
                <div className="modal-actions">
                  <button
                    type="button"
                    className="btn btn-outline modal-btn"
                    onClick={requestCloseImportModal}
                  >
                    Cancelar
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

export default App
