"use client";

import * as React from "react";

import { useMcAvatarVisibility } from "@/hooks/useMcAvatarVisibility";

const Live2DAvatar = React.lazy(() => import("@/components/Live2DAvatar"));

export default function LazyLive2DAvatar() {
  const [mounted, setMounted] = React.useState(false);
  const [visible] = useMcAvatarVisibility();
  const [isDesktop, setIsDesktop] = React.useState(false);

  React.useEffect(() => {
    const desktop = window.matchMedia("(min-width: 64rem)");
    const update = () => setIsDesktop(desktop.matches);
    update();
    desktop.addEventListener("change", update);

    return () => desktop.removeEventListener("change", update);
  }, []);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || !visible || !isDesktop) return null;

  return (
    <React.Suspense fallback={null}>
      <Live2DAvatar />
    </React.Suspense>
  );
}
