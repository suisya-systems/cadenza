/**
 * The dependency direction of design section 8, enforced here rather than in
 * review -- over the **TypeScript** module graph.
 *
 * Re-pointed from `tests/test_import_boundaries.py` rather than transcribed
 * (cadenza#8). The source asserts things about a Python package, and the
 * equivalent claim about this tree is a different scan over a different graph:
 * the layers are the same, the modules are not, and `__init__.py` has no
 * counterpart at all. The mapping, case by case, is
 * `parity/import-boundaries.ledger.json`; why the scan is written here rather
 * than delegated to a lint rule is DECISIONS.md D-0022.
 *
 * Modules are parsed, never imported. An import that only happens inside a
 * function body, or in type position, or through a re-export is still an
 * import for the purpose of this boundary, and importing the tree would not
 * see any of them.
 *
 * **What keeps this from passing vacuously.** The per-module cases are
 * generated from a directory walk, so a walk that found nothing would generate
 * nothing and a suite of zero assertions is green. Two things stop that. The
 * walk has its own case below, as the source's does; and, unlike the source,
 * every id this file generates is claimed by the ledger, so a module that stops
 * being discovered takes its four target ids with it and
 * `scripts/parity-check.mjs` reports them `missing`. A new module under `src/`
 * is the same story in reverse: its ids are `unmapped` until somebody accounts
 * for them.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { expect, test } from "vitest";

import { parametrize } from "../testkit/parametrize.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** The tree this file guards. */
const SRC_ROOT = "src";

/** Repo-relative paths are spelled with forward slashes on every platform. */
const slash = (path: string): string => path.split("\\").join("/");

const sourceOf = (module: string): string => readFileSync(join(ROOT, module), "utf8");

/**
 * Section 9: cadenza does not depend on interlock yet, in any spelling.
 *
 * Normalised, because the source's two spellings are Python module names and a
 * npm specifier for the same two things would be written differently:
 * `claude_org_runtime` becomes `claude-org-runtime` on a registry, and either
 * could arrive scoped as `@suisya-systems/interlock`. Comparing the normalised
 * package name, and the unscoped half of a scoped one, covers all of those
 * without enumerating them.
 */
const FORBIDDEN_PACKAGES = new Set(["claude-org-runtime", "interlock"]);

/** Inward only: adapters -> application -> domain, and ports is depended on. */
const FORBIDDEN_BY_LAYER: Readonly<Record<string, readonly string[]>> = {
  "src/domain": ["src/application", "src/ports", "src/adapters"],
  "src/ports": ["src/application", "src/adapters"],
  "src/application": ["src/adapters"],
};

/**
 * What a domain module may reach outside its own layer, and under exactly which
 * names.
 *
 * The source states this as a **denylist** -- `socket`, `subprocess`, `shutil`
 * and three more -- with `os` allowed wholesale because `expanduser` consults
 * `$HOME` and stats nothing. A denylist is the wrong shape here for a reason
 * that is specific to Node rather than to taste: `node:net` is the socket
 * module and `isIP` is a pure predicate that happens to live in it, so a
 * denylist either forbids `node:net` and fails today, or admits it and admits
 * `createConnection` with it. Naming the **bindings** is what separates the two.
 *
 * So this is an allowlist, and it fails closed: any other bare specifier from a
 * domain module is a violation, and so is a namespace or default import of an
 * allowed one, because neither can be checked binding by binding. Widening it
 * is a diff to this table with a reason beside it, which is the review the
 * source's `os` allowance got once and could not ask for again.
 */
const DOMAIN_ALLOWED_BUILTINS: Readonly<Record<string, readonly string[]>> = {
  // `hashlib` on the Python side. Hashing is computation, not I/O.
  "node:crypto": ["createHash"],
  // The `os` allowance the source records, narrowed to the one function it was
  // granted for: `homedir()` is what `expanduser` consults.
  "node:os": ["homedir"],
  // `isIP` is a pure predicate. The rest of `node:net` is the socket module the
  // source's denylist names first.
  "node:net": ["isIP"],
};

/**
 * Below this, assume the walk broke rather than that the tree shrank.
 *
 * The same number the source uses. It is a floor under a renamed layout, not a
 * target: the ledger is the thing that notices a single module going missing.
 */
const MINIMUM_MODULES = 10;

/** Every TypeScript module under `src/`, repo-relative, sorted. */
function moduleFiles(directory: string = SRC_ROOT): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(join(ROOT, directory))) {
    const path = `${directory}/${entry}`;
    if (statSync(join(ROOT, path)).isDirectory()) {
      found.push(...moduleFiles(path));
    } else if (entry.endsWith(".ts")) {
      found.push(path);
    }
  }
  return found.sort();
}

