import { create } from 'zustand';

interface HiddenContactsState {
  hiddenContactIds: string[];
  storageKey: string | null;
  init: (userId: string) => void;
  hideContact: (contactId: string) => void;
  unhideContact: (contactId: string) => void;
  clear: () => void;
}

const buildKey = (userId: string) => `hiddenContacts:${userId}`;

const safeRead = (key: string): string[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id) => typeof id === 'string');
  } catch {
    return [];
  }
};

const safeWrite = (key: string, ids: string[]) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(ids));
  } catch {
    // Ignore storage errors
  }
};

export const useHiddenContactsStore = create<HiddenContactsState>((set, get) => ({
  hiddenContactIds: [],
  storageKey: null,
  init: (userId: string) => {
    const key = buildKey(userId);
    const existingKey = get().storageKey;
    if (existingKey === key) return;
    const ids = safeRead(key);
    set({ storageKey: key, hiddenContactIds: ids });
  },
  hideContact: (contactId: string) => {
    const state = get();
    if (!contactId) return;
    if (state.hiddenContactIds.includes(contactId)) return;
    const updated = [...state.hiddenContactIds, contactId];
    if (state.storageKey) safeWrite(state.storageKey, updated);
    set({ hiddenContactIds: updated });
  },
  unhideContact: (contactId: string) => {
    const state = get();
    if (!contactId) return;
    const updated = state.hiddenContactIds.filter((id) => id !== contactId);
    if (state.storageKey) safeWrite(state.storageKey, updated);
    set({ hiddenContactIds: updated });
  },
  clear: () => {
    const state = get();
    if (state.storageKey) safeWrite(state.storageKey, []);
    set({ hiddenContactIds: [] });
  },
}));
