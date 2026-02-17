const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

interface AuthMeResponse {
  ok: boolean;
  user?: {
    id: string;
    telegramUserId: string;
    language: string;
    isPremium: boolean;
    createdAt: string;
  };
  error?: string;
}

interface AuthResponse {
  ok: boolean;
  error?: string;
}

// Данные черновика розыгрыша (используется в wizard)
export interface GiveawayDraftPayload {
  type?: 'STANDARD' | 'BOOST_REQUIRED' | 'INVITE_REQUIRED' | 'CUSTOM';
  title?: string;
  language?: 'ru' | 'en' | 'kk';
  postTemplateId?: string | null;
  buttonText?: string;
  winnersCount?: number;
  /** Дата и время начала (ISO string или null = сразу) */
  startAt?: string | null;
  /** Дата и время окончания (ISO string или null = не указано) */
  endAt?: string | null;
  requiredSubscriptionChannelIds?: string[];
  publishChannelIds?: string[];
  resultsChannelIds?: string[];
  publishResultsMode?: 'SEPARATE_POSTS' | 'EDIT_START_POST' | 'RANDOMIZER';
  /** Режим капчи: OFF, SUSPICIOUS_ONLY, ALL */
  captchaMode?: 'OFF' | 'SUSPICIOUS_ONLY' | 'ALL';
  /** Включена ли проверка Liveness (камера) — платная фича */
  livenessEnabled?: boolean;
  
  // === Дополнительные билеты ===
  
  /** Включены ли приглашения друзей */
  inviteEnabled?: boolean;
  /** Максимальное количество приглашений на участника */
  inviteMax?: number;
  
  /** Включены ли бусты каналов для доп. билетов */
  boostEnabled?: boolean;
  /** ID каналов для бустов */
  boostChannelIds?: string[];
  
  /** Включен ли постинг в сторис */
  storiesEnabled?: boolean;
  
  /** Показывать ли в каталоге */
  catalogEnabled?: boolean;
}

/**
 * Authenticate with Telegram initData
 */
export async function authenticateWithTelegram(initData: string): Promise<AuthResponse> {
  const response = await fetch(`${API_URL}/auth/telegram`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ initData }),
    credentials: 'include',
  });

  return response.json();
}

/**
 * Get current authenticated user
 */
export async function getCurrentUser(): Promise<AuthMeResponse> {
  const response = await fetch(`${API_URL}/auth/me`, {
    method: 'GET',
    credentials: 'include',
  });

  return response.json();
}

/**
 * Get initial data (user, draft, stats, config) - один запрос вместо множества
 */
export interface InitDataResponse {
  ok: boolean;
  user?: {
    id: string;
    telegramUserId: string;
    firstName: string;
    lastName?: string;
    username?: string;
    language: string;
    createdAt: string;
  };
  draft?: {
    id: string;
    step: string | null;
    payload: unknown;
    updatedAt: string;
  } | null;
  participantStats?: {
    totalCount: number;
    wonCount: number;
    activeCount: number;
  };
  creatorStats?: {
    totalCount: number;
    activeCount: number;
    channelCount: number;
    postCount: number;
  };
  config?: {
    limits: Record<string, number>;
    features: Record<string, boolean | string>;
    subscriptionTier: string;
  };
  error?: string;
}

export async function getInitData(): Promise<InitDataResponse> {
  const response = await fetch(`${API_URL}/init`, {
    method: 'GET',
    credentials: 'include',
  });

  return response.json();
}

/**
 * Logout (clear session)
 */
export async function logout(): Promise<AuthResponse> {
  const response = await fetch(`${API_URL}/auth/logout`, {
    method: 'POST',
    credentials: 'include',
  });

  return response.json();
}

/**
 * Dev login (development only)
 */
export async function devLogin(telegramUserId?: string): Promise<AuthResponse> {
  const response = await fetch(`${API_URL}/auth/dev`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ telegramUserId }),
    credentials: 'include',
  });

  return response.json();
}

// =============================================================================
// Draft API
// =============================================================================

export interface Draft {
  id: string;
  wizardStep: string | null;
  draftPayload: unknown;
  draftVersion: number;
  createdAt: string;
  updatedAt: string;
}

interface DraftResponse {
  ok: boolean;
  draft: Draft | null;
  created?: boolean;
  error?: string;
}

/**
 * Get current user's draft giveaway
 */
export async function getDraft(): Promise<DraftResponse> {
  const response = await fetch(`${API_URL}/drafts/giveaway`, {
    method: 'GET',
    credentials: 'include',
  });

  return response.json();
}

