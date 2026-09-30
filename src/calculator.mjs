import { getPolicy, SEVERITIES } from './policy.mjs?v=20260930-select-assets';

export const MULTIPLIERS = Object.freeze(['1', '1.5', '2', '2.5', '3', '3.5', '4', '4.5', '5']);

export function parseScore(input) {
  if (typeof input !== 'string' && typeof input !== 'number') {
    throw new TypeError('Enter a CVSS score from 0.0 to 10.0.');
  }
  const text = String(input).trim();
  if (!/^(?:[0-9](?:\.[0-9])?|10(?:\.0)?)$/.test(text)) {
    throw new RangeError('Use a score from 0.0 to 10.0, with at most one decimal place.');
  }
  const [whole, fraction = '0'] = text.split('.');
  return Number(whole) * 10 + Number(fraction);
}

export function scoreLabel(ticks) {
  return `${Math.floor(ticks / 10)}.${ticks % 10}`;
}

export function severityForTicks(ticks) {
  if (!Number.isInteger(ticks) || ticks < 0 || ticks > 100) {
    throw new RangeError('Invalid CVSS score.');
  }
  if (ticks === 0) return { id: 'none', label: 'None', minTicks: 0, maxTicks: 0 };
  return SEVERITIES.find(band => ticks >= band.minTicks && ticks <= band.maxTicks);
}

// All payout arithmetic is an exact rational number of cents. Round half up
// once per displayed amount. No floating-point money or intermediate rounding.
function roundCents(numerator, denominator) {
  const rounded = (2n * numerator + denominator) / (2n * denominator);
  if (rounded > BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError('Amount is too large.');
  return Number(rounded);
}

export function calculateQuote({ programId, groupId, score, multiplier = '1' }) {
  const { program, group } = getPolicy(programId, groupId);
  const ticks = parseScore(score);
  const multiplierText = String(multiplier);
  if (!MULTIPLIERS.includes(multiplierText)) throw new RangeError('Select a valid multiplier.');
  const [whole, fraction = '0'] = multiplierText.split('.');
  const multiplierTicks = Number(whole) * 10 + Number(fraction);
  const severity = severityForTicks(ticks);
  const [minimum, maximum] = ticks === 0 ? [0, 0] : group.ranges[severity.id];
  const position = ticks - severity.minTicks;
  const span = severity.maxTicks - severity.minTicks;
  const denominator = BigInt(span || 1);
  const numerator = ticks === 0 ? 0n : 100n * (
    BigInt(minimum) * denominator + BigInt(maximum - minimum) * BigInt(position)
  );
  return Object.freeze({
    programId: program.id, programName: program.name,
    groupId: group.id, groupName: group.name,
    score: scoreLabel(ticks), ticks, severity,
    minimum, maximum, position, span,
    baseCents: roundCents(numerator, denominator),
    adjustedCents: roundCents(numerator * BigInt(multiplierTicks), denominator * 10n),
    multiplier: multiplierText, source: program.source,
  });
}

export function formatMoney(cents) {
  if (!Number.isSafeInteger(cents) || cents < 0) throw new RangeError('Invalid amount.');
  return `$${Math.floor(cents / 100).toLocaleString('en-US')}.${String(cents % 100).padStart(2, '0')}`;
}

export function formatRange([minimum, maximum]) {
  return `$${minimum.toLocaleString('en-US')}–$${maximum.toLocaleString('en-US')}`;
}

export function quoteText(quote) {
  return [
    `${quote.programName} · ${quote.groupName}`,
    `CVSS v3.1: ${quote.score} (${quote.severity.label})`,
    `Published severity range: ${formatRange([quote.minimum, quote.maximum])} USD`,
    `Calculated base bounty: ${formatMoney(quote.baseCents)} USD`,
    ...(quote.multiplier !== '1' ? [
      `Manual multiplier: ${quote.multiplier}× (not part of the published base rates)`,
      `With manual multiplier: ${formatMoney(quote.adjustedCents)} USD`,
    ] : []),
    quote.ticks === 0 ? 'CVSS 0.0 has no severity and no base bounty.' :
      'Method: linear interpolation within the CVSS severity band; rounded half up to USD cents.',
    ...(quote.multiplier !== '1' ? ['Multiplier is applied before rounding.'] : []),
    `Policy: ${quote.source}`,
    'Estimate only; final severity and award are determined by the security team.',
  ].join('\n');
}
