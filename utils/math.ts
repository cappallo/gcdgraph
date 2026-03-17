// Greatest Common Divisor (uses BigInt when inputs exceed safe integer range)
export const gcdBigInt = (a: bigint, b: bigint): bigint => {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) {
    const r = x % y;
    x = y;
    y = r;
  }
  return x;
};

export const gcdIsOneBigInt = (a: bigint, b: bigint): boolean => {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  if (x === 1n || y === 1n) return true;
  while (y !== 0n) {
    const r = x % y;
    if (r === 1n) return true;
    x = y;
    y = r;
  }
  return x === 1n;
};

export const gcd = (a: number, b: number): number => {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return NaN;

  const absA = Math.abs(Math.round(a));
  const absB = Math.abs(Math.round(b));

  // Small values stay in Number space for speed.
  if (absA <= Number.MAX_SAFE_INTEGER && absB <= Number.MAX_SAFE_INTEGER) {
    let x = absA;
    let y = absB;
    while (y !== 0) {
      const r = x % y;
      x = y;
      y = r;
    }
    return x;
  }

  // Fall back to BigInt for large magnitudes to avoid precision loss.
  const bigA = BigInt(Math.trunc(absA));
  const bigB = BigInt(Math.trunc(absB));
  const g = gcdBigInt(bigA, bigB);

  // If the exact gcd fits safely, return the precise number; otherwise return the closest Number.
  if (g <= BigInt(Number.MAX_SAFE_INTEGER)) return Number(g);
  return Number(g);
};

const SPF_SIEVE_LIMIT = 3_000_000;
const SMALL_PRIME_FACTOR_CACHE_LIMIT = 100_000;
const BIGINT_SPF_CACHE_LIMIT = 20_000;

const smallestPrimeFactorCache = new Map<number, number>();
const smallestPrimeFactorBigIntCache = new Map<bigint, bigint>();

const cacheSmallestPrimeFactor = (n: number, factor: number): number => {
  if (smallestPrimeFactorCache.size >= SMALL_PRIME_FACTOR_CACHE_LIMIT) {
    smallestPrimeFactorCache.clear();
  }
  smallestPrimeFactorCache.set(n, factor);
  return factor;
};

const cacheSmallestPrimeFactorBigInt = (n: bigint, factor: bigint): bigint => {
  if (smallestPrimeFactorBigIntCache.size >= BIGINT_SPF_CACHE_LIMIT) {
    smallestPrimeFactorBigIntCache.clear();
  }
  smallestPrimeFactorBigIntCache.set(n, factor);
  return factor;
};

export const getSmallestPrimeFactorBigInt = (nRaw: bigint): bigint => {
  const n = nRaw < 0n ? -nRaw : nRaw;
  if (n <= 1n) return 1n;

  const cached = smallestPrimeFactorBigIntCache.get(n);
  if (cached !== undefined) return cached;

  const smallPrimes = [
    2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n,
  ];
  for (const prime of smallPrimes) {
    if (n === prime) return cacheSmallestPrimeFactorBigInt(n, prime);
    if (n % prime === 0n) return cacheSmallestPrimeFactorBigInt(n, prime);
  }

  if (isProbablePrimeBigInt(n)) {
    return cacheSmallestPrimeFactorBigInt(n, n);
  }

  const divisor = pollardRhoBigInt(n);
  if (divisor === n) {
    return cacheSmallestPrimeFactorBigInt(n, n);
  }

  const left = getSmallestPrimeFactorBigInt(divisor);
  const right = getSmallestPrimeFactorBigInt(n / divisor);
  return cacheSmallestPrimeFactorBigInt(n, left < right ? left : right);
};

// Get smallest prime factor using the sieve for small integers and Pollard Rho for larger ones.
export const getSmallestPrimeFactor = (nRaw: number): number => {
  if (!Number.isFinite(nRaw)) return NaN;

  const n = Math.floor(Math.abs(nRaw));
  if (n <= 1) return 1;

  const cached = smallestPrimeFactorCache.get(n);
  if (cached !== undefined) return cached;

  if (n <= SPF_SIEVE_LIMIT) {
    ensureSieve(n);
    const factor = SIEVE_SPF[n] || n;
    return cacheSmallestPrimeFactor(n, factor);
  }

  const trialLimit = Math.min(Math.floor(Math.sqrt(n)), SPF_SIEVE_LIMIT);
  if (trialLimit >= 2) {
    ensureSieve(trialLimit);
    for (const prime of SIEVE_PRIMES) {
      if (prime > trialLimit) break;
      if (n % prime === 0) return cacheSmallestPrimeFactor(n, prime);
    }
  }

  const factor = getSmallestPrimeFactorBigInt(BigInt(n));
  return cacheSmallestPrimeFactor(n, Number(factor));
};

