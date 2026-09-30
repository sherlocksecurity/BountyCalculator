import test from 'node:test';
import assert from 'node:assert/strict';
import Decimal from 'decimal.js';
import { PROGRAMS, getPolicy } from '../src/policy.mjs';
import { calculateQuote, parseScore, severityForTicks, formatMoney, quoteText } from '../src/calculator.mjs';

// Independently transcribed published/approved rates. Do not derive these from
// the production policy: a changed table must fail until explicitly reviewed.
const fixtures = [
  ['eternal', 'tier-1', [[100,300], [300,1000], [1000,2000], [2000,4000]]],
  ['eternal', 'tier-2', [[100,200], [200,500], [500,1000], [1000,2000]]],
  ['eternal', 'tier-3', [[50,100], [100,250], [250,500], [500,1000]]],
  ['eternal-private', 'sdk', [[100,200], [200,300], [300,500], [500,1000]]],
  ['eternal-private', 'dashboard', [[100,200], [200,500], [500,1000], [1000,2000]]],
];
const bands = [[1,39,'low'], [40,69,'medium'], [70,89,'high'], [90,100,'critical']];

test('the five immutable policies match approved ranges exactly', () => {
  assert.equal(PROGRAMS.flatMap(p => p.groups).length, 5);
  for (const [programId, groupId, ranges] of fixtures) {
    const { group } = getPolicy(programId, groupId);
    assert.deepEqual(bands.map(b => group.ranges[b[2]]), ranges);
    assert.throws(() => { group.ranges.low[1] = 100000; }, TypeError);
  }
});

for (const [programId, groupId, ranges] of fixtures) {
  test(`${programId}/${groupId} - all 101 scores and 9 multipliers match an independent decimal oracle`, () => {
    let previous = 0;
    for (let ticks = 0; ticks <= 100; ticks++) {
      const score = (ticks / 10).toFixed(1);
      const bandIndex = bands.findIndex(([lo, hi]) => ticks >= lo && ticks <= hi);
      const [lo, hi, severity] = ticks ? bands[bandIndex] : [0, 0, 'none'];
      const [min, max] = ticks ? ranges[bandIndex] : [0, 0];
      // Decimal arithmetic is intentionally distinct from production BigInt
      // rational-cent arithmetic, including its rounding implementation.
      const dollars = ticks ? new Decimal(score).minus(new Decimal(lo).div(10))
        .div(new Decimal(hi - lo).div(10)).times(max - min).plus(min) : new Decimal(0);
      for (let halfSteps = 2; halfSteps <= 10; halfSteps++) {
        const multiplier = String(halfSteps / 2);
        const q = calculateQuote({ programId, groupId, score, multiplier });
        const expectedBase = dollars.times(100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
        const expectedAdjusted = dollars.times(multiplier).times(100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
        assert.equal(q.baseCents, expectedBase, `${score} base`);
        assert.equal(q.adjustedCents, expectedAdjusted, `${score} × ${multiplier}`);
        assert.equal(q.severity.id, severity);
        assert.equal(q.minimum, min);
        assert.equal(q.maximum, max);
        assert.ok(q.baseCents >= min * 100 && q.baseCents <= max * 100);
        if (halfSteps === 2) {
          assert.ok(q.baseCents >= previous, `monotonic at ${score}`);
          previous = q.baseCents;
        }
      }
    }
  });
}

test('all severity endpoints hit their exact configured minimum and maximum', () => {
  for (const [programId, groupId, ranges] of fixtures) {
    bands.forEach(([lo, hi], index) => {
      assert.equal(calculateQuote({programId, groupId, score: lo/10}).baseCents, ranges[index][0]*100);
      assert.equal(calculateQuote({programId, groupId, score: hi/10}).baseCents, ranges[index][1]*100);
    });
    assert.equal(calculateQuote({programId, groupId, score: '0.0', multiplier: '5'}).adjustedCents, 0);
  }
});

test('known policy examples and non-terminating fractions', () => {
  const examples = [
    ['eternal','tier-1','9.5',300000], ['eternal','tier-1','10.0',400000],
    ['eternal','tier-1','1.2',15789], ['eternal','tier-1','5.5',66207],
    ['eternal','tier-1','8.3',168421],
    ['eternal-private','sdk','9.5',75000], ['eternal-private','dashboard','9.5',150000],
  ];
  for (const [programId, groupId, score, cents] of examples) {
    assert.equal(calculateQuote({programId, groupId, score}).baseCents, cents);
  }
  const q = calculateQuote({programId:'eternal-private', groupId:'sdk', score:'5.5', multiplier:'1.5'});
  assert.equal(q.baseCents, 25172);
  assert.equal(q.adjustedCents, 37759, 'apply multiplier to unrounded amount');
});

test('malformed, out-of-range, or ambiguous score inputs never create a quote', () => {
  const invalid = ['', ' ', '3.95', '6.95', '8.95', '10.01', '-0.1', '-0', '11', '4e0', '4junk', '.1', '1.', '0x1', '9.00', 'NaN', 'Infinity', null, undefined, true, false, [], {}, NaN, Infinity];
  for (const score of invalid) {
    assert.throws(() => calculateQuote({programId:'eternal', groupId:'tier-1', score}), String(score));
  }
  assert.equal(parseScore(' 9.5 '), 95);
  assert.equal(parseScore(10), 100);
  for (const ticks of [-1, 101, 1.1, NaN]) assert.throws(() => severityForTicks(ticks));
});

test('unknown program, mismatched group, and invalid multiplier fail closed', () => {
  for (const [programId, groupId] of [['unknown','tier-1'], ['eternal','sdk'], ['eternal-private','tier-2'], ['eternal','']]) {
    assert.throws(() => calculateQuote({programId, groupId, score:'9.5'}));
  }
  for (const multiplier of ['', '0', '-1', '1.1', '6', 'Infinity', NaN, null, true]) {
    assert.throws(() => calculateQuote({programId:'eternal', groupId:'tier-1', score:'9.5', multiplier}));
  }
});

test('money and copied calculations retain currency, program, asset, score and manual context', () => {
  assert.equal(formatMoney(0), '$0.00');
  assert.equal(formatMoney(150001), '$1,500.01');
  for (const value of [-1, NaN, Infinity, 0.5]) assert.throws(() => formatMoney(value));
  const q = calculateQuote({programId:'eternal-private', groupId:'dashboard', score:'9.5', multiplier:'2'});
  const text = quoteText(q);
  for (const part of ['Eternal Private · Nugget Dashboard', '9.5 (Critical)', '$1,500.00 USD', '$3,000.00 USD', 'Manual multiplier: 2×', 'https://hackerone.com/eternal-private']) assert.ok(text.includes(part), part);
});
