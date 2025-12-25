import { gcd, getSmallestPrimeFactor, isPrime, nthPrime, primePi } from './math';

export type MovePredicate = ((x: number, y: number) => boolean) & {
  isDefaultCoprimeRule?: boolean;
};

export const DEFAULT_MOVE_RIGHT_EXPR = 'gcd(x,y)==1';

type Token =
  | { type: 'num'; value: number }
  | { type: 'ident'; value: string }
  | { type: 'op'; value: string }
  | { type: 'comma' }
  | { type: 'lparen' }
  | { type: 'rparen' }
  | { type: 'eof' };

type NumNode =
  | { kind: 'num'; value: number }
  | { kind: 'var'; name: 'x' | 'y' }
  | { kind: 'unary'; op: '-'; expr: NumNode }
  | { kind: 'binary'; op: '+' | '-' | '*' | '/' | '%' | '^'; left: NumNode; right: NumNode }
  | { kind: 'call'; name: string; args: NumNode[] };

type BoolNode =
  | { kind: 'bool'; value: boolean }
  | { kind: 'not'; expr: BoolNode }
  | { kind: 'logic'; op: '&&' | '||'; left: BoolNode; right: BoolNode }
  | { kind: 'cmp'; op: CmpOp; left: NumNode; right: NumNode };

type CmpOp = '==' | '!=' | '<' | '<=' | '>' | '>=';

class ParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ParseError';
  }
}

const getGreatestPrimeFactor = (n: number): number => {
  n = Math.abs(Math.round(n));
  if (n <= 1) return 1;
  let temp = n;
  let gpf = 1;
  while (temp % 2 === 0) {
    gpf = 2;
    temp /= 2;
  }
  for (let d = 3; d * d <= temp; d += 2) {
    while (temp % d === 0) {
      gpf = d;
      temp /= d;
    }
  }
  if (temp > 1) gpf = temp;
  return gpf;
};

const fibCache = new Map<number, number>();
const fibBigCache = new Map<bigint, bigint>();

// Fast-doubling Fibonacci (BigInt) for exact intermediate computation.
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

const fib = (n: number): number => {
  const absN = Math.floor(Math.abs(n));
  const cached = fibCache.get(absN);
  if (cached !== undefined) return cached;
  if (absN <= 1) return absN;
  const bigVal = fibonacciBigInt(BigInt(absN));
  const numVal = bigVal <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(bigVal) : Number(bigVal);
  fibCache.set(absN, numVal);
  return numVal;
};

const factCache = new Map<number, number>();
const fact = (n: number): number => {
  const absN = Math.floor(Math.abs(n));
  if (absN <= 1) return 1;
  const cached = factCache.get(absN);
  if (cached !== undefined) return cached;

  let result = 1n;
  for (let i = 2n; i <= BigInt(absN); i++) {
    result *= i;
  }
  const numResult = Number(result);
  factCache.set(absN, numResult);
  return numResult;
};

const tokenize = (srcRaw: string): Token[] => {
  const src = srcRaw;
  const tokens: Token[] = [];
  let i = 0;

  const peek = () => src[i] ?? '';
  const two = () => src.slice(i, i + 2);

  const pushOp = (value: string) => tokens.push({ type: 'op', value });

  while (i < src.length) {
    const ch = peek();
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i++;
      continue;
    }

    const op2 = two();
    if (op2 === '&&' || op2 === '||' || op2 === '==' || op2 === '!=' || op2 === '<=' || op2 === '>=') {
      pushOp(op2);
      i += 2;
      continue;
    }

    if ('+-*/%^<>!'.includes(ch)) {
      pushOp(ch);
      i++;
      continue;
    }

    if (ch === ',') {
      tokens.push({ type: 'comma' });
      i++;
      continue;
    }
    if (ch === '(') {
      tokens.push({ type: 'lparen' });
      i++;
      continue;
    }
    if (ch === ')') {
      tokens.push({ type: 'rparen' });
      i++;
      continue;
    }

    if (/[0-9.]/.test(ch)) {
      let j = i + 1;
      while (j < src.length && /[0-9.]/.test(src[j])) j++;
      const val = Number.parseFloat(src.slice(i, j));
      if (!Number.isFinite(val)) throw new ParseError('Invalid number literal.');
      tokens.push({ type: 'num', value: val });
      i = j;
      continue;
    }

    if (/[a-zA-Z]/.test(ch)) {
      let j = i + 1;
      while (j < src.length && /[a-zA-Z]/.test(src[j])) j++;
      tokens.push({ type: 'ident', value: src.slice(i, j).toLowerCase() });
      i = j;
      continue;
    }

    throw new ParseError(`Unexpected character '${ch}'.`);
  }

  tokens.push({ type: 'eof' });
  return addImplicitMultiplication(tokens);
};