const MODULES = moduleFiles();
const DOMAIN_MODULES = MODULES.filter((module) => module.startsWith("src/domain/"));

/** One module reached from another, with the names it binds. */
interface ImportRef {
  /** The specifier exactly as written. */
  readonly specifier: string;
  /**
   * The bindings this import introduces: `*` for a namespace import or a
   * re-export of everything, `default` for a default import, and the exported
   * name for each named one. Empty for a side-effect import, which binds
   * nothing and still executes the module.
   */
  readonly names: readonly string[];
  /** The module a relative specifier names, repo-relative; null for a bare one. */
  readonly resolved: string | null;
}

/**
 * The module a relative specifier names, by path arithmetic alone.
 *
 * Deliberately not a filesystem lookup: the detector's own cases below feed it
 * sources that name modules which do not exist, and a resolver that consulted
 * the disk could not answer for them. `tsc` is what checks that a specifier
 * resolves to a real file; this only has to agree with it about *which* file.
 *
 * D-0003: relative imports carry an explicit `.js` suffix, and the module
 * behind one is the `.ts` file beside it.
 */
function resolveSpecifier(specifier: string, from: string): string | null {
  if (!specifier.startsWith(".")) {
    return null;
  }
  const target = slash(join(dirname(from), specifier));
  return target.endsWith(".js") ? `${target.slice(0, -".js".length)}.ts` : target;
}

/**
 * Every module `source` reaches, found in its syntax tree.
 *
 * Six routes, because a scan that knows only about `import ... from` is a scan
 * a boundary can be crossed around. `export ... from` reaches a module exactly
 * as an import does and is how a layer leaks through a barrel; `import(...)`
 * inside a function body is the source's "hidden in a function" case; a
 * type-only import and an `import("x").Y` type node are its `TYPE_CHECKING`
 * case, and neither survives into the emitted JavaScript, so a runtime probe
 * would see nothing.
 */
function importsIn(source: string, from: string): readonly ImportRef[] {
  const tree = ts.createSourceFile(from, source, ts.ScriptTarget.ES2023, true, ts.ScriptKind.TS);
  const found: ImportRef[] = [];

  const record = (specifier: string, names: readonly string[]): void => {
    found.push({ specifier, names, resolved: resolveSpecifier(specifier, from) });
  };

  const namesOf = (clause: ts.ImportClause | undefined): string[] => {
    if (clause === undefined) {
      return [];
    }
    const names: string[] = [];
    if (clause.name !== undefined) {
      names.push("default");
    }
    const bindings = clause.namedBindings;
    if (bindings !== undefined) {
      if (ts.isNamespaceImport(bindings)) {
        names.push("*");
      } else {
        for (const element of bindings.elements) {
          names.push((element.propertyName ?? element.name).text);
        }
      }
    }
    return names;
  };

  function visit(node: ts.Node): void {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      record(node.moduleSpecifier.text, namesOf(node.importClause));
    } else if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier !== undefined &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      const clause = node.exportClause;
      const names =
        clause !== undefined && ts.isNamedExports(clause)
          ? clause.elements.map((element) => (element.propertyName ?? element.name).text)
          : ["*"];
      record(node.moduleSpecifier.text, names);
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      ts.isStringLiteral(node.moduleReference.expression)
    ) {
      record(node.moduleReference.expression.text, ["*"]);
    } else if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument) &&
      ts.isStringLiteral(node.argument.literal)
    ) {
      record(node.argument.literal.text, ["*"]);
    } else if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const argument = node.arguments[0];
      const reachesAModule =
        callee.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(callee) && callee.text === "require");
      if (reachesAModule && argument !== undefined && ts.isStringLiteral(argument)) {
        record(argument.text, ["*"]);
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(tree);
  return found;
}

/**
 * The same thing as a set of module ids: a resolved path, or the bare specifier
 * when there is nothing to resolve.
 *
 * This is the shape the source's `imported_modules` returns, and what the
 * detector's cases assert against.
 */
function importedModules(source: string, from: string): Set<string> {
  return new Set(importsIn(source, from).map((ref) => ref.resolved ?? ref.specifier));
}

/** The package a bare specifier names, normalised; null for a relative or builtin one. */
function packageOf(specifier: string): string | null {
  if (specifier.startsWith(".") || specifier.startsWith("node:")) {
    return null;
  }
  const parts = specifier.split("/");
  const name = specifier.startsWith("@") ? parts.slice(0, 2).join("/") : (parts[0] ?? "");
  return name === "" ? null : name.toLowerCase().split("_").join("-");
}

/** Whether a specifier reaches interlock, scoped or not. */
function reachesForbiddenPackage(specifier: string): boolean {
  const name = packageOf(specifier);
  if (name === null) {
    return false;
  }
  const unscoped = name.startsWith("@") ? (name.split("/")[1] ?? name) : name;
  return FORBIDDEN_PACKAGES.has(name) || FORBIDDEN_PACKAGES.has(unscoped);
}

