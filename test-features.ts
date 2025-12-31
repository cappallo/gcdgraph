import { createTransformFunction } from "./utils/math";

// Test fib function
console.log("Testing fib function:");
const fibFn = createTransformFunction("fib(n)");
console.log("fib(0):", fibFn(0), "(expected: 0)");
console.log("fib(1):", fibFn(1), "(expected: 1)");
console.log("fib(5):", fibFn(5), "(expected: 5)");
console.log("fib(10):", fibFn(10), "(expected: 55)");
console.log("fib(20):", fibFn(20), "(expected: 6765)");

console.log("\nTesting prime/pi functions:");
const primeFn = createTransformFunction("prime(n)");
const piFn = createTransformFunction("pi(n)");
console.log("prime(1):", primeFn(1), "(expected: 2)");
console.log("prime(6):", primeFn(6), "(expected: 13)");
console.log("pi(10):", piFn(10), "(expected: 4)");
console.log("pi(29):", piFn(29), "(expected: 10)");

// Test BigInt powers
console.log("\nTesting large powers with BigInt:");
const powerFn = createTransformFunction("2^n+1");
console.log("2^10+1:", powerFn(10), "(expected: 1025)");
console.log("2^20+1:", powerFn(20), "(expected: 1048577)");
console.log("2^30+1:", powerFn(30), "(expected: 1073741825)");
console.log("2^40+1:", powerFn(40), "(expected: 1099511627777)");
console.log("2^50+1:", powerFn(50), "(expected: 1125899906842625)");

console.log("\nTesting sign function:");
const signFn = createTransformFunction("sign(n)");
console.log("sign(-10):", signFn(-10), "(expected: -1)");
console.log("sign(0):", signFn(0), "(expected: 0)");
console.log("sign(10):", signFn(10), "(expected: 1)");

console.log(
  "\nNote: JavaScript Numbers use IEEE 754 double precision, which can only"
);
console.log(
  "accurately represent integers up to 2^53-1 (Number.MAX_SAFE_INTEGER)."
);
console.log(
  "Beyond that, precision is lost when converting from BigInt to Number."
);
console.log("");
console.log("Number.MAX_SAFE_INTEGER:", Number.MAX_SAFE_INTEGER, "(2^53-1)");
console.log("2^53:", powerFn(53) - 1, "(still within safe range)");
console.log(
  "2^53+1:",
  powerFn(53),
  "(loses precision - JavaScript limitation)"
);
console.log("2^60+1:", powerFn(60), "(approximate)");
console.log("");
console.log(
  "The BigInt computation is exact, but display is limited by Number type."
);
