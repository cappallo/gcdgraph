import React, { useState, useEffect, useRef } from "react";
import {
  Plus,
  Minus,
  RotateCcw,
  Move,
  Moon,
  Sun,
  SlidersHorizontal,
  Eraser,
  ChevronDown,
  Save,
  FolderOpen,
  Trash2,
} from "lucide-react";
import { Viewport, Theme, Point } from "../types";
import { formatValue } from "../utils/math";

interface RowShiftBounds {
  min: number;
  max: number;
}

interface SavedSlotSummary {
  id: string;
  description: string;
}

interface ControlsProps {
  viewport: Viewport;
  setViewport: (v: Viewport) => void;
  theme: Theme;
  setTheme: (t: Theme) => void;
  transformFunc: string;
  setTransformFunc: (s: string) => void;
  moveRightExpr: string;
  setMoveRightExpr: (s: string) => void;
  moveRightError?: string;
  simpleView: boolean;
  setSimpleView: (b: boolean) => void;
  showFactored: boolean;
  setShowFactored: (b: boolean) => void;
  rowShift: number;
  setRowShift: (n: number) => void;
  rowShiftBounds: RowShiftBounds;
  setRowShiftBounds: (range: Partial<RowShiftBounds>) => void;
  shiftLock: boolean;
  setShiftLock: (b: boolean) => void;
  randomizeShift: boolean;
  setRandomizeShift: (b: boolean) => void;
  cursorPos: Point;
  degree: number;
  setDegree: (n: number) => void;
  onResetPaths: () => void;
  autoHighlightExpr: string;
  autoHighlightEnabled: boolean;
  onApplyAutoHighlight: (s: string, enabled: boolean) => void;
  autoHighlightError?: string;
  autoHighlightRange: { min: number; max: number };
  setAutoHighlightRange: (range: Partial<{ min: number; max: number }>) => void;
  pathStepLimit: number;
  setPathStepLimit: (n: number) => void;
  backtraceLimit: number;
  setBacktraceLimit: (n: number) => void;
  backtrailLength: number | null;
  savedSlots: SavedSlotSummary[];
  onSaveSlot: (description: string) => void;
  onLoadSlot: (slotId: string) => void;
  onDeleteSlot: (slotId: string) => void;
}