/**
 * Create a new draft (or get existing one)
 */
export async function createDraft(wizardStep?: string): Promise<DraftResponse> {
  const response = await fetch(`${API_URL}/drafts/giveaway`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ wizardStep }),
    credentials: 'include',
  });

  return response.json();
}

/**
 * Update draft payload
 */
export async function updateDraft(
  id: string,
  wizardStep: string,
  draftPayload: GiveawayDraftPayload
): Promise<DraftResponse> {
  const response = await fetch(`${API_URL}/drafts/giveaway/${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ wizardStep, draftPayload }),
    credentials: 'include',
  });

  return response.json();
}

/**
 * Discard (soft-delete) a draft
 */
export async function discardDraft(id: string): Promise<AuthResponse> {
  const response = await fetch(`${API_URL}/drafts/giveaway/${id}/discard`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
    credentials: 'include',
  });

  return response.json();
}

// =============================================================================
// Channels API
// =============================================================================

export interface Channel {
  id: string;
  telegramChatId: string;
  username: string | null;
  title: string;
  type: 'CHANNEL' | 'GROUP';
  botIsAdmin: boolean;
  creatorIsAdmin: boolean;
  memberCount: number | null;
  lastCheckedAt: string | null;
  createdAt: string;
}

interface ChannelsResponse {
  ok: boolean;
  channels?: Channel[];
  error?: string;
}

interface ChannelResponse {
  ok: boolean;
  channel?: Channel;
  error?: string;
}

/**
 * Get all channels for the current user
 */
export async function getChannels(): Promise<ChannelsResponse> {
  const response = await fetch(`${API_URL}/channels`, {
    method: 'GET',
    credentials: 'include',
  });

  return response.json();
}

/**
 * Get a specific channel by ID
 */
export async function getChannel(id: string): Promise<ChannelResponse> {
  const response = await fetch(`${API_URL}/channels/${id}`, {
    method: 'GET',
    credentials: 'include',
  });

  return response.json();
}

/**
 * Delete a channel
 */
export async function deleteChannel(id: string): Promise<AuthResponse> {
  const response = await fetch(`${API_URL}/channels/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  });

  return response.json();
}

/**
 * Recheck channel status (bot/creator admin)
 */
export async function recheckChannel(id: string): Promise<ChannelResponse> {
  const response = await fetch(`${API_URL}/channels/${id}/recheck`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
    credentials: 'include',
  });

  return response.json();
}

// =============================================================================
// Post Templates API
// =============================================================================

export interface PostTemplate {
  id: string;
  text: string;
  mediaType: 'NONE' | 'PHOTO' | 'VIDEO';
  telegramFileId: string | null;
  hasMedia: boolean;
  createdAt: string;
}

interface PostTemplatesResponse {
  ok: boolean;
  templates?: PostTemplate[];
  error?: string;
}

interface DeletePostTemplateResponse {
  ok: boolean;
  undoUntil?: string;
  error?: string;
}

/**
 * Get all post templates for the current user
 */
export async function getPostTemplates(): Promise<PostTemplatesResponse> {
  const response = await fetch(`${API_URL}/post-templates`, {
    method: 'GET',
    credentials: 'include',
  });

  return response.json();
}

/**
 * Delete a post template (soft delete)
 */
