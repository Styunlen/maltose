#!/usr/bin/env node
// Static PHP checks for wordpress-theme (no PHP runtime available locally):
//   1. syntax parse via php-parser
//   2. duplicate class method names (a redeclare is a fatal error at runtime)
// Run: pnpm check:php
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { Engine } from "php-parser";

const engine = new Engine({
  parser: { extractDoc: false },
  ast: { withPositions: false },
});

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.name.endsWith(".php")) out.push(full);
  }
  return out;
}

let syntaxFails = 0;
let duplicates = 0;

for (const file of walk("wordpress-theme")) {
  let ast;
  try {
    ast = engine.parseCode(readFileSync(file, "utf8"), file);
  } catch (error) {
    syntaxFails++;
    console.error(`SYNTAX  ${file} -> ${String(error.message).split("\n")[0]}`);
    continue;
  }

  const seen = new Map();
  const visit = (node) => {
    if (!node || typeof node !== "object") return;
    if (node.kind === "class" && Array.isArray(node.body)) {
      const className = node.name?.name || node.name || "(anonymous)";
      const methods = new Set();
      for (const member of node.body) {
        if (member.kind === "method" && member.name?.name) {
          if (methods.has(member.name.name)) {
            duplicates++;
            console.error(
              `DUP     ${file} class ${className} method ${member.name.name}`,
            );
          }
          methods.add(member.name.name);
        }
      }
      seen.set(className, methods);
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === "object" && value.kind) visit(value);
    }
  };
  visit(ast);
}

if (syntaxFails === 0 && duplicates === 0) {
  console.log(`check:php OK (${walk("wordpress-theme").length} files)`);
} else {
  console.error(
    `check:php failed: ${syntaxFails} syntax error(s), ${duplicates} duplicate method(s)`,
  );
  process.exitCode = 1;
}
