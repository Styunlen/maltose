import { describe, it, expect } from "vitest";
import {
  extractLanguageFromClass,
  collectLanguageHints,
  extractLanguageFromHtml,
  resolveCodeLanguage,
} from "./code-lang";

describe("extractLanguageFromClass", () => {
  it("extracts language from a language-* class", () => {
    expect(extractLanguageFromClass("language-javascript")).toBe("javascript");
    expect(extractLanguageFromClass("foo language-ts bar")).toBe("ts");
  });

  it("returns null when no language class present", () => {
    expect(extractLanguageFromClass("wp-block-code")).toBeNull();
    expect(extractLanguageFromClass("")).toBeNull();
  });
});

describe("collectLanguageHints", () => {
  it("gathers hints from both cssClassName and cssClassNames array", () => {
    expect(
      collectLanguageHints("language-python", ["language-python", "language-js"]),
    ).toEqual(["python", "python", "js"]);
  });

  it("returns empty array when no hints", () => {
    expect(collectLanguageHints("wp-block-code", ["some-class"])).toEqual([]);
    expect(collectLanguageHints(undefined, undefined)).toEqual([]);
  });
});

describe("extractLanguageFromHtml", () => {
  it("extracts language from rendered code/pre html", () => {
    const html = `<pre class="wp-block-code"><code class="language-typescript">const a = 1</code></pre>`;
    expect(extractLanguageFromHtml(html)).toBe("typescript");
  });

  it("returns null when html has no language class", () => {
    expect(extractLanguageFromHtml("<pre><code>plain</code></pre>")).toBeNull();
    expect(extractLanguageFromHtml("")).toBeNull();
  });
});

describe("resolveCodeLanguage", () => {
  it("explicit cssClassName hint wins over detection", () => {
    const { lang, source } = resolveCodeLanguage({
      content: 'def foo():\n  return 1',
      cssClassName: "language-javascript",
    });
    expect(lang).toBe("javascript");
    expect(source).toBe("explicit");
  });

  it("cssClassNames array hint is respected (shortcode path)", () => {
    const { lang, source } = resolveCodeLanguage({
      content: "console.log(1)",
      cssClassNames: ["language-python"],
    });
    expect(lang).toBe("python");
    expect(source).toBe("explicit");
  });

  it("renderedHtml hint is used when classes are absent", () => {
    const { lang, source } = resolveCodeLanguage({
      content: "<pre><code class=\"language-go\">package main</code></pre>",
      renderedHtml: '<pre class="wp-block-code"><code class="language-go">package main</code></pre>',
    });
    expect(lang).toBe("go");
    expect(source).toBe("explicit");
  });

  it("confident auto-detection returns shiki-normalized name", () => {
    const { lang, source } = resolveCodeLanguage({
      content:
        'import React from "react";\nexport default function App() { return <div>hi</div>; }',
    });
    expect(source).toBe("detected");
    expect(lang).toBe("javascript");
  });

  it("low-confidence but detected content falls back to text (hljs guesses like arcade/dns)", () => {
    // hljs 对短 JS 爱猜成 arcade/dns 等低 relevance 结果 —— 阈值应拦下，显示 text。
    const arrowFn = resolveCodeLanguage({
      content: 'const x = () => { console.log("hi"); return x; };',
    });
    expect(arrowFn.source).toBe("text");
    expect(arrowFn.lang).toBe("text");
  });

  it("maps hljs short names to shiki canonical names", () => {
    const { lang } = resolveCodeLanguage({
      content: "#! /bin/bash\necho hello\nls -la",
    });
    expect(lang).toBe("bash");
  });

  it("low-confidence content falls back to text (no misleading badge)", () => {
    const { lang, source } = resolveCodeLanguage({
      content: "hello world",
    });
    expect(source).toBe("text");
    expect(lang).toBe("text");
  });
});
