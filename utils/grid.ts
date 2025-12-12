import { Point } from '../types';

// Determine how much to shift a row based on k/randomness config.
export const getRowShiftMagnitude = (gy: number, k: number, useRandom: boolean) => {
  if (k <= 0 || Math.abs(gy) > k) return 0;
  if (!useRandom) return k;

  // Deterministic pseudo-random in [0, k-1] per row/k combo
  const seed = gy * 374761393 + k * 668265263;
  const noise = Math.abs(Math.sin(seed) * 10000);
  const fraction = noise - Math.floor(noise);
  return Math.floor(fraction * k);
};

// Signed offset used to keep custom start nodes aligned with row shifts.
export const getRowOffset = (gy: number, k: number, useRandom: boolean) => {
  const magnitude = getRowShiftMagnitude(gy, k, useRandom);
  if (gy > 0) return magnitude;
  if (gy < 0) return -magnitude;
  return 0;
};

export const pointKey = (p: Point) => `${p.x},${p.y}`;
