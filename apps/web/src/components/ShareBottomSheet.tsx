'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { BottomSheet } from './ui/BottomSheet';
import { Tabs } from './ui/Tabs';
import { getTrackingLinks, createTrackingLink, type TrackingLink } from '@/lib/api';
import { InlineToast } from './Toast';

interface ShareBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  giveawayId: string;
  shortCode?: string;
  botUsername: string;
}

export function ShareBottomSheet({
  isOpen,
  onClose,
  giveawayId,
  shortCode,
  botUsername = 'BeastRandomBot'
}: ShareBottomSheetProps) {
  const t = useTranslations('giveawayDetails');
  const tCommon = useTranslations('common');

  const [activeTab, setActiveTab] = useState('commands');
  const [links, setLinks] = useState<TrackingLink[]>([]);
  const [newTag, setNewTag] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Загрузка трекинг-ссылок при открытии
  useEffect(() => {
    if (isOpen && activeTab === 'links') {
      loadLinks();
    }
  }, [isOpen, activeTab]);

  const loadLinks = async () => {
    try {
      const res = await getTrackingLinks(giveawayId);
      if (res.ok && res.items) {
        setLinks(res.items);
      }
    } catch (err) {
      console.error('Failed to load tracking links:', err);
    }
  };

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setMessage(t('share.copied', { label }));
    setTimeout(() => setMessage(null), 2000);
  };

  const handleCreateLink = async () => {
    if (!newTag.trim()) {
      setMessage(t('share.enterTag'));
      setTimeout(() => setMessage(null), 2000);
      return;
    }

    setLoading(true);
    try {
      const res = await createTrackingLink(giveawayId, newTag.trim());
      if (res.ok) {
        setNewTag('');
        await loadLinks();
        setMessage(t('share.linkCreated'));
      } else {
        setMessage(res.error || tCommon('error'));
      }
    } catch (err) {
      console.error('Failed to create tracking link:', err);
      setMessage(tCommon('error'));
    } finally {
      setLoading(false);
      setTimeout(() => setMessage(null), 3000);
    }
  };

  const inlineCommand = `@${botUsername} ${shortCode || giveawayId.slice(0, 8)}`;
  const botCommand = `/repost:${shortCode || giveawayId.slice(0, 8)}`;

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title={t('share.title')}>
      <div className="space-y-4">
        {/* Табы */}
        <Tabs
          tabs={[
            { id: 'commands', label: t('share.tabs.commands'), content: null },
            { id: 'links', label: t('share.tabs.links'), content: null },
          ]}
          activeTab={activeTab}
          onChange={setActiveTab}
        />

        {/* Сообщение */}
        {message && (
          <div className="text-center text-sm text-tg-hint">{message}</div>
        )}

        {/* Таб: Команды */}
        {activeTab === 'commands' && (
          <div className="space-y-4">
            {/* Инлайн команда */}
            <div>
              <div className="text-sm text-tg-hint mb-2">
                {t('share.inlineCommand')}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={inlineCommand}
                  readOnly
                  className="flex-1 bg-tg-secondary text-tg-text rounded-lg px-3 py-2 text-sm"
                />
                <button
                  onClick={() => handleCopy(inlineCommand, t('share.inlineCommandLabel'))}
                  className="bg-tg-button text-tg-button-text rounded-lg px-4 py-2 text-sm font-medium"
                >
                  {tCommon('copy')}
                </button>
              </div>
            </div>

            {/* Команда в боте */}
            <div>
              <div className="text-sm text-tg-hint mb-2">
                {t('share.botCommand')}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={botCommand}
                  readOnly
                  className="flex-1 bg-tg-secondary text-tg-text rounded-lg px-3 py-2 text-sm"
                />
                <button
                  onClick={() => handleCopy(botCommand, t('share.botCommandLabel'))}
                  className="bg-tg-button text-tg-button-text rounded-lg px-4 py-2 text-sm font-medium"
                >
                  {tCommon('copy')}
                </button>
              </div>
            </div>

            {/* Подсказка */}
            <div className="bg-tg-secondary rounded-lg p-3 text-sm text-tg-hint">
              ✨ {t('share.commandHint')}
            </div>
          </div>
        )}

        {/* Таб: Ссылки */}
        {activeTab === 'links' && (
          <div className="space-y-4">
            {/* Создание ссылки */}
            <div className="space-y-2">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  placeholder={t('share.tagPlaceholder')}
                  disabled={loading}
                  className="flex-1 bg-tg-secondary text-tg-text rounded-lg px-3 py-2 text-sm transition-all disabled:opacity-50"
                  maxLength={50}
                />
                <button
                  onClick={handleCreateLink}
                  disabled={loading || !newTag.trim()}
                  className="bg-tg-button text-tg-button-text rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50 transition-all hover:scale-105 active:scale-95"
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      {tCommon('loading')}
                    </span>
                  ) : (
                    t('share.create')
                  )}
                </button>
              </div>
              <div className="text-xs text-tg-hint">
                {t('share.linksHint')}
              </div>
            </div>

            {/* Список ссылок */}
            {links.length > 0 ? (
              <div className="space-y-2">
                {links.map((link, index) => (
                  <div 
                    key={link.id} 
                    className="bg-tg-secondary rounded-lg p-3 transition-all duration-300 hover:bg-opacity-80"
                    style={{
                      animation: `slideIn 0.3s ease-out ${index * 0.1}s both`
                    }}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="font-medium">{link.tag}</div>
                      <div className="flex gap-3 text-xs text-tg-hint">
                        <span className="flex items-center gap-1">
                          👁️ {link.clicks}
                        </span>
                        <span className="flex items-center gap-1">
                          ✅ {link.joins}
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={link.url}
                        readOnly
                        className="flex-1 bg-tg-bg text-tg-text rounded px-2 py-1 text-xs"
                      />
                      <button
                        onClick={() => handleCopy(link.url, link.tag)}
                        className="bg-tg-button text-tg-button-text rounded px-3 py-1 text-xs font-medium transition-all hover:scale-105 active:scale-95"
                      >
                        {tCommon('copy')}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-tg-hint animate-fadeIn">
                {t('share.noLinks')}
              </div>
            )}
          </div>
        )}
      </div>
    </BottomSheet>
  );
}