const addImplicitMultiplication = (tokens: Token[]): Token[] => {
  const result: Token[] = [];

  const canEndFactor = (t: Token) => t.type === 'num' || t.type === 'ident' || t.type === 'rparen';
  const canStartFactor = (t: Token) => t.type === 'num' || t.type === 'ident' || t.type === 'lparen';
  const isFunctionName = (ident: string) => !['x', 'y', 'e', 'true', 'false'].includes(ident);

  for (let i = 0; i < tokens.length; i++) {
    const cur = tokens[i];
    const prev = result[result.length - 1];

    if (prev && canEndFactor(prev) && canStartFactor(cur)) {
      const isFuncCall =
        prev.type === 'ident' && isFunctionName(prev.value) && cur.type === 'lparen';
      if (!isFuncCall) result.push({ type: 'op', value: '*' });
    }

    result.push(cur);
  }

  return result;
};

class Parser {
  private idx = 0;
  constructor(private tokens: Token[]) {}

  private at() {
    return this.tokens[this.idx];
  }

  private eat() {
    return this.tokens[this.idx++]!;
  }

  private atOp(): Extract<Token, { type: 'op' }> | null {
    const t = this.at();
    return t.type === 'op' ? t : null;
  }

  private eatOp(): Extract<Token, { type: 'op' }> {
    const t = this.at();
    if (t.type !== 'op') throw new ParseError('Expected operator.');
    return this.eat() as Extract<Token, { type: 'op' }>;
  }

  private expect(type: Token['type'], value?: string) {
    const t = this.at();
    if (t.type !== type) throw new ParseError(`Expected ${type}.`);
    if (value && t.type === 'op' && t.value !== value) throw new ParseError(`Expected '${value}'.`);
    return this.eat();
  }

  parseBoolRoot(): BoolNode {
    const node = this.parseOr();
    if (this.at().type !== 'eof') throw new ParseError('Unexpected token after expression.');
    return node;
  }

  private parseOr(): BoolNode {
    let left = this.parseAnd();
    while (this.atOp()?.value === '||') {
      this.eatOp();
      const right = this.parseAnd();
      left = { kind: 'logic', op: '||', left, right };
    }
    return left;
  }

  private parseAnd(): BoolNode {
    let left = this.parseUnaryBool();
    while (this.atOp()?.value === '&&') {
      this.eatOp();
      const right = this.parseUnaryBool();
      left = { kind: 'logic', op: '&&', left, right };
    }
    return left;
  }

  private parseUnaryBool(): BoolNode {
    if (this.atOp()?.value === '!') {
      this.eatOp();
      return { kind: 'not', expr: this.parseUnaryBool() };
    }
    return this.parseAtomBool();
  }

  private parseAtomBool(): BoolNode {
    const t = this.at();
    if (t.type === 'lparen') {
      this.eat();
      const inner = this.parseOr();
      this.expect('rparen');
      return inner;
    }
    if (t.type === 'ident' && (t.value === 'true' || t.value === 'false')) {
      this.eat();
      return { kind: 'bool', value: t.value === 'true' };
    }

    const left = this.parseNum();
    const opTok = this.at();
    if (opTok.type !== 'op' || !['==', '!=', '<', '<=', '>', '>='].includes(opTok.value)) {
      throw new ParseError("Expected a comparison like 'gcd(x,y)==1'.");
    }
    const op = this.eatOp().value as CmpOp;
    const right = this.parseNum();
    return { kind: 'cmp', op, left, right };
  }

