/**
 * Unified backtrace utilities for finding ground-row predecessors.
 *
 * Used by:
 *  - InfiniteGraph right-click (full path from target to ground)
 *  - App auto-highlight go-to-ground (ground point only)
 */
import { Point } from '../types';
import { getSmallestPrimeFactor, isPrime } from './math';
import { isDefaultStepModifierConfig, type StepDelta } from './stepModifier';

export interface BacktraceConfig {
  /** Returns true when the point follows the false-step branch. */
  checkGoesNorth: (x: number, y: number) => boolean;
  /** Returns the destination after taking the false-step branch from (x, y). */
  getFalseStepDestination: (x: number, y: number) => Point;
  /** Delta used when the move-right condition is true. */
  trueStepDelta: StepDelta;
  /** Delta used when the move-right condition is false. */
  falseStepDelta: StepDelta;
  /** Returns the effective x-coordinate accounting for row shift. */
  getEffectiveX: (gx: number, gy: number) => number;
  /** The y-coordinate of the ground row. */
  groundRow: number;
  /** Maximum nodes to explore in BFS reverse search. */
  backtraceLimit: number;
  /** Whether the identity-transform prime-skip is available (transform ≡ n). */
  canFastForward: boolean;
  /** Whether wraparound is enabled. */
  wraparound: boolean;
  /**
   * The active transform function f(n) applied to coordinates.
   * Required for the generalized east-skip when canFastForward is false.
   */
  transform?: (n: number) => number;
  /** Returns the right-hand operand used by the default coprime rule on row y. */
  getDefaultRuleTargetValue?: (y: number) => number;
  /** Whether the move-right rule is `gcd(x,y)==1` (default coprime). */
  isDefaultCoprimeRule?: boolean;
  /**
   * When ground row is unreachable, prefer the **leftmost** ancestor
   * (longest partial trace) instead of rightmost.  Default: true.
   */
  partialTraceLeftmost?: boolean;
}

// ── Internal constants ──────────────────────────────────────────────────────

/** Hard cap on iterations for a single forward probe / trace. */
const MAX_PROBE_ITERS = 50_000_000;
/** Maximum search range (left of target.x) for the binary search. */
const MAX_SEARCH_RANGE = 1_000_000_000;

// ── Modular arithmetic helpers ──────────────────────────────────────────────

/** Extended-GCD-based modular inverse. Returns a^-1 mod m, or null. */
function modInverse(a: number, m: number): number | null {
  a = ((a % m) + m) % m;
  let [old_r, r] = [a, m];
  let [old_s, s] = [1, 0];
  while (r !== 0) {
    const q = Math.floor(old_r / r);
    [old_r, r] = [r, old_r - q * r];
    [old_s, s] = [s, old_s - q * s];
  }
  if (old_r !== 1) return null;
  return ((old_s % m) + m) % m;
}

// ── Linear-transform detection ──────────────────────────────────────────────

interface LinearTransform { a: number; b: number; }

/** Heuristically detect f(n) = a*n + b by evaluating at a few points. */
function detectLinear(f: (n: number) => number): LinearTransform | null {
  const f0 = Math.round(f(0));
  const f1 = Math.round(f(1));
  const a = f1 - f0;
  const b = f0;
  if (Math.round(f(2))  !== 2  * a + b) return null;
  if (Math.round(f(10)) !== 10 * a + b) return null;
  if (Math.round(f(-3)) !== -3 * a + b) return null;
  return { a, b };
}

// ── East-skip computation ───────────────────────────────────────────────────

/**
 * For the default coprime rule with a LINEAR transform f(n) = a*n + b:
 * Given current effectiveX on row y (where we are going east), return the
 * number of east steps to the NEXT position where the default rule goes north.
 *
 * Algorithm: for each distinct prime factor q of the rule's right-hand operand,
 * solve
 *   a*(effectiveX + delta) + b ≡ 0 (mod q)
 * for the smallest delta > 0. Return the minimum across all factors.
 */
