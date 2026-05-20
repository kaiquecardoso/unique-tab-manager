/** Garante `localUpdatedAt` >= servidor (evita conflito quando o relógio do PC está atrás). */
export function nextLocalUpdatedAtIso(
  serverUpdatedAt: string | null | undefined,
): string {
  const serverMs =
    serverUpdatedAt && !Number.isNaN(Date.parse(serverUpdatedAt))
      ? Date.parse(serverUpdatedAt)
      : 0
  return new Date(Math.max(Date.now(), serverMs + 1)).toISOString()
}
