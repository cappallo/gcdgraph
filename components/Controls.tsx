
import React, { useState, useEffect } from 'react';
import { Plus, Minus, RotateCcw, Move, Moon, Sun } from 'lucide-react';
import { Viewport, ColorMode, Theme } from '../types';

interface ControlsProps {
  viewport: Viewport;
  setViewport: (v: Viewport) => void;
  colorMode: ColorMode;
  setColorMode: (m: ColorMode) => void;
  theme: Theme;
  setTheme: (t: Theme) => void;
  transformFunc: string;
  setTransformFunc: (s: string) => void;
  hideComposites: boolean;
  setHideComposites: (b: boolean) => void;
}

const Controls: React.FC<ControlsProps> = ({ 
  viewport, 
  setViewport, 
  colorMode, 
  setColorMode,
  theme,
  setTheme,
  transformFunc,
  setTransformFunc,
  hideComposites,
  setHideComposites
}) => {
  // Local state for input to prevent jitter while typing
  const [funcInput, setFuncInput] = useState(transformFunc);

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
    <div className="absolute top-4 right-4 flex flex-col gap-2 items-end pointer-events-none">
      {/* Info Panel */}
      <div className={`backdrop-blur-sm p-4 rounded-xl shadow-lg border mb-4 max-w-xs pointer-events-auto transition-colors duration-300 ${panelClass}`}>
        <h1 className="font-bold flex items-center gap-2">
          <Move className="w-4 h-4" /> GCD Vector Graph
        </h1>
        <p className={`text-xs mt-2 leading-relaxed ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
          Visualizing the vector field where node <code>(x,y)</code> connects to:
        </p>
        <ul className={`text-xs mt-1 ml-4 list-disc space-y-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
            <li><code>(x+1, y)</code> if y does not divide x (East)</li>
            <li><code>(x, y+1)</code> if y divides x (North)</li>
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
                    onChange={(e) => setFuncInput(e.target.value)}
                    onBlur={commitFunc}
                    onKeyDown={handleKeyDown}
                    className={`w-full px-2 py-1 text-sm rounded border outline-none font-mono ${inputClass}`}
                    placeholder="e.g. 2x-1"
                />
            </div>
            <p className="text-[9px] opacity-50 mt-1">Maps (a,b) &rarr; (f(a),f(b))</p>
        </div>

        <div className="mt-4 space-y-2">
            <label className={`flex items-center justify-between text-sm font-medium cursor-pointer ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                <span>Color by Prime</span>
                <input 
                    type="checkbox" 
                    className="w-4 h-4 accent-indigo-600 rounded"
                    checked={colorMode === ColorMode.PRIME_FACTOR}
                    onChange={(e) => setColorMode(e.target.checked ? ColorMode.PRIME_FACTOR : ColorMode.NONE)}
                />
            </label>
            
            <label className={`flex items-center justify-between text-sm font-medium cursor-pointer ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                <span>Hide Composites</span>
                <input 
                    type="checkbox" 
                    className="w-4 h-4 accent-indigo-600 rounded"
                    checked={hideComposites}
                    onChange={(e) => setHideComposites(e.target.checked)}
                />
            </label>
            <p className={`text-[10px] mt-1 ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
                Highlights partitions created by prime factors.
            </p>
        </div>

        <div className="mt-4 pt-3 border-t border-gray-500/20 flex justify-between text-[10px] opacity-60 font-mono">
            <span>X: {viewport.x.toFixed(1)}</span>
            <span>Y: {viewport.y.toFixed(1)}</span>
            <span>Z: {viewport.zoom.toFixed(1)}</span>
        </div>
      </div>

      {/* Floating Action Buttons */}
      <div className="flex flex-col gap-2 pointer-events-auto">
        <button 
            onClick={toggleTheme}
            className={`p-3 rounded-full shadow-lg active:scale-95 transition-all border ${btnClass}`}
            title="Toggle Theme"
        >
            {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
        </button>

        <div className="h-2" /> {/* Spacer */}

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
  );
};

export default Controls;
