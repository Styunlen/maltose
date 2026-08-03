"use client";

import * as React from "react";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/animate-ui/radix/collapsible";
import { parseContentWithCode } from "@/lib/shortcodes/parser";
import CoreCode from "@/components/wp-blocks/CoreCode";
import { sanitizeHtml } from "@/lib/sanitize";
import { ChevronDown } from "lucide-react";

interface CollapseShortcodeProps {
  attrs: { [key: string]: string };
  content: string;
}

export default function CollapseShortcode({
  attrs,
  content,
}: CollapseShortcodeProps) {
  const [open, setOpen] = React.useState(false);
  const segments = React.useMemo(
    () =>
      parseContentWithCode(content).map((seg, i) =>
        seg.type === "code" ? (
          <CoreCode
            key={i}
            block={
              {
                name: "core/code",
                clientId: `shortcode-code-${i}`,
                parentClientId: null,
                attributes: {
                  content: seg.value,
                  cssClassName: `language-${seg.lang}`,
                },
                type: "CoreCode",
                innerBlocks: [],
                cssClassNames: [`language-${seg.lang}`],
              } as any
            }
            className=""
          />
        ) : (
          <div key={i} dangerouslySetInnerHTML={{ __html: sanitizeHtml(seg.value) }} />
        ),
      ),
    [content],
  );

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="my-4">
      <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-lg border border-border bg-muted/50 px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-muted transition-colors">
        <ChevronDown
          className={`size-4 shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
        {attrs.title || "展开查看"}
      </CollapsibleTrigger>
      <CollapsibleContent
        className="mt-3 border-l-2 border-primary/40 pl-4"
        transition={{ duration: 0.35, ease: "easeInOut" }}
      >
        {segments}
      </CollapsibleContent>
    </Collapsible>
  );
}
