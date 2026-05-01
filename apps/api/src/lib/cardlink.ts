/**
 * Клиент для работы с Cardlink API
 * Документация: https://cardlink.link/ (Bearer token, /api/v1/bill/create)
 *
 * Cardlink принимает данные как `application/x-www-form-urlencoded` или multipart/form-data.
 * Postback от Cardlink приходит на Result URL так же в формате `application/x-www-form-urlencoded`.
 *
 * Подпись postback: strtoupper(md5(OutSum + ":" + InvId + ":" + apiToken))
 */

import crypto from 'crypto';
import { config } from '../config.js';

const CARDLINK_API_URL = 'https://cardlink.link/api/v1';

// ─── Типы запросов ────────────────────────────────────────────────────────

export interface CreateBillParams {
  /** Сумма в рублях (или другой валюте) */
  amount: number;
  /** Валюта (по умолчанию RUB) */
  currency?: 'RUB' | 'USD' | 'EUR';
  /** Описание платежа (отображается в форме оплаты) */
  description: string;
  /** Уникальный идентификатор заказа на нашей стороне (вернётся в postback как InvId) */
  orderId: string;
  /** Произвольное поле, вернётся в postback */
  custom?: string;
  /** URL возврата на наш сайт после оплаты (Cardlink делает POST) */
  successUrl?: string;
  /** URL возврата при неуспехе */
  failUrl?: string;
  /** URL для кнопки "Назад в магазин" */
  returnUrl?: string;
  /** Кто платит комиссию: 1 — плательщик, 0 — продавец. По умолчанию 1 */
  payerPaysCommission?: 0 | 1;
  /** Email плательщика (если запрашиваем) */
  payerEmail?: string;
  /** Название ссылки в платёжной форме */
  name?: string;
  /** Локаль формы оплаты */
  locale?: 'ru' | 'en';
  /** Тип счета: normal (одноразовый) или multi. По умолчанию normal */
  type?: 'normal' | 'multi';
  /** Время жизни счёта в секундах */
  ttl?: number;
}

// ─── Типы ответов ────────────────────────────────────────────────────────

export interface CreateBillResponse {
  success: boolean | string;
  link_url: string;
  link_page_url: string;
  bill_id: string;
}

export interface BillStatusResponse {
  id: string;
  order_id?: string;
  active: boolean;
  status: 'NEW' | 'PROCESS' | 'UNDERPAID' | 'SUCCESS' | 'OVERPAID' | 'FAIL';
  amount: string;
  type: 'MULTI' | 'NORMAL';
  created_at: string;
  currency_in: 'RUB' | 'USD' | 'EUR';
  ttl?: number;
}

// ─── Postback ────────────────────────────────────────────────────────────

export type CardlinkPaymentStatus = 'SUCCESS' | 'UNDERPAID' | 'OVERPAID' | 'FAIL';

export interface CardlinkPaymentPostback {
  /** = orderId, который мы передали при создании счёта (наш purchaseId) */
  InvId: string;
  /** Сумма платежа */
  OutSum: string;
  /** Комиссия */
  Commission: string;
  /** ID счёта в Cardlink (= bill_id) */
  TrsId: string;
  /** Статус платежа */
  Status: CardlinkPaymentStatus;
  /** Валюта */
  CurrencyIn: 'RUB' | 'USD' | 'EUR';
  /** Произвольное поле, переданное при создании */
  custom?: string;
  AccountType?: 'BANK_CARD' | 'SBP';
  AccountNumber?: string;
  BalanceAmount?: string;
  BalanceCurrency?: 'RUB' | 'USD' | 'EUR';
  PayerPhone?: string;
  PayerEmail?: string;
  PayerName?: string;
  PayerComment?: string;
  ErrorCode?: string;
  ErrorMessage?: string;
  /** Подпись: strtoupper(md5(OutSum + ":" + InvId + ":" + apiToken)) */
  SignatureValue: string;
}

