"use client";

import * as React from "react";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationPrevious,
  PaginationNext,
} from "@/components/ui/pagination";
import { emitter } from "@/lib/mitt";

interface ArticlePaginationProps {
  totalPages: number;
}

export default function ArticlePagination({
  totalPages,
}: ArticlePaginationProps) {
  const [current, setCurrent] = React.useState(1);

  function switchTo(n: number) {
    if (n < 1 || n > totalPages) return;
    const target = document.getElementById(`page-${n}`);
    if (!target) return;

    // Toggle active class
    document.querySelectorAll("#article-pages .article-page").forEach((el) => {
      el.classList.toggle("active", el.id === `page-${n}`);
    });

    target.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
    setCurrent(n);
    history.pushState(null, "", `#page-${n}`);
    emitter.emit("article-page-changed", n);
  }

  React.useEffect(() => {
    // Init from hash
    const hash = window.location.hash.replace("#", "");
    const match = hash.match(/^page-(\d+)$/);
    const page = match ? parseInt(match[1]) : 1;
    if (page >= 1 && page <= totalPages) {
      document
        .querySelectorAll("#article-pages .article-page")
        .forEach((el) => {
          el.classList.toggle("active", el.id === `page-${page}`);
        });
      setCurrent(page);
    } else {
      document
        .querySelectorAll("#article-pages .article-page")
        .forEach((el) => {
          el.classList.toggle("active", el.id === "page-1");
        });
    }

    // Back/forward
    const onPop = () => {
      const h = window.location.hash.replace("#", "");
      const m = h.match(/^page-(\d+)$/);
      const p = m ? parseInt(m[1]) : 1;
      if (p >= 1 && p <= totalPages) {
        document
          .querySelectorAll("#article-pages .article-page")
          .forEach((el) => {
            el.classList.toggle("active", el.id === `page-${p}`);
          });
        setCurrent(p);
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [totalPages]);

  return (
    <Pagination className="mt-8">
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious
            href={`#page-${Math.max(1, current - 1)}`}
            onClick={(e) => {
              e.preventDefault();
              switchTo(current - 1);
            }}
          />
        </PaginationItem>

        {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
          <PaginationItem key={n}>
            <PaginationLink
              href={`#page-${n}`}
              isActive={n === current}
              onClick={(e) => {
                e.preventDefault();
                switchTo(n);
              }}
            >
              {n}
            </PaginationLink>
          </PaginationItem>
        ))}

        <PaginationItem>
          <PaginationNext
            href={`#page-${Math.min(totalPages, current + 1)}`}
            onClick={(e) => {
              e.preventDefault();
              switchTo(current + 1);
            }}
          />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}