export async function deletePostTemplate(id: string): Promise<DeletePostTemplateResponse> {
  const response = await fetch(`${API_URL}/post-templates/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  });

  return response.json();
}

/**
 * Undo delete a post template
 */
export async function undoDeletePostTemplate(id: string): Promise<AuthResponse> {
  const response = await fetch(`${API_URL}/post-templates/${id}/undo-delete`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
    credentials: 'include',
  });

  return response.json();
}

// =============================================================================
// Giveaways API
// =============================================================================

interface ConfirmGiveawayResponse {
  ok: boolean;
  giveawayId?: string;
  status?: string;
  summary?: GiveawayDraftPayload;
  error?: string;
  details?: Array<{ field: string; message: string }>;
}

/**
 * Confirm a draft giveaway
 */
export async function confirmGiveaway(draftId: string): Promise<ConfirmGiveawayResponse> {
  const response = await fetch(`${API_URL}/giveaways/from-draft/${draftId}/confirm`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
    credentials: 'include',
  });

  return response.json();
}

// =============================================================================
// Participation API (участие в розыгрышах)
// =============================================================================

/** Информация о канале для подписки */
export interface RequiredSubscription {
  id: string;
  title: string;
  username: string | null;
  telegramChatId: string;
}

/** Публичная информация о розыгрыше */
export interface CustomTask {
  id: string;
  title: string;
  description: string | null;
  linkUrl: string;
  isRequired: boolean;
  bonusTickets: number;
  orderIndex: number;
  createdAt: string;
}

export interface PublicGiveaway {
  id: string;
  title: string;
  status: string;
  endAt: string | null;
  winnersCount: number;
  participantsCount: number;
  buttonText: string;
  mascotType?: string;
  postTemplate: {
    text: string;
    mediaType: 'NONE' | 'PHOTO' | 'VIDEO';
  } | null;
  conditions: {
    requiredSubscriptions: RequiredSubscription[];
    captchaMode: 'OFF' | 'SUSPICIOUS_ONLY' | 'ALL';
    inviteEnabled: boolean;
    inviteMax: number;
    boostEnabled: boolean;
    storiesEnabled: boolean;
    customTasks?: CustomTask[];
  };
}

/** Информация об участии */
export interface Participation {
  id: string;
  status: string;
  ticketsBase: number;
  ticketsExtra: number;
  joinedAt: string;
  storiesShared?: boolean;
  boostedChannelIds?: string[];
}

interface PublicGiveawayResponse {
  ok: boolean;
  giveaway?: PublicGiveaway;
  participation?: Participation | null;
  error?: string;
  status?: string;
}

interface CheckSubscriptionResponse {
  ok: boolean;
  subscribed?: boolean;
  channels?: Array<{
    id: string;
    title: string;
    username: string | null;
    subscribed: boolean;
  }>;
  error?: string;
}

interface JoinGiveawayResponse {
  ok: boolean;
  participation?: Participation;
  error?: string;
  code?: string;
}

interface CaptchaGenerateResponse {
  ok: boolean;
  question?: string;
  token?: string;
  error?: string;
}

interface CaptchaVerifyResponse {
  ok: boolean;
  error?: string;
}

/**
 * Получить публичную информацию о розыгрыше
 */
export async function getPublicGiveaway(giveawayId: string): Promise<PublicGiveawayResponse> {
  const response = await fetch(`${API_URL}/giveaways/${giveawayId}/public`, {
    method: 'GET',
    credentials: 'include',
  });

  return response.json();
}

/**
 * Получить розыгрыш по shortCode (для deep links)
 */
export interface GiveawayByCodeResponse {
  ok: boolean;
  giveaway?: {
    id: string;
    shortCode: string;
    title: string;
    status: string;
    type: string;
    startAt: string | null;
    endAt: string | null;
    isPublicInCatalog: boolean;
  };
  error?: string;
}

export async function getGiveawayByShortCode(shortCode: string): Promise<GiveawayByCodeResponse> {
  const response = await fetch(`${API_URL}/giveaways/by-code/${shortCode}`, {
    method: 'GET',
    credentials: 'include',
  });

  return response.json();
}

/**
 * Проверить подписку на каналы
 */
export async function checkSubscription(giveawayId: string): Promise<CheckSubscriptionResponse> {
  const response = await fetch(`${API_URL}/giveaways/${giveawayId}/check-subscription`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
    credentials: 'include',
  });

  return response.json();
}

/**
 * Участвовать в розыгрыше
 */
export async function joinGiveaway(
  giveawayId: string,
  options?: {
    captchaPassed?: boolean;
    sourceTag?: string;
    referrerUserId?: string;
  }
): Promise<JoinGiveawayResponse> {
  const response = await fetch(`${API_URL}/giveaways/${giveawayId}/join`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      captchaPassed: options?.captchaPassed || false,
      sourceTag: options?.sourceTag || null,
      referrerUserId: options?.referrerUserId || null,
    }),
    credentials: 'include',
  });

  return response.json();
}

/**
 * Сгенерировать капчу
 */
export async function generateCaptcha(): Promise<CaptchaGenerateResponse> {
  const response = await fetch(`${API_URL}/captcha/generate`, {
    method: 'GET',
    credentials: 'include',
  });

  return response.json();
}

/**
 * Проверить ответ на капчу
 */
export async function verifyCaptcha(token: string, answer: number): Promise<CaptchaVerifyResponse> {
  const response = await fetch(`${API_URL}/captcha/verify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ token, answer }),
    credentials: 'include',
  });

  return response.json();
}

// =============================================================================
// Lifecycle API (статус, победители, результаты)
// =============================================================================

