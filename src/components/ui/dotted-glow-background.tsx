"use client";

import React, { useEffect, useRef, useState } from "react";

type DottedGlowBackgroundProps = {
  className?: string;
  /** distance between dot centers in pixels */
  gap?: number;
  /** base radius of each dot in CSS px */
  radius?: number;
  /** dot color (will pulse by alpha) */
  color?: string;
  /** optional dot color for dark mode */
  darkColor?: string;
  /** shadow/glow color for bright dots */
  glowColor?: string;
  /** optional glow color for dark mode */
  darkGlowColor?: string;
  /** optional CSS variable name for light dot color (e.g. --color-zinc-900) */
  colorLightVar?: string;
  /** optional CSS variable name for dark dot color (e.g. --color-zinc-100) */
  colorDarkVar?: string;
  /** optional CSS variable name for light glow color */
  glowColorLightVar?: string;
  /** optional CSS variable name for dark glow color */
  glowColorDarkVar?: string;
  /** global opacity for the whole layer */
  opacity?: number;
  /** background radial fade opacity (0 = transparent background) */
  backgroundOpacity?: number;
  /** minimum per-dot speed in rad/s */
  speedMin?: number;
  /** maximum per-dot speed in rad/s */
  speedMax?: number;
  /** global speed multiplier for all dots */
  speedScale?: number;
};

/**
 * Canvas-based dotted background that randomly glows and dims.
 * - Uses a stable grid of dots.
 * - Each dot gets its own phase + speed producing organic shimmering.
 * - Handles high-DPI and resizes via ResizeObserver.
 */
