'use client';

import { Skeleton } from '@/components/ui/skeleton';

export default function ChatListSkeleton() {
  return (
    <div className="px-3 py-2 space-y-3">
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <div key={i} className="flex items-center gap-3 p-2">
          <Skeleton className="w-12 h-12 rounded-full flex-shrink-0 bg-border/40" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-2/3 bg-border/40" />
            <Skeleton className="h-3 w-1/2 bg-border/40" />
          </div>
        </div>
      ))}
    </div>
  );
}
