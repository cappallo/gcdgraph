import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { gcd, gcdBigInt, gcdIsOneBigInt, formatValue, createTransformFunction, getPrimeFactorCount, isPrime, TransformFunction } from '../utils/math';
import { Viewport, Point, Theme } from '../types';
import { getRowShiftMagnitude } from '../utils/grid';
import { MovePredicate } from '../utils/moveRule';

interface InfiniteGraphProps {
  viewport: Viewport;
  onViewportChange: React.Dispatch<React.SetStateAction<Viewport>>;
  theme: Theme;
  transformFunc: string;
  moveRightPredicate: MovePredicate;
  simpleView: boolean;
  showFactored: boolean;
  rowShift: number;
  randomizeShift: boolean;
  onCursorMove: (p: Point) => void;
  degree: number;
  resetPathsSignal: number;
  pathStarts: Point[];
  onTogglePathStart: (p: Point) => void;
  pathStepLimit: number;
  backtraceLimit: number;
  onBacktrailChange?: (len: number | null) => void;
}

// Calculate a readable text color (light/dark) against a given background color.
// Supports hex (#rgb/#rrggbb), rgb()/rgba(), hsl()/hsla().
const getContrastingTextColor = (bgColor: string) => {
  const parseHex = (hex: string) => {
    const clean = hex.replace('#', '');
    if (clean.length === 3) {
      const r = parseInt(clean[0] + clean[0], 16);
      const g = parseInt(clean[1] + clean[1], 16);
      const b = parseInt(clean[2] + clean[2], 16);
      return [r, g, b];
    }
    if (clean.length === 6) {
      const r = parseInt(clean.substring(0, 2), 16);
      const g = parseInt(clean.substring(2, 4), 16);
      const b = parseInt(clean.substring(4, 6), 16);
      return [r, g, b];
    }
    return null;
  };

  const clamp255 = (n: number) => Math.max(0, Math.min(255, Math.round(n)));

  const parseRgbFunc = (c: string) => {
    // Examples: rgb(255, 0, 0), rgba(255, 0, 0, 0.5)
    // Also accept percentages: rgb(100%, 0%, 0%)
    const m = c.match(/rgba?\(\s*([\d.]+%?)\s*,\s*([\d.]+%?)\s*,\s*([\d.]+%?)(?:\s*,\s*[\d.]+%?)?\s*\)/i);
    if (!m) return null;

    const toByte = (raw: string) => {
      if (raw.endsWith('%')) {
        const p = parseFloat(raw.slice(0, -1));
        if (!Number.isFinite(p)) return null;
        return clamp255((p / 100) * 255);
      }
      const n = parseFloat(raw);
      if (!Number.isFinite(n)) return null;
      return clamp255(n);
    };

    const r = toByte(m[1]);
    const g = toByte(m[2]);
    const b = toByte(m[3]);
    if (r === null || g === null || b === null) return null;
    return [r, g, b];
  };

  const hslToRgb = (h: number, s: number, l: number) => {
    const a = s * Math.min(l, 1 - l);
    const f = (n: number) => {
      const k = (n + h / 30) % 12;
      const color = l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
      return Math.round(255 * color);
    };
    return [f(0), f(8), f(4)];
  };

  const parseColor = (c: string) => {
    if (c.startsWith('#')) {
      return parseHex(c);
    }
    if (c.toLowerCase().startsWith('rgb')) {
      return parseRgbFunc(c);
    }
    const hslMatch = c.match(/hsla?\(\s*([-\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%(?:\s*,\s*[\d.]+%?)?\s*\)/i);
    if (hslMatch) {
      const h = parseFloat(hslMatch[1]);
      const s = parseFloat(hslMatch[2]) / 100;
      const l = parseFloat(hslMatch[3]) / 100;
      return hslToRgb(h, s, l);
    }
    return null;
  };

  const rgb = parseColor(bgColor);
  if (!rgb) return '#111111';

  const [r, g, b] = rgb.map(v => v / 255);
  const toLinear = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const luminance = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);

  // Prefer the text color (light/dark) with the higher WCAG contrast ratio.
  // Contrast ratio: (L1 + 0.05) / (L2 + 0.05), where L1 >= L2.
  const contrastRatio = (l1: number, l2: number) => (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  const blackL = 0; // #000000
  const whiteL = 1; // #ffffff
  const blackContrast = contrastRatio(luminance, blackL);
  const whiteContrast = contrastRatio(luminance, whiteL);

  return blackContrast >= whiteContrast ? '#111111' : '#ffffff';
};

const trimZeros = (s: string) => s.replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');

const formatNumberCompact = (val: number): string => {
  if (!Number.isFinite(val)) return '';
  const abs = Math.abs(val);
  if (abs === 0) return '0';
  const digits = Math.floor(Math.log10(abs)) + 1;
  if (digits >= 10 || abs >= 1e9) {
    const sign = val < 0 ? '-' : '';
    let exp = Math.floor(Math.log10(abs));
    let mantissa = abs / Math.pow(10, exp);
    mantissa = Number.parseFloat(mantissa.toPrecision(2));
    if (mantissa >= 10) {
      mantissa /= 10;
      exp += 1;
    }
    const mantissaStr = trimZeros(mantissa.toPrecision(2));
    return `${sign}${mantissaStr}e${exp}`;
  }
  return val.toString();
};

// Round BigInt string to 2 significant figures and emit scientific form.
const formatBigIntCompact = (raw: string): string => {
  const sign = raw.startsWith('-') ? '-' : '';
  const digits = raw.replace(/^[-+]/, '');
  if (digits.length <= 12) return sign + digits;

  const expBase = digits.length - 1;
  const sig = 2;
  const sigDigits = digits.slice(0, sig + 1).split('').map((d) => Number(d));
  let carry = sigDigits.length > sig && sigDigits[sig] >= 5 ? 1 : 0;
  const kept = sigDigits.slice(0, sig);

  for (let i = kept.length - 1; i >= 0 && carry > 0; i--) {
    const next = kept[i] + carry;
    kept[i] = next % 10;
    carry = Math.floor(next / 10);
  }

  let exponent = expBase;
  let mantissaDigits = kept;
  if (carry > 0) {
    mantissaDigits = [carry, ...mantissaDigits];
    exponent += 1;
  }

  const mantissaStr = mantissaDigits[0] + (mantissaDigits.length > 1 ? `.${mantissaDigits[1]}` : '');
  return `${sign}${mantissaStr}e${exponent}`;
};

const labelFont = (size: number) => `bold ${size}px 'SFMono-Regular','Menlo','Consolas','Liberation Mono',monospace`;

const MAX_SAFE_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);
const BIGINT_X_CACHE_LIMIT = 100000;
const BIGINT_Y_CACHE_LIMIT = 100000;
const BIGINT_GCD_FLAG_CACHE_LIMIT = 400000;
const BIGINT_GCD_VALUE_CACHE_LIMIT = 50000;

const makeLabel = (
  val: number,
  bigLabel: string | null,
  useFactored: boolean
): string => {
  if (bigLabel) return formatBigIntCompact(bigLabel);
  if (val <= 1) return '';
  if (useFactored) {
    const factored = formatValue(val);
    if (factored && factored.length <= 12) return factored;
  }
  return formatNumberCompact(val);
};

const InfiniteGraph: React.FC<InfiniteGraphProps> = ({ 
  viewport, 
  onViewportChange, 
  theme, 
  transformFunc,
  moveRightPredicate,
  simpleView,
  showFactored,
  rowShift,
  randomizeShift,
  onCursorMove,
  degree,
  resetPathsSignal,
  pathStarts,
  onTogglePathStart,
  pathStepLimit,
  backtraceLimit,
  onBacktrailChange
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const lastPos = useRef({ x: 0, y: 0 });
  const dragStartPos = useRef({ x: 0, y: 0 });

  // Multitouch State
  const evCache = useRef<Map<number, {id: number, x: number, y: number}>>(new Map());
  const prevPinchDiff = useRef<number>(-1);
  const isPinching = useRef<boolean>(false);

  // Trace Path State (Backward from click)
  const [tracedPath, setTracedPath] = useState<Point[] | null>(null);
  const tracedAnchor = useRef<Point | null>(null);
  const canFastForward = useMemo(() => {
    const t = transformFunc.trim().toLowerCase();
    const transformAllowsFastForward = t === 'n' || t === 'x';
    return Boolean(moveRightPredicate.isDefaultCoprimeRule) && transformAllowsFastForward;
  }, [moveRightPredicate.isDefaultCoprimeRule, transformFunc]);

  // Create the transform function from string
  const activeTransform = useMemo<TransformFunction>(() => {
    return createTransformFunction(transformFunc);
  }, [transformFunc]);

  const cacheKey = useMemo(() => {
    return `${transformFunc}|${rowShift}|${randomizeShift ? 1 : 0}|${moveRightPredicate.isDefaultCoprimeRule ? 1 : 0}`;
  }, [moveRightPredicate.isDefaultCoprimeRule, randomizeShift, rowShift, transformFunc]);

  const bigIntXCache = useRef<Map<bigint, bigint | null>>(new Map());
  const bigIntYCache = useRef<Map<bigint, bigint | null>>(new Map());
  const bigGcdIsOneCache = useRef<Map<string, boolean | null>>(new Map());
  const bigGcdValueCache = useRef<Map<string, bigint>>(new Map());
  const cacheKeyRef = useRef<string>("");

  // External reset for all user-created paths
  useEffect(() => {
    setTracedPath(null);
    tracedAnchor.current = null;
  }, [resetPathsSignal]);

  useEffect(() => {
    if (!onBacktrailChange) return;
    if (tracedPath && tracedPath.length > 0) onBacktrailChange(tracedPath.length);
    else onBacktrailChange(null);
  }, [tracedPath, onBacktrailChange]);

  // Helper to calculate effective X based on row shift
  const getEffectiveX = useCallback((gx: number, gy: number) => {
    const offset = getRowShiftMagnitude(gy, rowShift, randomizeShift);
    if (offset > 0) {
        if (gy > 0) return gx - offset;
        if (gy < 0) return gx + offset;
    }
    return gx;
  }, [rowShift, randomizeShift, getRowShiftMagnitude]);

  const computeBigIsCoprime = useCallback((gx: number, gy: number): boolean | null => {
    if (cacheKeyRef.current !== cacheKey) {
      cacheKeyRef.current = cacheKey;
      bigIntXCache.current.clear();
      bigIntYCache.current.clear();
      bigGcdIsOneCache.current.clear();
      bigGcdValueCache.current.clear();
    }
    if (!moveRightPredicate.isDefaultCoprimeRule) return null;
    const evalBigInt = activeTransform.evalBigInt;
    if (!evalBigInt) return null;

    const xInt = Math.round(getEffectiveX(gx, gy));
    const yInt = Math.round(gy);

    const gcdKey = `${xInt},${yInt}`;
    const flagCache = bigGcdIsOneCache.current;
    if (flagCache.has(gcdKey)) return flagCache.get(gcdKey)!;

    const valueCache = bigGcdValueCache.current;
    if (valueCache.has(gcdKey)) {
      const g = valueCache.get(gcdKey)!;
      const isOne = g === 1n;
      if (flagCache.size >= BIGINT_GCD_FLAG_CACHE_LIMIT) flagCache.clear();
      flagCache.set(gcdKey, isOne);
      return isOne;
    }

    const xBig = BigInt(xInt);
    const yBig = BigInt(yInt);

    const getCachedTransform = (
      cache: Map<bigint, bigint | null>,
      limit: number,
      value: bigint
    ) => {
      if (cache.has(value)) return cache.get(value)!;
      if (cache.size >= limit) cache.clear();
      const computed = evalBigInt(value);
      cache.set(value, computed);
      return computed;
    };

    const vXBig = getCachedTransform(bigIntXCache.current, BIGINT_X_CACHE_LIMIT, xBig);
    const vYBig = getCachedTransform(bigIntYCache.current, BIGINT_Y_CACHE_LIMIT, yBig);

    if (vXBig === null || vYBig === null) {
      if (flagCache.size >= BIGINT_GCD_FLAG_CACHE_LIMIT) flagCache.clear();
      flagCache.set(gcdKey, null);
      return null;
    }

    const isOne = gcdIsOneBigInt(vXBig, vYBig);
    if (flagCache.size >= BIGINT_GCD_FLAG_CACHE_LIMIT) flagCache.clear();
    flagCache.set(gcdKey, isOne);
    return isOne;
  }, [activeTransform, cacheKey, getEffectiveX, moveRightPredicate.isDefaultCoprimeRule]);

  const computeBigGcdValue = useCallback((gx: number, gy: number): bigint | null => {
    if (cacheKeyRef.current !== cacheKey) {
      cacheKeyRef.current = cacheKey;
      bigIntXCache.current.clear();
      bigIntYCache.current.clear();
      bigGcdIsOneCache.current.clear();
      bigGcdValueCache.current.clear();
    }
    if (!moveRightPredicate.isDefaultCoprimeRule) return null;
    const evalBigInt = activeTransform.evalBigInt;
    if (!evalBigInt) return null;

    const xInt = Math.round(getEffectiveX(gx, gy));
    const yInt = Math.round(gy);

    const gcdKey = `${xInt},${yInt}`;
    const valueCache = bigGcdValueCache.current;
    if (valueCache.has(gcdKey)) return valueCache.get(gcdKey)!;

    const flagCache = bigGcdIsOneCache.current;
    const cachedFlag = flagCache.get(gcdKey);
    if (cachedFlag === null) return null;
    if (cachedFlag === true) return 1n;

    const xBig = BigInt(xInt);
    const yBig = BigInt(yInt);

    const getCachedTransform = (
      cache: Map<bigint, bigint | null>,
      limit: number,
      value: bigint
    ) => {
      if (cache.has(value)) return cache.get(value)!;
      if (cache.size >= limit) cache.clear();
      const computed = evalBigInt(value);
      cache.set(value, computed);
      return computed;
    };

    const vXBig = getCachedTransform(bigIntXCache.current, BIGINT_X_CACHE_LIMIT, xBig);
    const vYBig = getCachedTransform(bigIntYCache.current, BIGINT_Y_CACHE_LIMIT, yBig);

    if (vXBig === null || vYBig === null) {
      if (flagCache.size >= BIGINT_GCD_FLAG_CACHE_LIMIT) flagCache.clear();
      flagCache.set(gcdKey, null);
      return null;
    }

    const gcdExact = gcdBigInt(vXBig, vYBig);
    if (valueCache.size >= BIGINT_GCD_VALUE_CACHE_LIMIT) valueCache.clear();
    valueCache.set(gcdKey, gcdExact);
    const isOne = gcdExact === 1n;
    if (flagCache.size >= BIGINT_GCD_FLAG_CACHE_LIMIT) flagCache.clear();
    flagCache.set(gcdKey, isOne);
    return gcdExact;
  }, [activeTransform, cacheKey, getEffectiveX, moveRightPredicate.isDefaultCoprimeRule]);

  // Offset helper used to keep custom start nodes aligned with row shifts
  // Logic helper: Determine direction based on Coprime rule + Row Shift
  const checkGoesNorth = useCallback((gx: number, gy: number) => {
    const effectiveX = getEffectiveX(gx, gy);

    // Try BigInt-precise path for the default coprime rule.
    const isCoprime = computeBigIsCoprime(gx, gy);
    if (isCoprime !== null) {
      return !isCoprime;
    }

    // Apply Transform (Number path)
    const vX = Math.round(activeTransform(effectiveX));
    const vY = Math.round(activeTransform(gy));
    
    // Rule: "move right" predicate -> East (return false)
    //       otherwise -> North (return true)
    try {
      return !moveRightPredicate(vX, vY);
    } catch {
      return gcd(vX, vY) !== 1;
    }
  }, [activeTransform, computeBigIsCoprime, getEffectiveX, moveRightPredicate]);

  const findPathToBottommostRightmost = useCallback((start: Point): Point[] => {
    // Fast alternative to reverse BFS: search for the rightmost x on a computed "ground" row
    // whose forward path reaches `start`, then trace forward to reconstruct.
    const traceForwardEnd = (from: Point, maxSteps: number): Point => {
      let currX = from.x;
      let currY = from.y;

      const stepsLimit = Math.max(0, Math.floor(maxSteps));
      let stepsUsed = 0;

      while (stepsUsed < stepsLimit) {
        const goesNorth = checkGoesNorth(currX, currY);
        if (goesNorth) {
          currY += 1;
          stepsUsed += 1;
          continue;
        }

        const p = Math.abs(currY);
        const canJump = canFastForward && isPrime(p) && p > 1;
        if (!canJump) {
          currX += 1;
          stepsUsed += 1;
          continue;
        }

        const effectiveX = getEffectiveX(currX, currY);
        const rem = ((effectiveX % p) + p) % p;
        const jump = rem === 0 ? 1 : Math.min(p - rem, stepsLimit - stepsUsed);

        currX += jump;
        stepsUsed += jump;
      }

      return { x: currX, y: currY };
    };

    if (start.y <= 1) return [start];

    const groundProbe = traceForwardEnd({ x: 100, y: 0 }, 100);
    const groundY = groundProbe.y + 1;

    if (start.y < groundY) return [start];

    type Outcome = 'hit' | 'tooLeft' | 'tooRight';

    const outcomeFromStartX = (startX: number): Outcome => {
      let currX = startX;
      let currY = groundY;
      let lastXAtTargetRow: number | null = null;

      const maxIters = 5_000_000;
      let iters = 0;

      while (iters < maxIters) {
        if (currX === start.x && currY === start.y) return 'hit';
        if (currY === start.y) lastXAtTargetRow = currX;
        if (currY > start.y) break;
        if (currX > start.x && currY <= start.y) return 'tooRight';

        const goesNorth = checkGoesNorth(currX, currY);
        if (goesNorth) {
          currY += 1;
          iters += 1;
          continue;
        }

        const p = Math.abs(currY);
        const canJump = canFastForward && isPrime(p) && p > 1;
        if (!canJump) {
          currX += 1;
          iters += 1;
          continue;
        }

        const effectiveX = getEffectiveX(currX, currY);
        const rem = ((effectiveX % p) + p) % p;
        const jump = rem === 0 ? 1 : p - rem;
        const nextX = currX + jump;

        // If we pass through the target on the target row during the jump, we hit.
        if (currY === start.y && start.x > currX && start.x <= nextX) return 'hit';

        // If we pass x+1 before reaching the target row, we're too far right.
        if (currY < start.y && start.x + 1 > currX && start.x + 1 <= nextX) return 'tooRight';

        currX = nextX;
        iters += jump;
      }

      if (lastXAtTargetRow === null) return 'tooLeft';
      if (lastXAtTargetRow < start.x) return 'tooLeft';
      if (lastXAtTargetRow > start.x) return 'tooRight';
      return 'hit';
    };

    const traceForwardToTarget = (from: Point, target: Point): Point[] | null => {
      const points: Point[] = [from];
      let currX = from.x;
      let currY = from.y;
      const maxIters = 5_000_000;
      let iters = 0;

      while (iters < maxIters && currY <= target.y && currX <= target.x + 1) {
        if (currX === target.x && currY === target.y) return points;

        const goesNorth = checkGoesNorth(currX, currY);
        if (goesNorth) {
          currY += 1;
          points.push({ x: currX, y: currY });
          iters += 1;
          continue;
        }

        const p = Math.abs(currY);
        const canJump = canFastForward && isPrime(p) && p > 1;
        if (!canJump) {
          currX += 1;
          points.push({ x: currX, y: currY });
          iters += 1;
          continue;
        }

        const effectiveX = getEffectiveX(currX, currY);
        const rem = ((effectiveX % p) + p) % p;
        const jump = rem === 0 ? 1 : p - rem;
        const nextX = currX + jump;

        // If we pass through the target on this row, include it and stop.
        if (currY === target.y && target.x > currX && target.x <= nextX) {
          points.push({ x: target.x, y: currY });
          return points;
        }

        currX = nextX;
        points.push({ x: currX, y: currY });
        iters += jump;
      }

      return null;
    };

    const maxX = Math.floor(start.x);
    const minX = maxX - 1_000_000_000;
    let probeX = maxX;
    let step = 1;
    while (probeX > minX && outcomeFromStartX(probeX) === 'tooRight') {
      probeX = maxX - step;
      step *= 2;
    }
    const lowBound = Math.max(minX, probeX);

    let lo = lowBound;
    let hi = maxX;
    let bestHit: number | null = null;

    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2);
      const out = outcomeFromStartX(mid);
      if (out === 'tooLeft') {
        lo = mid + 1;
        continue;
      }
      if (out === 'tooRight') {
        hi = mid - 1;
        continue;
      }
      bestHit = mid;
      lo = mid + 1;
    }

    if (bestHit === null) return [start];

    const ground = { x: bestHit, y: groundY };
    const forward = traceForwardToTarget(ground, start);
    if (!forward) return [start];

    // UI expects tracedPath[0] === clicked node, and last === chosen ground.
    return forward.slice().reverse();
  }, [checkGoesNorth, canFastForward, getEffectiveX]);

  // If the user changes the move rule / transform / row-shift while a backtrace is visible,
  // recompute it so it stays consistent with the new evaluation.
  useEffect(() => {
    if (!tracedAnchor.current) {
      setTracedPath(null);
      return;
    }
    setTracedPath(findPathToBottommostRightmost(tracedAnchor.current));
  }, [findPathToBottommostRightmost, moveRightPredicate, transformFunc, rowShift, randomizeShift]);

  // Helper to trace a path forward from a given point
  const traceForward = useCallback((startX: number, startY: number) => {
    const points: Point[] = [{ x: startX, y: startY }];
    let currX = startX;
    let currY = startY;
    const maxSteps = Math.max(1, pathStepLimit);
    let stepsUsed = 0;

    while (stepsUsed < maxSteps) {
      const goesNorth = checkGoesNorth(currX, currY);
      if (goesNorth) {
        currY += 1;
        stepsUsed += 1;
        points.push({ x: currX, y: currY });
        continue;
      }

      const p = Math.abs(currY);
      const canJump = canFastForward && isPrime(p) && p > 1;

      if (canJump) {
        const effectiveX = getEffectiveX(currX, currY);
        const rem = ((effectiveX % p) + p) % p;
        const jump = rem === 0 ? 1 : Math.min(p - rem, maxSteps - stepsUsed);

        currX += jump;
        stepsUsed += jump;
        points.push({ x: currX, y: currY });
        continue;
      }

      currX += 1;
      stepsUsed += 1;
      points.push({ x: currX, y: currY });
    }
    return points;
  }, [checkGoesNorth, pathStepLimit, canFastForward, getEffectiveX]);

  // Calculate user-defined custom paths
  const customPaths = useMemo(() => {
    return pathStarts.map(start => {
      // Deterministic color based on coordinates
      const hue = ((start.x * 37 + start.y * 19) * 137.508) % 360;
      return {
        color: `hsl(${hue}, 90%, 55%)`,
        points: traceForward(start.x, start.y)
      };
    });
  }, [pathStarts, traceForward]);

  // Rendering Loop
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    // Handle High DPI scaling correctly
    const dpr = window.devicePixelRatio || 1;
    
    // Explicitly set the transform to match DPR.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const width = canvas.width / dpr;
    const height = canvas.height / dpr;

    const isDark = theme === 'dark';
    const colors = {
      bg: isDark ? '#111827' : '#f3f4f6',
      grid: isDark ? '#374151' : '#d1d5db',
      nodeCoprime: isDark ? '#1f2937' : '#ffffff',
      nodeFactor: isDark ? '#374151' : '#e5e7eb',
      text: isDark ? '#9ca3af' : '#374151',
      origin: '#fbbf24',
      tracePath: '#06b6d4',
    };

    ctx.fillStyle = colors.bg;
    ctx.fillRect(0, 0, width, height);

    const { x: centerX, y: centerY, zoom } = viewport;
    const halfWidth = width / 2;
    const halfHeight = height / 2;
    
    const minX = Math.floor(centerX - halfWidth / zoom);
    const maxX = Math.ceil(centerX + halfWidth / zoom);
    const minY = Math.floor(centerY - halfHeight / zoom);
    const maxY = Math.ceil(centerY + halfHeight / zoom);

    const showText = zoom > 30;
    const showNodes = zoom > 12;
    
    const toScreen = (gx: number, gy: number) => ({
      x: (gx - centerX) * zoom + halfWidth,
      y: -(gy - centerY) * zoom + halfHeight
    });

    // Thicker connections (Twice as wide)
    const gridLineWidth = Math.max(2, zoom / 7.5);
    ctx.lineWidth = gridLineWidth;
    ctx.lineCap = 'round';

    const totalNodes = (maxX - minX) * (maxY - minY);
    const skipFactor = totalNodes > 50000 ? Math.ceil(Math.sqrt(totalNodes / 50000)) : 1;

    // Reduced node size to increase gap
    const nodeSize = Math.max(2, zoom * 0.6); 

    const labels: { text: string; x: number; y: number; color: string; font: string; gKey?: string }[] = [];
    const labelIndexByKey = new Map<string, number>();

    const pushLabel = (
      label: { text: string; x: number; y: number; color: string; font: string; gKey?: string },
      options?: { overrideExisting?: boolean }
    ) => {
      if (label.gKey) {
        const existingIndex = labelIndexByKey.get(label.gKey);
        if (existingIndex !== undefined) {
          if (options?.overrideExisting) {
            labels[existingIndex] = label;
          }
          return;
        }
        labelIndexByKey.set(label.gKey, labels.length);
      }
      labels.push(label);
    };

    for (let gx = minX; gx <= maxX; gx += skipFactor) {
      for (let gy = minY; gy <= maxY; gy += skipFactor) {
        const { x: screenX, y: screenY } = toScreen(gx, gy);
        
        const isCoprime = computeBigIsCoprime(gx, gy);

        // Calculate display value
        const effectiveX = getEffectiveX(gx, gy);
        const needsNumberEval = isCoprime === null || simpleView;
        const vX = needsNumberEval ? Math.round(activeTransform(effectiveX)) : 0;
        const vY = needsNumberEval ? Math.round(activeTransform(gy)) : 0;

        let gcdExact: bigint | null = null;
        let displayVal: number;
        let isBig = false;

        if (isCoprime !== null) {
          const needsBigValue =
            (simpleView && !isCoprime) || (showText && skipFactor === 1 && !isCoprime);
          if (needsBigValue) {
            gcdExact = computeBigGcdValue(gx, gy);
          }
          if (gcdExact !== null) {
            isBig = gcdExact > MAX_SAFE_BIGINT;
            displayVal = isBig ? Number.MAX_SAFE_INTEGER : Number(gcdExact);
          } else {
            displayVal = isCoprime ? 1 : 2;
          }
        } else {
          displayVal = gcd(vX, vY);
        }

        // Always derive direction from the active move rule.
        // `checkGoesNorth` already uses the BigInt-precise path for the default coprime rule.
        let goesNorth: boolean;
        if (isCoprime !== null) {
          goesNorth = !isCoprime;
        } else {
          try {
            goesNorth = !moveRightPredicate(vX, vY);
          } catch {
            goesNorth = displayVal !== 1;
          }
        }
        
        // Visibility Logic
        // 1. Hide 1s always (unless origin)
        let hideNode = isCoprime !== null ? isCoprime : (displayVal === 1);

        // 2. Simple View Logic with Degree
        if (simpleView && !hideNode) {
          const valForSimple = isBig ? null : displayVal;
          if (valForSimple === null || valForSimple <= 1) {
            hideNode = true;
          } else {
            const k = getPrimeFactorCount(valForSimple);
            if (k !== degree) {
              hideNode = true;
            } else {
              // Check if val matches the transformed value of X or Y
              // This implies divisibility: displayVal == |vX| means vX divides vY or vice versa in terms of GCD structure
              const absVX = Math.abs(vX);
              const absVY = Math.abs(vY);
              if (valForSimple !== absVX && valForSimple !== absVY) {
                 hideNode = true;
              }
            }
          }
        }
        
        // Always show origin
        if (gx === 0 && gy === 0) hideNode = false;
        
        if (showNodes) {
            // Connections
            ctx.strokeStyle = colors.grid;
            ctx.lineWidth = gridLineWidth; 
            
            ctx.beginPath();
            ctx.moveTo(screenX, screenY);
            
            if (goesNorth) {
                const dest = toScreen(gx, gy + 1);
                ctx.lineTo(dest.x, dest.y);
            } else {
                const dest = toScreen(gx + 1, gy);
                ctx.lineTo(dest.x, dest.y);
            }
            ctx.stroke();

            // Node Body
            if (!hideNode) {
                let fillColor = displayVal === 1 ? colors.nodeCoprime : colors.nodeFactor;
                
                ctx.fillStyle = fillColor;
                const halfSize = nodeSize / 2;
                
                if (gx === 0 && gy === 0) {
                     ctx.fillStyle = colors.origin; 
                     ctx.strokeStyle = isDark ? '#000' : '#000';
                     ctx.lineWidth = 2;
                }
                
                ctx.fillRect(screenX - halfSize, screenY - halfSize, nodeSize, nodeSize);
            }
        }

        // Text
        if (showText && skipFactor === 1 && !hideNode) {
            const nodeBgColor = (gx === 0 && gy === 0)
              ? colors.origin
              : (displayVal === 1 ? colors.nodeCoprime : colors.nodeFactor);

            const bigLabel = gcdExact !== null && gcdExact > MAX_SAFE_BIGINT
              ? gcdExact.toString()
              : null;
            const label = makeLabel(displayVal, bigLabel, showFactored);
            if (label) {
                const fontSize = Math.min(nodeSize * 0.4, 16);
                pushLabel({
                  text: label,
                  x: screenX,
                  y: screenY,
                  color: getContrastingTextColor(nodeBgColor),
                  font: labelFont(fontSize),
                  gKey: `${gx},${gy}`
                });
            }
        } else if (gx === 0 && gy === 0) {
            const fontSize = Math.min(nodeSize * 0.4, 16);
            pushLabel({
              text: "0",
              x: screenX,
              y: screenY,
              color: getContrastingTextColor(colors.origin),
              font: labelFont(fontSize),
              gKey: `${gx},${gy}`
            });
        }
      }
    }

    // Combine Custom Paths
    const overlayPaths = [...customPaths];

    // Draw Overlay Paths
    overlayPaths.forEach(path => {
        ctx.beginPath();
        let segmentCount = 0;
        
        for (let i = 0; i < path.points.length - 1; i++) {
            const p1 = path.points[i];
            const p2 = path.points[i+1];

            if (p1.x < minX - 1 && p2.x < minX - 1) continue;
            if (p1.x > maxX + 1 && p2.x > maxX + 1) continue;
            if (p1.y < minY - 1 && p2.y < minY - 1) continue;
            if (p1.y > maxY + 1 && p2.y > maxY + 1) continue;

            const s1 = toScreen(p1.x, p1.y);
            const s2 = toScreen(p2.x, p2.y);
            
            ctx.moveTo(s1.x, s1.y);
            ctx.lineTo(s2.x, s2.y);
            segmentCount++;
        }
        
        if (segmentCount > 0) {
            // Draw Halo/Outline for visibility against grid
            ctx.save();
            ctx.strokeStyle = isDark ? 'rgba(17, 24, 39, 0.8)' : 'rgba(255, 255, 255, 0.8)';
            ctx.lineWidth = Math.max(5, zoom / 3.5);
            ctx.lineCap = 'round';
            ctx.stroke();
            ctx.restore();

            // Draw Main Path
            ctx.strokeStyle = path.color;
            ctx.lineWidth = Math.max(2.5, zoom / 6); 
            ctx.lineCap = 'round';
            ctx.stroke();
        }

        if (showNodes) {
            for (const p of path.points) {
                if (p.x < minX - 1 || p.x > maxX + 1 || p.y < minY - 1 || p.y > maxY + 1) continue;
                
                const isCoprimePath = computeBigIsCoprime(p.x, p.y);
                const effectiveX = getEffectiveX(p.x, p.y);
                const needsNumberEval = isCoprimePath === null || simpleView;
                const vX = needsNumberEval ? Math.round(activeTransform(effectiveX)) : 0;
                const vY = needsNumberEval ? Math.round(activeTransform(p.y)) : 0;

                let gcdExactPath: bigint | null = null;
                let val: number;
                let isBig = false;

                if (isCoprimePath !== null) {
                  const needsBigValue =
                    (simpleView && !isCoprimePath) || (showText && skipFactor === 1 && !isCoprimePath);
                  if (needsBigValue) {
                    gcdExactPath = computeBigGcdValue(p.x, p.y);
                  }
                  if (gcdExactPath !== null) {
                    isBig = gcdExactPath > MAX_SAFE_BIGINT;
                    val = isBig ? Number.MAX_SAFE_INTEGER : Number(gcdExactPath);
                  } else {
                    val = isCoprimePath ? 1 : 2;
                  }
                } else {
                  val = gcd(vX, vY);
                }

                // Visibility Logic for Paths (apply same rules)
                let hideNode = isCoprimePath !== null ? isCoprimePath : (val === 1);
                
                if (simpleView && !hideNode) {
                    const valForSimple = isBig ? null : val;
                    if (valForSimple === null || valForSimple <= 1) {
                        hideNode = true;
                    } else {
                        const k = getPrimeFactorCount(valForSimple);
                        if (k !== degree) {
                            hideNode = true;
                        } else {
                            // Unify logic: Check if gcd equals one of the components
                            const absVX = Math.abs(vX);
                            const absVY = Math.abs(vY);
                            if (valForSimple !== absVX && valForSimple !== absVY) {
                                 hideNode = true;
                            }
                        }
                    }
                }

                if (hideNode) continue;
                
                const s = toScreen(p.x, p.y);
                const halfSize = nodeSize / 2;
                
                ctx.fillStyle = path.color;
                ctx.fillRect(s.x - halfSize, s.y - halfSize, nodeSize, nodeSize);
                
                if (zoom > 10) {
                    ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)';
                    ctx.lineWidth = 1;
                    ctx.strokeRect(s.x - halfSize, s.y - halfSize, nodeSize, nodeSize);
                }

                if (showText && skipFactor === 1) {
                    const bigLabelPath = gcdExactPath !== null && gcdExactPath > MAX_SAFE_BIGINT
                      ? gcdExactPath.toString()
                      : null;
                    const label = (gcdExactPath !== null ? gcdExactPath > 1n : val > 1)
                      ? makeLabel(val, bigLabelPath, showFactored)
                      : "";
                    if (label) {
                        const fontSize = Math.min(nodeSize * 0.4, 16);
                        pushLabel({
                          text: label,
                          x: s.x,
                          y: s.y,
                          color: getContrastingTextColor(path.color),
                          font: labelFont(fontSize),
                          gKey: `${p.x},${p.y}`
                        }, { overrideExisting: true });
                    }
                }
            }
        }
    });

    // Draw Traced Backward Path (Traced from pointer up)
    if (tracedPath && tracedPath.length > 0) {
        ctx.beginPath();

        const start = tracedPath[0];
        const sStart = toScreen(start.x, start.y);
        ctx.moveTo(sStart.x, sStart.y);

        for (let i = 1; i < tracedPath.length; i++) {
            const p = tracedPath[i];
            const s = toScreen(p.x, p.y);
            ctx.lineTo(s.x, s.y);
        }

        // Draw Glow/Halo for Traced Path
        ctx.save();
        // Outer glow
        ctx.strokeStyle = isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.1)';
        ctx.lineWidth = Math.max(8, zoom / 1.5);
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.stroke();
        
        // Inner contrast outline
        ctx.strokeStyle = isDark ? 'rgba(0, 0, 0, 0.5)' : 'rgba(255, 255, 255, 0.8)';
        ctx.lineWidth = Math.max(6, zoom / 2.5);
        ctx.stroke();
        ctx.restore();

        // Main colored line
        ctx.strokeStyle = colors.tracePath;
        ctx.lineWidth = Math.max(3, zoom / 4);
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.stroke();

        if (showNodes) {
            for (const p of tracedPath) {
                 if (p.x < minX - 1 || p.x > maxX + 1 || p.y < minY - 1 || p.y > maxY + 1) continue;

                 const s = toScreen(p.x, p.y);
                 const halfSize = nodeSize / 2;
                 
                 ctx.fillStyle = '#ffffff';
                 ctx.fillRect(s.x - halfSize, s.y - halfSize, nodeSize, nodeSize);
                 
                 ctx.strokeStyle = colors.tracePath;
                 ctx.lineWidth = 2;
                 ctx.strokeRect(s.x - halfSize, s.y - halfSize, nodeSize, nodeSize);

                 if (showText && skipFactor === 1) {
                    const effectiveX = getEffectiveX(p.x, p.y);
                    const vX = Math.round(activeTransform(effectiveX));
                    const vY = Math.round(activeTransform(p.y));
                    const isCoprimeTrace = computeBigIsCoprime(p.x, p.y);

                    let gcdExactTrace: bigint | null = null;
                    let val: number;

                    if (isCoprimeTrace !== null) {
                      if (!isCoprimeTrace) {
                        gcdExactTrace = computeBigGcdValue(p.x, p.y);
                      }
                      if (gcdExactTrace !== null) {
                        val = gcdExactTrace > MAX_SAFE_BIGINT ? Number.MAX_SAFE_INTEGER : Number(gcdExactTrace);
                      } else {
                        val = isCoprimeTrace ? 1 : 2;
                      }
                    } else {
                      val = gcd(vX, vY);
                    }

                    const bigLabelTrace = gcdExactTrace !== null && gcdExactTrace > MAX_SAFE_BIGINT
                      ? gcdExactTrace.toString()
                      : null;
                    const label = (gcdExactTrace !== null ? gcdExactTrace > 1n : val > 1)
                      ? makeLabel(val, bigLabelTrace, showFactored)
                      : "";

                    if (label || (p.x===0 && p.y===0)) {
                        const fontSize = Math.min(nodeSize * 0.4, 16);
                        pushLabel({
                          text: p.x === 0 && p.y === 0 ? "0" : label,
                          x: s.x,
                          y: s.y,
                          color: '#000000',
                          font: labelFont(fontSize),
                          gKey: `${p.x},${p.y}`
                        });
                    }
                 }
            }
        }
    }

    if (labels.length > 0) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const l of labels) {
        ctx.fillStyle = l.color;
        ctx.font = l.font;
        ctx.fillText(l.text, l.x, l.y);
      }
    }

  }, [viewport, customPaths, tracedPath, theme, activeTransform, simpleView, computeBigIsCoprime, computeBigGcdValue, rowShift, showFactored, getEffectiveX, degree, moveRightPredicate]);

  // Render when inputs change instead of continuously looping, to reduce idle CPU.
  useEffect(() => {
    render();
  }, [render]);

  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current && canvasRef.current) {
        const dpr = window.devicePixelRatio || 1;
        const rect = containerRef.current.getBoundingClientRect();
        
        canvasRef.current.width = rect.width * dpr;
        canvasRef.current.height = rect.height * dpr;
        
        canvasRef.current.style.width = `${rect.width}px`;
        canvasRef.current.style.height = `${rect.height}px`;
        
        render();
      }
    };
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, [render]);


  const performZoom = (scaleFactor: number, centerClientX: number, centerClientY: number) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const mouseX = centerClientX - rect.left;
    const mouseY = centerClientY - rect.top;
    
    const width = rect.width;
    const height = rect.height;
    
    onViewportChange((prev) => {
      const newZoom = Math.min(prev.zoom * scaleFactor, 200);

      // Zoom towards the center point
      const mouseGraphX = (mouseX - width / 2) / prev.zoom + prev.x;
      const mouseGraphY = -((mouseY - height / 2) / prev.zoom - prev.y);

      const newX = mouseGraphX - (mouseX - width / 2) / newZoom;
      const newY = mouseGraphY + (mouseY - height / 2) / newZoom;

      return {
        x: newX,
        y: newY,
        zoom: newZoom
      };
    });
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    // Check if it's a mouse right click
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    
    if (e.pointerType === 'mouse') {
      containerRef.current?.setPointerCapture(e.pointerId);
    }
    evCache.current.set(e.pointerId, { id: e.pointerId, x: e.clientX, y: e.clientY });

    if (evCache.current.size === 1) {
         // Single touch/click: start potential drag or tap
        setIsDragging(true);
        isPinching.current = false;
        lastPos.current = { x: e.clientX, y: e.clientY };
        dragStartPos.current = { x: e.clientX, y: e.clientY };
    } else if (evCache.current.size === 2) {
        // Multi-touch: start pinch
        setIsDragging(false);
        isPinching.current = true;
        
        const points = Array.from(evCache.current.values()) as {id: number, x: number, y: number}[];
        const dx = points[0].x - points[1].x;
        const dy = points[0].y - points[1].y;
        prevPinchDiff.current = Math.hypot(dx, dy);
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    // 1. Update Cursor Position (graph coordinates)
    if (canvasRef.current) {
        const rect = canvasRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const centerX = viewport.x;
        const centerY = viewport.y;
        const halfWidth = rect.width / 2;
        const halfHeight = rect.height / 2;
        const gx = Math.round((x - halfWidth) / viewport.zoom + centerX);
        const gy = Math.round(-((y - halfHeight) / viewport.zoom - centerY));
        
        onCursorMove({ x: gx, y: gy });
    }

    // 2. Update Pointer Cache
    if (evCache.current.has(e.pointerId)) {
        evCache.current.set(e.pointerId, { id: e.pointerId, x: e.clientX, y: e.clientY });
    }

    // 3. Handle Interactions
    if (evCache.current.size === 2) {
        // Handle Pinch Zoom
        const points = Array.from(evCache.current.values()) as {id: number, x: number, y: number}[];
        const dx = points[0].x - points[1].x;
        const dy = points[0].y - points[1].y;
        const curDiff = Math.hypot(dx, dy);

        if (prevPinchDiff.current > 0) {
            const zoomFactor = curDiff / prevPinchDiff.current;
            const cx = (points[0].x + points[1].x) / 2;
            const cy = (points[0].y + points[1].y) / 2;
            
            performZoom(zoomFactor, cx, cy);
            
            prevPinchDiff.current = curDiff;
        }
    } else if (evCache.current.size === 1 && isDragging) {
        // Handle Pan
        const dx = e.clientX - lastPos.current.x;
        const dy = e.clientY - lastPos.current.y;
        lastPos.current = { x: e.clientX, y: e.clientY };
        onViewportChange((prev) => ({
          ...prev,
          x: prev.x - dx / prev.zoom,
          y: prev.y + dy / prev.zoom
        }));
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    // Detect Tap Logic
    // We only trigger 'tap' if:
    // 1. There is only 1 active pointer (the one being lifted)
    // 2. We were not pinching recently (isPinching flag)
    // 3. The pointer type supports it (if mouse, check left button)

    const isLastFinger = evCache.current.size === 1 && evCache.current.has(e.pointerId);
    
    if (isLastFinger && !isPinching.current && (e.pointerType !== 'mouse' || e.button === 0)) {
         const dist = Math.hypot(e.clientX - dragStartPos.current.x, e.clientY - dragStartPos.current.y);
         // Increased threshold for touch slop
         if (dist < 10 && canvasRef.current) {
             // Toggle Custom Path
             const rect = canvasRef.current.getBoundingClientRect();
             const x = e.clientX - rect.left;
             const y = e.clientY - rect.top;
             const centerX = viewport.x;
             const centerY = viewport.y;
             const halfWidth = rect.width / 2;
             const halfHeight = rect.height / 2;
             const gx = Math.round((x - halfWidth) / viewport.zoom + centerX);
             const gy = Math.round(-((y - halfHeight) / viewport.zoom - centerY));

             const clicked = { x: gx, y: gy };
             const tracedKey = tracedAnchor.current ? `${tracedAnchor.current.x},${tracedAnchor.current.y}` : '';
             const clickedKey = `${clicked.x},${clicked.y}`;

             if (tracedPath && tracedPath.length > 0 && tracedKey && tracedKey === clickedKey) {
               const target = tracedPath[tracedPath.length - 1] ?? clicked;
               setTracedPath(null);
               tracedAnchor.current = null;
               onTogglePathStart(target);
             } else {
               onTogglePathStart(clicked);
             }
         }
    }

    // Cleanup
    evCache.current.delete(e.pointerId);
    if (e.pointerType === 'mouse') {
      containerRef.current?.releasePointerCapture(e.pointerId);
    }
    
    if (evCache.current.size < 2) {
        prevPinchDiff.current = -1;
    }

    if (evCache.current.size === 1) {
        const point = evCache.current.values().next().value;
        lastPos.current = { x: point.x, y: point.y };
        setIsDragging(true);
        isPinching.current = false;
    } else if (evCache.current.size === 0) {
        setIsDragging(false);
        isPinching.current = false;
    }
  };

  const handlePointerLeave = (e: React.PointerEvent) => {
    // On leave, we just clean up. We DO NOT trigger taps.
    evCache.current.delete(e.pointerId);
    if (e.pointerType === 'mouse') {
      containerRef.current?.releasePointerCapture(e.pointerId);
    }

    if (evCache.current.size === 1) {
        const point = evCache.current.values().next().value;
        lastPos.current = { x: point.x, y: point.y };
        setIsDragging(true);
        isPinching.current = false;
    } else if (evCache.current.size === 0) {
        setIsDragging(false);
        isPinching.current = false;
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!canvasRef.current) return;

    // Trace Backward on Right Click
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const centerX = viewport.x;
    const centerY = viewport.y;
    const halfWidth = rect.width / 2;
    const halfHeight = rect.height / 2;
    const gx = Math.round((x - halfWidth) / viewport.zoom + centerX);
    const gy = Math.round(-((y - halfHeight) / viewport.zoom - centerY));

    const key = `${gx},${gy}`;
    if (tracedAnchor.current && `${tracedAnchor.current.x},${tracedAnchor.current.y}` === key) {
      setTracedPath(null);
      tracedAnchor.current = null;
      return;
    }

    const path = findPathToBottommostRightmost({ x: gx, y: gy });
    tracedAnchor.current = { x: gx, y: gy };
    setTracedPath(path);
  };

  const handleWheel = useCallback((e: WheelEvent | React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = Math.pow(1.1, 3);
    const direction = e.deltaY > 0 ? 1 / zoomFactor : zoomFactor;
    performZoom(direction, e.clientX, e.clientY);
  }, [performZoom]);

  // Ensure wheel listener is non-passive so we can preventDefault without warnings
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const listener = (evt: WheelEvent) => handleWheel(evt);
    el.addEventListener('wheel', listener, { passive: false });
    return () => el.removeEventListener('wheel', listener);
  }, [handleWheel]);

  return (
    <div 
      ref={containerRef} 
      className={`w-full h-full overflow-hidden touch-none cursor-move ${theme === 'dark' ? 'bg-gray-900' : 'bg-gray-50'}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerLeave}
      onPointerCancel={handlePointerLeave}
      onContextMenu={handleContextMenu}
    >
      <canvas ref={canvasRef} className="block w-full h-full" />
    </div>
  );
};

export default InfiniteGraph;
