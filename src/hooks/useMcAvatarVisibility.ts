"use client";

import * as React from "react";
import {
  getMcAvatarVisibleSnapshot,
  setMcAvatarVisible,
  subscribeMcAvatarVisibility,
} from "@/lib/mc-avatar-visibility";

export function useMcAvatarVisibility(): [boolean, (visible: boolean) => void] {
  const [visible, setVisibleState] = React.useState(getMcAvatarVisibleSnapshot);

  React.useEffect(() => {
    return subscribeMcAvatarVisibility((nextVisible) => {
      setVisibleState(nextVisible ?? getMcAvatarVisibleSnapshot());
    });
  }, []);

  const setVisible = React.useCallback((nextVisible: boolean) => {
    setVisibleState(nextVisible);
    setMcAvatarVisible(nextVisible);
  }, []);

  return [visible, setVisible];
}