/** Информация о победителе */
export interface WinnerInfo {
  place: number;
  ticketsUsed: number;
  selectedAt: string;
  user: {
    telegramUserId: string;
    firstName: string | null;
    lastName: string | null;
    username: string | null;
  };
}

interface GiveawayStatusResponse {
  ok: boolean;
  status?: string;
  title?: string;
  winnersCount?: number;
  participantsCount?: number;
  selectedWinnersCount?: number;
  startsAt?: string | null;
  endsAt?: string | null;
  error?: string;
}

interface GiveawayWinnersResponse {
  ok: boolean;
  status?: string;
  title?: string;
  winners?: WinnerInfo[];
  totalParticipants?: number;
  finishedAt?: string;
  prizeDeliveryMethod?: 'BOT_MESSAGE' | 'FORM' | 'DESCRIPTION' | null;
  prizeDescription?: string | null;
  mascotType?: string | null;
  creatorUsername?: string | null;
  message?: string;
  error?: string;
}

interface FinishGiveawayResponse {
  ok: boolean;
  winnersCount?: number;
  winners?: Array<{
    place: number;
    user: {
      telegramUserId: string;
      firstName: string | null;
      username: string | null;
    };
  }>;
  error?: string;
}

interface MyResultResponse {
  ok: boolean;
  participated?: boolean;
  tickets?: number;
  isWinner?: boolean;
  giveawayStatus?: string;
  winner?: {
    place: number;
    totalWinners: number;
    selectedAt: string;
  } | null;
  message?: string;
  error?: string;
}

/**
 * Получить статус розыгрыша
 */
export async function getGiveawayStatus(giveawayId: string): Promise<GiveawayStatusResponse> {
  const response = await fetch(`${API_URL}/giveaways/${giveawayId}/status`, {
    method: 'GET',
    credentials: 'include',
  });

  return response.json();
}

/**
 * Получить список победителей
 */
export async function getGiveawayWinners(giveawayId: string): Promise<GiveawayWinnersResponse> {
  const response = await fetch(`${API_URL}/giveaways/${giveawayId}/winners`, {
    method: 'GET',
    credentials: 'include',
  });

  return response.json();
}

/**
 * Завершить розыгрыш вручную (только владелец)
 */
export async function finishGiveaway(giveawayId: string): Promise<FinishGiveawayResponse> {
  const response = await fetch(`${API_URL}/giveaways/${giveawayId}/finish`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
    credentials: 'include',
  });

  return response.json();
}

/**
 * Проверить свой результат в розыгрыше
 */
export async function getMyResult(giveawayId: string): Promise<MyResultResponse> {
  const response = await fetch(`${API_URL}/giveaways/${giveawayId}/my-result`, {
    method: 'GET',
    credentials: 'include',
  });

  return response.json();
}

// =============================================================================
// Referral API (реферальная система)
// =============================================================================

/** Информация о приглашённом друге */
export interface InvitedFriend {
  userId: string;
  firstName: string;
  lastName: string | null;
  username: string | null;
  joinedAt: string;
}

interface MyReferralResponse {
  ok: boolean;
  referralLink?: string;
  referralCode?: string;
  invitedCount?: number;
  inviteMax?: number;
  inviteEnabled?: boolean;
  ticketsFromInvites?: number;
  error?: string;
}

interface MyInvitesResponse {
  ok: boolean;
  invites?: InvitedFriend[];
  count?: number;
  max?: number;
  error?: string;
}

/**
 * Получить реферальную ссылку и статистику приглашений
 */
export async function getMyReferral(giveawayId: string): Promise<MyReferralResponse> {
  const response = await fetch(`${API_URL}/giveaways/${giveawayId}/my-referral`, {
    method: 'GET',
    credentials: 'include',
  });

  return response.json();
}

/**
 * Получить список приглашённых друзей
 */
export async function getMyInvites(giveawayId: string): Promise<MyInvitesResponse> {
  const response = await fetch(`${API_URL}/giveaways/${giveawayId}/my-invites`, {
    method: 'GET',
    credentials: 'include',
  });

  return response.json();
}

// =============================================================================
// Boost API (бусты каналов)
// =============================================================================

/** Информация о канале для буста */
export interface BoostChannel {
  id: string;
  title: string;
  username: string | null;
  telegramChatId: string;
  boosted: boolean;
  boostCount: number;
}

interface MyBoostsResponse {
  ok: boolean;
  boostEnabled?: boolean;
  channels?: BoostChannel[];
  totalBoosts?: number;
  maxBoostsPerChannel?: number;
  ticketsFromBoosts?: number;
  error?: string;
}

