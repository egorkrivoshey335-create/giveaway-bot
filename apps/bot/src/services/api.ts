import { config } from '../config.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('api');
const DEFAULT_INTERNAL_API_TIMEOUT_MS = 8000;

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

interface Draft {
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

interface Channel {
  id: string;
  telegramChatId: string;
  username: string | null;
  title: string;
  type: 'CHANNEL' | 'GROUP';
  botIsAdmin: boolean;
  creatorIsAdmin: boolean;
  memberCount?: number;
}

interface ChannelUpsertResponse {
  ok: boolean;
  channel?: Channel;
  error?: string;
}

interface ChannelUpsertParams {
  telegramUserId: number | bigint;
  telegramChatId: number | bigint;
  username: string | null;
  title: string;
  type: 'CHANNEL' | 'GROUP';
  botIsAdmin: boolean;
  creatorIsAdmin: boolean;
  permissionsSnapshot?: unknown;
  memberCount?: number;
}

// Post Template types
interface PostTemplate {
  id: string;
  mediaType: 'NONE' | 'PHOTO' | 'VIDEO';
  createdAt: string;
}

interface PostTemplateCreateParams {
  telegramUserId: number | bigint;
  text: string;
  mediaType: 'NONE' | 'PHOTO' | 'VIDEO';
  telegramFileId?: string;
  telegramFileUniqueId?: string;
  entities?: any[];
}

interface PostTemplateCreateResponse {
  ok: boolean;
  template?: PostTemplate;
  error?: string;
  maxLength?: number;
  currentLength?: number;
}

interface PostTemplateDeleteResponse {
  ok: boolean;
  undoUntil?: string;
  error?: string;
}

// Giveaway types
interface GiveawayChannel {
  id: string;
  title: string;
  username: string | null;
  telegramChatId: string;
}

interface GiveawayFullResponse {
  ok: boolean;
  giveaway?: {
    id: string;
    title: string;
    type: string;
    status: string;
    language: string;
    buttonText: string | null;
    winnersCount: number;
    startAt: string | null;
    endAt: string | null;
    publishResultsMode: string;
    minParticipants: number;
    cancelIfNotEnough: boolean;
    autoExtendDays: number;
  };
  postTemplate?: {
    text: string;
    mediaType: 'NONE' | 'PHOTO' | 'VIDEO';
    telegramFileId: string | null;
    entities?: unknown[] | null;
  } | null;
  channels?: {
    requiredSubscriptions: GiveawayChannel[];
    publish: GiveawayChannel[];
    results: GiveawayChannel[];
  };
  protection?: {
    captchaMode: 'OFF' | 'SUSPICIOUS_ONLY' | 'ALL';
    livenessEnabled: boolean;
    // Дополнительные билеты
    inviteEnabled: boolean;
    inviteMax: number | null;
    boostEnabled: boolean;
    boostChannelIds: string[];
    storiesEnabled: boolean;
  };
  owner?: {
    telegramUserId: string;
  };
  error?: string;
}

interface PublishedMessage {
  channelId: string;
  telegramMessageId: number;
}

interface GiveawayAcceptResponse {
  ok: boolean;
  status?: string;
  error?: string;
}

interface GiveawayRejectResponse {
  ok: boolean;
  error?: string;
}

/**
 * Internal API client for bot -> API communication
 * Uses X-Internal-Token header for authentication
 */
export class ApiService {
  private baseUrl: string;
  private internalToken: string;
  private requestTimeoutMs: number;

  constructor() {
    this.baseUrl = config.internalApiUrl;
    this.internalToken = config.internalApiToken;
    this.requestTimeoutMs = parsePositiveInt(
      process.env.BOT_INTERNAL_API_TIMEOUT_MS,
      DEFAULT_INTERNAL_API_TIMEOUT_MS
    );
  }