  private parseNum(): NumNode {
    return this.parseAdd();
  }

  private parseAdd(): NumNode {
    let left = this.parseMul();
    while (true) {
      const opTok = this.atOp();
      if (!opTok || (opTok.value !== '+' && opTok.value !== '-')) break;
      const op = this.eatOp().value as '+' | '-';
      const right = this.parseMul();
      left = { kind: 'binary', op, left, right };
    }
    return left;
  }

  private parseMul(): NumNode {
    let left = this.parsePow();
    while (true) {
      const opTok = this.atOp();
      if (!opTok || (opTok.value !== '*' && opTok.value !== '/' && opTok.value !== '%')) break;
      const op = this.eatOp().value as '*' | '/' | '%';
      const right = this.parsePow();
      left = { kind: 'binary', op, left, right };
    }
    return left;
  }

  private parsePow(): NumNode {
    let left = this.parseUnaryNum();
    if (this.atOp()?.value === '^') {
      this.eatOp();
      const right = this.parsePow();
      left = { kind: 'binary', op: '^', left, right };
    }
    return left;
  }

  private parseUnaryNum(): NumNode {
    if (this.atOp()?.value === '-') {
      this.eatOp();
      return { kind: 'unary', op: '-', expr: this.parseUnaryNum() };
    }
    return this.parsePrimaryNum();
  }

  private parsePrimaryNum(): NumNode {
    const t = this.at();
    if (t.type === 'num') {
      this.eat();
      return { kind: 'num', value: t.value };
    }
    if (t.type === 'ident') {
      this.eat();
      const name = t.value;
      if (name === 'x' || name === 'y') return { kind: 'var', name };
      if (name === 'pi' && this.at().type !== 'lparen') return { kind: 'num', value: Math.PI };
      if (name === 'e' && this.at().type !== 'lparen') return { kind: 'num', value: Math.E };

      if (this.at().type !== 'lparen') throw new ParseError(`Unknown identifier '${name}'.`);
      this.eat(); // (
      const args: NumNode[] = [];
      if (this.at().type !== 'rparen') {
        args.push(this.parseNum());
        while (this.at().type === 'comma') {
          this.eat();
          args.push(this.parseNum());
        }
      }
      this.expect('rparen');
      return { kind: 'call', name, args };
    }
    if (t.type === 'lparen') {
      this.eat();
      const inner = this.parseNum();
      this.expect('rparen');
      return inner;
    }
    throw new ParseError('Expected a number, variable, or function call.');
  }
}

const evalNum = (node: NumNode, x: number, y: number): number => {
  switch (node.kind) {
    case 'num':
      return node.value;
    case 'var':
      return node.name === 'x' ? x : y;
    case 'unary':
      return -evalNum(node.expr, x, y);
    case 'binary': {
      const a = evalNum(node.left, x, y);
      const b = evalNum(node.right, x, y);
      switch (node.op) {
        case '+':
          return a + b;
        case '-':
          return a - b;
        case '*':
          return a * b;
        case '/':
          return b === 0 ? Infinity : a / b;
        case '%':
          return b === 0 ? Infinity : a % b;
        case '^':
          return Math.pow(a, b);
      }
      return NaN;
    }
    case 'call': {
      const args = node.args.map((n) => evalNum(n, x, y));
      const name = node.name;

      const unaryMath: Record<string, (v: number) => number> = {
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
        fib,
        fact,
        prime: nthPrime,
        pi: primePi,
        isprime: (v) => (isPrime(Math.round(v)) ? 1 : 0)
      };

      if (unaryMath[name]) {
        if (args.length !== 1) throw new ParseError(`${name}() takes 1 argument.`);
        return unaryMath[name](args[0]!);
      }

      if (name === 'gcd') {
        if (args.length !== 2) throw new ParseError('gcd() takes 2 arguments.');
        return gcd(Math.round(args[0]!), Math.round(args[1]!));
      }
      if (name === 'lpf' || name === 'spf') {
        if (args.length !== 1) throw new ParseError(`${name}() takes 1 argument.`);
        return getSmallestPrimeFactor(Math.round(args[0]!));
      }
      if (name === 'gpf') {
        if (args.length !== 1) throw new ParseError('gpf() takes 1 argument.');
        return getGreatestPrimeFactor(Math.round(args[0]!));
      }
      if (name === 'mod') {
        if (args.length !== 2) throw new ParseError('mod() takes 2 arguments.');
        const a = args[0]!;
        const b = args[1]!;
        return b === 0 ? Infinity : a % b;
      }

      throw new ParseError(`Unknown function '${name}()'.`);
    }
  }
};