function linearEastSkip(
  effectiveX: number,
  targetValue: number,
  lin: LinearTransform,
): number {
  const { a, b } = lin;
  const transformedY = Math.abs(Math.round(targetValue));
  if (transformedY <= 1) return 1;

  let V = transformedY;
  let bestDelta = Infinity;

  while (V > 1) {
    const q = getSmallestPrimeFactor(V);
    const aMod = ((a % q) + q) % q;

    if (aMod === 0) {
      // a ≡ 0 (mod q) → f(x) ≡ b (mod q) for all x.
      // If q | b every x triggers north (delta=1); otherwise this factor never helps.
      if (b % q === 0) return 1;
    } else {
      // Solve a*delta ≡ -(a*effectiveX + b)  (mod q)
      const fCurrent = a * effectiveX + b;
      const negFMod = ((-(fCurrent % q)) % q + q) % q;
      const inv = modInverse(aMod, q);
      if (inv !== null) {
        let delta = (negFMod * inv) % q;
        if (delta <= 0) delta += q;
        if (delta < bestDelta) bestDelta = delta;
      }
    }

    // Remove all factors of q from V.
    while (V % q === 0) V = V / q;
  }

  return bestDelta === Infinity ? 1 : bestDelta;
}

/**
 * Threshold for full root enumeration of f(t) ≡ 0 (mod p).
 * For primes ≤ this value we scan all residues; for larger primes we
 * use only the known root y % p (since p | f(y) ⇒ f(y%p) ≡ 0 mod p).
 */
const GENERAL_ROOT_THRESHOLD = 10_000;

/** Module-level root cache: maps prime → sorted array of roots of f mod p. */
let _rootCacheTransform: ((n: number) => number) | null = null;
let _rootCache: Map<number, number[]> = new Map();

function getRootCache(transform: (n: number) => number): Map<number, number[]> {
  if (transform !== _rootCacheTransform) {
    _rootCacheTransform = transform;
    _rootCache = new Map();
  }
  return _rootCache;
}

/**
 * For the default coprime rule with a NON-LINEAR transform:
 * Use known-root optimisation (from the Python find_paths.py whiteout):
 *
 * Since p | f(y), y%p is a root of f mod p.  The forward skip to the next
 * position where p | f(effectiveX + delta) is:
 *   delta = ((root - effectiveX%p) + p) % p   (with 0 → p).
 *
 * For small primes (≤ GENERAL_ROOT_THRESHOLD) we enumerate ALL roots and
 * cache them – this finds the smallest delta across all roots.  For large
 * primes the known root y%p alone is used (O(1) per prime factor).
 */
function generalEastSkip(
  effectiveX: number,
  gy: number,
  targetValue: number,
  transform: (n: number) => number,
): number | null {
  const transformedY = Math.abs(Math.round(targetValue));
  if (transformedY <= 1) return null;

  const cache = getRootCache(transform);
  const absGy = Math.abs(Math.round(gy));
  const exMod = effectiveX >= 0 ? effectiveX : effectiveX; // keep signed for modular arith

  let V = transformedY;
  let bestDelta = Infinity;

  while (V > 1) {
    const q = getSmallestPrimeFactor(V);

    if (q <= GENERAL_ROOT_THRESHOLD) {
      // Enumerate or fetch cached roots of f mod q.
      let roots = cache.get(q);
      if (!roots) {
        roots = [];
        for (let t = 0; t < q; t++) {
          if (Math.round(transform(t)) % q === 0) roots.push(t);
        }
        cache.set(q, roots);
      }
      for (const r of roots) {
        let delta = ((r - (exMod % q)) % q + q) % q;
        if (delta === 0) delta = q;
        if (delta < bestDelta) bestDelta = delta;
        if (bestDelta === 1) break;
      }
    } else {
      // Large prime: use known root y%p (since q | f(y), y%q is a root).
      const knownRoot = ((absGy % q) + q) % q;
      let delta = ((knownRoot - (exMod % q)) % q + q) % q;
      if (delta === 0) delta = q;
      if (delta < bestDelta) bestDelta = delta;
    }

    while (V % q === 0) V = V / q;
    if (bestDelta === 1) break;
  }

  return bestDelta === Infinity ? null : bestDelta;
}

