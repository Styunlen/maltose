"use client";

import * as React from "react";
import {
  getHomeEffectsSnapshot,
  setHomeEffectsEnabled,
  subscribeHomeEffects,
} from "@/lib/home-effects";

export function useHomeEffects(): [boolean, (enabled: boolean) => void] {
  const [enabled, setEnabledState] = React.useState(getHomeEffectsSnapshot);

  React.useEffect(() => {
    return subscribeHomeEffects((nextEnabled) => {
      setEnabledState(nextEnabled ?? getHomeEffectsSnapshot());
    });
  }, []);

  const setEnabled = React.useCallback((nextEnabled: boolean) => {
    setEnabledState(nextEnabled);
    setHomeEffectsEnabled(nextEnabled);
  }, []);

  return [enabled, setEnabled];
}
