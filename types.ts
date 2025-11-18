
export interface Point {
  x: number;
  y: number;
}

export interface Viewport {
  x: number; // Center X in graph coordinates
  y: number; // Center Y in graph coordinates
  zoom: number; // Pixels per unit
}

export enum ColorMode {
  PRIME_FACTOR = 'PRIME_FACTOR',
  NONE = 'NONE',
}

export type Theme = 'light' | 'dark';