function getDefaultRuleTargetAbs(
  gy: number,
  config: BacktraceConfig,
): number | null {
  const raw =
    config.getDefaultRuleTargetValue?.(gy) ??
    config.transform?.(gy);
  if (!Number.isFinite(raw)) return null;
  return Math.abs(Math.round(raw));
}

function usesDefaultStepTraversal(config: BacktraceConfig): boolean {
  return isDefaultStepModifierConfig({
    trueStep: config.trueStepDelta,
    falseStep: config.falseStepDelta,
  });
}

// ── Unified east-skip entry point ───────────────────────────────────────────

/**
 * Compute east-skip for the current position using the best available
 * strategy.  Returns null when no skip is available (fallback to +1).
 */
function eastSkip(
  currX: number,
  currY: number,
  config: BacktraceConfig,
  linear: LinearTransform | null,
): number | null {
  if (!usesDefaultStepTraversal(config)) return null;
  const targetValue = getDefaultRuleTargetAbs(currY, config);

  // Identity-transform fast path — handles ALL y values (prime and composite)
  // by iterating over distinct prime factors of |y|, matching the approach
  // from find_paths.py whiteout_std.
  if (config.canFastForward) {
    if (targetValue === null || targetValue <= 1) return null;
    const effectiveX = config.getEffectiveX(currX, currY);

    let remaining = targetValue;
    let bestSkip = Infinity;

    while (remaining > 1) {
      const p = getSmallestPrimeFactor(remaining);
      const rem = ((effectiveX % p) + p) % p;
      // Skip to the next x where p | effectiveX, i.e. effectiveX + skip ≡ 0 (mod p).
      const skip = rem === 0 ? p : p - rem;
      if (skip < bestSkip) bestSkip = skip;
      if (bestSkip === 1) break;
      // Remove all factors of p.
      while (remaining % p === 0) remaining = remaining / p;
    }

    return bestSkip === Infinity ? null : bestSkip;
  }

  // Generalised skip for the default coprime rule with a known transform.
  if (!config.isDefaultCoprimeRule || !config.transform) return null;
  if (targetValue === null || targetValue <= 1) return null;

  const effectiveX = config.getEffectiveX(currX, currY);

  if (linear) {
    return linearEastSkip(effectiveX, targetValue, linear);
  }
  return generalEastSkip(effectiveX, currY, targetValue, config.transform);
}

// ── Forward-probe outcome ───────────────────────────────────────────────────

type Outcome = 'hit' | 'tooLeft' | 'tooRight';

/**
 * Simulate a forward path from (startX, groundY) and classify whether it
 * reaches, undershoots, or overshoots `target`.
 */
function probeOutcome(
  startX: number,
  target: Point,
  groundY: number,
  config: BacktraceConfig,
  linear: LinearTransform | null,
): Outcome {
  const { checkGoesNorth, getFalseStepDestination, trueStepDelta } = config;
  const defaultSteps = usesDefaultStepTraversal(config);
  let currX = startX;
  let currY = groundY;
  let lastXAtTargetRow: number | null = null;
  let iters = 0;

  while (iters < MAX_PROBE_ITERS) {
    if (currX === target.x && currY === target.y) return 'hit';
    if (currY === target.y) lastXAtTargetRow = currX;
    if (defaultSteps) {
      if (currY > target.y) break;
      if (currX > target.x && currY <= target.y) return 'tooRight';
    }

    if (checkGoesNorth(currX, currY)) {
      const next = getFalseStepDestination(currX, currY);
      if (next.x === currX && next.y === currY) break;
      currX = next.x;
      currY = next.y;
      iters += 1;
      continue;
    }

    // Try optimised east-skip.
    const skip = eastSkip(currX, currY, config, linear);
    if (skip !== null && skip > 1) {
      const nextX = currX + skip;
      // Target on this row lies within the skip range → hit.
      if (currY === target.y && target.x > currX && target.x <= nextX) return 'hit';
      // Would overshoot target column before reaching its row → too far right.
      if (currY < target.y && target.x + 1 > currX && target.x + 1 <= nextX) return 'tooRight';
      currX = nextX;
      iters += skip;
      continue;
    }

    currX += trueStepDelta.x;
    currY += trueStepDelta.y;
    iters += 1;
  }

  if (lastXAtTargetRow === null) return 'tooLeft';
  if (lastXAtTargetRow < target.x) return 'tooLeft';
  if (lastXAtTargetRow > target.x) return 'tooRight';
  return 'hit';
}

