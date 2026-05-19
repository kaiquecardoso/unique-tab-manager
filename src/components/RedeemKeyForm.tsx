import type { FormEvent } from 'react'

type RedeemKeyFormProps = {
  value: string
  busy: boolean
  onChange: (value: string) => void
  onSubmit: () => void
}

export function RedeemKeyForm({ value, busy, onChange, onSubmit }: RedeemKeyFormProps) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!busy && value.trim()) {
      onSubmit()
    }
  }

  return (
    <form className="redeem-key-form" onSubmit={handleSubmit}>
      <label className="redeem-key-form-label" htmlFor="redeem-key-input">
        Código de acesso
      </label>
      <input
        id="redeem-key-input"
        type="text"
        className="redeem-key-form-input"
        placeholder="OTM-XXXX-XXXX-XXXX"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
        spellCheck={false}
        disabled={busy}
      />
      <button
        type="submit"
        className="btn btn-primary redeem-key-form-submit"
        disabled={busy || !value.trim()}
      >
        {busy ? 'Resgatando…' : 'Resgatar código'}
      </button>
    </form>
  )
}
