import { create } from 'zustand';

// =============================================================================
// Types
// =============================================================================

export interface ApiLogEntry {
  id: string;
  method: string;
  url: string;
  status: number | null;
  ok: boolean;
  durationMs: number;
  timestamp: Date;
  requestBody?: string;
  responseBody?: string;
  error?: string;
}

export interface ErrorLogEntry {
  id: string;
  message: string;
  source?: string;
  lineno?: number;
  stack?: string;
  timestamp: Date;
  type: 'runtime' | 'unhandled_rejection' | 'console';
}

interface DebugState {
  apiLog: ApiLogEntry[];
  errorLog: ErrorLogEntry[];
  isInterceptingFetch: boolean;

  logApiRequest: (entry: ApiLogEntry) => void;
  logError: (entry: ErrorLogEntry) => void;
  clearApiLog: () => void;
  clearErrorLog: () => void;
  clearAll: () => void;
  setIntercepting: (value: boolean) => void;
}

const MAX_API_ENTRIES = 50;
const MAX_ERROR_ENTRIES = 30;

export const useDebugStore = create<DebugState>()((set) => ({
  apiLog: [],
  errorLog: [],
  isInterceptingFetch: false,

  logApiRequest: (entry) =>
    set((state) => ({
      apiLog: [entry, ...state.apiLog].slice(0, MAX_API_ENTRIES),
    })),

  logError: (entry) =>
    set((state) => ({
      errorLog: [entry, ...state.errorLog].slice(0, MAX_ERROR_ENTRIES),
    })),

  clearApiLog: () => set({ apiLog: [] }),
  clearErrorLog: () => set({ errorLog: [] }),
  clearAll: () => set({ apiLog: [], errorLog: [] }),
  setIntercepting: (value) => set({ isInterceptingFetch: value }),
}));
