/**
 * `difflib.get_close_matches`, for the "did you mean" half of a refusal.
 *
 * `resolve_project` names the closest known names when a typed name matches
 * nothing (design doc section 6), and it gets them from CPython's `difflib`.
 * There is no equivalent in the platform, and an edit-distance library is not a
 * substitute: `SequenceMatcher.ratio()` is not Levenshtein and does not agree
 * with it. It is `2 * M / T`, where `M` is the total size of the matching blocks
 * found by a recursive longest-matching-block search that prefers the earliest
 * such block, and `T` is the combined length of the two sequences. A different
 * similarity measure would produce a different set of suggestions, and the
 * suggestions are what the operator reads.
 *
 * The whole of `difflib` is not ported -- only the path `get_close_matches`
 * takes, with `isjunk=None`.
 *
 * Strings are compared **code point by code point**, via `Array.from`, because
 * that is what iterating a Python `str` does. Comparing UTF-16 code units would
 * score a name containing an astral character against a different sequence than
 * CPython scores.
 */

/** The default `autojunk` threshold: elements of `b` that are too popular. */
const AUTOJUNK_MINIMUM = 200;

/** Where each element of `b` occurs, minus the elements `autojunk` discards. */
function indexSequence(b: readonly string[]): ReadonlyMap<string, readonly number[]> {
  const b2j = new Map<string, number[]>();
  b.forEach((element, index) => {
    const indices = b2j.get(element);
    if (indices === undefined) {
      b2j.set(element, [index]);
    } else {
      indices.push(index);
    }
  });
  // `autojunk`: in a long sequence, an element appearing in more than 1% of it
  // is treated as noise. Names are far shorter than this, but the rule is part
  // of the function being ported, not of the inputs it happens to get.
  if (b.length >= AUTOJUNK_MINIMUM) {
    const limit = Math.floor(b.length / 100) + 1;
    for (const [element, indices] of [...b2j]) {
      if (indices.length > limit) {
        b2j.delete(element);
      }
    }
  }
  return b2j;
}

interface Match {
  readonly a: number;
  readonly b: number;
  readonly size: number;
}

/**
 * `SequenceMatcher.find_longest_match`, with no junk.
 *
 * The `j2len` roll-forward is CPython's: for each `i`, the length of the run
 * ending at `(i, j)` is one more than the run ending at `(i-1, j-1)`, and ties
 * keep the **earliest** match because `>` is strict.
 */
function findLongestMatch(
  a: readonly string[],
  b: readonly string[],
  b2j: ReadonlyMap<string, readonly number[]>,
  alo: number,
  ahi: number,
  blo: number,
  bhi: number,
): Match {
  let besti = alo;
  let bestj = blo;
  let bestsize = 0;
  let j2len = new Map<number, number>();
  for (let i = alo; i < ahi; i += 1) {
    const newj2len = new Map<number, number>();
    for (const j of b2j.get(a[i] as string) ?? []) {
      if (j < blo) {
        continue;
      }
      if (j >= bhi) {
        break;
      }
      const k = (j2len.get(j - 1) ?? 0) + 1;
      newj2len.set(j, k);
      if (k > bestsize) {
        besti = i - k + 1;
        bestj = j - k + 1;
        bestsize = k;
      }
    }
    j2len = newj2len;
  }
  // Extend the best match on each end. With no junk, CPython's second pair of
  // loops (which sucks up matching junk) can never fire, so only these remain.
  while (besti > alo && bestj > blo && a[besti - 1] === b[bestj - 1]) {
    besti -= 1;
    bestj -= 1;
    bestsize += 1;
  }
  while (
    besti + bestsize < ahi &&
    bestj + bestsize < bhi &&
    a[besti + bestsize] === b[bestj + bestsize]
  ) {
    bestsize += 1;
  }
  return { a: besti, b: bestj, size: bestsize };
}

/** `2 * M / T`: `SequenceMatcher.ratio()`. */
function ratio(a: readonly string[], b: readonly string[]): number {
  const b2j = indexSequence(b);
  let matched = 0;
  // CPython's queue, LIFO, exactly as `get_matching_blocks` walks it. Only the
  // total size is needed here, and neither the sort nor the adjacent-block merge
  // that follows it changes that total.
  const queue: [number, number, number, number][] = [[0, a.length, 0, b.length]];
  while (queue.length > 0) {
    const [alo, ahi, blo, bhi] = queue.pop() as [number, number, number, number];
    const match = findLongestMatch(a, b, b2j, alo, ahi, blo, bhi);
    if (match.size === 0) {
      continue;
    }
    matched += match.size;
    if (alo < match.a && blo < match.b) {
      queue.push([alo, match.a, blo, match.b]);
    }
    if (match.a + match.size < ahi && match.b + match.size < bhi) {
      queue.push([match.a + match.size, ahi, match.b + match.size, bhi]);
    }
  }
  const total = a.length + b.length;
  return total === 0 ? 1.0 : (2.0 * matched) / total;
}

/**
 * `difflib.get_close_matches(word, possibilities, n, cutoff)`.
 *
 * CPython filters with `real_quick_ratio` and `quick_ratio` before `ratio`, and
 * both are upper bounds on `ratio` -- so the three-way test admits exactly what
 * `ratio() >= cutoff` admits, and the filters are omitted rather than
 * reimplemented as decoration.
 *
 * The ordering is `heapq.nlargest`, which the standard library documents as
 * `sorted(reverse=True)[:n]` over `(score, word)` pairs. That second element
 * matters: two candidates with the **same** score come back in *descending*
 * name order, not in the order they were supplied.
 */
export function getCloseMatches(
  word: string,
  possibilities: readonly string[],
  n = 3,
  cutoff = 0.6,
): string[] {
  const b = Array.from(word);
  const scored: [score: number, candidate: string][] = [];
  for (const candidate of possibilities) {
    const score = ratio(Array.from(candidate), b);
    if (score >= cutoff) {
      scored.push([score, candidate]);
    }
  }
  scored.sort((left, right) => {
    if (left[0] !== right[0]) {
      return right[0] - left[0];
    }
    return left[1] < right[1] ? 1 : left[1] > right[1] ? -1 : 0;
  });
  return scored.slice(0, n).map(([, candidate]) => candidate);
}