interface VerifyBoostResponse {
  ok: boolean;
  newBoosts?: number;
  totalBoostsForChannel?: number;
  ticketsAdded?: number;
  totalTickets?: number;
  error?: string;
}

/**
 * Получить статус бустов для участника
 */
export async function getMyBoosts(giveawayId: string): Promise<MyBoostsResponse> {
  const response = await fetch(`${API_URL}/giveaways/${giveawayId}/my-boosts`, {
    method: 'GET',
    credentials: 'include',
  });

  return response.json();
}

/**
 * Проверить и засчитать буст для канала
 */
export async function verifyBoost(giveawayId: string, channelId: string): Promise<VerifyBoostResponse> {
  const response = await fetch(`${API_URL}/giveaways/${giveawayId}/verify-boost`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ channelId }),
    credentials: 'include',
  });

  return response.json();
}

// =============================================================================
// Stories API (публикация в сторис)
// =============================================================================

// =============================================================================
// Story Request API (заявки на сторис с модерацией)
// =============================================================================

export type StoryRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

interface SubmitStoryResponse {
  ok: boolean;
  status?: StoryRequestStatus;
  error?: string;
  message?: string;
}

/**
 * Отправить заявку на сторис
 */
export async function submitStory(giveawayId: string): Promise<SubmitStoryResponse> {
  const response = await fetch(`${API_URL}/giveaways/${giveawayId}/submit-story`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
    credentials: 'include',
  });

  return response.json();
}

interface MyStoryRequestResponse {
  ok: boolean;
  hasRequest?: boolean;
  status?: StoryRequestStatus | null;
  submittedAt?: string | null;
  reviewedAt?: string | null;
  rejectReason?: string | null;
  error?: string;
}

/**
 * Получить статус своей заявки на сторис
 */
export async function getMyStoryRequest(giveawayId: string): Promise<MyStoryRequestResponse> {
  const response = await fetch(`${API_URL}/giveaways/${giveawayId}/my-story-request`, {
    credentials: 'include',
  });

  return response.json();
}

interface StoryRequestUser {
  id: string;
  telegramUserId: string;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
}

export interface StoryRequest {
  id: string;
  status: StoryRequestStatus;
  submittedAt: string;
  reviewedAt: string | null;
  rejectReason: string | null;
  user: StoryRequestUser;
}

interface StoryRequestsResponse {
  ok: boolean;
  requests?: StoryRequest[];
  stats?: {
    pending: number;
    approved: number;
    rejected: number;
    total: number;
  };
  error?: string;
}

/**
 * Получить список заявок на сторис (для админа)
 */
export async function getStoryRequests(giveawayId: string): Promise<StoryRequestsResponse> {
  const response = await fetch(`${API_URL}/giveaways/${giveawayId}/story-requests`, {
    credentials: 'include',
  });

  return response.json();
}

interface ModerateStoryResponse {
  ok: boolean;
  message?: string;
  error?: string;
}

/**
 * Одобрить заявку на сторис
 */
export async function approveStoryRequest(giveawayId: string, requestId: string): Promise<ModerateStoryResponse> {
  const response = await fetch(`${API_URL}/giveaways/${giveawayId}/story-requests/${requestId}/approve`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
    credentials: 'include',
  });

  return response.json();
}

/**
 * Отклонить заявку на сторис
 */
export async function rejectStoryRequest(giveawayId: string, requestId: string, reason?: string): Promise<ModerateStoryResponse> {
  const response = await fetch(`${API_URL}/giveaways/${giveawayId}/story-requests/${requestId}/reject`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ reason }),
    credentials: 'include',
  });

  return response.json();
}

// =============================================================================
// Dashboard API (список розыгрышей создателя)
// =============================================================================

export interface GiveawaySummary {
  id: string;
  status: string;
  title: string;
  type: string;
  winnersCount: number;
  participantsCount: number;
  startAt: string | null;
  endAt: string | null;
  createdAt: string;
  updatedAt: string;
  postTemplate: {
    id: string;
    mediaType: string;
    hasMedia: boolean;
  } | null;
}

interface GiveawaysListResponse {
  ok: boolean;
  giveaways?: GiveawaySummary[];
  total?: number;
  hasMore?: boolean;
  counts?: {
    all: number;
    draft: number;
    pendingConfirm: number;
    scheduled: number;
    active: number;
    finished: number;
    cancelled: number;
  };
  error?: string;
}

/**
 * Получить список розыгрышей создателя
 */