export const DottedGlowBackground = ({
  className,
  gap = 12,
  radius = 2,
  color = "rgba(0,0,0,0.7)",
  darkColor,
  glowColor = "rgba(0, 170, 255, 0.85)",
  darkGlowColor,
  colorLightVar,
  colorDarkVar,
  glowColorLightVar,
  glowColorDarkVar,
  opacity = 0.6,
  backgroundOpacity = 0,
  speedMin = 0.4,
  speedMax = 1.3,
  speedScale = 1,
}: DottedGlowBackgroundProps) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [resolvedColor, setResolvedColor] = useState<string>(color);
  const [resolvedGlowColor, setResolvedGlowColor] = useState<string>(glowColor);

  // Resolve CSS variable value from the container or root
  const resolveCssVariable = (
    el: Element,
    variableName?: string,
  ): string | null => {
    if (!variableName) return null;
    const normalized = variableName.startsWith("--")
      ? variableName
      : `--${variableName}`;
    const fromEl = getComputedStyle(el as Element)
      .getPropertyValue(normalized)
      .trim();
    if (fromEl) return fromEl;
    const root = document.documentElement;
    const fromRoot = getComputedStyle(root).getPropertyValue(normalized).trim();
    return fromRoot || null;
  };

  const detectDarkMode = (): boolean => {
    const root = document.documentElement;
    if (root.classList.contains("dark")) return true;
    if (root.classList.contains("light")) return false;
    return (
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches
    );
  };

  // Keep resolved colors in sync with theme changes and prop updates
  useEffect(() => {
    const container = containerRef.current ?? document.documentElement;

    const compute = () => {
      const isDark = detectDarkMode();

      let nextColor: string = color;
      let nextGlow: string = glowColor;

      if (isDark) {
        const varDot = resolveCssVariable(container, colorDarkVar);
        const varGlow = resolveCssVariable(container, glowColorDarkVar);
        nextColor = varDot || darkColor || nextColor;
        nextGlow = varGlow || darkGlowColor || nextGlow;
      } else {
        const varDot = resolveCssVariable(container, colorLightVar);
        const varGlow = resolveCssVariable(container, glowColorLightVar);
        nextColor = varDot || nextColor;
        nextGlow = varGlow || nextGlow;
      }

      setResolvedColor(nextColor);
      setResolvedGlowColor(nextGlow);
    };

    compute();

    const mql = window.matchMedia
      ? window.matchMedia("(prefers-color-scheme: dark)")
      : null;
    const handleMql = () => compute();
    mql?.addEventListener?.("change", handleMql);

    const mo = new MutationObserver(() => compute());
    mo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style"],
    });

    return () => {
      mql?.removeEventListener?.("change", handleMql);
      mo.disconnect();
    };
  }, [
    color,
    darkColor,
    glowColor,
    darkGlowColor,
    colorLightVar,
    colorDarkVar,
    glowColorLightVar,
    glowColorDarkVar,
  ]);

  useEffect(() => {
    const el = canvasRef.current;
    const container = containerRef.current;
    if (!el || !container) return;

    const ctx = el.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let stopped = false;
    let isVisible = true;

    const dpr = 1; // soft glow dots: one canvas pixel per CSS px is plenty
    const glowBlur = 6;
    const spriteSize = (radius + glowBlur) * 2;
    let width = 1;
    let height = 1;
    let sprite: HTMLCanvasElement | null = null;

    const buildSprite = () => {
      const size = Math.max(2, Math.ceil(spriteSize * dpr));
      const c = document.createElement("canvas");
      c.width = size;
      c.height = size;
      const g = c.getContext("2d");
      if (!g) return null;
      g.scale(dpr, dpr);
      const center = spriteSize / 2;
      const glow = g.createRadialGradient(
        center,
        center,
        radius,
        center,
        center,
        radius + glowBlur,
      );
      glow.addColorStop(0, resolvedGlowColor);
      glow.addColorStop(1, "rgba(0,0,0,0)");
      g.globalAlpha = 0.7;
      g.fillStyle = glow;
      g.beginPath();
      g.arc(center, center, radius + glowBlur, 0, Math.PI * 2);
      g.fill();
      g.globalAlpha = 1;
      g.fillStyle = resolvedColor;
      g.beginPath();
      g.arc(center, center, radius, 0, Math.PI * 2);
      g.fill();
      return c;
    };

    const resize = () => {
      const rect = container.getBoundingClientRect();
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      el.width = Math.floor(width * dpr);
      el.height = Math.floor(height * dpr);
      el.style.width = `${Math.floor(width)}px`;
      el.style.height = `${Math.floor(height)}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      sprite = buildSprite();
    };

    const ro = new ResizeObserver(resize);
    ro.observe(container);
    resize();

    // Precompute dot metadata for a medium-sized grid and regenerate on resize
    let dots: { x: number; y: number; phase: number; speed: number }[] = [];

    const regenDots = () => {
      dots = [];
      const cols = Math.ceil(width / gap) + 2;
      const rows = Math.ceil(height / gap) + 2;
      const min = Math.min(speedMin, speedMax);
      const max = Math.max(speedMin, speedMax);
      for (let i = -1; i < cols; i++) {
        for (let j = -1; j < rows; j++) {
          const x = i * gap + (j % 2 === 0 ? 0 : gap * 0.5); // offset every other row
          const y = j * gap;
          // Randomize phase and speed slightly per dot
          const phase = Math.random() * Math.PI * 2;
          const span = Math.max(max - min, 0);
          const speed = min + Math.random() * span; // configurable rad/s
          dots.push({ x, y, phase, speed });
        }
      }
    };

    const regenThrottled = () => {
      regenDots();
    };

    regenDots();

    const FRAME_MS = 1000 / 15;
    let lastFrame = 0;
    const backdrop = container.closest<HTMLElement>("[data-brand-backdrop]");

    const draw = (now: number) => {
      ctx.clearRect(0, 0, width, height);

      // optional subtle background fade for depth (defaults to 0 = transparent)
      if (backgroundOpacity > 0) {
        const grad = ctx.createRadialGradient(
          width * 0.5,
          height * 0.4,
          Math.min(width, height) * 0.1,
          width * 0.5,
          height * 0.5,
          Math.max(width, height) * 0.7,
        );
        grad.addColorStop(0, "rgba(0,0,0,0)");
        grad.addColorStop(
          1,
          `rgba(0,0,0,${Math.min(Math.max(backgroundOpacity, 0), 1)})`,
        );
        ctx.fillStyle = grad as unknown as CanvasGradient;
        ctx.fillRect(0, 0, width, height);
      }

      if (!sprite) return;
      const time = (now / 1000) * Math.max(speedScale, 0);
      for (let i = 0; i < dots.length; i++) {
        const d = dots[i];
        // Linear triangle wave 0..1..0 for linear glow/dim
        const mod = (time * d.speed + d.phase) % 2;
        const lin = mod < 1 ? mod : 2 - mod; // 0..1..0
        const a = 0.25 + 0.55 * lin; // 0.25..0.8 linearly
        ctx.globalAlpha = a * opacity;
        // Pre-rendered dot+glow sprite: no per-dot paths or shadowBlur.
        ctx.drawImage(
          sprite,
          d.x - spriteSize / 2,
          d.y - spriteSize / 2,
          spriteSize,
          spriteSize,
        );
      }
      ctx.globalAlpha = 1;
    };

    const loop = (now: number) => {
      raf = 0;
      if (stopped || !isVisible || document.hidden) return;
      if (backdrop && backdrop.dataset.state === "hidden") return;
      if (now - lastFrame < FRAME_MS) {
        raf = requestAnimationFrame(loop);
        return;
      }
      lastFrame = now;
      draw(now);
      raf = requestAnimationFrame(loop);
    };

    const schedule = () => {
      if (stopped || raf || !isVisible || document.hidden) return;
      if (backdrop && backdrop.dataset.state === "hidden") return;
      raf = requestAnimationFrame(loop);
    };

    const handleResize = () => {
      resize();
      regenThrottled();
      schedule();
    };

    const observer = new IntersectionObserver(
      (entries) => {
        isVisible = entries[0]?.isIntersecting ?? true;
        if (isVisible) schedule();
      },
      { threshold: 0.1 },
    );
    observer.observe(container);

    const onVisibility = () => {
      if (!document.hidden) schedule();
    };
    document.addEventListener("visibilitychange", onVisibility);

    let stateObserver: MutationObserver | null = null;
    if (backdrop) {
      stateObserver = new MutationObserver(() => {
        if (backdrop.dataset.state !== "hidden") schedule();
      });
      stateObserver.observe(backdrop, {
        attributes: true,
        attributeFilter: ["data-state"],
      });
    }

    window.addEventListener("resize", handleResize);
    schedule();

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", handleResize);
      document.removeEventListener("visibilitychange", onVisibility);
      observer.disconnect();
      stateObserver?.disconnect();
      ro.disconnect();
    };
  }, [
    gap,
    radius,
    resolvedColor,
    resolvedGlowColor,
    opacity,
    backgroundOpacity,
    speedMin,
    speedMax,
    speedScale,
  ]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ position: "absolute", inset: 0 }}
    >
      <canvas
        ref={canvasRef}
        style={{ display: "block", width: "100%", height: "100%" }}
      />
    </div>
  );
};