// ─── Вспомогательные функции ──────────────────────────────────────────────

function getApiToken(): string {
  const token = config.cardlink.apiToken;
  if (!token) {
    throw new Error('Cardlink API token not configured (CARDLINK_API_TOKEN)');
  }
  return token;
}

function getShopId(): string {
  const shopId = config.cardlink.shopId;
  if (!shopId) {
    throw new Error('Cardlink shop_id not configured (CARDLINK_SHOP_ID)');
  }
  return shopId;
}

/**
 * Сериализация в `application/x-www-form-urlencoded`
 * (fetch + URLSearchParams корректно кодирует значения)
 */
function toFormUrlEncoded(params: Record<string, string | number | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    sp.append(k, String(v));
  }
  return sp.toString();
}

// ─── API methods ─────────────────────────────────────────────────────────

/**
 * Создать счёт на оплату в Cardlink.
 * Возвращает URL платёжной страницы (`link_page_url`) для редиректа пользователя.
 */
export async function createBill(params: CreateBillParams): Promise<CreateBillResponse> {
  const apiToken = getApiToken();
  const shopId = getShopId();

  const body = toFormUrlEncoded({
    amount: params.amount.toFixed(2),
    shop_id: shopId,
    order_id: params.orderId,
    description: params.description,
    type: params.type ?? 'normal',
    locale: params.locale ?? 'ru',
    currency_in: params.currency ?? 'RUB',
    custom: params.custom,
    payer_pays_commission: params.payerPaysCommission ?? 1,
    payer_email: params.payerEmail,
    name: params.name,
    ttl: params.ttl,
    return_url: params.returnUrl,
    success_url: params.successUrl,
    fail_url: params.failUrl,
  });

  const response = await fetch(`${CARDLINK_API_URL}/bill/create`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Bearer ${apiToken}`,
      'Accept': 'application/json',
    },
    body,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    console.error('Cardlink create bill error:', response.status, errorText);
    throw new Error(`Cardlink API error ${response.status}: ${errorText.slice(0, 300)}`);
  }

  const data = (await response.json()) as CreateBillResponse;

  // Cardlink возвращает success: "true" (строкой), приведём к boolean
  const isSuccess = data.success === true || data.success === 'true';
  if (!isSuccess || !data.link_page_url) {
    throw new Error(`Cardlink: bill not created (response: ${JSON.stringify(data).slice(0, 200)})`);
  }

  return data;
}

/**
 * Получить статус счёта (для polling)
 * GET /api/v1/bill/status?id=...
 */
export async function getBillStatus(billId: string): Promise<BillStatusResponse> {
  const apiToken = getApiToken();

  const url = `${CARDLINK_API_URL}/bill/status?id=${encodeURIComponent(billId)}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${apiToken}`,
      'Accept': 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    console.error('Cardlink get bill status error:', response.status, errorText);
    throw new Error(`Cardlink API error ${response.status}: ${errorText.slice(0, 300)}`);
  }

  return (await response.json()) as BillStatusResponse;
}

/**
 * Проверка подписи postback от Cardlink.
 * Формула: strtoupper(md5(OutSum + ":" + InvId + ":" + apiToken))
 */
export function verifyCardlinkSignature(
  outSum: string,
  invId: string,
  signature: string
): boolean {
  const apiToken = config.cardlink.apiToken;
  if (!apiToken) return false;

  const expected = crypto
    .createHash('md5')
    .update(`${outSum}:${invId}:${apiToken}`)
    .digest('hex')
    .toUpperCase();

  if (expected.length !== signature.length) return false;

  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected, 'utf8'),
      Buffer.from(signature.toUpperCase(), 'utf8')
    );
  } catch {
    return false;
  }
}

/**
 * Проверить, настроен ли Cardlink (есть API token и shop_id)
 */
export function isCardlinkConfigured(): boolean {
  return !!(config.cardlink.apiToken && config.cardlink.shopId);
}