// --- the detector -----------------------------------------------------------

/**
 * `[id, source, from, expected]`. The assertions below are only worth their
 * runtime if these hold.
 *
 * These are the source's seven detector cases re-pointed one for one. Each one
 * keeps its subject -- a route by which an import reaches a module without
 * looking like the obvious `import x from "y"` -- and changes the language it
 * is written in. The two the source spells as Python-only hiding places have
 * direct counterparts: an import in a function body is a dynamic `import(...)`,
 * and an `if TYPE_CHECKING` import is a type-only one.
 */
const DETECTOR_CASES: readonly (readonly [
  id: string,
  source: string,
  from: string,
  expected: string,
])[] = [
  ["side-effect-import", 'import "interlock";', "src/domain/probe.ts", "interlock"],
  [
    "namespace-import",
    'import * as cp from "claude-org-runtime/control-plane.js";',
    "src/domain/probe.ts",
    "claude-org-runtime/control-plane.js",
  ],
  [
    "named-import-across-two-layers",
    'import { loadCatalog } from "../adapters/toml-catalog/loader.js";',
    "src/domain/probe.ts",
    "src/adapters/toml-catalog/loader.ts",
  ],
  [
    "parent-relative-re-export",
    'export * from "../ports/catalog-source.js";',
    "src/domain/probe.ts",
    "src/ports/catalog-source.ts",
  ],
  [
    "sibling-relative-import",
    'import { configDigest } from "./digest.js";',
    "src/domain/probe.ts",
    "src/domain/digest.ts",
  ],
  [
    "dynamic-import-in-a-function-body",
    'async function f() {\n  await import("interlock");\n}\n',
    "src/domain/probe.ts",
    "interlock",
  ],
  [
    "type-only-import",
    'import type { Run } from "interlock";\ntype Handle = import("interlock").Handle;\n',
    "src/domain/probe.ts",
    "interlock",
  ],
];

parametrize(
  "the detector sees imports wherever they hide",
  DETECTOR_CASES.map(([id, source, from, expected]) => [id, { source, from, expected }] as const),
  ({ source, from, expected }) => {
    expect(importedModules(source, from)).toContain(expected);
  },
);

test("the detector also sees the CommonJS routes ESM forbids", () => {
  // Target-only, and the reason is the testkit's rule rather than a source
  // case: `importsIn` handles `require(...)` and `import x = require(...)`, and
  // machinery no case exercises is untested surface. Neither route can appear
  // under D-0003 -- `tsc` refuses both in an ESM module with
  // `verbatimModuleSyntax` -- which is precisely why the handling would rot
  // unwatched if nothing asserted it. It stays because the sweep should not
  // depend on the module setting staying what it is today.
  const from = "src/domain/probe.ts";
  expect(importedModules('const x = require("interlock");', from)).toContain("interlock");
  expect(importedModules('import x = require("./digest.js");', from)).toContain(
    "src/domain/digest.ts",
  );
});

// --- the walk ---------------------------------------------------------------

test("the walk found the module graph it is supposed to guard", () => {
  // Without this, a renamed layout would turn every case below into a case
  // that vacuously passes over an empty list.
  expect(existsSync(join(ROOT, SRC_ROOT))).toBe(true);
  expect(MODULES.length).toBeGreaterThanOrEqual(MINIMUM_MODULES);
  expect(MODULES).toContain("src/domain/clone-source.ts");
});

// --- the boundaries ---------------------------------------------------------

const PER_MODULE = MODULES.map((module) => [module, module] as const);
const PER_DOMAIN_MODULE = DOMAIN_MODULES.map((module) => [module, module] as const);

parametrize("no module imports interlock", PER_MODULE, (module) => {
  const offenders = importsIn(sourceOf(module), module)
    .filter((ref) => reachesForbiddenPackage(ref.specifier))
    .map((ref) => ref.specifier)
    .sort();
  expect(offenders, `${module} imports ${offenders.join(", ")}`).toEqual([]);
});

parametrize("each layer imports only inward", PER_MODULE, (module) => {
  const refs = importsIn(sourceOf(module), module);
  for (const [layer, forbidden] of Object.entries(FORBIDDEN_BY_LAYER)) {
    if (!module.startsWith(`${layer}/`)) {
      continue;
    }
    const offenders = refs
      .filter(
        (ref) =>
          ref.resolved !== null &&
          forbidden.some((bad) => ref.resolved === bad || ref.resolved?.startsWith(`${bad}/`)),
      )
      .map((ref) => ref.resolved)
      .sort();
    expect(offenders, `${module} may not import ${offenders.join(", ")}`).toEqual([]);
  }
});

