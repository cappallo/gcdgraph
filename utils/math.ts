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

// Get smallest prime factor
export const getSmallestPrimeFactor = (n: number): number => {
  if (n <= 1) return 1;
  while (n % 2 === 0) return 2;
  let sqrt = Math.sqrt(n);
  for (let i = 3; i <= sqrt; i += 2) {
    if (n % i === 0) return i;
  }
  return n;
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
  n = Math.abs(n);
  if (n <= 1) return false;
  return getSmallestPrimeFactor(n) === n;
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
  const hue = (n * 137.508) % 360;
  return `hsl(${hue}, 85%, 45%)`;
};

export type TransformFunction = ((x: number) => number) & {
  evalBigInt?: (x: bigint) => bigint | null;
};

// Create a safe transform function from a string expression like "2x+1" without using eval/Function
export const createTransformFunction = (
  expression: string
): TransformFunction => {
  if (!expression || !expression.trim()) return (x) => x;

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
  };

  const precedence: Record<string, number> = {
    "+": 1,
    "-": 1,
    "*": 2,
    "/": 2,
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
          tokens.push({ type: "num", value: Math.PI });
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
      if ("+-*/^".includes(ch)) {
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
            stack.push(b === 0 ? Infinity : a / b);
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
    if (stack.length !== 1 || Number.isNaN(stack[0])) return null;
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
          case "^": {
            if (b < 0n) return null;
            const exp = Number(b);
            if (!Number.isFinite(exp) || exp > 4096) return null; // avoid runaway
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
    return fallback;
  }

  const rpn = toRpn(addImplicitMultiplication(tokens));
  if (!rpn) {
    const fallback = ((x: number) => x) as TransformFunction;
    return fallback;
  }

  const bigintFuncs = new Set(["fib"]);

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

  return fn;
};
