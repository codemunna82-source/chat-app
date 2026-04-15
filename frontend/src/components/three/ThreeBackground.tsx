'use client';

import { Suspense, useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Float } from '@react-three/drei';
import * as THREE from 'three';

type MouseRef = React.MutableRefObject<{ x: number; y: number }>;

function SoftBlobs({ mouseRef, isDark }: { mouseRef: MouseRef; isDark: boolean }) {
  const group = useRef<THREE.Group>(null);
  const c1 = isDark ? '#818cf8' : '#6366f1';
  const c2 = isDark ? '#22d3ee' : '#38bdf8';
  const c3 = isDark ? '#c084fc' : '#a855f7';

  useFrame((_, delta) => {
    const g = group.current;
    if (!g) return;
    const m = mouseRef.current;
    g.rotation.y = THREE.MathUtils.lerp(g.rotation.y, m.x * 0.35 + Math.sin(performance.now() * 0.00015) * 0.08, 0.04);
    g.rotation.x = THREE.MathUtils.lerp(g.rotation.x, m.y * 0.22 + Math.sin(performance.now() * 0.00012) * 0.05, 0.04);
    g.rotation.z += delta * 0.012;
  });

  const blobs = useMemo(
    () => [
      { pos: [-2.4, 0.5, -0.5] as [number, number, number], s: 0.52, color: c1 },
      { pos: [2.1, -0.4, -1.2] as [number, number, number], s: 0.44, color: c2 },
      { pos: [0.2, 1.8, -2] as [number, number, number], s: 0.36, color: c3 },
    ],
    [c1, c2, c3]
  );

  return (
    <group ref={group}>
      <ambientLight intensity={0.55} />
      <directionalLight position={[5, 6, 8]} intensity={0.45} color="#ffffff" />
      {blobs.map((b, i) => (
        <Float key={i} speed={1.1 + i * 0.15} rotationIntensity={0.15} floatIntensity={0.35}>
          <mesh position={b.pos}>
            <icosahedronGeometry args={[b.s, 1]} />
            <meshStandardMaterial
              color={b.color}
              roughness={0.42}
              metalness={0.2}
              transparent
              opacity={0.42}
              depthWrite={false}
            />
          </mesh>
        </Float>
      ))}
    </group>
  );
}

function Scene({ mouseRef, isDark }: { mouseRef: MouseRef; isDark: boolean }) {
  return <SoftBlobs mouseRef={mouseRef} isDark={isDark} />;
}

/**
 * Lightweight R3F layer: blobs + slow motion + mouse parallax. Canvas only — parent handles layout.
 */
export default function ThreeBackground({ isDark = false }: { isDark?: boolean }) {
  const mouseRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      mouseRef.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      mouseRef.current.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener('mousemove', onMove, { passive: true });
    return () => window.removeEventListener('mousemove', onMove);
  }, []);

  return (
    <Canvas
      className="h-full w-full"
      gl={{
        alpha: true,
        antialias: false,
        powerPreference: 'high-performance',
        stencil: false,
        depth: true,
      }}
      dpr={[1, 1.35]}
      camera={{ position: [0, 0, 9], fov: 42, near: 0.1, far: 32 }}
      frameloop="always"
      onCreated={({ gl }) => {
        gl.setClearColor(0x000000, 0);
      }}
    >
      <Suspense fallback={null}>
        <Scene mouseRef={mouseRef} isDark={isDark} />
      </Suspense>
    </Canvas>
  );
}
