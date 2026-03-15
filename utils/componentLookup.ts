import standardComponentCacheRaw from "../.exact_find_path_cache.txt?raw";
import spfComponentCacheRaw from "../.exact_find_path_cache_spf.txt?raw";

const parseComponentBoundaries = (raw: string): number[] =>
  raw
    .split(/\s+/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => Number(entry))
    .filter((value) => Number.isFinite(value));

const STANDARD_COMPONENT_BOUNDARIES = parseComponentBoundaries(
  standardComponentCacheRaw
);
const SPF_COMPONENT_BOUNDARIES = parseComponentBoundaries(spfComponentCacheRaw);

const findBoundaryIndex = (boundaries: number[], x: number): number => {
  let lo = 0;
  let hi = boundaries.length - 1;
  let ans = boundaries.length;

  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (x <= boundaries[mid]!) {
      ans = mid;
      hi = mid - 1;
    } else {
      lo = mid + 1;
    }
  }

  return ans;
};

export const findComponentNumberAtRow2 = (
  xRaw: number,
  useSpfCache: boolean
): number | null => {
  if (!Number.isFinite(xRaw)) return null;
  const x = Math.round(xRaw);
  const boundaries = useSpfCache
    ? SPF_COMPONENT_BOUNDARIES
    : STANDARD_COMPONENT_BOUNDARIES;

  const index = findBoundaryIndex(boundaries, x);
  if (index >= boundaries.length) return null;
  return index + 1;
};

export const getKnownComponentCount = (useSpfCache: boolean): number =>
  useSpfCache
    ? SPF_COMPONENT_BOUNDARIES.length
    : STANDARD_COMPONENT_BOUNDARIES.length;
