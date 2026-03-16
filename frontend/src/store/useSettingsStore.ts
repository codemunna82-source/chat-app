import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SettingsState {
  soundEnabled: boolean;
  notificationsEnabled: boolean;
  readReceipts: boolean;
  autoDownloadMedia: boolean;
  setSoundEnabled: (enabled: boolean) => void;
  setNotificationsEnabled: (enabled: boolean) => void;
  setReadReceipts: (enabled: boolean) => void;
  setAutoDownloadMedia: (enabled: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      soundEnabled: true,
      notificationsEnabled: true,
      readReceipts: true,
      autoDownloadMedia: true,
      setSoundEnabled: (enabled) => set({ soundEnabled: enabled }),
      setNotificationsEnabled: (enabled) => set({ notificationsEnabled: enabled }),
      setReadReceipts: (enabled) => set({ readReceipts: enabled }),
      setAutoDownloadMedia: (enabled) => set({ autoDownloadMedia: enabled }),
    }),
    {
      name: 'user-settings',
    }
  )
);
