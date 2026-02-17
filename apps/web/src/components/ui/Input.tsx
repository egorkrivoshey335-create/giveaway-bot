'use client';

import { InputHTMLAttributes, forwardRef, useState } from 'react';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  fullWidth?: boolean;
}

/**
 * Input — текстовое поле с валидацией и иконками
 * 
 * @example
 * ```tsx
 * <Input 
 *   label="Название розыгрыша"
 *   placeholder="Введите название"
 *   error={errors.title}
 *   value={title}
 *   onChange={(e) => setTitle(e.target.value)}
 * />
 * ```
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      error,
      helperText,
      leftIcon,
      rightIcon,
      fullWidth = false,
      className = '',
      ...props
    },
    ref
  ) => {
    const [isFocused, setIsFocused] = useState(false);

    const widthStyle = fullWidth ? 'w-full' : '';

    return (
      <div className={`${widthStyle} ${className}`}>
        {label && (
          <label className="block mb-2 text-sm font-medium text-tg-text">
            {label}
            {props.required && <span className="text-red-500 ml-1">*</span>}
          </label>
        )}
        
        <div className="relative">
          {leftIcon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-tg-hint">
              {leftIcon}
            </div>
          )}
          
          <input
            ref={ref}
            className={`
              w-full px-4 py-3 rounded-xl
              bg-tg-secondary text-tg-text
              border-2 transition-all duration-200
              ${error 
                ? 'border-red-500 focus:border-red-600' 
                : isFocused 
                  ? 'border-brand' 
                  : 'border-transparent'
              }
              ${leftIcon ? 'pl-10' : ''}
              ${rightIcon ? 'pr-10' : ''}
              focus:outline-none focus:ring-2 focus:ring-brand/20
              disabled:opacity-50 disabled:cursor-not-allowed
              placeholder:text-tg-hint
            `}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            {...props}
          />
          
          {rightIcon && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-tg-hint">
              {rightIcon}
            </div>
          )}
        </div>
        
        {error && (
          <p className="mt-1.5 text-sm text-red-500">{error}</p>
        )}
        
        {helperText && !error && (
          <p className="mt-1.5 text-sm text-tg-hint">{helperText}</p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
