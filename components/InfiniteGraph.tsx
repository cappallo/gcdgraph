import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { gcd, getFactorColor, formatValue, getPartitionColor, createTransformFunction, isComposite } from '../utils/math';
import { Viewport, ColorMode, Point, Theme } from '../types';

interface InfiniteGraphProps {
  viewport: Viewport;
  onViewportChange: (v: Viewport) => void;
  colorMode: ColorMode;
  theme: Theme;
  transformFunc: string;
  hideComposites: boolean;
}

const InfiniteGraph: React.FC<InfiniteGraphProps> = ({ 
  viewport, 
  onViewportChange, 
  colorMode, 
  theme, 
  transformFunc,
  hideComposites
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
  }, [viewport, transformFunc]);

  // Helper to trace a path forward from a given point
  const traceForward = useCallback((startX: number, startY: number, maxSteps: number = 5000) => {
    const points: Point[] = [];
    let currX = startX;
    let currY = startY;
    
    for (let step = 0; step < maxSteps; step++) {
      points.push({ x: currX, y: currY });
      
      const valX = Math.round(activeTransform(currX));
      const valY = Math.round(activeTransform(currY));

      // Graph logic: y | x -> North, else -> East
      if (valY !== 0 && valX % valY === 0) {
        currY += 1;
      } else {
        currX += 1;
      }
      
      if (currX > 20000 || currY > 20000) break;
    }
    return points;
  }, [activeTransform]);

  // Pre-calculate "Rightmost" Partition Paths
  const partitionPaths = useMemo(() => {
    const paths: { color: string, points: Point[] }[] = [];
    
    for (let n = 1; n <= 20; n++) {
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
    // This ensures that CSS pixels map correctly to physical pixels.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Use logical CSS dimensions for calculation
    // This fixes the offset issue where the graph was drawn at physical coordinates
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
    const showNodes = zoom > 2;
    
    const toScreen = (gx: number, gy: number) => ({
      x: (gx - centerX) * zoom + halfWidth,
      y: -(gy - centerY) * zoom + halfHeight
    });

    // Thicker connections (Twice as wide)
    ctx.lineWidth = Math.max(2, zoom / 7.5);
    ctx.lineCap = 'round';

    const totalNodes = (maxX - minX) * (maxY - minY);
    const skipFactor = totalNodes > 50000 ? Math.ceil(Math.sqrt(totalNodes / 50000)) : 1;

    // Reduced node size to increase gap (0.6 instead of 0.8)
    const nodeSize = Math.max(2, zoom * 0.6); 

    for (let gx = minX; gx <= maxX; gx += skipFactor) {
      for (let gy = minY; gy <= maxY; gy += skipFactor) {
        const { x: screenX, y: screenY } = toScreen(gx, gy);
        
        // Calculate transformed value for logic
        const valX = activeTransform(gx);
        const valY = activeTransform(gy);
        const vX = Math.round(valX);
        const vY = Math.round(valY);
        
        // Logic: y | x -> North, else -> East
        const goesNorth = vY !== 0 && (vX % vY === 0);
        
        // Use GCD for coloring/text purposes
        const displayVal = gcd(vX, vY);
        const isComp = isComposite(displayVal);
        
        // Hide 1s as well if hiding composites
        const shouldHide = hideComposites && (isComp || displayVal === 1);
        
        if (showNodes) {
            // Connections
            ctx.strokeStyle = colors.grid;
            // Line width set globally above
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
            if (!shouldHide || (gx === 0 && gy === 0)) {
                let fillColor;
                if (colorMode === ColorMode.PRIME_FACTOR) {
                    fillColor = getFactorColor(displayVal);
                } else {
                    fillColor = displayVal === 1 ? colors.nodeCoprime : colors.nodeFactor;
                }
                
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
        if (showText && skipFactor === 1 && (!shouldHide || (gx === 0 && gy === 0))) {
             if (displayVal > 1) {
                const label = formatValue(displayVal);
                if (label) {
                    ctx.fillStyle = colors.text;
                    // Shrink font size by ~1/3 (0.4 multiplier instead of 0.6)
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
        ctx.strokeStyle = path.color;
        // Thicker overlay paths to match grid
        ctx.lineWidth = Math.max(3, zoom / 5); 
        ctx.beginPath();
        
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
        }
        ctx.stroke();

        if (showNodes) {
            for (const p of path.points) {
                if (p.x < minX - 1 || p.x > maxX + 1 || p.y < minY - 1 || p.y > maxY + 1) continue;
                
                const valX = activeTransform(p.x);
                const valY = activeTransform(p.y);
                const val = gcd(Math.round(valX), Math.round(valY));
                const isComp = isComposite(val);

                // Apply hide logic to overlay paths too
                if (hideComposites && (isComp || val === 1)) continue;
                
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
                    const label = formatValue(val);
                    if (label) {
                        ctx.fillStyle = '#ffffff'; 
                        // Smaller font size here too
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
        ctx.strokeStyle = colors.tracePath;
        ctx.lineWidth = Math.max(4, zoom / 4);
        ctx.lineJoin = 'round';
        ctx.beginPath();

        const start = tracedPath[0];
        const sStart = toScreen(start.x, start.y);
        ctx.moveTo(sStart.x, sStart.y);

        for (let i = 1; i < tracedPath.length; i++) {
            const p = tracedPath[i];
            const s = toScreen(p.x, p.y);
            ctx.lineTo(s.x, s.y);
        }
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
                    const valX = activeTransform(p.x);
                    const valY = activeTransform(p.y);
                    const val = gcd(Math.round(valX), Math.round(valY));
                    const label = formatValue(val);
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

  }, [viewport, colorMode, partitionPaths, customPaths, tracedPath, theme, activeTransform, hideComposites]);

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
        
        // Set physical pixel dimensions
        canvasRef.current.width = rect.width * dpr;
        canvasRef.current.height = rect.height * dpr;
        
        // Set CSS layout dimensions
        canvasRef.current.style.width = `${rect.width}px`;
        canvasRef.current.style.height = `${rect.height}px`;
        
        // Removed explicit ctx.scale() here because render() manages the transform
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
            const cValX = Math.round(activeTransform(cand.x));
            const cValY = Math.round(activeTransform(cand.y));
            const candGoesNorth = cValY !== 0 && (cValX % cValY === 0);

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
    // Only drag with left click (button 0)
    if (e.button !== 0) return;
    
    containerRef.current?.setPointerCapture(e.pointerId);
    setIsDragging(true);
    lastPos.current = { x: e.clientX, y: e.clientY };
    dragStartPos.current = { x: e.clientX, y: e.clientY };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
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

  // Handle right-click to toggle forward trace
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

    // Toggle custom path
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