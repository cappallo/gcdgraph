
// Greatest Common Divisor
export const gcd = (a: number, b: number): number => {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) {
    [a, b] = [b, a % b];
  }
  return a;
};

// Get smallest prime factor
export const getSmallestPrimeFactor = (n: number): number => {
  if (n <= 1) return 1;
  while (n % 2 === 0) return 2;
  let sqrt = Math.sqrt(n);
  for (let i = 3; i <= sqrt; i += 2) {
    if (n % i === 0) return i;
  }
  return n;
};

// Format GCD string (e.g., prime factorization or simple value)
// For visual simplicity in the graph, we mostly just return the number,
// but we could expand to exponential notation like 2^2 * 3 if desired.
export const formatValue = (n: number): string => {
  if (n === 1) return "";
  
  // Simple factorization string builder
  const factors: number[] = [];
  let d = 2;
  let temp = n;
  while (d * d <= temp) {
    while (temp % d === 0) {
      factors.push(d);
      temp /= d;
    }
    d++;
  }
  if (temp > 1) factors.push(temp);

  // Group factors: e.g. [2, 2, 3] -> "2²·3"
  const counts = new Map<number, number>();
  factors.forEach(f => counts.set(f, (counts.get(f) || 0) + 1));
  
  const parts: string[] = [];
  Array.from(counts.keys()).sort((a, b) => a - b).forEach(prime => {
    const count = counts.get(prime) || 0;
    if (count > 1) {
      parts.push(`${prime}${toSuperscript(count)}`);
    } else {
      parts.push(`${prime}`);
    }
  });

  return parts.join('·');
};

const toSuperscript = (num: number): string => {
  const map: Record<string, string> = {
    '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹'
  };
  return num.toString().split('').map(d => map[d] || '').join('');
};

// Deterministic color map for primes
const PRIME_COLORS: Record<number, string> = {
  2: '#ef4444', // Red-500
  3: '#eab308', // Yellow-500 (Darker for contrast)
  5: '#a855f7', // Purple-500
  7: '#f97316', // Orange-500
  11: '#3b82f6', // Blue-500
  13: '#22c55e', // Green-500
  17: '#ec4899', // Pink-500
  19: '#06b6d4', // Cyan-500
  23: '#6366f1', // Indigo-500
  29: '#8b5cf6', // Violet-500
  31: '#d946ef', // Fuchsia-500
};

export const getFactorColor = (n: number): string => {
  const spf = getSmallestPrimeFactor(n);
  if (spf === 1) return '#ffffff';
  
  if (PRIME_COLORS[spf]) return PRIME_COLORS[spf];
  
  // Fallback procedural color for large primes
  const hue = (spf * 137.508) % 360; 
  return `hsl(${hue}, 70%, 60%)`;
};

// Generate a distinct color for partition paths based on index n
export const getPartitionColor = (n: number): string => {
  // Use Golden Angle to separate colors visually
  const hue = (n * 137.508) % 360;
  return `hsl(${hue}, 85%, 45%)`;
};