test("the interlock adapter seam has no TypeScript counterpart", () => {
  // D-0014: the seam is reserved on the Python side and deliberately has no
  // counterpart here, so the source's "it exists and is empty" becomes "it does
  // not exist". Opening it is a decision that has to revisit D-0014 first, and
  // this is what makes that unavoidable rather than reviewable.
  //
  // The first assertion is what keeps the second from passing because
  // `adapters` was renamed out from under it.
  expect(existsSync(join(ROOT, "src/adapters"))).toBe(true);
  expect(existsSync(join(ROOT, "src/adapters/interlock"))).toBe(false);
});

parametrize("no module is named core or runtime", PER_MODULE, (module) => {
  // Those names belong to interlock's vocabulary; reusing them makes a boundary
  // review harder than it needs to be (section 8).
  const segments = slash(module).split("/");
  const stem = (segments.at(-1) ?? "").replace(/\.ts$/, "");
  const directories = segments.slice(0, -1);
  expect([stem, ...directories]).not.toContain("core");
  expect([stem, ...directories]).not.toContain("runtime");
});

parametrize("no module says provider-neutral", PER_MODULE, (module) => {
  // One word, so that a boundary reviewer greps for one word (section 1).
  expect(sourceOf(module)).not.toContain("provider-neutral");
});

parametrize("the domain performs no I/O", PER_DOMAIN_MODULE, (module) => {
  // G1 never clones, never touches a network and never reads a working tree.
  // The allowlist above is the whole of what is permitted, and the reasons are
  // recorded there.
  const offenders: string[] = [];
  for (const ref of importsIn(sourceOf(module), module)) {
    if (ref.resolved !== null) {
      continue;
    }
    const allowed = DOMAIN_ALLOWED_BUILTINS[ref.specifier];
    if (allowed === undefined) {
      offenders.push(ref.specifier);
      continue;
    }
    for (const name of ref.names) {
      if (!allowed.includes(name)) {
        offenders.push(`${ref.specifier}:${name}`);
      }
    }
  }
  expect(offenders.sort(), `${module} reaches ${offenders.join(", ")}`).toEqual([]);
});

// --- the anchors ------------------------------------------------------------

/** The string of a `baseDir: "/x"` or `baseDir: f("/x")` literal, if any. */
function posixOnlyLiteral(node: ts.Expression): string | null {
  let value: ts.Expression = node;
  const first = ts.isCallExpression(value) ? value.arguments[0] : undefined;
  if (first !== undefined) {
    value = first;
  }
  if (!ts.isStringLiteral(value)) {
    return null;
  }
  // A relative literal is fine: one case asserts a relative anchor is refused,
  // and that assertion means the same thing on every platform.
  return value.text.startsWith("/") ? value.text : null;
}

/** Every `.ts` file under `test/`, so the sweep cannot miss a directory. */
function testFiles(directory = "test"): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(join(ROOT, directory))) {
    const path = `${directory}/${entry}`;
    if (statSync(join(ROOT, path)).isDirectory()) {
      found.push(...testFiles(path));
    } else if (entry.endsWith(".ts")) {
      found.push(path);
    }
  }
  return found.sort();
}

test("no test anchors a layer on a posix-only literal", () => {
  // A drive-less literal like "/srv/catalog" is absolute on POSIX and
  // drive-RELATIVE on Windows, so a test using one passes everywhere except the
  // windows-latest cells -- which is a slow and expensive way to find out.
  // Anchors come from `test/support.ts`'s `absolute()` instead. This check
  // exists because reviewing for it by eye missed one twice.
  const offenders: string[] = [];
  let anchors = 0;
  for (const path of testFiles()) {
    const tree = ts.createSourceFile(
      path,
      readFileSync(join(ROOT, path), "utf8"),
      ts.ScriptTarget.ES2023,
      true,
      ts.ScriptKind.TS,
    );
    const visit = (node: ts.Node): void => {
      if (
        ts.isPropertyAssignment(node) &&
        (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)) &&
        node.name.text === "baseDir"
      ) {
        anchors += 1;
        const literal = posixOnlyLiteral(node.initializer);
        if (literal !== null) {
          const line = tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1;
          offenders.push(`${path}:${line}: ${JSON.stringify(literal)}`);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(tree);
  }
  // The sweep's own subject has to exist, or this passes by finding nothing to
  // look at. The source case cannot check this and neither could a reviewer:
  // it is the difference between "no anchor is POSIX-only" and "no anchor".
  expect(anchors).toBeGreaterThan(0);
  expect(
    offenders,
    `these anchors are absolute on POSIX only; build them with support.absolute() instead: ${offenders.join(", ")}`,
  ).toEqual([]);
});
