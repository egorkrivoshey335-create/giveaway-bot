import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { config } from '@/lib/config';

// Публичная страница результатов розыгрыша
// Данные загружаются с API без авторизации

interface ResultsPageProps {
  params: Promise<{ id: string }>;
}

interface GiveawayResult {
  id: string;
  title: string;
  winnersCount: number;
  participantsCount: number;
  finishedAt: string;
  winners: Array<{
    place: number;
    user: {
      username?: string;
      firstName?: string;
      lastName?: string;
    };
  }>;
}

async function getResults(id: string): Promise<GiveawayResult | null> {
  try {
    const response = await fetch(`${config.apiUrl}/site/giveaways/${id}/results`, {
      cache: 'no-store',
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return data.ok ? data.data : null;
  } catch {
    return null;
  }
}

export default async function ResultsPage({ params }: ResultsPageProps) {
  const { id } = await params;
  const results = await getResults(id);

  if (!results) {
    notFound();
  }

  const formattedDate = new Date(results.finishedAt).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="min-h-screen bg-gradient-to-b from-brand-50 to-white flex flex-col">
      <Header />

      <main className="flex-1 pt-24 pb-12 px-4">
        <div className="container mx-auto max-w-2xl">
          {/* Карточка результатов */}
          <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
            {/* Шапка */}
            <div className="bg-gradient-to-r from-brand-500 to-brand-600 text-white p-6 text-center">
              <div className="text-4xl mb-2">🏆</div>
              <h1 className="text-2xl font-bold">Результаты розыгрыша</h1>
            </div>

            {/* Информация о розыгрыше */}
            <div className="p-6 border-b border-gray-100">
              <h2 className="text-xl font-semibold mb-2">{results.title}</h2>
              <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600">
                <span className="flex items-center gap-1">
                  <span>👥</span>
                  {results.participantsCount} участников
                </span>
                <span className="flex items-center gap-1">
                  <span>🏆</span>
                  {results.winnersCount} победителей
                </span>
                <span className="flex items-center gap-1">
                  <span>📅</span>
                  {formattedDate}
                </span>
              </div>
            </div>

            {/* Список победителей */}
            <div className="p-6">
              <h3 className="font-semibold mb-4">Победители</h3>
              <div className="space-y-3">
                {results.winners.map((winner) => (
                  <div
                    key={winner.place}
                    className="flex items-center gap-4 p-3 bg-gray-50 rounded-xl"
                  >
                    <div className="w-10 h-10 bg-brand-100 text-brand-600 rounded-full flex items-center justify-center font-bold">
                      {winner.place}
                    </div>
                    <div>
                      <p className="font-medium">
                        {winner.user.firstName || 'Аноним'}
                        {winner.user.lastName ? ` ${winner.user.lastName}` : ''}
                      </p>
                      {winner.user.username && (
                        <p className="text-gray-500 text-sm">@{winner.user.username}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Ссылка на бота */}
            <div className="p-6 bg-gray-50 text-center">
              <p className="text-gray-600 text-sm mb-3">
                Хотите провести свой розыгрыш?
              </p>
              <a
                href={`https://t.me/${config.botUsername}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary text-sm"
              >
                🤖 Открыть бота
              </a>
            </div>
          </div>

          {/* Кнопка назад */}
          <div className="text-center mt-6">
            <Link
              href="/"
              className="text-gray-600 hover:text-gray-900 text-sm"
            >
              ← На главную
            </Link>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
