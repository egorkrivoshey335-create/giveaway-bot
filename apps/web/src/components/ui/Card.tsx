'use client';

import { motion } from 'framer-motion';

export interface CardProps {
  children: React.ReactNode;
  variant?: 'default' | 'interactive' | 'outline';
  padding?: 'none' | 'sm' | 'md' | 'lg';
  className?: string;
  onClick?: () => void;
}

/**
 * Card — универсальная карточка для контента
 * 
 * @example
 * ```tsx
 * <Card variant="interactive" onClick={() => navigate('/giveaway/123')}>
 *   <h3>Розыгрыш iPhone</h3>
 *   <p>Участников: 1234</p>
 * </Card>
 * ```
 */
export function Card({
  children,
  variant = 'default',
  padding = 'md',
  className = '',
  onClick,
}: CardProps) {
  const baseStyles = 'rounded-xl bg-tg-secondary transition-all duration-200';
  
  const variantStyles = {
    default: '',
    interactive: 'cursor-pointer hover:bg-tg-secondary/80 active:scale-[0.98]',
    outline: 'border-2 border-tg-hint/20',
  };

  const paddingStyles = {
    none: 'p-0',
    sm: 'p-3',
    md: 'p-4',
    lg: 'p-6',
  };

  const Component = onClick ? motion.div : 'div';
  const motionProps = onClick
    ? {
        whileTap: { scale: 0.98 },
        onClick,
      }
    : {};

  return (
    <Component
      className={`${baseStyles} ${variantStyles[variant]} ${paddingStyles[padding]} ${className}`}
      {...motionProps}
    >
      {children}
    </Component>
  );
}
