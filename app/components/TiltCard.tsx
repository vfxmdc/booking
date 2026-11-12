'use client';

import { useEffect, useRef, type ReactNode } from 'react';

const MAX_TILT = 18; // degrees, when following the mouse
const IDLE_TILT = 12; // degrees, gentle automatic sway

/**
 * 3D tilt wrapper: sways on its own, and follows the mouse while hovered.
 * Movement is eased every frame, so switching between the two is smooth.
 */
export default function TiltCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let target: { x: number; y: number } | null = null; // mouse target while hovered
    let cur = { x: 0, y: 0, s: 1 };
    let frame = 0;
    const start = performance.now();

    const loop = (now: number) => {
      const t = (now - start) / 1000;
      const goal = target
        ? { x: target.x, y: target.y, s: 1.03 }
        : { x: Math.sin(t * 1.6) * IDLE_TILT * 0.6, y: Math.cos(t * 1.2) * IDLE_TILT, s: 1 };
      const k = target ? 0.18 : 0.1;
      cur = { x: cur.x + (goal.x - cur.x) * k, y: cur.y + (goal.y - cur.y) * k, s: cur.s + (goal.s - cur.s) * k };
      el.style.transform = `perspective(1000px) rotateX(${cur.x}deg) rotateY(${cur.y}deg) scale3d(${cur.s}, ${cur.s}, ${cur.s})`;
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);

    const onMove = (e: MouseEvent) => {
      const r = el.getBoundingClientRect();
      const cx = r.width / 2;
      const cy = r.height / 2;
      target = {
        x: ((e.clientY - r.top - cy) / cy) * -MAX_TILT,
        y: ((e.clientX - r.left - cx) / cx) * MAX_TILT,
      };
    };
    const onLeave = () => (target = null);
    el.addEventListener('mousemove', onMove);
    el.addEventListener('mouseleave', onLeave);
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener('mousemove', onMove);
      el.removeEventListener('mouseleave', onLeave);
    };
  }, []);

  return (
    <div ref={ref} className={`will-change-transform ${className}`}>
      {children}
    </div>
  );
}
