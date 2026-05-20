import { getApiUrl, AUTH_TOKEN_STORAGE_KEY, getStoredToken } from './api'
import { isCloudEnabled } from './cloudEnabled'
import { getClientId } from './clientId'
import { normalizeAllGroups, saveGroupsFromRemote } from './groupsStorage'
import {
  hasLocalGroupsEditPending,
  markRemoteGroupsApply,
  stashDeferredRemoteGroups,
} from './groupsLocalEdit'
import { SYNC_META_STORAGE_KEY } from './groupsSync'
import {
  applyCloudPreferences,
  type PreferencesCloudPayload,
} from './preferencesSync'
import type { GroupsCloudPayload } from './groupsSync'

type RealtimeEvent =
  | { type: 'auth:ok' }
  | { type: 'auth:error'; message: string }
  | {
      type: 'groups:updated'
      payload: GroupsCloudPayload
      originClientId?: string | null
    }
  | {
      type: 'preferences:updated'
      payload: PreferencesCloudPayload
      originClientId?: string | null
    }

let socket: WebSocket | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let reconnectAttempt = 0

function getWsUrl(): string {
  const api = getApiUrl()
  if (api.startsWith('https://')) {
    return `${api.replace('https://', 'wss://')}/ws`
  }
  return `${api.replace('http://', 'ws://')}/ws`
}

function scheduleReconnect(): void {
  if (reconnectTimer) return
  const delay = Math.min(30_000, 1000 * 2 ** reconnectAttempt)
  reconnectAttempt += 1
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    void ensureRealtimeConnection()
  }, delay)
}

async function handleEvent(event: RealtimeEvent): Promise<void> {
  if (event.type === 'auth:ok') {
    reconnectAttempt = 0
    return
  }

  if (event.type === 'auth:error') {
    disconnectRealtime()
    return
  }

  const clientId = await getClientId()
  if (event.originClientId && event.originClientId === clientId) {
    return
  }

  if (event.type === 'groups:updated') {
    if (await hasLocalGroupsEditPending()) {
      await stashDeferredRemoteGroups(event.payload)
      return
    }

    markRemoteGroupsApply()
    const groups = normalizeAllGroups(event.payload.groups)
    await saveGroupsFromRemote(groups)
    await chrome.storage.local.set({
      [SYNC_META_STORAGE_KEY]: {
        localUpdatedAt: event.payload.updatedAt,
        serverUpdatedAt: event.payload.updatedAt,
      },
    })
    try {
      await chrome.runtime.sendMessage({
        type: 'realtime:groups',
        payload: event.payload,
      })
    } catch {
      /* página de opções fechada */
    }
    return
  }

  if (event.type === 'preferences:updated') {
    await applyCloudPreferences(event.payload)
    try {
      await chrome.runtime.sendMessage({
        type: 'realtime:preferences',
        payload: event.payload,
      })
    } catch {
      /* página de opções fechada */
    }
  }
}

export function disconnectRealtime(): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
  if (socket) {
    socket.close()
    socket = null
  }
}

export async function ensureRealtimeConnection(): Promise<void> {
  if (!isCloudEnabled) {
    disconnectRealtime()
    return
  }

  const token = await getStoredToken()
  if (!token) {
    disconnectRealtime()
    return
  }

  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    return
  }

  const ws = new WebSocket(getWsUrl())
  socket = ws

  ws.onopen = async () => {
    const clientId = await getClientId()
    ws.send(
      JSON.stringify({
        type: 'auth',
        token: await getStoredToken(),
        clientId,
      }),
    )
  }

  ws.onmessage = (message) => {
    try {
      const event = JSON.parse(String(message.data)) as RealtimeEvent
      void handleEvent(event)
    } catch {
      /* mensagem inválida */
    }
  }

  ws.onclose = () => {
    socket = null
    void getStoredToken().then((t) => {
      if (t) scheduleReconnect()
    })
  }

  ws.onerror = () => {
    ws.close()
  }
}

export function registerRealtimeListeners(): void {
  if (!isCloudEnabled) return

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return

    if (changes[AUTH_TOKEN_STORAGE_KEY]) {
      if (changes[AUTH_TOKEN_STORAGE_KEY].newValue) {
        void ensureRealtimeConnection()
      } else {
        disconnectRealtime()
      }
    }
  })

  void ensureRealtimeConnection()
}
