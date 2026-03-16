import { useEffect, useRef, useState } from 'react';

/**
 * Custom hook that throttles a value.
 * Useful for high-frequency events like scrolling or visualizers.
 * 
 * @param value The value to throttle
 * @param interval The interval in milliseconds
 * @returns The throttled value
 */
export function useThrottle<T>(value: T, interval: number): T {
  const [throttledValue, setThrottledValue] = useState<T>(value);
  const lastUpdated = useRef<number>(Date.now());

  useEffect(() => {
    const now = Date.now();
    if (now - lastUpdated.current >= interval) {
      lastUpdated.current = now;
      setThrottledValue(value);
    } else {
      const id = setTimeout(() => {
        lastUpdated.current = Date.now();
        setThrottledValue(value);
      }, interval - (now - lastUpdated.current));
      return () => clearTimeout(id);
    }
  }, [value, interval]);

  return throttledValue;
}
