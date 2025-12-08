
import React, { useState, useCallback } from 'react';
import InfiniteGraph from './components/InfiniteGraph';
import Controls from './components/Controls';
import { Viewport, Theme, Point } from './types';

function App() {
  // Initial view centered slightly positive to show interesting initial structure
  const [viewport, setViewport] = useState<Viewport>({
    x: 12,
    y: 8,
    zoom: 45 
  });

  const [theme, setTheme] = useState<Theme>('light');
  const [transformFunc, setTransformFunc] = useState<string>("n");
  const [simpleView, setSimpleView] = useState(false);
  const [showFactored, setShowFactored] = useState(true);
  const [rowShift, setRowShift] = useState<number>(0);
  const [shiftLock, setShiftLock] = useState<boolean>(true);
  const [randomizeShift, setRandomizeShift] = useState<boolean>(false);
  const [cursorPos, setCursorPos] = useState<Point>({ x: 0, y: 0 });
  const [degree, setDegree] = useState<number>(1);
  const [resetPathsSignal, setResetPathsSignal] = useState<number>(0);

  const resetPaths = useCallback(() => {
    setResetPathsSignal((s) => s + 1);
  }, []);

  return (
    <div className={`relative w-full h-full overflow-hidden transition-colors duration-300 select-none ${theme === 'dark' ? 'bg-gray-900' : 'bg-gray-50'}`}>
      <InfiniteGraph 
        viewport={viewport} 
        onViewportChange={setViewport}
        theme={theme}
        transformFunc={transformFunc}
        simpleView={simpleView}
        showFactored={showFactored}
        rowShift={rowShift}
        shiftLock={shiftLock}
        randomizeShift={randomizeShift}
        onCursorMove={setCursorPos}
        degree={degree}
        resetPathsSignal={resetPathsSignal}
      />
      <Controls 
        viewport={viewport} 
        setViewport={setViewport}
        theme={theme}
        setTheme={setTheme}
        transformFunc={transformFunc}
        setTransformFunc={setTransformFunc}
        simpleView={simpleView}
        setSimpleView={setSimpleView}
        showFactored={showFactored}
        setShowFactored={setShowFactored}
        rowShift={rowShift}
        setRowShift={setRowShift}
        shiftLock={shiftLock}
        setShiftLock={setShiftLock}
        randomizeShift={randomizeShift}
        setRandomizeShift={setRandomizeShift}
        cursorPos={cursorPos}
        degree={degree}
        setDegree={setDegree}
        onResetPaths={resetPaths}
      />
      
      {/* Branding / Watermark */}
      <div className="absolute bottom-4 left-4 pointer-events-none opacity-50">
        <span className={`text-xs font-mono ${theme === 'dark' ? 'text-gray-600' : 'text-gray-400'}`}>Infinite GCD Explorer</span>
      </div>
    </div>
  );
}

export default App;
