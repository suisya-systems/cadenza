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
 * being discovered takes its target ids with it -- five for one in a pure
 * layer, four elsewhere -- and `scripts/parity-check.mjs` reports them
 * `missing`. A new module under `src/` is the same story in reverse: its ids
 * are `unmapped` until somebody accounts for them.
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

/**
 * Specifiers refused everywhere under `src/`, whatever they are used for.
 *
 * Both spellings, because Node accepts both: `import { createRequire } from
 * "module"` is the same builtin as `"node:module"`, and a set holding only the
 * prefixed form would have refused one of them and admitted the other.
 *
 * `node:module` manufactures a loader: `createRequire(import.meta.url)` returns
 * a function that loads anything, under whatever name the caller binds it to,
 * and `load("interlock")` is then a real dependency this scan cannot see --
 * only a callee literally spelled `require` is followed. Tracking the alias is
 * scope analysis, which is a type checker's job; refusing the one import that
 * can produce it is two lines and closes the route at its source. The pure
 * layers already refuse it by allowlist, so this is what covers `src/adapters`
 * and the barrel. Nothing under `src/` imports it.
 */
const FORBIDDEN_SPECIFIERS = new Set(["node:module", "module"]);

/**
 * Inward only: adapters -> application -> domain, and ports is depended on.
 *
 * Stated as what each layer MAY import rather than what it may not, which is
 * the difference between a check that fails closed and one that fails open. The
 * source names the forbidden layers, and a denylist answers "no" for anything it
 * was not told about: `src/index.ts` is in no layer, so a domain module
 * importing `../index.js` matched no forbidden prefix and passed -- through a
 * barrel that re-exports `src/application` and `src/ports`. A directory added
 * later would have been the same story. An allowlist has no such gap: an import
 * that resolves anywhere but the layers named here is an offender, including one
 * that resolves to the barrel.
 */
const ALLOWED_BY_LAYER: Readonly<Record<string, readonly string[]>> = {
  "src/domain": ["src/domain"],
  "src/ports": ["src/domain", "src/ports"],
  "src/application": ["src/domain", "src/ports", "src/application"],
  "src/adapters": ["src/domain", "src/ports", "src/application", "src/adapters"],
};

/**
 * Modules that belong to no layer, and are therefore constrained by nothing.
 *
 * Exactly one: `src/index.ts`, the package's public barrel, whose whole job is
 * to re-export across layers. Naming it explicitly is what keeps "no layer"
 * from being a way to opt out -- a new top-level module under `src/` is an
 * offender until somebody classifies it.
 */
const UNLAYERED_MODULES = ["src/index.ts"];

/**
 * The layers design section 8 marks `(no I/O)`.
 *
 * **Both** of them. The source parametrises its no-I/O case over `cadenza.domain`
 * alone, and the design document -- the primary oracle, D-0001 -- marks
 * `application/` the same way in the same code block. Where the document and a
 * source test disagree like this the document wins and the gap is recorded
 * rather than transcribed (docs/porting.md section 2), so `src/application` is
 * swept too. Its two cases are target-only: they translate no source case
 * because the source never wrote one.
 */
const PURE_LAYERS = ["src/domain", "src/application"];

/**
 * Every external dependency each layer may have, and under exactly which names.
 *
 * The source states this as a **denylist** for the domain alone -- `socket`,
 * `subprocess`, `shutil` and three more -- with `os` allowed wholesale because
 * `expanduser` consults `$HOME` and stats nothing. Two things are different
 * here, and both were forced by review rather than chosen up front.
 *
 * It is an **allowlist**, because a denylist is the wrong shape in Node:
 * `node:net` IS the socket module the source's denylist names first, and `isIP`
 * is a pure predicate that happens to live in it, so a denylist either forbids
 * `node:net` and fails on `src/domain/python-urlsplit.ts` today, or admits
 * `createConnection` with it. Naming the **bindings** is what separates them.
 *
 * And it covers **every** layer, not only the pure ones. That is what finally
 * closed a category the review found three separate spellings of: a module that
 * loads something this scan cannot follow. `<computed>`, then
 * `createRequire` from `node:module`, then `"module"` without the prefix -- each
 * closed by name, each followed by another name. `node:vm` and
 * `process.getBuiltinModule` were still open. Enumerating loaders is a losing
 * game; enumerating what `src/` is actually allowed to import is a table of six
 * entries that closes all of them at once, including the ones nobody has
 * thought of.
 *
 * It fails closed in the other two directions as well: a namespace or default
 * import of an allowed module is refused, because neither can be checked
 * binding by binding, and so is a side-effect import, which binds nothing and
 * still executes the module.
 */
