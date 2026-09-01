import type { QuoteBlock, BlockRendererProps } from "@lib/blocks/types";
import { Alert, AlertDescription } from "@components/ui/alert";

export default function CoreQuote({
  block,
  className,
  children,
}: BlockRendererProps) {
  const quoteBlock = block as QuoteBlock;
  const { value, citation, textAlign } = quoteBlock.attributes;
  // console.log(quoteBlock);

  const style: React.CSSProperties = {};
  if (textAlign) {
    style.textAlign = textAlign;
  }

  const quoteClass = [
    className,
    "wp-block-quote",
    textAlign ? `has-text-align-${textAlign}` : "",
    "border-l-4",
    "border-l-primary",
    "bg-muted/40",
    "rounded-r-lg",
  ]
    .filter(Boolean)
    .join(" ");

  if (children) {
    return (
      <Alert className={quoteClass} style={style}>
        <AlertDescription className="text-foreground/90 italic">
          {children}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert className={quoteClass} style={style}>
      <AlertDescription className="text-foreground/90 italic">
        {/* value is already <p>...</p> from WordPress; a <div> wrapper avoids
            invalid nested <p><p> which browsers auto-split during parsing,
            causing SSR/client hydration mismatch and layout height jumps. */}
        <div dangerouslySetInnerHTML={{ __html: value }} />
        {citation && (
          <cite
            className="block mt-3 text-sm not-italic text-muted-foreground before:content-['—\00a0']"
            dangerouslySetInnerHTML={{ __html: citation }}
          />
        )}
      </AlertDescription>
    </Alert>
  );
}

CoreQuote.fragments = {
  key: "QuoteBlockFragment",
  entry: `
    fragment QuoteBlockFragment on CoreQuote {
      attributes {
        cssClassName
        value
        citation
        textAlign
      }
    }
  `,
};

CoreQuote.displayName = ["CoreQuote", "CorePullquote"];
