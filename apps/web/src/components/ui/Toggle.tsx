'use client';

import { motion } from 'framer-motion';

export interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * Toggle (тумблер) с анимацией
 * 
 * @example
 * ```tsx
 * const [enabled, setEnabled] = useState(false);
 * 
 * <Toggle 
 *   checked={enabled} 
 *   onChange={setEnabled}
 *   label="Включить капчу"
 * />
 * ```
 */
export function Toggle({ checked, onChange, label, disabled = false, className = '' }: ToggleProps) {
  return (
    <label className={`inline-flex items-center cursor-pointer ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${className}`}>
      {label && <span className="mr-3 text-tg-text font-medium">{label}</span>}
      
      <div
        className={`relative w-12 h-7 rounded-full transition-colors ${
          checked ? 'bg-brand' : 'bg-tg-hint/30'
        } ${disabled ? '' : 'hover:opacity-90'}`}
        onClick={() => !disabled && onChange(!checked)}
      >
        <motion.div
          className="absolute top-1 w-5 h-5 bg-white rounded-full shadow-md"
          initial={false}
          animate={{
            left: checked ? '26px' : '4px',
          }}
          transition={{
            type: 'spring',
            stiffness: 500,
            damping: 30,
          }}
        />
      </div>
      
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => !disabled && onChange(e.target.checked)}
        disabled={disabled}
        className="sr-only"
      />
    </label>
  );
}
