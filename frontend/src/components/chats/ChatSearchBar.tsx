'use client';

import { Search } from 'lucide-react';

interface ChatSearchBarProps {
  search: string;
  onSearchChange: (value: string) => void;
}

export default function ChatSearchBar({ search, onSearchChange }: ChatSearchBarProps) {
  return (
    <div className="p-4 bg-transparent border-b border-border/50">
      <div className="relative flex items-center glass-input rounded-3xl px-4 py-2.5 group">
        <Search className="w-5 h-5 text-muted group-focus-within:text-primary transition-colors duration-300" />
        <input
          type="text"
          placeholder="Search or start new chat"
          className="w-full bg-transparent border-none focus:outline-none text-foreground ml-3 placeholder-muted text-sm font-medium"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>
    </div>
  );
}