// ── Binary search strategy ──────────────────────────────────────────────────

/**
 * Binary search for the rightmost ground-row x whose deterministic forward
 * path reaches `target`.  Works for all deterministic north/east rules,
 * taking advantage of the prime-skip optimisation when available.
 */
function findGroundByBinarySearch(
  target: Point,
  groundY: number,
  config: BacktraceConfig,
  linear: LinearTransform | null,
): Point | null {
  const maxX = Math.floor(target.x);
  const minX = maxX - MAX_SEARCH_RANGE;

  // Exponential probing to find a lower bound where the outcome is no longer 'tooRight'.
  let probeX = maxX;
  let step = 1;
  while (probeX > minX && probeOutcome(probeX, target, groundY, config, linear) === 'tooRight') {
    probeX = maxX - step;
    step *= 2;
  }
  const lowBound = Math.max(minX, probeX);

  // Standard binary search within [lowBound, maxX].
  let lo = lowBound;
  let hi = maxX;
  let bestHit: number | null = null;

  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const out = probeOutcome(mid, target, groundY, config, linear);
    if (out === 'tooLeft') {
      lo = mid + 1;
    } else if (out === 'tooRight') {
      hi = mid - 1;
    } else {
      bestHit = mid;
      lo = mid + 1; // keep looking for a rightward hit
    }
  }

  return bestHit !== null ? { x: bestHit, y: groundY } : null;
}

// ── BFS reverse search ──────────────────────────────────────────────────────

/**
 * BFS backward from `target` to find the best reachable predecessor.
 *
 * Two candidates are tracked separately:
 *   1. **bestGround** – a node at `groundY` (rightmost x wins, giving the
 *      most direct path from ground to target).
 *   2. **bestPartial** – a node below `target.y` but not necessarily at
 *      ground.  When `partialTraceLeftmost` is true (default), the
 *      bottommost-leftmost node is chosen (longest trace); otherwise
 *      bottommost-rightmost.
 *
 * `bestGround` is always preferred when it exists; `bestPartial` is the
 * fallback when ground is unreachable.
 */
