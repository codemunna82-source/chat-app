'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';

type MobileChatListDrawerContextValue = {
  isOpen: boolean;
  open: () => void;
  close: () => void;
};

const MobileChatListDrawerContext = createContext<MobileChatListDrawerContextValue | null>(null);

export function MobileChatListDrawerProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  const value = useMemo(() => ({ isOpen, open, close }), [isOpen, open, close]);

  return (
    <MobileChatListDrawerContext.Provider value={value}>{children}</MobileChatListDrawerContext.Provider>
  );
}

export function useMobileChatListDrawer() {
  return useContext(MobileChatListDrawerContext);
}
