/** Fila serializada com debounce — evita PUTs paralelos e perda ao recarregar a página. */
export function createCloudSyncQueue() {
  let chain: Promise<void> = Promise.resolve()
  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  let pendingRun: (() => Promise<void>) | null = null

  function scheduleDebounced(debounceMs: number, run: () => Promise<void>): void {
    pendingRun = run
    if (debounceTimer) {
      clearTimeout(debounceTimer)
    }
    debounceTimer = setTimeout(() => {
      debounceTimer = null
      void runQueued()
    }, debounceMs)
  }

  function runImmediate(run: () => Promise<void>): Promise<void> {
    if (debounceTimer) {
      clearTimeout(debounceTimer)
      debounceTimer = null
    }
    pendingRun = run
    return runQueued()
  }

  function flush(): Promise<void> {
    if (debounceTimer) {
      clearTimeout(debounceTimer)
      debounceTimer = null
    }
    if (!pendingRun) {
      return Promise.resolve()
    }
    return runQueued()
  }

  function runQueued(): Promise<void> {
    const job = pendingRun
    if (!job) {
      return Promise.resolve()
    }
    pendingRun = null

    const next = chain.then(
      () => job(),
      () => job(),
    )
    chain = next.then(
      () => undefined,
      () => undefined,
    )
    return next
  }

  function hasPending(): boolean {
    return pendingRun !== null || debounceTimer !== null
  }

  return { scheduleDebounced, runImmediate, flush, hasPending }
}
