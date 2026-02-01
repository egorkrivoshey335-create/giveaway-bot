'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
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

// Undo state для постов
interface UndoState {
  templateId: string;
  undoUntil: number;
}

export function CreatorSection() {
  const router = useRouter();
  
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
    if (!confirm('Удалить канал из списка?')) return;
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

  return (
    <div>
      {/* Заголовок */}
      <div className="mb-4">
        <h2 className="text-xl font-bold">🎁 Мои розыгрыши</h2>
        <p className="text-tg-hint text-sm">Создавайте и управляйте розыгрышами</p>
      </div>

      {/* Кнопка создания */}
      <button
        onClick={() => router.push('/creator/giveaway/new')}
        className="w-full bg-tg-button text-tg-button-text rounded-xl py-3 px-4 font-medium mb-6 hover:opacity-90 transition-opacity"
      >
        ➕ Создать розыгрыш
      </button>

      {/* Блок "Мои каналы" */}
      <div className="bg-tg-secondary rounded-xl p-4 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">📣 Мои каналы</h3>
          <button 
            onClick={loadChannels} 
            className="text-tg-button text-sm" 
            disabled={channelsLoading}
          >
            {channelsLoading ? '...' : '🔄'}
          </button>
        </div>

        {channelsLoading ? (
          <div className="flex items-center justify-center py-4">
            <div className="animate-spin w-5 h-5 border-2 border-tg-button border-t-transparent rounded-full mr-2" />
            <span className="text-tg-hint text-sm">Загрузка...</span>
          </div>
        ) : channels.length === 0 ? (
          <div className="text-center py-4">
            <p className="text-tg-hint text-sm mb-3">У вас пока нет добавленных каналов</p>
            <p className="text-tg-hint text-xs">Добавьте каналы через бота: @BeastRandomBot</p>
          </div>
        ) : (
          <div className="space-y-3">
            {channels.map((channel) => (
              <div key={channel.id} className="bg-tg-bg rounded-lg p-3 flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{channel.type === 'CHANNEL' ? '📢' : '👥'}</span>
                    <span className="font-medium truncate">{channel.title}</span>
                  </div>
                  {channel.username && <p className="text-sm text-tg-hint mt-0.5">@{channel.username}</p>}
                  <div className="flex flex-wrap gap-2 mt-2">
                    <span className={`text-xs px-2 py-0.5 rounded ${channel.botIsAdmin ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
                      {channel.botIsAdmin ? '✓ Бот админ' : '✗ Бот не админ'}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded ${channel.creatorIsAdmin ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
                      {channel.creatorIsAdmin ? '✓ Вы админ' : '✗ Вы не админ'}
                    </span>
                  </div>
                </div>
                <button 
                  onClick={() => handleDeleteChannel(channel.id)} 
                  className="text-red-500 text-sm ml-2 p-1" 
                  title="Удалить канал"
                >
                  🗑️
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Блок "Посты" */}
      <div className="bg-tg-secondary rounded-xl p-4 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">📝 Посты</h3>
          <button 
            onClick={loadPostTemplates} 
            className="text-tg-button text-sm" 
            disabled={postsLoading}
          >
            {postsLoading ? '...' : '🔄'}
          </button>
        </div>

        {/* Undo Banner */}
        {undoState && Date.now() < undoState.undoUntil && (
          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 mb-4 flex items-center justify-between">
            <span className="text-sm text-yellow-600">Пост удалён</span>
            <button onClick={handleUndoDelete} className="text-sm text-tg-button font-medium">
              ↩️ Вернуть
            </button>
          </div>
        )}

        {postsLoading ? (
          <div className="flex items-center justify-center py-4">
            <div className="animate-spin w-5 h-5 border-2 border-tg-button border-t-transparent rounded-full mr-2" />
            <span className="text-tg-hint text-sm">Загрузка...</span>
          </div>
        ) : postTemplates.length === 0 ? (
          <div className="text-center py-4">
            <p className="text-tg-hint text-sm mb-3">Постов нет</p>
            <p className="text-tg-hint text-xs">Создайте пост в боте: @BeastRandomBot → 📝 Посты</p>
          </div>
        ) : (
          <div className="space-y-3">
            {postTemplates.map((post) => (
              <div key={post.id} className="bg-tg-bg rounded-lg p-3 flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-lg">
                      {post.mediaType === 'NONE' ? '📄' : post.mediaType === 'PHOTO' ? '🖼️' : '🎬'}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded ${
                      post.mediaType === 'NONE' 
                        ? 'bg-gray-500/10 text-gray-500' 
                        : post.mediaType === 'PHOTO' 
                          ? 'bg-blue-500/10 text-blue-500' 
                          : 'bg-purple-500/10 text-purple-500'
                    }`}>
                      {post.mediaType === 'NONE' ? 'Текст' : post.mediaType === 'PHOTO' ? 'Фото' : 'Видео'}
                    </span>
                  </div>
                  <p className="text-sm text-tg-text line-clamp-2">{post.text}</p>
                  <p className="text-xs text-tg-hint mt-1">
                    {new Date(post.createdAt).toLocaleString('ru-RU')}
                  </p>
                </div>
                <button
                  onClick={() => handleDeletePost(post.id)}
                  className="text-red-500 text-sm ml-2 p-1"
                  title="Удалить пост"
                >
                  🗑️
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Статистика */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="bg-tg-secondary rounded-xl p-4 text-center">
          {countsLoading ? (
            <div className="animate-spin w-5 h-5 border-2 border-tg-button border-t-transparent rounded-full mx-auto" />
          ) : (
            <>
              <div className="text-2xl font-bold text-tg-text">{counts.all}</div>
              <div className="text-sm text-tg-hint">Всего розыгрышей</div>
            </>
          )}
        </div>
        <div className="bg-tg-secondary rounded-xl p-4 text-center">
          {countsLoading ? (
            <div className="animate-spin w-5 h-5 border-2 border-tg-button border-t-transparent rounded-full mx-auto" />
          ) : (
            <>
              <div className="text-2xl font-bold text-green-500">{counts.active}</div>
              <div className="text-sm text-tg-hint">Активных</div>
            </>
          )}
        </div>
      </div>

      {/* Ссылка на Dashboard */}
      <button
        onClick={() => router.push('/creator')}
        className="w-full bg-tg-secondary text-tg-text rounded-xl py-3 px-4 font-medium hover:bg-tg-secondary/80 transition-colors flex items-center justify-center gap-2"
      >
        <span>📊</span>
        <span>Открыть Dashboard</span>
        <span className="text-tg-hint">→</span>
      </button>
    </div>
  );
}

export default CreatorSection;
