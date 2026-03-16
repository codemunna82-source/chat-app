import { useEffect, useRef, useState, useCallback } from 'react';
import { Socket } from 'socket.io-client';

/**
 * Hook to optimize socket event handling by batching rapid updates.
 * Prevents UI stuttering when multiple messages or typing events arrive simultaneously.
 */
export function useSocketPerformance(socket: Socket | null) {
  const [lastEvent, setLastEvent] = useState<{ type: string; data: any } | null>(null);
  const eventQueue = useRef<any[]>([]);
  const processingRef = useRef(false);

  const processQueue = useCallback(() => {
    if (eventQueue.current.length === 0) {
      processingRef.current = false;
      return;
    }

    processingRef.current = true;
    const batch = [...eventQueue.current];
    eventQueue.current = [];

    // Process only the latest event for specific high-frequency types (like typing)
    // but keep all for 'message' types.
    const latestMessage = batch.reverse().find(e => e.type === 'message received') || batch[0];
    
    if (latestMessage) {
        setLastEvent(latestMessage);
    }

    requestAnimationFrame(() => {
        processQueue();
    });
  }, []);

  const queueEvent = useCallback((type: string, data: any) => {
    eventQueue.current.push({ type, data });
    if (!processingRef.current) {
      processQueue();
    }
  }, [processQueue]);

  return { lastEvent, queueEvent };
}
