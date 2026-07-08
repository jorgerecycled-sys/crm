import { cn } from '@/lib/utils'
import { LucideIcon, TrendingUp, TrendingDown } from 'lucide-react'

interface StatCardProps {
  title: string
  value: string | number
  icon: LucideIcon
  iconColor?: string
  iconBg?: string
  trend?: number
  description?: string
  subtitle?: string
  className?: string
}

export function StatCard({
  title,
  value,
  icon: Icon,
  iconColor = 'text-primary',
  iconBg = 'bg-primary/10',
  trend,
  description,
  subtitle,
  className,
}: StatCardProps) {
  return (
    <div
      className={cn(
        'bg-card border border-border rounded-xl p-5 flex items-start gap-4',
        className
      )}
    >
      <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center shrink-0', iconBg)}>
        <Icon className={cn('w-5 h-5', iconColor)} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{title}</p>
        <p className="text-2xl font-bold text-foreground mt-0.5">{value}</p>
        {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
        {(trend !== undefined || description) && (
          <div className="flex items-center gap-1 mt-1">
            {trend !== undefined && (
              <>
                {trend >= 0 ? (
                  <TrendingUp className="w-3.5 h-3.5 text-green-400" />
                ) : (
                  <TrendingDown className="w-3.5 h-3.5 text-red-400" />
                )}
                <span
                  className={cn(
                    'text-xs font-medium',
                    trend >= 0 ? 'text-green-400' : 'text-red-400'
                  )}
                >
                  {trend >= 0 ? '+' : ''}{trend}%
                </span>
              </>
            )}
            {description && (
              <span className="text-xs text-muted-foreground">{description}</span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
