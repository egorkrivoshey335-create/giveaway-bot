'use client';

import { useTranslations } from 'next-intl';
import { AppIcon } from '@/components/AppIcon';

export type StatusType =
  | 'DRAFT'
  | 'PENDING_CONFIRM'
  | 'SCHEDULED'
  | 'ACTIVE'
  | 'FINISHED'
  | 'CANCELLED'
  | 'ERROR'
  | 'success'
  | 'warning'
  | 'info';

export interface StatusBadgeProps {
  status: StatusType;
  label?: string;
  className?: string;
}

const STATUS_CONFIG: Record<
  StatusType,
  { icon: string; bg: string; text: string; labelKey: string }
> = {
  DRAFT:           { icon: 'icon-edit',      bg: 'bg-gray-500/15',   text: 'text-gray-500',   labelKey: 'statusDraft' },
  PENDING_CONFIRM: { icon: 'icon-pending',   bg: 'bg-yellow-500/15', text: 'text-yellow-600', labelKey: 'statusPendingConfirm' },
  SCHEDULED:       { icon: 'icon-calendar',  bg: 'bg-blue-500/15',   text: 'text-blue-500',   labelKey: 'statusScheduled' },
  ACTIVE:          { icon: 'icon-active',    bg: 'bg-green-500/15',  text: 'text-green-500',  labelKey: 'statusActive' },
  FINISHED:        { icon: 'icon-completed', bg: 'bg-purple-500/15', text: 'text-purple-500', labelKey: 'statusFinished' },
  CANCELLED:       { icon: 'icon-cancelled', bg: 'bg-red-500/15',    text: 'text-red-400',    labelKey: 'statusCancelled' },
  ERROR:           { icon: 'icon-error',     bg: 'bg-orange-500/15', text: 'text-orange-500', labelKey: 'statusError' },
  success:         { icon: 'icon-success',   bg: 'bg-green-500/15',  text: 'text-green-500',  labelKey: 'statusSuccess' },
  warning:         { icon: 'icon-error',     bg: 'bg-yellow-500/15', text: 'text-yellow-600', labelKey: 'statusWarning' },
  info:            { icon: 'icon-info',      bg: 'bg-blue-500/15',   text: 'text-blue-500',   labelKey: 'statusInfo' },
};

/**
 * StatusBadge — значок статуса с brand-иконкой и цветовой кодировкой
 *
 * @example
 * ```tsx
 * <StatusBadge status="ACTIVE" />
 * <StatusBadge status="FINISHED" label="Завершён" />
 * ```
 */
export function StatusBadge({ status, label, className = '' }: StatusBadgeProps) {
  const t = useTranslations('common');
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.info;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium ${cfg.bg} ${cfg.text} ${className}`}
    >
      <AppIcon name={cfg.icon} variant="brand" size={14} />
      <span>{label ?? t(cfg.labelKey as Parameters<typeof t>[0])}</span>
    </span>
  );
}
