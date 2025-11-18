
import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { gcd, getFactorColor, formatValue, getPartitionColor } from '../utils/math';
import { Viewport, ColorMode, Point, Theme } from '../types';

interface InfiniteGraphProps {
  viewport: Viewport;
  onViewportChange: (v: Viewport) => void;
  colorMode: ColorMode;
  theme: Theme;
}

const InfiniteGraph: React.FC<InfiniteGraphProps> = ({ viewport, onViewportChange, colorMode, theme }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const lastPos = useRef({ x: 0, y: 0 });
  const dragStartPos = useRef({ x: 0, y: 0 });
  const animationFrameId = useRef<number>();

  // Trace Path State: Stores the path from a clicked node back to (0,0)
  const [tracedPath, setTracedPath] = useState<Point[] | null>(null);

  // Clear trace on viewport change (pan/zoom)
  useEffect(() => {
    setTracedPath(null);
  }, [viewport]);

  // Pre-calculate "Rightmost" Partition Paths
  // Paths starting from (n^3, n^2) for n=1..20
  // These are rendered permanently overlaid on the graph
  const partitionPaths = useMemo(() => {
    const paths: { color: string, points: Point[] }[] = [];
    const maxSteps = 3000; // Limit path length to avoid infinite loops in calculation

    for (let n = 1; n <= 20; n++) {
      const pathPoints: Point[] = [];
      let currX = Math.pow(n, 3);
      let currY = Math.pow(n, 2);
      
      for (let step = 0; step < maxSteps; step++) {
        pathPoints.push({ x: currX, y: currY });
        
        // Graph logic: if coprime -> East, else -> North
        if (gcd(currX, currY) === 1) {
          currX += 1;
        } else {
          currY += 1;
        }
        
        // Optimization: Stop if coords get absurdly large for our visualization purpose
        if (currX > 10000 || currY > 10000) break;
      }
      
      paths.push({
        color: getPartitionColor(n),
        points: pathPoints
      });
    }
    return paths;
  }, []);

  // Rendering Loop
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // Theme Colors
    const isDark = theme === 'dark';
    const colors = {
      bg: isDark ? '#111827' : '#f3f4f6',
      grid: isDark ? '#374151' : '#d1d5db',
      nodeCoprime: isDark ? '#1f2937' : '#ffffff', // Dark gray vs White
      nodeFactor: isDark ? '#374151' : '#e5e7eb',  // Slightly lighter gray vs Light gray
      text: isDark ? '#9ca3af' : '#374151',
      origin: '#fbbf24',
      tracePath: '#06b6d4',
    };

    // Clear background
    ctx.fillStyle = colors.bg;
    ctx.fillRect(0, 0, width, height);

    const { x: centerX, y: centerY, zoom } = viewport;
    const halfWidth = width / 2;
    const halfHeight = height / 2;
    
    // Viewport bounds
    const minX = Math.floor(centerX - halfWidth / zoom);
    const maxX = Math.ceil(centerX + halfWidth / zoom);
    const minY = Math.floor(centerY - halfHeight / zoom);
    const maxY = Math.ceil(centerY + halfHeight / zoom);

    // LOD Settings
    const showText = zoom > 30;
    const showNodes = zoom > 2;
    
    // Helper to transform grid coord to screen coord
    const toScreen = (gx: number, gy: number) => ({
      x: (gx - centerX) * zoom + halfWidth,
      y: -(gy - centerY) * zoom + halfHeight
    });

    ctx.lineWidth = Math.max(1, zoom / 10);
    ctx.lineCap = 'round';

    // 1. Draw Base Grid
    // Optimization: Skip rendering loop if zoomed way out, handled by canvas speed mostly
    const totalNodes = (maxX - minX) * (maxY - minY);
    const skipFactor = totalNodes > 50000 ? Math.ceil(Math.sqrt(totalNodes / 50000)) : 1;

    for (let gx = minX; gx <= maxX; gx += skipFactor) {
      for (let gy = minY; gy <= maxY; gy += skipFactor) {
        const { x: screenX, y: screenY } = toScreen(gx, gy);
        const val = gcd(gx, gy);
        const nodeSize = Math.max(2, zoom * 0.8); 
        
        if (showNodes) {
            // Connections
            ctx.strokeStyle = colors.grid;
            ctx.lineWidth = Math.max(1, zoom / 15);
            ctx.beginPath();
            ctx.moveTo(screenX, screenY);
            
            if (val === 1) {
                // East
                const dest = toScreen(gx + 1, gy);
                ctx.lineTo(dest.x, dest.y);
            } else {
                // North (y+1)
                const dest = toScreen(gx, gy + 1);
                ctx.lineTo(dest.x, dest.y);
            }
            ctx.stroke();

            // Node Body
            let fillColor;
            if (colorMode === ColorMode.PRIME_FACTOR) {
                fillColor = getFactorColor(val);
            } else {
                fillColor = val === 1 ? colors.nodeCoprime : colors.nodeFactor;
            }
            
            ctx.fillStyle = fillColor;
            const halfSize = nodeSize / 2;
            
            // Origin Highlight
            if (gx === 0 && gy === 0) {
                 ctx.fillStyle = colors.origin; 
                 ctx.strokeStyle = isDark ? '#000' : '#000';
                 ctx.lineWidth = 2;
            }
            
            ctx.fillRect(screenX - halfSize, screenY - halfSize, nodeSize, nodeSize);
        }

        // Text
        if (showText && skipFactor === 1) {
             if (val > 1) {
                const label = formatValue(val);
                if (label) {
                    ctx.fillStyle = colors.text;
                    const fontSize = Math.min(nodeSize * 0.6, 24);
                    ctx.font = `bold ${fontSize}px sans-serif`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(label, screenX, screenY);
                }
            } else if (gx === 0 && gy === 0) {
                 ctx.fillStyle = '#000'; // Origin text always black on yellow
                 ctx.font = `bold ${Math.min(nodeSize * 0.6, 24)}px sans-serif`;
                 ctx.textAlign = 'center';
                 ctx.textBaseline = 'middle';
                 ctx.fillText("0", screenX, screenY);
            }
        }
      }
    }

    // 2. Draw Partition Paths (Overlay)
    // These are the "Rightmost" paths starting from (n^3, n^2)
    partitionPaths.forEach(path => {
        ctx.strokeStyle = path.color;
        ctx.lineWidth = Math.max(2, zoom / 8); // Thicker than normal lines
        ctx.beginPath();
        
        // Draw segments that are visible
        for (let i = 0; i < path.points.length - 1; i++) {
            const p1 = path.points[i];
            const p2 = path.points[i+1];

            // Culling
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

        // Draw nodes for this path
        if (showNodes) {
            for (const p of path.points) {
                if (p.x < minX - 1 || p.x > maxX + 1 || p.y < minY - 1 || p.y > maxY + 1) continue;
                
                const s = toScreen(p.x, p.y);
                const nodeSize = Math.max(2, zoom * 0.8);
                const halfSize = nodeSize / 2;
                
                // Draw Background
                ctx.fillStyle = path.color;
                ctx.fillRect(s.x - halfSize, s.y - halfSize, nodeSize, nodeSize);
                
                // Optional border
                if (zoom > 10) {
                    ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)';
                    ctx.lineWidth = 1;
                    ctx.strokeRect(s.x - halfSize, s.y - halfSize, nodeSize, nodeSize);
                }

                // Text Re-draw on top of overlay
                if (showText && skipFactor === 1) {
                    const val = gcd(p.x, p.y);
                    const label = formatValue(val);
                    if (label) {
                        ctx.fillStyle = '#ffffff'; // White text for contrast on dark partition color
                        const fontSize = Math.min(nodeSize * 0.6, 24);
                        ctx.font = `bold ${fontSize}px sans-serif`;
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillText(label, s.x, s.y);
                    }
                }
            }
        }
    });

    // 3. Draw Traced Backward Path (User Interaction)
    if (tracedPath && tracedPath.length > 0) {
        ctx.strokeStyle = colors.tracePath;
        ctx.lineWidth = Math.max(3, zoom / 5); // Very thick
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

        // Draw Trace Nodes Highlight
        if (showNodes) {
            for (const p of tracedPath) {
                 if (p.x < minX - 1 || p.x > maxX + 1 || p.y < minY - 1 || p.y > maxY + 1) continue;

                 const s = toScreen(p.x, p.y);
                 const nodeSize = Math.max(2, zoom * 0.8);
                 const halfSize = nodeSize / 2;
                 
                 // White center for contrast in trace
                 ctx.fillStyle = '#ffffff';
                 ctx.fillRect(s.x - halfSize, s.y - halfSize, nodeSize, nodeSize);
                 
                 ctx.strokeStyle = colors.tracePath;
                 ctx.lineWidth = 2;
                 ctx.strokeRect(s.x - halfSize, s.y - halfSize, nodeSize, nodeSize);

                 // Text Re-draw on top of overlay
                 if (showText && skipFactor === 1) {
                    const val = gcd(p.x, p.y);
                    const label = formatValue(val);
                    if (label || (p.x===0 && p.y===0)) {
                        ctx.fillStyle = '#000000'; // Black text on white background
                        const fontSize = Math.min(nodeSize * 0.6, 24);
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

  }, [viewport, colorMode, partitionPaths, tracedPath, theme]);

  // Animation loop
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

  // Resize Handler
  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current && canvasRef.current) {
        const dpr = window.devicePixelRatio || 1;
        const rect = containerRef.current.getBoundingClientRect();
        canvasRef.current.width = rect.width * dpr;
        canvasRef.current.height = rect.height * dpr;
        canvasRef.current.style.width = `${rect.width}px`;
        canvasRef.current.style.height = `${rect.height}px`;
        
        const ctx = canvasRef.current.getContext('2d');
        if (ctx) ctx.scale(dpr, dpr);
        
        render();
      }
    };
    
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, [render]);

  // Path finding BFS logic
  const findPathToOrigin = (start: Point): Point[] => {
    // BFS backwards
    const q: Point[] = [start];
    const parent = new Map<string, Point | null>(); // Key: "x,y" -> Value: parent point
    parent.set(`${start.x},${start.y}`, null);
    
    const visited = new Set<string>();
    visited.add(`${start.x},${start.y}`);

    let foundOrigin = false;
    let steps = 0;
    const maxSteps = 4000; // Increased safety break

    while (q.length > 0 && steps < maxSteps) {
        const curr = q.shift()!;
        steps++;

        if (curr.x === 0 && curr.y === 0) {
            foundOrigin = true;
            break;
        }

        // Predecessor P connects to Curr if:
        // 1. P = (curr.x - 1, curr.y) AND gcd(P.x, P.y) == 1 (Connects East to curr)
        // 2. P = (curr.x, curr.y - 1) AND gcd(P.x, P.y) > 1 (Connects North to curr)

        const candidates = [
            { x: curr.x - 1, y: curr.y },
            { x: curr.x, y: curr.y - 1 }
        ];

        for (const cand of candidates) {
            const key = `${cand.x},${cand.y}`;
            if (visited.has(key)) continue;

            let connects = false;
            if (cand.x === curr.x - 1 && cand.y === curr.y) {
                if (gcd(cand.x, cand.y) === 1) connects = true;
            } else if (cand.x === curr.x && cand.y === curr.y - 1) {
                if (gcd(cand.x, cand.y) > 1) connects = true;
            }

            if (connects) {
                visited.add(key);
                parent.set(key, curr); 
                q.push(cand);
            }
        }
    }

    // Reconstruct path
    const path: Point[] = [];
    let trace: Point | undefined | null = foundOrigin ? { x: 0, y: 0 } : undefined;

    if (!foundOrigin) return [];

    while (trace) {
        path.push(trace);
        trace = parent.get(`${trace.x},${trace.y}`);
        if (trace && trace.x === start.x && trace.y === start.y) {
            path.push(trace);
            break;
        }
    }

    return path; // Returns (0,0) -> ... -> Start
  };


  // Interaction Handlers
  const handlePointerDown = (e: React.PointerEvent) => {
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
    setIsDragging(false);
    containerRef.current?.releasePointerCapture(e.pointerId);

    // Detect Click vs Drag
    const dist = Math.hypot(
        e.clientX - dragStartPos.current.x, 
        e.clientY - dragStartPos.current.y
    );

    if (dist < 5 && canvasRef.current) {
        // Handle Click
        const rect = canvasRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        // Convert to Graph Coords
        const centerX = viewport.x;
        const centerY = viewport.y;
        const halfWidth = rect.width / 2;
        const halfHeight = rect.height / 2;
        
        const gx = Math.round((x - halfWidth) / viewport.zoom + centerX);
        const gy = Math.round(-((y - halfHeight) / viewport.zoom - centerY)); // Inverted Y logic reverse

        // Trace Path!
        const path = findPathToOrigin({ x: gx, y: gy });
        setTracedPath(path);
    }
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
      onWheel={handleWheel}
    >
      <canvas ref={canvasRef} className="block w-full h-full" />
    </div>
  );
};

export default InfiniteGraph;
