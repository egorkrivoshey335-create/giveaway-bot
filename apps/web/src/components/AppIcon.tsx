'use client';

import * as LucideIcons from 'lucide-react';
import NextImage from 'next/image';
import { CSSProperties, SVGProps, useState } from 'react';

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

  // Extra (используются в компонентах)
  'icon-image': 'Image',
  'icon-upload': 'Upload',
  'icon-gift': 'Gift',
  'icon-trophy': 'Trophy',
  'icon-check': 'Check',
  'icon-warning': 'AlertTriangle',
  'icon-user': 'User',
  'icon-search': 'Search',
  'icon-phone': 'Phone',
  'icon-email': 'Mail',

  // Referral & Engagement (extras)
  'icon-referral': 'UserPlus',
  'icon-report': 'Flag',
  'icon-ban': 'UserX',
  'icon-unban': 'UserCheck',
  'icon-sandbox': 'TestTube2',
};

/** Форматы brand-иконок — проверяются в этом порядке */
const BRAND_FORMATS = ['webp', 'svg', 'png'] as const;
type BrandFormat = (typeof BRAND_FORMATS)[number];

export interface AppIconProps {
  /**
   * Имя иконки (например, "icon-home" или "home")
   */
  name: string;
  /**
   * Вариант иконки:
   * - brand: использовать brand-иконку из /public/icons/brand/ (webp/svg/png)
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
/**
 * Внутренний компонент brand-иконки с автоперебором форматов:
 * пробует webp → svg → png → Lucide fallback
 */
function BrandIcon({
  normalizedName,
  size,
  color,
  strokeWidth,
  className,
  style,
  ariaLabel,
}: {
  normalizedName: string;
  size: number;
  color?: string;
  strokeWidth: number;
  className: string;
  style: CSSProperties;
  ariaLabel?: string;
}) {
  const [formatIndex, setFormatIndex] = useState(0);
  const [failed, setFailed] = useState(false);

  if (failed) {
    // Все форматы не найдены → Lucide fallback
    return (
      <LucideIconRenderer
        normalizedName={normalizedName}
        size={size}
        color={color}
        strokeWidth={strokeWidth}
        className={className}
        style={style}
        ariaLabel={ariaLabel}
      />
    );
  }

  const format: BrandFormat = BRAND_FORMATS[formatIndex];
  const brandPath = `/icons/brand/${normalizedName}.${format}`;

  return (
    <NextImage
      src={brandPath}
      alt={ariaLabel || normalizedName}
      width={size}
      height={size}
      unoptimized
      className={className}
      style={{
        display: 'inline-block',
        verticalAlign: 'middle',
        objectFit: 'contain',
        ...(color ? { filter: `opacity(1)` } : {}),
        ...style,
      }}
      onError={() => {
        const next = formatIndex + 1;
        if (next < BRAND_FORMATS.length) {
          setFormatIndex(next);
        } else {
          setFailed(true);
        }
      }}
    />
  );
}

/**
 * Внутренний рендерер Lucide иконки
 */
function LucideIconRenderer({
  normalizedName,
  size,
  color,
  strokeWidth,
  className,
  style,
  ariaLabel,
}: {
  normalizedName: string;
  size: number;
  color?: string;
  strokeWidth: number;
  className: string;
  style: CSSProperties;
  ariaLabel?: string;
}) {
  const lucideIconName = LUCIDE_ICON_MAP[normalizedName];
  const LucideIcon = (
    lucideIconName ? LucideIcons[lucideIconName] : LucideIcons.HelpCircle
  ) as React.ComponentType<SVGProps<SVGSVGElement> & { size?: number; strokeWidth?: number }>;

  return (
    <LucideIcon
      size={size}
      color={color}
      strokeWidth={strokeWidth}
      className={className}
      style={style}
      aria-label={ariaLabel || normalizedName}
    />
  );
}

export function AppIcon({
  name,
  variant = 'lucide',
  size = 24,
  color,
  strokeWidth = 2,
  className = '',
  style = {},
  'aria-label': ariaLabel,
}: AppIconProps) {
  // Нормализовать имя: "home" → "icon-home"
  const normalizedName = name.startsWith('icon-') ? name : `icon-${name}`;

  if (variant === 'brand') {
    return (
      <BrandIcon
        normalizedName={normalizedName}
        size={size}
        color={color}
        strokeWidth={strokeWidth}
        className={className}
        style={style}
        ariaLabel={ariaLabel}
      />
    );
  }

  return (
    <LucideIconRenderer
      normalizedName={normalizedName}
      size={size}
      color={color}
      strokeWidth={strokeWidth}
      className={className}
      style={style}
      ariaLabel={ariaLabel}
    />
  );
}
