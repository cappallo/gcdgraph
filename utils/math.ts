// Greatest Common Divisor
export const gcd = (a: number, b: number): number => {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) {
    [a, b] = [b, a % b];
  }
  return a;
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

// Create a safe transform function from a string expression like "2x+1" without using eval/Function
export const createTransformFunction = (
  expression: string
): ((x: number) => number) => {
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
  const fibonacci = (n: number): number => {
    n = Math.floor(Math.abs(n));
    if (n <= 1) return n;
    if (fibCache.has(n)) return fibCache.get(n)!;

    let a = 0,
      b = 1;
    for (let i = 2; i <= n; i++) {
      [a, b] = [b, a + b];
    }
    fibCache.set(n, b);
    return b;
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
  if (!tokens) return (x) => x;
  const rpn = toRpn(addImplicitMultiplication(tokens));
  if (!rpn) return (x) => x;

  // Return an evaluator that works without eval/Function
  return (x: number) => {
    const val = evalRpn(rpn, x);
    return val === null ? x : val;
  };
};
