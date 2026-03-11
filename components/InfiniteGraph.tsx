import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { gcd, gcdBigInt, gcdIsOneBigInt, formatValue, createTransformFunction, getPrimeFactorCount, isPrime, splitTopLevelExpressions, TransformFunction } from '../utils/math';
import { Viewport, Point, Theme } from '../types';
import { getRowShiftMagnitude } from '../utils/grid';
import { MovePredicate } from '../utils/moveRule';
import { findPathToGround, BacktraceConfig } from '../utils/backtrace';

interface InfiniteGraphProps {
  viewport: Viewport;
  onViewportChange: React.Dispatch<React.SetStateAction<Viewport>>;
  theme: Theme;
  transformFunc: string;
  overlayPlotExpr: string;
  frontierWalk: boolean;
  moveRightPredicate: MovePredicate;
  simpleView: boolean;
  showFactored: boolean;
  rowShift: number;
  randomizeShift: boolean;
  wraparound: boolean;
  onCursorMove: (p: Point) => void;
  degree: number;
  resetPathsSignal: number;
  pathStarts: Point[];
  onTogglePathStart: (p: Point) => void;
  pathStepLimit: number;
  backtraceLimit: number;
  groundRow: number;
  detailZoomCutoff: number;
  onBacktrailChange?: (len: number | null) => void;
  shear: boolean;
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

const OVERLAY_PLOT_COLORS = [
  { light: '#ea580c', dark: '#fcd34d' },
  { light: '#38bdf8', dark: '#7dd3fc' },
  { light: '#22c55e', dark: '#4ade80' },
  { light: '#e11d48', dark: '#fb7185' },
  { light: '#7c3aed', dark: '#a78bfa' },
  { light: '#0f766e', dark: '#2dd4bf' },
];

const getOverlayPlotStrokeColor = (index: number, isDark: boolean) => {
  const preset = OVERLAY_PLOT_COLORS[index];
  if (preset) return isDark ? preset.dark : preset.light;

  const hue = (index * 137.508) % 360;
  const saturation = 72;
  const lightness = isDark ? 70 : 46;
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
};

const getFrontierWalkStrokeColor = (isDark: boolean) =>
  isDark ? '#fecdd3' : '#be123c';

const getFrontierWalkMarkerColor = (isDark: boolean) =>
  isDark ? '#fcd34d' : '#7c2d12';

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
  overlayPlotExpr,
  frontierWalk,
  moveRightPredicate,
  simpleView,
  showFactored,
  rowShift,
  randomizeShift,
  wraparound,
  onCursorMove,
  degree,
  resetPathsSignal,
  pathStarts,
  onTogglePathStart,
  pathStepLimit,
  backtraceLimit,
  groundRow,
  detailZoomCutoff,
  onBacktrailChange,
  shear
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

  const overlayPlotExpressions = useMemo(() => {
    return splitTopLevelExpressions(overlayPlotExpr);
  }, [overlayPlotExpr]);

  const overlayPlotTransforms = useMemo(() => {
    return overlayPlotExpressions.map((expr) => ({
      expr,
      transform: createTransformFunction(expr),
    }));
  }, [overlayPlotExpressions]);

  const cacheKey = useMemo(() => {
    return `${transformFunc}|${rowShift}|${randomizeShift ? 1 : 0}|${shear ? 1 : 0}|${moveRightPredicate.isDefaultCoprimeRule ? 1 : 0}`;
  }, [moveRightPredicate.isDefaultCoprimeRule, randomizeShift, rowShift, shear, transformFunc]);

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

