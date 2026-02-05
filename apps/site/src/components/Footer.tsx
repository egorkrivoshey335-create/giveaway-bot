import Link from 'next/link';
import { config } from '@/lib/config';

export function Footer() {
  return (
    <footer className="bg-gray-900 text-gray-400 py-12">
      <div className="container mx-auto px-4">
        <div className="grid md:grid-cols-4 gap-8">
          {/* Логотип и описание */}
          <div className="md:col-span-2">
            <Link href="/" className="flex items-center gap-2 mb-4">
              <span className="text-2xl">🎁</span>
              <span className="text-xl font-bold text-white">
                Random<span className="text-brand-400">Beast</span>
              </span>
            </Link>
            <p className="text-sm">
              Платформа для проведения честных розыгрышей в Telegram
              с проверкой подписок, защитой от ботов и красивым
              объявлением победителей.
            </p>
          </div>

          {/* Ссылки */}
          <div>
            <h3 className="text-white font-semibold mb-4">Ссылки</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <a
                  href={`https://t.me/${config.botUsername}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-white transition-colors"
                >
                  Telegram бот
                </a>
              </li>
              <li>
                <Link href="/dashboard" className="hover:text-white transition-colors">
                  Рандомайзер
                </Link>
              </li>
              <li>
                <Link href="/login" className="hover:text-white transition-colors">
                  Войти
                </Link>
              </li>
            </ul>
          </div>

          {/* Контакты */}
          <div>
            <h3 className="text-white font-semibold mb-4">Контакты</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <a
                  href={`https://t.me/${config.botUsername}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-white transition-colors"
                >
                  Поддержка
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Copyright */}
        <div className="border-t border-gray-800 mt-8 pt-8 text-center text-sm">
          <p>© {new Date().getFullYear()} RandomBeast. Все права защищены.</p>
        </div>
      </div>
    </footer>
  );
}
