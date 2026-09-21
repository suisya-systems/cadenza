/**
 * The worker's allowed commands (D-0040), moved from rondo's
 * `src/access/repository-add.ts`. The first case is rondo's own
 * (`test/access/repository-add.test.ts` at rondo `87e62f0`), carried over so the
 * move is shown not to change the behaviour rondo D-0090 rule 2.6 decided.
 */
import { expect, test } from "vitest";

import {
  allowedBashFor,
  allowedCommandsFor,
  COMMON_BASH,
  toolchainsOf,
} from "../../src/domain/allowed-commands.js";

test("the worker's commands are read off the repository's own files, for TypeScript, Go, Python and Rust", () => {
  expect(toolchainsOf(["package.json", "package-lock.json"])).toEqual(["npm"]);
  expect(toolchainsOf(["package.json"])).toEqual(["npm-unlocked"]);
  expect(allowedBashFor(["npm-unlocked"])).toContain("npm install --ignore-scripts");
  expect(allowedBashFor(["npm-unlocked"])).not.toContain("npm ci --ignore-scripts");
  expect(toolchainsOf(["package.json", "pnpm-lock.yaml"])).toEqual(["pnpm"]);
  expect(toolchainsOf(["package.json", "yarn.lock"])).toEqual(["yarn"]);
  expect(toolchainsOf(["package.json", "bun.lockb"])).toEqual(["bun"]);
  expect(toolchainsOf(["go.mod", "go.sum"])).toEqual(["go"]);
  expect(toolchainsOf(["pyproject.toml", "uv.lock"])).toEqual(["uv"]);
  expect(toolchainsOf(["pyproject.toml", "poetry.lock"])).toEqual(["poetry"]);
  expect(toolchainsOf(["requirements-dev.txt"])).toEqual(["pip"]);
  expect(toolchainsOf(["Cargo.toml", "Cargo.lock"])).toEqual(["cargo"]);
  expect(toolchainsOf(["Cargo.toml", "package.json", "pnpm-lock.yaml"])).toEqual(["pnpm", "cargo"]);
  expect(toolchainsOf(["README.md", "Makefile"])).toEqual([]);

  expect(allowedBashFor([])).toEqual(COMMON_BASH);
  const both = allowedBashFor(["go", "cargo"]);
  expect(both).toEqual(expect.arrayContaining([...COMMON_BASH, "go test:*", "cargo test:*"]));
  expect(new Set(both).size).toBe(both.length);
  expect(allowedBashFor(["npm"])).toContain("npm ci --ignore-scripts");
});

test("a lockfile decides the JavaScript tool in pnpm, yarn, bun, npm order, and a manifest without package.json names none", () => {
  expect(
    toolchainsOf(["package.json", "pnpm-lock.yaml", "yarn.lock", "package-lock.json"]),
  ).toEqual(["pnpm"]);
  expect(toolchainsOf(["package.json", "yarn.lock", "package-lock.json"])).toEqual(["yarn"]);
  expect(toolchainsOf(["package.json", "bun.lock", "package-lock.json"])).toEqual(["bun"]);
  expect(toolchainsOf(["package.json", "npm-shrinkwrap.json"])).toEqual(["npm"]);
  expect(toolchainsOf(["package-lock.json", "pnpm-lock.yaml"])).toEqual([]);
});

test("Python is one family: uv over poetry over pip, and pip from any of its manifests", () => {
  expect(toolchainsOf(["uv.lock", "poetry.lock", "requirements.txt"])).toEqual(["uv"]);
  expect(toolchainsOf(["poetry.lock", "requirements.txt"])).toEqual(["poetry"]);
  for (const file of ["pyproject.toml", "setup.py", "Pipfile", "requirements.txt"]) {
    expect(toolchainsOf([file]), file).toEqual(["pip"]);
  }
  // Top level only: a nested path is not the repository's own manifest.
  expect(toolchainsOf(["docs/requirements.txt", "api/go.mod"])).toEqual([]);
});

test("the npm list is setup's, with the common commands first", () => {
  expect(allowedBashFor(["npm"])).toEqual([
    "echo:*",
    "git switch --detach HEAD~1",
    "git switch -",
    "npm ci --ignore-scripts",
    "npm run:*",
    "npm test:*",
    "node --version",
    "npm --version",
  ]);
});

test("the common commands cannot be changed by a caller", () => {
  expect(Object.isFrozen(COMMON_BASH)).toBe(true);
});

test("a repository's commands are its toolchains' commands, and the common ones alone when none matches", () => {
  expect(allowedCommandsFor(["Cargo.toml", "go.mod"])).toEqual(allowedBashFor(["go", "cargo"]));
  expect(allowedCommandsFor(["README.md"])).toEqual(COMMON_BASH);
  expect(allowedCommandsFor([])).toEqual(COMMON_BASH);
});
