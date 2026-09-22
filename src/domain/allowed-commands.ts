/**
 * The commands a worker may run in a repository, composed from the file names
 * at the repository's top level (D-0040).
 *
 * Moved from rondo's `src/access/repository-add.ts` (rondo `87e62f0`), where
 * rondo D-0090 rule 2.6 decided the behaviour and a placement audit found it in
 * the wrong repository: what a worker is allowed to do is cadenza's (rondo
 * D-0064 section 5, "Authority and settings"). The behaviour is carried over
 * unchanged -- the detection rules, the tables, the commands every worker has,
 * and a repository matching no family getting those commands alone.
 *
 * **Pure.** The caller lists the files; nothing here reads a disk. The subjects
 * are in `allowed_bash`'s form (a subject, not a `Bash(...)` rule; `:*` is a
 * prefix), and nothing here interprets them.
 */

/**
 * The commands every worker may run whatever the repository builds with:
 * `echo` to report an exit status, and the two exact moves that check a red
 * suite against the commit before the lap's (rondo `scripts/dogfood-env.sh`,
 * the `allowed_bash` comment), and `git merge --no-edit` to take in a branch
 * the worker did not make, so that an ancestry test can pass (D-0042).
 */
export const COMMON_BASH: readonly string[] = Object.freeze([
  "echo:*",
  "git switch --detach HEAD~1",
  "git switch -",
  "git merge --no-edit:*",
]);

/** A toolchain recognised in a repository's top-level files. */
export type Toolchain =
  | "npm"
  /** npm with no lockfile, where `npm ci` refuses to run. */
  | "npm-unlocked"
  | "pnpm"
  | "yarn"
  | "bun"
  | "go"
  | "uv"
  | "poetry"
  | "pip"
  | "cargo";

/**
 * Each toolchain's commands. The install lines are exact and skip install
 * scripts where the tool can: the fence sees the worker's tool calls and not
 * the processes a package's script starts.
 */
const BASH: Readonly<Record<Toolchain, readonly string[]>> = {
  npm: ["npm ci --ignore-scripts", "npm run:*", "npm test:*", "node --version", "npm --version"],
  "npm-unlocked": [
    "npm install --ignore-scripts",
    "npm run:*",
    "npm test:*",
    "node --version",
    "npm --version",
  ],
  pnpm: [
    "pnpm install --frozen-lockfile --ignore-scripts",
    "pnpm run:*",
    "pnpm test:*",
    "node --version",
    "pnpm --version",
  ],
  yarn: [
    "yarn install --frozen-lockfile --ignore-scripts",
    "yarn install --immutable --mode=skip-build",
    "yarn run:*",
    "yarn test:*",
    "node --version",
    "yarn --version",
  ],
  bun: [
    "bun install --frozen-lockfile --ignore-scripts",
    "bun run:*",
    "bun test:*",
    "bun --version",
  ],
  go: ["go mod download", "go build:*", "go test:*", "go vet:*", "gofmt:*", "go version"],
  uv: ["uv sync:*", "uv run:*", "uv --version"],
  poetry: ["poetry install:*", "poetry run:*", "poetry --version"],
  pip: [
    "python3 -m venv .venv",
    ".venv/bin/pip install:*",
    ".venv/bin/python:*",
    ".venv/bin/pytest:*",
    "python3 --version",
  ],
  cargo: [
    "cargo build:*",
    "cargo test:*",
    "cargo check:*",
    "cargo clippy:*",
    "cargo fmt:*",
    "cargo --version",
  ],
};

/**
 * The toolchains a repository's top-level file names say it builds with:
 * TypeScript and JavaScript by their lockfile, Go, Python by its lockfile, and
 * Rust. A repository may have several, and gets each one's commands.
 *
 * ponytail: the top level only, so a monorepo whose manifests sit in
 * subdirectories reads as none. Walking the tree is the upgrade.
 */
export function toolchainsOf(files: readonly string[]): readonly Toolchain[] {
  const has = (name: string) => files.includes(name);
  const found: Toolchain[] = [];
  if (has("package.json")) {
    found.push(
      has("pnpm-lock.yaml")
        ? "pnpm"
        : has("yarn.lock")
          ? "yarn"
          : has("bun.lock") || has("bun.lockb")
            ? "bun"
            : has("package-lock.json") || has("npm-shrinkwrap.json")
              ? "npm"
              : "npm-unlocked",
    );
  }
  if (has("go.mod")) {
    found.push("go");
  }
  if (has("uv.lock")) {
    found.push("uv");
  } else if (has("poetry.lock")) {
    found.push("poetry");
  } else if (
    ["pyproject.toml", "setup.py", "Pipfile"].some(has) ||
    files.some((file) => /^requirements.*\.txt$/.test(file))
  ) {
    found.push("pip");
  }
  if (has("Cargo.toml")) {
    found.push("cargo");
  }
  return found;
}

/** The worker's commands for those toolchains: {@link COMMON_BASH} first, each once. */
export function allowedBashFor(toolchains: readonly Toolchain[]): readonly string[] {
  return [...new Set([...COMMON_BASH, ...toolchains.flatMap((one) => BASH[one])])];
}

/**
 * The worker's commands for a repository whose top-level file names are
 * `files`: {@link allowedBashFor} over {@link toolchainsOf}. A repository no
 * family matches gets {@link COMMON_BASH} alone (rondo D-0090 rule 2.6).
 */
export function allowedCommandsFor(files: readonly string[]): readonly string[] {
  return allowedBashFor(toolchainsOf(files));
}
