import { config } from './config';

// Типы для API ответов
export interface ApiResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}

export interface User {
  id: string;
  telegramUserId: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  language: string;
  isPremium: boolean;
  createdAt: string;
}

export interface MeResponse {
  ok: boolean;
  user?: User;
  hasRandomizerAccess?: boolean;
  error?: string;
}

export interface GiveawayListItem {
  id: string;
  title: string;
  winnersCount: number;
  participantsCount: number;
  finishedAt: string;
  publishResultsMode?: string;
  winnersPublished?: boolean;
}

export interface GiveawaysResponse {
  ok: boolean;
  giveaways?: GiveawayListItem[];
  error?: string;
}

export interface Participant {
  id: string;
  telegramUserId: string;
  firstName?: string | null;
  lastName?: string | null;
  username?: string | null;
  ticketsTotal: number;
}

export interface Winner {
  place: number;
  odataUserId: string;
  telegramUserId: string;
  firstName?: string | null;
  lastName?: string | null;
  username?: string | null;
  ticketsUsed: number;
}

export interface Prize {
  place: number;
  title: string;
  description?: string;
}

export interface Customization {
  backgroundColor: string;
  accentColor: string;
  logoUrl?: string | null;
}

export interface RandomizerData {
  giveaway: {
    id: string;
    title: string;
    winnersCount: number;
    participantsCount: number;
    finishedAt: string;
  };
  participants: Participant[];
  winners: Winner[];
  prizes: Prize[];
  customization: Customization;
}

export interface RandomizerResponse {
  ok: boolean;
  giveaway?: RandomizerData['giveaway'];
  participants?: Participant[];
  winners?: Winner[];
  prizes?: Prize[];
  customization?: Customization;
  error?: string;
}

// Базовый fetch с credentials
async function fetchApi<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await fetch(`${config.apiUrl}${endpoint}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

// API функции для Site

/**
 * Получить данные текущего пользователя
 */
export async function getMe(): Promise<MeResponse> {
  return fetchApi<MeResponse>('/site/me');
}

/**
 * Получить список завершённых розыгрышей
 */
export async function getGiveaways(): Promise<GiveawaysResponse> {
  return fetchApi<GiveawaysResponse>('/site/giveaways');
}

/**
 * Получить данные для рандомайзера
 */
export async function getRandomizerData(giveawayId: string): Promise<RandomizerResponse> {
  return fetchApi<RandomizerResponse>(`/site/giveaways/${giveawayId}/randomizer`);
}

/**
 * Сохранить призы для рандомайзера
 */
export async function savePrizes(giveawayId: string, prizes: Prize[]): Promise<ApiResponse> {
  return fetchApi<ApiResponse>(`/site/giveaways/${giveawayId}/save-prizes`, {
    method: 'POST',
    body: JSON.stringify({ prizes }),
  });
}

/**
 * Сохранить кастомизацию рандомайзера
 */
export async function saveCustomization(
  giveawayId: string,
  customization: Partial<Customization>
): Promise<ApiResponse> {
  return fetchApi<ApiResponse>(`/site/giveaways/${giveawayId}/save-customization`, {
    method: 'POST',
    body: JSON.stringify(customization),
  });
}

/**
 * Опубликовать победителей в каналы (для RANDOMIZER режима)
 */
export async function publishWinners(giveawayId: string): Promise<ApiResponse> {
  return fetchApi<ApiResponse>(`/site/giveaways/${giveawayId}/publish-winners`, {
    method: 'POST',
  });
}

/**
 * Выйти из аккаунта
 */
export async function logout(): Promise<ApiResponse> {
  return fetchApi<ApiResponse>('/site/logout', { method: 'POST' });
}