const ALLOWED_EXTERNALS_BY_LAYER: Readonly<
  Record<string, Readonly<Record<string, readonly string[]>>>
> = {
  "src/domain": {
    // `hashlib` on the Python side. Hashing is computation, not I/O.
    "node:crypto": ["createHash"],
    // The `os` allowance the source records, narrowed to the one function it
    // was granted for: `homedir()` is what `expanduser` consults.
    "node:os": ["homedir"],
    // `isIP` is a pure predicate. The rest of `node:net` is the socket module
    // the source's denylist names first.
    "node:net": ["isIP"],
  },
  // Design section 8 marks `application/` `(no I/O)` beside `domain/`, and it
  // needs nothing external to be so.
  "src/application": {},
  // Ports are protocols. They depend on the domain and on nothing else.
  "src/ports": {},
  // The one layer that is allowed I/O, and only this much of it.
  "src/adapters": {
    "node:fs": ["readFileSync", "statSync"],
    "smol-toml": ["parse", "TomlError"],
  },
};

/** What the barrel, which is in no layer, may reach: nothing. */
const ALLOWED_EXTERNALS_UNLAYERED: Readonly<Record<string, readonly string[]>> = {};

/**
 * Globals that load or execute code from a string.
 *
 * The last route that is not an import at all: `eval('import("interlock")')`
 * and `Function('return import("interlock")')` compile, run, and leave nothing
 * in the tree for the sweep above to read. Refused everywhere under `src/`,
 * for the same reason `<computed>` is an offender rather than a skip.
 */
const CODE_EVALUATION_GLOBALS = ["eval", "Function"];

/**
 * Every global that reaches a builtin module without an import.
 *
 * `eval` and `Function` compile a string. `globalThis` and `global` reach both
 * of those as properties, where the sweep would see somebody else's property
 * name. And `process.getBuiltinModule("module")` hands back `node:module`
 * itself on every supported Node version -- which is why `process` is admitted
 * for `env` and `platform` and refused for everything else, in EVERY layer
 * rather than only the pure ones.
 *
 * That last clause is the correction this list exists for: the pure layers had
 * the `process` rule from the start, and `src/adapters` and the barrel did not,
 * so `process.getBuiltinModule("module").createRequire(import.meta.url)` was
 * open there while D-0022 claimed the route closed.
 *
 * With the per-layer import allowlist beside it, this is the complete set. A
 * module reaches another module by importing it (approved by layer), by
 * building code from a string (`eval`, `Function`), by taking a builtin off the
 * process object (`process`), or by reaching any of those through the global
 * object (`globalThis`, `global`). `import.meta.resolve` produces a URL and
 * still needs an `import()` to use it, which fails closed as `<computed>`.
 */
const LOADER_ROUTE_GLOBALS = [
  ...CODE_EVALUATION_GLOBALS,
  "globalThis",
  "global",
  // `require` and `module` are loaders in their own right, and both survive an
  // alias: `const load = require; load("interlock")` puts no call with a callee
  // named `require` in the tree, and `module.require("interlock")` puts none
  // either. `.cts` is a discovered extension, so both are live routes rather
  // than theoretical. Refused as references, which is the same answer
  // `scripts/parity-check.mjs` gives to an aliased test runner and for the same
  // reason: an alias is what makes an enumeration uncountable. A direct
  // `require("x")` is recorded as an import besides, so it is caught twice.
  "require",
  "module",
];

