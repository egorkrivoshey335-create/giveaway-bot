import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

export interface DraftPayload {
  // Type
  type?: 'STANDARD' | 'BOOST_REQUIRED' | 'INVITE_REQUIRED' | 'CUSTOM';
  
  // Basics
  title?: string;
  language?: 'RU' | 'EN' | 'KK';
  postTemplateId?: string;
  buttonText?: string;
  
  // Channels
  subscriptionChannelIds?: string[];
  publishChannelIds?: string[];
  resultsChannelIds?: string[];
  resultsInStartPost?: boolean;
  
  // Dates
  startAt?: string;
  endAt?: string;
  startImmediately?: boolean;
  
  // Winners
  winnersCount?: number;
  
  // Extras
  boostEnabled?: boolean;
  boostChannelIds?: string[];
  inviteEnabled?: boolean;
  inviteMaxCount?: number;
  storiesEnabled?: boolean;
  
  // Protection
  captchaMode?: 'OFF' | 'SUSPICIOUS_ONLY' | 'ALL';
  livenessEnabled?: boolean;
  
  // Custom tasks
  customTasks?: Array<{
    description: string;
    url: string;
  }>;
  
  // Mascot & Promo
  mascotId?: string;
  catalogPromotionEnabled?: boolean;
}

interface DraftState {
  currentStep: number;
  payload: DraftPayload;
  isDirty: boolean;
  lastSavedAt: string | null;
  
  // Actions
  setStep: (step: number) => void;
  updatePayload: (data: Partial<DraftPayload>) => void;
  clearDraft: () => void;
  markSaved: () => void;
  loadDraft: (step: number, payload: DraftPayload) => void;
}

/**
 * Draft store для wizard создания розыгрыша
 * Сохраняет прогресс локально и синхронизируется с API
 */
export const useDraftStore = create<DraftState>()(
  devtools(
    persist(
      (set) => ({
        currentStep: 1,
        payload: {},
        isDirty: false,
        lastSavedAt: null,

        setStep: (step) =>
          set({ currentStep: step }),

        updatePayload: (data) =>
          set((state) => ({
            payload: { ...state.payload, ...data },
            isDirty: true,
          })),

        clearDraft: () =>
          set({
            currentStep: 1,
            payload: {},
            isDirty: false,
            lastSavedAt: null,
          }),

        markSaved: () =>
          set({
            isDirty: false,
            lastSavedAt: new Date().toISOString(),
          }),

        loadDraft: (step, payload) =>
          set({
            currentStep: step,
            payload,
            isDirty: false,
            lastSavedAt: new Date().toISOString(),
          }),
      }),
      {
        name: 'draft-storage',
      }
    ),
    { name: 'DraftStore' }
  )
);
