import { useEffect, useRef } from 'react'
import type { DayButtonProps } from 'react-day-picker'

function dotTier(
  count: number,
  maxTabs: number,
): 'low' | 'mid' | 'high' | null {
  if (count <= 0 || maxTabs <= 0) return null
  const r = count / maxTabs
  if (r < 0.34) return 'low'
  if (r < 0.67) return 'mid'
  return 'high'
}

export function createSidebarCalendarDayButton(
  tabsByDay: Map<string, number>,
  maxTabsPerDay: number,
) {
  return function SidebarCalendarDayButton(props: DayButtonProps) {
    const { day, modifiers, children, ...buttonProps } = props
    const ref = useRef<HTMLButtonElement>(null)

    useEffect(() => {
      if (modifiers.focused) ref.current?.focus()
    }, [modifiers.focused])

    const count = tabsByDay.get(day.isoDate) ?? 0
    const tier = dotTier(count, maxTabsPerDay)

    return (
      <button ref={ref} {...buttonProps} type="button">
        <span className="sidebar-cal-day-inner">
          <span className="sidebar-cal-day-label">{children}</span>
          {tier ? (
            <span
              className={`sidebar-cal-dot sidebar-cal-dot--${tier}`}
              aria-hidden
              title={`${count} abas neste dia`}
            />
          ) : null}
        </span>
      </button>
    )
  }
}
