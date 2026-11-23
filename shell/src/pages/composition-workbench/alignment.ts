export function positiveModulo(value: number, modulus: number) {
  return ((value % modulus) + modulus) % modulus;
}
