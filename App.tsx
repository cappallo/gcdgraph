
import React, { useState } from 'react';
import InfiniteGraph from './components/InfiniteGraph';
import Controls from './components/Controls';
import { Viewport, ColorMode, Theme } from './types';

function App() {
  // Initial view centered slightly positive to show interesting initial structure
  const [viewport, setViewport] = useState<Viewport>({
    x: 12,
    y: 8,
    zoom: 45 
  });

  // Default to NONE as requested, so only special paths are colored by default
  const [colorMode, setColorMode] = useState<ColorMode>(ColorMode.NONE);
  const [theme, setTheme] = useState<Theme>('light');
  const [transformFunc, setTransformFunc] = useState<string>("x");
  const [hideComposites, setHideComposites] = useState(false);

  return (
    <div className={`relative w-full h-full overflow-hidden transition-colors duration-300 ${theme === 'dark' ? 'bg-gray-900' : 'bg-gray-50'}`}>
      <InfiniteGraph 
        viewport={viewport} 
        onViewportChange={setViewport}
        colorMode={colorMode}
        theme={theme}
        transformFunc={transformFunc}
        hideComposites={hideComposites}
      />
      <Controls 
        viewport={viewport} 
        setViewport={setViewport}
        colorMode={colorMode}
        setColorMode={setColorMode}
        theme={theme}
        setTheme={setTheme}
        transformFunc={transformFunc}
        setTransformFunc={setTransformFunc}
        hideComposites={hideComposites}
        setHideComposites={setHideComposites}
      />
      
      {/* Branding / Watermark */}
      <div className="absolute bottom-4 left-4 pointer-events-none opacity-50">
        <span className={`text-xs font-mono ${theme === 'dark' ? 'text-gray-600' : 'text-gray-400'}`}>Infinite GCD Explorer</span>
      </div>
    </div>
  );
}

export default App;
