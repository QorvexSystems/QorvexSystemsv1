'use client';

export function sanitizeCurrencyInput(value: string) {
  const normalized = value.replace(',', '.').replace(/[^\d.]/g, '');
  const firstDotIndex = normalized.indexOf('.');

  if (firstDotIndex === -1) {
    return stripLeadingZeroes(normalized);
  }

  const integerPart = stripLeadingZeroes(normalized.slice(0, firstDotIndex)) || '0';
  const decimalPart = normalized.slice(firstDotIndex + 1).replace(/\./g, '').slice(0, 2);

  return `${integerPart}.${decimalPart}`;
}

export function formatCurrencyInput(value: string) {
  if (!value.trim()) {
    return '';
  }

  const sanitized = sanitizeCurrencyInput(value);
  const amount = Number(sanitized);

  if (!Number.isFinite(amount)) {
    return '';
  }

  return amount.toFixed(2);
}

export function appendCurrencyInput(current: string, value: string) {
  if (value === '.' && current.includes('.')) {
    return current;
  }

  return sanitizeCurrencyInput(`${current}${value}`);
}

export function backspaceCurrencyInput(value: string) {
  return sanitizeCurrencyInput(value.slice(0, -1));
}

function stripLeadingZeroes(value: string) {
  return value.replace(/^0+(?=\d)/, '');
}
