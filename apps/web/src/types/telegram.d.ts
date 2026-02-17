/**
 * Типы для Telegram WebApp API
 * Полная типизация всех доступных методов и свойств
 */

export interface SafeAreaInset {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface ThemeParams {
  bg_color?: string;
  text_color?: string;
  hint_color?: string;
  link_color?: string;
  button_color?: string;
  button_text_color?: string;
  secondary_bg_color?: string;
  header_bg_color?: string;
  accent_text_color?: string;
  section_bg_color?: string;
  section_header_text_color?: string;
  subtitle_text_color?: string;
  destructive_text_color?: string;
}

export interface MainButton {
  text: string;
  color: string;
  textColor: string;
  isVisible: boolean;
  isActive: boolean;
  isProgressVisible: boolean;
  setText(text: string): void;
  onClick(callback: () => void): void;
  offClick(callback: () => void): void;
  show(): void;
  hide(): void;
  enable(): void;
  disable(): void;
  showProgress(leaveActive?: boolean): void;
  hideProgress(): void;
  setParams(params: {
    text?: string;
    color?: string;
    text_color?: string;
    is_active?: boolean;
    is_visible?: boolean;
  }): void;
}

export interface BackButton {
  isVisible: boolean;
  onClick(callback: () => void): void;
  offClick(callback: () => void): void;
  show(): void;
  hide(): void;
}

export interface HapticFeedback {
  impactOccurred(style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'): void;
  notificationOccurred(type: 'error' | 'success' | 'warning'): void;
  selectionChanged(): void;
}

export interface CloudStorage {
  setItem(key: string, value: string, callback?: (error: string | null, success: boolean) => void): void;
  getItem(key: string, callback: (error: string | null, value: string | null) => void): void;
  getItems(keys: string[], callback: (error: string | null, values: Record<string, string>) => void): void;
  removeItem(key: string, callback?: (error: string | null, success: boolean) => void): void;
  removeItems(keys: string[], callback?: (error: string | null, success: boolean) => void): void;
  getKeys(callback: (error: string | null, keys: string[]) => void): void;
}

export interface TelegramWebApp {
  // Properties
  initData: string;
  initDataUnsafe: {
    query_id?: string;
    user?: {
      id: number;
      first_name: string;
      last_name?: string;
      username?: string;
      language_code?: string;
      is_premium?: boolean;
      photo_url?: string;
    };
    receiver?: {
      id: number;
      first_name: string;
      last_name?: string;
      username?: string;
      language_code?: string;
      is_premium?: boolean;
      photo_url?: string;
    };
    chat?: {
      id: number;
      type: string;
      title: string;
      username?: string;
      photo_url?: string;
    };
    chat_type?: string;
    chat_instance?: string;
    start_param?: string;
    can_send_after?: number;
    auth_date: number;
    hash: string;
  };
  version: string;
  platform: string;
  colorScheme: 'light' | 'dark';
  themeParams: ThemeParams;
  isExpanded: boolean;
  viewportHeight: number;
  viewportStableHeight: number;
  isClosingConfirmationEnabled: boolean;
  headerColor: string;
  backgroundColor: string;
  bottomBarColor: string;
  safeAreaInset: SafeAreaInset;
  contentSafeAreaInset: SafeAreaInset;
  isFullscreen: boolean;
  isOrientationLocked: boolean;
  
  // Components
  MainButton: MainButton;
  BackButton: BackButton;
  HapticFeedback: HapticFeedback;
  CloudStorage: CloudStorage;
  
  // Methods
  ready(): void;
  expand(): void;
  close(): void;
  enableClosingConfirmation(): void;
  disableClosingConfirmation(): void;
  setHeaderColor(color: string): void;
  setBackgroundColor(color: string): void;
  setBottomBarColor(color: string): void;
  requestFullscreen(): void;
  exitFullscreen(): void;
  lockOrientation(): void;
  unlockOrientation(): void;
  isVersionAtLeast(version: string): boolean;
  
  // Popups
  showPopup(params: {
    title?: string;
    message: string;
    buttons?: Array<{
      id?: string;
      type?: 'default' | 'ok' | 'close' | 'cancel' | 'destructive';
      text?: string;
    }>;
  }, callback?: (buttonId: string) => void): void;
  
  showAlert(message: string, callback?: () => void): void;
  showConfirm(message: string, callback?: (confirmed: boolean) => void): void;
  
  showScanQrPopup(params: {
    text?: string;
  }, callback?: (data: string) => void): void;
  
  closeScanQrPopup(): void;
  
  // Events
  onEvent(eventType: string, callback: (...args: any[]) => void): void;
  offEvent(eventType: string, callback: (...args: any[]) => void): void;
  
  // Utils
  sendData(data: string): void;
  switchInlineQuery(query: string, chatTypes?: string[]): void;
  openLink(url: string, options?: { try_instant_view?: boolean }): void;
  openTelegramLink(url: string): void;
  openInvoice(url: string, callback?: (status: string) => void): void;
  
  // Web App specific
  shareToStory(media_url: string, params?: {
    text?: string;
    widget_link?: {
      url: string;
      name?: string;
    };
  }): void;
  
  downloadFile(params: {
    url: string;
    file_name: string;
  }, callback?: (success: boolean, error?: string) => void): void;
  
  requestWriteAccess(callback?: (granted: boolean) => void): void;
  requestContact(callback?: (shared: boolean) => void): void;
  
  readTextFromClipboard(callback?: (text: string | null) => void): void;
  
  // BiometricManager (Bot API 7.2+)
  BiometricManager?: {
    isInited: boolean;
    isBiometricAvailable: boolean;
    biometricType: 'finger' | 'face' | 'unknown';
    isAccessRequested: boolean;
    isAccessGranted: boolean;
    isBiometricTokenSaved: boolean;
    deviceId: string;
    init(callback?: () => void): void;
    requestAccess(params: { reason?: string }, callback?: (granted: boolean) => void): void;
    authenticate(params: { reason?: string }, callback?: (success: boolean, biometricToken?: string) => void): void;
    updateBiometricToken(token: string, callback?: (success: boolean) => void): void;
    openSettings(): void;
  };
}

declare global {
  interface Window {
    Telegram?: {
      WebApp: TelegramWebApp;
    };
  }
}

export {};
