import { useState, useRef } from 'react';
import { X, Camera, Save, User as UserIcon, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Input } from '@/components/ui/input';
import { useAuthStore } from '@/store/useAuthStore';
import api from '@/lib/api';
import { compressImage } from '@/utils/imageCompression';
import { createPortal } from 'react-dom';
import Image from 'next/image';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ProfileModal({ isOpen, onClose }: ProfileModalProps) {
  const { user } = useAuthStore();
  const [name, setName] = useState(user?.name || '');
  const [about, setAbout] = useState(user?.about || 'Hey there! I am using this chat app.');
  const [avatar, setAvatar] = useState(user?.avatar || '');
  const [preview, setPreview] = useState(user?.avatar || '');
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    let file = e.target.files?.[0];
    if (file) {
      if (file.type.startsWith('image/')) {
        try {
          file = await compressImage(file);
        } catch(err) {
          console.error('Image compression failed', err);
        }
      }

      const reader = new FileReader();
      reader.onloadend = () => {
        setPreview(reader.result as string);
        // Normally, you'd upload this file to a cloud storage (Cloudinary, AWS S3) and get a URL back, 
        // passing that string URL to the backend. Since this is a demo, we might store the base64 or upload to the local server.
        // The backend expects a String `avatar`. We'll pass the base64 string directly for simplicity here if it fits,
        // or we use the `/api/upload` endpoint if one exists. Let's assume there's a way. For now, base64.
        setAvatar(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await api.put('/users/profile', {
        name,
        about,
        avatar
      });
      // Updating auth store user (login acts as generic set user here if structured properly)
      // Actually we just set the user
      useAuthStore.setState({ user: data });
      onClose();
    } catch (error) {
      console.error('Failed to update profile', error);
      alert('Failed to update profile');
    } finally {
      setLoading(false);
    }
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
            className="relative w-full max-w-md bg-surface border border-border/50 rounded-3xl shadow-2xl overflow-hidden"
          >
            {/* Header Area (Gradient) */}
            <div className="h-32 bg-gradient-to-br from-primary to-primary-hover relative">
              <button 
                onClick={onClose}
                className="absolute top-4 right-4 p-2 bg-black/20 text-white rounded-full hover:bg-black/40 transition-colors backdrop-blur-md"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-8 pb-8">
              {/* Avatar Section */}
              <div className="relative -mt-16 mb-6 flex justify-center">
                <div className="relative group cursor-pointer">
                  <div className="w-32 h-32 relative">
                    <Image 
                      src={preview || "https://icon-library.com/images/anonymous-avatar-icon/anonymous-avatar-icon-25.jpg"} 
                      alt="Profile" 
                      fill
                      sizes="128px"
                      className="rounded-full object-cover border-4 border-surface shadow-xl bg-surface"
                      unoptimized={preview.includes('localhost') || preview.startsWith('data:')}
                    />
                  </div>
                  <div 
                    onClick={() => fileInputRef.current?.click()}
                    className="absolute inset-0 bg-black/50 rounded-full flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Camera className="w-8 h-8 text-white mb-1" />
                    <span className="text-white text-xs font-medium uppercase tracking-wider">Change</span>
                  </div>
                  <input 
                    type="file" 
                    className="hidden" 
                    ref={fileInputRef} 
                    accept="image/*" 
                    onChange={handleImageChange}
                  />
                </div>
              </div>

              {/* Form Fields */}
              <form onSubmit={handleSave} className="space-y-5">
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted mb-2 block ml-1">Display Name</label>
                  <div className="relative">
                    <UserIcon className="w-5 h-5 text-muted absolute left-4 top-1/2 -translate-y-1/2" />
                    <Input 
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="h-12 glass-input rounded-2xl pl-12 pr-4 text-[15px] font-medium transition-all focus:ring-2 focus:ring-primary/50"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted mb-2 block ml-1">About Info</label>
                  <div className="relative">
                    <textarea 
                      value={about}
                      onChange={(e) => setAbout(e.target.value)}
                      rows={3}
                      className="w-full glass-input rounded-2xl p-4 text-[15px] font-medium resize-none transition-all focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground"
                      placeholder="Hey there! I am using this chat app."
                    />
                  </div>
                </div>

                <div className="pt-2">
                  <button 
                    type="submit" 
                    disabled={loading}
                    className="w-full h-12 bg-primary hover:bg-primary-hover text-white rounded-2xl font-semibold shadow-md flex items-center justify-center gap-2 transition-all disabled:opacity-70"
                  >
                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                    Save Changes
                  </button>
                </div>
              </form>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
