import { useEffect, useRef, useState, RefObject } from 'react';

/**
 * Hook to track if an element is visible in the viewport.
 * Useful for lazy loading messages or triggering 'load more' events.
 */
export function useIntersectionObserver(
  elementRef: RefObject<Element | null>,
  { threshold = 0.1, root = null, rootMargin = '0px', freezeOnceVisible = false } = {}
): IntersectionObserverEntry | undefined {
  const [entry, setEntry] = useState<IntersectionObserverEntry>();

  const frozen = entry?.isIntersecting && freezeOnceVisible;

  useEffect(() => {
    const node = elementRef?.current;
    if (!node || frozen) return;

    const observer = new IntersectionObserver(
      ([entry]) => setEntry(entry),
      { threshold, root, rootMargin }
    );

    observer.observe(node);

    return () => observer.disconnect();
  }, [elementRef, threshold, root, rootMargin, frozen]);

  return entry;
}
