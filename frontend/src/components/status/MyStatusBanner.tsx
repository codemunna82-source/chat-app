'use client';

import { Camera } from 'lucide-react';
import Image from 'next/image';

interface MyStatusBannerProps {
  user: any;
  onUploadClick: () => void;
}

export default function MyStatusBanner({ user, onUploadClick }: MyStatusBannerProps) {
  return (
    <div className="flex items-center gap-4 mb-8 bg-surface/90 p-4 rounded-2xl border border-border/50 shadow-sm transition-colors duration-300 group hover:bg-surface-hover/60">
      <div className="relative">
        <div className="w-14 h-14 relative shrink-0">
          <Image
            src={user?.avatar || 'https://icon-library.com/images/anonymous-avatar-icon/anonymous-avatar-icon-25.jpg'}
            alt="My Status"
            fill
            sizes="56px"
            className="rounded-full object-cover border-2 border-border/50 shadow-sm"
            unoptimized={user?.avatar?.includes('localhost')}
          />
        </div>
        <button
          onClick={onUploadClick}
          className="absolute bottom-0 right-0 bg-primary rounded-full p-1.5 border-2 border-surface hover:bg-primary-hover transition-all duration-300 shadow-lg hover:scale-110"
          aria-label="Add status update"
        >
          <Camera className="w-3.5 h-3.5 text-white" />
        </button>
      </div>
      <div>
        <h3 className="font-semibold text-foreground text-lg">My Status</h3>
        <p className="text-sm text-muted">Click camera to add update</p>
      </div>
    </div>
  );
}