export async function getGiveawaysList(params?: {
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<GiveawaysListResponse> {
  const searchParams = new URLSearchParams();
  if (params?.status) searchParams.set('status', params.status);
  if (params?.limit) searchParams.set('limit', params.limit.toString());
  if (params?.offset) searchParams.set('offset', params.offset.toString());

  const url = `${API_URL}/giveaways${searchParams.toString() ? `?${searchParams}` : ''}`;
  const response = await fetch(url, {
    credentials: 'include',
  });

  return response.json();
}

export interface GiveawayStats {
  participantsCount: number;
  participantsToday: number;
  participantsGrowth: Array<{ date: string; count: number }>;
  ticketsTotal: number;
  ticketsFromInvites: number;
  ticketsFromBoosts: number;
  ticketsFromStories: number;
  invitesCount: number;
  boostsCount: number;
  storiesApproved: number;
  storiesPending: number;
  channelStats: Array<{
    channelId: string;
    title: string;
    username: string | null;
  }>;
}

interface GiveawayStatsResponse {
  ok: boolean;
  stats?: GiveawayStats;
  error?: string;
}

/**
 * Получить статистику розыгрыша
 */
export async function getGiveawayStats(giveawayId: string): Promise<GiveawayStatsResponse> {
  const response = await fetch(`${API_URL}/giveaways/${giveawayId}/stats`, {
    credentials: 'include',
  });

  return response.json();
}

export interface GiveawayParticipant {
  id: string;
  user: {
    id: string;
    telegramUserId: string;
    firstName: string | null;
    lastName: string | null;
    username: string | null;
  };
  ticketsBase: number;
  ticketsExtra: number;
  invitedCount: number;
  boostedChannelIds: string[];
  storiesShared: boolean;
  storyRequestStatus: string | null;
  joinedAt: string;
}

interface ParticipantsResponse {
  ok: boolean;
  participants?: GiveawayParticipant[];
  total?: number;
  hasMore?: boolean;
  error?: string;
}

/**
 * Получить список участников розыгрыша
 */
export async function getGiveawayParticipants(
  giveawayId: string,
  params?: { limit?: number; offset?: number; search?: string }
): Promise<ParticipantsResponse> {
  const searchParams = new URLSearchParams();
  if (params?.limit) searchParams.set('limit', params.limit.toString());
  if (params?.offset) searchParams.set('offset', params.offset.toString());
  if (params?.search) searchParams.set('search', params.search);

  const url = `${API_URL}/giveaways/${giveawayId}/participants${searchParams.toString() ? `?${searchParams}` : ''}`;
  const response = await fetch(url, {
    credentials: 'include',
  });

  return response.json();
}

export interface GiveawayFull {
  id: string;
  status: string;
  title: string;
  language: string;
  type: string;
  winnersCount: number;
  buttonText: string;
  publishResultsMode: string;
  startAt: string | null;
  endAt: string | null;
  createdAt: string;
  updatedAt: string;
  participantsCount: number;
  postTemplate: {
    id: string;
    text: string;
    mediaType: string;
    telegramFileId: string | null;
  } | null;
  condition: {
    captchaMode: string;
    livenessEnabled: boolean;
    inviteEnabled: boolean;
    inviteMax: number | null;
    boostEnabled: boolean;
    boostChannelIds: string[];
    storiesEnabled: boolean;
  } | null;
  publishChannels: Array<{ id: string; title: string; username: string | null }>;
  requiredSubscriptions: Array<{ id: string; title: string; username: string | null }>;
  winners: Array<{
    place: number;
    user: {
      id: string;
      telegramUserId: string;
      firstName: string | null;
      lastName: string | null;
      username: string | null;
    };
  }>;
}

interface GiveawayFullResponse {
  ok: boolean;
  giveaway?: GiveawayFull;
  error?: string;
}

/**
 * Получить полную информацию о розыгрыше
 */
export async function getGiveawayFull(giveawayId: string): Promise<GiveawayFullResponse> {
  const response = await fetch(`${API_URL}/giveaways/${giveawayId}/full`, {
    credentials: 'include',
  });

  return response.json();
}

interface DuplicateResponse {
  ok: boolean;
  newGiveawayId?: string;
  error?: string;
}

/**
 * Дублировать розыгрыш
 */
export async function duplicateGiveaway(giveawayId: string): Promise<DuplicateResponse> {
  const response = await fetch(`${API_URL}/giveaways/${giveawayId}/duplicate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
    credentials: 'include',
  });

  return response.json();
}

interface DeleteResponse {
  ok: boolean;
  error?: string;
}

/**
 * Удалить розыгрыш (только DRAFT или CANCELLED)
 */
export async function deleteGiveaway(giveawayId: string): Promise<DeleteResponse> {
  const response = await fetch(`${API_URL}/giveaways/${giveawayId}`, {
    method: 'DELETE',
    credentials: 'include',
  });

  return response.json();
}

// =============================================================================
// Раздел "Участник" — мои участия в розыгрышах
// =============================================================================

export type ParticipationFilterStatus = 'all' | 'active' | 'finished' | 'won' | 'cancelled';

export interface MyParticipation {
  id: string;
  giveaway: {
    id: string;
    title: string;
    status: string;
    endAt: string | null;
    winnersCount: number;
    participantsCount: number;
    postTemplate: {
      text: string;
      mediaType: string;
    } | null;
  };
  ticketsBase: number;
  ticketsExtra: number;
  totalTickets: number;
  joinedAt: string;
  isWinner: boolean;
  winnerPlace: number | null;
}

interface MyParticipationsResponse {
  ok: boolean;
  participations?: MyParticipation[];
  counts?: {
    all: number;
    active: number;
    finished: number;
    won: number;
    cancelled: number;
  };
  total?: number;
  hasMore?: boolean;
  error?: string;
}

/**
 * Получить список розыгрышей где я участвую
 */
export async function getMyParticipations(params?: {
  status?: ParticipationFilterStatus;
  limit?: number;
  offset?: number;
}): Promise<MyParticipationsResponse> {
  const searchParams = new URLSearchParams();
  if (params?.status) searchParams.set('status', params.status);
  if (params?.limit) searchParams.set('limit', params.limit.toString());
  if (params?.offset) searchParams.set('offset', params.offset.toString());

  const url = `${API_URL}/participations/my${searchParams.toString() ? `?${searchParams}` : ''}`;
  const response = await fetch(url, {
    credentials: 'include',
  });

  return response.json();
}

// =============================================================================
// Каталог розыгрышей
// =============================================================================

export interface CatalogGiveaway {
  id: string;
  title: string;
  participantsCount: number;
  winnersCount: number;
  endAt: string | null;
  channel: {
    id: string;
    title: string;
    username: string | null;
    subscribersCount: number;
  } | null;
}

interface CatalogResponse {
  ok: boolean;
  hasAccess?: boolean;
  giveaways?: CatalogGiveaway[];
  total?: number;
  previewCount?: number;
  subscriptionPrice?: number;
  hasMore?: boolean;
  error?: string;
}

/**
 * Получить каталог розыгрышей
 */
export async function getCatalog(params?: {
  limit?: number;
  offset?: number;
}): Promise<CatalogResponse> {
  const searchParams = new URLSearchParams();
  if (params?.limit) searchParams.set('limit', params.limit.toString());
  if (params?.offset) searchParams.set('offset', params.offset.toString());

  const url = `${API_URL}/catalog${searchParams.toString() ? `?${searchParams}` : ''}`;
  const response = await fetch(url, {
    credentials: 'include',
  });

  return response.json();
}

interface CatalogAccessResponse {
  ok: boolean;
  hasAccess?: boolean;
  expiresAt?: string | null;
  price?: number;
  currency?: string;
  error?: string;
}

/**
 * Проверить доступ к каталогу
 */
export async function getCatalogAccess(): Promise<CatalogAccessResponse> {
  const response = await fetch(`${API_URL}/catalog/access`, {
    credentials: 'include',
  });

  return response.json();
}

interface ToggleCatalogResponse {
  ok: boolean;
  catalogEnabled?: boolean;
  error?: string;
}

/**
 * Включить/выключить показ в каталоге
 */
export async function toggleGiveawayCatalog(
  giveawayId: string,
  enabled: boolean
): Promise<ToggleCatalogResponse> {
  const response = await fetch(`${API_URL}/giveaways/${giveawayId}/catalog`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ enabled }),
    credentials: 'include',
  });

  return response.json();
}

// =============================================================================
// Платежи
// =============================================================================

interface CreatePaymentResponse {
  ok: boolean;
  paymentUrl?: string;
  purchaseId?: string;
  error?: string;
}

/**
 * Создать платёж для продукта
 */
export async function createPayment(params: {
  productCode: string;
}): Promise<CreatePaymentResponse> {
  const response = await fetch(`${API_URL}/payments/create`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
    credentials: 'include',
  });

  return response.json();
}

interface PaymentStatusResponse {
  ok: boolean;
  status?: 'PENDING' | 'COMPLETED' | 'FAILED' | 'REFUNDED';
  productTitle?: string;
  error?: string;
}

/**
 * Проверить статус покупки
 */
export async function checkPaymentStatus(
  purchaseId: string
): Promise<PaymentStatusResponse> {
  const response = await fetch(`${API_URL}/payments/status/${purchaseId}`, {
    credentials: 'include',
  });

  return response.json();
}

// =============================================================================
// Custom Tasks API
// =============================================================================

interface CustomTasksResponse {
  ok: boolean;
  tasks?: CustomTask[];
  error?: string;
}

/**
 * Получить кастомные задания розыгрыша
 */
export async function getCustomTasks(
  giveawayId: string
): Promise<CustomTasksResponse> {
  const response = await fetch(`${API_URL}/custom-tasks/giveaway/${giveawayId}`, {
    credentials: 'include',
  });

  return response.json();
}

interface CompleteCustomTaskResponse {
  ok: boolean;
  completed?: boolean;
  error?: string;
}

/**
 * Отметить кастомное задание как выполненное
 */
export async function completeCustomTask(
  giveawayId: string,
  taskId: string
): Promise<CompleteCustomTaskResponse> {
  const response = await fetch(`${API_URL}/giveaways/${giveawayId}/custom-tasks/${taskId}/complete`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
  });

  return response.json();
}

interface CustomTaskCompletionStatus {
  taskId: string;
  completed: boolean;
  completedAt: string | null;
}

interface CustomTaskCompletionsResponse {
  ok: boolean;
  completions?: CustomTaskCompletionStatus[];
  error?: string;
}

/**
 * Получить статус выполнения кастомных заданий участником
 */
export async function getMyCustomTaskCompletions(
  giveawayId: string
): Promise<CustomTaskCompletionsResponse> {
  const response = await fetch(`${API_URL}/giveaways/${giveawayId}/my-custom-tasks`, {
    credentials: 'include',
  });

  return response.json();
}

// === Трекинг-ссылки ===

export interface TrackingLink {
  id: string;
  tag: string;
  url: string;
  clicks: number;
  joins: number;
  createdAt: string;
}

interface TrackingLinksResponse {
  ok: boolean;
  items?: TrackingLink[];
  error?: string;
}

interface CreateTrackingLinkResponse {
  ok: boolean;
  id?: string;
  tag?: string;
  url?: string;
  clicks?: number;
  joins?: number;
  createdAt?: string;
  error?: string;
}

/**
 * Получить список трекинг-ссылок розыгрыша
 */
export async function getTrackingLinks(giveawayId: string): Promise<TrackingLinksResponse> {
  const response = await fetch(`${API_URL}/giveaways/${giveawayId}/tracking-links`, {
    credentials: 'include',
  });

  return response.json();
}

/**
 * Создать трекинг-ссылку
 */
export async function createTrackingLink(
  giveawayId: string,
  tag: string
): Promise<CreateTrackingLinkResponse> {
  const response = await fetch(`${API_URL}/giveaways/${giveawayId}/tracking-links`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ tag }),
    credentials: 'include',
  });

  return response.json();
}

/**
 * Запустить розыгрыш (SCHEDULED → ACTIVE)
 */
export async function startGiveaway(giveawayId: string): Promise<{ok: boolean; error?: string}> {
  const response = await fetch(`${API_URL}/giveaways/${giveawayId}/start`, {
    method: 'POST',
    credentials: 'include',
  });

  return response.json();
}

/**
 * Отменить розыгрыш
 */
export async function cancelGiveaway(giveawayId: string): Promise<{ok: boolean; error?: string}> {
  const response = await fetch(`${API_URL}/giveaways/${giveawayId}/cancel`, {
    method: 'POST',
    credentials: 'include',
  });

  return response.json();
}

/**
 * Повторить ошибку (для статуса ERROR)
 */
export async function retryGiveaway(giveawayId: string): Promise<{ok: boolean; error?: string}> {
  const response = await fetch(`${API_URL}/giveaways/${giveawayId}/retry`, {
    method: 'POST',
    credentials: 'include',
  });

  return response.json();
}

/**
 * Получить количество участников (для polling)
 */
export async function getParticipantCount(giveawayId: string): Promise<{ok: boolean; count?: number; error?: string}> {
  const response = await fetch(`${API_URL}/giveaways/${giveawayId}/participant-count`, {
    credentials: 'include',
  });

  return response.json();
}
