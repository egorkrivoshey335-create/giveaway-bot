/**
 * Клиент для работы с ЮKassa API
 * Документация: https://yookassa.ru/developers/api
 */

import { randomUUID } from 'crypto';
import { config } from '../config.js';

const YOOKASSA_API_URL = 'https://api.yookassa.ru/v3';

// Типы для запросов и ответов ЮKassa

export interface CreatePaymentParams {
  /** Сумма в рублях */
  amount: number;
  /** Валюта (по умолчанию RUB) */
  currency?: string;
  /** Описание платежа */
  description: string;
  /** URL возврата после оплаты */
  returnUrl: string;
  /** Метаданные для идентификации платежа */
  metadata?: Record<string, string>;
}

export interface YooKassaAmount {
  value: string;
  currency: string;
}

export interface YooKassaConfirmation {
  type: string;
  confirmation_url?: string;
  return_url?: string;
}

export interface YooKassaPayment {
  id: string;
  status: 'pending' | 'waiting_for_capture' | 'succeeded' | 'canceled';
  amount: YooKassaAmount;
  confirmation?: YooKassaConfirmation;
  created_at: string;
  description?: string;
  metadata?: Record<string, string>;
  paid: boolean;
  refundable: boolean;
  test: boolean;
}

export interface YooKassaWebhookPayload {
  type: 'notification';
  event: 'payment.succeeded' | 'payment.canceled' | 'payment.waiting_for_capture' | 'refund.succeeded';
  object: YooKassaPayment;
}

/**
 * Получить заголовок авторизации для ЮKassa API
 */
function getAuthHeader(): string {
  const { shopId, secretKey } = config.yookassa;
  
  if (!shopId || !secretKey) {
    throw new Error('YooKassa credentials not configured (YOOKASSA_SHOP_ID, YOOKASSA_SECRET_KEY)');
  }

  return 'Basic ' + Buffer.from(`${shopId}:${secretKey}`).toString('base64');
}

/**
 * Создать платёж в ЮKassa
 * Возвращает объект платежа с confirmation_url для редиректа пользователя
 */
export async function createPayment(params: CreatePaymentParams): Promise<YooKassaPayment> {
  const idempotenceKey = randomUUID();
  
  const body = {
    amount: {
      value: params.amount.toFixed(2),
      currency: params.currency || 'RUB',
    },
    confirmation: {
      type: 'redirect',
      return_url: params.returnUrl,
    },
    capture: true, // Автоматическое подтверждение платежа
    description: params.description,
    metadata: params.metadata,
  };

  const response = await fetch(`${YOOKASSA_API_URL}/payments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotence-Key': idempotenceKey,
      'Authorization': getAuthHeader(),
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({})) as { description?: string };
    console.error('YooKassa create payment error:', errorData);
    throw new Error(`YooKassa API error: ${errorData.description || response.statusText}`);
  }

  return response.json() as Promise<YooKassaPayment>;
}

/**
 * Получить информацию о платеже по ID
 */
export async function getPayment(paymentId: string): Promise<YooKassaPayment> {
  const response = await fetch(`${YOOKASSA_API_URL}/payments/${paymentId}`, {
    headers: {
      'Authorization': getAuthHeader(),
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({})) as { description?: string };
    console.error('YooKassa get payment error:', errorData);
    throw new Error(`YooKassa API error: ${errorData.description || response.statusText}`);
  }

  return response.json() as Promise<YooKassaPayment>;
}

/**
 * Проверить, настроена ли ЮKassa
 */
export function isYooKassaConfigured(): boolean {
  return !!(config.yookassa.shopId && config.yookassa.secretKey);
}
