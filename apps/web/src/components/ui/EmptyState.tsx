'use client';

import { Button } from './Button';
import { AppIcon } from '@/components/AppIcon';

export interface EmptyStateProps {
  icon?: string;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

/**
 * EmptyState — пустое состояние списка
 * 
 * @example
 * ```tsx
 * <EmptyState
 *   icon="icon-giveaway"
 *   title="Нет розыгрышей"
 *   description="Вы ещё не создали ни одного розыгрыша"
 *   action={{
 *     label: 'Создать розыгрыш',
 *     onClick: () => router.push('/creator/giveaway/new'),
 *   }}
 * />
 * ```
 */
export function EmptyState({
  icon = 'icon-info',
  title,
  description,
  action,
  className = '',
}: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center text-center py-12 px-4 ${className}`}>
      <div className="mb-4 opacity-50">
        <AppIcon name={icon} size={56} />
      </div>
      
      <h3 className="text-lg font-semibold text-tg-text mb-2">
        {title}
      </h3>
      
      {description && (
        <p className="text-tg-hint text-sm mb-6 max-w-md">
          {description}
        </p>
      )}
      
      {action && (
        <Button
          variant="primary"
          onClick={action.onClick}
        >
          {action.label}
        </Button>
      )}
    </div>
  );
}