/**
 * Report a use of `process` beyond the two members any layer may read.
 *
 * Returns the offending spelling, or null when the use is approved.
 */
function processMisuse(node: ts.Identifier, module: string): string | null {
  const parent = node.parent;
  const member =
    parent !== undefined && ts.isPropertyAccessExpression(parent) && parent.expression === node
      ? parent.name.text
      : undefined;
  const allowed = PROCESS_ALLOWED_BY_LAYER[layerOf(module) ?? ""] ?? PROCESS_ALLOWED_MEMBERS;
  if (member !== undefined && allowed.includes(member)) {
    return null;
  }
  return `process.${member ?? "<whole object>"}`;
}

/**
 * I/O Node hands to every module without an import, so no allowlist over
 * specifiers can see it.
 *
 * This has no counterpart in the source and could not have one: reaching the
 * network in Python means importing something, which is why a denylist of
 * modules was a complete answer there. `console` is here because writing to a
 * stream is I/O whatever it is for, and because D-0007 governs what cadenza
 * prints.
 */
const FORBIDDEN_GLOBALS = [
  "fetch",
  "WebSocket",
  "EventSource",
  "XMLHttpRequest",
  "console",
  // `globalThis` and `global` reach every one of the above as a PROPERTY, where
  // the name is somebody else's property name and the sweep below would let it
  // through: `globalThis.fetch(url)`, and `globalThis["fetch"]` besides.
  // Refusing the object itself closes the whole route in one line, and nothing
  // under `src/` has any use for it.
  "globalThis",
  "global",
];

/**
 * The two members of the `process` global a pure layer may read.
 *
 * `env` is `expanduser` consulting `$HOME` (`USERPROFILE`, `HOMEPATH` and
 * `HOMEDRIVE` on the other flavour) -- the one deliberate exception the source
 * records, in the same words. `platform` chooses a path flavour and touches
 * nothing. `src/domain/python-path.ts` is the module that needs both.
 */
const PROCESS_ALLOWED_MEMBERS = ["env", "platform"];

/**
 * The same allowance, per layer, because one layer legitimately needs more.
 *
 * `src/adapters` is the layer design section 8 permits I/O, and
 * `os.path.abspath` -- which `src/adapters/toml-catalog/loader.ts` reproduces
 * to anchor a relative catalog path -- consults the working directory. So
 * `cwd` is approved there and nowhere else. Every other member, in every layer,
 * is refused: `getBuiltinModule` above all, which hands back `node:module`
 * itself and is the route this table exists to close.
 */
const PROCESS_ALLOWED_BY_LAYER: Readonly<Record<string, readonly string[]>> = {
  "src/domain": PROCESS_ALLOWED_MEMBERS,
  "src/application": PROCESS_ALLOWED_MEMBERS,
  "src/ports": PROCESS_ALLOWED_MEMBERS,
  "src/adapters": [...PROCESS_ALLOWED_MEMBERS, "cwd"],
};

/**
 * Whether an identifier is a name being declared or a property being named,
 * rather than a reference to the global of that name.
 *
 * `catalog.fetch` and `{ fetch: ... }` are somebody else's `fetch`. A local
 * *binding* called `fetch` is treated as a declaration here and shadows the
 * global for its scope, which this does not follow -- a later reference in that
 * scope would be reported. Nothing in `src/` declares one, and being told to
 * rename it is a cheaper failure than the alternative.
 */
