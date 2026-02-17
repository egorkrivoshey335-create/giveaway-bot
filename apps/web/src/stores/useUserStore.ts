import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

export interface User {
  id: string;
  telegramUserId: string;
  firstName: string;
  lastName?: string;
  username?: string;
  language: 'RU' | 'EN' | 'KK';
  createdAt: string;
}

interface UserState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  
  // Actions
  setUser: (user: User | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  logout: () => void;
}

/**
 * Global user store
 * Хранит данные текущего пользователя и статус авторизации
 */
export const useUserStore = create<UserState>()(
  devtools(
    persist(
      (set) => ({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        error: null,

        setUser: (user) =>
          set({
            user,
            isAuthenticated: !!user,
            error: null,
          }),

        setLoading: (loading) =>
          set({ isLoading: loading }),

        setError: (error) =>
          set({ error, isLoading: false }),

        logout: () =>
          set({
            user: null,
            isAuthenticated: false,
            error: null,
          }),
      }),
      {
        name: 'user-storage',
        partialize: (state) => ({
          user: state.user,
          isAuthenticated: state.isAuthenticated,
        }),
      }
    ),
    { name: 'UserStore' }
  )
);
