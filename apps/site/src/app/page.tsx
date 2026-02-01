import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 text-white">
      {/* Hero Section */}
      <div className="container mx-auto px-4 py-20">
        <div className="text-center max-w-3xl mx-auto">
          {/* Logo */}
          <div className="mb-8">
            <span className="text-6xl">🎁</span>
          </div>

          {/* Title */}
          <h1 className="text-5xl font-bold mb-6">
            Random<span className="text-brand-400">Beast</span>
          </h1>

          {/* Subtitle */}
          <p className="text-xl text-gray-300 mb-8">
            Платформа для честных розыгрышей в Telegram с прозрачной
            верификацией и защитой от накруток.
          </p>

          {/* CTA Button */}
          <a
            href="https://t.me/BeastRandomBot"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white font-semibold py-4 px-8 rounded-xl transition-colors text-lg"
          >
            🤖 Открыть бота
          </a>
        </div>
      </div>

      {/* Features Section */}
      <div className="container mx-auto px-4 py-16">
        <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
          <FeatureCard
            emoji="✅"
            title="Честный рандом"
            description="Криптографически безопасный выбор победителей"
          />
          <FeatureCard
            emoji="🔒"
            title="Верификация"
            description="Автоматическая проверка подписок и бустов"
          />
          <FeatureCard
            emoji="🛡️"
            title="Анти-фрод"
            description="Защита от накруток и ботов"
          />
        </div>
      </div>

      {/* Footer */}
      <footer className="container mx-auto px-4 py-8 text-center text-gray-500 text-sm">
        <p>© 2026 RandomBeast. Все права защищены.</p>
        <p className="mt-2">
          <Link href="/health" className="hover:text-gray-300">
            Status
          </Link>
        </p>
      </footer>
    </main>
  );
}

function FeatureCard({
  emoji,
  title,
  description,
}: {
  emoji: string;
  title: string;
  description: string;
}) {
  return (
    <div className="bg-gray-800/50 rounded-xl p-6 text-center">
      <div className="text-4xl mb-4">{emoji}</div>
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      <p className="text-gray-400 text-sm">{description}</p>
    </div>
  );
}
