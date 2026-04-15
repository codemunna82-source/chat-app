'use client';

import { Camera } from 'lucide-react';
import { UserAvatar } from '@/components/ui/UserAvatar';

interface MyStatusBannerProps {
  user: any;
  onUploadClick: () => void;
}

export default function MyStatusBanner({ user, onUploadClick }: MyStatusBannerProps) {
  return (
    <div className="flex items-center gap-4 mb-8 bg-surface/90 p-4 rounded-2xl border border-border/50 shadow-sm transition-colors duration-300 group hover:bg-surface-hover/60">
      <div className="relative">
        <UserAvatar
          src={user?.avatar}
          name={user?.name}
          variant="md"
          className="h-14 w-14 border-2 border-border/50 shadow-sm"
          sizes="56px"
        />
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
