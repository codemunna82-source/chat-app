'use client';

import { VideoContainer, type VideoContainerProps } from '@/components/ui/VideoContainer';
import { TiltCard } from '@/components/three/TiltCard';
import { useDeviceUIProfile } from '@/hooks/useDeviceUIProfile';
import { cn } from '@/lib/utils';

/**
 * Video stage: desktop = tilt + deep shadow; mobile = full-bleed friendly shell (no tilt).
 */
export function Video3DContainer({ className, children, ...props }: VideoContainerProps) {
  const { immersiveDesktop, allowTilt, isMobile } = useDeviceUIProfile();
  const desktopStage = immersiveDesktop && allowTilt;

  const shell = (
    <VideoContainer
      className={cn(
        desktopStage &&
          'md:shadow-[0_28px_90px_-24px_rgba(0,0,0,0.58)] md:ring-1 md:ring-white/12',
        isMobile && 'max-md:rounded-xl max-md:border-white/10 max-md:shadow-lg',
        className
      )}
      {...props}
    >
      {children}
    </VideoContainer>
  );

  if (desktopStage) {
    return (
      <TiltCard maxTilt={6} className="flex min-h-0 flex-1 flex-col">
        {shell}
      </TiltCard>
    );
  }

  return shell;
}
