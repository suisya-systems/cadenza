/**
 * `frozenset`, for real.
 *
 * `ReadonlySet<T>` is a **compile-time** claim: the value behind it is an
 * ordinary `Set`, and `Object.freeze` does not close it either -- freezing an
 * object does nothing to a `Set`'s internal slots, so `set.add(...)` still
 * succeeds on a frozen one. That is the same asymmetry DECISIONS.md D-0015
 * records for value objects, arriving at the constants instead: the Python side
 * spells these `frozenset`, which cannot be added to by anyone.
 *
 * It matters because the sets in question are **validation state reachable from
 * the package's public surface**. `ALLOWED_URL_SCHEMES.add("ftp")` would make
 * `parseCloneSource` accept an unauthenticated transport for every catalog
 * afterwards, and a clone is code execution;
 * `SUPPORTED_SCHEMA_VERSIONS.add(2)` would make this build silently accept
 * catalogs written for a schema it does not implement. Neither is reachable in
 * Python, and neither should become reachable by being ported.
 *
 * Raised by review, and the fix is the one the class of problem already has here:
 * make the guarantee survive to runtime rather than stopping at the type.
 */

/** The mutators a `Set` has and a `frozenset` does not. */
const SET_MUTATORS = ["add", "delete", "clear"] as const;

/**
 * A `Set` whose mutators throw, in the spirit of `Object.freeze` on an object.
 *
 * The overrides are **non-enumerable**, so the result still compares equal to a
 * plain `Set` of the same members -- which the case translated from
 * `test_supported_schema_versions_is_exactly_one` depends on -- and everything
 * that reads (`has`, `size`, iteration, spreading) is untouched.
 */
export function frozenSet<T>(values: Iterable<T>): ReadonlySet<T> {
  const set = new Set(values);
  for (const mutator of SET_MUTATORS) {
    Object.defineProperty(set, mutator, {
      value: () => {
        // TypeError is what a write to a frozen object throws in strict mode,
        // so a caller reaching past `ReadonlySet` meets the same failure it
        // would meet reaching past `Readonly<Record<...>>`.
        throw new TypeError(`cannot ${mutator} on a frozen set`);
      },
      enumerable: false,
      writable: false,
      configurable: false,
    });
  }
  return Object.freeze(set);
}
