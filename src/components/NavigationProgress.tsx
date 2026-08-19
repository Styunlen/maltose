"use client";

import { useEffect, useRef } from "react";
import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  type AnimationPlaybackControls,
} from "motion/react";

export default function NavigationProgress() {
  const width = useMotionValue(0);
  const opacity = useMotionValue(0);
  const reduceMotion = useReducedMotion();

  // Only show during in-flight navigations, not the initial astro:page-load.
  const activeRef = useRef(false);
  const controlsRef = useRef<AnimationPlaybackControls | null>(null);
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const stopAll = () => {
      controlsRef.current?.stop();
      controlsRef.current = null;
      if (fadeTimerRef.current) {
        clearTimeout(fadeTimerRef.current);
        fadeTimerRef.current = null;
      }
    };

    const start = () => {
      activeRef.current = true;
      stopAll();
      if (reduceMotion) {
        width.set(0.9);
        opacity.set(1);
        return;
      }
      opacity.set(1);
      width.set(0);
      controlsRef.current = animate(width, 0.9, {
        duration: 1.2,
        ease: "easeOut",
      });
    };

    const speedUp = () => {
      controlsRef.current?.stop();
      if (reduceMotion) {
        width.set(0.95);
        return;
      }
      controlsRef.current = animate(width, 0.95, {
        duration: 0.3,
        ease: "easeOut",
      });
    };

    const finish = () => {
      if (!activeRef.current) return;
      activeRef.current = false;
      stopAll();
      width.set(1);
      fadeTimerRef.current = setTimeout(() => {
        controlsRef.current = animate(opacity, 0, {
          duration: reduceMotion ? 0 : 0.2,
          ease: "easeOut",
          onComplete: () => width.set(0),
        });
      }, 200);
    };

    document.addEventListener("astro:before-preparation", start);
    document.addEventListener("astro:before-swap", speedUp);
    document.addEventListener("astro:page-load", finish);

    return () => {
      document.removeEventListener("astro:before-preparation", start);
      document.removeEventListener("astro:before-swap", speedUp);
      document.removeEventListener("astro:page-load", finish);
      stopAll();
      activeRef.current = false;
      opacity.set(0);
      width.set(0);
    };
  }, [reduceMotion, width, opacity]);

  return (
    <motion.div
      aria-hidden
      className="pointer-events-none fixed top-0 left-0 z-[90] h-0.5 w-full"
      style={{
        opacity,
        scaleX: width,
        transformOrigin: "left",
        backgroundColor: "var(--primary)",
        boxShadow:
          "0 0 8px color-mix(in oklch, var(--primary) 50%, transparent)",
      }}
    />
  );
}