  // Helper to calculate effective X based on row shift (and optional shear)
  const getEffectiveX = useCallback((gx: number, gy: number) => {
    const shearedX = shear ? gx + gy : gx;
    const offset = getRowShiftMagnitude(gy, rowShift, randomizeShift);
    if (offset > 0) {
        if (gy > 0) return shearedX - offset;
        if (gy < 0) return shearedX + offset;
    }
    return shearedX;
  }, [shear, rowShift, randomizeShift]);

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
    const rawX = Math.round(effectiveX);
    const rawY = Math.round(gy);

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
      return !moveRightPredicate(rawX, rawY, activeTransform);
    } catch {
      return gcd(vX, vY) !== 1;
    }
  }, [activeTransform, computeBigIsCoprime, getEffectiveX, moveRightPredicate]);

  const getNorthStepY = useCallback(
    (currX: number, currY: number) => {
      const nextY = currY + 1;
      if (wraparound && nextY === currX) return 0;
      return nextY;
    },
    [wraparound]
  );

  // Backtrace configuration, memoised so the effect below reruns only when
  // relevant inputs actually change.
  const backtraceConfig: BacktraceConfig = useMemo(() => ({
    checkGoesNorth,
    getNorthStepY,
    getEffectiveX,
    groundRow,
    backtraceLimit,
    canFastForward,
    wraparound,
    transform: (n: number) => Math.round(activeTransform(n)),
    isDefaultCoprimeRule: Boolean(moveRightPredicate.isDefaultCoprimeRule),
  }), [checkGoesNorth, getNorthStepY, getEffectiveX, groundRow, backtraceLimit, canFastForward, wraparound, activeTransform, moveRightPredicate.isDefaultCoprimeRule]);

  // If the user changes the move rule / transform / row-shift while a backtrace is visible,
  // recompute it so it stays consistent with the new evaluation.
  useEffect(() => {
    if (!tracedAnchor.current) {
      setTracedPath(null);
      return;
    }
    setTracedPath(findPathToGround(tracedAnchor.current, backtraceConfig));
  }, [backtraceConfig, moveRightPredicate, transformFunc, rowShift, randomizeShift, wraparound]);

  const getEastJumpLength = useCallback((currX: number, currY: number, maxJump: number) => {
    if (!canFastForward || maxJump <= 1) return 1;

    const p = Math.abs(currY);
    if (p <= 1) return 1;

    const effectiveX = getEffectiveX(currX, currY);
    let remaining = p;
    let jump = Infinity;

    while (remaining > 1) {
      const factor =
        remaining % 2 === 0
          ? 2
          : (() => {
              for (let i = 3; i * i <= remaining; i += 2) {
                if (remaining % i === 0) return i;
              }
              return remaining;
            })();

      const rem = ((effectiveX % factor) + factor) % factor;
      const skip = rem === 0 ? factor : factor - rem;
      if (skip < jump) jump = skip;
      if (jump === 1) break;

      while (remaining % factor === 0) remaining /= factor;
    }

    if (jump === Infinity) return 1;
    return Math.max(1, Math.min(jump, maxJump));
  }, [canFastForward, getEffectiveX]);

  // Helper to trace a path forward from a given point
  const traceForward = useCallback((startX: number, startY: number) => {
    const points: Point[] = [{ x: startX, y: startY }];
    let currX = startX;
    let currY = startY;
    const seen = new Set<string>([`${currX},${currY}`]);
    const maxSteps = Math.max(1, pathStepLimit);
    let stepsUsed = 0;

    while (stepsUsed < maxSteps) {
      const goesNorth = checkGoesNorth(currX, currY);
      if (goesNorth) {
        const nextY = getNorthStepY(currX, currY);
        const nextKey = `${currX},${nextY}`;
        if (seen.has(nextKey)) break;
        currY = nextY;
        stepsUsed += 1;
        points.push({ x: currX, y: currY });
        seen.add(nextKey);
        continue;
      }

      const jump = getEastJumpLength(currX, currY, maxSteps - stepsUsed);
      currX += jump;
      const nextKey = `${currX},${currY}`;
      if (seen.has(nextKey)) break;
      stepsUsed += jump;
      points.push({ x: currX, y: currY });
      seen.add(nextKey);
    }
    return points;
  }, [checkGoesNorth, pathStepLimit, getEastJumpLength, getNorthStepY]);

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

    // When shear is on, lattice node (gx, gy) is rendered at display x = gx + gy.
    // Expand the gx loop bounds to cover all nodes whose display x falls on screen.
    const loopMinX = shear ? minX - maxY : minX;
    const loopMaxX = shear ? maxX - minY : maxX;

    const showText = zoom > detailZoomCutoff;
    
    const toScreen = (gx: number, gy: number) => ({
      x: ((shear ? gx + gy : gx) - centerX) * zoom + halfWidth,
      y: -(gy - centerY) * zoom + halfHeight
    });

    const toScreenUnsheared = (gx: number, gy: number) => ({
      x: (gx - centerX) * zoom + halfWidth,
      y: -(gy - centerY) * zoom + halfHeight
    });

    const isWrapDiscontinuity = (p1: Point, p2: Point) =>
      wraparound && p1.x === p2.x && Math.abs(p2.y - p1.y) > 1;

    const buildFrontierWalkPoints = () => {
      if (!frontierWalk) {
        return { points: [] as Point[], stepPoints: [] as Point[] };
      }

      const points: Point[] = [{ x: 2, y: 2 }];
      const stepPoints: Point[] = [{ x: 2, y: 2 }];
      let frontierX = 2;
      let frontierY = 2;
      const xMargin = Math.max(8, Math.ceil((maxX - minX) * 0.6));
      const yMargin = Math.max(8, Math.ceil((maxY - minY) * 0.6));
      const stopX = maxX + xMargin;
      const stopY = maxY + yMargin;
      const maxAdvance = Math.max(4000, (stopX - minX + stopY - minY) * 16);
      const maxRepeats = 256;

      const findNextPrimeRow = (currentY: number) => {
        const start = Math.max(2, Math.floor(currentY) + 1);
        for (let candidate = start; candidate <= start + maxAdvance; candidate += 1) {
          if (isPrime(candidate)) return candidate;
        }
        return null;
      };

      for (let repeat = 0; repeat < maxRepeats; repeat += 1) {
        if (frontierX > stopX && frontierY > stopY) break;

        const jumpPoint = { x: frontierX + frontierY, y: frontierY };
        points.push(jumpPoint);

        let currX = jumpPoint.x;
        let currY = jumpPoint.y;
        const targetPrimeY = findNextPrimeRow(frontierY);
        if (targetPrimeY === null) break;

        const seen = new Set<string>([`${currX},${currY}`]);
        let budget = maxAdvance;
        let completedSegment = false;

        while (budget > 0) {
          const goesNorth = checkGoesNorth(currX, currY);
          if (currY === targetPrimeY && goesNorth) {
            completedSegment = true;
            stepPoints.push({ x: currX, y: currY });
            break;
          }

          let nextX = currX;
          let nextY = currY;
          let cost = 1;

          if (goesNorth) {
            nextY = getNorthStepY(currX, currY);
          } else {
            cost = getEastJumpLength(currX, currY, budget);
            nextX += cost;
          }

          const nextKey = `${nextX},${nextY}`;
          if (seen.has(nextKey)) break;

          points.push({ x: nextX, y: nextY });
          seen.add(nextKey);
          currX = nextX;
          currY = nextY;
          budget -= cost;
        }

        frontierX = currX;
        frontierY = currY;
        if (!completedSegment) break;
      }

      return { points, stepPoints };
    };

    // Thicker connections (Twice as wide)
    const gridLineWidth = Math.max(2, zoom / 7.5);
    ctx.lineWidth = gridLineWidth;
    ctx.lineCap = 'round';

    const totalNodes = (loopMaxX - loopMinX) * (maxY - minY);
    const skipFactor = totalNodes > 50000 ? Math.ceil(Math.sqrt(totalNodes / 50000)) : 1;
    const showGraphDetails = showText && skipFactor === 1;

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

    for (let gx = loopMinX; gx <= loopMaxX; gx += skipFactor) {
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
            (simpleView && !isCoprime) || (showGraphDetails && !isCoprime);
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
            goesNorth = !moveRightPredicate(Math.round(effectiveX), Math.round(gy), activeTransform);
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
        
        if (showGraphDetails) {
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
        if (showGraphDetails && !hideNode) {
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

            if (isWrapDiscontinuity(p1, p2)) continue;

            const p1dx = shear ? p1.x + p1.y : p1.x;
            const p2dx = shear ? p2.x + p2.y : p2.x;
            if (p1dx < minX - 1 && p2dx < minX - 1) continue;
            if (p1dx > maxX + 1 && p2dx > maxX + 1) continue;
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

        if (showGraphDetails) {
            for (const p of path.points) {
                const pdx = shear ? p.x + p.y : p.x;
                if (pdx < minX - 1 || pdx > maxX + 1 || p.y < minY - 1 || p.y > maxY + 1) continue;
                
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
                    (simpleView && !isCoprimePath) || (showGraphDetails && !isCoprimePath);
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

                if (showGraphDetails) {
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
            const prev = tracedPath[i - 1];
            const p = tracedPath[i];
            const s = toScreen(p.x, p.y);
            if (isWrapDiscontinuity(prev, p)) {
                ctx.moveTo(s.x, s.y);
            } else {
                ctx.lineTo(s.x, s.y);
            }
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

        if (showGraphDetails) {
            for (const p of tracedPath) {
                 if (p.x < minX - 1 || p.x > maxX + 1 || p.y < minY - 1 || p.y > maxY + 1) continue;

                 const s = toScreen(p.x, p.y);
                 const halfSize = nodeSize / 2;
                 
                 ctx.fillStyle = '#ffffff';
                 ctx.fillRect(s.x - halfSize, s.y - halfSize, nodeSize, nodeSize);
                 
                 ctx.strokeStyle = colors.tracePath;
                 ctx.lineWidth = 2;
                 ctx.strokeRect(s.x - halfSize, s.y - halfSize, nodeSize, nodeSize);

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

    if (labels.length > 0) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const l of labels) {
        ctx.fillStyle = l.color;
        ctx.font = l.font;
        ctx.fillText(l.text, l.x, l.y);
      }
    }

    if (overlayPlotTransforms.length > 0) {
      const paramMin = minY - 1;
      const paramMax = maxY + 1;
      const sampleCount = Math.max(160, Math.ceil(height / 2));
      const step = (paramMax - paramMin) / sampleCount;
      const xRange = Math.max(1, maxX - minX);
      const xMargin = Math.max(6, xRange * 0.5);
      const maxScreenJump = Math.max(120, width * 0.85);
      const dashLength = 12;
      const gapLength = 8;

      overlayPlotTransforms.forEach(({ transform }, index) => {
        if (!transform.isValid) return;

        const plotPath = new Path2D();
        let prevPoint: { x: number; y: number } | null = null;
        let hasSegment = false;

        for (let i = 0; i <= sampleCount; i++) {
          const yVal = paramMin + step * i;
          const xVal = transform(yVal);

          if (!Number.isFinite(xVal) || xVal < minX - xMargin || xVal > maxX + xMargin) {
            prevPoint = null;
            continue;
          }

          const screenPoint = toScreenUnsheared(xVal, yVal);
          const farOffscreen =
            screenPoint.x < -width ||
            screenPoint.x > width * 2 ||
            screenPoint.y < -height ||
            screenPoint.y > height * 2;

          if (farOffscreen) {
            prevPoint = null;
            continue;
          }

          if (
            !prevPoint ||
            Math.abs(screenPoint.x - prevPoint.x) > maxScreenJump ||
            Math.abs(screenPoint.y - prevPoint.y) > maxScreenJump
          ) {
            plotPath.moveTo(screenPoint.x, screenPoint.y);
          } else {
            plotPath.lineTo(screenPoint.x, screenPoint.y);
            hasSegment = true;
          }

          prevPoint = screenPoint;
        }

        if (!hasSegment) return;

        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, width, height);
        ctx.clip();
        ctx.setLineDash([dashLength, gapLength]);
        ctx.lineDashOffset = 0;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';

        ctx.strokeStyle = isDark ? 'rgba(17, 24, 39, 0.95)' : 'rgba(255, 255, 255, 0.95)';
        ctx.lineWidth = 7;
        ctx.stroke(plotPath);

        ctx.strokeStyle = getOverlayPlotStrokeColor(index, isDark);
        ctx.lineWidth = 3;
        ctx.stroke(plotPath);
        ctx.restore();
      });
    }

    const { points: frontierWalkPoints, stepPoints: frontierStepPoints } = buildFrontierWalkPoints();
    if (frontierWalkPoints.length > 1) {
      const frontierPath = new Path2D();
      let hasSegment = false;

      for (let i = 0; i < frontierWalkPoints.length - 1; i += 1) {
        const p1 = frontierWalkPoints[i];
        const p2 = frontierWalkPoints[i + 1];

        if (isWrapDiscontinuity(p1, p2)) continue;

        const p1dx = shear ? p1.x + p1.y : p1.x;
        const p2dx = shear ? p2.x + p2.y : p2.x;
        if (p1dx < minX - 1 && p2dx < minX - 1) continue;
        if (p1dx > maxX + 1 && p2dx > maxX + 1) continue;
        if (p1.y < minY - 1 && p2.y < minY - 1) continue;
        if (p1.y > maxY + 1 && p2.y > maxY + 1) continue;

        const s1 = toScreen(p1.x, p1.y);
        const s2 = toScreen(p2.x, p2.y);
        frontierPath.moveTo(s1.x, s1.y);
        frontierPath.lineTo(s2.x, s2.y);
        hasSegment = true;
      }

      if (hasSegment) {
        const dotGap = Math.max(8, Math.round(zoom / 2.4));

        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, width, height);
        ctx.clip();
        ctx.setLineDash([1, dotGap]);
        ctx.lineDashOffset = 0;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';

        ctx.strokeStyle = isDark ? '#000000' : 'rgba(255, 255, 255, 0.96)';
        ctx.lineWidth = Math.max(6, zoom / 3.2);
        ctx.stroke(frontierPath);

        ctx.strokeStyle = getFrontierWalkStrokeColor(isDark);
        ctx.lineWidth = Math.max(3, zoom / 5.5);
        ctx.stroke(frontierPath);

        const markerRadius = Math.max(nodeSize * 0.6, zoom * 0.22, 5);
        const markerStroke = Math.max(2, zoom / 12);
        ctx.setLineDash([]);
        ctx.fillStyle = getFrontierWalkMarkerColor(isDark);
        ctx.strokeStyle = isDark ? '#000000' : 'rgba(255, 255, 255, 0.98)';
        ctx.lineWidth = markerStroke;

        frontierStepPoints.forEach((point) => {
          const displayX = shear ? point.x + point.y : point.x;
          if (displayX < minX - 1 || displayX > maxX + 1 || point.y < minY - 1 || point.y > maxY + 1) {
            return;
          }

          const screen = toScreen(point.x, point.y);
          ctx.beginPath();
          ctx.arc(screen.x, screen.y, markerRadius, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        });
        ctx.restore();
      }
    }

  }, [viewport, customPaths, tracedPath, theme, activeTransform, overlayPlotTransforms, simpleView, computeBigIsCoprime, computeBigGcdValue, rowShift, showFactored, getEffectiveX, degree, moveRightPredicate, wraparound, shear, frontierWalk, checkGoesNorth, getNorthStepY, getEastJumpLength]);

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
        const gy = Math.round(-((y - halfHeight) / viewport.zoom - centerY));
        const gx = Math.round((x - halfWidth) / viewport.zoom + centerX - (shear ? gy : 0));
        const cursorX = shear ? gx + gy : gx;

        onCursorMove({ x: cursorX, y: gy });
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
             const gy = Math.round(-((y - halfHeight) / viewport.zoom - centerY));
             const gx = Math.round((x - halfWidth) / viewport.zoom + centerX - (shear ? gy : 0));

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
    const gy = Math.round(-((y - halfHeight) / viewport.zoom - centerY));
    const gx = Math.round((x - halfWidth) / viewport.zoom + centerX - (shear ? gy : 0));

    const key = `${gx},${gy}`;
    if (tracedAnchor.current && `${tracedAnchor.current.x},${tracedAnchor.current.y}` === key) {
      setTracedPath(null);
      tracedAnchor.current = null;
      return;
    }

    const path = findPathToGround({ x: gx, y: gy }, backtraceConfig);
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
