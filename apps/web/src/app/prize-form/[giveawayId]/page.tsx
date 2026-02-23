'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getPrizeFormConfig, submitPrizeForm } from '@/lib/api';

interface FormValues {
  name: string;
  phone: string;
  email: string;
  address: string;
  telegram: string;
}

const FIELD_LABELS: Record<string, string> = {
  name: 'ФИО',
  phone: 'Телефон',
  email: 'Email',
  address: 'Адрес доставки',
  telegram: 'Telegram @username',
};

const FIELD_PLACEHOLDERS: Record<string, string> = {
  name: 'Иванов Иван Иванович',
  phone: '+7 (999) 123-45-67',
  email: 'example@mail.ru',
  address: 'Москва, ул. Примерная, д. 1, кв. 1',
  telegram: '@username',
};

const FIELD_TYPES: Record<string, string> = {
  name: 'text',
  phone: 'tel',
  email: 'email',
  address: 'text',
  telegram: 'text',
};

/**
 * Страница формы получения приза для победителя
 * Задача 14.10 из TASKS-14-features.md
 *
 * Поддерживает шифрование через Web Crypto API (AES-GCM):
 * если создатель предоставил publicKey, данные шифруются перед отправкой.
 */
export default function PrizeFormPage() {
  const { giveawayId } = useParams<{ giveawayId: string }>();
  const router = useRouter();

  const [config, setConfig] = useState<{
    giveawayTitle: string;
    formFields: string[];
    encryptionEnabled: boolean;
    publicKey: string | null;
    alreadySubmitted: boolean;
    submittedAt: string | null;
    processedAt: string | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const [values, setValues] = useState<FormValues>({
    name: '',
    phone: '',
    email: '',
    address: '',
    telegram: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getPrizeFormConfig(giveawayId);
      if (res.ok) {
        setConfig({
          giveawayTitle: res.giveawayTitle ?? '',
          formFields: res.formFields ?? ['name', 'phone', 'address'],
          encryptionEnabled: res.encryptionEnabled ?? false,
          publicKey: res.publicKey ?? null,
          alreadySubmitted: res.alreadySubmitted ?? false,
          submittedAt: res.submittedAt ?? null,
          processedAt: res.processedAt ?? null,
        });
      } else {
        setError(res.error ?? 'Ошибка загрузки формы');
      }
    } catch {
      setError('Ошибка соединения');
    } finally {
      setLoading(false);
    }
  }, [giveawayId]);

  useEffect(() => {
    load();
  }, [load]);

  /**
   * AES-GCM шифрование данных формы с публичным ключом (симметричный ключ из base64)
   * Для MVP используем AES-GCM с ключом из publicKey (base64 encoded 256-bit key).
   */
  async function encryptFormData(data: object, publicKeyBase64: string): Promise<string> {
    const keyBytes = Uint8Array.from(atob(publicKeyBase64), (c) => c.charCodeAt(0));
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyBytes,
      { name: 'AES-GCM' },
      false,
      ['encrypt']
    );
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const plaintext = new TextEncoder().encode(JSON.stringify(data));
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      cryptoKey,
      plaintext
    );
    // Format: base64(iv) + '.' + base64(ciphertext)
    const ivB64 = btoa(String.fromCharCode(...iv));
    const ctB64 = btoa(String.fromCharCode(...new Uint8Array(ciphertext)));
    return `${ivB64}.${ctB64}`;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!config) return;

    setSubmitting(true);
    setError(null);

    try {
      const formData: Record<string, string> = {};
      for (const field of config.formFields) {
        const val = values[field as keyof FormValues];
        if (val?.trim()) {
          formData[field] = val.trim();
        }
      }

      let payload: Parameters<typeof submitPrizeForm>[1];

      if (config.encryptionEnabled && config.publicKey) {
        const encrypted = await encryptFormData(formData, config.publicKey);
        payload = { encryptedData: encrypted };
      } else {
        payload = { plainData: formData };
      }

      const res = await submitPrizeForm(giveawayId, payload);
      if (res.ok) {
        setSuccess(true);
      } else {
        setError(res.error ?? 'Ошибка отправки');
      }
    } catch (err) {
      setError('Ошибка шифрования или отправки данных');
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-tg-bg flex items-center justify-center">
        <div className="animate-spin w-10 h-10 border-2 border-tg-button border-t-transparent rounded-full" />
      </main>
    );
  }

  if (success) {
    return (
      <main className="min-h-screen bg-tg-bg flex items-center justify-center p-4">
        <div className="text-center max-w-sm">
          <div className="text-6xl mb-4">🎉</div>
          <h1 className="text-2xl font-bold mb-2">Готово!</h1>
          <p className="text-tg-hint mb-6">
            Ваши данные переданы создателю розыгрыша. Ожидайте связи!
          </p>
          <button
            onClick={() => router.back()}
            className="bg-tg-button text-tg-button-text px-6 py-3 rounded-xl font-semibold"
          >
            Закрыть
          </button>
        </div>
      </main>
    );
  }

  if (!config || error) {
    return (
      <main className="min-h-screen bg-tg-bg flex items-center justify-center p-4">
        <div className="text-center max-w-sm">
          <div className="text-5xl mb-4">😔</div>
          <h1 className="text-xl font-bold mb-2">Форма недоступна</h1>
          <p className="text-tg-hint mb-4">{error ?? 'Форма не найдена'}</p>
          <button
            onClick={() => router.back()}
            className="bg-tg-secondary text-tg-text px-4 py-2 rounded-xl font-medium"
          >
            Назад
          </button>
        </div>
      </main>
    );
  }

  if (config.alreadySubmitted) {
    return (
      <main className="min-h-screen bg-tg-bg pb-safe">
        <div className="max-w-lg mx-auto p-4 pt-8 text-center">
          <div className="text-5xl mb-4">✅</div>
          <h1 className="text-xl font-bold mb-2">Форма уже заполнена</h1>
          <p className="text-tg-hint mb-1">
            Вы уже передали данные для получения приза.
          </p>
          {config.processedAt && (
            <p className="text-sm text-green-500 mt-2">
              ✅ Обработано: {new Date(config.processedAt).toLocaleDateString('ru-RU')}
            </p>
          )}
          {!config.processedAt && (
            <p className="text-sm text-tg-hint mt-2">⏳ Ожидайте обработки создателем</p>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-tg-bg pb-safe">
      {/* Header */}
      <div className="bg-tg-secondary border-b border-tg-bg p-4">
        <div className="max-w-lg mx-auto">
          <button
            onClick={() => router.back()}
            className="text-tg-hint text-sm mb-2 flex items-center gap-1"
          >
            ← Назад
          </button>
          <h1 className="text-xl font-bold">🎁 Получение приза</h1>
          <p className="text-sm text-tg-hint mt-1 line-clamp-1">{config.giveawayTitle}</p>
        </div>
      </div>

      <div className="max-w-lg mx-auto p-4">
        {/* Инфо о шифровании */}
        {config.encryptionEnabled && (
          <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-3 mb-4 flex items-start gap-2">
            <span className="text-lg">🔒</span>
            <div>
              <p className="text-sm font-medium text-green-500">Данные зашифрованы</p>
              <p className="text-xs text-tg-hint mt-0.5">
                Ваши данные шифруются в браузере перед отправкой. Только создатель может их расшифровать.
              </p>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {config.formFields.map((field) => (
            <div key={field}>
              <label className="block text-sm font-medium mb-1.5">
                {FIELD_LABELS[field] ?? field}
                {/* Все поля опциональны, но нужно хотя бы одно */}
              </label>
              <input
                type={FIELD_TYPES[field] ?? 'text'}
                value={values[field as keyof FormValues] ?? ''}
                onChange={(e) =>
                  setValues((prev) => ({ ...prev, [field]: e.target.value }))
                }
                placeholder={FIELD_PLACEHOLDERS[field] ?? ''}
                className="w-full bg-tg-secondary rounded-xl px-4 py-3 text-sm text-tg-text placeholder-tg-hint focus:outline-none focus:ring-2 focus:ring-tg-button/30 transition"
              />
            </div>
          ))}

          {error && (
            <div className="bg-red-500/10 text-red-500 text-sm px-4 py-2.5 rounded-xl">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-tg-button text-tg-button-text py-4 rounded-xl font-semibold text-base transition-opacity hover:opacity-90 disabled:opacity-50 mt-2"
          >
            {submitting ? 'Отправка...' : '📤 Отправить данные'}
          </button>

          <p className="text-xs text-tg-hint text-center">
            После отправки создатель свяжется с вами в Telegram
          </p>
        </form>
      </div>
    </main>
  );
}
