'use client';

import Lottie from 'lottie-react';
import { CSSProperties, useEffect, useRef, useState } from 'react';

const animationCache = new Map<string, unknown>();

export interface MascotProps {
  /**
   * Тип маскота определяет, какой файл загружать
   * 
   * **Wizard (15 типов):**
   * - wizard-type, wizard-settings, wizard-channels, wizard-publish, wizard-results
   * - wizard-calendar, wizard-winners, wizard-boost, wizard-invite, wizard-stories
   * - wizard-protection, wizard-mascot, wizard-promotion, wizard-maximum, wizard-tasks, wizard-review
   * 
   * **States (6 типов):**
   * - state-success, state-error, state-empty, state-loading, state-captcha, state-locked
   * 
   * **Participant (3 типа):**
   * - participant-joined, participant-winner, participant-lost
   * 
   * **Characters (6 типов):**
   * - mascot-free-default, mascot-paid-1, mascot-paid-2, mascot-paid-3, mascot-paid-4, mascot-paid-5
   */
  type:
    // Wizard mascots
    | 'wizard-type'
    | 'wizard-settings'
    | 'wizard-channels'
    | 'wizard-publish'
    | 'wizard-results'
    | 'wizard-calendar'
    | 'wizard-winners'
    | 'wizard-boost'
    | 'wizard-invite'
    | 'wizard-stories'
    | 'wizard-protection'
    | 'wizard-mascot'
    | 'wizard-promotion'
    | 'wizard-maximum'
    | 'wizard-tasks'
    | 'wizard-review'
    // State mascots
    | 'state-success'
    | 'state-error'
    | 'state-empty'
    | 'state-loading'
    | 'state-captcha'
    | 'state-locked'
    // Participant mascots
    | 'participant-joined'
    | 'participant-winner'
    | 'participant-lost'
    | 'participant-lost-1'
    // Character mascots
    | 'mascot-free-default'
    | 'mascot-paid-1'
    | 'mascot-paid-2'
    | 'mascot-paid-3'
    | 'mascot-paid-4'
    | 'mascot-paid-5'
    // Tier mascots (subscription)
    | 'tier-plus'
    | 'tier-pro'
    | 'tier-business'
    | string; // Поддержка кастомных путей
  /**
   * Размер маскота (px или rem)
   */
  size?: number | string;
  /**
   * Зациклить анимацию?
   */
  loop?: boolean;
  /**
   * Автозапуск анимации
   */
  autoplay?: boolean;
  /**
   * CSS классы
   */
  className?: string;
  /**
   * Inline стили
   */
  style?: CSSProperties;
  /**
   * Колбэк при завершении анимации
   */
  onComplete?: () => void;
}

/**
 * Маппинг типов маскотов на пути к Lottie JSON файлам
 * В production эти файлы должны быть размещены в public/mascots/
 */
const MASCOT_PATHS: Record<string, string> = {
  // Wizard mascots (15)
  'wizard-type': '/mascots/wizard/wizard-type.json',
  'wizard-settings': '/mascots/wizard/wizard-settings.json',
  'wizard-channels': '/mascots/wizard/wizard-channels.json',
  'wizard-publish': '/mascots/wizard/wizard-publish.json',
  'wizard-results': '/mascots/wizard/wizard-results.json',
  'wizard-calendar': '/mascots/wizard/wizard-calendar.json',
  'wizard-winners': '/mascots/wizard/wizard-winners.json',
  'wizard-boost': '/mascots/wizard/wizard-boost.json',
  'wizard-invite': '/mascots/wizard/wizard-invite.json',
  'wizard-stories': '/mascots/wizard/wizard-stories.json',
  'wizard-protection': '/mascots/wizard/wizard-protection.json',
  'wizard-mascot': '/mascots/wizard/wizard-mascot.json',
  'wizard-promotion': '/mascots/wizard/wizard-promotion.json',
  'wizard-maximum': '/mascots/wizard/wizard-maximum.json',
  'wizard-tasks': '/mascots/wizard/wizard-tasks.json',
  'wizard-review': '/mascots/wizard/wizard-review.json',
  
  // State mascots (6)
  'state-success': '/mascots/states/state-success.json',
  'state-error': '/mascots/states/state-error.json',
  'state-empty': '/mascots/states/state-empty.json',
  'state-loading': '/mascots/states/state-loading.json',
  'state-captcha': '/mascots/states/state-captcha.json',
  'state-locked': '/mascots/states/state-locked.json',
  
  // Participant mascots (3)
  'participant-joined': '/mascots/participant/participant-joined.json',
  'participant-winner': '/mascots/participant/participant-winner.json',
  'participant-lost': '/mascots/participant/participant-lost.json',
  'participant-lost-1': '/mascots/participant/participant-lost-1.json',
  
  // Character mascots (6)
  'mascot-free-default': '/mascots/characters/mascot-free-default.json',
  'mascot-paid-1': '/mascots/characters/mascot-paid-1.json',
  'mascot-paid-2': '/mascots/characters/mascot-paid-2.json',
  'mascot-paid-3': '/mascots/characters/mascot-paid-3.json',
  'mascot-paid-4': '/mascots/characters/mascot-paid-4.json',
  'mascot-paid-5': '/mascots/characters/mascot-paid-5.json',

  // Tier mascots (subscription)
  'tier-plus': '/mascots/tiers/tier-plus.json',
  'tier-pro': '/mascots/tiers/tier-pro.json',
  'tier-business': '/mascots/tiers/tier-business.json',

  // Dashboard card mascots
  'dashboard-channels': '/mascots/creator/dashboard-channels.json',
  'dashboard-posts': '/mascots/creator/dashboard-posts.json',
  'dashboard-profile': '/mascots/creator/dashboard-profile.json',
};

