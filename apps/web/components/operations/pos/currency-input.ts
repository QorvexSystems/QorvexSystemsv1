'use client';

export function sanitizeCurrencyInput(value: string) {
  return formatMinorUnitsInput(value);
}

export function formatCurrencyInput(value: string) {
  return formatMinorUnitsInput(value);
}

export function appendCurrencyInput(current: string, value: string) {
  return formatMinorUnitsInput(`${getMinorUnitDigits(current)}${value}`);
}

export function backspaceCurrencyInput(value: string) {
  return formatMinorUnitsInput(getMinorUnitDigits(value).slice(0, -1));
}

export function clearCurrencyInput() {
  return '0.00';
}

function formatMinorUnitsInput(value: string) {
  const digits = getMinorUnitDigits(value);
  const cents = Number(digits || 0);

  if (!Number.isFinite(cents)) {
    return '0.00';
  }

  return (cents / 100).toFixed(2);
}

function getMinorUnitDigits(value: string) {
  return value.replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, 12);
}
