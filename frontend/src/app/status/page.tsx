'use client';

import { useState, useEffect, useRef } from 'react';
import MainLayout from '@/components/MainLayout';
import { CircleDot } from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';
import api from '@/lib/api';
import MyStatusBanner from '@/components/status/MyStatusBanner';
import StatusGrid from '@/components/status/StatusGrid';
import StatusUploadModal from '@/components/status/StatusUploadModal';
import StatusViewerModal from '@/components/status/StatusViewerModal';

export default function StatusPage() {
  const { user } = useAuthStore();
  const [statuses, setStatuses] = useState<any[]>([]);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [media, setMedia] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<any | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchStatuses = async () => {
    try {
      const { data } = await api.get('/status');
      setStatuses(data);
    } catch (error) {
      console.error('Failed to load statuses', error);
    }
  };

  useEffect(() => {
    fetchStatuses();
  }, []);

  const handleMediaChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setMedia(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setMediaPreview(reader.result as string);
        setUploadModalOpen(true);
      };
      reader.readAsDataURL(file);
    }
  };

  const uploadStatus = async () => {
    if (!media) return;
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('media', media);
      formData.append('caption', caption);
      if (media.type.startsWith('image/')) formData.append('mediaType', 'image');
      if (media.type.startsWith('video/')) formData.append('mediaType', 'video');

      await api.post('/status', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      closeUploadModal();
      fetchStatuses();
    } catch (error) {
      console.error('Upload failed');
    } finally {
      setIsUploading(false);
    }
  };

  const closeUploadModal = () => {
    setUploadModalOpen(false);
    setMedia(null);
    setMediaPreview(null);
    setCaption('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const openStatusViewer = (status: any) => {
    setSelectedStatus(status);
    setViewerOpen(true);
  };

  const closeStatusViewer = () => {
    setViewerOpen(false);
    setSelectedStatus(null);
  };

  return (
    <MainLayout>
      <div className="h-16 border-b border-border/60 flex items-center justify-between px-6 bg-surface/85 backdrop-blur-xl shadow-sm z-10 transition-colors duration-300">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-xl">
            <CircleDot className="w-5 h-5 text-primary" />
          </div>
          <h2 className="text-xl font-bold text-foreground tracking-tight">Status</h2>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 md:p-10 max-w-4xl mx-auto w-full pb-20">
        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          accept="image/*,video/*"
          onChange={handleMediaChange}
        />

        <MyStatusBanner user={user} onUploadClick={() => fileInputRef.current?.click()} />
        <StatusGrid statuses={statuses} onSelectStatus={openStatusViewer} />
      </div>

      <StatusUploadModal
        isOpen={uploadModalOpen}
        media={media}
        mediaPreview={mediaPreview}
        caption={caption}
        isUploading={isUploading}
        onCaptionChange={setCaption}
        onUpload={uploadStatus}
        onClose={closeUploadModal}
      />

      <StatusViewerModal
        isOpen={viewerOpen}
        status={selectedStatus}
        onClose={closeStatusViewer}
      />
    </MainLayout>
  );
}
