'use client';

import { Component, ErrorInfo, ReactNode } from 'react';
import { Button } from './ui/Button';
import { Mascot } from './Mascot';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
}

/**
 * Error Boundary для отлова ошибок рендеринга
 * 
 * @example
 * ```tsx
 * <ErrorBoundary>
 *   <YourApp />
 * </ErrorBoundary>
 * ```
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Логируем в консоль в dev режиме
    if (process.env.NODE_ENV === 'development') {
      console.error('ErrorBoundary caught an error:', error, errorInfo);
    }

    // В production отправляем в Sentry
    if (process.env.NODE_ENV === 'production' && typeof window !== 'undefined') {
      // Sentry будет подхвачен автоматически через instrumentation
      console.error('Error caught by boundary:', error);
    }

    this.setState({
      error,
      errorInfo,
    });
  }

  handleReload = () => {
    this.setState({ hasError: false, error: undefined, errorInfo: undefined });
    window.location.reload();
  };

  handleReport = () => {
    // Открываем Telegram бот для поддержки
    const tg = window.Telegram?.WebApp;
    if (tg) {
      tg.openTelegramLink('https://t.me/Cosmolex_bot');
    } else {
      window.open('https://t.me/Cosmolex_bot', '_blank');
    }
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-tg-bg">
          <div className="max-w-md w-full text-center">
            {/* Маскот */}
            <div className="mb-4 flex justify-center">
              <Mascot type="state-error" size={150} loop={false} autoplay />
            </div>

            {/* Заголовок */}
            <h1 className="text-2xl font-bold text-tg-text mb-4">
              Что-то пошло не так
            </h1>

            {/* Описание */}
            <p className="text-tg-hint mb-8">
              Произошла неожиданная ошибка. Мы уже получили уведомление и работаем над исправлением.
            </p>

            {/* Детали ошибки (только в dev) */}
            {process.env.NODE_ENV === 'development' && this.state.error && (
              <details className="mb-8 text-left bg-red-50 p-4 rounded-xl">
                <summary className="cursor-pointer font-semibold text-red-700 mb-2">
                  Детали ошибки (dev mode)
                </summary>
                <pre className="text-xs text-red-900 whitespace-pre-wrap overflow-auto max-h-48">
                  {this.state.error.toString()}
                  {this.state.errorInfo && (
                    <>
                      {'\n\n'}
                      {this.state.errorInfo.componentStack}
                    </>
                  )}
                </pre>
              </details>
            )}

            {/* Кнопки */}
            <div className="flex flex-col gap-3">
              <Button
                variant="primary"
                fullWidth
                onClick={this.handleReload}
              >
                🔄 Перезагрузить приложение
              </Button>

              <Button
                variant="outline"
                fullWidth
                onClick={this.handleReport}
              >
                📧 Сообщить об ошибке
              </Button>
            </div>

            {/* Дополнительная информация */}
            <p className="text-xs text-tg-hint mt-6">
              Код ошибки: {this.state.error?.name || 'Unknown'}
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
