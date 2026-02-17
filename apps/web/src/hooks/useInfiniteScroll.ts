'use client';

import { useEffect, useRef, useCallback } from 'react';

export interface UseInfiniteScrollOptions {
  /**
   * Callback вызывается когда достигнут конец списка
   */
  onLoadMore: () => void;
  
  /**
   * Есть ли ещё данные для загрузки
   */
  hasMore: boolean;
  
  /**
   * Идёт ли загрузка сейчас
   */
  isLoading: boolean;
  
  /**
   * Отступ в пикселях до конца, при котором начать загрузку
   * @default 200
   */
  threshold?: number;
  
  /**
   * Root element для IntersectionObserver
   * @default null (viewport)
   */
  root?: Element | null;
}

/**
 * Hook для infinite scroll с IntersectionObserver
 * 
 * @example
 * ```tsx
 * const loadMore = useCallback(() => {
 *   setOffset(prev => prev + 20);
 * }, []);
 * 
 * const observerRef = useInfiniteScroll({
 *   onLoadMore: loadMore,
 *   hasMore: hasMore,
 *   isLoading: isLoading,
 * });
 * 
 * return (
 *   <>
 *     {items.map(item => <Item key={item.id} {...item} />)}
 *     <div ref={observerRef} />
 *   </>
 * );
 * ```
 */
export function useInfiniteScroll({
  onLoadMore,
  hasMore,
  isLoading,
  threshold = 200,
  root = null,
}: UseInfiniteScrollOptions) {
  const observerRef = useRef<HTMLDivElement>(null);

  const handleObserver = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      const target = entries[0];
      
      if (target.isIntersecting && hasMore && !isLoading) {
        onLoadMore();
      }
    },
    [hasMore, isLoading, onLoadMore]
  );

  useEffect(() => {
    const element = observerRef.current;
    if (!element) return;

    const observer = new IntersectionObserver(handleObserver, {
      root,
      rootMargin: `${threshold}px`,
      threshold: 0,
    });

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [handleObserver, root, threshold]);

  return observerRef;
}
