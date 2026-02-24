import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { config } from '@/lib/config';

export function Footer() {
  const t = useTranslations('footer');
  const tLanding = useTranslations('landing');
  const tHeader = useTranslations('header');

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
            <p className="text-sm leading-relaxed max-w-xs">
              {tLanding('hero.subtitle')}
            </p>
          </div>

          {/* Ссылки */}
          <div>
            <h3 className="text-white font-semibold mb-4">{tHeader('home')}</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <a
                  href={`https://t.me/${config.botUsername}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-white transition-colors"
                >
                  {t('bot')}
                </a>
              </li>
              <li>
                <Link href="/dashboard" className="hover:text-white transition-colors">
                  {t('randomizer')}
                </Link>
              </li>
            </ul>
          </div>

          {/* Поддержка и правовое */}
          <div>
            <h3 className="text-white font-semibold mb-4">{t('support')}</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <a
                  href="https://t.me/Cosmolex_bot"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-white transition-colors"
                >
                  {t('channel')}
                </a>
              </li>
              <li>
                <Link href="/privacy" className="hover:text-white transition-colors">
                  {t('privacy')}
                </Link>
              </li>
              <li>
                <Link href="/terms" className="hover:text-white transition-colors">
                  {t('terms')}
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Copyright */}
        <div className="border-t border-gray-800 mt-8 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm">
          <p>© {new Date().getFullYear()} RandomBeast. {t('rights')}.</p>
          <div className="flex gap-4">
            <Link href="/privacy" className="hover:text-white transition-colors">
              {t('privacy')}
            </Link>
            <Link href="/terms" className="hover:text-white transition-colors">
              {t('terms')}
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