/**
 * Mascot — компонент для отображения анимированных Lottie маскотов
 * 
 * Использует lottie-react для плавной анимации.
 * 
 * @example
 * ```tsx
 * // Wizard маскот
 * <Mascot type="wizard-type" size={200} />
 * 
 * // State маскот
 * <Mascot type="state-success" size={150} />
 * 
 * // Participant маскот с loop
 * <Mascot type="participant-winner" size="10rem" loop />
 * 
 * // Character маскот
 * <Mascot type="mascot-paid-2" size={180} />
 * ```
 */
export function Mascot({
  type,
  size = 200,
  loop = false,
  autoplay = true,
  className = '',
  style = {},
  onComplete,
}: MascotProps) {
  const [animationData, setAnimationData] = useState<unknown | null>(() => {
    const path = MASCOT_PATHS[type] || type;
    return animationCache.get(path) || null;
  });
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    const path = MASCOT_PATHS[type] || type;

    if (animationCache.has(path)) {
      setAnimationData(animationCache.get(path)!);
      setError(null);
      return;
    }

    fetch(path)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load mascot: ${path}`);
        return res.json();
      })
      .then((data) => {
        animationCache.set(path, data);
        if (mountedRef.current) {
          setAnimationData(data);
          setError(null);
        }
      })
      .catch((err) => {
        console.error('Mascot load error:', err);
        if (mountedRef.current) {
          setError(err.message);
          setAnimationData(null);
        }
      });

    return () => { mountedRef.current = false; };
  }, [type]);

  // Still loading — transparent placeholder to prevent layout shift
  if (!animationData && !error) {
    const sizeValue = typeof size === 'number' ? `${size}px` : size;
    return (
      <div
        className={className}
        style={{ width: sizeValue, height: sizeValue, ...style }}
      />
    );
  }

  // Error fallback: show emoji
  if (error) {
    const fallbackEmoji: Record<string, string> = {
      // Wizard
      'wizard-type': '📋',
      'wizard-settings': '⚙️',
      'wizard-channels': '📢',
      'wizard-publish': '🚀',
      'wizard-results': '🏆',
      'wizard-calendar': '📅',
      'wizard-winners': '👑',
      'wizard-boost': '⚡',
      'wizard-invite': '👥',
      'wizard-stories': '📱',
      'wizard-protection': '🛡️',
      'wizard-mascot': '🐾',
      'wizard-promotion': '📣',
      'wizard-maximum': '🔥',
      'wizard-tasks': '✅',
      'wizard-review': '🔍',
      // States
      'state-success': '✅',
      'state-error': '❌',
      'state-empty': '📭',
      'state-loading': '⏳',
      'state-captcha': '🤖',
      'state-locked': '🔒',
      // Participant
      'participant-joined': '🎉',
      'participant-winner': '🏆',
      'participant-lost': '😔',
      'participant-lost-1': '😢',
      // Characters
      'mascot-free-default': '🐱',
      'mascot-paid-1': '🐶',
      'mascot-paid-2': '🦄',
      'mascot-paid-3': '🐼',
      'mascot-paid-4': '🦊',
      'mascot-paid-5': '🚀',
      // Tiers
      'tier-plus': '⭐',
      'tier-pro': '🚀',
      'tier-business': '💼',
    };

    const emoji = fallbackEmoji[type] || '🎭';
    const sizeValue = typeof size === 'number' ? `${size}px` : size;

    return (
      <div
        className={`flex items-center justify-center ${className}`}
        style={{
          width: sizeValue,
          height: sizeValue,
          fontSize: `calc(${sizeValue} * 0.5)`,
          ...style,
        }}
        role="img"
        aria-label={`Mascot ${type}`}
      >
        {emoji}
      </div>
    );
  }

  const sizeValue = typeof size === 'number' ? `${size}px` : size;

  return (
    <div
      className={`flex items-center justify-center ${className}`}
      style={{
        width: sizeValue,
        height: sizeValue,
        ...style,
      }}
    >
      <Lottie
        animationData={animationData}
        loop={loop}
        autoplay={autoplay}
        onComplete={onComplete}
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  );
}