export const isComposite = (n: number): boolean => {
  if (n <= 3) return false;
  if (n % 2 === 0) return true;
  return getSmallestPrimeFactor(n) !== n;
};

export const getPrimeFactorCount = (n: number): number => {
  n = Math.abs(n);
  if (n <= 1) return 0;
  let count = 0;
  let temp = n;

  // Handle 2 separately
  while (temp % 2 === 0) {
    count++;
    temp /= 2;
  }

  // Odd factors
  let d = 3;
  while (d * d <= temp) {
    while (temp % d === 0) {
      count++;
      temp /= d;
    }
    d += 2;
  }
  if (temp > 1) count++;
  return count;
};

export const isPrime = (n: number): boolean => {
  if (!Number.isFinite(n)) return false;
  n = Math.floor(Math.abs(n));
  if (n <= 1) return false;
  return getSmallestPrimeFactor(n) === n;
};

const MAX_NTH_PRIME = 200_000;
const MAX_NTH_PRIME_POWER = 200_000;
const MAX_PI_N = 3_000_000;

let SIEVE_MAX = 1;
let SIEVE_IS_COMPOSITE = new Uint8Array(2);
let SIEVE_SPF = new Uint32Array(2);
let SIEVE_PI_PREFIX = new Uint32Array(2);
let SIEVE_PRIMES: number[] = [];
let PRIME_POWERS_MAX = 0;
let PRIME_POWERS_LIST: number[] = [];

const buildSieveUpTo = (limit: number): void => {
  const n = Math.max(1, Math.floor(limit));
  const spf = new Uint32Array(n + 1);
  const isComposite = new Uint8Array(n + 1);
  if (n >= 0) isComposite[0] = 1;
  if (n >= 1) {
    isComposite[1] = 1;
    spf[1] = 1;
  }

  const primes: number[] = [];
  const piPrefix = new Uint32Array(n + 1);
  for (let i = 2; i <= n; i++) {
    if (spf[i] === 0) {
      spf[i] = i;
      primes.push(i);
    }
    for (const prime of primes) {
      const composite = i * prime;
      if (composite > n || prime > spf[i]) break;
      spf[composite] = prime;
      isComposite[composite] = 1;
    }
    piPrefix[i] = piPrefix[i - 1] + (spf[i] === i ? 1 : 0);
  }

  SIEVE_MAX = n;
  SIEVE_IS_COMPOSITE = isComposite;
  SIEVE_SPF = spf;
  SIEVE_PI_PREFIX = piPrefix;
  SIEVE_PRIMES = primes;
};

const ensureSieve = (neededMax: number): void => {
  const want = Math.floor(neededMax);
  if (want <= SIEVE_MAX) return;
  const doubled = Math.max(1024, SIEVE_MAX * 2);
  const target = Math.min(MAX_PI_N, Math.max(want, doubled));
  buildSieveUpTo(target);
};

const nthPrimeUpperBound = (n: number): number => {
  if (n <= 0) return 0;
  if (n < 6) return 15;
  const bound = n * (Math.log(n) + Math.log(Math.log(n))) + 3;
  return Math.ceil(bound);
};

export const nthPrime = (nRaw: number): number => {
  if (!Number.isFinite(nRaw)) return NaN;
  const n = Math.floor(Math.abs(nRaw));
  if (n < 1) return NaN;
  if (n > MAX_NTH_PRIME) return NaN;

  const bound = nthPrimeUpperBound(n);
  if (!Number.isFinite(bound) || bound > MAX_PI_N) return NaN;
  ensureSieve(bound);
  return SIEVE_PRIMES[n - 1]!;
};

const buildPrimePowersUpTo = (limit: number): void => {
  const n = Math.max(2, Math.floor(limit));
  ensureSieve(n);
  const powers: number[] = [];
  for (const p of SIEVE_PRIMES) {
    if (p > n) break;
    let value = p;
    while (value <= n) {
      powers.push(value);
      if (value > n / p) break;
      value *= p;
    }
  }
  powers.sort((a, b) => a - b);
  PRIME_POWERS_LIST = powers;
  PRIME_POWERS_MAX = n;
};

export const nthPrimePower = (nRaw: number): number => {
  if (!Number.isFinite(nRaw)) return NaN;
  const n = Math.floor(Math.abs(nRaw));
  if (n < 1) return NaN;
  if (n > MAX_NTH_PRIME_POWER) return NaN;

  const bound = nthPrimeUpperBound(n);
  if (!Number.isFinite(bound) || bound > MAX_PI_N) return NaN;
  if (bound > PRIME_POWERS_MAX) buildPrimePowersUpTo(bound);
  return PRIME_POWERS_LIST[n - 1] ?? NaN;
};

export const primePi = (nRaw: number): number => {
  if (!Number.isFinite(nRaw)) return NaN;
  const n = Math.floor(nRaw);
  if (n < 2) return 0;
  if (n > MAX_PI_N) return NaN;
  ensureSieve(n);
  return SIEVE_PI_PREFIX[n] ?? NaN;
};

