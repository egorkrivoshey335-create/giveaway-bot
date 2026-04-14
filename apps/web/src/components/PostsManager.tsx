'use client';

import { useState, useCallback, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { motion, AnimatePresence } from 'framer-motion';
import { BottomSheet } from './ui/BottomSheet';
import { EmptyState } from './ui/EmptyState';
import { InlineToast } from './Toast';
import { getPostTemplates, deletePostTemplate, getPostTemplateMediaUrl, PostTemplate } from '@/lib/api';
import { hapticSuccess, hapticError, hapticSelect, hapticDelete } from '@/lib/haptic';
import { AppIcon } from '@/components/AppIcon';
import { Mascot } from '@/components/Mascot';

// Bot username из env
const BOT_USERNAME = process.env.NEXT_PUBLIC_BOT_USERNAME || 'BeastRandomBot';

export interface PostsManagerProps {
  /** Открыт ли BottomSheet */
  isOpen: boolean;
  /** Callback при закрытии */
  onClose: () => void;
  /** Режим: 'manage' (управление) или 'select' (выбор поста) */
  mode: 'manage' | 'select';
  /** В режиме select: callback при выборе поста */
  onSelect?: (post: PostTemplate) => void;
  /** В режиме select: ID текущего выбранного поста */
  selectedId?: string | null;
}

/**
 * PostsManager — управление шаблонами постов
 * 
 * **Режимы:**
 * - `manage` — полное управление (просмотр, удаление, создание)
 * - `select` — выбор поста (используется в мастере создания)
 * 
 * @example
 * ```tsx
 * // Режим выбора в мастере
 * <PostsManager
 *   isOpen={showPosts}
 *   onClose={() => setShowPosts(false)}
 *   mode="select"
 *   selectedId={payload.postTemplateId}
 *   onSelect={(post) => {
 *     updatePayload({ postTemplateId: post.id });
 *     setShowPosts(false);
 *   }}
 * />
 * 
 * // Режим управления
 * <PostsManager
 *   isOpen={showPosts}
 *   onClose={() => setShowPosts(false)}
 *   mode="manage"
 * />
 * ```
 */
export function PostsManager({
  isOpen,
  onClose,
  mode,
  onSelect,
  selectedId,
}: PostsManagerProps) {
  const t = useTranslations('postsManager');
  const tCommon = useTranslations('common');
  const tErrors = useTranslations('errors');

  const [posts, setPosts] = useState<PostTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [deleteQueue, setDeleteQueue] = useState<{ id: string; timeoutId: NodeJS.Timeout } | null>(null);
  const [showAddConfirm, setShowAddConfirm] = useState(false);

  // Загрузка постов
  const loadPosts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getPostTemplates();
      if (res.ok && res.templates) {
        setPosts(res.templates);
      }
    } catch (err) {
      console.error('Failed to load posts:', err);
      setMessage(tErrors('loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [tErrors]);

  useEffect(() => {
    if (isOpen) {
      loadPosts();
    }
  }, [isOpen, loadPosts]);

  // Очистка таймеров при unmount
  useEffect(() => {
    return () => {
      if (deleteQueue) {
        clearTimeout(deleteQueue.timeoutId);
      }
    };
  }, [deleteQueue]);

  const confirmGoToBot = () => {
    setShowAddConfirm(false);
    const tg = window.Telegram?.WebApp;
    const link = `https://t.me/${BOT_USERNAME}?start=posts`;
    if (tg) {
      tg.openTelegramLink(link);
      setTimeout(() => tg.close(), 300);
    } else {
      window.open(link, '_blank');
    }
  };

  // Просмотр поста → переход в бота
  const handleViewPost = (postId: string) => {
    const tg = window.Telegram?.WebApp;
    const link = `https://t.me/${BOT_USERNAME}?start=view_post_${postId}`;
    
    if (tg) {
      tg.openTelegramLink(link);
    } else {
      window.open(link, '_blank');
    }
  };

  // Удалить пост (с undo)
  const handleDeletePost = async (postId: string) => {
    // Если уже в очереди на удаление этого поста — подтвердить удаление
    if (deleteQueue && deleteQueue.id === postId) {
      clearTimeout(deleteQueue.timeoutId);
      setDeleteQueue(null);
      
      try {
        const res = await deletePostTemplate(postId);
        if (res.ok) {
          hapticSuccess(); // Haptic feedback при успехе
          setPosts(prev => prev.filter(p => p.id !== postId));
          setMessage(t('deleted'));
        } else {
          hapticError(); // Haptic feedback при ошибке
          setMessage(res.error || tErrors('deleteFailed'));
        }
      } catch (err) {
        console.error('Delete error:', err);
        hapticError(); // Haptic feedback при ошибке
        setMessage(tErrors('deleteFailed'));
      }
      setTimeout(() => setMessage(null), 2000);
      return;
    }

    // Иначе — добавить в очередь с таймером 20 сек
    hapticDelete(); // Haptic feedback при пометке на удаление
    const timeoutId = setTimeout(async () => {
      try {
        const res = await deletePostTemplate(postId);
        if (res.ok) {
          setPosts(prev => prev.filter(p => p.id !== postId));
        }
      } catch (err) {
        console.error('Auto-delete error:', err);
      }
      setDeleteQueue(null);
    }, 20000);

    setDeleteQueue({ id: postId, timeoutId });
    setMessage(t('deleteUndo'));
  };

  // Отменить удаление
  const handleUndoDelete = () => {
    if (deleteQueue) {
      hapticSuccess(); // Haptic feedback при отмене
      clearTimeout(deleteQueue.timeoutId);
      setDeleteQueue(null);
      setMessage(t('deleteCancelled'));
      setTimeout(() => setMessage(null), 2000);
    }
  };

  // Выбрать пост (режим select)
  const handleSelectPost = (post: PostTemplate) => {
    if (mode === 'select' && onSelect) {
      hapticSelect(); // Haptic feedback при выборе
      onSelect(post);
    }
  };

  const getMediaBadge = (mediaType: string) => {
    switch (mediaType) {
      case 'PHOTO': return { label: t('typePhoto'), className: 'bg-blue-500/15 text-blue-500' };
      case 'VIDEO': return { label: t('typeVideo'), className: 'bg-purple-500/15 text-purple-500' };
      default: return { label: t('typeText'), className: 'bg-gray-500/15 text-gray-500' };
    }
  };

  return (
    <>
      <BottomSheet
        isOpen={isOpen}
        onClose={onClose}
        title={mode === 'select' ? t('selectTitle') : t('manageTitle')}
        maxHeight="80vh"
      >
        {loading ? (
          <div className="flex flex-col items-center py-8 text-center">
            <Mascot type="state-loading" size={100} loop autoplay />
            <p className="text-tg-hint text-sm mt-2">{tCommon('loading')}</p>
          </div>
        ) : posts.length === 0 ? (
          <EmptyState
            icon="icon-edit"
            title={t('empty.title')}
            description={t('empty.description')}
            action={{
              label: t('createNew'),
              onClick: () => setShowAddConfirm(true)
            }}
          />
        ) : (
          <div className="space-y-3">
            {/* Список постов */}
            <AnimatePresence mode="popLayout">
            {posts.map((post) => {
              const isSelected = mode === 'select' && selectedId === post.id;
              const isDeleting = deleteQueue?.id === post.id;

              return (
                <motion.div
                  key={post.id}
                  layout
                  initial={{ opacity: 0, scale: 0.95, y: -10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ 
                    opacity: 0, 
                    scale: 0.9, 
                    x: -100,
                    transition: { duration: 0.3 }
                  }}
                  transition={{ duration: 0.2 }}
                  className={`rounded-lg p-3 transition-colors ${
                    isDeleting
                      ? 'bg-red-500/10 border-2 border-red-500/30'
                      : isSelected
                      ? 'bg-tg-button/10 border-2 border-tg-button'
                      : 'bg-tg-secondary hover:bg-tg-secondary/80'
                  }`}
                >
                  <div
                    className={`flex items-start gap-3 ${mode === 'select' ? 'cursor-pointer' : ''}`}
                    onClick={mode === 'select' ? () => handleSelectPost(post) : undefined}
                  >
                    {/* Миниатюра */}
                    <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-tg-bg flex items-center justify-center overflow-hidden">
                      {post.mediaType === 'VIDEO' ? (
                        <video
                          src={`${getPostTemplateMediaUrl(post.id)}#t=0.1`}
                          className="w-full h-full object-cover"
                          muted
                          preload="metadata"
                        />
                      ) : post.mediaType === 'PHOTO' ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={getPostTemplateMediaUrl(post.id)}
                          alt=""
                          className="w-full h-full object-cover"
                          onError={(e) => { e.currentTarget.style.display = 'none'; }}
                        />
                      ) : (
                        <AppIcon name="icon-edit" size={20} />
                      )}
                    </div>

                    {/* Контент */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-tg-text line-clamp-2 mb-1">
                        {post.text || t('noText')}
                      </p>
                      <div className="flex items-center gap-2">
                        {(() => {
                          const badge = getMediaBadge(post.mediaType);
                          return (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${badge.className}`}>
                              {badge.label}
                            </span>
                          );
                        })()}
                        <span className="text-xs text-tg-hint">{post.text.length} {t('characters')}</span>
                      </div>
                    </div>

                    {/* Действия */}
                    <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                      {mode === 'select' ? (
                        <span className={`w-5 h-5 rounded flex items-center justify-center text-xs ${
                          isSelected ? 'bg-tg-button text-tg-button-text' : 'bg-tg-bg border border-tg-hint/30'
                        }`}>
                          {isSelected ? <AppIcon name="icon-success" size={14} /> : ''}
                        </span>
                      ) : (
                        <>
                          <button
                            onClick={() => handleViewPost(post.id)}
                            className="p-2 rounded-lg bg-tg-bg hover:bg-tg-bg/80 transition-colors"
                            title={t('view')}
                          >
                            <AppIcon name="icon-view" size={14} />
                          </button>
                          {!isDeleting && (
                            <button
                              onClick={() => handleDeletePost(post.id)}
                              className="p-2 rounded-lg bg-tg-bg hover:bg-red-500/20 transition-colors"
                              title={t('delete')}
                            >
                              <AppIcon name="icon-delete" size={14} />
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  {/* Уведомление об удалении */}
                  {isDeleting && (
                    <div className="mt-2 pt-2 border-t border-red-500/30 flex items-center justify-between">
                      <p className="text-xs text-red-600">{t('deletingIn20')}</p>
                      <button
                        onClick={handleUndoDelete}
                        className="text-xs text-tg-link underline"
                      >
                        {t('undo')}
                      </button>
                    </div>
                  )}
                </motion.div>
              );
            })}
            </AnimatePresence>

            {/* Кнопка создать новый */}
            <button
              onClick={() => setShowAddConfirm(true)}
              className="w-full py-3 border-2 border-dashed border-tg-hint/30 rounded-lg text-tg-hint hover:border-tg-button hover:text-tg-button transition-colors"
            >
              ➕ {t('createNew')}
            </button>

          </div>
        )}

        {/* Popup подтверждения перехода к боту (показывается из empty state или кнопки) */}
        <AnimatePresence>
          {showAddConfirm && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="bg-tg-bg rounded-xl p-4 mt-3 border border-tg-secondary"
            >
              <p className="text-sm text-tg-text mb-3 text-center">{t('addPopupDescription')}</p>
              <div className="flex gap-2">
                <button
                  onClick={confirmGoToBot}
                  className="flex-1 bg-tg-button text-tg-button-text rounded-lg py-2.5 text-sm font-medium"
                >
                  {t('goToBot')}
                </button>
                <button
                  onClick={() => setShowAddConfirm(false)}
                  className="flex-1 bg-tg-secondary text-tg-text rounded-lg py-2.5 text-sm font-medium"
                >
                  {tCommon('cancel')}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </BottomSheet>

      {/* Toast уведомления */}
      <InlineToast message={message} onClose={() => setMessage(null)} />
    </>
  );
}
