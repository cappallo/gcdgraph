import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { gcd, formatValue, createTransformFunction, getPrimeFactorCount } from '../utils/math';
import { Viewport, Point, Theme } from '../types';
import { getRowShiftMagnitude } from '../utils/grid';

interface InfiniteGraphProps {
  viewport: Viewport;
  onViewportChange: (v: Viewport) => void;
  theme: Theme;
  transformFunc: string;
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
  pathCoordinateCap: number;
  backtraceLimit: number;
}

// Calculate a readable text color (black/white) against a given background color.
// Supports hex (#rgb/#rrggbb) and hsl() strings.
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
    const hslMatch = c.match(/hsl\(([-\d.]+),\s*([\d.]+)%?,\s*([\d.]+)%?\)/i);
    if (hslMatch) {
      const h = parseFloat(hslMatch[1]);
      const s = parseFloat(hslMatch[2]) / 100;
      const l = parseFloat(hslMatch[3]) / 100;
      return hslToRgb(h, s, l);
    }
    return null;
  };

  const rgb = parseColor(bgColor);
  if (!rgb) return '#000000';

  const [r, g, b] = rgb.map(v => v / 255);
  const toLinear = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const luminance = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);

  return luminance > 0.55 ? '#111111' : '#ffffff';
};

const InfiniteGraph: React.FC<InfiniteGraphProps> = ({ 
  viewport, 
  onViewportChange, 
  theme, 
  transformFunc,
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
  pathCoordinateCap,
  backtraceLimit
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

  // Create the transform function from string
  const activeTransform = useMemo(() => {
    return createTransformFunction(transformFunc);
  }, [transformFunc]);

  useEffect(() => {
    setTracedPath(null);
    tracedAnchor.current = null;
  }, [transformFunc, rowShift, randomizeShift]);

  // External reset for all user-created paths
  useEffect(() => {
    setTracedPath(null);
    tracedAnchor.current = null;
  }, [resetPathsSignal]);

  // Helper to calculate effective X based on row shift
  const getEffectiveX = useCallback((gx: number, gy: number) => {
    const offset = getRowShiftMagnitude(gy, rowShift, randomizeShift);
    if (offset > 0) {
        if (gy > 0) return gx - offset;
        if (gy < 0) return gx + offset;
    }
    return gx;
  }, [rowShift, randomizeShift, getRowShiftMagnitude]);

  // Offset helper used to keep custom start nodes aligned with row shifts
  // Logic helper: Determine direction based on Coprime rule + Row Shift
  const checkGoesNorth = useCallback((gx: number, gy: number) => {
    const effectiveX = getEffectiveX(gx, gy);
    
    // Apply Transform
    const vX = Math.round(activeTransform(effectiveX));
    const vY = Math.round(activeTransform(gy));
    
    // Rule: Coprime (gcd=1) -> East (return false)
    //       Not Coprime (gcd!=1) -> North (return true)
    return gcd(vX, vY) !== 1;
  }, [activeTransform, getEffectiveX]);

  // Helper to trace a path forward from a given point
  const traceForward = useCallback((startX: number, startY: number) => {
    const points: Point[] = [];
    let currX = startX;
    let currY = startY;
    const maxSteps = Math.max(1, pathStepLimit);
    
    for (let step = 0; step < maxSteps; step++) {
      points.push({ x: currX, y: currY });
      
      if (checkGoesNorth(currX, currY)) {
        currY += 1;
      } else {
        currX += 1;
      }
      
      if (Math.abs(currX) > pathCoordinateCap || Math.abs(currY) > pathCoordinateCap) break;
    }
    return points;
  }, [checkGoesNorth, pathCoordinateCap, pathStepLimit]);

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

    for (let gx = minX; gx <= maxX; gx += skipFactor) {
      for (let gy = minY; gy <= maxY; gy += skipFactor) {
        const { x: screenX, y: screenY } = toScreen(gx, gy);
        
        // Calculate display value
        const effectiveX = getEffectiveX(gx, gy);
        const valX = activeTransform(effectiveX);
        const valY = activeTransform(gy);
        const vX = Math.round(valX);
        const vY = Math.round(valY);
        
        const goesNorth = checkGoesNorth(gx, gy);
        
        const displayVal = gcd(vX, vY);
        
        // Visibility Logic
        // 1. Hide 1s always (unless origin)
        let hideNode = (displayVal === 1);

        // 2. Simple View Logic with Degree
        if (simpleView && !hideNode) {
            const k = getPrimeFactorCount(displayVal);
            if (k !== degree) {
                hideNode = true;
            } else {
                // Check if val matches the transformed value of X or Y
                // This implies divisibility: displayVal == |vX| means vX divides vY or vice versa in terms of GCD structure
                const absVX = Math.abs(vX);
                const absVY = Math.abs(vY);
                if (displayVal !== absVX && displayVal !== absVY) {
                     hideNode = true;
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

            if (displayVal > 1) {
                const label = showFactored ? formatValue(displayVal) : displayVal.toString();
                if (label) {
                    ctx.fillStyle = getContrastingTextColor(nodeBgColor);
                    const fontSize = Math.min(nodeSize * 0.4, 16);
                    ctx.font = `bold ${fontSize}px sans-serif`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(label, screenX, screenY);
                }
            } else if (gx === 0 && gy === 0) {
                 ctx.fillStyle = getContrastingTextColor(nodeBgColor);
                 ctx.font = `bold ${Math.min(nodeSize * 0.4, 16)}px sans-serif`;
                 ctx.textAlign = 'center';
                 ctx.textBaseline = 'middle';
                 ctx.fillText("0", screenX, screenY);
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
                
                const effectiveX = getEffectiveX(p.x, p.y);
                const valX = activeTransform(effectiveX);
                const valY = activeTransform(p.y);
                const val = gcd(Math.round(valX), Math.round(valY));
                
                // Visibility Logic for Paths (apply same rules)
                let hideNode = (val === 1);
                
                if (simpleView && !hideNode) {
                    const k = getPrimeFactorCount(val);
                    if (k !== degree) {
                        hideNode = true;
                    } else {
                        // Unify logic: Check if gcd equals one of the components
                        const absVX = Math.abs(Math.round(valX));
                        const absVY = Math.abs(Math.round(valY));
                        if (val !== absVX && val !== absVY) {
                             hideNode = true;
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
                    const label = (val > 1) ? (showFactored ? formatValue(val) : val.toString()) : "";
                    if (label) {
                        ctx.fillStyle = getContrastingTextColor(path.color); 
                        const fontSize = Math.min(nodeSize * 0.4, 16);
                        ctx.font = `bold ${fontSize}px sans-serif`;
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillText(label, s.x, s.y);
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
                    const valX = activeTransform(effectiveX);
                    const valY = activeTransform(p.y);
                    const val = gcd(Math.round(valX), Math.round(valY));
                    const label = (val > 1) ? (showFactored ? formatValue(val) : val.toString()) : "";
                    
                    if (label || (p.x===0 && p.y===0)) {
                        ctx.fillStyle = '#000000';
                        const fontSize = Math.min(nodeSize * 0.4, 16);
                        ctx.font = `bold ${fontSize}px sans-serif`;
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        if (p.x === 0 && p.y === 0) {
                             ctx.fillText("0", s.x, s.y);
                        } else {
                             ctx.fillText(label, s.x, s.y);
                        }
                    }
                 }
            }
        }
    }

  }, [viewport, customPaths, tracedPath, theme, activeTransform, simpleView, checkGoesNorth, rowShift, showFactored, getEffectiveX, degree]);

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

  const findPathToLeftmost = (start: Point): Point[] => {
    if (Math.abs(start.x) > pathCoordinateCap || Math.abs(start.y) > pathCoordinateCap) return [];
    const q: Point[] = [start];
    const parent = new Map<string, Point | null>();
    const startKey = `${start.x},${start.y}`;
    parent.set(startKey, null);
    
    const visited = new Set<string>();
    visited.add(startKey);

    let steps = 0;
    const maxSteps = Math.max(1, backtraceLimit);
    let best = start;

    while (q.length > 0 && steps < maxSteps) {
        const curr = q.shift()!;
        steps++;

        if (curr.x < best.x || (curr.x === best.x && curr.y < best.y)) {
            best = curr;
        }

        // Neighbors that could connect TO curr (west/south)
        const candidates = [
            { x: curr.x - 1, y: curr.y },
            { x: curr.x, y: curr.y - 1 }
        ];

        for (const cand of candidates) {
            const key = `${cand.x},${cand.y}`;
            if (visited.has(key)) continue;
            if (Math.abs(cand.x) > pathCoordinateCap || Math.abs(cand.y) > pathCoordinateCap) continue;

            // Determine if 'cand' actually points to 'curr'
            let connects = false;
            const candGoesNorth = checkGoesNorth(cand.x, cand.y);

            if (cand.x === curr.x - 1 && cand.y === curr.y) {
                // cand is West. Connects to curr (East) if it does NOT go North.
                if (!candGoesNorth) connects = true;
            } else if (cand.x === curr.x && cand.y === curr.y - 1) {
                // cand is South. Connects to curr (North) if it DOES go North.
                if (candGoesNorth) connects = true;
            }

            if (connects) {
                visited.add(key);
                parent.set(key, curr); 
                q.push(cand);
            }
        }
    }

    // Reconstruct path from start to best (leftmost) using parents
    const path: Point[] = [];
    let trace: Point | null | undefined = best;
    while (trace) {
        path.push(trace);
        trace = parent.get(`${trace.x},${trace.y}`);
    }
    return path.reverse();
  };

  const performZoom = (scaleFactor: number, centerClientX: number, centerClientY: number) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const mouseX = centerClientX - rect.left;
    const mouseY = centerClientY - rect.top;
    
    const newZoom = Math.min(Math.max(viewport.zoom * scaleFactor, 0.5), 200);

    const width = rect.width;
    const height = rect.height;
    
    // Zoom towards the center point
    const mouseGraphX = (mouseX - width/2) / viewport.zoom + viewport.x;
    const mouseGraphY = -(mouseY - height/2) / viewport.zoom + viewport.y; 
    
    const newX = mouseGraphX - (mouseX - width/2) / newZoom;
    const newY = mouseGraphY + (mouseY - height/2) / newZoom;

    onViewportChange({
        x: newX,
        y: newY,
        zoom: newZoom
    });
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    // Check if it's a mouse right click
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    
    containerRef.current?.setPointerCapture(e.pointerId);
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
        onViewportChange({
          ...viewport,
          x: viewport.x - dx / viewport.zoom,
          y: viewport.y + dy / viewport.zoom,
        });
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

             onTogglePathStart({ x: gx, y: gy });
         }
    }

    // Cleanup
    evCache.current.delete(e.pointerId);
    containerRef.current?.releasePointerCapture(e.pointerId);
    
    if (evCache.current.size < 2) {
        prevPinchDiff.current = -1;
    }
    if (evCache.current.size === 0) {
        setIsDragging(false);
    }
  };

  const handlePointerLeave = (e: React.PointerEvent) => {
    // On leave, we just clean up. We DO NOT trigger taps.
    evCache.current.delete(e.pointerId);
    containerRef.current?.releasePointerCapture(e.pointerId);
    if (evCache.current.size === 0) {
        setIsDragging(false);
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

    const path = findPathToLeftmost({ x: gx, y: gy });
    tracedAnchor.current = { x: gx, y: gy };
    setTracedPath(path);
  };

  const handleWheel = useCallback((e: WheelEvent | React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = 1.1;
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