// Format GCD string (e.g., prime factorization or simple value)
// For visual simplicity in the graph, we mostly just return the number,
// but we could expand to exponential notation like 2^2 * 3 if desired.
export const formatValue = (n: number): string => {
  if (n === 1) return "";

  // Simple factorization string builder
  const factors: number[] = [];
  let d = 2;
  let temp = n;
  while (d * d <= temp) {
    while (temp % d === 0) {
      factors.push(d);
      temp /= d;
    }
    d++;
  }
  if (temp > 1) factors.push(temp);

  // Group factors: e.g. [2, 2, 3] -> "2²·3"
  const counts = new Map<number, number>();
  factors.forEach((f) => counts.set(f, (counts.get(f) || 0) + 1));

  const parts: string[] = [];
  Array.from(counts.keys())
    .sort((a, b) => a - b)
    .forEach((prime) => {
      const count = counts.get(prime) || 0;
      if (count > 1) {
        parts.push(`${prime}${toSuperscript(count)}`);
      } else {
        parts.push(`${prime}`);
      }
    });

  return parts.join("·");
};

const modPowBigInt = (base: bigint, exp: bigint, mod: bigint): bigint => {
  let result = 1n;
  let b = ((base % mod) + mod) % mod;
  let e = exp;
  while (e > 0n) {
    if (e & 1n) result = (result * b) % mod;
    e >>= 1n;
    if (e > 0n) b = (b * b) % mod;
  }
  return result;
};

const isProbablePrimeBigInt = (n: bigint): boolean => {
  if (n < 2n) return false;

  const smallPrimes = [
    2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n,
  ];

  for (const prime of smallPrimes) {
    if (n === prime) return true;
    if (n % prime === 0n) return false;
  }

  let d = n - 1n;
  let s = 0;
  while ((d & 1n) === 0n) {
    d >>= 1n;
    s += 1;
  }

  for (const witness of smallPrimes) {
    if (witness >= n) continue;
    let x = modPowBigInt(witness, d, n);
    if (x === 1n || x === n - 1n) continue;

    let composite = true;
    for (let i = 1; i < s; i++) {
      x = (x * x) % n;
      if (x === n - 1n) {
        composite = false;
        break;
      }
    }

    if (composite) return false;
  }

  return true;
};

const pollardRhoBigInt = (n: bigint): bigint => {
  if (n % 2n === 0n) return 2n;
  if (n % 3n === 0n) return 3n;

  const constants = [
    1n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n,
  ];
  const starts = [2n, 3n, 5n, 7n, 11n];

  for (const c of constants) {
    for (const start of starts) {
      let x = (start + c) % n;
      if (x === 0n) x = 2n;
      let y = x;
      let d = 1n;
      const step = (value: bigint) => (value * value + c) % n;

      for (let iter = 0; iter < 50_000; iter += 1) {
        x = step(x);
        y = step(step(y));
        const diff = x > y ? x - y : y - x;
        d = gcdBigInt(diff, n);

        if (d === 1n) continue;
        if (d !== n) return d;
        break;
      }
    }
  }

  return n;
};

const factorBigIntInto = (n: bigint, counts: Map<bigint, number>) => {
  if (n === 1n) return;
  if (isProbablePrimeBigInt(n)) {
    counts.set(n, (counts.get(n) || 0) + 1);
    return;
  }

  const divisor = pollardRhoBigInt(n);
  if (divisor === n) {
    counts.set(n, (counts.get(n) || 0) + 1);
    return;
  }

  factorBigIntInto(divisor, counts);
  factorBigIntInto(n / divisor, counts);
};

export const formatBigIntValue = (n: bigint): string => {
  if (n === 1n) return "";

  const factors = new Map<bigint, number>();
  factorBigIntInto(n, factors);

  return Array.from(factors.entries())
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([prime, count]) =>
      count > 1 ? `${prime.toString()}${toSuperscript(count)}` : prime.toString()
    )
    .join("·");
};

const toSuperscript = (num: number): string => {
  const map: Record<string, string> = {
    "0": "⁰",
    "1": "¹",
    "2": "²",
    "3": "³",
    "4": "⁴",
    "5": "⁵",
    "6": "⁶",
    "7": "⁷",
    "8": "⁸",
    "9": "⁹",
  };
  return num
    .toString()
    .split("")
    .map((d) => map[d] || "")
    .join("");
};

// Deterministic color map for primes
const PRIME_COLORS: Record<number, string> = {
  2: "#ef4444", // Red-500
  3: "#eab308", // Yellow-500 (Darker for contrast)
  5: "#a855f7", // Purple-500
  7: "#f97316", // Orange-500
  11: "#3b82f6", // Blue-500
  13: "#22c55e", // Green-500
  17: "#ec4899", // Pink-500
  19: "#06b6d4", // Cyan-500
  23: "#6366f1", // Indigo-500
  29: "#8b5cf6", // Violet-500
  31: "#d946ef", // Fuchsia-500
};

