"use client";

import { useEffect, useState } from "react";
import { BackgroundBeams } from "@/components/ui/background-beams";
import { DottedGlowBackground } from "@/components/ui/dotted-glow-background";

function getInitialEnabled(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return false;
  }
  return document.documentElement.dataset.maltoseHomeEffects !== "off";
}

export default function HeroAceternityEffects() {
  const [enabled, setEnabled] = useState(getInitialEnabled);
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => {
      setEnabled(
        !media.matches &&
          document.documentElement.dataset.maltoseHomeEffects !== "off",
      );
    };
    const observer = new MutationObserver(update);

    update();
    media.addEventListener("change", update);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-maltose-home-effects"],
    });

    return () => {
      media.removeEventListener("change", update);
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    const hero = document.querySelector("[data-maltose-home-hero]");
    if (!(hero instanceof HTMLElement)) return;

    const visibilityObserver = new IntersectionObserver(
      ([entry]) => setIsVisible(entry?.isIntersecting ?? false),
      { threshold: 0.01 },
    );
    visibilityObserver.observe(hero);

    return () => visibilityObserver.disconnect();
  }, []);

  if (!enabled || !isVisible) return null;

  return (
    <div className="hero-aceternity-effects" aria-hidden="true">
      <DottedGlowBackground
        className="hero-dotted-glow"
        gap={32}
        radius={1.2}
        color="transparent"
        darkColor="transparent"
        glowColor="transparent"
        darkGlowColor="transparent"
        colorLightVar="--home-dot-color"
        colorDarkVar="--home-dot-color-dark"
        glowColorLightVar="--home-glow-color"
        glowColorDarkVar="--home-glow-color-dark"
        opacity={0.48}
        speedMin={0.25}
        speedMax={0.75}
        speedScale={0.65}
      />
      <BackgroundBeams className="hero-background-beams" />
    </div>
  );
}
