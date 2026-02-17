'use client';

import { SelectHTMLAttributes, forwardRef } from 'react';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  label?: string;
  error?: string;
  helperText?: string;
  options: SelectOption[];
  placeholder?: string;
  fullWidth?: boolean;
}

/**
 * Select — выпадающий список
 * 
 * @example
 * ```tsx
 * <Select
 *   label="Язык розыгрыша"
 *   options={[
 *     { value: 'ru', label: '🇷🇺 Русский' },
 *     { value: 'en', label: '🇬🇧 English' },
 *     { value: 'kk', label: '🇰🇿 Қазақша' },
 *   ]}
 *   value={language}
 *   onChange={(e) => setLanguage(e.target.value)}
 * />
 * ```
 */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  (
    {
      label,
      error,
      helperText,
      options,
      placeholder,
      fullWidth = false,
      className = '',
      ...props
    },
    ref
  ) => {
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
          <select
            ref={ref}
            className={`
              w-full px-4 py-3 pr-10 rounded-xl appearance-none
              bg-tg-secondary text-tg-text
              border-2 border-transparent
              focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20
              disabled:opacity-50 disabled:cursor-not-allowed
              transition-all duration-200
              ${error ? 'border-red-500 focus:border-red-600' : ''}
            `}
            {...props}
          >
            {placeholder && (
              <option value="" disabled>
                {placeholder}
              </option>
            )}
            {options.map((option) => (
              <option
                key={option.value}
                value={option.value}
                disabled={option.disabled}
              >
                {option.label}
              </option>
            ))}
          </select>
          
          {/* Chevron icon */}
          <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="w-5 h-5 text-tg-hint"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </div>
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

Select.displayName = 'Select';
