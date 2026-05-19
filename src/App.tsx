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
import { loadGroups, saveGroups, GROUPS_STORAGE_KEY, normalizeAllGroups } from './lib/groupsStorage'
import { groupSavedInDateRange } from './lib/groupDateRangeFilter'
import { buildTabsCountByLocalDay } from './lib/tabsPerCalendarDay'
import {
  findOpenBrowserTab,
  focusBrowserTab,
  tabUrlsMatch,
} from './lib/browserTab'
import { mergeNewTags } from './lib/tags'
import { toggleThemeWithViewTransition } from './lib/themeViewTransition'
import { AuthModal } from './AuthModal'
import { isBillingEnabled } from './lib/billing'
import { PlanBadge } from './components/PlanBadge'
import { RedeemKeyForm } from './components/RedeemKeyForm'
import {
  fetchSubscriptionStatus,
  formatSubscriptionLabel,
  hasCloudAccess,
  redeemAccessKey,
  type SubscriptionStatus,
} from './lib/subscription'
import {
  AUTH_TOKEN_STORAGE_KEY,
  clearStoredToken,
  fetchCurrentUser,
  type PublicUser,
} from './lib/api'
import {
  scheduleCloudPush,
  syncGroupsWithCloud,
  touchLocalSyncMeta,
  type GroupsCloudPayload,
} from './lib/groupsSync'
import {
  loadLocalPreferences,
  saveLocalPreferences,
  serializeDateRange,
  parseDateRange,
  PREFERENCES_STORAGE_KEY,
  type UserPreferences,
} from './lib/preferencesStorage'
import {
  schedulePreferencesPush,
  syncPreferencesWithCloud,
  type PreferencesCloudPayload,
} from './lib/preferencesSync'
import { createSidebarCalendarDayButton } from './SidebarCalendarDayButton'
import 'react-day-picker/style.css'
import type { SavedTab, TabGroup } from './types/tabs'
import './App.css'

