import type { BlockRendererProps } from "@/lib/blocks/types";
import { cn } from "@/lib/utils";
import { sanitizeHtml } from "@/lib/sanitize";

export default function CoreHtml({ block, className }: BlockRendererProps) {
  const content = block.attributes?.content || "";

  return (
    <div
      className={cn(className, "wp-block-html")}
      dangerouslySetInnerHTML={{ __html: sanitizeHtml(content) }}
    />
  );
}

CoreHtml.displayName = ["CoreHtml", "CoreFreeform", "CoreGallery"];
