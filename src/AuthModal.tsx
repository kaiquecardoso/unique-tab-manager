import { useEffect, useState, type TransitionEvent } from 'react'
import { createPortal } from 'react-dom'

type AuthProvider = 'google' | 'twitch'

type AuthModalProps = {
  mounted: boolean
  open: boolean
  onRequestClose: () => void
  onBackdropTransitionEnd: (event: TransitionEvent<HTMLDivElement>) => void
}

function IconGoogle() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  )
}

function IconTwitch() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#9146FF"
        d="M4 3h16v12.5l-4 4h-3l-2.5 2.5V19.5H9V15.5H4V3zm14 10.5 2.5-2.5V5H6v8.5h3v3.5l2.5-2.5H14v-3h4z"
      />
      <path fill="#fff" d="M14 7.5h2v5h-2v-5zm-5 0h2v5H9v-5z" />
    </svg>
  )
}

const PROVIDER_LABEL: Record<AuthProvider, string> = {
  google: 'Continuar com Google',
  twitch: 'Continuar com Twitch',
}

export function AuthModal({
  mounted,
  open,
  onRequestClose,
  onBackdropTransitionEnd,
}: AuthModalProps) {
  const [feedback, setFeedback] = useState('')

  useEffect(() => {
    if (!mounted || !open) return
    setFeedback('')
  }, [mounted, open])

  if (!mounted) return null

  function handleProviderLogin(provider: AuthProvider) {
    setFeedback(
      `Login com ${provider === 'google' ? 'Google' : 'Twitch'} em breve. A sincronização na nuvem ainda não está disponível.`,
    )
  }

  return createPortal(
    <div
      className={`modal-backdrop${open ? ' modal-backdrop--open' : ''}`}
      role="presentation"
      onClick={onRequestClose}
      onTransitionEnd={onBackdropTransitionEnd}
    >
      <div
        className="modal-dialog modal-dialog--auth"
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-modal-title"
        aria-describedby="auth-modal-desc"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="auth-modal-title" className="modal-title">
          Sincronizar na nuvem
        </h2>
        <p id="auth-modal-desc" className="modal-body auth-modal-subtitle">
          Entre com Google ou Twitch para manter seus grupos e abas sincronizados
          entre dispositivos. O login é opcional.
        </p>

        <div className="auth-oauth-list">
          <button
            type="button"
            className="auth-oauth-btn auth-oauth-btn--google"
            onClick={() => handleProviderLogin('google')}
          >
            <span className="auth-oauth-btn-icon" aria-hidden>
              <IconGoogle />
            </span>
            {PROVIDER_LABEL.google}
          </button>
          <button
            type="button"
            className="auth-oauth-btn auth-oauth-btn--twitch"
            onClick={() => handleProviderLogin('twitch')}
          >
            <span className="auth-oauth-btn-icon" aria-hidden>
              <IconTwitch />
            </span>
            {PROVIDER_LABEL.twitch}
          </button>
        </div>

        {feedback ? (
          <p className="auth-modal-feedback" role="status">
            {feedback}
          </p>
        ) : null}

        <div className="modal-actions auth-modal-actions">
          <button
            type="button"
            className="btn btn-outline modal-btn auth-modal-cancel"
            onClick={onRequestClose}
          >
            Agora não
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