function faviconUrl(url: string): string {
  try {
    const host = new URL(url).hostname
    return `https://www.google.com/s2/favicons?domain=${host}&sz=64`
  } catch {
    return 'https://www.google.com/s2/favicons?domain=example.com&sz=64'
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

function IconClearViewed() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M3 3l18 18M10.58 10.58A2 2 0 0 0 12 16a2 2 0 0 0 1.42-.58M9.88 9.88A4.24 4.24 0 0 1 12 8c2.21 0 4 1.79 4 4 0 .73-.2 1.41-.54 2M6.1 6.1C4.21 7.39 3 9.58 3 12c0 4.97 4.03 9 9 9 2.42 0 4.62-.95 6.1-2.1"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
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

function IconCloud() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M7 18a4 4 0 0 1-.5-7.97A5.5 5.5 0 0 1 17.5 8.5 4.5 4.5 0 0 1 19 17h-1.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12 12v6m0 0-2.5-2.5M12 18l2.5-2.5"
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
  onClearViewed,
  onSetTags,
  existingTagOptions,
}: {
  tab: SavedTab
  simpleLayout: boolean
  onRequestRemove: () => void
  onRequestEditTitle: () => void
  onOpenTab: () => void
  onClearViewed: () => void
  onSetTags: (tags: string[]) => void
  /** Tags já usadas em alguma aba (ordenadas), sugeridas no mesmo campo de nova tag. */
  existingTagOptions: string[]
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

  let host: string
  try {
    host = new URL(t.url).hostname.replace(/^www\./, '')
  } catch {
    host = t.url
  }

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
              {t.viewed ? (
                <button
                  type="button"
                  className="tab-title-edit tab-title-clear-viewed"
                  aria-label={`Desmarcar ${t.title} como visualizado`}
                  title="Desmarcar como visualizado"
                  onClick={(e) => {
                    e.stopPropagation()
                    onClearViewed()
                  }}
                >
                  <IconClearViewed />
                </button>
              ) : null}
            </div>
            {!simpleLayout ? (
              <div className="tab-subline">
                <span className="tab-host" title={host}>
                  {host}
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
            </span>
          ))}
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
        </div>
        <button
          type="button"
          className="tab-row-delete"
          aria-label="Remover aba salva"
          title="Remover aba salva"
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

type ConfirmDeleteAction =
  | { variant: 'all' }
  | { variant: 'group'; groupId: string }
  | { variant: 'tab'; groupId: string; tabId: string }

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

type GroupsExportFile = {
  app?: string
  version?: number
  exportedAt?: string
  groups?: unknown
}

const GROUPS_EXPORT_VERSION = 1

function App() {
  const [groups, setGroups] = useState<TabGroup[]>([])
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
  const skipPrefsPushRef = useRef(false)
  const cloudSyncInProgressRef = useRef(false)
  const authRefreshInFlightRef = useRef<Promise<void> | null>(null)
  const [preferenceSectionsOpen, setPreferenceSectionsOpen] = useState({
    backup: false,
    appearance: false,
  })

  function togglePreferenceSection(section: 'backup' | 'appearance') {
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
  const [redirectModalMounted, setRedirectModalMounted] = useState(false)
  const [redirectModalOpen, setRedirectModalOpen] = useState(false)
  const redirectModalOpenRef = useRef(false)
  const [authModalMounted, setAuthModalMounted] = useState(false)
  const [authModalOpen, setAuthModalOpen] = useState(false)
  const authModalOpenRef = useRef(false)
  const [authUser, setAuthUser] = useState<PublicUser | null>(null)
  const [subscription, setSubscription] = useState<SubscriptionStatus | null>(
    null,
  )
  const [authLoading, setAuthLoading] = useState(true)
  const [licenseKeyInput, setLicenseKeyInput] = useState('')
  const [licenseKeyBusy, setLicenseKeyBusy] = useState(false)
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'ok' | 'error'>('idle')
  const [syncMessage, setSyncMessage] = useState('')
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
    authModalOpenRef.current = authModalOpen
  }, [authModalOpen])

  const confirmCopy = useMemo(() => {
    switch (confirmAction?.variant) {
      case 'all':
        return {
          title: 'Excluir tudo?',
          body:
            'Tem certeza de que deseja remover todos os grupos e abas salvas? Esta ação não pode ser desfeita.',
          confirmLabel: 'Excluir tudo',
        }
      case 'group':
        return {
          title: 'Excluir este grupo?',
          body:
            'Tem certeza? Todas as abas salvas neste grupo serão removidas. Esta ação não pode ser desfeita.',
          confirmLabel: 'Excluir grupo',
        }
      case 'tab':
        return {
          title: 'Remover esta aba?',
          body:
            'A aba será removida apenas da lista salva. Esta ação não pode ser desfeita.',
          confirmLabel: 'Remover aba',
        }
      default:
        return {
          title: '',
          body: '',
          confirmLabel: 'Confirmar',
        }
    }
  }, [confirmAction])

  const persist = useCallback(
    (next: TabGroup[]) => {
      const sorted = sortGroupsList(next)
      setGroups(sorted)
      void (async () => {
        await saveGroups(sorted)
        if (authUser) {
          await touchLocalSyncMeta()
          scheduleCloudPush(sorted)
          setSyncStatus('ok')
          setSyncMessage('Salvo na nuvem')
        }
      })()
    },
    [authUser],
  )

  useEffect(() => {
    if (
      !confirmModalMounted &&
      !editTitleModalMounted &&
      !redirectModalMounted &&
      !authModalMounted &&
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
    authModalMounted,
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
    if (!authModalMounted) return
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => setAuthModalOpen(true))
    })
    return () => cancelAnimationFrame(id)
  }, [authModalMounted])

  const applyPreferences = useCallback((prefs: UserPreferences) => {
    skipPrefsPushRef.current = true
    setDarkMode(prefs.theme === 'dark')
    setSimpleLayout(prefs.simpleLayout)
    setSearch(prefs.search)
    setActiveTagFilters(prefs.activeTagFilters)
    setGroupDateRange(parseDateRange(prefs.groupDateRange))
    requestAnimationFrame(() => {
      skipPrefsPushRef.current = false
    })
  }, [])

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
    if (
      !prefsHydratedRef.current ||
      skipPrefsPushRef.current ||
      cloudSyncInProgressRef.current
    ) {
      return
    }

    const prefs: UserPreferences = {
      theme: darkMode ? 'dark' : 'light',
      simpleLayout,
      search,
      activeTagFilters,
      groupDateRange: serializeDateRange(groupDateRange),
    }

    void saveLocalPreferences(prefs)
    if (authUser) {
      schedulePreferencesPush(prefs)
    }
  }, [
    authUser,
    darkMode,
    simpleLayout,
    search,
    activeTagFilters,
    groupDateRange,
  ])

  const runCloudSync = useCallback(
    async (sessionSubscription?: SubscriptionStatus | null) => {
      const token = await chrome.storage.local.get(AUTH_TOKEN_STORAGE_KEY)
      if (!token[AUTH_TOKEN_STORAGE_KEY]) return

      if (isBillingEnabled) {
        const sub =
          sessionSubscription === undefined
            ? await fetchSubscriptionStatus()
            : sessionSubscription
        if (!hasCloudAccess(sub)) {
          setSyncStatus('error')
          setSyncMessage(
            'Ative o plano Pro com uma chave para sincronizar na nuvem',
          )
          return
        }
      }

      setSyncStatus('syncing')
      setSyncMessage('Sincronizando…')
      cloudSyncInProgressRef.current = true
      try {
        const [merged, prefs] = await Promise.all([
          syncGroupsWithCloud(),
          syncPreferencesWithCloud(),
        ])
        setGroups(sortGroupsList(merged))
        applyPreferences(prefs)
        setSyncStatus('ok')
        setSyncMessage('Sincronizado em tempo real')
      } catch {
        setSyncStatus('error')
        setSyncMessage('Falha ao sincronizar')
      } finally {
        cloudSyncInProgressRef.current = false
      }
    },
    [applyPreferences],
  )

  const refreshAuthSession = useCallback(async () => {
    if (authRefreshInFlightRef.current) {
      return authRefreshInFlightRef.current
    }

    const refreshPromise = (async () => {
      setAuthLoading(true)
      try {
        const user = await fetchCurrentUser()
        setAuthUser(user)
        let sub: SubscriptionStatus | null = null
        if (user && isBillingEnabled) {
          sub = await fetchSubscriptionStatus()
          setSubscription(sub)
        } else {
          setSubscription(null)
        }
        if (user && (!isBillingEnabled || hasCloudAccess(sub))) {
          await runCloudSync(sub)
        } else if (user) {
          setSyncStatus('idle')
          setSyncMessage('Plano gratuito — use uma chave Pro para nuvem')
        } else {
          setSyncStatus('idle')
          setSyncMessage('')
        }
      } catch {
        setAuthUser(null)
        setSyncStatus('idle')
        setSyncMessage('')
      } finally {
        setAuthLoading(false)
      }
    })()

    authRefreshInFlightRef.current = refreshPromise
    try {
      await refreshPromise
    } finally {
      if (authRefreshInFlightRef.current === refreshPromise) {
        authRefreshInFlightRef.current = null
      }
    }
  }, [runCloudSync])

  useEffect(() => {
    void loadGroups().then((loaded) => {
      setGroups(sortGroupsList(loaded))
      setReady(true)
    })
    void refreshAuthSession()
  }, [refreshAuthSession])

  useEffect(() => {
    const onMessage = (message: unknown) => {
      if (!message || typeof message !== 'object' || !('type' in message)) return

      if (message.type === 'auth-success') {
        requestCloseAuthModal()
        return
      }

      if (message.type === 'realtime:groups' && 'payload' in message) {
        const payload = message.payload as GroupsCloudPayload
        setGroups(sortGroupsList(normalizeAllGroups(payload.groups)))
        setSyncStatus('ok')
        setSyncMessage('Grupos atualizados')
        return
      }

      if (message.type === 'realtime:preferences' && 'payload' in message) {
        const payload = message.payload as PreferencesCloudPayload
        applyPreferences(payload.preferences)
        setSyncStatus('ok')
        setSyncMessage('Preferências atualizadas')
      }
    }
    chrome.runtime.onMessage.addListener(onMessage)
    return () => chrome.runtime.onMessage.removeListener(onMessage)
  }, [refreshAuthSession, applyPreferences])

  useEffect(() => {
    const onStorage = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string,
    ) => {
      if (area !== 'local' || !changes[AUTH_TOKEN_STORAGE_KEY]) return
      void refreshAuthSession()
    }
    chrome.storage.onChanged.addListener(onStorage)
    return () => chrome.storage.onChanged.removeListener(onStorage)
  }, [refreshAuthSession])

  useEffect(() => {
    const onChange = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string,
    ) => {
      if (area !== 'local') return

      if (changes[GROUPS_STORAGE_KEY]) {
        const next = changes[GROUPS_STORAGE_KEY].newValue as TabGroup[] | undefined
        if (Array.isArray(next)) {
          setGroups(sortGroupsList(normalizeAllGroups(next)))
        }
      }

      if (changes[PREFERENCES_STORAGE_KEY]) {
        const next = changes[PREFERENCES_STORAGE_KEY].newValue as
          | UserPreferences
          | undefined
        if (next && typeof next === 'object') {
          applyPreferences(next)
        }
      }
    }
    chrome.storage.onChanged.addListener(onChange)
    return () => chrome.storage.onChanged.removeListener(onChange)
  }, [applyPreferences])

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
    if (!authModalMounted) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') requestCloseAuthModal()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [authModalMounted])

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

  function requestCloseAuthModal() {
    authModalOpenRef.current = false
    setAuthModalOpen(false)
  }

  function handleAuthModalBackdropTransitionEnd(
    e: React.TransitionEvent<HTMLDivElement>,
  ) {
    if (e.propertyName !== 'opacity' || e.target !== e.currentTarget) return
    if (!authModalOpenRef.current) {
      setAuthModalMounted(false)
    }
  }

  function openAuthModal() {
    setAuthModalMounted(true)
  }

  async function handleRedeemLicenseKey() {
    const code = licenseKeyInput.trim()
    if (!code) return

    setLicenseKeyBusy(true)
    setSyncMessage('')
    try {
      const { user, subscription: sub } = await redeemAccessKey(code)
      setAuthUser(user)
      setSubscription(sub)
      setLicenseKeyInput('')
      setSyncStatus('ok')
      setSyncMessage('Plano Pro ativado')
      if (hasCloudAccess(sub)) {
        await runCloudSync(sub)
      }
    } catch (error) {
      setSyncStatus('error')
      setSyncMessage(error instanceof Error ? error.message : 'Falha ao resgatar chave')
    } finally {
      setLicenseKeyBusy(false)
    }
  }

  async function handleLogout() {
    await clearStoredToken()
    await chrome.storage.local.remove([
      'oneTabGroupsSyncV1',
      'oneTabPreferencesSyncV1',
    ])
    setAuthUser(null)
    setSubscription(null)
    setSyncStatus('idle')
    setSyncMessage('')
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

  const { map: tabsByDayMap } = useMemo(
    () => buildTabsCountByLocalDay(groups),
    [groups],
  )

  const sidebarCalendarDayButton = useMemo(
    () => createSidebarCalendarDayButton(tabsByDayMap),
    [tabsByDayMap],
  )

  const visible = useMemo(
    () =>
      filterGroups(orderedGroups, search, activeTagSet, groupDateRange),
    [orderedGroups, search, activeTagSet, groupDateRange],
  )

  const visibleTabs = useMemo(
    () => visible.reduce((n, g) => n + g.tabs.length, 0),
    [visible],
  )

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

  async function importGroupsFromFile(file: File) {
    try {
      const parsed = JSON.parse(await file.text()) as GroupsExportFile | unknown
      const rawGroups = Array.isArray(parsed)
        ? parsed
        : (parsed as GroupsExportFile | null)?.groups
      const importedGroups = normalizeAllGroups(rawGroups).filter(
        (g) => g.tabs.length > 0,
      )

      if (importedGroups.length === 0) {
        setGroupsImportStatus('Nenhum grupo válido encontrado no arquivo.')
        return
      }

      const merged = new Map(groups.map((g) => [g.id, g]))
      for (const group of importedGroups) {
        merged.set(group.id, group)
      }
      persist([...merged.values()])
      setGroupsImportStatus(
        `${importedGroups.length} grupo${importedGroups.length === 1 ? '' : 's'} importado${importedGroups.length === 1 ? '' : 's'}.`,
      )
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

  function executeConfirmDelete() {
    const a = confirmAction
    if (!a) return
    if (a.variant === 'all') {
      persist([])
    } else if (a.variant === 'group') {
      persist(groups.filter((g) => g.id !== a.groupId))
    } else {
      const next = groups
        .map((g) =>
          g.id === a.groupId
            ? { ...g, tabs: g.tabs.filter((tab) => tab.id !== a.tabId) }
            : g,
        )
        .filter((g) => g.tabs.length > 0)
      persist(next)
    }
    requestCloseConfirmModal()
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
            onChange={(e) => setSearch(e.target.value)}
            autoComplete="off"
          />
        </label>

        <div className="stats">
          <div className="stat-card">
            <div className="stat-value">{visible.length}</div>
            <div className="stat-label">grupos</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{visibleTabs}</div>
            <div className="stat-label">abas</div>
          </div>
        </div>

        <div className="sidebar-calendar-card">
          <DayPicker
            mode="range"
            selected={groupDateRange}
            onSelect={setGroupDateRange}
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
                onClick={() => setGroupDateRange(undefined)}
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
                  onClick={() => setSimpleLayout((v) => !v)}
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
        </section>

        <div className="sidebar-actions">
          {authUser &&
          !authLoading &&
          (!isBillingEnabled || hasCloudAccess(subscription)) ? (
            <button
              type="button"
              className="btn btn-primary sidebar-footer-btn"
              disabled={syncStatus === 'syncing'}
              onClick={() => void runCloudSync()}
            >
              {syncStatus === 'syncing' ? 'Sincronizando…' : 'Sincronizar'}
            </button>
          ) : null}
          <button
            type="button"
            className="btn btn-outline btn-danger"
            onClick={() => openConfirmDeleteModal({ variant: 'all' })}
            disabled={groups.length === 0}
          >
            <IconTrash />
            Excluir tudo
          </button>
        </div>

        <p className="sidebar-hint">
          Clique no ícone da extensão para salvar a aba atual. Botão direito no
          ícone → <strong>Abrir lista de abas salvas</strong>.
        </p>
        </div>

        <footer className="sidebar-footer" aria-label="Conta e sincronização">
          <div className="sidebar-footer-card">
            <div className="sidebar-footer-head">
              {authUser?.photo ? (
                <img
                  className="sidebar-footer-avatar"
                  src={authUser.photo}
                  alt=""
                  width={36}
                  height={36}
                  referrerPolicy="no-referrer"
                />
              ) : (
                <span className="sidebar-footer-icon" aria-hidden>
                  <IconCloud />
                </span>
              )}
              <div className="sidebar-footer-copy">
                <div className="sidebar-footer-title-row">
                  <p className="sidebar-footer-title">
                    {authUser ? authUser.name : 'Sincronizar na nuvem'}
                  </p>
                  {authUser && isBillingEnabled && subscription ? (
                    <PlanBadge subscription={subscription} />
                  ) : null}
                </div>
                {authUser ? (
                  <>
                    <p className="sidebar-footer-subtitle">{authUser.email}</p>
                    {isBillingEnabled &&
                    subscription &&
                    hasCloudAccess(subscription) ? (
                      <p className="sidebar-footer-plan-detail">
                        {formatSubscriptionLabel(subscription)}
                      </p>
                    ) : null}
                  </>
                ) : null}
                {authUser && syncMessage ? (
                  <p
                    className={`sidebar-footer-sync${syncStatus === 'error' ? ' sidebar-footer-sync--error' : ''}`}
                    role="status"
                  >
                    {syncMessage}
                  </p>
                ) : null}
              </div>
            </div>
            {isBillingEnabled &&
            authUser &&
            !hasCloudAccess(subscription) ? (
              <RedeemKeyForm
                value={licenseKeyInput}
                busy={licenseKeyBusy}
                onChange={setLicenseKeyInput}
                onSubmit={() => void handleRedeemLicenseKey()}
              />
            ) : null}
            {authLoading ? (
              <button
                type="button"
                className="btn btn-primary sidebar-footer-btn"
                disabled
              >
                Carregando…
              </button>
            ) : authUser ? (
              <button
                type="button"
                className="btn btn-outline sidebar-footer-btn"
                onClick={() => void handleLogout()}
              >
                Sair
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-primary sidebar-footer-btn"
                onClick={() => openAuthModal()}
              >
                Entrar
              </button>
            )}
          </div>
        </footer>
      </aside>

      <main className={`main${simpleLayout ? ' main--simple' : ''}`}>
        <header className="main-header">
          <h1 className="main-title">Abas salvas</h1>
          {!simpleLayout ? (
            <p className="main-subtitle">
              Gerencie suas abas do navegador em um só lugar.
            </p>
          ) : null}
        </header>

        {tagIndex.length > 0 ? (
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
                  onClick={() => setActiveTagFilters([])}
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
          {visible.length === 0 ? (
            <div className="empty-state">
              {groups.length === 0
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
                        aria-label="Excluir grupo"
                        title="Excluir grupo"
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
                            onClearViewed={() => setTabViewed(g.id, t.id, false)}
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
                className="modal-dialog"
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
                <div className="modal-actions">
                  <button
                    type="button"
                    className="btn btn-outline modal-btn"
                    onClick={requestCloseConfirmModal}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger-solid modal-btn"
                    onClick={executeConfirmDelete}
                  >
                    {confirmCopy.confirmLabel}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      <AuthModal
        mounted={authModalMounted}
        open={authModalOpen}
        onRequestClose={requestCloseAuthModal}
        onBackdropTransitionEnd={handleAuthModalBackdropTransitionEnd}
        onLoginStarted={requestCloseAuthModal}
      />
    </Fragment>
  )
}

export default App