function findGroundByReverseSearch(
  target: Point,
  groundY: number,
  config: BacktraceConfig,
): Point {
  const {
    checkGoesNorth,
    getFalseStepDestination,
    wraparound,
    backtraceLimit,
    trueStepDelta,
    falseStepDelta,
  } = config;
  const preferLeftmost = config.partialTraceLeftmost !== false; // default true
  const maxVisited = Math.floor(backtraceLimit);

  const qX: number[] = [target.x];
  const qY: number[] = [target.y];
  const seen = new Set<string>();
  seen.add(`${target.x},${target.y}`);

  let qHead = 0;
  let visited = 0;

  // Ground-row candidate: rightmost x at groundY.
  let bestGround: Point | null = target.y === groundY ? target : null;
  // Partial candidate: bottommost (min y), then leftmost or rightmost x.
  let bestPartial: Point | null = null;

  const updateGround = (px: number) => {
    if (!bestGround || px > bestGround.x) {
      bestGround = { x: px, y: groundY };
    }
  };

  const updatePartial = (px: number, py: number) => {
    if (!bestPartial) { bestPartial = { x: px, y: py }; return; }
    if (py < bestPartial.y) { bestPartial = { x: px, y: py }; return; }
    if (py === bestPartial.y) {
      if (preferLeftmost ? px < bestPartial.x : px > bestPartial.x) {
        bestPartial = { x: px, y: py };
      }
    }
  };

  const enqueue = (px: number, py: number) => {
    if (py < groundY) return;
    const key = `${px},${py}`;
    if (seen.has(key)) return;
    seen.add(key);
    qX.push(px);
    qY.push(py);
    if (py === groundY) updateGround(px);
    else updatePartial(px, py);
  };

  while (qHead < qX.length && visited < maxVisited) {
    const cx = qX[qHead];
    const cy = qY[qHead];
    qHead += 1;
    visited += 1;

    if (cy <= groundY) continue;

    // ── True-branch predecessor ───────────────────────────────────────────
    const truePredX = cx - trueStepDelta.x;
    const truePredY = cy - trueStepDelta.y;
    if (
      !checkGoesNorth(truePredX, truePredY) &&
      truePredX + trueStepDelta.x === cx &&
      truePredY + trueStepDelta.y === cy
    ) {
      enqueue(truePredX, truePredY);
    }

    // ── False-branch predecessor ──────────────────────────────────────────
    const falsePredX = cx - falseStepDelta.x;
    const falsePredY = cy - falseStepDelta.y;
    if (checkGoesNorth(falsePredX, falsePredY)) {
      const next = getFalseStepDestination(falsePredX, falsePredY);
      if (next.x === cx && next.y === cy) {
        enqueue(falsePredX, falsePredY);
      }
    }

    // ── Wrapped false-branch predecessor ──────────────────────────────────
    if (wraparound && cy === 0) {
      const wrappedPredX = cx - falseStepDelta.x;
      const wrappedPredY = cx - falseStepDelta.y;
      if (
        (wrappedPredX !== falsePredX || wrappedPredY !== falsePredY) &&
        checkGoesNorth(wrappedPredX, wrappedPredY)
      ) {
        const next = getFalseStepDestination(wrappedPredX, wrappedPredY);
        if (next.x === cx && next.y === cy) {
          enqueue(wrappedPredX, wrappedPredY);
        }
      }
    }
  }

  return bestGround ?? bestPartial ?? target;
}

// ── Forward path builder ────────────────────────────────────────────────────

/**
 * Deterministic forward trace from `from` toward `target`, collecting every
 * visited point.  Returns null only if the trace can't reach `target` within
 * MAX_PROBE_ITERS steps (should not happen when `from` is a verified
 * predecessor).
 */
function traceForwardPath(
  from: Point,
  target: Point,
  config: BacktraceConfig,
  linear: LinearTransform | null,
): Point[] | null {
  const { checkGoesNorth, getFalseStepDestination, trueStepDelta } = config;
  const defaultSteps = usesDefaultStepTraversal(config);
  const points: Point[] = [from];
  let currX = from.x;
  let currY = from.y;
  let steps = 0;

  while (steps < MAX_PROBE_ITERS) {
    if (currX === target.x && currY === target.y) return points;
    // Safety: if we've clearly overshot, bail.
    if (defaultSteps && (currY > target.y || (currX > target.x + 1 && currY >= target.y))) break;

    if (checkGoesNorth(currX, currY)) {
      const next = getFalseStepDestination(currX, currY);
      if (next.x === currX && next.y === currY) break;
      currX = next.x;
      currY = next.y;
      points.push({ x: currX, y: currY });
      steps += 1;
      continue;
    }

    // Try optimised east-skip.
    const skip = eastSkip(currX, currY, config, linear);
    if (skip !== null && skip > 1) {
      const nextX = currX + skip;

      // If the target lies on this row within the skip range, land on it directly.
      if (currY === target.y && target.x > currX && target.x <= nextX) {
        points.push({ x: target.x, y: currY });
        return points;
      }

      currX = nextX;
      points.push({ x: currX, y: currY });
      steps += skip;
      continue;
    }

    currX += trueStepDelta.x;
    currY += trueStepDelta.y;
    points.push({ x: currX, y: currY });
    steps += 1;
  }

  return null; // did not reach target
}

