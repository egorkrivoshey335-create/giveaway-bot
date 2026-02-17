import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/Skeleton';

/**
 * Lazy-loaded компоненты с fallback
 */

// DateTimePicker - используется только в wizard
export const DateTimePicker = dynamic(
  () => import('@/components/DateTimePicker').then((mod) => ({ default: mod.DateTimePicker })),
  {
    loading: () => <Skeleton variant="rectangular" height="400px" />,
    ssr: false,
  }
);

// ConfettiOverlay - используется только при успехе
export const ConfettiOverlayLazy = dynamic(
  () => import('@/components/ui/ConfettiOverlay').then((mod) => ({ default: mod.ConfettiOverlay })),
  {
    ssr: false,
  }
);

// BottomSheet - часто используется, но можно отложить
export const BottomSheetLazy = dynamic(
  () => import('@/components/ui/BottomSheet').then((mod) => ({ default: mod.BottomSheet })),
  {
    loading: () => <Skeleton variant="card" />,
    ssr: false,
  }
);

// LanguageSelector - только в настройках
export const LanguageSelector = dynamic(
  () => import('@/components/LanguageSelector').then((mod) => ({ default: mod.LanguageSelector })),
  {
    loading: () => <Skeleton variant="card" height="200px" />,
    ssr: false,
  }
);

// DebugPanel - только в development
export const DebugPanel = dynamic(
  () => import('@/components/DebugPanel').then((mod) => ({ default: mod.DebugPanel })),
  {
    ssr: false,
  }
);
