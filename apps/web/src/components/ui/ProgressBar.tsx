'use client';

export interface ProgressBarProps {
  currentStep: number;
  totalSteps: number;
  labels?: string[];
  className?: string;
}

/**
 * ProgressBar — индикатор прогресса (точки для wizard)
 * 
 * @example
 * ```tsx
 * <ProgressBar 
 *   currentStep={3} 
 *   totalSteps={10}
 *   labels={['Тип', 'Настройки', 'Каналы', '...']}
 * />
 * ```
 */
export function ProgressBar({
  currentStep,
  totalSteps,
  labels,
  className = '',
}: ProgressBarProps) {
  const steps = Array.from({ length: totalSteps }, (_, i) => i + 1);

  return (
    <div className={`flex items-center justify-center gap-2 ${className}`}>
      {steps.map((step) => {
        const isActive = step === currentStep;
        const isCompleted = step < currentStep;
        const label = labels?.[step - 1];

        return (
          <div key={step} className="flex flex-col items-center gap-1">
            <div
              className={`
                w-2.5 h-2.5 rounded-full transition-all duration-200
                ${isCompleted ? 'bg-brand scale-110' : ''}
                ${isActive ? 'bg-brand scale-125' : ''}
                ${!isActive && !isCompleted ? 'bg-tg-hint/30' : ''}
              `}
              title={label}
            />
            {label && isActive && (
              <span className="text-xs text-tg-hint mt-1">{label}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
