import { Point } from '../types';

// Determine how much to shift a row based on k/randomness config.
export const getRowShiftMagnitude = (gy: number, k: number, useRandom: boolean) => {
  const magnitude = Math.abs(Math.round(k));
  if (magnitude === 0 || Math.abs(gy) > magnitude) return 0;
  if (!useRandom) return magnitude;

  // Deterministic pseudo-random in [0, k-1] per row/k combo
  // Include sign(k) so negative shifts get a distinct sequence.
  const seed = gy * 374761393 + magnitude * 668265263 + (k < 0 ? 1442695041 : 0);
  const noise = Math.abs(Math.sin(seed) * 10000);
  const fraction = noise - Math.floor(noise);
  return Math.floor(fraction * magnitude);
};

// Signed offset used to keep custom start nodes aligned with row shifts.
export const getRowOffset = (gy: number, k: number, useRandom: boolean) => {
  const magnitude = getRowShiftMagnitude(gy, k, useRandom);
  const dir = k < 0 ? -1 : 1;
  if (gy > 0) return dir * magnitude;
  if (gy < 0) return dir * -magnitude;
  return 0;
};

export const pointKey = (p: Point) => `${p.x},${p.y}`;
