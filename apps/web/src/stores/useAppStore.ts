import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

interface AppState {
  // UI State
  isBottomSheetOpen: boolean;
  bottomSheetContent: React.ReactNode | null;
  
  // Toast
  toastMessage: string | null;
  toastType: 'success' | 'error' | 'warning' | 'info';
  
  // Loading
  globalLoading: boolean;
  loadingMessage: string | null;
  
  // Deep link
  pendingDeepLink: string | null;
  
  // Actions
  openBottomSheet: (content: React.ReactNode) => void;
  closeBottomSheet: () => void;
  showToast: (message: string, type?: 'success' | 'error' | 'warning' | 'info') => void;
  hideToast: () => void;
  setGlobalLoading: (loading: boolean, message?: string) => void;
  setPendingDeepLink: (link: string | null) => void;
}

/**
 * Global app store
 * Управляет глобальным состоянием UI (модалки, toast, loading)
 */
export const useAppStore = create<AppState>()(
  devtools(
    (set) => ({
      // Initial state
      isBottomSheetOpen: false,
      bottomSheetContent: null,
      toastMessage: null,
      toastType: 'info',
      globalLoading: false,
      loadingMessage: null,
      pendingDeepLink: null,

      // Actions
      openBottomSheet: (content) =>
        set({
          isBottomSheetOpen: true,
          bottomSheetContent: content,
        }),

      closeBottomSheet: () =>
        set({
          isBottomSheetOpen: false,
          bottomSheetContent: null,
        }),

      showToast: (message, type = 'info') =>
        set({
          toastMessage: message,
          toastType: type,
        }),

      hideToast: () =>
        set({ toastMessage: null }),

      setGlobalLoading: (loading, message) =>
        set({
          globalLoading: loading,
          loadingMessage: message || null,
        }),

      setPendingDeepLink: (link) =>
        set({ pendingDeepLink: link }),
    }),
    { name: 'AppStore' }
  )
);