  private getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'X-Internal-Token': this.internalToken,
    };
  }

  private async fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.requestTimeoutMs);

    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private mapNetworkError(error: unknown): string {
    if (isAbortError(error)) {
      return `API timeout after ${this.requestTimeoutMs}ms`;
    }
    return 'Failed to connect to API';
  }

  /**
   * Create or get existing draft for a user by Telegram ID
   */
  async createDraftForTelegramUser(
    telegramUserId: number | bigint
  ): Promise<{ ok: boolean; draft?: Draft; created?: boolean; error?: string }> {
    try {
      const response = await this.fetchWithTimeout(`${this.baseUrl}/internal/drafts/giveaway`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ telegramUserId: telegramUserId.toString() }),
      });

      const data = (await response.json()) as { success: boolean; data?: { draft: Draft; created: boolean }; error?: string };

      if (!response.ok || !data.success) {
        return { ok: false, error: data.error || 'API request failed' };
      }

      return { ok: true, draft: data.data?.draft ?? undefined, created: data.data?.created };
    } catch (error) {
      log.error({ error }, 'API call failed');
      return { ok: false, error: this.mapNetworkError(error) };
    }
  }

  /**
   * Upsert a channel (create or update)
   */
  async upsertChannel(params: ChannelUpsertParams): Promise<ChannelUpsertResponse> {
    try {
      const response = await this.fetchWithTimeout(`${this.baseUrl}/internal/channels/upsert`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          telegramUserId: params.telegramUserId.toString(),
          telegramChatId: params.telegramChatId.toString(),
          username: params.username,
          title: params.title,
          type: params.type,
          botIsAdmin: params.botIsAdmin,
          creatorIsAdmin: params.creatorIsAdmin,
          permissionsSnapshot: params.permissionsSnapshot,
          memberCount: params.memberCount,
        }),
      });

      const data = (await response.json()) as ChannelUpsertResponse;

      if (!response.ok || !data.ok) {
        return { ok: false, error: data.error || 'API request failed' };
      }

      return { ok: true, channel: data.channel };
    } catch (error) {
      log.error({ error }, 'API call failed');
      return { ok: false, error: this.mapNetworkError(error) };
    }
  }

  /**
   * Get user's channels/groups
   */
  async getUserChannels(telegramUserId: number, type?: 'CHANNEL' | 'GROUP'): Promise<{ ok: boolean; channels: Channel[]; error?: string }> {
    try {
      let url = `${this.baseUrl}/internal/channels/by-user/${telegramUserId}`;
      if (type) url += `?type=${type}`;

      const response = await this.fetchWithTimeout(url, {
        method: 'GET',
        headers: this.getHeaders(),
      });
      const data = await response.json() as { success: boolean; data?: { channels: Channel[] }; error?: string };

      if (!response.ok || !data.success) {
        log.warn({ status: response.status, data }, 'getUserChannels: API error');
        return { ok: false, channels: [], error: data.error || 'API request failed' };
      }

      return { ok: true, channels: data.data?.channels || [] };
    } catch (error) {
      log.error({ error }, 'getUserChannels failed');
      return { ok: false, channels: [], error: this.mapNetworkError(error) };
    }
  }

  /**
   * Delete a channel by ID
   */
  async deleteChannel(channelId: string): Promise<{ ok: boolean; error?: string }> {
    try {
      const response = await this.fetchWithTimeout(`${this.baseUrl}/internal/channels/${channelId}`, {
        method: 'DELETE',
        headers: this.getHeaders(),
      });
      const data = await response.json() as { success: boolean; error?: string };

      if (!response.ok || !data.success) {
        return { ok: false, error: data.error || 'API request failed' };
      }
      return { ok: true };
    } catch (error) {
      log.error({ error }, 'deleteChannel failed');
      return { ok: false, error: this.mapNetworkError(error) };
    }
  }

  /**
   * Get user's post templates
   */
  async getUserPostTemplates(telegramUserId: number): Promise<{ ok: boolean; templates: { id: string; text: string; mediaType: string; telegramFileId: string | null; entities: any[] | null; preview: string; createdAt: string }[]; error?: string }> {
    try {
      const response = await this.fetchWithTimeout(`${this.baseUrl}/internal/post-templates/by-user/${telegramUserId}`, {
        method: 'GET',
        headers: this.getHeaders(),
      });
      const data = await response.json() as { success: boolean; data?: { templates: any[] }; error?: string };

      if (!response.ok || !data.success) {
        log.warn({ status: response.status, data }, 'getUserPostTemplates: API error');
        return { ok: false, templates: [], error: data.error || 'API request failed' };
      }

      return { ok: true, templates: data.data?.templates || [] };
    } catch (error) {
      log.error({ error }, 'getUserPostTemplates failed');
      return { ok: false, templates: [], error: this.mapNetworkError(error) };
    }
  }

  /**
   * Create a new post template
   */
  async createPostTemplate(params: PostTemplateCreateParams): Promise<PostTemplateCreateResponse> {
    try {
      const response = await this.fetchWithTimeout(`${this.baseUrl}/internal/post-templates/create`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          telegramUserId: params.telegramUserId.toString(),
          text: params.text,
          mediaType: params.mediaType,
          telegramFileId: params.telegramFileId,
          telegramFileUniqueId: params.telegramFileUniqueId,
          entities: params.entities,
        }),
      });

      const raw = (await response.json()) as any;

      const errorMsg = typeof raw.error === 'string'
        ? raw.error
        : raw.error?.message || 'API request failed';

      if (!response.ok || (!raw.ok && !raw.success)) {
        return { 
          ok: false, 
          error: errorMsg,
          maxLength: raw.maxLength,
          currentLength: raw.currentLength,
        };
      }

      return { ok: true, template: raw.template };
    } catch (error) {
      log.error({ error }, 'API call failed');
      return { ok: false, error: this.mapNetworkError(error) };
    }
  }

  /**
   * Delete a post template (soft delete)
   */
  async deletePostTemplate(templateId: string): Promise<PostTemplateDeleteResponse> {
    try {
      const response = await this.fetchWithTimeout(`${this.baseUrl}/internal/post-templates/${templateId}/delete`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({}),
      });

      const raw = (await response.json()) as any;
      const errorMsg = typeof raw.error === 'string' ? raw.error : raw.error?.message || raw.message || 'API request failed';

      if (!response.ok || (!raw.success && !raw.ok)) {
        return { ok: false, error: errorMsg };
      }

      return { ok: true, undoUntil: raw.data?.undoUntil };
    } catch (error) {
      log.error({ error }, 'API call failed');
      return { ok: false, error: this.mapNetworkError(error) };
    }
  }

  /**
   * Undo delete a post template
   */
  async undoDeletePostTemplate(templateId: string): Promise<{ ok: boolean; error?: string }> {
    try {
      const response = await this.fetchWithTimeout(`${this.baseUrl}/internal/post-templates/${templateId}/undo-delete`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({}),
      });

      const raw = (await response.json()) as any;
      const errorMsg = typeof raw.error === 'string' ? raw.error : raw.error?.message || raw.message || 'API request failed';

      if (!response.ok || (!raw.success && !raw.ok)) {
        return { ok: false, error: errorMsg };
      }

      return { ok: true };
    } catch (error) {
      log.error({ error }, 'API call failed');
      return { ok: false, error: this.mapNetworkError(error) };
    }
  }

  /**
   * Get full giveaway info for confirmation flow
   */
  async getGiveawayFull(giveawayId: string): Promise<GiveawayFullResponse> {
    try {
      const response = await this.fetchWithTimeout(`${this.baseUrl}/internal/giveaways/${giveawayId}/full`, {
        method: 'GET',
        headers: this.getHeaders(),
      });

      const data = (await response.json()) as GiveawayFullResponse;

      if (!response.ok || !data.ok) {
        return { ok: false, error: data.error || 'API request failed' };
      }

      return data;
    } catch (error) {
      log.error({ error }, 'API call failed');
      return { ok: false, error: this.mapNetworkError(error) };
    }
  }

  /**
   * Accept a giveaway and record published messages
   */
  async acceptGiveaway(
    giveawayId: string,
    publishedMessages: PublishedMessage[]
  ): Promise<GiveawayAcceptResponse> {
    try {
      const response = await this.fetchWithTimeout(`${this.baseUrl}/internal/giveaways/${giveawayId}/accept`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ publishedMessages }),
      });

      const data = (await response.json()) as { success: boolean; data?: { status: string }; error?: string };

      if (!response.ok || !data.success) {
        return { ok: false, error: data.error || 'API request failed' };
      }

      return { ok: true, status: data.data?.status };
    } catch (error) {
      log.error({ error }, 'API call failed');
      return { ok: false, error: this.mapNetworkError(error) };
    }
  }

  /**
   * Reject a giveaway and return to draft
   */
  async rejectGiveaway(giveawayId: string): Promise<GiveawayRejectResponse> {
    try {
      const response = await this.fetchWithTimeout(`${this.baseUrl}/internal/giveaways/${giveawayId}/reject`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({}),
      });

      const data = (await response.json()) as { success: boolean; error?: string };

      if (!response.ok || !data.success) {
        return { ok: false, error: data.error || 'API request failed' };
      }

      return { ok: true };
    } catch (error) {
      log.error({ error }, 'API call failed');
      return { ok: false, error: this.mapNetworkError(error) };
    }
  }
}

export const apiService = new ApiService();
