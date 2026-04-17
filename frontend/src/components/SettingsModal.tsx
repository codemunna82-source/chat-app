'use client';

import { useState } from 'react';
import { X, Moon, Sun, Bell, Volume2, Shield, CircleSlash, Database, Monitor, ChevronRight, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from 'next-themes';
import { createPortal } from 'react-dom';
import { useSettingsStore } from '@/store/useSettingsStore';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const { theme, setTheme } = useTheme();
  
  const { 
      soundEnabled, setSoundEnabled, 
      notificationsEnabled, setNotificationsEnabled,
      readReceipts, setReadReceipts,
      autoDownloadMedia, setAutoDownloadMedia
  } = useSettingsStore();

  const [activeTab, setActiveTab] = useState('appearance');

  const [cacheCleared, setCacheCleared] = useState(false);

  const handleClearCache = async () => {
      try {
          if ('caches' in window) {
              const names = await window.caches.keys();
              await Promise.all(names.map(name => window.caches.delete(name)));
          }
      } catch (e) {
          console.error("Failed to clear cache:", e);
      }
      setCacheCleared(true);
      setTimeout(() => setCacheCleared(false), 3000);
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />

          {/* Modal */}
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-xl sm:max-w-3xl h-[85vh] sm:h-[80vh] min-h-[70vh] sm:min-h-[500px] flex flex-col sm:flex-row overflow-hidden bg-surface border border-border/50 rounded-2xl sm:rounded-3xl shadow-2xl"
          >
            {/* Settings Sidebar */}
            <div className="w-full sm:w-1/3 border-b sm:border-b-0 sm:border-r border-border/50 bg-background/50 flex flex-col sm:max-w-xs">
              <div className="px-5 sm:px-6 py-4 sm:py-5 border-b border-border/50 flex items-center justify-between">
                  <h2 className="text-lg sm:text-xl font-bold text-foreground">Settings</h2>
                  <button 
                    onClick={onClose}
                    className="sm:hidden p-2 rounded-full text-muted hover:text-foreground hover:bg-surface-hover transition-colors"
                    aria-label="Close settings"
                  >
                    <X className="w-5 h-5" />
                  </button>
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-1 sm:space-y-0 sm:p-4">
                  {[
                    { id: 'appearance', icon: Monitor, label: 'Appearance' },
                    { id: 'notifications', icon: Bell, label: 'Notifications' },
                    { id: 'privacy', icon: Shield, label: 'Privacy & Security' },
                    { id: 'storage', icon: Database, label: 'Storage & Data' },
                  ].map((item, i) => (
                      <button 
                          key={i}
                          onClick={() => setActiveTab(item.id)}
                          className={`w-full flex items-center justify-between p-3 rounded-xl transition-all ${activeTab === item.id ? 'bg-primary/10 text-primary font-medium' : 'text-foreground hover:bg-surface-hover hover:text-primary'}`}
                      >
                          <div className="flex items-center gap-3">
                              <item.icon className="w-5 h-5" />
                              {item.label}
                          </div>
                      </button>
                  ))}
              </div>
            </div>

            {/* Settings Content Area */}
            <div className="flex-1 flex flex-col bg-surface overflow-hidden">
              <div className="h-16 flex items-center justify-between px-6 border-b border-border/50">
                  <h3 className="font-semibold text-foreground capitalize">{activeTab.replace('-', ' ')}</h3>
                  <button 
                      onClick={onClose}
                      className="p-2 text-muted hover:text-foreground hover:bg-surface-hover rounded-full transition-colors"
                  >
                      <X className="w-5 h-5" />
                  </button>
              </div>
              
              <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 sm:space-y-8">
                  
                  {activeTab === 'appearance' && (
                  <section>
                      <h4 className="text-sm font-semibold uppercase tracking-wider text-primary mb-4">Theme Preferences</h4>
                      <div className="grid grid-cols-2 gap-4">
                          <button 
                              onClick={() => setTheme('light')}
                              className={`flex flex-col items-center gap-3 p-4 rounded-2xl border-2 transition-all ${theme === 'light' ? 'border-primary bg-primary/5' : 'border-border/50 hover:border-primary/50 bg-background'}`}
                          >
                              <Sun className={`w-8 h-8 ${theme === 'light' ? 'text-primary' : 'text-muted'}`} />
                              <span className="font-medium">Light Mode</span>
                          </button>
                          <button 
                              onClick={() => setTheme('dark')}
                              className={`flex flex-col items-center gap-3 p-4 rounded-2xl border-2 transition-all ${theme === 'dark' ? 'border-primary bg-primary/5' : 'border-border/50 hover:border-primary/50 bg-background'}`}
                          >
                              <Moon className={`w-8 h-8 ${theme === 'dark' ? 'text-primary' : 'text-muted'}`} />
                              <span className="font-medium">Dark Mode</span>
                          </button>
                      </div>
                  </section>
                  )}

                  {activeTab === 'notifications' && (
                  <section>
                      <h4 className="text-sm font-semibold uppercase tracking-wider text-primary mb-4">Chat Notifications</h4>
                      <div className="space-y-4">
                          <div className="flex items-center justify-between p-4 bg-background rounded-2xl border border-border/50">
                              <div>
                                  <p className="font-medium text-foreground">Push Notifications</p>
                                  <p className="text-sm text-muted">Toggle local alert UI states</p>
                              </div>
                              <button 
                                  onClick={() => setNotificationsEnabled(!notificationsEnabled)}
                                  className={`w-12 h-6 rounded-full transition-colors relative ${notificationsEnabled ? 'bg-primary' : 'bg-surface-hover'}`}
                              >
                                  <span className={`absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-transform ${notificationsEnabled ? 'translate-x-6' : 'translate-x-0'}`} />
                              </button>
                          </div>

                          <div className="flex items-center justify-between p-4 bg-background rounded-2xl border border-border/50">
                              <div>
                                  <p className="font-medium text-foreground">In-App Sounds</p>
                                  <p className="text-sm text-muted">Play sound on new message receipt</p>
                              </div>
                              <button 
                                  onClick={() => setSoundEnabled(!soundEnabled)}
                                  className={`w-12 h-6 rounded-full transition-colors relative ${soundEnabled ? 'bg-primary' : 'bg-surface-hover'}`}
                              >
                                  <span className={`absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-transform ${soundEnabled ? 'translate-x-6' : 'translate-x-0'}`} />
                              </button>
                          </div>
                      </div>
                  </section>
                  )}

                  {activeTab === 'privacy' && (
                  <section>
                      <h4 className="text-sm font-semibold uppercase tracking-wider text-primary mb-4">Privacy & Security</h4>
                      <div className="space-y-4">
                          <div className="flex items-center justify-between p-4 bg-background rounded-2xl border border-border/50">
                              <div>
                                  <p className="font-medium text-foreground">Read Receipts</p>
                                  <p className="text-sm text-muted">Let others know when you've read their messages</p>
                              </div>
                              <button 
                                  onClick={() => setReadReceipts(!readReceipts)}
                                  className={`w-12 h-6 rounded-full transition-colors relative ${readReceipts ? 'bg-primary' : 'bg-surface-hover'}`}
                              >
                                  <span className={`absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-transform ${readReceipts ? 'translate-x-6' : 'translate-x-0'}`} />
                              </button>
                          </div>

                          <div className="flex items-center justify-between p-4 bg-background rounded-2xl border border-border/50 opacity-50 cursor-not-allowed">
                              <div className="flex items-center gap-3">
                                  <div className="p-2 bg-red-500/10 rounded-full text-red-500">
                                      <CircleSlash className="w-5 h-5" />
                                  </div>
                                  <div>
                                      <p className="font-medium text-foreground">Blocked Contacts</p>
                                      <p className="text-sm text-muted">Manage users you have blocked</p>
                                  </div>
                              </div>
                              <ChevronRight className="w-5 h-5 text-muted" />
                          </div>
                      </div>
                  </section>
                  )}

                  {activeTab === 'storage' && (
                  <section>
                      <h4 className="text-sm font-semibold uppercase tracking-wider text-primary mb-4">Storage & Data</h4>
                      <div className="space-y-4">
                          <div className="flex items-center justify-between p-4 bg-background rounded-2xl border border-border/50">
                              <div>
                                  <p className="font-medium text-foreground">Auto-Download Media</p>
                                  <p className="text-sm text-muted">Automatically save photos and videos</p>
                              </div>
                              <button 
                                  onClick={() => setAutoDownloadMedia(!autoDownloadMedia)}
                                  className={`w-12 h-6 rounded-full transition-colors relative ${autoDownloadMedia ? 'bg-primary' : 'bg-surface-hover'}`}
                              >
                                  <span className={`absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-transform ${autoDownloadMedia ? 'translate-x-6' : 'translate-x-0'}`} />
                              </button>
                          </div>

                          <button 
                              onClick={handleClearCache}
                              className="w-full flex items-center justify-between p-4 bg-background hover:bg-red-500/10 hover:border-red-500/30 rounded-2xl border border-border/50 transition-colors group"
                          >
                              <div className="flex items-center gap-3 text-left">
                                  <div className="p-2 bg-surface rounded-full text-muted group-hover:text-red-500 transition-colors">
                                      <Trash2 className="w-5 h-5" />
                                  </div>
                                  <div>
                                      <p className="font-medium text-foreground group-hover:text-red-500 transition-colors">Clear Local Cache</p>
                                      <p className="text-sm text-muted">Free up space on this device. Logs will stay.</p>
                                  </div>
                              </div>
                              {cacheCleared ? (
                                  <span className="text-sm text-green-500 font-medium">Cleared!</span>
                              ) : (
                                  <ChevronRight className="w-5 h-5 text-muted group-hover:text-red-500 transition-colors" />
                              )}
                          </button>
                      </div>
                  </section>
                  )}

              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
