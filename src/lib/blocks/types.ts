// WordPress Block Types
export interface BlockAttributes {
  [key: string]: any;
}

export interface BlockBase {
  name: string;
  clientId: string;
  parentClientId?: string;
  cssClassNames?: string[];
  renderedHtml?: string;
  innerBlocks?: SupportedBlock[];
  attributes: BlockAttributes;
  type: string;
}

export interface ParagraphBlock extends BlockBase {
  name: "core/paragraph";
  attributes: {
    content: string;
    dropCap?: boolean;
    placeholder?: string;
    align?: "left" | "center" | "right" | "justify";
    [key: string]: any;
  };
}

export interface HeadingBlock extends BlockBase {
  name: "core/heading";
  attributes: {
    content: string;
    level: number;
    placeholder?: string;
    textAlign?: "left" | "center" | "right" | "justify";
    [key: string]: any;
  };
}

export interface ImageBlock extends BlockBase {
  name: "core/image";
  attributes: {
    url: string;
    alt: string;
    caption?: string;
    href?: string;
    width?: number;
    height?: number;
    sizeSlug?: string;
    linkDestination?: string;
    [key: string]: any;
  };
}

export interface CodeBlock extends BlockBase {
  name: "core/code";
  attributes: {
    content?: string;
    cssClassName?: string;
    fontFamily?: string;
    fontSize?: string;
    style?: string;
    textColor?: string;
    [key: string]: any;
  };
}

export interface PreformattedBlock extends BlockBase {
  name: "core/preformatted";
  attributes: {
    content?: string;
    cssClassName?: string;
    fontFamily?: string;
    fontSize?: string;
    style?: string;
    textColor?: string;
    [key: string]: any;
  };
}

export interface ListBlock extends BlockBase {
  name: "core/list";
  attributes: {
    ordered: boolean;
    values: string;
    reversed?: boolean;
    start?: number;
    type?: string;
    [key: string]: any;
  };
}

export interface QuoteBlock extends BlockBase {
  name: "core/quote";
  attributes: {
    value: string;
    citation?: string;
    textAlign?: "left" | "center" | "right" | "justify";
    [key: string]: any;
  };
}

interface TableCell {
  cells: Array<{
    align: string;
    content: string;
    colspan: string;
    rowspan: string;
    scope: string;
    tag: string;
  }>;
}

export interface TableBlock extends BlockBase {
  name: "core/table";
  attributes: {
    body: TableCell[];
    head: TableCell[];
    foot: TableCell[];
    hasFixedLayout?: boolean;
    [key: string]: any;
  };
}

export interface ColumnsBlock extends BlockBase {
  name: "core/columns";
  attributes: {
    isStackedOnMobile?: boolean;
    [key: string]: any;
  };
}

export interface ColumnBlock extends BlockBase {
  name: "core/column";
  attributes: {
    width?: string;
    anchor?: string;
    cssClassName?: string;
    [key: string]: any;
  };
}

export interface GroupBlock extends BlockBase {
  name: "core/group";
  attributes: {
    tagName?: string;
    layout?: any;
    [key: string]: any;
  };
}

export interface EmbedBlock extends BlockBase {
  name: "core/embed";
  attributes: {
    url: string;
    type?: string;
    providerNameSlug?: string;
    caption?: string;
    allowResponsive?: boolean;
    [key: string]: any;
  };
}

export interface VideoBlock extends BlockBase {
  name: "core/video";
  attributes: {
    src?: string;
    id?: number;
    poster?: string;
    caption?: string;
    autoplay?: boolean;
    loop?: boolean;
    muted?: boolean;
    controls?: boolean;
    preload?: string;
    playsInline?: boolean;
    [key: string]: any;
  };
}

export interface ButtonsBlock extends BlockBase {
  name: "core/buttons";
  attributes: {
    cssClassName?: string;
    [key: string]: any;
  };
}

export interface ButtonBlock extends BlockBase {
  name: "core/button";
  attributes: {
    text?: string;
    url?: string;
    linkTarget?: string;
    rel?: string;
    cssClassName?: string;
    [key: string]: any;
  };
}

export interface FileBlock extends BlockBase {
  name: "core/file";
  attributes: {
    id?: number;
    href?: string;
    fileName?: string;
    textLinkHref?: string;
    textLinkTarget?: string;
    showDownloadButton?: boolean;
    downloadButtonText?: string;
    cssClassName?: string;
    [key: string]: any;
  };
}

export interface ShortcodeBlock extends BlockBase {
  name: "core/shortcode";
  attributes: {
    text?: string;
    cssClassName?: string;
    [key: string]: any;
  };
}

// Union type for all supported blocks
export type SupportedBlock =
  | ParagraphBlock
  | HeadingBlock
  | ImageBlock
  | CodeBlock
  | PreformattedBlock
  | ListBlock
  | QuoteBlock
  | TableBlock
  | ColumnsBlock
  | GroupBlock
  | EmbedBlock
  | VideoBlock
  | ButtonsBlock
  | ButtonBlock
  | FileBlock
  | ShortcodeBlock
  | BlockBase; // Fallback for unsupported blocks

// Block renderer props
export interface BlockRendererProps {
  block: SupportedBlock;
  className?: string;
  children?: React.ReactNode;
  noWrapper?: boolean;
  /** Paragraph-comment anchor (ADR-0036 P3): the block's clientId, used for data-block-id + hover affordance. */
  dataBlockId?: string;
  /** clientId → comment count map, for the per-block count badge (SSR-aggregated). */
  commentsByBlock?: Record<string, number>;
  /** Fired when the paragraph-comment affordance is clicked. */
  onCommentClick?: (clientId: string) => void;
}