function isShadowedOrDeclared(node: ts.Identifier): boolean {
  const parent = node.parent;
  if (parent === undefined) {
    return false;
  }
  if (ts.isPropertyAccessExpression(parent) && parent.name === node) {
    return true;
  }
  if (ts.isQualifiedName(parent) && parent.right === node) {
    return true;
  }
  // `import { fetch as loadRecord } from "./record.js"` visits `fetch` as the
  // specifier's PROPERTY name while `parent.name` is `loadRecord`, so a check
  // that looked only at `parent.name` reported a perfectly ordinary relative
  // import as global network I/O. The property half of a rename is the exported
  // name, never a reference to the global that shares its spelling.
  if (
    (ts.isImportSpecifier(parent) || ts.isExportSpecifier(parent) || ts.isBindingElement(parent)) &&
    parent.propertyName === node
  ) {
    return true;
  }
  return (
    (ts.isPropertyAssignment(parent) ||
      ts.isPropertySignature(parent) ||
      ts.isMethodDeclaration(parent) ||
      ts.isMethodSignature(parent) ||
      ts.isVariableDeclaration(parent) ||
      ts.isParameter(parent) ||
      ts.isBindingElement(parent) ||
      ts.isFunctionDeclaration(parent) ||
      ts.isImportSpecifier(parent) ||
      ts.isImportClause(parent)) &&
    parent.name === node
  );
}

/**
 * Below this, assume the walk broke rather than that the tree shrank.
 *
 * The same number the source uses. It is a floor under a renamed layout, not a
 * target: the ledger is the thing that notices a single module going missing.
 */
const MINIMUM_MODULES = 10;

/**
 * The extensions a TypeScript module can carry.
 *
 * `.ts` alone was a hole: `.mts`, `.cts` and `.tsx` are all valid modules that
 * NodeNext resolves, and one added under `src/` would have been skipped by this
 * walk -- receiving no boundary cases and no ledger ids, and free to import
 * interlock or cross a layer with the gate green. `.d.ts` is deliberately
 * absent and is caught as unrecognised: a declaration file under `src/` is not
 * something this port has, and it should be looked at rather than swept.
 */
const MODULE_EXTENSIONS = [".ts", ".mts", ".cts", ".tsx"];

/**
 * Declaration files, which are not modules and must not be read as one.
 *
 * Checked BEFORE `MODULE_EXTENSIONS`, because `.d.ts` ends with `.ts` and would
 * otherwise be discovered as an ordinary module -- and `stemOf` would then call
 * `interlock.d.ts` "interlock.d", which is not `interlock`, so a declaration
 * counterpart of the reserved seam would have walked past the case guarding it.
 */
const DECLARATION_EXTENSIONS = [".d.ts", ".d.mts", ".d.cts"];

/**
 * The Python half, which lives under `src/` too and is not part of this graph.
 *
 * The rewrite happens in place (D-0012): `src/cadenza/` and `src/` coexist
 * until a later PR retires the first (D-0014). So the TypeScript module graph
 * is `src/` MINUS this directory, and the walk skips it whole -- its `.py`
 * files, and the `__pycache__` a local pytest run leaves behind. Nothing is
 * unguarded meanwhile: `tests/test_import_boundaries.py` enforces exactly these
 * boundaries over exactly that tree, and stays green in CI until it goes.
 */
const PYTHON_PACKAGE = "src/cadenza";

/** Files under `src/` the walk did not recognise as modules. See `moduleFiles`. */
const unrecognised: string[] = [];

/**
 * The grammar a module's extension implies.
 *
 * `.tsx` is not TypeScript with extra tokens, it is a different grammar, and
 * parsing one as `ScriptKind.TS` yields a tree that is wrong in both
 * directions: a dynamic import inside JSX is not exposed, and JSX text can be
 * read as code that is not there. Every `createSourceFile` in this file asks
 * for the kind rather than assuming one.
 */
function scriptKindOf(path: string): ts.ScriptKind {
  return path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
}

/** A file name without whichever module extension it carries. */
function stemOf(fileName: string): string {
  const extension = MODULE_EXTENSIONS.find((candidate) => fileName.endsWith(candidate));
  return extension === undefined ? fileName : fileName.slice(0, -extension.length);
}

