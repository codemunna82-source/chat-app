'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { resolvePublicFileUrl } from '@/lib/publicFileUrl';
import { UserAvatar } from '@/components/ui/UserAvatar';

interface StatusCardProps {
  status: any;
  index: number;
  onSelect?: (status: any) => void;
}

const StatusCard = React.memo(function StatusCard({ status, index, onSelect }: StatusCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05, ease: 'easeOut' }}
      className="bg-surface/90 rounded-2xl border border-border/50 overflow-hidden shadow-sm hover:shadow-lg transition-all duration-300 group cursor-pointer relative"
      onClick={() => onSelect?.(status)}
    >
      <div className="h-48 w-full bg-background relative overflow-hidden">
        {status.mediaType === 'image' ? (
          <img
            src={resolvePublicFileUrl(status.mediaUrl)}
            className="w-full h-full object-cover opacity-80 group-hover:opacity-100 group-hover:scale-105 transition-all duration-500"
            alt={status.caption || 'Status'}
          />
        ) : (
          <video
            src={resolvePublicFileUrl(status.mediaUrl)}
            className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity duration-300"
          />
        )}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent p-4 pb-3">
          <p className="text-white text-sm font-medium truncate">{status.caption || 'No caption'}</p>
        </div>
      </div>
      <div className="p-3 flex items-center gap-3">
        <UserAvatar
          src={status.user?.avatar}
          name={status.user?.name}
          variant="sm"
          className="h-8 w-8 border border-border/50"
          sizes="32px"
        />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-foreground font-medium truncate">{status.user.name}</p>
          <p className="text-[10px] text-muted">{new Date(status.createdAt).toLocaleString()}</p>
        </div>
      </div>
    </motion.div>
  );
});

export default StatusCard;
