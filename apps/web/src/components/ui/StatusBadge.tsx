'use client';

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

/**
 * StatusBadge — значок статуса с цветовой кодировкой
 * 
 * @example
 * ```tsx
 * <StatusBadge status="ACTIVE" />
 * <StatusBadge status="FINISHED" label="Завершён" />
 * ```
 */
export function StatusBadge({ status, label, className = '' }: StatusBadgeProps) {
  const statusConfig = {
    DRAFT: {
      icon: '📝',
      bg: 'bg-gray-100',
      text: 'text-gray-700',
      label: label || 'Черновик',
    },
    PENDING_CONFIRM: {
      icon: '⏳',
      bg: 'bg-yellow-100',
      text: 'text-yellow-700',
      label: label || 'Ожидание',
    },
    SCHEDULED: {
      icon: '⏰',
      bg: 'bg-blue-100',
      text: 'text-blue-700',
      label: label || 'Запланирован',
    },
    ACTIVE: {
      icon: '🟢',
      bg: 'bg-green-100',
      text: 'text-green-700',
      label: label || 'Активен',
    },
    FINISHED: {
      icon: '✅',
      bg: 'bg-emerald-100',
      text: 'text-emerald-700',
      label: label || 'Завершён',
    },
    CANCELLED: {
      icon: '❌',
      bg: 'bg-red-100',
      text: 'text-red-700',
      label: label || 'Отменён',
    },
    ERROR: {
      icon: '⚠️',
      bg: 'bg-orange-100',
      text: 'text-orange-700',
      label: label || 'Ошибка',
    },
    success: {
      icon: '✓',
      bg: 'bg-green-100',
      text: 'text-green-700',
      label: label || 'Успешно',
    },
    warning: {
      icon: '!',
      bg: 'bg-yellow-100',
      text: 'text-yellow-700',
      label: label || 'Внимание',
    },
    info: {
      icon: 'ℹ',
      bg: 'bg-blue-100',
      text: 'text-blue-700',
      label: label || 'Инфо',
    },
  };

  const config = statusConfig[status] || statusConfig.info;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium ${config.bg} ${config.text} ${className}`}
    >
      <span>{config.icon}</span>
      <span>{config.label}</span>
    </span>
  );
}
