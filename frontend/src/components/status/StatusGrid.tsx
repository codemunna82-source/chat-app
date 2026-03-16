'use client';

import { CircleDot } from 'lucide-react';
import StatusCard from './StatusCard';

interface StatusGridProps {
  statuses: any[];
  onSelectStatus?: (status: any) => void;
}

export default function StatusGrid({ statuses, onSelectStatus }: StatusGridProps) {
  return (
    <div className="mb-6">
      <h4 className="text-xs font-semibold text-muted uppercase tracking-widest mb-4 px-2">Recent Updates</h4>

      {statuses.length === 0 ? (
        <div className="p-12 text-center">
          <div className="w-16 h-16 bg-surface rounded-full flex items-center justify-center mx-auto mb-4 shadow-inner border border-border/50">
            <CircleDot className="w-8 h-8 text-muted/50" />
          </div>
          <p className="text-muted text-sm font-medium">No recent updates</p>
          <p className="text-muted/60 text-xs mt-1">Status updates from contacts will appear here</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {statuses.map((s, index) => (
            <StatusCard key={s._id} status={s} index={index} onSelect={onSelectStatus} />
          ))}
        </div>
      )}
    </div>
  );
}