function compareBackwardPredecessors(
  a: Point,
  b: Point,
  preferLeftmost: boolean,
): number {
  if (a.y !== b.y) return a.y - b.y;
  if (a.x !== b.x) return preferLeftmost ? a.x - b.x : b.x - a.x;
  return 0;
}

function getImmediatePredecessors(
  target: Point,
  config: BacktraceConfig,
): Point[] {
  const {
    checkGoesNorth,
    getFalseStepDestination,
    wraparound,
    trueStepDelta,
    falseStepDelta,
  } = config;
  const predecessors: Point[] = [];
  const seen = new Set<string>();

  const pushIfValid = (candidate: Point, usesFalseStep: boolean) => {
    const key = `${candidate.x},${candidate.y}`;
    if (seen.has(key)) return;

    if (usesFalseStep) {
      if (!checkGoesNorth(candidate.x, candidate.y)) return;
      const next = getFalseStepDestination(candidate.x, candidate.y);
      if (next.x !== target.x || next.y !== target.y) return;
    } else {
      if (checkGoesNorth(candidate.x, candidate.y)) return;
      if (
        candidate.x + trueStepDelta.x !== target.x ||
        candidate.y + trueStepDelta.y !== target.y
      ) {
        return;
      }
    }

    seen.add(key);
    predecessors.push(candidate);
  };

  pushIfValid(
    {
      x: target.x - trueStepDelta.x,
      y: target.y - trueStepDelta.y,
    },
    false
  );

  pushIfValid(
    {
      x: target.x - falseStepDelta.x,
      y: target.y - falseStepDelta.y,
    },
    true
  );

  if (wraparound && target.y === 0) {
    pushIfValid(
      {
        x: target.x - falseStepDelta.x,
        y: target.x - falseStepDelta.y,
      },
      true
    );
  }

  return predecessors;
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Find the bottommost-rightmost reachable predecessor of `target`.
 * Ideally this is a ground-row point, but when ground is unreachable the
 * deepest (lowest y) predecessor found by BFS is returned instead.
 * Returns `target` itself when target.y ≤ groundRow or no predecessor
 * exists.
 */
export function findGroundPoint(target: Point, config: BacktraceConfig): Point {
  const groundY = Math.max(1, Math.round(config.groundRow));
  if (target.y <= groundY) return target;

  // Detect linear transform once for all probes in this call.
  const linear = config.transform ? detectLinear(config.transform) : null;

  if (usesDefaultStepTraversal(config)) {
    // Binary search works for the default deterministic east/north step pair.
    const result = findGroundByBinarySearch(target, groundY, config, linear);
    if (result) return result;
  }

  // Fallback: BFS reverse — returns bottommost-rightmost reachable
  // predecessor (may not be at ground row).
  return findGroundByReverseSearch(target, groundY, config);
}

/**
 * Build the full path from `target` back to its bottommost-rightmost
 * reachable predecessor (ideally at ground row).  Returns an array where
 * `[0]` = target and `[last]` = the deepest reachable ancestor.
 */
export function findPathToGround(target: Point, config: BacktraceConfig): Point[] {
  const groundY = Math.max(1, Math.round(config.groundRow));
  if (target.y < groundY) return [target];

  const ground = findGroundPoint(target, config);
  if (ground.x === target.x && ground.y === target.y) return [target];

  const linear = config.transform ? detectLinear(config.transform) : null;

  // Build forward path ground → target, then reverse so [0] = target.
  const forward = traceForwardPath(ground, target, config, linear);
  if (forward) {
    forward.reverse();
    return forward;
  }

  // Forward trace couldn't reach target within the iteration budget.
  // Return a partial path: just the found predecessor and the target.
  return [target, ground];
}

/**
 * Walk backward from `target` by repeatedly choosing the most southern
 * reachable immediate predecessor, breaking ties leftmost by default.
 * Returns `[target]` when no predecessor exists.
 */
export function traceBackwardPath(
  target: Point,
  maxSteps: number,
  config: BacktraceConfig,
): Point[] {
  const limit = Math.max(0, Math.floor(maxSteps));
  const preferLeftmost = config.partialTraceLeftmost !== false;
  const points: Point[] = [target];
  const seen = new Set<string>([`${target.x},${target.y}`]);
  let curr = target;

  for (let steps = 0; steps < limit; steps += 1) {
    const next = getImmediatePredecessors(curr, config)
      .filter((candidate) => !seen.has(`${candidate.x},${candidate.y}`))
      .sort((a, b) => compareBackwardPredecessors(a, b, preferLeftmost))[0];

    if (!next) break;

    points.push(next);
    seen.add(`${next.x},${next.y}`);
    curr = next;
  }

  return points;
}

/**
 * Trace forward from `from` for up to `maxSteps`, returning only the final
 * position (no intermediate points).
 */
export function traceForwardEndpoint(
  from: Point,
  maxSteps: number,
  config: BacktraceConfig,
): Point {
  const { checkGoesNorth, getFalseStepDestination, trueStepDelta } = config;
  const linear = config.transform ? detectLinear(config.transform) : null;
  let currX = from.x;
  let currY = from.y;
  let steps = 0;
  const limit = Math.max(0, Math.floor(maxSteps));

  while (steps < limit) {
    if (checkGoesNorth(currX, currY)) {
      const next = getFalseStepDestination(currX, currY);
      if (next.x === currX && next.y === currY) break; // stuck
      currX = next.x;
      currY = next.y;
      steps += 1;
      continue;
    }

    const skip = eastSkip(currX, currY, config, linear);
    if (skip !== null && skip > 1) {
      const bounded = Math.min(skip, limit - steps);
      currX += bounded;
      steps += bounded;
      continue;
    }

    currX += trueStepDelta.x;
    currY += trueStepDelta.y;
    steps += 1;
  }

  return { x: currX, y: currY };
}

/**
 * Follow the deterministic path forward until reaching a prime row `p`
 * at an x-coordinate divisible by `p`, or until the step budget is exhausted.
 * Returns the first such anchor point, or null if none is found in time.
 */
export function findPrimeRowAnchorPoint(
  from: Point,
  maxSteps: number,
  config: BacktraceConfig,
): Point | null {
  const { checkGoesNorth, getFalseStepDestination, getEffectiveX, trueStepDelta } = config;
  const linear = config.transform ? detectLinear(config.transform) : null;
  let currX = Math.round(from.x);
  let currY = Math.round(from.y);
  let steps = 0;
  const limit = Math.max(0, Math.floor(maxSteps));

  const isPrimeAnchor = (x: number, y: number) => {
    const row = Math.round(y);
    if (row < 2 || !isPrime(row)) return false;
    const effectiveX = Math.round(getEffectiveX(x, y));
    return ((effectiveX % row) + row) % row === 0;
  };

  if (isPrimeAnchor(currX, currY)) {
    return { x: currX, y: currY };
  }

  while (steps < limit) {
    if (checkGoesNorth(currX, currY)) {
      const next = getFalseStepDestination(currX, currY);
      if (next.x === currX && next.y === currY) break;
      currX = next.x;
      currY = next.y;
      steps += 1;
    } else {
      const skip = eastSkip(currX, currY, config, linear);
      if (skip !== null && skip > 1) {
        const bounded = Math.min(skip, limit - steps);
        currX += bounded;
        steps += bounded;
      } else {
        currX += trueStepDelta.x;
        currY += trueStepDelta.y;
        steps += 1;
      }
    }

    if (isPrimeAnchor(currX, currY)) {
      return { x: currX, y: currY };
    }
  }

  return null;
}
