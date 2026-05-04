export const TAG_MAX_LENGTH = 48

/** Tag única: minúsculas, espaços colapsados, limite de tamanho. */
export function normalizeTagInput(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .slice(0, TAG_MAX_LENGTH)
}

/** Várias tags a partir de texto (vírgula ou ponto e vírgula). */
export function parseTagsFromInput(raw: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const part of raw.split(/[,;]+/)) {
    const t = normalizeTagInput(part)
    if (!t || seen.has(t)) continue
    seen.add(t)
    out.push(t)
  }
  return out
}

/** Junta novas tags ao array existente, sem duplicar. */
export function mergeNewTags(existing: string[], rawInput: string): string[] {
  const seen = new Set(existing)
  const out = [...existing]
  for (const t of parseTagsFromInput(rawInput)) {
    if (seen.has(t)) continue
    seen.add(t)
    out.push(t)
  }
  return out.sort((a, b) => a.localeCompare(b, 'pt-BR'))
}

export function normalizeTagsArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const x of raw) {
    if (typeof x !== 'string') continue
    const t = normalizeTagInput(x)
    if (!t || seen.has(t)) continue
    seen.add(t)
    out.push(t)
  }
  return out.sort((a, b) => a.localeCompare(b, 'pt-BR'))
}
