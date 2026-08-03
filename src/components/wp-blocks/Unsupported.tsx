import React from "react";
import type { BlockRendererProps } from "@lib/blocks/types";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Package } from "lucide-react";
export default function Unsupported({ block, className }: BlockRendererProps) {
  if (import.meta.env.DEV) {
    console.warn(`Unsupported block type: ${block.name}`);
  }

  return (
    <Empty className="border border-dashed mb-4">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Package />
        </EmptyMedia>
        <EmptyTitle>Unsupported components</EmptyTitle>
        <EmptyDescription>
          This area is reserved for unsupported components.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <div className="border border-dashed rounded-xl p-2">{block.type}</div>
      </EmptyContent>
    </Empty>
  );
}
