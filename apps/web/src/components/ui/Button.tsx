'use client';

import { ButtonHTMLAttributes, forwardRef } from 'react';
import { motion, HTMLMotionProps } from 'framer-motion';

// Исключаем конфликтующие props между React и Framer Motion
type MotionButtonProps = Omit<
  HTMLMotionProps<'button'>,
  'onAnimationStart' | 'onDragStart' | 'onDragEnd' | 'onDrag'
>;

export interface ButtonProps extends Omit<MotionButtonProps, 'children'> {
  variant?: 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
  fullWidth?: boolean;
  children?: React.ReactNode;
}

/**
 * Универсальная кнопка с поддержкой вариантов, размеров, иконок и loading state
 * Использует Framer Motion для плавных анимаций
 * 
 * @example
 * ```tsx
 * <Button variant="primary" loading={isLoading}>
 *   Создать розыгрыш
 * </Button>
 * 
 * <Button variant="outline" icon={<PlusIcon />}>
 *   Добавить
 * </Button>
 * ```
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      loading = false,
      icon,
      iconPosition = 'left',
      fullWidth = false,
      className = '',
      children,
      disabled,
      ...props
    },
    ref
  ) => {
    const baseStyles = 'inline-flex items-center justify-center font-medium rounded-xl transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed';

    const variantStyles = {
      primary: 'bg-brand text-white hover:bg-brand-600 active:bg-brand-700 focus:ring-brand-400',
      secondary: 'bg-tg-secondary text-tg-text hover:bg-tg-secondary/80 active:bg-tg-secondary/70 focus:ring-tg-secondary',
      outline: 'border-2 border-brand text-brand bg-transparent hover:bg-brand-50 active:bg-brand-100 focus:ring-brand-400',
      danger: 'bg-red-500 text-white hover:bg-red-600 active:bg-red-700 focus:ring-red-400',
      ghost: 'text-tg-text hover:bg-tg-secondary/50 active:bg-tg-secondary/70 focus:ring-tg-secondary',
    };

    const sizeStyles = {
      sm: 'px-3 py-1.5 text-sm',
      md: 'px-4 py-2.5 text-base',
      lg: 'px-6 py-3.5 text-lg',
    };

    const iconSizeStyles = {
      sm: 'w-4 h-4',
      md: 'w-5 h-5',
      lg: 'w-6 h-6',
    };

    const widthStyle = fullWidth ? 'w-full' : '';

    return (
      <motion.button
        ref={ref}
        className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${widthStyle} ${className}`}
        disabled={disabled || loading}
        whileTap={disabled || loading ? undefined : { scale: 0.98 }}
        whileHover={disabled || loading ? undefined : { scale: 1.02 }}
        transition={{
          type: 'spring',
          stiffness: 400,
          damping: 17,
        }}
        {...props}
      >
        {loading && (
          <svg
            className={`animate-spin ${iconSizeStyles[size]} ${iconPosition === 'right' ? 'ml-2' : 'mr-2'}`}
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        )}
        {!loading && icon && iconPosition === 'left' && (
          <span className={`${iconSizeStyles[size]} mr-2`}>{icon}</span>
        )}
        {children}
        {!loading && icon && iconPosition === 'right' && (
          <span className={`${iconSizeStyles[size]} ml-2`}>{icon}</span>
        )}
      </motion.button>
    );
  }
);

Button.displayName = 'Button';
