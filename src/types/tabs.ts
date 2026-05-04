export type SavedTab = {
  id: string
  title: string
  url: string
  /** ISO 8601 — momento em que a aba foi salva na extensão. */
  addedAt: string
}

export type TabGroup = {
  id: string
  savedAt: string
  tabs: SavedTab[]
  expanded: boolean
  /** Título editável pelo usuário (substitui a data na linha principal). */
  customTitle?: string
  pinned?: boolean
}
