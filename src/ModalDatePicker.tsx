import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import { DayPicker } from 'react-day-picker'
import { useI18n } from './i18n/context'

type ModalDatePickerProps = {
  value?: Date
  onChange: (date: Date) => void
  maxDate?: Date
  label: string
  placeholder?: string
  todayLabel?: string
}

type PopoverCoords = {
  top: number
  left: number
  width: number
}

const POPOVER_ESTIMATED_HEIGHT = 320
const POPOVER_GAP = 8
const POPOVER_MIN_WIDTH = 288

function startOfDay(date: Date): Date {
  const next = new Date(date)
  next.setHours(0, 0, 0, 0)
  return next
}

function IconCalendar() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect
        x="3"
        y="4"
        width="18"
        height="18"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M16 2v4M8 2v4M3 10h18"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

function computePopoverCoords(trigger: HTMLButtonElement): PopoverCoords {
  const rect = trigger.getBoundingClientRect()
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight
  const width = Math.min(
    Math.max(rect.width, POPOVER_MIN_WIDTH),
    viewportWidth - 16,
  )

  let left = rect.left
  if (left + width > viewportWidth - 8) {
    left = viewportWidth - width - 8
  }
  if (left < 8) left = 8

  const spaceBelow = viewportHeight - rect.bottom - POPOVER_GAP
  const spaceAbove = rect.top - POPOVER_GAP
  const openAbove =
    spaceBelow < POPOVER_ESTIMATED_HEIGHT &&
    spaceAbove > spaceBelow &&
    spaceAbove >= POPOVER_ESTIMATED_HEIGHT

  const top = openAbove
    ? Math.max(8, rect.top - POPOVER_ESTIMATED_HEIGHT - POPOVER_GAP)
    : Math.min(
        viewportHeight - POPOVER_ESTIMATED_HEIGHT - 8,
        rect.bottom + POPOVER_GAP,
      )

  return { top, left, width }
}

export function ModalDatePicker({
  value,
  onChange,
  maxDate = new Date(),
  label,
  placeholder: placeholderProp,
  todayLabel: todayLabelProp,
}: ModalDatePickerProps) {
  const { t, formatDisplayDate, dateFnsLocale } = useI18n()
  const placeholder = placeholderProp ?? t('calendar.selectDate')
  const todayLabel = todayLabelProp ?? t('calendar.today')
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState<PopoverCoords | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const panelId = useId()
  const hasValue = value instanceof Date

  const updateCoords = useCallback(() => {
    const trigger = triggerRef.current
    if (!trigger) return
    setCoords(computePopoverCoords(trigger))
  }, [])

  useLayoutEffect(() => {
    if (!open) {
      setCoords(null)
      return
    }
    updateCoords()
  }, [open, updateCoords])

  useEffect(() => {
    if (!open) return

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (rootRef.current?.contains(target)) return
      if (popoverRef.current?.contains(target)) return
      setOpen(false)
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        setOpen(false)
        triggerRef.current?.focus()
      }
    }

    const onReposition = () => updateCoords()

    document.addEventListener('mousedown', onPointerDown)
    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('resize', onReposition)
    window.addEventListener('scroll', onReposition, true)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('resize', onReposition)
      window.removeEventListener('scroll', onReposition, true)
    }
  }, [open, updateCoords])

  function selectDate(date: Date | undefined) {
    if (!date) return
    onChange(startOfDay(date))
    setOpen(false)
    triggerRef.current?.focus()
  }

  function selectToday() {
    selectDate(startOfDay(maxDate))
  }

  const popover =
    open && coords
      ? createPortal(
          <div
            id={panelId}
            ref={popoverRef}
            className="modal-date-picker-popover"
            role="dialog"
            aria-label={label}
            style={{
              top: coords.top,
              left: coords.left,
              width: coords.width,
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <DayPicker
              mode="single"
              selected={hasValue ? value : undefined}
              defaultMonth={hasValue ? value : maxDate}
              onSelect={selectDate}
              locale={dateFnsLocale}
              weekStartsOn={1}
              showOutsideDays
              fixedWeeks
              disabled={{ after: maxDate }}
              className="sidebar-day-picker modal-date-picker-calendar"
            />
            <div className="modal-date-picker-footer">
              <button
                type="button"
                className="modal-date-picker-footer-btn"
                onClick={selectToday}
              >
                {todayLabel}
              </button>
            </div>
          </div>,
          document.body,
        )
      : null

  return (
    <>
      <div
        className={`modal-date-picker${open ? ' modal-date-picker--open' : ''}`}
        ref={rootRef}
      >
        <span className="modal-field-label">{label}</span>
        <button
          ref={triggerRef}
          type="button"
          className="modal-date-picker-trigger"
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-controls={open ? panelId : undefined}
          onClick={() => setOpen((current) => !current)}
        >
          <span
            className={`modal-date-picker-value${hasValue ? '' : ' modal-date-picker-value--placeholder'}`}
          >
            {hasValue ? formatDisplayDate(value) : placeholder}
          </span>
          <span className="modal-date-picker-icon" aria-hidden>
            <IconCalendar />
          </span>
        </button>
      </div>
      {popover}
    </>
  )
}
