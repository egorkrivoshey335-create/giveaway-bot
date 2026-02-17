'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { hapticConfirm, hapticCancel } from '@/lib/haptic';

export interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'info';
  icon?: string;
}

/**
 * ConfirmDialog — модальное окно подтверждения действия
 * 
 * @example
 * ```tsx
 * const [showConfirm, setShowConfirm] = useState(false);
 * 
 * <ConfirmDialog
 *   isOpen={showConfirm}
 *   onClose={() => setShowConfirm(false)}
 *   onConfirm={() => {
 *     handleDelete();
 *     setShowConfirm(false);
 *   }}
 *   title="Удалить розыгрыш?"
 *   description="Это действие нельзя отменить"
 *   variant="danger"
 * />
 * ```
 */
export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmText = 'Подтвердить',
  cancelText = 'Отмена',
  variant = 'info',
  icon,
}: ConfirmDialogProps) {
  
  const handleConfirm = () => {
    hapticConfirm();
    onConfirm();
  };

  const handleCancel = () => {
    hapticCancel();
    onClose();
  };

  // Получить цвета в зависимости от варианта
  const getVariantStyles = () => {
    switch (variant) {
      case 'danger':
        return {
          confirmBg: 'bg-red-500 hover:bg-red-600',
          confirmText: 'text-white',
          icon: icon || '⚠️',
        };
      case 'warning':
        return {
          confirmBg: 'bg-yellow-500 hover:bg-yellow-600',
          confirmText: 'text-white',
          icon: icon || '⚠️',
        };
      case 'info':
      default:
        return {
          confirmBg: 'bg-tg-button hover:bg-tg-button/90',
          confirmText: 'text-tg-button-text',
          icon: icon || 'ℹ️',
        };
    }
  };

  const styles = getVariantStyles();

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={handleCancel}
          />

          {/* Dialog */}
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              className="bg-tg-bg rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden"
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Content */}
              <div className="p-6 text-center">
                {/* Icon */}
                <div className="text-5xl mb-4">{styles.icon}</div>

                {/* Title */}
                <h2 className="text-xl font-semibold text-tg-text mb-2">
                  {title}
                </h2>

                {/* Description */}
                {description && (
                  <p className="text-tg-hint text-sm mb-6">
                    {description}
                  </p>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-2 p-4 bg-tg-secondary/50">
                {/* Cancel Button */}
                <button
                  onClick={handleCancel}
                  className="flex-1 py-3 px-4 rounded-xl bg-tg-secondary text-tg-text font-medium hover:bg-tg-secondary/80 transition-colors"
                >
                  {cancelText}
                </button>

                {/* Confirm Button */}
                <button
                  onClick={handleConfirm}
                  className={`flex-1 py-3 px-4 rounded-xl font-medium transition-colors ${styles.confirmBg} ${styles.confirmText}`}
                >
                  {confirmText}
                </button>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
