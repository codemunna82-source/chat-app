'use client';

import { useTheme } from 'next-themes';
import dynamic from 'next/dynamic';

const Snowfall = dynamic(() => import('react-snowfall'), { ssr: false });

export function AnimatedBackground() {
  const { resolvedTheme, theme } = useTheme();
  const isDark = resolvedTheme === 'dark' || theme === 'dark';
  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const saveData =
    typeof navigator !== 'undefined' &&
    Boolean((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData);
  const hardwareConcurrency =
    typeof navigator !== 'undefined' && typeof navigator.hardwareConcurrency === 'number'
      ? navigator.hardwareConcurrency
      : 4;
  const showSnow = isDark && !prefersReducedMotion && !saveData && hardwareConcurrency >= 4;

  return (
    <>
      <div className="fixed inset-0 z-[-1] overflow-hidden bg-background pointer-events-none transition-colors duration-1000">
        {showSnow && (
          <Snowfall 
             snowflakeCount={24} 
             color="#ffffff" 
             style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10, opacity: 0.4, pointerEvents: 'none' }} 
             radius={[0.5, 2.0]}
             speed={[0.4, 1.6]}
             wind={[-0.4, 1.6]}
          />
        )}
        <div
          className="absolute -top-[20%] -left-[10%] w-[70vw] h-[70vw] rounded-full blur-[110px] transition-colors duration-1000"
          style={{ 
            background: 'color-mix(in srgb, var(--primary) 22%, transparent)',
            animation: 'blob-drift-1 25s infinite ease-in-out',
            willChange: 'transform, opacity'
          }}
        />
        <div
          className="absolute -bottom-[20%] -right-[10%] w-[60vw] h-[60vw] rounded-full blur-[130px] transition-colors duration-1000"
          style={{ 
            background: 'color-mix(in srgb, var(--accent) 20%, transparent)',
            animation: 'blob-drift-2 30s infinite ease-in-out',
            animationDelay: '1s',
            willChange: 'transform, opacity'
          }}
        />
        
        {/* Subtle overlay grid for texture */}
        <div className="absolute inset-0 opacity-[0.04] dark:opacity-[0.08]" 
             style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, currentColor 1px, transparent 0)', backgroundSize: '30px 30px' }} 
        />
      </div>

      {/* Foreground Parallax Snow - Floats over the UI */}
      {showSnow && (
        <div className="fixed inset-0 z-[50] pointer-events-none">
          <Snowfall 
             snowflakeCount={8} 
             color="#ffffff" 
             style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0.8 }} 
             radius={[1.2, 3.2]}
             speed={[0.8, 2.4]}
             wind={[-0.8, 2.4]}
          />
        </div>
      )}
    </>
  );
}
