'use client';

import { useState, useEffect, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  getGiveawaysList,
  getChannels,
  getPostTemplates,
  deleteChannel,
  deletePostTemplate,
  undoDeletePostTemplate,
  GiveawaySummary,
  Channel,
  PostTemplate,
} from '@/lib/api';
import { Stagger, StaggerItem } from '@/components/FadeIn';
import { AppIcon } from '@/components/AppIcon';

// Undo state для постов
interface UndoState {
  templateId: string;
  undoUntil: number;
}

export function CreatorSection() {
  const router = useRouter();
  const t = useTranslations('creator');
  const tCommon = useTranslations('common');
  const tChannels = useTranslations('channels');
  
  // Розыгрыши
  const [counts, setCounts] = useState({ all: 0, active: 0 });
  const [countsLoading, setCountsLoading] = useState(true);
  
  // Каналы
  const [channels, setChannels] = useState<Channel[]>([]);
  const [channelsLoading, setChannelsLoading] = useState(true);
  
  // Посты
  const [postTemplates, setPostTemplates] = useState<PostTemplate[]>([]);
  const [postsLoading, setPostsLoading] = useState(true);
  const [undoState, setUndoState] = useState<UndoState | null>(null);

  // Загрузка данных
  const loadCounts = useCallback(async () => {
    setCountsLoading(true);
    try {
      const res = await getGiveawaysList({ limit: 1 });
      if (res.ok && res.counts) {
        setCounts({
          all: res.counts.all,
          active: res.counts.active,
        });
      }
    } catch (err) {
      console.error('Failed to load counts:', err);
    } finally {
      setCountsLoading(false);
    }
  }, []);

  const loadChannels = useCallback(async () => {
    setChannelsLoading(true);
    try {
      const res = await getChannels();
      if (res.ok && res.channels) {
        setChannels(res.channels);
      }
    } catch (err) {
      console.error('Failed to load channels:', err);
    } finally {
      setChannelsLoading(false);
    }
  }, []);

  const loadPostTemplates = useCallback(async () => {
    setPostsLoading(true);
    try {
      const res = await getPostTemplates();
      if (res.ok && res.templates) {
        setPostTemplates(res.templates);
      }
    } catch (err) {
      console.error('Failed to load posts:', err);
    } finally {
      setPostsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCounts();
    loadChannels();
    loadPostTemplates();
  }, [loadCounts, loadChannels, loadPostTemplates]);

  // Удаление канала
  const handleDeleteChannel = async (channelId: string) => {
    if (!confirm(tChannels('deleteConfirm'))) return;
    try {
      const res = await deleteChannel(channelId);
      if (res.ok) {
        setChannels(prev => prev.filter(c => c.id !== channelId));
      }
    } catch (err) {
      console.error('Failed to delete channel:', err);
    }
  };

  // Удаление поста
  const handleDeletePost = async (templateId: string) => {
    try {
      const res = await deletePostTemplate(templateId);
      if (res.ok && res.undoUntil) {
        setPostTemplates(prev => prev.filter(t => t.id !== templateId));
        const undoUntilMs = new Date(res.undoUntil).getTime();
        setUndoState({ templateId, undoUntil: undoUntilMs });
        setTimeout(() => setUndoState(null), undoUntilMs - Date.now());
      }
    } catch (err) {
      console.error('Failed to delete post:', err);
    }
  };

  // Отмена удаления поста
  const handleUndoDelete = async () => {
    if (!undoState) return;
    try {
      const res = await undoDeletePostTemplate(undoState.templateId);
      if (res.ok) {
        await loadPostTemplates();
        setUndoState(null);
      }
    } catch (err) {
      console.error('Failed to undo delete:', err);
    }
  };

  const contentMotion = {
    initial: { opacity: 0, y: 14 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -8 },
    transition: { duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94] as const },
    layout: true as const,
  };

  return (
    <div>
      {/* Заголовок */}
      <div className="mb-4">
        <h2 className="text-xl font-bold">{t('title')}</h2>
        <p className="text-tg-hint text-sm">{t('subtitle')}</p>
      </div>

      <Stagger>
        <StaggerItem>
          <button
            onClick={() => router.push('/creator/giveaway/new')}
            className="w-full bg-tg-button text-tg-button-text rounded-xl py-3 px-4 font-medium mb-6 hover:opacity-90 transition-opacity"
          >
            {t('createButton')}
          </button>
        </StaggerItem>

        <StaggerItem>
          <motion.div layout className="bg-tg-secondary rounded-xl p-4 mb-6" transition={{ layout: { duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] } }}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">{t('channels')}</h3>
              <button
                onClick={loadChannels}
                className="text-tg-button text-sm"
                disabled={channelsLoading}
              >
                {channelsLoading ? '...' : <AppIcon name="icon-refresh" size={16} />}
              </button>
            </div>

            <AnimatePresence mode="wait">
              {channelsLoading ? (
                <motion.div
                  key="channels-loading"
                  {...contentMotion}
                  className="flex items-center justify-center py-4"
                >
                  <div className="animate-spin w-5 h-5 border-2 border-tg-button border-t-transparent rounded-full mr-2" />
                  <span className="text-tg-hint text-sm">{tCommon('loading')}</span>
                </motion.div>
              ) : channels.length === 0 ? (
                <motion.div key="channels-empty" {...contentMotion} className="text-center py-4">
                  <p className="text-tg-hint text-sm mb-3">{t('noChannels')}</p>
                  <p className="text-tg-hint text-xs">{tChannels('addDescription')}</p>
                </motion.div>
              ) : (
                <motion.div key="channels-list" {...contentMotion} className="space-y-3">
                  {channels.map((channel) => (
                    <div key={channel.id} className="bg-tg-bg rounded-lg p-3 flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          {channel.type === 'CHANNEL' ? (
                            <AppIcon name="icon-channel" size={16} />
                          ) : (
                            <AppIcon name="icon-group" size={16} />
                          )}
                          <span className="font-medium truncate">{channel.title}</span>
                        </div>
                        {channel.username && <p className="text-sm text-tg-hint mt-0.5">@{channel.username}</p>}
                        <div className="flex flex-wrap gap-2 mt-2">
                          <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded ${channel.botIsAdmin ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
                            {channel.botIsAdmin ? (
                              <AppIcon name="icon-success" size={12} />
                            ) : (
                              <AppIcon name="icon-error" size={12} />
                            )}
                            {tChannels('botAdmin')}
                          </span>
                          <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded ${channel.creatorIsAdmin ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
                            {channel.creatorIsAdmin ? (
                              <AppIcon name="icon-success" size={12} />
                            ) : (
                              <AppIcon name="icon-error" size={12} />
                            )}
                            {tChannels('youAdmin')}
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() => handleDeleteChannel(channel.id)}
                        className="text-red-500 text-sm ml-2 p-1 inline-flex items-center justify-center"
                        title={tCommon('delete')}
                      >
                        <AppIcon name="icon-delete" size={14} />
                      </button>
                    </div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </StaggerItem>

        <StaggerItem>
          <motion.div layout className="bg-tg-secondary rounded-xl p-4 mb-6" transition={{ layout: { duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] } }}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">{t('posts')}</h3>
              <button
                onClick={loadPostTemplates}
                className="text-tg-button text-sm"
                disabled={postsLoading}
              >
                {postsLoading ? '...' : <AppIcon name="icon-refresh" size={16} />}
              </button>
            </div>

            {undoState && Date.now() < undoState.undoUntil && (
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 mb-4 flex items-center justify-between">
                <span className="text-sm text-yellow-600">{t('postDeleted')}</span>
                <button onClick={handleUndoDelete} className="text-sm text-tg-button font-medium">
                  {t('undo')}
                </button>
              </div>
            )}

            <AnimatePresence mode="wait">
              {postsLoading ? (
                <motion.div
                  key="posts-loading"
                  {...contentMotion}
                  className="flex items-center justify-center py-4"
                >
                  <div className="animate-spin w-5 h-5 border-2 border-tg-button border-t-transparent rounded-full mr-2" />
                  <span className="text-tg-hint text-sm">{tCommon('loading')}</span>
                </motion.div>
              ) : postTemplates.length === 0 ? (
                <motion.div key="posts-empty" {...contentMotion} className="text-center py-4">
                  <p className="text-tg-hint text-sm mb-3">{t('noPosts')}</p>
                </motion.div>
              ) : (
                <motion.div key="posts-list" {...contentMotion} className="space-y-3">
                  {postTemplates.map((post) => (
                    <div key={post.id} className="bg-tg-bg rounded-lg p-3 flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          {post.mediaType === 'NONE' ? (
                            <AppIcon name="icon-edit" size={14} />
                          ) : post.mediaType === 'PHOTO' ? (
                            <AppIcon name="icon-image" size={14} />
                          ) : (
                            <AppIcon name="icon-camera" size={14} />
                          )}
                          <span className={`text-xs px-2 py-0.5 rounded ${
                            post.mediaType === 'NONE'
                              ? 'bg-gray-500/10 text-gray-500'
                              : post.mediaType === 'PHOTO'
                                ? 'bg-blue-500/10 text-blue-500'
                                : 'bg-purple-500/10 text-purple-500'
                          }`}>
                            {post.mediaType === 'NONE' ? t('mediaType.text') : post.mediaType === 'PHOTO' ? t('mediaType.photo') : t('mediaType.video')}
                          </span>
                        </div>
                        <p className="text-sm text-tg-text line-clamp-2">{post.text}</p>
                        <p className="text-xs text-tg-hint mt-1">
                          {new Date(post.createdAt).toLocaleString()}
                        </p>
                      </div>
                      <button
                        onClick={() => handleDeletePost(post.id)}
                        className="text-red-500 text-sm ml-2 p-1 inline-flex items-center justify-center"
                        title={tCommon('delete')}
                      >
                        <AppIcon name="icon-delete" size={14} />
                      </button>
                    </div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </StaggerItem>

        <StaggerItem>
          <div className="grid grid-cols-2 gap-3 mb-6">
            <div className="bg-tg-secondary rounded-xl p-4 text-center">
              {countsLoading ? (
                <div className="animate-spin w-5 h-5 border-2 border-tg-button border-t-transparent rounded-full mx-auto" />
              ) : (
                <>
                  <div className="text-2xl font-bold text-tg-text">{counts.all}</div>
                  <div className="text-sm text-tg-hint">{t('totalGiveaways')}</div>
                </>
              )}
            </div>
            <div className="bg-tg-secondary rounded-xl p-4 text-center">
              {countsLoading ? (
                <div className="animate-spin w-5 h-5 border-2 border-tg-button border-t-transparent rounded-full mx-auto" />
              ) : (
                <>
                  <div className="text-2xl font-bold text-green-500">{counts.active}</div>
                  <div className="text-sm text-tg-hint">{t('activeGiveaways')}</div>
                </>
              )}
            </div>
          </div>
        </StaggerItem>

        <StaggerItem>
          <button
            onClick={() => router.push('/creator')}
            className="w-full bg-tg-secondary text-tg-text rounded-xl py-3 px-4 font-medium hover:bg-tg-secondary/80 transition-colors flex items-center justify-center gap-2"
          >
            <span>{t('openDashboard')}</span>
            <AppIcon name="icon-back" size={16} className="rotate-180" />
          </button>
        </StaggerItem>
      </Stagger>
    </div>
  );
}

export default CreatorSection;
