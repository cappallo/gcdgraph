

import React, { useState, useEffect } from 'react';
import { Plus, Minus, RotateCcw, Move, Moon, Sun, SlidersHorizontal } from 'lucide-react';
import { Viewport, Theme, Point } from '../types';

interface ControlsProps {
  viewport: Viewport;
  setViewport: (v: Viewport) => void;
  theme: Theme;
  setTheme: (t: Theme) => void;
  transformFunc: string;
  setTransformFunc: (s: string) => void;
  simpleView: boolean;
  setSimpleView: (b: boolean) => void;
  showFactored: boolean;
  setShowFactored: (b: boolean) => void;
  rowShift: number;
  setRowShift: (n: number) => void;
  cursorPos: Point;
  degree: number;
  setDegree: (n: number) => void;
}

const Controls: React.FC<ControlsProps> = ({ 
  viewport, 
  setViewport, 
  theme,
  setTheme,
  transformFunc,
  setTransformFunc,
  simpleView,
  setSimpleView,
  showFactored,
  setShowFactored,
  rowShift,
  setRowShift,
  cursorPos,
  degree,
  setDegree
}) => {
  // Local state for input to prevent jitter while typing
  const [funcInput, setFuncInput] = useState(transformFunc);
  const [showSettings, setShowSettings] = useState(true);

  useEffect(() => {
    setFuncInput(transformFunc);
  }, [transformFunc]);
  
  const handleZoomIn = () => {
    setViewport({ ...viewport, zoom: Math.min(viewport.zoom * 1.2, 200) });
  };

  const handleZoomOut = () => {
    setViewport({ ...viewport, zoom: Math.max(viewport.zoom / 1.2, 0.5) });
  };

  const handleReset = () => {
    setViewport({ x: 6, y: 6, zoom: 40 }); 
  };

  const toggleTheme = () => {
    setTheme(theme === 'light' ? 'dark' : 'light');
  };

  const commitFunc = () => {
    setTransformFunc(funcInput);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
        commitFunc();
        (e.target as HTMLInputElement).blur();
    }
  };

  const isDark = theme === 'dark';
  const panelClass = isDark 
    ? 'bg-gray-800/90 border-gray-700 text-gray-200' 
    : 'bg-white/90 border-gray-200 text-gray-800';
  
  const btnClass = isDark
    ? 'bg-gray-800 text-gray-200 hover:bg-gray-700 border-gray-700'
    : 'bg-white text-gray-700 hover:bg-gray-50 border-gray-200';
    
  const inputClass = isDark
    ? 'bg-gray-900 border-gray-600 text-gray-200 focus:border-blue-500'
    : 'bg-gray-50 border-gray-300 text-gray-800 focus:border-blue-500';

  return (
    <>
      {/* Standalone Coordinates Display (Top Left) */}
      <div className={`absolute top-4 left-4 p-4 rounded-xl shadow-lg border backdrop-blur-sm transition-colors duration-300 pointer-events-none select-none ${panelClass}`}>
         <div className="flex gap-6 text-3xl font-bold font-mono tracking-tight">
            <span className="w-32">X: {cursorPos.x}</span>
            <span className="w-32">Y: {cursorPos.y}</span>
         </div>
         <div className={`text-xs mt-1 font-mono opacity-60 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
            Zoom: {viewport.zoom.toFixed(1)}
         </div>
      </div>

      <div className="absolute top-4 right-4 flex flex-col gap-2 items-end pointer-events-none select-none">
        {/* Collapsible Info/Settings Panel */}
        {showSettings && (
          <div className={`backdrop-blur-sm p-4 rounded-xl shadow-lg border mb-2 max-w-xs pointer-events-auto transition-colors duration-300 ${panelClass}`}>
            <h1 className="font-bold flex items-center gap-2">
              <Move className="w-4 h-4" /> GCD Vector Graph
            </h1>
            <p className={`text-xs mt-2 leading-relaxed ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
              Visualizing the vector field where node <code>(x,y)</code> connects to:
            </p>
            <ul className={`text-xs mt-1 ml-4 list-disc space-y-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                <li><code>(x+1, y)</code> if gcd(f(x),f(y)) = 1 (East)</li>
                <li><code>(x, y+1)</code> if gcd(f(x),f(y)) ≠ 1 (North)</li>
            </ul>
            
            {/* Transform Input */}
            <div className="mt-4">
                <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                    Transform f(n):
                </label>
                <div className="flex gap-2">
                    <input 
                        type="text" 
                        value={funcInput}
                       onChange={(e) => {
                         const val = e.target.value;
                         setFuncInput(val);
                         setTransformFunc(val);
                       }}
                        onBlur={commitFunc}
                        onKeyDown={handleKeyDown}
                        className={`w-full px-2 py-1 text-sm rounded border outline-none font-mono ${inputClass}`}
                        placeholder="e.g. n^2 + 1"
                    />
                </div>
            </div>

            {/* Row Shift Slider */}
            <div className="mt-4">
                <label className={`flex justify-between text-xs font-medium mb-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                    <span>Row Shift (k): {rowShift}</span>
                </label>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setRowShift(Math.max(0, rowShift - 1))}
                        className={`p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 ${isDark ? 'text-gray-300' : 'text-gray-600'}`}
                    >
                        <Minus className="w-3 h-3" />
                    </button>
                    <input 
                        type="range" 
                        min="0" 
                        max="210" 
                        step="1"
                        value={rowShift}
                        onChange={(e) => setRowShift(parseInt(e.target.value))}
                        className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                    />
                    <button
                        onClick={() => setRowShift(Math.min(210, rowShift + 1))}
                        className={`p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 ${isDark ? 'text-gray-300' : 'text-gray-600'}`}
                    >
                        <Plus className="w-3 h-3" />
                    </button>
                </div>
                <p className="text-[9px] opacity-50 mt-1">Shifts x by k for rows [-k, k]</p>
            </div>

            <div className="mt-4 space-y-2">
                <label className={`flex items-center justify-between text-sm font-medium cursor-pointer ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                    <span>Show Factors</span>
                    <input 
                        type="checkbox" 
                        className="w-4 h-4 accent-indigo-600 rounded"
                        checked={showFactored}
                        onChange={(e) => setShowFactored(e.target.checked)}
                    />
                </label>
                
                <label className={`flex items-center justify-between text-sm font-medium cursor-pointer ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                    <span>Simple view</span>
                    <input 
                        type="checkbox" 
                        className="w-4 h-4 accent-indigo-600 rounded"
                        checked={simpleView}
                        onChange={(e) => setSimpleView(e.target.checked)}
                    />
                </label>

                {simpleView && (
                  <div className="pl-2 pt-1 border-l-2 border-indigo-500/30">
                     <label className={`flex justify-between text-xs font-medium mb-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                         <span>Degree: {degree} {degree === 1 ? '(Primes)' : degree === 2 ? '(Semiprimes)' : ''}</span>
                     </label>
                     <input 
                         type="range" 
                         min="1" 
                         max="4" 
                         step="1"
                         value={degree}
                         onChange={(e) => setDegree(parseInt(e.target.value))}
                         className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                     />
                  </div>
                )}
            </div>
          </div>
        )}

        {/* Floating Action Buttons */}
        <div className="flex flex-col gap-2 pointer-events-auto">
          <button 
              onClick={() => setShowSettings(!showSettings)}
              className={`p-3 rounded-full shadow-lg active:scale-95 transition-all border ${btnClass}`}
              title={showSettings ? "Hide Settings" : "Show Settings"}
          >
              <SlidersHorizontal className="w-5 h-5" />
          </button>

          <div className="h-1" /> {/* Spacer */}

          <button 
              onClick={toggleTheme}
              className={`p-3 rounded-full shadow-lg active:scale-95 transition-all border ${btnClass}`}
              title="Toggle Theme"
          >
              {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>

          <button 
              onClick={handleReset}
              className={`p-3 rounded-full shadow-lg active:scale-95 transition-all border ${btnClass}`}
              title="Reset View"
          >
              <RotateCcw className="w-5 h-5" />
          </button>
          <button 
              onClick={handleZoomIn}
              className={`p-3 rounded-full shadow-lg active:scale-95 transition-all border ${btnClass}`}
              title="Zoom In"
          >
              <Plus className="w-5 h-5" />
          </button>
          <button 
              onClick={handleZoomOut}
              className={`p-3 rounded-full shadow-lg active:scale-95 transition-all border ${btnClass}`}
              title="Zoom Out"
          >
              <Minus className="w-5 h-5" />
          </button>
        </div>
      </div>
    </>
  );
};

export default Controls;
