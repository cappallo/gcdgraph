
import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { gcd, formatValue, getPartitionColor, createTransformFunction, isComposite } from '../utils/math';
import { Viewport, Point, Theme } from '../types';

interface InfiniteGraphProps {
  viewport: Viewport;
  onViewportChange: (v: Viewport) => void;
  theme: Theme;
  transformFunc: string;
  simpleView: boolean;
  showFactored: boolean;
  rowShift: number;
  onCursorMove: (p: Point) => void;
}

const InfiniteGraph: React.FC<InfiniteGraphProps> = ({ 
  viewport, 
  onViewportChange, 
  theme, 
  transformFunc,
  simpleView,
  showFactored,
  rowShift,
  onCursorMove
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const lastPos = useRef({ x: 0, y: 0 });
  const dragStartPos = useRef({ x: 0, y: 0 });
  const animationFrameId = useRef<number>(0);

  // Trace Path State (Backward from click)
  const [tracedPath, setTracedPath] = useState<Point[] | null>(null);

  // Custom Forward Paths (Forward from right-click)
  const [customStarts, setCustomStarts] = useState<Point[]>([]);

  // Create the transform function from string
  const activeTransform = useMemo(() => {
    return createTransformFunction(transformFunc);
  }, [transformFunc]);

  useEffect(() => {
    setTracedPath(null);
  }, [viewport, transformFunc, rowShift]);

  // Helper to calculate effective X based on row shift
  const getEffectiveX = useCallback((gx: number, gy: number) => {
    if (Math.abs(gy) <= rowShift) {
        if (gy > 0) return gx - rowShift;
        if (gy < 0) return gx + rowShift;
    }
    return gx;
  }, [rowShift]);

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
  const traceForward = useCallback((startX: number, startY: number, maxSteps: number = 5000) => {
    const points: Point[] = [];
    let currX = startX;
    let currY = startY;
    
    for (let step = 0; step < maxSteps; step++) {
      points.push({ x: currX, y: currY });
      
      if (checkGoesNorth(currX, currY)) {
        currY += 1;
      } else {
        currX += 1;
      }
      
      if (currX > 5000 || currY > 5000) break;
    }
    return points;
  }, [checkGoesNorth]);

  // Pre-calculate "Rightmost" Partition Paths
  const partitionPaths = useMemo(() => {
    const paths: { color: string, points: Point[] }[] = [];
    
    for (let n = 1; n <= 0; n++) {
      paths.push({
        color: getPartitionColor(n),
        points: traceForward(Math.pow(n, 3), Math.pow(n, 2))
      });
    }
    return paths;
  }, [traceForward]);

  // Calculate user-defined custom paths
  const customPaths = useMemo(() => {
    return customStarts.map(start => {
      // Deterministic color based on coordinates
      const hue = ((start.x * 37 + start.y * 19) * 137.508) % 360;
      return {
        color: `hsl(${hue}, 90%, 55%)`,
        points: traceForward(start.x, start.y)
      };
    });
  }, [customStarts, traceForward]);

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
        const isComp = isComposite(displayVal);
        const isPrime = !isComp && displayVal > 1;
        
        // Visibility Logic
        // 1. Hide 1s always (unless origin)
        let hideNode = (displayVal === 1);

        // 2. Simple View Logic
        if (simpleView && !hideNode) {
            if (isComp) {
                hideNode = true;
            } else if (isPrime) {
                // Hide primes unless |p| == |x| or |p| == |y|
                // Use grid coordinates for visual consistency
                const absGx = Math.abs(gx);
                const absGy = Math.abs(gy);
                if (displayVal !== absGx && displayVal !== absGy) {
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
             if (displayVal > 1) {
                const label = showFactored ? formatValue(displayVal) : displayVal.toString();
                if (label) {
                    ctx.fillStyle = colors.text;
                    const fontSize = Math.min(nodeSize * 0.4, 16);
                    ctx.font = `bold ${fontSize}px sans-serif`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(label, screenX, screenY);
                }
            } else if (gx === 0 && gy === 0) {
                 ctx.fillStyle = '#000';
                 ctx.font = `bold ${Math.min(nodeSize * 0.4, 16)}px sans-serif`;
                 ctx.textAlign = 'center';
                 ctx.textBaseline = 'middle';
                 ctx.fillText("0", screenX, screenY);
            }
        }
      }
    }

    // Combine Partition Paths and Custom Paths
    const overlayPaths = [...partitionPaths, ...customPaths];

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
                
                // Visibility Logic for Paths
                let hideNode = (val === 1);
                
                if (simpleView && !hideNode) {
                    if (isComposite(val)) {
                        hideNode = true;
                    } else if (val > 1) { // isPrime
                        if (val !== Math.abs(p.x) && val !== Math.abs(p.y)) {
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
                        ctx.fillStyle = '#ffffff'; 
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

  }, [viewport, partitionPaths, customPaths, tracedPath, theme, activeTransform, simpleView, checkGoesNorth, rowShift, showFactored, getEffectiveX]);

  useEffect(() => {
    const loop = () => {
      render();
      animationFrameId.current = requestAnimationFrame(loop);
    };
    loop();
    return () => {
      if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
    };
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

  const findPathToOrigin = (start: Point): Point[] => {
    const q: Point[] = [start];
    const parent = new Map<string, Point | null>();
    parent.set(`${start.x},${start.y}`, null);
    
    const visited = new Set<string>();
    visited.add(`${start.x},${start.y}`);

    let foundOrigin = false;
    let steps = 0;
    const maxSteps = 4000;

    while (q.length > 0 && steps < maxSteps) {
        const curr = q.shift()!;
        steps++;

        if (curr.x === 0 && curr.y === 0) {
            foundOrigin = true;
            break;
        }

        // Neighbors that could connect TO curr
        const candidates = [
            { x: curr.x - 1, y: curr.y }, // Neighbor West
            { x: curr.x, y: curr.y - 1 }  // Neighbor South
        ];

        for (const cand of candidates) {
            const key = `${cand.x},${cand.y}`;
            if (visited.has(key)) continue;

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

    if (!foundOrigin) return [];

    const path: Point[] = [];
    let trace: Point | undefined | null = { x: 0, y: 0 };

    while (trace) {
        path.push(trace);
        trace = parent.get(`${trace.x},${trace.y}`);
        if (trace && trace.x === start.x && trace.y === start.y) {
            path.push(trace);
            break;
        }
    }
    return path;
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    
    containerRef.current?.setPointerCapture(e.pointerId);
    setIsDragging(true);
    lastPos.current = { x: e.clientX, y: e.clientY };
    dragStartPos.current = { x: e.clientX, y: e.clientY };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
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

    if (!isDragging) return;
    const dx = e.clientX - lastPos.current.x;
    const dy = e.clientY - lastPos.current.y;
    lastPos.current = { x: e.clientX, y: e.clientY };
    onViewportChange({
      ...viewport,
      x: viewport.x - dx / viewport.zoom,
      y: viewport.y + dy / viewport.zoom,
    });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (e.button !== 0) return;

    setIsDragging(false);
    containerRef.current?.releasePointerCapture(e.pointerId);
    const dist = Math.hypot(e.clientX - dragStartPos.current.x, e.clientY - dragStartPos.current.y);

    if (dist < 5 && canvasRef.current) {
        const rect = canvasRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const centerX = viewport.x;
        const centerY = viewport.y;
        const halfWidth = rect.width / 2;
        const halfHeight = rect.height / 2;
        const gx = Math.round((x - halfWidth) / viewport.zoom + centerX);
        const gy = Math.round(-((y - halfHeight) / viewport.zoom - centerY));

        const path = findPathToOrigin({ x: gx, y: gy });
        setTracedPath(path);
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!canvasRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const centerX = viewport.x;
    const centerY = viewport.y;
    const halfWidth = rect.width / 2;
    const halfHeight = rect.height / 2;
    const gx = Math.round((x - halfWidth) / viewport.zoom + centerX);
    const gy = Math.round(-((y - halfHeight) / viewport.zoom - centerY));

    setCustomStarts(prev => {
        const exists = prev.find(p => p.x === gx && p.y === gy);
        if (exists) {
            return prev.filter(p => p !== exists);
        }
        return [...prev, { x: gx, y: gy }];
    });
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = 1.1;
    const direction = e.deltaY > 0 ? 1 / zoomFactor : zoomFactor;
    const newZoom = Math.min(Math.max(viewport.zoom * direction, 0.5), 200);
    
    if (canvasRef.current) {
        const rect = canvasRef.current.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const width = rect.width;
        const height = rect.height;
        const mouseGraphX = (mouseX - width/2) / viewport.zoom + viewport.x;
        const mouseGraphY = -(mouseY - height/2) / viewport.zoom + viewport.y; 
        const newX = mouseGraphX - (mouseX - width/2) / newZoom;
        const newY = mouseGraphY + (mouseY - height/2) / newZoom;

        onViewportChange({
            x: newX,
            y: newY,
            zoom: newZoom
        });
    }
  };

  return (
    <div 
      ref={containerRef} 
      className={`w-full h-full overflow-hidden touch-none cursor-move ${theme === 'dark' ? 'bg-gray-900' : 'bg-gray-50'}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onContextMenu={handleContextMenu}
      onWheel={handleWheel}
    >
      <canvas ref={canvasRef} className="block w-full h-full" />
    </div>
  );
};

export default InfiniteGraph;
