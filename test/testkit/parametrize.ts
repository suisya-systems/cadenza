import { test } from "vitest";

/**
 * `@pytest.mark.parametrize`, with pytest's **node ids** preserved.
 *
 * Vendored from continuo (`test/testkit/parametrize.ts`) under the reuse
 * declared in DECISIONS.md D-0001. Only `parametrize` comes over; continuo's
 * `product`, which reproduces pytest's collection order for stacked decorators,
 * is left there until a cadenza source file with stacked decorators is actually
 * ported. Vendoring machinery for a case that does not exist yet is how a
 * testkit acquires untested surface.
 *
 * The parity ledger maps one source node id to one target test id, and pytest's
 * node id for a parametrized case is `test_name[param]`. `test.each` names its
 * cases by interpolating the row into a title template, which produces ids that
 * depend on how the translator wrote the template -- so two faithful
 * translations of the same case can carry different target ids, and the ledger
 * then cannot tell a renamed case from a missing one.
 *
 * {@link parametrize} takes the id **explicitly**, exactly as pytest printed
 * it, and produces `name[id]`. That makes the target id a byte-stable function
 * of the source id, which is what `scripts/parity-check.mjs` compares.
 */
export function parametrize<T>(
  name: string,
  cases: readonly (readonly [id: string, value: T])[],
  body: (value: T) => void | Promise<void>,
): void {
  for (const [id, value] of cases) {
    test(`${name}[${id}]`, async () => {
      await body(value);
    });
  }
}