const Controls: React.FC<ControlsProps> = ({
  viewport,
  setViewport,
  theme,
  setTheme,
  transformFunc,
  setTransformFunc,
  moveRightExpr,
  setMoveRightExpr,
  moveRightError,
  simpleView,
  setSimpleView,
  showFactored,
  setShowFactored,
  rowShift,
  setRowShift,
  rowShiftBounds,
  setRowShiftBounds,
  shiftLock,
  setShiftLock,
  randomizeShift,
  setRandomizeShift,
  cursorPos,
  degree,
  setDegree,
  onResetPaths,
  autoHighlightExpr,
  autoHighlightEnabled,
  onApplyAutoHighlight,
  autoHighlightError,
  autoHighlightRange,
  setAutoHighlightRange,
  pathStepLimit,
  setPathStepLimit,
  backtraceLimit,
  setBacktraceLimit,
  backtrailLength,
  savedSlots,
  onSaveSlot,
  onLoadSlot,
  onDeleteSlot,
}) => {
  // Local state for input to prevent jitter while typing
  const [funcInput, setFuncInput] = useState(transformFunc);
  const [moveRightInput, setMoveRightInput] = useState(moveRightExpr);
  const [showSettings, setShowSettings] = useState(true);
  const [autoHighlightInput, setAutoHighlightInput] =
    useState(autoHighlightExpr);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [rangeMinInput, setRangeMinInput] = useState(
    autoHighlightRange.min.toString()
  );
  const [rangeMaxInput, setRangeMaxInput] = useState(
    autoHighlightRange.max.toString()
  );
  const [pathStepLimitInput, setPathStepLimitInput] = useState(
    pathStepLimit.toString()
  );
  const [backtraceLimitInput, setBacktraceLimitInput] = useState(
    backtraceLimit.toString()
  );
  const [rowShiftMinInput, setRowShiftMinInput] = useState(
    rowShiftBounds.min.toString()
  );
  const [rowShiftMaxInput, setRowShiftMaxInput] = useState(
    rowShiftBounds.max.toString()
  );
  const [showPresetSave, setShowPresetSave] = useState(false);
  const [showPresetLoad, setShowPresetLoad] = useState(false);
  const [presetDescription, setPresetDescription] = useState("");
  const [saveFeedback, setSaveFeedback] = useState("");
  const saveFeedbackTimer = useRef<number | null>(null);

  useEffect(() => {
    setFuncInput(transformFunc);
  }, [transformFunc]);
  useEffect(() => {
    setMoveRightInput(moveRightExpr);
  }, [moveRightExpr]);
  useEffect(() => {
    setAutoHighlightInput(autoHighlightExpr);
  }, [autoHighlightExpr]);
  useEffect(() => {
    setRangeMinInput(autoHighlightRange.min.toString());
    setRangeMaxInput(autoHighlightRange.max.toString());
  }, [autoHighlightRange.min, autoHighlightRange.max]);
  useEffect(() => {
    setPathStepLimitInput(pathStepLimit.toString());
  }, [pathStepLimit]);
  useEffect(() => {
    setBacktraceLimitInput(backtraceLimit.toString());
  }, [backtraceLimit]);
  useEffect(() => {
    setRowShiftMinInput(rowShiftBounds.min.toString());
    setRowShiftMaxInput(rowShiftBounds.max.toString());
  }, [rowShiftBounds.min, rowShiftBounds.max]);
  useEffect(() => {
    return () => {
      if (saveFeedbackTimer.current !== null) {
        window.clearTimeout(saveFeedbackTimer.current);
      }
    };
  }, []);

  const handleZoomIn = () => {
    setViewport({ ...viewport, zoom: Math.min(viewport.zoom * 1.2, 200) });
  };

  const handleZoomOut = () => {
    setViewport({ ...viewport, zoom: viewport.zoom / 1.2 });
  };

  const handleReset = () => {
    setViewport({ x: 6, y: 6, zoom: 40 });
  };

  const toggleTheme = () => {
    setTheme(theme === "light" ? "dark" : "light");
  };

  const commitFunc = () => {
    setTransformFunc(funcInput);
  };

  const commitMoveRight = () => {
    setMoveRightExpr(moveRightInput);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      commitFunc();
      (e.target as HTMLInputElement).blur();
    }
  };

  const commitAutoHighlight = () => {
    onApplyAutoHighlight(autoHighlightInput, autoHighlightEnabled);
  };

  const handleAutoHighlightToggle = (enabled: boolean) => {
    onApplyAutoHighlight(autoHighlightExpr, enabled);
  };

  const handleAutoHighlightKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      commitAutoHighlight();
      (e.target as HTMLInputElement).blur();
    }
  };

  const handleMoveRightKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      commitMoveRight();
      (e.target as HTMLInputElement).blur();
    }
  };

  const commitRangeMin = () => {
    const num = Number(rangeMinInput);
    if (Number.isFinite(num)) {
      setAutoHighlightRange({ min: num });
    } else {
      setRangeMinInput(autoHighlightRange.min.toString());
    }
  };

  const commitRangeMax = () => {
    const num = Number(rangeMaxInput);
    if (Number.isFinite(num)) {
      setAutoHighlightRange({ max: num });
    } else {
      setRangeMaxInput(autoHighlightRange.max.toString());
    }
  };

  const commitPathStepLimit = () => {
    const num = Number(pathStepLimitInput);
    if (Number.isFinite(num)) {
      setPathStepLimit(num);
    } else {
      setPathStepLimitInput(pathStepLimit.toString());
    }
  };

  const commitBacktraceLimit = () => {
    const num = Number(backtraceLimitInput);
    if (Number.isFinite(num)) {
      setBacktraceLimit(num);
    } else {
      setBacktraceLimitInput(backtraceLimit.toString());
    }
  };

  const commitRowShiftMin = () => {
    const num = Number(rowShiftMinInput);
    if (Number.isFinite(num)) {
      setRowShiftBounds({ min: num });
    } else {
      setRowShiftMinInput(rowShiftBounds.min.toString());
    }
  };

  const commitRowShiftMax = () => {
    const num = Number(rowShiftMaxInput);
    if (Number.isFinite(num)) {
      setRowShiftBounds({ max: num });
    } else {
      setRowShiftMaxInput(rowShiftBounds.max.toString());
    }
  };

  const triggerSaveFeedback = () => {
    setSaveFeedback("Saved.");
    if (saveFeedbackTimer.current !== null) {
      window.clearTimeout(saveFeedbackTimer.current);
    }
    saveFeedbackTimer.current = window.setTimeout(() => {
      setSaveFeedback("");
    }, 1400);
  };

  const togglePresetSave = () => {
    setShowPresetSave((prev) => !prev);
    setShowPresetLoad(false);
  };

  const togglePresetLoad = () => {
    setShowPresetLoad((prev) => !prev);
    setShowPresetSave(false);
  };

  const handlePresetSave = () => {
    const trimmed = presetDescription.trim();
    if (!trimmed) return;
    onSaveSlot(trimmed);
    setPresetDescription("");
    triggerSaveFeedback();
  };

  const handlePresetLoad = (slotId: string) => {
    onLoadSlot(slotId);
    setShowPresetLoad(false);
  };

  const handlePresetDelete = (slotId: string) => {
    onDeleteSlot(slotId);
  };

  const isDark = theme === "dark";
  const panelClass = isDark
    ? "bg-gray-800/90 border-gray-700 text-gray-200"
    : "bg-white/90 border-gray-200 text-gray-800";

  const formatFactoredInt = (n: number) => {
    if (!Number.isFinite(n)) return String(n);
    if (n === 0) return "0";
    if (n === 1) return "1";
    if (n === -1) return "-1";
    const sign = n < 0 ? "-" : "";
    const abs = Math.abs(Math.round(n));
    const factored = formatValue(abs);
    return `${sign}${factored || abs.toString()}`;
  };

  const btnClass = isDark
    ? "bg-gray-800 text-gray-200 hover:bg-gray-700 border-gray-700"
    : "bg-white text-gray-700 hover:bg-gray-50 border-gray-200";

  const iconButtonClass = isDark
    ? "text-gray-300 hover:bg-gray-700/60"
    : "text-gray-600 hover:bg-gray-100";

  const presetButtonClass = isDark
    ? "bg-gray-900/70 border-gray-700 text-gray-200 hover:bg-gray-800"
    : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50";

  const inputClass = isDark
    ? "bg-gray-900 border-gray-600 text-gray-200 focus:border-blue-500"
    : "bg-gray-50 border-gray-300 text-gray-800 focus:border-blue-500";

  return (
    <>
      {/* Standalone Coordinates Display (Top Left) */}
      <div
        className={`absolute top-4 left-4 p-4 rounded-xl shadow-lg border backdrop-blur-sm transition-colors duration-300 pointer-events-none select-none ${panelClass}`}
      >
        <div className="flex gap-6 text-3xl font-bold font-mono tracking-tight">
          <span className="w-32">X: {cursorPos.x}</span>
          <span className="w-32">Y: {cursorPos.y}</span>
        </div>
        <div
          className={`flex gap-6 text-base mt-2 font-mono ${
            isDark ? "text-white" : "text-gray-700"
          }`}
        >
          <span className="w-32 text-center">
            {formatFactoredInt(cursorPos.x)}
          </span>
          <span className="w-32 text-center">
            {formatFactoredInt(cursorPos.y)}
          </span>
        </div>
        <div
          className={`text-xs mt-1 font-mono opacity-60 ${
            isDark ? "text-gray-400" : "text-gray-500"
          }`}
        >
          Zoom: {viewport.zoom.toFixed(1)}
        </div>
        {typeof backtrailLength === "number" && backtrailLength > 0 && (
          <div
            className={`text-xs mt-1 font-mono opacity-60 ${
              isDark ? "text-gray-400" : "text-gray-500"
            }`}
          >
            Length: {backtrailLength}
          </div>
        )}
      </div>

      <div className="absolute top-4 right-4 flex flex-col gap-2 items-end pointer-events-none select-none">
        {/* Collapsible Info/Settings Panel */}
        {showSettings && (
          <div
            className={`backdrop-blur-sm p-4 rounded-xl shadow-lg border mb-2 max-w-xs pointer-events-auto transition-colors duration-300 ${panelClass}`}
          >
            <div className="flex items-center justify-between">
              <h1 className="font-bold flex items-center gap-2">
                <Move className="w-4 h-4" /> GCD Vector Graph
              </h1>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={togglePresetSave}
                  className={`p-1 rounded-md transition-colors ${iconButtonClass}`}
                  title="Save settings preset"
                >
                  <Save className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={togglePresetLoad}
                  className={`p-1 rounded-md transition-colors ${iconButtonClass}`}
                  title="Load settings preset"
                >
                  <FolderOpen className="w-4 h-4" />
                </button>
              </div>
            </div>
            <p
              className={`text-xs mt-2 leading-relaxed ${
                isDark ? "text-gray-400" : "text-gray-600"
              }`}
            >
              Visualizing the vector field where node <code>(x,y)</code>{" "}
              connects to:
            </p>
            <ul
              className={`text-xs mt-1 ml-4 list-disc space-y-1 ${
                isDark ? "text-gray-300" : "text-gray-700"
              }`}
            >
              <li>
                <code>(x+1, y)</code> if{" "}
                <code>{moveRightExpr?.trim() || "gcd(x,y)==1"}</code> (East)
              </li>
              <li>
                <code>(x, y+1)</code> otherwise (North)
              </li>
            </ul>

            {showPresetSave && (
              <div
                className={`mt-3 rounded-lg border p-2 ${
                  isDark ? "border-gray-700/80" : "border-gray-200"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <label
                    className={`block text-[10px] font-medium ${
                      isDark ? "text-gray-400" : "text-gray-500"
                    }`}
                  >
                    Save current settings
                  </label>
                  {saveFeedback && (
                    <span className="text-[10px] text-emerald-500">
                      {saveFeedback}
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={presetDescription}
                    onChange={(e) => setPresetDescription(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        handlePresetSave();
                        (e.target as HTMLInputElement).blur();
                      }
                    }}
                    className={`flex-1 px-2 py-1 text-xs rounded border outline-none ${inputClass}`}
                    placeholder="Description"
                  />
                  <button
                    type="button"
                    onClick={handlePresetSave}
                    className={`px-2 py-1 text-xs rounded border ${presetButtonClass}`}
                    disabled={!presetDescription.trim()}
                  >
                    Save
                  </button>
                </div>
              </div>
            )}

            {showPresetLoad && (
              <div
                className={`mt-3 rounded-lg border p-2 ${
                  isDark ? "border-gray-700/80" : "border-gray-200"
                }`}
              >
                <p
                  className={`text-[10px] font-medium mb-1 ${
                    isDark ? "text-gray-400" : "text-gray-500"
                  }`}
                >
                  Load saved preset
                </p>
                {savedSlots.length === 0 ? (
                  <p className="text-[10px] opacity-60">No presets yet.</p>
                ) : (
                  <div className="max-h-32 overflow-y-auto space-y-1">
                    {savedSlots.map((slot) => (
                      <div key={slot.id} className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handlePresetLoad(slot.id)}
                          className={`flex-1 px-2 py-1 text-left text-xs rounded border ${presetButtonClass}`}
                          title={`Load "${slot.description}"`}
                        >
                          <span className="block truncate">
                            {slot.description}
                          </span>
                        </button>
                        {slot.id !== "default" && (
                          <button
                            type="button"
                            onClick={() => handlePresetDelete(slot.id)}
                            className={`p-1 rounded border ${presetButtonClass}`}
                            title={`Delete "${slot.description}"`}
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Transform Input */}
            <div className="mt-4">
              <label
                className={`block text-xs font-medium mb-1 ${
                  isDark ? "text-gray-400" : "text-gray-500"
                }`}
              >
                Transform f(n):
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={funcInput}
                  onChange={(e) => {
                    const val = e.target.value;
                    setFuncInput(val);
                  }}
                  onBlur={commitFunc}
                  onKeyDown={handleKeyDown}
                  className={`w-full px-2 py-1 text-sm rounded border outline-none font-mono ${inputClass}`}
                  placeholder="e.g. 2^n+1, fib(n), fact(n)"
                  title="Supports: +, -, *, /, ^, fib(n), fact(n), sin, cos, tan, log, sqrt, abs, floor, ceil, round, exp"
                />
              </div>
            </div>

            {/* Move Right Predicate */}
            <div className="mt-4">
              <label
                className={`block text-xs font-medium mb-1 ${
                  isDark ? "text-gray-400" : "text-gray-500"
                }`}
              >
                Move right when:
              </label>
              <input
                type="text"
                value={moveRightInput}
                onChange={(e) => setMoveRightInput(e.target.value)}
                onBlur={commitMoveRight}
                onKeyDown={handleMoveRightKeyDown}
                className={`w-full px-2 py-1 text-sm rounded border outline-none font-mono ${inputClass}`}
                placeholder="e.g. gcd(x+y,y)>1 || lpf(gcd(x,y))==1"
                title="Supports: comparisons (==, !=, <, <=, >, >=), logic (&&, ||, !), +, -, *, /, ^, gcd(a,b), spf(n)/lpf(n), gpf(n), fib(n), fact(n), sin, cos, tan, log, sqrt, abs, floor, ceil, round, exp"
              />
              <p className="text-[10px] opacity-60 mt-1">
                Variables x,y are after transform f(n) + row shift.
              </p>
              {moveRightError && (
                <p className="text-[10px] text-red-400 mt-1">
                  {moveRightError}
                </p>
              )}
            </div>

            {/* Auto Highlight Input */}
            <div className="mt-4">
              <label
                className={`block text-xs font-medium mb-1 ${
                  isDark ? "text-gray-400" : "text-gray-500"
                }`}
              >
                Auto highlight (x(n), y(n)):
              </label>
              <div className="flex gap-2 items-center">
                <input
                  type="checkbox"
                  className="w-4 h-4 accent-indigo-600 rounded flex-shrink-0"
                  checked={autoHighlightEnabled}
                  onChange={(e) => handleAutoHighlightToggle(e.target.checked)}
                  title="Enable/disable auto-highlight"
                />
                <input
                  type="text"
                  value={autoHighlightInput}
                  onChange={(e) => setAutoHighlightInput(e.target.value)}
                  onBlur={commitAutoHighlight}
                  onKeyDown={handleAutoHighlightKeyDown}
                  className={`flex-1 px-2 py-1 text-sm rounded border outline-none font-mono ${inputClass}`}
                  placeholder="e.g. (2n^3, n^2)"
                />
              </div>
              <p className="text-[10px] opacity-60 mt-1">
                Press enter to apply; uses n from the Advanced range.
              </p>
              {autoHighlightError && (
                <p className="text-[10px] text-red-400 mt-1">
                  {autoHighlightError}
                </p>
              )}
            </div>

            {/* Row Shift Slider */}
            <div className="mt-4">
              <label
                className={`flex justify-between text-xs font-medium mb-1 ${
                  isDark ? "text-gray-400" : "text-gray-500"
                }`}
              >
                <span>Row Shift (k): {rowShift}</span>
              </label>
              <div className="flex items-center gap-2">
                <button
                  onClick={() =>
                    setRowShift(Math.max(rowShiftBounds.min, rowShift - 1))
                  }
                  className={`p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 ${
                    isDark ? "text-gray-300" : "text-gray-600"
                  }`}
                >
                  <Minus className="w-3 h-3" />
                </button>
                <input
                  type="range"
                  min={rowShiftBounds.min}
                  max={rowShiftBounds.max}
                  step="1"
                  value={rowShift}
                  onChange={(e) => setRowShift(parseInt(e.target.value))}
                  className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                />
                <button
                  onClick={() =>
                    setRowShift(Math.min(rowShiftBounds.max, rowShift + 1))
                  }
                  className={`p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 ${
                    isDark ? "text-gray-300" : "text-gray-600"
                  }`}
                >
                  <Plus className="w-3 h-3" />
                </button>
              </div>
              <p className="text-[9px] opacity-50 mt-1">
                Shifts x by k for rows [-k, k]
              </p>
            </div>

            <div className="mt-4 space-y-2">
              <label
                className={`flex items-center justify-between text-sm font-medium cursor-pointer ${
                  isDark ? "text-gray-300" : "text-gray-700"
                }`}
              >
                <span>Randomize shift</span>
                <input
                  type="checkbox"
                  className="w-4 h-4 accent-indigo-600 rounded"
                  checked={randomizeShift}
                  onChange={(e) => setRandomizeShift(e.target.checked)}
                />
              </label>

              <label
                className={`flex items-center justify-between text-sm font-medium cursor-pointer ${
                  isDark ? "text-gray-300" : "text-gray-700"
                }`}
              >
                <span>Shift lock</span>
                <input
                  type="checkbox"
                  className="w-4 h-4 accent-indigo-600 rounded"
                  checked={shiftLock}
                  onChange={(e) => setShiftLock(e.target.checked)}
                />
              </label>

              <label
                className={`flex items-center justify-between text-sm font-medium cursor-pointer ${
                  isDark ? "text-gray-300" : "text-gray-700"
                }`}
              >
                <span>Show Factors</span>
                <input
                  type="checkbox"
                  className="w-4 h-4 accent-indigo-600 rounded"
                  checked={showFactored}
                  onChange={(e) => setShowFactored(e.target.checked)}
                />
              </label>

              <label
                className={`flex items-center justify-between text-sm font-medium cursor-pointer ${
                  isDark ? "text-gray-300" : "text-gray-700"
                }`}
              >
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
                  <label
                    className={`flex justify-between text-xs font-medium mb-1 ${
                      isDark ? "text-gray-400" : "text-gray-500"
                    }`}
                  >
                    <span>
                      Degree: {degree}{" "}
                      {degree === 1
                        ? "(Primes)"
                        : degree === 2
                        ? "(Semiprimes)"
                        : ""}
                    </span>
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

            {/* Advanced settings */}
            <div
              className={`mt-5 pt-3 border-t ${
                isDark ? "border-gray-700/70" : "border-gray-200"
              }`}
            >
              <button
                onClick={() => setShowAdvanced(!showAdvanced)}
                className={`w-full flex items-center justify-between text-sm font-semibold ${
                  isDark ? "text-gray-200" : "text-gray-700"
                }`}
              >
                <span>Advanced</span>
                <ChevronDown
                  className={`w-4 h-4 transition-transform ${
                    showAdvanced ? "rotate-180" : ""
                  }`}
                />
              </button>

              {showAdvanced && (
                <div className="mt-3 space-y-3 text-sm">
                  <div>
                    <label
                      className={`block text-xs font-medium mb-1 ${
                        isDark ? "text-gray-400" : "text-gray-500"
                      }`}
                    >
                      Auto highlight n range
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        value={rangeMinInput}
                        onChange={(e) => setRangeMinInput(e.target.value)}
                        onBlur={commitRangeMin}
                        onKeyDown={(e) => e.key === "Enter" && commitRangeMin()}
                        className={`w-1/2 px-2 py-1 rounded border ${inputClass} text-sm`}
                      />
                      <input
                        type="number"
                        value={rangeMaxInput}
                        onChange={(e) => setRangeMaxInput(e.target.value)}
                        onBlur={commitRangeMax}
                        onKeyDown={(e) => e.key === "Enter" && commitRangeMax()}
                        className={`w-1/2 px-2 py-1 rounded border ${inputClass} text-sm`}
                      />
                    </div>
                    <p className="text-[10px] opacity-60 mt-1">
                      Inclusive range for n when auto-highlighting.
                    </p>
                  </div>

                  <div>
                    <label
                      className={`block text-xs font-medium mb-1 ${
                        isDark ? "text-gray-400" : "text-gray-500"
                      }`}
                    >
                      Row shift k bounds
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        value={rowShiftMinInput}
                        onChange={(e) => setRowShiftMinInput(e.target.value)}
                        onBlur={commitRowShiftMin}
                        onKeyDown={(e) =>
                          e.key === "Enter" && commitRowShiftMin()
                        }
                        min="0"
                        max="210"
                        className={`w-1/2 px-2 py-1 rounded border ${inputClass} text-sm`}
                      />
                      <input
                        type="number"
                        value={rowShiftMaxInput}
                        onChange={(e) => setRowShiftMaxInput(e.target.value)}
                        onBlur={commitRowShiftMax}
                        onKeyDown={(e) =>
                          e.key === "Enter" && commitRowShiftMax()
                        }
                        min="0"
                        max="210"
                        className={`w-1/2 px-2 py-1 rounded border ${inputClass} text-sm`}
                      />
                    </div>
                    <p className="text-[10px] opacity-60 mt-1">
                      Slider stays within this range.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label
                        className={`block text-xs font-medium mb-1 ${
                          isDark ? "text-gray-400" : "text-gray-500"
                        }`}
                      >
                        Path step limit
                      </label>
                      <input
                        type="number"
                        value={pathStepLimitInput}
                        onChange={(e) => setPathStepLimitInput(e.target.value)}
                        onBlur={commitPathStepLimit}
                        onKeyDown={(e) =>
                          e.key === "Enter" && commitPathStepLimit()
                        }
                        className={`w-full px-2 py-1 rounded border ${inputClass} text-sm`}
                      />
                      <p className="text-[10px] opacity-60 mt-1">
                        Max steps drawn for forward paths.
                      </p>
                    </div>
                    <div>
                      <label
                        className={`block text-xs font-medium mb-1 ${
                          isDark ? "text-gray-400" : "text-gray-500"
                        }`}
                      >
                        Backtrace limit
                      </label>
                      <input
                        type="number"
                        value={backtraceLimitInput}
                        onChange={(e) => setBacktraceLimitInput(e.target.value)}
                        onBlur={commitBacktraceLimit}
                        onKeyDown={(e) =>
                          e.key === "Enter" && commitBacktraceLimit()
                        }
                        className={`w-full px-2 py-1 rounded border ${inputClass} text-sm`}
                      />
                      <p className="text-[10px] opacity-60 mt-1">
                        Steps searched when tracing to the origin.
                      </p>
                    </div>
                  </div>
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
            {isDark ? (
              <Sun className="w-5 h-5" />
            ) : (
              <Moon className="w-5 h-5" />
            )}
          </button>
          <button
            onClick={handleReset}
            className={`p-3 rounded-full shadow-lg active:scale-95 transition-all border ${btnClass}`}
            title="Reset View"
          >
            <RotateCcw className="w-5 h-5" />
          </button>
          <button
            onClick={onResetPaths}
            className={`p-3 rounded-full shadow-lg active:scale-95 transition-all border ${btnClass}`}
            title="Clear all traced paths"
          >
            <Eraser className="w-5 h-5" />
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