export const getFactorColor = (n: number): string => {
  const spf = getSmallestPrimeFactor(n);
  if (spf === 1) return "#ffffff";

  if (PRIME_COLORS[spf]) return PRIME_COLORS[spf];

  // Fallback procedural color for large primes
  const hue = (spf * 137.508) % 360;
  return `hsl(${hue}, 70%, 60%)`;
};

// Generate a distinct color for partition paths based on index n
export const getPartitionColor = (n: number): string => {
  // Use Golden Angle to separate colors visually
  const hue = ((n * 137.508) % 360 + 360) % 360;
  return `hsl(${hue}, 85%, 45%)`;
};

export type TransformFunction = ((x: number) => number) & {
  evalBigInt?: (x: bigint) => bigint | null;
  isValid?: boolean;
};

export const splitTopLevelExpressions = (input: string): string[] => {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (ch === "(") {
      depth += 1;
      continue;
    }
    if (ch === ")") {
      depth = Math.max(0, depth - 1);
      continue;
    }
    if (ch === "," && depth === 0) {
      const part = input.slice(start, i).trim();
      if (part) parts.push(part);
      start = i + 1;
    }
  }

  const tail = input.slice(start).trim();
  if (tail) parts.push(tail);
  return parts;
};

// Create a safe transform function from a string expression like "2x+1" without using eval/Function
export const createTransformFunction = (
  expression: string
): TransformFunction => {
  if (!expression || !expression.trim()) {
    const identity = ((x: number) => x) as TransformFunction;
    identity.isValid = true;
    return identity;
  }

  // Tokenize the input into numbers, operators, variables, and parentheses
  type Token =
    | { type: "num"; value: number }
    | { type: "var" }
    | { type: "op"; value: string }
    | { type: "func"; name: string }
    | { type: "lparen" }
    | { type: "rparen" };

  const fibCache = new Map<number, number>();
  const fibBigCache = new Map<bigint, bigint>();

  // Fast-doubling Fibonacci on BigInt to avoid precision loss.
  const fibPair = (n: bigint): [bigint, bigint] => {
    if (n === 0n) return [0n, 1n];
    const [a, b] = fibPair(n >> 1n);
    const c = a * ((b << 1n) - a);
    const d = a * a + b * b;
    if (n & 1n) return [d, c + d];
    return [c, d];
  };

  const fibonacciBigInt = (n: bigint): bigint => {
    const absN = n < 0n ? -n : n;
    const cached = fibBigCache.get(absN);
    if (cached !== undefined) return cached;
    const [f] = fibPair(absN);
    fibBigCache.set(absN, f);
    return f;
  };

  const fibonacci = (n: number): number => {
    const absN = Math.floor(Math.abs(n));
    const cached = fibCache.get(absN);
    if (cached !== undefined) return cached;
    if (absN <= 1) return absN;

    const bigVal = fibonacciBigInt(BigInt(absN));
    // Return exact value when it fits; otherwise return a lossy Number but keep the
    // BigInt path available for precise GCD checks.
    const numVal =
      bigVal <= BigInt(Number.MAX_SAFE_INTEGER)
        ? Number(bigVal)
        : Number(bigVal);
    fibCache.set(absN, numVal);
    return numVal;
  };

  const factorialCache = new Map<number, number>();
  const factorial = (n: number): number => {
    n = Math.floor(Math.abs(n));
    if (n <= 1) return 1;
    if (factorialCache.has(n)) return factorialCache.get(n)!;

    // Use BigInt for exact computation
    let result = BigInt(1);
    for (let i = 2; i <= n; i++) {
      result *= BigInt(i);
    }
    const numResult = Number(result);
    factorialCache.set(n, numResult);
    return numResult;
  };

  const funcs: Record<string, (v: number) => number> = {
    sign: (v: number) => {
      if (v === 0) return 0;
      if (v > 0) return 1;
      if (v < 0) return -1;
      return 0; // NaN
    },
    sin: Math.sin,
    cos: Math.cos,
    tan: Math.tan,
    log: Math.log,
    sqrt: Math.sqrt,
    abs: Math.abs,
    floor: Math.floor,
    ceil: Math.ceil,
    round: Math.round,
    exp: Math.exp,
    fib: fibonacci,
    fact: factorial,
    prime: nthPrime,
    primepower: nthPrimePower,
    pi: primePi,
    isprime: (v: number) => (isPrime(v) ? 1 : 0),
  };

  const precedence: Record<string, number> = {
    "+": 1,
    "-": 1,
    "*": 2,
    "/": 2,
    "%": 2,
    "^": 3,
    neg: 4, // unary minus
  };

  const isRightAssoc = (op: string) => op === "^" || op === "neg";

  const tokenize = (src: string): Token[] | null => {
    const tokens: Token[] = [];
    let i = 0;

    while (i < src.length) {
      const ch = src[i];
      if (ch === " " || ch === "\t" || ch === "\n") {
        i++;
        continue;
      }
      if (/[0-9.]/.test(ch)) {
        let j = i + 1;
        while (j < src.length && /[0-9.]/.test(src[j])) j++;
        const num = parseFloat(src.slice(i, j));
        if (isNaN(num)) return null;
        tokens.push({ type: "num", value: num });
        i = j;
        continue;
      }
      if (/[a-zA-Z]/.test(ch)) {
        let j = i + 1;
        while (j < src.length && /[a-zA-Z]/.test(src[j])) j++;
        const name = src.slice(i, j).toLowerCase();
        if (name === "x" || name === "n") {
          tokens.push({ type: "var" });
        } else if (name === "pi") {
          // Allow both constant pi and function pi(n)
          if (src[j] === "(") {
            tokens.push({ type: "func", name: "pi" });
          } else {
            tokens.push({ type: "num", value: Math.PI });
          }
        } else if (name === "e") {
          tokens.push({ type: "num", value: Math.E });
        } else if (funcs[name]) {
          tokens.push({ type: "func", name });
        } else {
          return null; // unknown identifier
        }
        i = j;
        continue;
      }
      if ("+-*/%^".includes(ch)) {
        tokens.push({ type: "op", value: ch });
        i++;
        continue;
      }
      if (ch === "(") {
        tokens.push({ type: "lparen" });
        i++;
        continue;
      }
      if (ch === ")") {
        tokens.push({ type: "rparen" });
        i++;
        continue;
      }
      return null;
    }
    return tokens;
  };

  const toRpn = (tokens: Token[]): Token[] | null => {
    const output: Token[] = [];
    const stack: Token[] = [];
    let prev: Token | null = null;

    for (const tok of tokens) {
      if (tok.type === "num" || tok.type === "var") {
        output.push(tok);
      } else if (tok.type === "func") {
        stack.push(tok);
      } else if (tok.type === "op") {
        const isUnary =
          tok.value === "-" &&
          (prev === null ||
            prev.type === "op" ||
            prev.type === "lparen" ||
            prev.type === "func");
        const opVal = isUnary ? "neg" : tok.value;
        while (stack.length > 0) {
          const top = stack[stack.length - 1];
          if (top.type === "op") {
            const precTop = precedence[top.value];
            const precCur = precedence[opVal];
            if (
              precTop > precCur ||
              (precTop === precCur && !isRightAssoc(opVal))
            ) {
              output.push(stack.pop()!);
              continue;
            }
          } else if (top.type === "func") {
            output.push(stack.pop()!);
            continue;
          }
          break;
        }
        stack.push({ type: "op", value: opVal });
      } else if (tok.type === "lparen") {
        stack.push(tok);
      } else if (tok.type === "rparen") {
        while (stack.length > 0 && stack[stack.length - 1].type !== "lparen") {
          output.push(stack.pop()!);
        }
        if (stack.length === 0) return null;
        stack.pop(); // pop lparen
        if (stack.length > 0 && stack[stack.length - 1].type === "func") {
          output.push(stack.pop()!);
        }
      }
      prev = tok;
    }

    while (stack.length > 0) {
      const t = stack.pop()!;
      if (t.type === "lparen" || t.type === "rparen") return null;
      output.push(t);
    }

    return output;
  };

  const evalRpn = (rpn: Token[], x: number): number | null => {
    const stack: number[] = [];
    for (const tok of rpn) {
      if (tok.type === "num") stack.push(tok.value);
      else if (tok.type === "var") stack.push(x);
      else if (tok.type === "op") {
        if (tok.value === "neg") {
          if (stack.length < 1) return null;
          const a = stack.pop()!;
          stack.push(-a);
          continue;
        }
        if (stack.length < 2) return null;
        const b = stack.pop()!;
        const a = stack.pop()!;
        switch (tok.value) {
          case "+":
            stack.push(a + b);
            break;
          case "-":
            stack.push(a - b);
            break;
          case "*":
            stack.push(a * b);
            break;
          case "/":
            if (b === 0) return null;
            stack.push(a / b);
            break;
          case "%":
            if (b === 0) return null;
            stack.push(a % b);
            break;
          case "^":
            // Use BigInt for integer powers to maintain precision beyond 2^53
            // Note: JavaScript Numbers can't accurately represent integers > 2^53-1,
            // but BigInt arithmetic ensures exact computation before conversion
            if (
              Number.isInteger(a) &&
              Number.isInteger(b) &&
              b >= 0 &&
              a !== 0 &&
              Math.abs(a) < 1e15 &&
              b < 1000
            ) {
              try {
                const result = BigInt(Math.floor(a)) ** BigInt(Math.floor(b));
                stack.push(Number(result));
              } catch {
                // Fallback for overflow or other errors
                stack.push(Math.pow(a, b));
              }
            } else {
              stack.push(Math.pow(a, b));
            }
            break;
          default:
            return null;
        }
      } else if (tok.type === "func") {
        if (stack.length < 1) return null;
        const a = stack.pop()!;
        const fn = funcs[tok.name];
        if (!fn) return null;
        stack.push(fn(a));
      }
    }
    if (stack.length !== 1 || !Number.isFinite(stack[0])) return null;
    return stack[0];
  };

  const evalRpnBigInt = (rpn: Token[], x: bigint): bigint | null => {
    const stack: bigint[] = [];
    for (const tok of rpn) {
      if (tok.type === "num") {
        if (!Number.isInteger(tok.value)) return null;
        stack.push(BigInt(tok.value));
      } else if (tok.type === "var") {
        stack.push(x);
      } else if (tok.type === "op") {
        if (tok.value === "neg") {
          if (stack.length < 1) return null;
          const a = stack.pop()!;
          stack.push(-a);
          continue;
        }
        if (stack.length < 2) return null;
        const b = stack.pop()!;
        const a = stack.pop()!;
        switch (tok.value) {
          case "+":
            stack.push(a + b);
            break;
          case "-":
            stack.push(a - b);
            break;
          case "*":
            stack.push(a * b);
            break;
          case "/":
            if (b === 0n) return null;
            if (a % b !== 0n) return null; // refuse non-integer division
            stack.push(a / b);
            break;
          case "%": {
            if (b === 0n) return null;
            stack.push(a % b);
            break;
          }
          case "^": {
            if (b < 0n) return null;
            const exp = Number(b);
            if (!Number.isFinite(exp) || exp > 32768) return null; // avoid runaway
            let result = 1n;
            let base = a;
            let e = b;
            while (e > 0n) {
              if (e & 1n) result *= base;
              e >>= 1n;
              if (e > 0n) base *= base;
            }
            stack.push(result);
            break;
          }
          default:
            return null;
        }
      } else if (tok.type === "func") {
        if (tok.name === "fib") {
          if (stack.length < 1) return null;
          const a = stack.pop()!;
          stack.push(fibonacciBigInt(a));
          continue;
        }
        if (tok.name === "sign") {
          if (stack.length < 1) return null;
          const a = stack.pop()!;
          stack.push(a === 0n ? 0n : a > 0n ? 1n : -1n);
          continue;
        }
        return null; // unsupported function in bigint mode
      }
    }
    if (stack.length !== 1) return null;
    return stack[0];
  };

  const addImplicitMultiplication = (tokens: Token[]): Token[] => {
    const result: Token[] = [];

    const prevCanMultiply = (t: Token) =>
      t.type === "num" || t.type === "var" || t.type === "rparen";

    const nextCanMultiply = (t: Token) =>
      t.type === "num" ||
      t.type === "var" ||
      t.type === "func" ||
      t.type === "lparen";

    for (let i = 0; i < tokens.length; i++) {
      const cur = tokens[i];
      const prev = result[result.length - 1];

      const isFunctionCall =
        prev && prev.type === "func" && cur.type === "lparen";
      if (
        prev &&
        prevCanMultiply(prev) &&
        nextCanMultiply(cur) &&
        !isFunctionCall
      ) {
        result.push({ type: "op", value: "*" });
      }

      result.push(cur);
    }

    return result;
  };

  const tokens = tokenize(expression.replace(/\s+/g, ""));
  if (!tokens) {
    const fallback = ((x: number) => x) as TransformFunction;
    fallback.isValid = false;
    return fallback;
  }

  const rpn = toRpn(addImplicitMultiplication(tokens));
  if (!rpn) {
    const fallback = ((x: number) => x) as TransformFunction;
    fallback.isValid = false;
    return fallback;
  }

  const bigintFuncs = new Set(["fib", "sign"]);

  const supportsBigInt = tokens.every((t) => {
    if (t.type === "func") return bigintFuncs.has(t.name);
    if (t.type === "num") return Number.isInteger(t.value);
    if (t.type === "op") return true;
    if (t.type === "var") return true;
    return true;
  });

  const fn = ((x: number) => {
    const val = evalRpn(rpn, x);
    return val === null ? x : val;
  }) as TransformFunction;

  if (supportsBigInt) {
    fn.evalBigInt = (x: bigint) => evalRpnBigInt(rpn, x);
  }
  fn.isValid = true;

  return fn;
};