/** Every TypeScript module under `src/`, repo-relative, sorted. */
function moduleFiles(directory: string = SRC_ROOT): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(join(ROOT, directory))) {
    const path = `${directory}/${entry}`;
    if (path === PYTHON_PACKAGE) {
      continue;
    }
    if (statSync(join(ROOT, path)).isDirectory()) {
      found.push(...moduleFiles(path));
    } else if (
      !DECLARATION_EXTENSIONS.some((extension) => entry.endsWith(extension)) &&
      MODULE_EXTENSIONS.some((extension) => entry.endsWith(extension))
    ) {
      found.push(path);
    } else {
      // Not skipped quietly. A file under `src/` that this walk does not
      // recognise gets no cases and no ledger ids, which is the one way a
      // module can sit in the tree with nothing said about it at all.
      unrecognised.push(path);
    }
  }
  return found.sort();
}

const MODULES = moduleFiles();
const DOMAIN_MODULES = MODULES.filter((module) => module.startsWith("src/domain/"));
const APPLICATION_MODULES = MODULES.filter((module) => module.startsWith("src/application/"));
/** Every module in a layer section 8 marks `(no I/O)`, whichever layer that is. */
const PURE_LAYER_MODULES = MODULES.filter((module) =>
  PURE_LAYERS.some((layer) => module.startsWith(`${layer}/`)),
);

/**
 * The specifier recorded for a dynamic import whose argument is not a literal.
 *
 * `import(name)` is a real edge that no static scan can follow, and dropping it
 * silently would make every check below optional: one variable and the module
 * graph says whatever its author wants. So it is recorded as an offender
 * instead, under a name no package can have. Nothing in `src/` computes a
 * specifier today, and the first thing that does should have to say why.
 *
 * A template with no substitutions -- `import(`interlock`)` -- is NOT this. It
 * is statically known, so it is read as the literal it is.
 */
const COMPUTED_SPECIFIER = "<computed>";

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
  const tree = ts.createSourceFile(from, source, ts.ScriptTarget.ES2023, true, scriptKindOf(from));
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
      if (reachesAModule) {
        // A no-substitution template is a literal with different quotes and is
        // read as one. Anything else -- a variable, a concatenation, a template
        // with a hole in it -- cannot be read at all, and fails closed.
        const literal =
          argument !== undefined &&
          (ts.isStringLiteral(argument) || ts.isNoSubstitutionTemplateLiteral(argument))
            ? argument.text
            : COMPUTED_SPECIFIER;
        record(literal, ["*"]);
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(tree);

  // A triple-slash directive is a dependency TypeScript records on the
  // SourceFile rather than in the tree, so `forEachChild` never reaches it.
  // A `reference types=` directive naming interlock, and a `reference path=`
  // one naming a module in another layer, are both real dependencies -- and the
  // second crosses a layer, which is exactly what this file exists to refuse,
  // arriving by the one route a tree walk cannot see.
  //
  // The directives are spelled without their leading slashes above on purpose:
  // written out in full, this comment is itself read as a directive by tools
  // that scan text rather than syntax, and knip reported the repository as
  // depending on interlock because of it. That is the same text-versus-tree
  // confusion `scripts/parity-check.mjs` records about its own sweep, met from
  // the other side.
  for (const directive of tree.typeReferenceDirectives) {
    record(directive.fileName, ["*"]);
  }
  for (const reference of tree.referencedFiles) {
    record(reference.fileName, ["*"]);
  }
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
  // And nothing under `src/` was passed over. A file the walk does not
  // recognise gets no cases and no ledger ids, so silently skipping one is the
  // single way a module can sit in this tree with nothing said about it.
  expect(unrecognised, `unrecognised files under ${SRC_ROOT}/: ${unrecognised.join(", ")}`).toEqual(
    [],
  );
});

// --- the boundaries ---------------------------------------------------------

const PER_MODULE = MODULES.map((module) => [module, module] as const);
const PER_DOMAIN_MODULE = DOMAIN_MODULES.map((module) => [module, module] as const);
const PER_APPLICATION_MODULE = APPLICATION_MODULES.map((module) => [module, module] as const);

