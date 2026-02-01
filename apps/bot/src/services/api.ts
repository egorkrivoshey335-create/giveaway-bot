import { config } from '../config.js';

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
  };
  postTemplate?: {
    text: string;
    mediaType: 'NONE' | 'PHOTO' | 'VIDEO';
    telegramFileId: string | null;
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

  constructor() {
    this.baseUrl = config.apiUrl;
    this.internalToken = config.internalApiToken;
  }

  private getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'X-Internal-Token': this.internalToken,
    };
  }

  /**
   * Create or get existing draft for a user by Telegram ID
   */
  async createDraftForTelegramUser(
    telegramUserId: number | bigint
  ): Promise<{ ok: boolean; draft?: Draft; created?: boolean; error?: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/internal/drafts/giveaway`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ telegramUserId: telegramUserId.toString() }),
      });

      const data = (await response.json()) as DraftResponse;

      if (!response.ok || !data.ok) {
        return { ok: false, error: data.error || 'API request failed' };
      }

      return { ok: true, draft: data.draft ?? undefined, created: data.created };
    } catch (error) {
      console.error('API call failed:', error);
      return { ok: false, error: 'Failed to connect to API' };
    }
  }

  /**
   * Upsert a channel (create or update)
   */
  async upsertChannel(params: ChannelUpsertParams): Promise<ChannelUpsertResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/internal/channels/upsert`, {
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
      console.error('API call failed:', error);
      return { ok: false, error: 'Failed to connect to API' };
    }
  }

  /**
   * Create a new post template
   */
  async createPostTemplate(params: PostTemplateCreateParams): Promise<PostTemplateCreateResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/internal/post-templates/create`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          telegramUserId: params.telegramUserId.toString(),
          text: params.text,
          mediaType: params.mediaType,
          telegramFileId: params.telegramFileId,
          telegramFileUniqueId: params.telegramFileUniqueId,
        }),
      });

      const data = (await response.json()) as PostTemplateCreateResponse;

      if (!response.ok || !data.ok) {
        return { 
          ok: false, 
          error: data.error || 'API request failed',
          maxLength: data.maxLength,
          currentLength: data.currentLength,
        };
      }

      return { ok: true, template: data.template };
    } catch (error) {
      console.error('API call failed:', error);
      return { ok: false, error: 'Failed to connect to API' };
    }
  }

  /**
   * Delete a post template (soft delete)
   */
  async deletePostTemplate(templateId: string): Promise<PostTemplateDeleteResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/internal/post-templates/${templateId}/delete`, {
        method: 'POST',
        headers: this.getHeaders(),
      });

      const data = (await response.json()) as PostTemplateDeleteResponse;

      if (!response.ok || !data.ok) {
        return { ok: false, error: data.error || 'API request failed' };
      }

      return { ok: true, undoUntil: data.undoUntil };
    } catch (error) {
      console.error('API call failed:', error);
      return { ok: false, error: 'Failed to connect to API' };
    }
  }

  /**
   * Undo delete a post template
   */
  async undoDeletePostTemplate(templateId: string): Promise<{ ok: boolean; error?: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/internal/post-templates/${templateId}/undo-delete`, {
        method: 'POST',
        headers: this.getHeaders(),
      });

      const data = (await response.json()) as { ok: boolean; error?: string };

      if (!response.ok || !data.ok) {
        return { ok: false, error: data.error || 'API request failed' };
      }

      return { ok: true };
    } catch (error) {
      console.error('API call failed:', error);
      return { ok: false, error: 'Failed to connect to API' };
    }
  }

  /**
   * Get full giveaway info for confirmation flow
   */
  async getGiveawayFull(giveawayId: string): Promise<GiveawayFullResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/internal/giveaways/${giveawayId}/full`, {
        method: 'GET',
        headers: this.getHeaders(),
      });

      const data = (await response.json()) as GiveawayFullResponse;

      if (!response.ok || !data.ok) {
        return { ok: false, error: data.error || 'API request failed' };
      }

      return data;
    } catch (error) {
      console.error('API call failed:', error);
      return { ok: false, error: 'Failed to connect to API' };
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
      const response = await fetch(`${this.baseUrl}/internal/giveaways/${giveawayId}/accept`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ publishedMessages }),
      });

      const data = (await response.json()) as GiveawayAcceptResponse;

      if (!response.ok || !data.ok) {
        return { ok: false, error: data.error || 'API request failed' };
      }

      return data;
    } catch (error) {
      console.error('API call failed:', error);
      return { ok: false, error: 'Failed to connect to API' };
    }
  }

  /**
   * Reject a giveaway and return to draft
   */
  async rejectGiveaway(giveawayId: string): Promise<GiveawayRejectResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/internal/giveaways/${giveawayId}/reject`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({}),
      });

      const data = (await response.json()) as GiveawayRejectResponse;

      if (!response.ok || !data.ok) {
        return { ok: false, error: data.error || 'API request failed' };
      }

      return { ok: true };
    } catch (error) {
      console.error('API call failed:', error);
      return { ok: false, error: 'Failed to connect to API' };
    }
  }
}

export const apiService = new ApiService();
