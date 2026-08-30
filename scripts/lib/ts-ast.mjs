/**
 * The repository's one way to get a TypeScript syntax tree.
 *
 * Two checks parse this tree's own sources rather than importing them --
 * `scripts/parity-check.mjs` counts non-running test constructs, and
 * `test/architecture/import-boundaries.test.ts` walks the module graph -- and
 * both called `ts.createSourceFile` on text they had read themselves.
 * TypeScript 7 removes that entry point. The compiler is a Go program now, and
 * the `typescript` package's main export is `{ version, versionMajorMinor }`
 * and nothing else; the syntax tree is still reachable, but only as data the
 * compiler sends back. `typescript/unstable/ast` decodes it and
 * `typescript/unstable/sync` is what asks for it. Parsing is therefore no
 * longer a pure function over a string -- it is a question put to a running
 * program -- and this module is where that difference is absorbed so that the
 * two callers can go on asking the old question.
 *
 * **The old signature is kept deliberately**: `parseSourceFile(fileName,
 * source)` parses the text it is given, as if it lived at that path. The
 * alternative -- asking the compiler for the file at that path on disk -- reads
 * better until it meets `import-boundaries.test.ts`, whose detector cases parse
 * hand-written snippets attributed to a module (`src/domain/probe.ts`) that has
 * never existed. Those cases are how the detector itself is tested, so a parse
 * that can only see real files would have quietly cost the sweep its own test.
 *
 * So the text is mounted in a **virtual filesystem** holding one file and a
 * `tsconfig.json` that turns everything off: `noLib` and `noResolve` mean no
 * `lib.d.ts` is loaded and no import is followed, because a syntax tree is all
 * either caller wants and resolving the rest would drag the real tree in behind
 * a snippet that is not part of it. Nothing here touches disk.
 *
 * The extension is carried over from `fileName` and it is load-bearing. `.tsx`
 * is not TypeScript with extra tokens, it is a different grammar, and parsing
 * one as `.ts` yields a tree wrong in both directions: a dynamic import inside
 * JSX goes unexposed, and JSX text is read as code that is not there. The
 * compiler takes script kind from the extension, so naming the virtual file
 * with the caller's own extension is what asks for the right grammar -- the
 * question `scriptKindOf` used to answer by hand.
 */

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createVirtualFileSystem } from "typescript/unstable/fs";
import { API } from "typescript/unstable/sync";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

/**
 * Where the virtual file is mounted.
 *
 * Under the repository root rather than at `/parse`, so the path has the shape
 * the host platform uses -- a bare `/`-rooted path is not what an absolute path
 * looks like on the three Windows cells this suite runs in. Nothing is created
 * here: the directory exists only inside the virtual filesystem.
 */
const PARSE_DIR = `${resolve(ROOT, ".ts-ast-parse").split("\\").join("/")}`;
const TSCONFIG = `${PARSE_DIR}/tsconfig.json`;

const TSCONFIG_TEXT = JSON.stringify({
  compilerOptions: {
    target: "ES2023",
    module: "NodeNext",
    moduleResolution: "NodeNext",
    // A syntax tree is the whole product. Loading the default library or
    // following an import would cost real work for an answer nobody reads.
    noLib: true,
    noResolve: true,
  },
  include: ["**/*"],
});

/** The extensions a caller may ask for; anything else is a caller bug. */
const PARSEABLE = [".tsx", ".mts", ".cts", ".ts"];

/**
 * The compiler is spawned on first use and kept for the life of the process.
 *
 * Starting it costs a process launch, so doing it per file would turn a sweep
 * over a few dozen modules into a few dozen compiler launches. Reusing it costs
 * about half a millisecond per file instead, including a full walk of the tree.
 */
let session = null;

function sessionOf() {
  if (session === null) {
    const fs = createVirtualFileSystem({ [TSCONFIG]: TSCONFIG_TEXT });
    session = { api: new API({ cwd: PARSE_DIR, fs }), fs, mounted: null };
  }
  return session;
}

/**
 * The syntax tree for `source`, parsed as though it were the file at
 * `fileName` (a repo-relative path, used for its extension and in errors).
 */
export function parseSourceFile(fileName, source) {
  const state = sessionOf();

  const extension = PARSEABLE.find((candidate) => fileName.endsWith(candidate));
  if (extension === undefined) {
    throw new Error(
      `ts-ast: ${fileName} has no TypeScript extension, so there is no grammar to parse it with`,
    );
  }

  // One file at a time. Leaving previous parses mounted would grow the program
  // by one file per call, and `include` would have the compiler re-read all of
  // them on every snapshot.
  const path = `${PARSE_DIR}/source${extension}`;
  if (state.mounted !== null && state.mounted !== path) {
    state.fs.removeFile(state.mounted);
  }
  state.fs.writeFile(path, source);
  state.mounted = path;

  // `changed` is what invalidates the compiler's copy. Without it the snapshot
  // is new, the call succeeds, and the tree returned is the *previous* file's
  // -- so a sweep would examine its first input a few dozen times and report
  // nothing wrong with any of the others. That failure is silent and green,
  // which is why the assertion below exists rather than a comment saying to be
  // careful.
  const snapshot = state.api.updateSnapshot({
    openProjects: [TSCONFIG],
    fileChanges: { changed: [path] },
  });
  const project = snapshot.getProject(TSCONFIG);
  const tree = project?.program.getSourceFile(path);
  if (tree === undefined) {
    throw new Error(`ts-ast: the compiler did not return a tree for ${fileName}`);
  }
  if (tree.text !== source) {
    throw new Error(
      `ts-ast: the tree returned for ${fileName} is not the text that was asked about. ` +
        "A stale tree makes every sweep over it pass by finding nothing.",
    );
  }
  return tree;
}

/**
 * Shut the compiler down.
 *
 * It is a child process, so leaving it running keeps the host alive: a script
 * that forgets this does not exit, and a test run that forgets it hangs after
 * the last assertion has passed.
 */
export function disposeParser() {
  if (session !== null) {
    session.api.close();
    session = null;
  }
}
