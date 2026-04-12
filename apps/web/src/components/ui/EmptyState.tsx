'use client';

import { Button } from './Button';
import { AppIcon } from '@/components/AppIcon';
import { Mascot } from '@/components/Mascot';

export interface EmptyStateProps {
  icon?: string;
  mascot?: 'state-empty' | 'state-error' | 'state-loading' | 'state-locked' | 'state-success';
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

export function EmptyState({
  icon = 'icon-info',
  mascot = 'state-empty',
  title,
  description,
  action,
  className = '',
}: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center text-center py-8 px-4 ${className}`}>
      <div className="mb-2">
        <Mascot type={mascot} size={120} loop autoplay />
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