parametrize("no module imports interlock", PER_MODULE, (module) => {
  // A specifier nothing can read is counted here rather than ignored. The
  // question is whether this module reaches interlock, and `import(name)` is
  // an edge for which the honest answer is "unknown" -- which is not "no".
  const offenders = importsIn(sourceOf(module), module)
    .filter(
      (ref) =>
        reachesForbiddenPackage(ref.specifier) ||
        ref.specifier === COMPUTED_SPECIFIER ||
        // Refused for the same reason `<computed>` is: it produces an edge
        // nothing here can follow, and "unknown" is not "no".
        FORBIDDEN_SPECIFIERS.has(ref.specifier),
    )
    .map((ref) => ref.specifier)
    .sort();
  expect(offenders, `${module} imports ${offenders.join(", ")}`).toEqual([]);
});

parametrize("each layer imports only inward", PER_MODULE, (module) => {
  const layer = Object.keys(ALLOWED_BY_LAYER).find((candidate) =>
    module.startsWith(`${candidate}/`),
  );
  if (layer === undefined) {
    // Belonging to no layer is not a way out of this case: it is allowed for
    // the barrel and for nothing else, so a new top-level module under `src/`
    // fails here until it is classified.
    expect(
      UNLAYERED_MODULES,
      `${module} is in no layer; put it in one, or say here why it has none`,
    ).toContain(module);
    return;
  }
  const allowed = ALLOWED_BY_LAYER[layer] ?? [];
  const offenders: string[] = [];
  for (const ref of importsIn(sourceOf(module), module)) {
    const resolved = ref.resolved;
    if (resolved === null) {
      continue;
    }
    if (!allowed.some((ok) => resolved === ok || resolved.startsWith(`${ok}/`))) {
      offenders.push(resolved);
    }
  }
  expect(offenders.sort(), `${module} may not import ${offenders.join(", ")}`).toEqual([]);
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
  // A directory is not the only shape the seam can take. `src/adapters/
  // interlock.ts` is the same seam spelled as a file, and the check above --
  // which asks about one extensionless path -- would stay green for it. Asking
  // `MODULES` instead makes the question total: no module anywhere under `src/`
  // is called `interlock`, whether that name is a directory it sits in or its
  // own. The ledger would also notice such a file, by way of the four target
  // ids it would add, but a gate that reports "unaccounted target test" is not
  // the gate that should be telling you the interlock seam was opened.
  const seam = MODULES.filter((module) => {
    const segments = module.split("/");
    return segments.includes("interlock") || stemOf(segments.at(-1) ?? "") === "interlock";
  });
  expect(seam, `these open the interlock seam: ${seam.join(", ")}`).toEqual([]);
});

parametrize("no module is named core or runtime", PER_MODULE, (module) => {
  // Those names belong to interlock's vocabulary; reusing them makes a boundary
  // review harder than it needs to be (section 8).
  const segments = slash(module).split("/");
  const stem = stemOf(segments.at(-1) ?? "");
  const directories = segments.slice(0, -1);
  expect([stem, ...directories]).not.toContain("core");
  expect([stem, ...directories]).not.toContain("runtime");
});

parametrize("no module says provider-neutral", PER_MODULE, (module) => {
  // One word, so that a boundary reviewer greps for one word (section 1).
  expect(sourceOf(module)).not.toContain("provider-neutral");
});

/** The layer a module sits in, or null for the barrel. */
function layerOf(module: string): string | null {
  return Object.keys(ALLOWED_BY_LAYER).find((layer) => module.startsWith(`${layer}/`)) ?? null;
}

/**
 * Every external dependency a module has that its own layer does not approve.
 *
 * Relative imports are somebody else's question -- `each layer imports only
 * inward` asks it -- so only bare specifiers are considered here.
 */
function unapprovedExternalsIn(module: string): string[] {
  const layer = layerOf(module);
  const table =
    layer === null ? ALLOWED_EXTERNALS_UNLAYERED : (ALLOWED_EXTERNALS_BY_LAYER[layer] ?? {});
  const offenders: string[] = [];
  for (const ref of importsIn(sourceOf(module), module)) {
    if (ref.resolved !== null) {
      continue;
    }
    const allowed = table[ref.specifier];
    if (allowed === undefined) {
      offenders.push(ref.specifier);
      continue;
    }
    if (ref.names.length === 0) {
      // `import "node:net";` binds nothing, so there is nothing to check
      // against the allowlist -- and it still executes the module. An allowance
      // granted for `isIP` is not an allowance for that.
      offenders.push(`${ref.specifier}:<side effect>`);
      continue;
    }
    for (const name of ref.names) {
      if (!allowed.includes(name)) {
        offenders.push(`${ref.specifier}:${name}`);
      }
    }
  }
  return offenders.sort();
}

