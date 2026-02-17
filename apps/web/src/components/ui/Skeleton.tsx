'use client';

export interface SkeletonProps {
  variant?: 'text' | 'circular' | 'rectangular' | 'card';
  width?: string;
  height?: string;
  count?: number;
  className?: string;
}

/**
 * Skeleton — загрузочный плейсхолдер
 * 
 * @example
 * ```tsx
 * <Skeleton variant="card" count={3} />
 * <Skeleton variant="text" width="60%" />
 * <Skeleton variant="circular" width="48px" height="48px" />
 * ```
 */
export function Skeleton({
  variant = 'rectangular',
  width,
  height,
  count = 1,
  className = '',
}: SkeletonProps) {
  const baseStyles = 'animate-pulse bg-tg-hint/20 rounded';

  const variantStyles = {
    text: 'h-4 rounded',
    circular: 'rounded-full',
    rectangular: 'rounded-xl',
    card: 'h-32 rounded-xl',
  };

  const defaultSizes = {
    text: { width: '100%', height: '1rem' },
    circular: { width: '3rem', height: '3rem' },
    rectangular: { width: '100%', height: '6rem' },
    card: { width: '100%', height: '8rem' },
  };

  const finalWidth = width || defaultSizes[variant].width;
  const finalHeight = height || defaultSizes[variant].height;

  const items = Array.from({ length: count }, (_, i) => i);

  return (
    <>
      {items.map((i) => (
        <div
          key={i}
          className={`${baseStyles} ${variantStyles[variant]} ${className}`}
          style={{
            width: finalWidth,
            height: finalHeight,
            marginBottom: count > 1 && i < count - 1 ? '0.75rem' : undefined,
          }}
        />
      ))}
    </>
  );
}

/**
 * SkeletonGroup — набор типовых скелетонов
 */
export function SkeletonCard() {
  return (
    <div className="bg-tg-secondary rounded-xl p-4 space-y-3">
      <Skeleton variant="text" width="40%" />
      <Skeleton variant="text" width="80%" />
      <Skeleton variant="text" width="60%" />
    </div>
  );
}

export function SkeletonList({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}
