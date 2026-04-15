'use client';

import { PhoneCall, Trash2 } from 'lucide-react';

interface CallsHeaderProps {
  canClear: boolean;
  isClearing?: boolean;
  onClearAll: () => void;
}

export default function CallsHeader({ canClear, isClearing = false, onClearAll }: CallsHeaderProps) {
  return (
    <div className="z-10 flex h-16 shrink-0 items-center justify-between border-b border-border/60 bg-surface/85 px-4 shadow-sm backdrop-blur-xl transition-colors duration-300 sm:px-6">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-primary/10 rounded-xl">
          <PhoneCall className="w-5 h-5 text-primary" />
        </div>
        <h2 className="text-xl font-bold text-foreground tracking-tight">Calls</h2>
      </div>
      <button
        onClick={onClearAll}
        disabled={!canClear || isClearing}
        className="inline-flex items-center gap-2 h-9 px-3 rounded-2xl border border-border/60 text-sm font-medium text-muted hover:text-red-500 hover:border-red-500/40 hover:bg-red-500/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        aria-label="Clear all call history"
        title="Clear all call history"
      >
        <Trash2 className="w-4 h-4" />
        {isClearing ? 'Clearing...' : 'Clear All'}
      </button>
    </div>
  );
}