export const isAffineExpression = (expression: string): boolean => {
  if (!expression || !expression.trim()) return true;

  type Token =
    | { type: "num"; value: number }
    | { type: "var" }
    | { type: "op"; value: string }
    | { type: "func"; name: string }
    | { type: "lparen" }
    | { type: "rparen" };

  type AffineForm = {
    slope: number;
    intercept: number;
  };

  const fibPair = (n: bigint): [bigint, bigint] => {
    if (n === 0n) return [0n, 1n];
    const [a, b] = fibPair(n >> 1n);
    const c = a * ((b << 1n) - a);
    const d = a * a + b * b;
    if (n & 1n) return [d, c + d];
    return [c, d];
  };

  const fibonacci = (n: number): number => {
    const absN = Math.floor(Math.abs(n));
    const [f] = fibPair(BigInt(absN));
    return Number(f);
  };

  const factorial = (n: number): number => {
    const absN = Math.floor(Math.abs(n));
    if (absN <= 1) return 1;
    let result = 1n;
    for (let i = 2; i <= absN; i += 1) {
      result *= BigInt(i);
    }
    return Number(result);
  };

  const funcs: Record<string, (v: number) => number> = {
    sign: (v: number) => {
      if (v === 0) return 0;
      if (v > 0) return 1;
      if (v < 0) return -1;
      return 0;
    },
    sin: Math.sin,
    cos: Math.cos,
    tan: Math.tan,
    log: Math.log,
    sqrt: Math.sqrt,
    abs: Math.abs,
    floor: Math.floor,
    ceil: Math.ceil,
    round: Math.round,
    exp: Math.exp,
    fib: fibonacci,
    fact: factorial,
    prime: nthPrime,
    primepower: nthPrimePower,
    pi: primePi,
    isprime: (v: number) => (isPrime(v) ? 1 : 0),
  };

  const precedence: Record<string, number> = {
    "+": 1,
    "-": 1,
    "*": 2,
    "/": 2,
    "%": 2,
    "^": 3,
    neg: 4,
  };

  const normalize = (value: number) => {
    if (!Number.isFinite(value)) return value;
    if (Math.abs(value) < 1e-12) return 0;
    return value;
  };

  const affine = (slope: number, intercept: number): AffineForm | null => {
    if (!Number.isFinite(slope) || !Number.isFinite(intercept)) return null;
    return {
      slope: normalize(slope),
      intercept: normalize(intercept),
    };
  };

  const constant = (value: number) => affine(0, value);
  const isConstant = (value: AffineForm) => value.slope === 0;
  const isRightAssoc = (op: string) => op === "^" || op === "neg";

  const tokenize = (src: string): Token[] | null => {
    const tokens: Token[] = [];
    let i = 0;

    while (i < src.length) {
      const ch = src[i];
      if (ch === " " || ch === "\t" || ch === "\n") {
        i += 1;
        continue;
      }
      if (/[0-9.]/.test(ch)) {
        let j = i + 1;
        while (j < src.length && /[0-9.]/.test(src[j])) j += 1;
        const num = parseFloat(src.slice(i, j));
        if (isNaN(num)) return null;
        tokens.push({ type: "num", value: num });
        i = j;
        continue;
      }
      if (/[a-zA-Z]/.test(ch)) {
        let j = i + 1;
        while (j < src.length && /[a-zA-Z]/.test(src[j])) j += 1;
        const name = src.slice(i, j).toLowerCase();
        if (name === "x" || name === "n") {
          tokens.push({ type: "var" });
        } else if (name === "pi") {
          if (src[j] === "(") {
            tokens.push({ type: "func", name: "pi" });
          } else {
            tokens.push({ type: "num", value: Math.PI });
          }
        } else if (name === "e") {
          tokens.push({ type: "num", value: Math.E });
        } else if (funcs[name]) {
          tokens.push({ type: "func", name });
        } else {
          return null;
        }
        i = j;
        continue;
      }
      if ("+-*/%^".includes(ch)) {
        tokens.push({ type: "op", value: ch });
        i += 1;
        continue;
      }
      if (ch === "(") {
        tokens.push({ type: "lparen" });
        i += 1;
        continue;
      }
      if (ch === ")") {
        tokens.push({ type: "rparen" });
        i += 1;
        continue;
      }
      return null;
    }

    return tokens;
  };

  const addImplicitMultiplication = (tokens: Token[]): Token[] => {
    const result: Token[] = [];

    const prevCanMultiply = (token: Token) =>
      token.type === "num" || token.type === "var" || token.type === "rparen";

    const nextCanMultiply = (token: Token) =>
      token.type === "num" ||
      token.type === "var" ||
      token.type === "func" ||
      token.type === "lparen";

    for (let i = 0; i < tokens.length; i += 1) {
      const current = tokens[i];
      const previous = result[result.length - 1];
      const isFunctionCall =
        previous?.type === "func" && current.type === "lparen";

      if (
        previous &&
        prevCanMultiply(previous) &&
        nextCanMultiply(current) &&
        !isFunctionCall
      ) {
        result.push({ type: "op", value: "*" });
      }

      result.push(current);
    }

    return result;
  };

  const toRpn = (tokens: Token[]): Token[] | null => {
    const output: Token[] = [];
    const stack: Token[] = [];
    let previous: Token | null = null;

    for (const token of tokens) {
      if (token.type === "num" || token.type === "var") {
        output.push(token);
      } else if (token.type === "func") {
        stack.push(token);
      } else if (token.type === "op") {
        const isUnary =
          token.value === "-" &&
          (previous === null ||
            previous.type === "op" ||
            previous.type === "lparen" ||
            previous.type === "func");
        const operator = isUnary ? "neg" : token.value;

        while (stack.length > 0) {
          const top = stack[stack.length - 1];
          if (top.type === "op") {
            const topPrecedence = precedence[top.value];
            const currentPrecedence = precedence[operator];
            if (
              topPrecedence > currentPrecedence ||
              (topPrecedence === currentPrecedence && !isRightAssoc(operator))
            ) {
              output.push(stack.pop()!);
              continue;
            }
          } else if (top.type === "func") {
            output.push(stack.pop()!);
            continue;
          }
          break;
        }

        stack.push({ type: "op", value: operator });
      } else if (token.type === "lparen") {
        stack.push(token);
      } else if (token.type === "rparen") {
        while (stack.length > 0 && stack[stack.length - 1].type !== "lparen") {
          output.push(stack.pop()!);
        }
        if (stack.length === 0) return null;
        stack.pop();
        if (stack.length > 0 && stack[stack.length - 1].type === "func") {
          output.push(stack.pop()!);
        }
      }

      previous = token;
    }

    while (stack.length > 0) {
      const token = stack.pop()!;
      if (token.type === "lparen" || token.type === "rparen") return null;
      output.push(token);
    }

    return output;
  };

  const tokens = tokenize(expression.replace(/\s+/g, ""));
  if (!tokens) return false;

  const rpn = toRpn(addImplicitMultiplication(tokens));
  if (!rpn) return false;

  const stack: AffineForm[] = [];

  for (const token of rpn) {
    if (token.type === "num") {
      const value = constant(token.value);
      if (!value) return false;
      stack.push(value);
      continue;
    }

    if (token.type === "var") {
      const value = affine(1, 0);
      if (!value) return false;
      stack.push(value);
      continue;
    }

    if (token.type === "func") {
      if (stack.length < 1) return false;
      const input = stack.pop()!;
      if (!isConstant(input)) return false;
      const fn = funcs[token.name];
      if (!fn) return false;
      const value = constant(fn(input.intercept));
      if (!value) return false;
      stack.push(value);
      continue;
    }

    if (token.type !== "op") continue;
    if (token.value === "neg") {
      if (stack.length < 1) return false;
      const input = stack.pop()!;
      const value = affine(-input.slope, -input.intercept);
      if (!value) return false;
      stack.push(value);
      continue;
    }

    if (stack.length < 2) return false;
    const right = stack.pop()!;
    const left = stack.pop()!;

    switch (token.value) {
      case "+": {
        const value = affine(
          left.slope + right.slope,
          left.intercept + right.intercept
        );
        if (!value) return false;
        stack.push(value);
        break;
      }
      case "-": {
        const value = affine(
          left.slope - right.slope,
          left.intercept - right.intercept
        );
        if (!value) return false;
        stack.push(value);
        break;
      }
      case "*": {
        if (isConstant(left)) {
          const value = affine(
            right.slope * left.intercept,
            right.intercept * left.intercept
          );
          if (!value) return false;
          stack.push(value);
          break;
        }
        if (isConstant(right)) {
          const value = affine(
            left.slope * right.intercept,
            left.intercept * right.intercept
          );
          if (!value) return false;
          stack.push(value);
          break;
        }
        return false;
      }
      case "/": {
        if (!isConstant(right) || right.intercept === 0) return false;
        const value = affine(
          left.slope / right.intercept,
          left.intercept / right.intercept
        );
        if (!value) return false;
        stack.push(value);
        break;
      }
      case "%": {
        if (!isConstant(left) || !isConstant(right) || right.intercept === 0) {
          return false;
        }
        const value = constant(left.intercept % right.intercept);
        if (!value) return false;
        stack.push(value);
        break;
      }
      case "^": {
        if (!isConstant(right)) {
          if (isConstant(left) && left.intercept === 1) {
            const value = constant(1);
            if (!value) return false;
            stack.push(value);
            break;
          }
          return false;
        }

        if (right.intercept === 0) {
          const value = constant(1);
          if (!value) return false;
          stack.push(value);
          break;
        }

        if (right.intercept === 1) {
          stack.push(left);
          break;
        }

        if (!isConstant(left)) return false;
        const value = constant(Math.pow(left.intercept, right.intercept));
        if (!value) return false;
        stack.push(value);
        break;
      }
      default:
        return false;
    }
  }

  return stack.length === 1;
};