parametrize("the domain performs no I/O", PER_DOMAIN_MODULE, (module) => {
  // G1 never clones, never touches a network and never reads a working tree.
  // The allowlist above is the whole of what is permitted by import, and the
  // reasons are recorded there. What it cannot see is the global surface, which
  // has its own case below.
  const offenders = unapprovedExternalsIn(module);
  expect(offenders, `${module} reaches ${offenders.join(", ")}`).toEqual([]);
});

parametrize("the application performs no I/O", PER_APPLICATION_MODULE, (module) => {
  // Target-only, and not an extension anybody chose here: design section 8
  // marks `application/` `(no I/O)` in the same code block that marks
  // `domain/`, and D-0001 makes the document the primary oracle. The source
  // parametrises its case over the domain alone, which is the narrower claim.
  const offenders = unapprovedExternalsIn(module);
  expect(offenders, `${module} reaches ${offenders.join(", ")}`).toEqual([]);
});

test("no module in a pure layer reaches a global I/O API", () => {
  // Target-only, and a surface the port created rather than inherited. An
  // import allowlist is a complete answer in Python, where reaching the network
  // means importing something; Node hands `fetch` to every module for free, and
  // `console` writes to a stream nobody imported either. So the allowlist above
  // would report nothing at all about a domain module that simply called
  // `fetch(url)`. This is the case that does.
  //
  // `process` is admitted for exactly the two members the port already depends
  // on: `process.env`, which is `expanduser` consulting `$HOME` -- the one
  // deliberate exception the source itself records -- and `process.platform`,
  // which chooses a path flavour and touches nothing. Every other member, and a
  // bare `process` that cannot be attributed to one, is a violation.
  const offenders: string[] = [];
  for (const module of PURE_LAYER_MODULES) {
    const tree = ts.createSourceFile(
      module,
      sourceOf(module),
      ts.ScriptTarget.ES2023,
      true,
      scriptKindOf(module),
    );
    const report = (node: ts.Node, what: string): void => {
      const line = tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1;
      offenders.push(`${module}:${line}: ${what}`);
    };
    const visit = (node: ts.Node): void => {
      if (ts.isIdentifier(node) && !isShadowedOrDeclared(node)) {
        if (FORBIDDEN_GLOBALS.includes(node.text)) {
          report(node, node.text);
        } else if (node.text === "process") {
          const misuse = processMisuse(node, module);
          if (misuse !== null) {
            report(node, misuse);
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(tree);
  }
  expect(offenders, `these reach I/O without importing it: ${offenders.join(", ")}`).toEqual([]);
});

test("no module manufactures a loader or an unapproved dependency", () => {
  // Target-only, and the case that closed a category rather than a spelling.
  // Review found three separate ways to load something this scan cannot
  // follow -- a computed specifier, `createRequire` from `node:module`, and the
  // same builtin spelled `"module"` -- and closing each by name left the next
  // one open. Two rules close all of them, including `node:vm` and
  // `process.getBuiltinModule`, which nobody had named yet:
  //
  //  1. every bare specifier a module imports must be approved for its layer,
  //     which the two no-I/O cases already assert for `src/domain` and
  //     `src/application`; this extends it to `src/adapters` and the barrel.
  //  2. `eval` and `Function` build code from a string, so they leave nothing
  //     in the tree for rule 1 to read, and are refused outright.
  const offenders: string[] = [];
  for (const module of MODULES) {
    for (const specifier of unapprovedExternalsIn(module)) {
      offenders.push(`${module}: ${specifier}`);
    }
    const tree = ts.createSourceFile(
      module,
      sourceOf(module),
      ts.ScriptTarget.ES2023,
      true,
      scriptKindOf(module),
    );
    const visit = (node: ts.Node): void => {
      if (ts.isIdentifier(node) && !isShadowedOrDeclared(node)) {
        const line = tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1;
        if (LOADER_ROUTE_GLOBALS.includes(node.text)) {
          offenders.push(`${module}:${line}: ${node.text}`);
        } else if (node.text === "process") {
          const misuse = processMisuse(node, module);
          if (misuse !== null) {
            offenders.push(`${module}:${line}: ${misuse}`);
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(tree);
  }
  expect(offenders.sort(), `unapproved: ${offenders.join(", ")}`).toEqual([]);
});

// --- the anchors ------------------------------------------------------------

/**
 * The name a property is written under, however it is spelled.
 *
 * `{ ["baseDir"]: "/srv" }` is a `ComputedPropertyName` and sets exactly the
 * property `{ baseDir: "/srv" }` does, so a check that recognised only
 * identifiers and quoted keys would have skipped it and left the failure to the
 * windows-latest cells. Null for a key that is not statically known, which
 * cannot be `baseDir` by any reading this sweep could make.
 */
function propertyNameOf(name: ts.PropertyName): string | null {
  if (
    ts.isIdentifier(name) ||
    ts.isStringLiteral(name) ||
    ts.isNoSubstitutionTemplateLiteral(name)
  ) {
    return name.text;
  }
  if (ts.isComputedPropertyName(name)) {
    const inner = name.expression;
    if (ts.isStringLiteral(inner) || ts.isNoSubstitutionTemplateLiteral(inner)) {
      return inner.text;
    }
  }
  return null;
}

/** `test/support.ts`'s anchor builder: the one call that makes a path portable. */
const ANCHOR_BUILDER = "absolute";

/** `f(...)` -> "f", `a.f(...)` -> "f"; null for anything else. */
function calleeNameOf(call: ts.CallExpression): string | null {
  const callee = call.expression;
  if (ts.isIdentifier(callee)) {
    return callee.text;
  }
  return ts.isPropertyAccessExpression(callee) ? callee.name.text : null;
}

/**
 * The string of a `baseDir: "/x"` or `baseDir: f("/x")` literal, if any.
 *
 * The wrappers are peeled first, because every one of them has the same runtime
 * value and only one of them is a `StringLiteral`: `` `/srv` `` is a template,
 * `"/srv" as const` is an assertion, `("/srv")` is a parenthesised expression.
 * A check that recognised only quotes would have let the other three through
 * and failed on the windows-latest cells instead, which is the entire failure
 * this case exists to prevent.
 */
function posixOnlyLiteral(node: ts.Expression): string | null {
  let value: ts.Expression = node;
  for (;;) {
    if (ts.isParenthesizedExpression(value)) {
      value = value.expression;
    } else if (
      ts.isAsExpression(value) ||
      ts.isSatisfiesExpression(value) ||
      ts.isTypeAssertionExpression(value)
    ) {
      value = value.expression;
    } else {
      // A call is unwrapped to its first argument -- `nativePath.join("/srv",
      // x)` anchors on a POSIX-only literal just as surely as the bare string
      // does -- EXCEPT a call to the sanctioned builder, whose entire job is to
      // turn parts into an anchor that is absolute on the running platform.
      // Unwrapping that one would report `absolute("/srv")` for being what it
      // was asked to fix.
      const first =
        ts.isCallExpression(value) && calleeNameOf(value) !== ANCHOR_BUILDER
          ? value.arguments[0]
          : undefined;
      if (first === undefined) {
        break;
      }
      value = first;
    }
  }
  if (!ts.isStringLiteral(value) && !ts.isNoSubstitutionTemplateLiteral(value)) {
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
      scriptKindOf(path),
    );
    const visit = (node: ts.Node): void => {
      if (ts.isPropertyAssignment(node) && propertyNameOf(node.name) === "baseDir") {
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
