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
import { mergeNewTags } from './lib/tags'
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

function TabRow({
  tab: t,
  onRequestRemove,
  onRequestEditTitle,
  onSetTags,
  existingTagOptions,
}: {
  tab: SavedTab
  onRequestRemove: () => void
  onRequestEditTitle: () => void
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
    void chrome.tabs.create({ url: t.url })
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
    <div className="tab-row">
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
            width={32}
            height={32}
            loading="lazy"
          />
          <div className="tab-text">
            <div className="tab-title-row">
              <div className="tab-title">{t.title}</div>
              <button
                type="button"
                className="tab-title-edit"
                aria-label={`Editar título de ${t.title}`}
                onClick={(e) => {
                  e.stopPropagation()
                  onRequestEditTitle()
                }}
              >
                <IconPencil />
              </button>
            </div>
            <div className="tab-subline">
              <span className="tab-host">{host}</span>
              <span className="tab-subline-sep" aria-hidden>
                ·
              </span>
              <time className="tab-added" dateTime={t.addedAt}>
                {formatTabAddedAt(t.addedAt)}
              </time>
            </div>
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

const THEME_STORAGE_KEY = 'one-tab-manager-theme'

function App() {
  const [groups, setGroups] = useState<TabGroup[]>([])
  const [ready, setReady] = useState(false)
  const [search, setSearch] = useState('')
  const [activeTagFilters, setActiveTagFilters] = useState<string[]>([])
  const [groupDateRange, setGroupDateRange] = useState<
    DateRange | undefined
  >()
  const [darkMode, setDarkMode] = useState(() => {
    try {
      return localStorage.getItem(THEME_STORAGE_KEY) === 'dark'
    } catch {
      return false
    }
  })
  const [confirmModalMounted, setConfirmModalMounted] = useState(false)
  const [confirmModalOpen, setConfirmModalOpen] = useState(false)
  const confirmModalOpenRef = useRef(false)
  const [confirmAction, setConfirmAction] =
    useState<ConfirmDeleteAction | null>(null)
  const [editTitleModalMounted, setEditTitleModalMounted] = useState(false)
  const [editTitleModalOpen, setEditTitleModalOpen] = useState(false)
  const editTitleModalOpenRef = useRef(false)
  const editTitleInputRef = useRef<HTMLInputElement>(null)
  const [editTitleAction, setEditTitleAction] =
    useState<EditTabTitleAction | null>(null)
  const [editTitleDraft, setEditTitleDraft] = useState('')

  useEffect(() => {
    confirmModalOpenRef.current = confirmModalOpen
  }, [confirmModalOpen])

  useEffect(() => {
    editTitleModalOpenRef.current = editTitleModalOpen
  }, [editTitleModalOpen])

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

  const persist = useCallback((next: TabGroup[]) => {
    const sorted = sortGroupsList(next)
    setGroups(sorted)
    void saveGroups(sorted)
  }, [])

  useEffect(() => {
    if (!confirmModalMounted && !editTitleModalMounted) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [confirmModalMounted, editTitleModalMounted])

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
    document.documentElement.setAttribute(
      'data-theme',
      darkMode ? 'dark' : 'light',
    )
    try {
      localStorage.setItem(THEME_STORAGE_KEY, darkMode ? 'dark' : 'light')
    } catch {
      /* armazenamento indisponível (ex.: contexto restrito) */
    }
  }, [darkMode])

  useEffect(() => {
    void loadGroups().then((loaded) => {
      setGroups(sortGroupsList(loaded))
      setReady(true)
    })
  }, [])

  useEffect(() => {
    const onChange = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string,
    ) => {
      if (area !== 'local' || !changes[GROUPS_STORAGE_KEY]) return
      const next = changes[GROUPS_STORAGE_KEY].newValue as TabGroup[] | undefined
      if (Array.isArray(next))
        setGroups(sortGroupsList(normalizeAllGroups(next)))
    }
    chrome.storage.onChanged.addListener(onChange)
    return () => chrome.storage.onChanged.removeListener(onChange)
  }, [])

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

  function requestCloseConfirmModal() {
    confirmModalOpenRef.current = false
    setConfirmModalOpen(false)
  }

  function requestCloseEditTitleModal() {
    editTitleModalOpenRef.current = false
    setEditTitleModalOpen(false)
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

  function openConfirmDeleteModal(action: ConfirmDeleteAction) {
    setConfirmAction(action)
    setConfirmModalMounted(true)
  }

  function openEditTabTitleModal(action: EditTabTitleAction) {
    setEditTitleAction(action)
    setEditTitleDraft(action.title)
    setEditTitleModalMounted(true)
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

  const { map: tabsByDayMap, max: maxTabsPerDay } = useMemo(
    () => buildTabsCountByLocalDay(groups),
    [groups],
  )

  const sidebarCalendarDayButton = useMemo(
    () => createSidebarCalendarDayButton(tabsByDayMap, maxTabsPerDay),
    [tabsByDayMap, maxTabsPerDay],
  )

  const visible = useMemo(
    () =>
      filterGroups(orderedGroups, search, activeTagSet, groupDateRange),
    [orderedGroups, search, activeTagSet, groupDateRange],
  )

  const totalTabs = useMemo(
    () => groups.reduce((n, g) => n + g.tabs.length, 0),
    [groups],
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

  function submitEditTabTitle() {
    if (!editTitleAction) return
    const title = editTitleDraft.trim()
    if (title && title !== editTitleAction.title) {
      setTabTitle(editTitleAction.groupId, editTitleAction.tabId, title)
    }
    requestCloseEditTitleModal()
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
      <aside className="sidebar">
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
            <div className="stat-value">{groups.length}</div>
            <div className="stat-label">grupos</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{totalTabs}</div>
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

        <div className="sidebar-theme-row">
          <span className="sidebar-theme-label" id="theme-switch-label">
            Modo escuro
          </span>
          <button
            type="button"
            className="theme-switch"
            role="switch"
            aria-checked={darkMode}
            aria-labelledby="theme-switch-label"
            onClick={() => setDarkMode((v) => !v)}
          >
            <span className="theme-switch__knob" aria-hidden />
          </button>
        </div>

        <div className="sidebar-actions">
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
      </aside>

      <main className="main">
        <header className="main-header">
          <h1 className="main-title">Abas salvas</h1>
          <p className="main-subtitle">
            Gerencie suas abas do navegador em um só lugar.
          </p>
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
                <article key={g.id} className="group-card">
                  <div className="group-header">
                    <button
                      type="button"
                      className="group-header-lead"
                      id={`group-header-${g.id}`}
                      onClick={() => toggleExpanded(g.id)}
                      aria-expanded={g.expanded}
                      aria-controls={`group-panel-${g.id}`}
                    >
                      <IconChevron open={g.expanded} />
                      <span className="group-folder-icon" aria-hidden>
                        <IconFolder />
                      </span>
                      <span className="group-date">
                        {g.customTitle ?? formatGroupPrimary(saved)}
                      </span>
                    </button>
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
                        aria-label="Editar nome do grupo"
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
    </Fragment>
  )
}

export default App
