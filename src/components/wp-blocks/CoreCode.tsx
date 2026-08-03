import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  Copy,
  FileCode,
  WrapText,
  ListOrdered,
} from "lucide-react";
import { bundledLanguages, createHighlighter, type Highlighter } from "shiki";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "motion/react";
import type { BlockRendererProps } from "@lib/blocks/types";
import hljs from "highlight.js";
import lodash from "lodash-es";

// Singleton highlighter instance to avoid recreating it
let highlighterPromise: Promise<Highlighter> | null = null;

const getHighlighterInstance = async () => {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: ["tokyo-night"],
      langs: ["nginx"],
    });
  }
  return highlighterPromise;
};

export default function CoreCode({ block, className }: BlockRendererProps) {
  const [highlightedCode, setHighlightedCode] = useState<string>("");
  const innerHTML = useMemo(
    () => ({ __html: highlightedCode }),
    [highlightedCode],
  );
  const [isCopied, setIsCopied] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [showLineNumbers, setShowLineNumbers] = useState(true);
  const [wrapLines, setWrapLines] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const attributes = block.attributes;
  const content = useMemo(
    () => lodash.unescape(attributes?.content || ""),
    [attributes?.content],
  );
  const cssClassName = block.attributes?.cssClassName || "";
  const codeRef = useRef<HTMLDivElement>(null);

  // Extract explicit language from className or use state
  const explicitLanguage = useMemo(() => {
    const match = cssClassName.match(/language-(\w+)/);
    return match ? match[1] : null;
  }, [cssClassName]);
  const detectedLanguage = useMemo(() => {
    try {
      const result = hljs.highlightAuto(content);
      return result.language || "text";
    } catch (e) {
      console.warn("Language detection failed:", e);
      return "text";
    }
  }, [cssClassName, content]);

  // Use explicit language if available, otherwise use detected language
  const displayLanguage = useMemo(() => {
    return explicitLanguage
      ? explicitLanguage
      : detectedLanguage
        ? `${detectedLanguage} (Auto identified)`
        : "identifying...";
  }, [explicitLanguage, detectedLanguage]);

  useEffect(() => {
    let mounted = true;
    let highlighter: null | Highlighter = null;

    const highlight = async () => {
      if (!mounted) {
        return;
      }
      try {
        setIsLoading(true);
        highlighter = await getHighlighterInstance();

        // Language detection logic

        let langToUse = explicitLanguage || detectedLanguage || "text";

        const loadedLangs = highlighter.getLoadedLanguages();
        // If detection returned something not loaded, fall back to text
        if (!loadedLangs.includes(langToUse)) {
          if (!Object.keys(bundledLanguages).includes(langToUse)) {
            langToUse = "text";
          } else {
            await highlighter.loadLanguage(langToUse);
          }
        }

        const html = highlighter.codeToHtml(content, {
          lang: langToUse,
          theme: "tokyo-night",
          transformers: [
            {
              // Transformer to add line classes for line numbers
              code(node) {
                // 将所有 html 字符转义为文本节点，防止 XSS 攻击
                // 例如将&lt;转义为<

                this.addClassToHast(node, "shiki-code-block");
              },
              line(node, line) {
                // getTextContent(node);
                this.addClassToHast(node, "shiki-line");
                // Add data-line attribute for CSS counters
                if (node.properties) {
                  node.properties["data-line"] = line;
                }
              },
            },
          ],
        });

        if (mounted) {
          setHighlightedCode(html);
        }
      } catch (err) {
        console.error("Shiki highlight error:", err);
        // Fallback to plain text if shiki fails
        if (highlighter) {
          const fallbackHtml = highlighter.codeToHtml(content, {
            lang: "text",
            theme: "tokyo-night",
            transformers: [
              {
                // Transformer to add line classes for line numbers
                code(node) {
                  this.addClassToHast(node, "shiki-code-block");
                },
                line(node, line) {
                  this.addClassToHast(node, "shiki-line");
                  // Add data-line attribute for CSS counters
                  if (node.properties) {
                    node.properties["data-line"] = line;
                  }
                },
              },
            ],
          });
          setHighlightedCode(fallbackHtml);
        } else {
          setHighlightedCode(
            `<pre><code class="text-white">${lodash.escape(content)}</code></pre>`,
          );
        }
      } finally {
        if (mounted) setIsLoading(false);
      }
    };

    highlight();

    return () => {
      mounted = false;
    };
  }, [content, explicitLanguage, detectedLanguage]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  return (
    <div
      className={cn(
        "my-8 w-full max-w-full overflow-hidden rounded-lg border border-border bg-[#1a1b26] shadow-xl relative before:absolute before:top-0 before:left-0 before:right-0 before:h-1 before:bg-gradient-to-r before:from-primary before:via-secondary before:to-accent before:z-10",
        className,
      )}
    >
      {/* macOS-style Header */}
      <div className="flex items-center justify-between border-b border-white/10 bg-[#1a1b26] px-4 py-3">
        <div className="flex items-center gap-2">
          {/* Traffic Lights */}
          <div className="flex gap-1.5">
            <div className="h-3 w-3 rounded-full bg-[#ff5f56]" />
            <div className="h-3 w-3 rounded-full bg-[#ffbd2e]" />
            <div className="h-3 w-3 rounded-full bg-[#27c93f]" />
          </div>
          {/* Language Badge */}
          <div className="ml-4 flex items-center gap-1.5 text-xs font-medium text-slate-400">
            <FileCode className="h-3.5 w-3.5" />
            <span className="uppercase">{displayLanguage}</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setWrapLines(!wrapLines)}
            className={cn(
              "rounded p-1.5 text-slate-400 transition-colors hover:bg-white/10 hover:text-white",
              wrapLines && "bg-white/10 text-white",
            )}
            title="Toggle Word Wrap"
          >
            <WrapText className="h-4 w-4" />
          </button>
          <button
            onClick={() => setShowLineNumbers(!showLineNumbers)}
            className={cn(
              "rounded p-1.5 text-slate-400 transition-colors hover:bg-white/10 hover:text-white",
              showLineNumbers && "bg-white/10 text-white",
            )}
            title="Toggle Line Numbers"
          >
            <ListOrdered className="h-4 w-4" />
          </button>
          <button
            onClick={handleCopy}
            className="rounded p-1.5 text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
            title="Copy Code"
          >
            {isCopied ? (
              <Check className="h-4 w-4 text-green-400" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </button>
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="rounded p-1.5 text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
            title={isCollapsed ? "Expand" : "Collapse"}
          >
            <motion.div
              animate={{ rotate: isCollapsed ? 0 : 180 }}
              transition={{ duration: 0.2 }}
            >
              <ChevronDown className="h-4 w-4" />
            </motion.div>
          </button>
        </div>
      </div>

      {/* Code Area */}
      <AnimatePresence initial={false}>
        {!isCollapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="w-full max-w-full overflow-hidden" // Added max-w-full
          >
            <div
              className={cn(
                "relative w-full p-4 text-sm font-mono leading-relaxed",
                // Remove overflow-x-auto from here and handle wrapping specifically
                wrapLines
                  ? "whitespace-pre-wrap wrap-break-words"
                  : "whitespace-pre overflow-x-auto",
                showLineNumbers ? "show-line-numbers" : "hide-line-numbers",
                "shiki-container",
              )}
              ref={codeRef}
            >
              {isLoading ? (
                /* <div className="animate-pulse space-y-2 py-4"> */
                /*   <div className="h-4 w-2/3 rounded bg-white/10"></div> */
                /*   <div className="h-4 w-1/2 rounded bg-white/10"></div> */
                /*   <div className="h-4 w-3/4 rounded bg-white/10"></div> */
                /* </div> */
                // 遇到爬虫直接返回 content, 不走前端 loading 逻辑
                <div className="text-white shiki-code-block">{content}</div>
              ) : (
                <div
                  dangerouslySetInnerHTML={innerHTML}
                  className={cn(
                    "min-w-full",
                    // Important: ensure the inner code block respects the wrapping setting
                    wrapLines && "whitespace-pre-wrap wrap-break-words",
                  )}
                />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
CoreCode.displayName = "CoreCode";
CoreCode.fragments = {
  key: `CoreCodeBlockFragment`,
  entry: `
    fragment CoreCodeBlockFragment on CoreCode {
      attributes {
        content
        cssClassName
      }
    }
  `,
};