const validateNum = (node: NumNode): void => {
  switch (node.kind) {
    case 'num':
    case 'var':
      return;
    case 'unary':
      return validateNum(node.expr);
    case 'binary':
      validateNum(node.left);
      validateNum(node.right);
      return;
    case 'call': {
      const name = node.name;
      const argc = node.args.length;
      node.args.forEach(validateNum);

      const unaryMath = new Set(['sin', 'cos', 'tan', 'log', 'sqrt', 'abs', 'floor', 'ceil', 'round', 'exp']);
      unaryMath.add('fib');
      unaryMath.add('fact');
      unaryMath.add('prime');
      unaryMath.add('pi');
      unaryMath.add('isprime');
      if (unaryMath.has(name)) {
        if (argc !== 1) throw new ParseError(`${name}() takes 1 argument.`);
        return;
      }

      if (name === 'gcd') {
        if (argc !== 2) throw new ParseError('gcd() takes 2 arguments.');
        return;
      }
      if (name === 'lpf' || name === 'spf') {
        if (argc !== 1) throw new ParseError(`${name}() takes 1 argument.`);
        return;
      }
      if (name === 'gpf') {
        if (argc !== 1) throw new ParseError('gpf() takes 1 argument.');
        return;
      }
      if (name === 'mod') {
        if (argc !== 2) throw new ParseError('mod() takes 2 arguments.');
        return;
      }

      throw new ParseError(`Unknown function '${name}()'.`);
    }
  }
};

const validateBool = (node: BoolNode): void => {
  switch (node.kind) {
    case 'bool':
      return;
    case 'not':
      return validateBool(node.expr);
    case 'logic':
      validateBool(node.left);
      validateBool(node.right);
      return;
    case 'cmp':
      validateNum(node.left);
      validateNum(node.right);
      return;
  }
};

const evalBool = (node: BoolNode, x: number, y: number): boolean => {
  switch (node.kind) {
    case 'bool':
      return node.value;
    case 'not':
      return !evalBool(node.expr, x, y);
    case 'logic':
      return node.op === '&&'
        ? evalBool(node.left, x, y) && evalBool(node.right, x, y)
        : evalBool(node.left, x, y) || evalBool(node.right, x, y);
    case 'cmp': {
      const a = evalNum(node.left, x, y);
      const b = evalNum(node.right, x, y);
      switch (node.op) {
        case '==':
          return a === b;
        case '!=':
          return a !== b;
        case '<':
          return a < b;
        case '<=':
          return a <= b;
        case '>':
          return a > b;
        case '>=':
          return a >= b;
      }
      return false;
    }
  }
};

export const compileMoveRightPredicate = (
  expression: string
): { fn: MovePredicate; error: string } => {
  const expr = (expression || '').trim();
  const src = expr.length ? expr : DEFAULT_MOVE_RIGHT_EXPR;

  try {
    const tokens = tokenize(src);
    const parser = new Parser(tokens);
    const ast = parser.parseBoolRoot();
    validateBool(ast);
    const isDefault = src === DEFAULT_MOVE_RIGHT_EXPR;
    const predicate: MovePredicate = (x, y) => {
      try {
        return !!evalBool(ast, x, y);
      } catch {
        return gcd(Math.round(x), Math.round(y)) === 1;
      }
    };
    predicate.isDefaultCoprimeRule = isDefault;
    return {
      fn: predicate,
      error: ''
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Invalid expression.';
    return {
      fn: ((x: number, y: number) => gcd(Math.round(x), Math.round(y)) === 1) as MovePredicate,
      error: msg
    };
  }
};
