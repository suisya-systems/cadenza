/**
 * Types for `ts-ast.mjs`.
 *
 * Hand-written because the module it describes is `.mjs`: `tsc` does not read
 * JavaScript here (`allowJs` is off, by the same decision that keeps this a
 * type-check-only configuration), so the TypeScript caller --
 * `test/architecture/import-boundaries.test.ts` -- would otherwise see `any`
 * and lose every guarantee its sweep depends on.
 */

import type { SourceFile } from "typescript/unstable/ast";

/** The tree for `source`, parsed as though it were the file at `fileName`. */
export declare function parseSourceFile(fileName: string, source: string): SourceFile;

/** Shut the compiler child process down. Without it the host does not exit. */
export declare function disposeParser(): void;
