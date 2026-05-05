import { useEffect, useRef } from 'react'
import type { DayButtonProps } from 'react-day-picker'

function dotTier(count: number): 'low' | 'mid' | 'high' | null {
  if (count <= 0) return null
  if (count <= 3) return 'low'
  if (count <= 8) return 'mid'
  return 'high'
}

function dotTierLabel(tier: 'low' | 'mid' | 'high'): string {
  if (tier === 'low') return 'poucas abas'
  if (tier === 'mid') return 'volume moderado de abas'
  return 'muitas abas'
}

export function createSidebarCalendarDayButton(
  tabsByDay: Map<string, number>,
) {
  return function SidebarCalendarDayButton(props: DayButtonProps) {
    const { day, modifiers, children, ...buttonProps } = props
    const ref = useRef<HTMLButtonElement>(null)

    useEffect(() => {
      if (modifiers.focused) ref.current?.focus()
    }, [modifiers.focused])

    const count = tabsByDay.get(day.isoDate) ?? 0
    const tier = dotTier(count)

    return (
      <button ref={ref} {...buttonProps} type="button">
        <span className="sidebar-cal-day-inner">
          <span className="sidebar-cal-day-label">{children}</span>
          {tier ? (
            <span
              className={`sidebar-cal-dot sidebar-cal-dot--${tier}`}
              aria-hidden
              title={`${count} aba${count === 1 ? '' : 's'} neste dia (${dotTierLabel(tier)})`}
            />
          ) : null}
        </span>
      </button>
    )
  }
}
