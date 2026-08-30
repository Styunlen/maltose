"use client";

import * as React from "react";
import { TooltipProvider } from "@components/animate-ui/components/tooltip";

/**
 * Shared TooltipProvider config for the comment surfaces (footer section and
 * paragraph popup). Each Astro island renders its own instance — React
 * context cannot cross island boundaries — but the open/close delay config
 * lives in one place so tuning it here affects both.
 */
export function CommentTooltipProvider({ children }: { children: React.ReactNode }) {
  return (
    <TooltipProvider openDelay={700} closeDelay={300}>
      {children}
    </TooltipProvider>
  );
}
