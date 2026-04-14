'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  getPostTemplates,
  getPostTemplateMediaUrl,
  deletePostTemplate,
  undoDeletePostTemplate,
  PostTemplate,
} from '@/lib/api';
import { InlineToast } from '@/components/Toast';
import { motion, AnimatePresence } from 'framer-motion';
import { AppIcon } from '@/components/AppIcon';
import { Mascot } from '@/components/Mascot';
import { SubscriptionBottomSheet } from '@/components/SubscriptionBottomSheet';
import { TIER_LIMITS } from '@randombeast/shared';

const BOT_USERNAME = process.env.NEXT_PUBLIC_BOT_USERNAME || 'BeastRandomBot';

interface UndoState {
  templateId: string;
  undoUntil: number;
}

function PostCard({
  post,
  onView,
  onDelete,
  t,
  tCommon,
}: {
  post: PostTemplate;
  onView: (id: string) => void;
  onDelete: (id: string) => void;
  t: ReturnType<typeof useTranslations<'postsPage'>>;
  tCommon: ReturnType<typeof useTranslations<'common'>>;
}) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleDelete = () => {
    if (showDeleteConfirm) {
      onDelete(post.id);
      setShowDeleteConfirm(false);
    } else {
      setShowDeleteConfirm(true);
      setTimeout(() => setShowDeleteConfirm(false), 3000);
    }
  };

  return (
    <div className="bg-tg-secondary rounded-xl p-4 mb-3">
      <div className="flex gap-3 mb-3">
        {/* Превью */}
        <div className="w-12 h-12 rounded-lg overflow-hidden bg-tg-bg flex-shrink-0 flex items-center justify-center">
          {post.hasMedia && post.telegramFileId ? (
            post.mediaType === 'VIDEO' ? (
              <video
                src={`${getPostTemplateMediaUrl(post.id)}#t=0.1`}
                preload="metadata"
                muted
                playsInline
                className="w-full h-full object-cover"
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={getPostTemplateMediaUrl(post.id)}
                alt=""
                className="w-full h-full object-cover"
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
              />
            )
          ) : (
            <AppIcon name="icon-edit" size={24} />
          )}
        </div>

        {/* Контент */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-xs px-2 py-0.5 rounded ${
              post.mediaType === 'NONE'
                ? 'bg-gray-500/10 text-gray-500'
                : post.mediaType === 'PHOTO'
                  ? 'bg-blue-500/10 text-blue-500'
                  : 'bg-purple-500/10 text-purple-500'
            }`}>
              {post.mediaType === 'NONE' ? t('typeText') : post.mediaType === 'PHOTO' ? t('typePhoto') : t('typeVideo')}
            </span>
          </div>
          <p className="text-sm text-tg-text line-clamp-2">{post.text}</p>
          <p className="text-xs text-tg-hint mt-1">
            {new Date(post.createdAt).toLocaleString()}
          </p>
        </div>
      </div>

      {/* Действия */}
      <div className="flex gap-2 justify-end pt-2 border-t border-tg-bg">
        <button
          onClick={() => onView(post.id)}
          className="px-3 py-2 text-sm rounded-lg bg-tg-bg text-tg-text hover:bg-tg-bg/70 transition-colors"
        >
          <AppIcon name="icon-view" size={14} /> {t('view')}
        </button>
        <AnimatePresence mode="wait">
          <motion.button
            key={showDeleteConfirm ? 'confirm' : 'delete'}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            onClick={handleDelete}
            className={`px-3 py-2 text-sm rounded-lg transition-colors ${
              showDeleteConfirm
                ? 'bg-red-500 text-white'
                : 'bg-tg-bg text-red-500 hover:bg-red-50'
            }`}
          >
            <AppIcon name="icon-delete" size={14} /> {showDeleteConfirm ? t('deleteConfirm') : tCommon('delete')}
          </motion.button>
        </AnimatePresence>
      </div>
    </div>
  );
}

export default function PostsPage() {
  const router = useRouter();
  const t = useTranslations('postsPage');
  const tCommon = useTranslations('common');
  const tErrors = useTranslations('errors');

  const [posts, setPosts] = useState<PostTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [undoState, setUndoState] = useState<UndoState | null>(null);
  const [showAddConfirm, setShowAddConfirm] = useState(false);
  const [userTier, setUserTier] = useState<'FREE' | 'PLUS' | 'PRO' | 'BUSINESS'>('FREE');
  const [showSubscription, setShowSubscription] = useState(false);

  const loadPosts = useCallback(async () => {
    try {
      const res = await getPostTemplates();
      if (res.ok && res.templates) {
        setPosts(res.templates);
      } else {
        setError(res.error || tErrors('loadFailed'));
      }
    } catch {
      setError(tErrors('loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [tErrors]);

  useEffect(() => {
    loadPosts();
    fetch('/api/users/me/entitlements', { credentials: 'include' })
      .then(r => r.json())
      .then((data: { ok?: boolean; data?: { tier?: string } }) => {
        const tier = data?.data?.tier as typeof userTier;
        if (tier) setUserTier(tier);
      })
      .catch(() => {});
  }, [loadPosts]);

  const handleDelete = async (id: string) => {
    try {
      const res = await deletePostTemplate(id);
      if (res.ok && res.undoUntil) {
        setPosts(prev => prev.filter(p => p.id !== id));
        const undoUntilMs = new Date(res.undoUntil).getTime();
        setUndoState({ templateId: id, undoUntil: undoUntilMs });
        setMessage(t('deleted'));
        setTimeout(() => { setUndoState(null); setMessage(null); }, undoUntilMs - Date.now());
      } else {
        setMessage(res.error || tErrors('error'));
        setTimeout(() => setMessage(null), 3000);
      }
    } catch {
      setMessage(tErrors('connectionError'));
      setTimeout(() => setMessage(null), 3000);
    }
  };

  const handleUndo = async () => {
    if (!undoState) return;
    try {
      const res = await undoDeletePostTemplate(undoState.templateId);
      if (res.ok) {
        setUndoState(null);
        setMessage(t('restored'));
        setTimeout(() => setMessage(null), 2000);
        await loadPosts();
      }
    } catch {
      setMessage(tErrors('connectionError'));
      setTimeout(() => setMessage(null), 3000);
    }
  };

  const handleView = (templateId: string) => {
    const tg = window.Telegram?.WebApp;
    const botUrl = `https://t.me/${BOT_USERNAME}?start=preview_post_${templateId}`;
    if (tg) {
      tg.openTelegramLink(botUrl);
      tg.close();
    } else {
      window.open(botUrl, '_blank');
    }
  };

  const openBotAddPost = () => {
    setShowAddConfirm(true);
  };

  const confirmGoToBot = () => {
    setShowAddConfirm(false);
    const tg = window.Telegram?.WebApp;
    const botUrl = `https://t.me/${BOT_USERNAME}?start=posts`;
    if (tg) {
      tg.openTelegramLink(botUrl);
      tg.close();
    } else {
      window.open(botUrl, '_blank');
    }
  };

  const goBack = () => {
    router.push('/creator');
  };

  return (
    <div className="min-h-screen bg-tg-bg">
      <AnimatePresence mode="wait">
        {loading ? (
          <motion.div
            key="loading"
            className="flex items-center justify-center min-h-screen"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
          >
            <div className="text-tg-hint">{tCommon('loading')}</div>
          </motion.div>
        ) : (
          <motion.div
            key="content"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
          >
            {/* Header */}
            <header className="sticky top-0 z-10 bg-tg-bg border-b border-tg-secondary">
              <div className="max-w-xl mx-auto px-4 py-3 flex items-center gap-3">
                <button
                  onClick={goBack}
                  className="flex items-center gap-1 text-tg-link text-sm hover:opacity-70"
                >
                  <AppIcon name="icon-back" size={16} /> {tCommon('back')}
                </button>
                <h1 className="text-lg font-semibold text-tg-text flex-1">
                  {t('title')}
                </h1>
              </div>
            </header>

            <div className="max-w-xl mx-auto p-4">
              <InlineToast message={message} onClose={() => setMessage(null)} />

              {/* Undo bar */}
              {undoState && Date.now() < undoState.undoUntil && (
                <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 mb-4 flex items-center justify-between">
                  <span className="text-sm text-yellow-600">{t('deleted')}</span>
                  <button onClick={handleUndo} className="text-sm text-tg-button font-medium">
                    {t('undo')}
                  </button>
                </div>
              )}

              {/* Секция добавления */}
              {(() => {
                const maxPosts = TIER_LIMITS.maxPostTemplates[userTier];
                const limitReached = posts.length >= maxPosts;
                return (
                  <div className="bg-tg-secondary rounded-xl p-4 mb-6">
                    <h3 className="text-tg-text font-medium mb-2">{t('addTitle')}</h3>
                    <p className="text-tg-hint text-sm mb-2">
                      {t('addDescription')}
                    </p>
                    <p className="text-xs text-tg-hint mb-4">
                      {`${posts.length} / ${maxPosts === Infinity ? '∞' : maxPosts} (${userTier})`}
                    </p>
                    {limitReached ? (
                      <>
                        <p className="text-xs text-orange-500 mb-3">
                          <AppIcon name="icon-warning" size={12} className="inline mr-1" />
                          {`Достигнут лимит шаблонов: ${maxPosts}`}
                        </p>
                        <button
                          onClick={() => setShowSubscription(true)}
                          className="w-full px-4 py-3 bg-tg-button text-tg-button-text rounded-xl font-medium hover:opacity-90 transition-opacity"
                        >
                          Повысить подписку
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={openBotAddPost}
                        className="w-full px-4 py-3 bg-tg-button text-tg-button-text rounded-xl font-medium hover:opacity-90 transition-opacity"
                      >
                        {t('addButton')}
                      </button>
                    )}
                  </div>
                );
              })()}

              {/* Ошибка */}
              {error && (
                <div className="bg-red-50 text-red-600 p-4 rounded-xl mb-4 text-center">
                  {error}
                  <button onClick={loadPosts} className="block w-full mt-2 text-sm text-red-500 underline">
                    {tCommon('tryAgain')}
                  </button>
                </div>
              )}

              {/* Список постов */}
              {posts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
                  <Mascot type="state-empty" size={120} loop autoplay />
                  <h3 className="text-xl font-semibold text-tg-text mb-2 mt-2">{t('emptyTitle')}</h3>
                  <p className="text-tg-hint mb-6 max-w-sm">{t('emptySubtitle')}</p>
                  <button
                    onClick={openBotAddPost}
                    className="px-6 py-3 bg-tg-button text-tg-button-text rounded-xl font-medium hover:opacity-90 transition-opacity"
                  >
                    {t('addFirst')}
                  </button>
                </div>
              ) : (
                <div>
                  <h3 className="text-tg-hint text-sm mb-3">
                    {t('count', { count: posts.length })}
                  </h3>
                  {posts.map(post => (
                    <PostCard
                      key={post.id}
                      post={post}
                      onView={handleView}
                      onDelete={handleDelete}
                      t={t}
                      tCommon={tCommon}
                    />
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Popup подтверждения перехода к боту */}
      <AnimatePresence>
        {showAddConfirm && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 bg-black/50 z-50"
              onClick={() => setShowAddConfirm(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-50 bg-tg-bg rounded-2xl p-6 max-w-sm mx-auto shadow-xl"
            >
              <div className="text-center mb-4">
                <AppIcon name="icon-edit" size={40} className="mx-auto mb-3" />
                <h3 className="text-lg font-semibold mb-2">{t('addTitle')}</h3>
                <p className="text-tg-hint text-sm">{t('addPopupDescription')}</p>
              </div>
              <div className="flex flex-col gap-2">
                <button
                  onClick={confirmGoToBot}
                  className="w-full py-3 bg-tg-button text-tg-button-text rounded-xl font-medium hover:opacity-90 transition-opacity"
                >
                  {t('goToBot')}
                </button>
                <button
                  onClick={() => setShowAddConfirm(false)}
                  className="w-full py-3 bg-tg-secondary text-tg-text rounded-xl font-medium hover:bg-tg-secondary/80 transition-colors"
                >
                  {tCommon('cancel')}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <SubscriptionBottomSheet
        isOpen={showSubscription}
        onClose={() => setShowSubscription(false)}
        currentTier={userTier === 'FREE' ? 'free' : userTier.toLowerCase() as 'plus' | 'pro' | 'business'}
      />
    </div>
  );
}
