'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { Header } from '@/components/Header';
import { Confetti } from '@/components/Confetti';
import {
  getRandomizerData,
  savePrizes,
  saveCustomization,
  publishWinners,
  type Participant,
  type Winner,
  type Prize,
  type Customization,
} from '@/lib/api';
import {
  getMedal,
  getPlaceColor,
  formatParticipantName,
  PRESET_BACKGROUNDS,
  PRESET_ACCENTS,
  isLightBackground,
} from '@/lib/helpers';
import {
  createRandomizer,
  type RandomizerControl,
  type WinnerResult,
} from '@/lib/randomizer';
import { ColorPicker } from '@/components/ColorPicker';

// ============================================================================
// Типы
// ============================================================================

type RandomizerState = 'SETUP' | 'RUNNING' | 'PAUSED' | 'FINISHED' | 'SAVED';

interface GiveawayInfo {
  id: string;
  title: string;
  winnersCount: number;
  participantsCount: number;
  finishedAt: string;
  publishResultsMode?: string;
  winnersPublished?: boolean;
}

// ============================================================================
// Компонент страницы
// ============================================================================

export default function WinnerPage() {
  const t = useTranslations('winner');
  const tCommon = useTranslations('common');
  
  const router = useRouter();
  const params = useParams();
  const giveawayId = params.id as string;

  // Данные
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [giveaway, setGiveaway] = useState<GiveawayInfo | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [existingWinners, setExistingWinners] = useState<Winner[]>([]);
  const [prizes, setPrizes] = useState<Prize[]>([]);
  const [customization, setCustomization] = useState<Customization>({
    backgroundColor: '#0f0f23',
    accentColor: '#f2b6b6',
  });

  // Состояние рандомайзера
  const [state, setState] = useState<RandomizerState>('SETUP');
  const [currentPlace, setCurrentPlace] = useState<number>(0);
  const [currentDisplayName, setCurrentDisplayName] = useState<string>('');
  const [countdownValue, setCountdownValue] = useState<number>(0);
  const [revealedWinners, setRevealedWinners] = useState<WinnerResult[]>([]);
  const [showConfetti, setShowConfetti] = useState(false);

  // Контроллер рандомайзера
  const controlRef = useRef<RandomizerControl | null>(null);

  // Панель настроек (для мобильных)
  const [showSettings, setShowSettings] = useState(false);
  const [isSavingPrizes, setIsSavingPrizes] = useState(false);
  const [isSavingCustomization, setIsSavingCustomization] = useState(false);
  const [logoSize, setLogoSize] = useState(80); // высота логотипа в px
  // Пресеты для кастомного color picker
  const bgPresets = PRESET_BACKGROUNDS.map(b => b.value);
  const accentPresets = PRESET_ACCENTS;
  const [savedPrizesOk, setSavedPrizesOk] = useState(false);
  const [savedCustomOk, setSavedCustomOk] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishedOk, setPublishedOk] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  // Загрузка данных
  useEffect(() => {
    async function loadData() {
      try {
        const response = await getRandomizerData(giveawayId);

        if (!response.ok) {
          throw new Error(response.error || t('errorLoading'));
        }

        if (response.giveaway) {
          setGiveaway(response.giveaway);
        }
        if (response.participants) {
          setParticipants(response.participants);
        }
        if (response.winners) {
          setExistingWinners(response.winners);
        }
        if (response.prizes && response.prizes.length > 0) {
          setPrizes(response.prizes);
        }
        if (response.customization) {
          setCustomization(response.customization);
        }
      } catch (err) {
        if (err instanceof Error && err.message.includes('401')) {
          router.push('/login');
          return;
        }
        if (err instanceof Error && err.message.includes('403')) {
          router.push('/dashboard');
          return;
        }
        setError(err instanceof Error ? err.message : t('errorLoading'));
      } finally {
        setIsLoading(false);
      }
    }

    loadData();
  }, [giveawayId, router, t]);

  // Обновление приза
  const updatePrize = useCallback((place: number, title: string) => {
    setPrizes(prev => {
      const existing = prev.find(p => p.place === place);
      if (existing) {
        return prev.map(p => p.place === place ? { ...p, title } : p);
      } else {
        return [...prev, { place, title }];
      }
    });
  }, []);

  // Сохранение призов
  const handleSavePrizes = useCallback(async () => {
    if (!giveawayId || isSavingPrizes) return;
    setIsSavingPrizes(true);
    setSavedPrizesOk(false);
    try {
      await savePrizes(giveawayId, prizes);
      setSavedPrizesOk(true);
      setTimeout(() => setSavedPrizesOk(false), 2000);
    } catch (err) {
      console.error(t('errorSavingPrizes'), err);
    } finally {
      setIsSavingPrizes(false);
    }
  }, [giveawayId, prizes, isSavingPrizes, t]);

  // Сохранение кастомизации
  const handleSaveCustomization = useCallback(async () => {
    if (!giveawayId || isSavingCustomization) return;
    setIsSavingCustomization(true);
    setSavedCustomOk(false);
    try {
      await saveCustomization(giveawayId, customization);
      setSavedCustomOk(true);
      setTimeout(() => setSavedCustomOk(false), 2000);
    } catch (err) {
      console.error(t('errorSavingCustomization'), err);
    } finally {
      setIsSavingCustomization(false);
    }
  }, [giveawayId, customization, isSavingCustomization, t]);

  // Загрузка логотипа файлом (конвертируем в Data URL)
  const handleLogoUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      alert(t('maxFileSize'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setCustomization(prev => ({ ...prev, logoUrl: dataUrl }));
    };
    reader.readAsDataURL(file);
  }, [t]);

  // Запуск рандомайзера
  const startRandomizer = useCallback(() => {
    if (!giveaway || participants.length === 0) return;

    setState('RUNNING');
    setRevealedWinners([]);
    setCurrentPlace(giveaway.winnersCount);

    const { start, control } = createRandomizer(
      participants,
      giveaway.winnersCount,
      {
        onSlotChange: (name) => {
          setCurrentDisplayName(name);
        },
        onCountdown: (seconds) => {
          setCountdownValue(seconds);
        },
        onRevealWinner: (place, winner) => {
          setRevealedWinners(prev => [...prev, { place, participant: winner }]);
          // Конфетти для топ-3
          if (place <= 3) {
            setShowConfetti(true);
            setTimeout(() => setShowConfetti(false), 5000);
          }
        },
        onFinish: () => {
          setState('FINISHED');
        },
        onPlaceChange: (place) => {
          setCurrentPlace(place);
          setCountdownValue(0);
        },
      }
    );

    controlRef.current = control;
    start();
  }, [giveaway, participants]);

  // Пауза
  const pauseRandomizer = useCallback(() => {
    controlRef.current?.pause();
    setState('PAUSED');
  }, []);

  // Продолжить
  const resumeRandomizer = useCallback(() => {
    controlRef.current?.resume();
    setState('RUNNING');
  }, []);

  // Пропустить
  const skipToNext = useCallback(() => {
    controlRef.current?.skip();
  }, []);

  // Сброс
  const resetRandomizer = useCallback(() => {
    setState('SETUP');
    setRevealedWinners([]);
    setCurrentPlace(0);
    setCurrentDisplayName('');
    setCountdownValue(0);
  }, []);

  // Поделиться
  const shareResults = useCallback(() => {
    const url = `${window.location.origin}/results/${giveawayId}`;
    if (navigator.share) {
      navigator.share({
        title: giveaway?.title || t('title'),
        url,
      });
    } else {
      navigator.clipboard.writeText(url);
      alert(t('linkCopied'));
    }
  }, [giveawayId, giveaway, t]);

  // Опубликовать победителей в каналы (для RANDOMIZER режима)
  const handlePublishWinners = useCallback(async () => {
    if (!giveaway || isPublishing) return;
    setIsPublishing(true);
    try {
      await publishWinners(giveawayId);
      setPublishedOk(true);
      // Обновляем локальное состояние
      setGiveaway(prev => prev ? { ...prev, winnersPublished: true } : prev);
    } catch (err) {
      alert(t('errorPublishing') + ' ' + (err instanceof Error ? err.message : t('unknownError')));
    } finally {
      setIsPublishing(false);
    }
  }, [giveawayId, giveaway, isPublishing, t]);

  // Цвета текста в зависимости от фона
  const textColor = isLightBackground(customization.backgroundColor) ? '#1f2937' : '#ffffff';
  const textSecondary = isLightBackground(customization.backgroundColor) ? '#6b7280' : '#9ca3af';

  // ============================================================================
  // Рендеринг
  // ============================================================================

  // Загрузка
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center text-white">
          <div className="w-12 h-12 border-4 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p>{tCommon('loading')}</p>
        </div>
      </div>
    );
  }

  // Ошибка
  if (error || !giveaway) {
    return (
      <div className="min-h-screen bg-gray-900 flex flex-col">
        <Header isAuthenticated darkMode />
        <main className="flex-1 flex items-center justify-center px-4 pt-16">
          <div className="text-center text-white">
            <div className="text-5xl mb-4">😕</div>
            <h1 className="text-2xl font-bold mb-2">{tCommon('error')}</h1>
            <p className="text-gray-400 mb-6">{error || t('giveawayNotFound')}</p>
            <Link href="/dashboard" className="btn-primary">
              {tCommon('back')}
            </Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen transition-colors duration-500"
      style={{ backgroundColor: customization.backgroundColor }}
    >
      {/* Конфетти */}
      <Confetti active={showConfetti} duration={5000} />

      {/* Хедер только в SETUP */}
      {state === 'SETUP' && <Header isAuthenticated darkMode={!isLightBackground(customization.backgroundColor)} />}

      <main className="min-h-screen flex flex-col lg:flex-row">
        {/* ================================================================== */}
        {/* Панель настроек (левая) */}
        {/* ================================================================== */}
        {state === 'SETUP' && (
          <aside className="lg:w-80 xl:w-96 lg:min-h-screen p-4 lg:p-6 pt-20 lg:pt-24 bg-gray-900/80 backdrop-blur-xl">
            {/* Мобильный заголовок */}
            <div className="lg:hidden flex items-center justify-between mb-4">
              <h2 className="font-bold text-white">{t('settings')}</h2>
              <button
                onClick={() => setShowSettings(!showSettings)}
                className="p-2 rounded-lg bg-white/10 text-white"
              >
                {showSettings ? '✕' : '⚙️'}
              </button>
            </div>

            <div className={`space-y-6 ${showSettings ? 'block' : 'hidden lg:block'}`}>
              {/* Блок "Призы" */}
              <div className="bg-white/10 rounded-xl p-4">
                <h3 className="font-semibold mb-4 flex items-center gap-2 text-white">
                  🏆 {t('prizes')}
                </h3>
                <div className="space-y-3 max-h-64 overflow-y-auto">
                  {Array.from({ length: giveaway.winnersCount }, (_, i) => {
                    const place = i + 1;
                    const prize = prizes.find(p => p.place === place);
                    return (
                      <div key={place} className="flex items-center gap-2">
                        <span
                          className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
                          style={{ backgroundColor: getPlaceColor(place) }}
                        >
                          {getMedal(place)}
                        </span>
                        <input
                          type="text"
                          placeholder={t('prizeForPlace', { place })}
                          value={prize?.title || ''}
                          onChange={(e) => updatePrize(place, e.target.value)}
                          className="flex-1 bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-400"
                        />
                      </div>
                    );
                  })}
                </div>
                <button
                  onClick={handleSavePrizes}
                  disabled={isSavingPrizes}
                  className={`w-full mt-4 py-2 rounded-lg transition-colors text-sm font-medium ${
                    savedPrizesOk ? 'bg-green-500/30 text-green-300' : 'bg-white/20 hover:bg-white/30 text-white'
                  }`}
                >
                  {isSavingPrizes ? `💾 ${tCommon('saving')}` : savedPrizesOk ? `✅ ${tCommon('saved')}` : `💾 ${t('savePrizes')}`}
                </button>
              </div>

              {/* Блок "Кастомизация" */}
              <div className="bg-white/10 rounded-xl p-4">
                <h3 className="font-semibold mb-4 flex items-center gap-2 text-white">
                  🎨 {t('customization')}
                </h3>

                {/* Цвет фона */}
                <div className="mb-4">
                  <label className="block text-sm mb-2 text-gray-300">{t('background')}</label>
                  <div className="flex flex-wrap gap-2 items-center">
                    {PRESET_BACKGROUNDS.map(bg => (
                      <button
                        key={bg.value}
                        className={`w-8 h-8 rounded-full border-2 transition-transform hover:scale-110 ${
                          customization.backgroundColor === bg.value ? 'border-white scale-110' : 'border-transparent'
                        }`}
                        style={{ backgroundColor: bg.value }}
                        onClick={() => setCustomization(prev => ({ ...prev, backgroundColor: bg.value }))}
                        title={bg.label}
                      />
                    ))}
                    {/* Кастомный Color Picker */}
                    <ColorPicker
                      color={customization.backgroundColor}
                      onChange={(c) => setCustomization(prev => ({ ...prev, backgroundColor: c }))}
                      presets={bgPresets}
                      label={t('background')}
                    />
                  </div>
                </div>

                {/* Цвет акцента */}
                <div className="mb-4">
                  <label className="block text-sm mb-2 text-gray-300">{t('accent')}</label>
                  <div className="flex flex-wrap gap-2 items-center">
                    {PRESET_ACCENTS.map(color => (
                      <button
                        key={color}
                        className={`w-8 h-8 rounded-full border-2 transition-transform hover:scale-110 ${
                          customization.accentColor === color ? 'border-white scale-110' : 'border-transparent'
                        }`}
                        style={{ backgroundColor: color }}
                        onClick={() => setCustomization(prev => ({ ...prev, accentColor: color }))}
                      />
                    ))}
                    {/* Кастомный Color Picker */}
                    <ColorPicker
                      color={customization.accentColor}
                      onChange={(c) => setCustomization(prev => ({ ...prev, accentColor: c }))}
                      presets={accentPresets}
                      label={t('accent')}
                    />
                  </div>
                </div>

                {/* Логотип */}
                <div className="mb-4">
                  <label className="block text-sm mb-2 text-gray-300">{t('logo')}</label>
                  
                  {/* Превью загруженного лого */}
                  {customization.logoUrl && (
                    <div className="mb-3 flex items-center gap-3">
                      <div className="bg-white/5 rounded-lg p-2 flex items-center justify-center" style={{ minWidth: 60 }}>
                        <Image
                          src={customization.logoUrl}
                          alt="Logo preview"
                          width={60}
                          height={40}
                          className="object-contain"
                          style={{ height: Math.min(logoSize * 0.5, 40) }}
                          unoptimized
                        />
                      </div>
                      <button
                        onClick={() => setCustomization(prev => ({ ...prev, logoUrl: null }))}
                        className="text-xs text-red-400 hover:text-red-300"
                      >
                        ✕ {t('removeLogo')}
                      </button>
                    </div>
                  )}

                  {/* Кнопки загрузки */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => logoInputRef.current?.click()}
                      className="flex-1 py-2 rounded-lg bg-white/10 border border-white/20 border-dashed text-sm text-gray-300 hover:bg-white/20 transition-colors"
                    >
                      📁 {t('uploadFile')}
                    </button>
                    <input
                      ref={logoInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleLogoUpload}
                      className="hidden"
                    />
                  </div>

                  {/* Или вставить URL */}
                  <input
                    type="url"
                    placeholder={t('pasteUrl')}
                    value={customization.logoUrl?.startsWith('data:') ? '' : (customization.logoUrl || '')}
                    onChange={(e) => setCustomization(prev => ({ ...prev, logoUrl: e.target.value || null }))}
                    className="w-full mt-2 bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-400"
                  />

                  {/* Размер логотипа */}
                  {customization.logoUrl && (
                    <div className="mt-3">
                      <div className="flex items-center justify-between text-xs mb-1 text-gray-400">
                        <span>{t('logoSize')}</span>
                        <span>{logoSize}px</span>
                      </div>
                      <input
                        type="range"
                        min={30}
                        max={200}
                        value={logoSize}
                        onChange={(e) => setLogoSize(Number(e.target.value))}
                        className="w-full accent-brand-400"
                      />
                    </div>
                  )}
                </div>

                <button
                  onClick={handleSaveCustomization}
                  disabled={isSavingCustomization}
                  className={`w-full py-2 rounded-lg transition-colors text-sm font-medium ${
                    savedCustomOk ? 'bg-green-500/30 text-green-300' : 'bg-white/20 hover:bg-white/30 text-white'
                  }`}
                >
                  {isSavingCustomization ? `💾 ${tCommon('saving')}` : savedCustomOk ? `✅ ${tCommon('saved')}` : `💾 ${t('saveCustomization')}`}
                </button>
              </div>
            </div>
          </aside>
        )}

        {/* ================================================================== */}
        {/* Область рандомайзера (центр) */}
        {/* ================================================================== */}
        <div className="flex-1 flex flex-col items-center justify-center p-4 lg:p-8">
          {/* SETUP состояние */}
          {state === 'SETUP' && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center max-w-2xl mx-auto"
            >
              {/* Логотип */}
              {customization.logoUrl && (
                <Image
                  src={customization.logoUrl}
                  alt="Logo"
                  width={300}
                  height={logoSize}
                  className="w-auto object-contain mx-auto mb-6"
                  style={{ height: logoSize }}
                  unoptimized
                />
              )}

              {/* Заголовок */}
              <h1
                className="text-3xl md:text-4xl font-bold mb-4"
                style={{ color: customization.accentColor }}
              >
                {giveaway.title}
              </h1>
              <p className="text-lg mb-8" style={{ color: textSecondary }}>
                {giveaway.participantsCount} {tCommon('participants')} • {giveaway.winnersCount} {tCommon('winners')}
              </p>

              {/* Кнопка старт */}
              <button
                onClick={startRandomizer}
                className="text-xl px-12 py-5 rounded-2xl font-bold shadow-2xl transform hover:scale-105 transition-all"
                style={{
                  backgroundColor: customization.accentColor,
                  color: isLightBackground(customization.accentColor) ? '#1f2937' : '#ffffff',
                }}
              >
                🎲 {t('startGiveaway')}
              </button>

              {/* Если уже есть победители */}
              {existingWinners.length > 0 && (
                <div className="mt-8 p-4 bg-white/10 rounded-xl">
                  <p className="text-sm mb-2" style={{ color: textSecondary }}>
                    ⚠️ {t('existingWinnersWarning')}
                  </p>
                  <Link
                    href={`/results/${giveawayId}`}
                    className="text-sm underline"
                    style={{ color: customization.accentColor }}
                  >
                    {t('viewCurrentResults')} →
                  </Link>
                </div>
              )}
            </motion.div>
          )}

          {/* RUNNING / PAUSED состояние */}
          {(state === 'RUNNING' || state === 'PAUSED') && (
            <div className="text-center w-full max-w-3xl mx-auto">
              {/* Логотип */}
              {customization.logoUrl && (
                <Image
                  src={customization.logoUrl}
                  alt="Logo"
                  width={300}
                  height={Math.round(logoSize * 0.6)}
                  className="w-auto object-contain mx-auto mb-4"
                  style={{ height: Math.round(logoSize * 0.6) }}
                  unoptimized
                />
              )}

              {/* Название розыгрыша */}
              <h1 className="text-lg md:text-xl font-bold mb-6 opacity-60" style={{ color: customization.accentColor }}>
                {giveaway.title}
              </h1>

              {/* Текущее место */}
              <motion.div
                key={currentPlace}
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="mb-8"
              >
                <span
                  className="text-6xl md:text-8xl font-black"
                  style={{ color: getPlaceColor(currentPlace) }}
                >
                  {getMedal(currentPlace)} {currentPlace}
                </span>
                <p className="text-xl mt-2" style={{ color: textSecondary }}>{tCommon('place')}</p>
                
                {/* Приз если указан */}
                {prizes.find(p => p.place === currentPlace)?.title && (
                  <p className="text-2xl font-semibold mt-4" style={{ color: customization.accentColor }}>
                    🎁 {prizes.find(p => p.place === currentPlace)?.title}
                  </p>
                )}
              </motion.div>

              {/* Слот-машина — мелькающие имена */}
              <div className="h-32 flex items-center justify-center mb-8 overflow-hidden">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={currentDisplayName}
                    initial={{ y: 50, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: -50, opacity: 0 }}
                    transition={{ duration: 0.1 }}
                    className="text-4xl md:text-6xl font-bold"
                    style={{ color: textColor }}
                  >
                    {currentDisplayName || '...'}
                  </motion.div>
                </AnimatePresence>
              </div>

              {/* Обратный отсчёт для топ-3 */}
              {currentPlace <= 3 && countdownValue > 0 && (
                <motion.div
                  key={countdownValue}
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="text-9xl font-black animate-countdown-pulse"
                  style={{ color: customization.accentColor }}
                >
                  {countdownValue}
                </motion.div>
              )}

              {/* Кнопки управления */}
              <div className="flex flex-wrap justify-center gap-4 mt-8">
                {state === 'RUNNING' && (
                  <>
                    <button
                      onClick={pauseRandomizer}
                      className="px-6 py-3 rounded-xl bg-white/20 font-medium transition-colors hover:bg-white/30"
                      style={{ color: textColor }}
                    >
                      ⏸️ {t('pause')}
                    </button>
                    <button
                      onClick={skipToNext}
                      className="px-6 py-3 rounded-xl bg-white/20 font-medium transition-colors hover:bg-white/30"
                      style={{ color: textColor }}
                    >
                      ⏭️ {t('skip')}
                    </button>
                  </>
                )}
                {state === 'PAUSED' && (
                  <button
                    onClick={resumeRandomizer}
                    className="px-8 py-4 rounded-xl font-bold text-lg transition-transform hover:scale-105"
                    style={{
                      backgroundColor: customization.accentColor,
                      color: isLightBackground(customization.accentColor) ? '#1f2937' : '#ffffff',
                    }}
                  >
                    ▶️ {t('continue')}
                  </button>
                )}
              </div>

              {/* Показанные победители */}
              {revealedWinners.length > 0 && (
                <div className="mt-12 flex flex-wrap justify-center gap-3">
                  {revealedWinners
                    .sort((a, b) => a.place - b.place)
                    .map(w => (
                      <motion.div
                        key={w.place}
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="px-4 py-2 rounded-full bg-white/10 backdrop-blur-sm border-2"
                        style={{ borderColor: getPlaceColor(w.place) }}
                      >
                        <span style={{ color: textColor }}>
                          {getMedal(w.place)} {formatParticipantName(w.participant)}
                        </span>
                      </motion.div>
                    ))}
                </div>
              )}
            </div>
          )}

          {/* FINISHED состояние */}
          {state === 'FINISHED' && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center w-full max-w-3xl mx-auto"
            >
              {/* Логотип */}
              {customization.logoUrl && (
                <Image
                  src={customization.logoUrl}
                  alt="Logo"
                  width={300}
                  height={Math.round(logoSize * 0.7)}
                  className="w-auto object-contain mx-auto mb-4"
                  style={{ height: Math.round(logoSize * 0.7) }}
                  unoptimized
                />
              )}

              <div className="text-6xl mb-4">🎉</div>
              <h2 className="text-2xl font-bold mb-2" style={{ color: customization.accentColor }}>
                {giveaway.title}
              </h2>
              <h3 className="text-4xl font-bold mb-8" style={{ color: customization.accentColor }}>
                {t('finished')}
              </h3>

              {/* Таблица победителей */}
              <div className="space-y-3 mb-8 max-h-96 overflow-y-auto">
                {revealedWinners
                  .sort((a, b) => a.place - b.place)
                  .map(w => {
                    const prize = prizes.find(p => p.place === w.place);
                    return (
                      <motion.div
                        key={w.place}
                        initial={{ x: -50, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        transition={{ delay: w.place * 0.1 }}
                        className="flex items-center gap-4 p-4 rounded-xl bg-white/10 backdrop-blur-sm"
                        style={{ borderLeft: `4px solid ${getPlaceColor(w.place)}` }}
                      >
                        <span
                          className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-xl shrink-0"
                          style={{ backgroundColor: getPlaceColor(w.place) }}
                        >
                          {getMedal(w.place)}
                        </span>
                        <div className="flex-1 text-left">
                          <p className="font-semibold" style={{ color: textColor }}>
                            {formatParticipantName(w.participant)}
                          </p>
                          {w.participant.username && (
                            <p className="text-sm" style={{ color: textSecondary }}>
                              @{w.participant.username}
                            </p>
                          )}
                        </div>
                        {prize?.title && (
                          <span
                            className="px-3 py-1 rounded-full text-sm bg-white/20"
                            style={{ color: textColor }}
                          >
                            🎁 {prize.title}
                          </span>
                        )}
                      </motion.div>
                    );
                  })}
              </div>

              {/* Кнопка публикации победителей в канал (для RANDOMIZER режима) */}
              {giveaway.publishResultsMode === 'RANDOMIZER' && !giveaway.winnersPublished && !publishedOk && (
                <div className="mb-6 p-4 rounded-xl bg-white/10 border border-white/20">
                  <p className="text-sm mb-3 opacity-80" style={{ color: textColor }}>
                    {t('announceWinners')}
                  </p>
                  <button
                    onClick={handlePublishWinners}
                    disabled={isPublishing}
                    className="w-full px-6 py-3 rounded-xl font-bold text-lg transition-transform hover:scale-105"
                    style={{
                      backgroundColor: customization.accentColor,
                      color: isLightBackground(customization.accentColor) ? '#1f2937' : '#ffffff',
                    }}
                  >
                    {isPublishing ? `📡 ${tCommon('publishing')}` : `📢 ${t('publishWinners')}`}
                  </button>
                </div>
              )}
              {(publishedOk || giveaway.winnersPublished) && giveaway.publishResultsMode === 'RANDOMIZER' && (
                <div className="mb-6 p-3 rounded-xl bg-green-500/20 text-center">
                  <span className="text-green-300 font-medium">✅ {t('winnersPublished')}</span>
                </div>
              )}

              {/* Кнопки управления */}
              <div className="flex flex-wrap justify-center gap-4">
                <button
                  onClick={shareResults}
                  className="px-6 py-3 rounded-xl font-medium transition-transform hover:scale-105"
                  style={{
                    backgroundColor: customization.accentColor,
                    color: isLightBackground(customization.accentColor) ? '#1f2937' : '#ffffff',
                  }}
                >
                  📤 {tCommon('share')}
                </button>
                <button
                  onClick={resetRandomizer}
                  className="px-6 py-3 rounded-xl bg-white/20 font-medium transition-colors hover:bg-white/30"
                  style={{ color: textColor }}
                >
                  🔄 {t('reset')}
                </button>
                <Link
                  href={`/results/${giveawayId}`}
                  className="px-6 py-3 rounded-xl bg-white/20 font-medium transition-colors hover:bg-white/30"
                  style={{ color: textColor }}
                >
                  📋 {t('resultsPage')}
                </Link>
                <Link
                  href="/dashboard"
                  className="px-6 py-3 rounded-xl bg-white/20 font-medium transition-colors hover:bg-white/30"
                  style={{ color: textColor }}
                >
                  ← {tCommon('back')}
                </Link>
              </div>
            </motion.div>
          )}
        </div>
      </main>
    </div>
  );
}
