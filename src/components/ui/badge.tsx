import { cn } from '@/lib/utils'
import { STATUS_COLORS, STATUS_LABELS, PRIORITY_COLORS } from '@/lib/utils'

interface BadgeProps {
  value: string
  type?: 'status' | 'priority' | 'default'
  className?: string
}

export function Badge({ value, type = 'status', className }: BadgeProps) {
  const colorMap = type === 'priority' ? PRIORITY_COLORS : STATUS_COLORS
  const color = colorMap[value] ?? 'bg-gray-500/10 text-gray-400 border-gray-500/20'
  const label = STATUS_LABELS[value] ?? value

  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border',
        color,
        className
      )}
    >
      {label}
    </span>
  )
}
