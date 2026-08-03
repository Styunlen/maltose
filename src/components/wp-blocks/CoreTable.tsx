import type { TableBlock, BlockRendererProps } from "@lib/blocks/types";
import { sanitizeHtml } from "@/lib/sanitize";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@components/ui/table";

export default function CoreTable({ block, className }: BlockRendererProps) {
  const tableBlock = block as TableBlock;
  const { body, head, foot, align, hasFixedLayout } = tableBlock.attributes;

  const tableClass = [
    className,
    "wp-block-table",
    hasFixedLayout ? "is-style-regular" : "",
    align ? `align${align}` : "",
  ]
    .filter(Boolean)
    .join(" ");

  // console.log(JSON.stringify(tableBlock.attributes.body, null, 4));
  return (
    <Table className={tableClass}>
      {head && head.length > 0 && (
        <TableHeader>
          {head.map((row, rowIndex) => (
            <TableRow key={rowIndex}>
              {row.cells.map((cell, cellIndex) => (
                <TableHead
                  key={cellIndex}
                  className={cell.align ? `has-text-align-${cell.align}` : ""}
                  dangerouslySetInnerHTML={{
                    __html: sanitizeHtml(cell.content),
                  }}
                />
              ))}
            </TableRow>
          ))}
        </TableHeader>
      )}
      {body && body.length > 0 && (
        <TableBody>
          {body.map((row, rowIndex) => (
            <TableRow key={rowIndex}>
              {row.cells.map((cell, cellIndex) => (
                <TableCell
                  key={cellIndex}
                  className={cell.align ? `has-text-align-${cell.align}` : ""}
                  dangerouslySetInnerHTML={{
                    __html: sanitizeHtml(cell.content),
                  }}
                />
              ))}
            </TableRow>
          ))}
        </TableBody>
      )}
      {foot && foot.length > 0 && (
        <TableFooter>
          {foot.map((row, rowIndex) => (
            <TableRow key={rowIndex}>
              {row.cells.map((cell, cellIndex) => (
                <TableCell
                  key={cellIndex}
                  className={cell.align ? `has-text-align-${cell.align}` : ""}
                  dangerouslySetInnerHTML={{ __html: sanitizeHtml(cell.content) }}
                />
              ))}
            </TableRow>
          ))}
        </TableFooter>
      )}
    </Table>
  );
}

CoreTable.fragments = {
  key: "TableBlockFragment",
  entry: `
    fragment TableBlockFragment on CoreTable {
      attributes {
        caption
        align
        head {
          cells {
            align
            content
            colspan
            rowspan
            scope
            tag
          }
        }
        foot {
          cells {
            align
            colspan
            content
            rowspan
            scope
            tag
          }
        }
        fontSize
        fontFamily
        className
        body {
          cells {
            align
            colspan
            content
            scope
            rowspan
            tag
          }
        }
        backgroundColor
        align
      }
    }
  `,
};

CoreTable.displayName = "CoreTable";
