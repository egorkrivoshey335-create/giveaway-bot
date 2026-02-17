'use client';

import * as LucideIcons from 'lucide-react';
import { CSSProperties, SVGProps } from 'react';

/**
 * Маппинг наших именований иконок на Lucide иконки
 */
const LUCIDE_ICON_MAP: Record<string, keyof typeof LucideIcons> = {
  // Navigation
  'icon-home': 'Home',
  'icon-back': 'ArrowLeft',
  'icon-menu': 'Menu',
  'icon-close': 'X',
  'icon-settings': 'Settings',
  'icon-support': 'Headset',

  // Actions
  'icon-create': 'PlusSquare',
  'icon-edit': 'Pencil',
  'icon-delete': 'Trash2',
  'icon-share': 'Share2',
  'icon-copy': 'Copy',
  'icon-view': 'Eye',
  'icon-save': 'Bookmark',
  'icon-cancel': 'Ban',

  // Giveaway
  'icon-giveaway': 'Gift',
  'icon-winner': 'Trophy',
  'icon-participant': 'User',
  'icon-ticket': 'Ticket',
  'icon-boost': 'Zap',
  'icon-invite': 'UserPlus',
  'icon-story': 'ImagePlus',
  'icon-calendar': 'Calendar',

  // Status
  'icon-active': 'CircleCheck',
  'icon-pending': 'Clock',
  'icon-completed': 'CheckCircle2',
  'icon-cancelled': 'XCircle',
  'icon-error': 'AlertCircle',
  'icon-success': 'CheckCircle',

  // Premium
  'icon-crown': 'Crown',
  'icon-star': 'Star',
  'icon-diamond': 'Gem',
  'icon-lock': 'Lock',

  // Protection
  'icon-captcha': 'ShieldCheck',
  'icon-camera': 'Camera',
  'icon-shield': 'Shield',
  'icon-verify': 'BadgeCheck',

  // Stats
  'icon-chart': 'BarChart3',
  'icon-analytics': 'TrendingUp',
  'icon-export': 'Download',
  'icon-filter': 'Filter',

  // Channels
  'icon-channel': 'Radio',
  'icon-group': 'Users',
  'icon-add-channel': 'PlusCircle',
  'icon-subscribers': 'Users2',

  // Misc
  'icon-faq': 'HelpCircle',
  'icon-info': 'Info',
  'icon-language': 'Globe',
  'icon-theme': 'Palette',
  'icon-notification': 'Bell',
  'icon-refresh': 'RefreshCw',
};

export interface AppIconProps {
  /**
   * Имя иконки (например, "icon-home" или "home")
   */
  name: string;
  /**
   * Вариант иконки:
   * - brand: использовать brand SVG из /public/icons/brand/
   * - lucide: использовать Lucide React icon
   */
  variant?: 'brand' | 'lucide';
  /**
   * Размер иконки (px)
   */
  size?: number;
  /**
   * Цвет иконки (CSS color)
   * Для brand иконок: если не указан, используется currentColor
   */
  color?: string;
  /**
   * Stroke width (для lucide)
   */
  strokeWidth?: number;
  /**
   * CSS класс
   */
  className?: string;
  /**
   * Inline стили
   */
  style?: CSSProperties;
  /**
   * Accessibility label
   */
  'aria-label'?: string;
}

/**
 * AppIcon — универсальный компонент для иконок
 * 
 * Поддерживает два режима:
 * 1. **Brand** — собственные SVG иконки из /public/icons/brand/
 * 2. **Lucide** — иконки из библиотеки lucide-react
 * 
 * @example
 * ```tsx
 * // Brand иконка
 * <AppIcon name="icon-home" variant="brand" size={24} />
 * 
 * // Lucide fallback
 * <AppIcon name="icon-home" variant="lucide" size={24} />
 * 
 * // Автовыбор (brand если есть, иначе lucide)
 * <AppIcon name="icon-home" size={24} />
 * ```
 */
export function AppIcon({
  name,
  variant = 'lucide', // По умолчанию используем lucide (пока brand иконки не загружены)
  size = 24,
  color,
  strokeWidth = 2,
  className = '',
  style = {},
  'aria-label': ariaLabel,
}: AppIconProps) {
  // Нормализовать имя иконки (убрать префикс icon- если есть)
  const normalizedName = name.startsWith('icon-') ? name : `icon-${name}`;

  // Если variant === 'brand', пытаемся загрузить brand SVG
  if (variant === 'brand') {
    const brandPath = `/icons/brand/${normalizedName}.svg`;
    
    return (
      <img
        src={brandPath}
        alt={ariaLabel || name}
        width={size}
        height={size}
        className={className}
        style={{
          display: 'inline-block',
          verticalAlign: 'middle',
          filter: color ? `drop-shadow(0 0 0 ${color})` : undefined,
          ...style,
        }}
        onError={(e) => {
          // Fallback: если brand иконка не найдена, скрываем элемент
          console.warn(`Brand icon not found: ${brandPath}`);
          e.currentTarget.style.display = 'none';
        }}
      />
    );
  }

  // Lucide variant
  const lucideIconName = LUCIDE_ICON_MAP[normalizedName];
  if (!lucideIconName) {
    console.warn(`Icon "${normalizedName}" not found in Lucide map. Fallback to QuestionMark.`);
    const FallbackIcon = LucideIcons.HelpCircle;
    return (
      <FallbackIcon
        size={size}
        color={color}
        strokeWidth={strokeWidth}
        className={className}
        style={style}
        aria-label={ariaLabel || name}
      />
    );
  }

  const LucideIcon = LucideIcons[lucideIconName] as React.ComponentType<SVGProps<SVGSVGElement> & { size?: number; strokeWidth?: number }>;

  return (
    <LucideIcon
      size={size}
      color={color}
      strokeWidth={strokeWidth}
      className={className}
      style={style}
      aria-label={ariaLabel || name}
    />
  );
}
