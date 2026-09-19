const DECIMAL_PATTERN = /^-?\d+(?:\.\d+)?$/;

interface ParsedDecimal {
  coefficient: bigint;
  scale: number;
}

function parseDecimal(value: string): ParsedDecimal {
  if (!DECIMAL_PATTERN.test(value) || value.length > 128) {
    throw new Error(`Invalid decimal value: ${value}`);
  }

  const negative = value.startsWith('-');
  const unsigned = negative ? value.slice(1) : value;
  const [whole = '0', fraction = ''] = unsigned.split('.');
  const digits = `${whole}${fraction}`.replace(/^0+(?=\d)/, '');
  const coefficient = BigInt(digits || '0') * (negative ? -1n : 1n);
  return { coefficient, scale: fraction.length };
}

function pow10(exponent: number): bigint {
  return 10n ** BigInt(exponent);
}

function formatDecimal(coefficient: bigint, scale: number): string {
  const negative = coefficient < 0n;
  const digits = (negative ? -coefficient : coefficient).toString().padStart(scale + 1, '0');
  const raw =
    scale === 0
      ? digits
      : `${digits.slice(0, -scale)}.${digits.slice(-scale)}`.replace(/\.?0+$/, '');
  return coefficient === 0n ? '0' : `${negative ? '-' : ''}${raw}`;
}

function align(left: ParsedDecimal, right: ParsedDecimal): [bigint, bigint, number] {
  const scale = Math.max(left.scale, right.scale);
  return [
    left.coefficient * pow10(scale - left.scale),
    right.coefficient * pow10(scale - right.scale),
    scale,
  ];
}

function divideRounded(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) {
    throw new Error('Cannot divide by zero');
  }

  const negative = (numerator < 0n) !== (denominator < 0n);
  const absoluteNumerator = numerator < 0n ? -numerator : numerator;
  const absoluteDenominator = denominator < 0n ? -denominator : denominator;
  const quotient = absoluteNumerator / absoluteDenominator;
  const remainder = absoluteNumerator % absoluteDenominator;
  const rounded = remainder * 2n >= absoluteDenominator ? quotient + 1n : quotient;
  return negative ? -rounded : rounded;
}

export function canonicalDecimal(value: string): string {
  const parsed = parseDecimal(value);
  return formatDecimal(parsed.coefficient, parsed.scale);
}

export function multiplyDecimalByPowerOfTen(value: string, places: number): string {
  if (!Number.isInteger(places) || places < 0) {
    throw new Error('Decimal shift must be a non-negative integer');
  }
  const parsed = parseDecimal(value);
  if (parsed.scale >= places) {
    return formatDecimal(parsed.coefficient, parsed.scale - places);
  }
  return formatDecimal(parsed.coefficient * pow10(places - parsed.scale), 0);
}

export function subtractDecimals(left: string, right: string): string {
  const [leftCoefficient, rightCoefficient, scale] = align(
    parseDecimal(left),
    parseDecimal(right)
  );
  return formatDecimal(leftCoefficient - rightCoefficient, scale);
}

/**
 * Returns the percentage return of `base` relative to `quote` from their
 * aligned percentage returns: (((1 + base) / (1 + quote)) - 1) * 100.
 */
export function relativeReturnPercent(
  baseReturnPercent: string,
  quoteReturnPercent: string,
  decimalPlaces = 8
): string {
  if (!Number.isInteger(decimalPlaces) || decimalPlaces < 0 || decimalPlaces > 18) {
    throw new Error('decimalPlaces must be an integer from 0 through 18');
  }

  const [baseCoefficient, quoteCoefficient, scale] = align(
    parseDecimal(baseReturnPercent),
    parseDecimal(quoteReturnPercent)
  );
  const quoteGrowthFactor = 100n * pow10(scale) + quoteCoefficient;
  if (quoteGrowthFactor <= 0n) {
    throw new Error('Quote return must be greater than -100%');
  }

  const scaledPercent = divideRounded(
    (baseCoefficient - quoteCoefficient) * 100n * pow10(decimalPlaces),
    quoteGrowthFactor
  );
  return formatDecimal(scaledPercent, decimalPlaces);
}

/** Returns ((end - start) / start) * 100, rounded to `decimalPlaces`. */
export function percentageChange(
  start: string,
  end: string,
  decimalPlaces = 8
): string {
  if (!Number.isInteger(decimalPlaces) || decimalPlaces < 0 || decimalPlaces > 18) {
    throw new Error('decimalPlaces must be an integer from 0 through 18');
  }

  const [startCoefficient, endCoefficient] = align(
    parseDecimal(start),
    parseDecimal(end)
  );
  if (startCoefficient <= 0n) {
    throw new Error('Percentage-change start value must be positive');
  }

  const scaledPercent = divideRounded(
    (endCoefficient - startCoefficient) * 100n * pow10(decimalPlaces),
    startCoefficient
  );
  return formatDecimal(scaledPercent, decimalPlaces);
}
