import React from 'react';
import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StatCardProps {
  title: string;
  value: number | string;
  icon: LucideIcon;
  variant?: 'default' | 'yellow' | 'green' | 'primary';
  subtitle?: string;
  trend?: {
    value: number;
    isPositive: boolean;
  };
}

const variantStyles = {
  default: {
    container: 'bg-card border-border',
    icon: 'bg-primary/10 text-primary',
    value: 'text-foreground',
  },
  yellow: {
    container: 'bg-yellow-sticker-light border-yellow-sticker/20',
    icon: 'bg-yellow-sticker/20 text-yellow-sticker',
    value: 'text-yellow-sticker-foreground',
  },
  green: {
    container: 'bg-green-sticker-light border-green-sticker/20',
    icon: 'bg-green-sticker/20 text-green-sticker',
    value: 'text-green-sticker-foreground',
  },
  primary: {
    container: 'bg-primary text-primary-foreground border-primary',
    icon: 'bg-primary-foreground/20 text-primary-foreground',
    value: 'text-primary-foreground',
  },
};

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  icon: Icon,
  variant = 'default',
  subtitle,
  trend,
}) => {
  const styles = variantStyles[variant];

  return (
    <div
      className={cn(
        'stat-card animate-fade-in',
        styles.container
      )}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className={cn(
            'text-sm font-medium',
            variant === 'primary' ? 'text-primary-foreground/80' : 'text-muted-foreground'
          )}>
            {title}
          </p>
          <p className={cn('text-3xl font-bold mt-2', styles.value)}>
            {typeof value === 'number' ? value.toLocaleString() : value}
          </p>
          {subtitle && (
            <p className={cn(
              'text-sm mt-1',
              variant === 'primary' ? 'text-primary-foreground/70' : 'text-muted-foreground'
            )}>
              {subtitle}
            </p>
          )}
          {trend && (
            <div className="flex items-center gap-1 mt-2">
              <span
                className={cn(
                  'text-sm font-medium',
                  trend.isPositive ? 'text-success' : 'text-destructive'
                )}
              >
                {trend.isPositive ? '+' : ''}{trend.value}%
              </span>
              <span className={cn(
                'text-xs',
                variant === 'primary' ? 'text-primary-foreground/60' : 'text-muted-foreground'
              )}>
                vs last week
              </span>
            </div>
          )}
        </div>
        <div className={cn('flex h-11 w-11 items-center justify-center rounded-lg', styles.icon)}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
};
