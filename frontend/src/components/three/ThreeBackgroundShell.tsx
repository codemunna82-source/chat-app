'use client';

import dynamic from 'next/dynamic';
import { useTheme } from 'next-themes';

const ThreeBackground = dynamic(() => import('@/components/three/ThreeBackground'), { ssr: false });

type Props = {
  enabled?: boolean;
};

/**
 * Lazy WebGL layer — parent decides visibility (performance profile).
 */
export function ThreeBackgroundShell({ enabled = true }: Props) {
  const { resolvedTheme } = useTheme();
  if (!enabled) return null;
  const isDark = resolvedTheme === 'dark';
  return <ThreeBackground isDark={isDark} />;
}
