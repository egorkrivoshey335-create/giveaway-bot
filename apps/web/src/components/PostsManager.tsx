'use client';

import { useState, useCallback, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { motion, AnimatePresence } from 'framer-motion';
import { BottomSheet } from './ui/BottomSheet';
import { EmptyState } from './ui/EmptyState';
import { InlineToast } from './Toast';
import { getPostTemplates, deletePostTemplate, PostTemplate } from '@/lib/api';
import { hapticSuccess, hapticError, hapticSelect, hapticDelete } from '@/lib/haptic';

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

  // Создать новый пост → переход в бота
  const handleCreatePost = () => {
    const tg = window.Telegram?.WebApp;
    const link = `https://t.me/${BOT_USERNAME}?start=new_post`;
    
    if (tg) {
      tg.openTelegramLink(link);
    } else {
      window.open(link, '_blank');
    }
    
    // Показать уведомление
    setMessage(t('createRedirect'));
    setTimeout(() => setMessage(null), 3000);
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

  // Получить иконку типа медиа
  const getMediaIcon = (mediaType: string) => {
    switch (mediaType) {
      case 'PHOTO': return '🖼️';
      case 'VIDEO': return '🎬';
      default: return '📄';
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
          <div className="py-12 text-center">
            <div className="animate-spin w-8 h-8 border-2 border-tg-button border-t-transparent rounded-full mx-auto mb-3" />
            <p className="text-tg-hint text-sm">{tCommon('loading')}</p>
          </div>
        ) : posts.length === 0 ? (
          <EmptyState
            icon="icon-edit"
            title={t('empty.title')}
            description={t('empty.description')}
            action={{
              label: t('createNew'),
              onClick: handleCreatePost
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
                  <div className="flex items-start gap-3">
                    {/* Миниатюра / Иконка типа медиа */}
                    <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-tg-bg flex items-center justify-center text-2xl">
                      {getMediaIcon(post.mediaType)}
                    </div>

                    {/* Контент */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-tg-text line-clamp-2 mb-1">
                        {post.text || t('noText')}
                      </p>
                      <p className="text-xs text-tg-hint">
                        {post.mediaType !== 'NONE' && `${post.mediaType} • `}
                        {post.text.length} {t('characters')}
                      </p>
                    </div>

                    {/* Действия */}
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {mode === 'select' ? (
                        // Режим выбора
                        <button
                          onClick={() => handleSelectPost(post)}
                          className={`p-2 rounded-lg transition-colors ${
                            isSelected
                              ? 'bg-tg-button text-tg-button-text'
                              : 'bg-tg-bg hover:bg-tg-bg/80'
                          }`}
                          title={isSelected ? t('selected') : t('select')}
                        >
                          {isSelected ? '✓' : '○'}
                        </button>
                      ) : (
                        // Режим управления
                        <>
                          {/* Просмотр */}
                          <button
                            onClick={() => handleViewPost(post.id)}
                            className="p-2 rounded-lg bg-tg-bg hover:bg-tg-bg/80 transition-colors"
                            title={t('view')}
                          >
                            👁️
                          </button>

                          {/* Удалить */}
                          {!isDeleting && (
                            <button
                              onClick={() => handleDeletePost(post.id)}
                              className="p-2 rounded-lg bg-tg-bg hover:bg-red-500/20 transition-colors"
                              title={t('delete')}
                            >
                              🗑️
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
              onClick={handleCreatePost}
              className="w-full py-3 border-2 border-dashed border-tg-hint/30 rounded-lg text-tg-hint hover:border-tg-button hover:text-tg-button transition-colors"
            >
              ➕ {t('createNew')}
            </button>
          </div>
        )}
      </BottomSheet>

      {/* Toast уведомления */}
      <InlineToast message={message} onClose={() => setMessage(null)} />
    </>
  );
}
