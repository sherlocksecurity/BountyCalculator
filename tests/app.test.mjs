import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { initCalculator } from '../src/app.mjs';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
function setup(options = {}) {
  const dom = new JSDOM(html, { url:'https://sherlocksecurity.github.io/BountyCalculator/' });
  const doc = dom.window.document;
  initCalculator(doc, options);
  const id = name => doc.getElementById(name);
  const change = (element, value, event = 'change') => {
    element.value = value;
    element.dispatchEvent(new dom.window.Event(event, {bubbles:true}));
  };
  const select = (name, value) => doc.querySelector(`input[name="${name}"][value="${value}"]`).click();
  return {dom, doc, id, change, select, score: value => change(id('cvss-score'), value, 'input')};
}

test('requires explicit group and valid score; invalid edits remove old amounts and disable copying', () => {
  const ui = setup();
  assert.equal(ui.id('quote-result').hidden, true);
  assert.equal(ui.id('copy-result').disabled, true);
  ui.score('9.5');
  assert.equal(ui.id('quote-result').hidden, true);
  ui.select('rate-group', 'tier-1');
  assert.equal(ui.id('base-amount').textContent, '$3,000.00');
  for (const score of ['9.55','11','-1','abc','']) {
    ui.score(score);
    assert.equal(ui.id('quote-result').hidden, true);
    assert.equal(ui.id('base-amount').textContent, '');
    assert.equal(ui.id('copy-result').disabled, true);
  }
  ui.score('0.0');
  assert.equal(ui.id('base-amount').textContent, '$0.00');
  assert.equal(ui.id('quote-severity').textContent, 'None');
});

test('program and group changes update every result and reset manual bonuses', () => {
  const ui = setup();
  ui.select('rate-group', 'tier-1');
  ui.score('9.5');
  ui.select('multiplier', '2');
  assert.equal(ui.id('base-amount').textContent, '$3,000.00');
  assert.equal(ui.id('adjusted-amount').textContent, '$6,000.00');
  ui.select('rate-group', 'tier-2');
  assert.equal(ui.id('base-amount').textContent, '$1,500.00');
  assert.equal(ui.doc.querySelector('input[name="multiplier"]:checked').value, '1');
  assert.equal(ui.id('manual-result').hidden, true);
  ui.select('rate-group', 'tier-3');
  assert.equal(ui.id('base-amount').textContent, '$750.00');
  ui.select('multiplier', '5');
  ui.select('program', 'eternal-private');
  assert.equal(ui.id('base-amount').textContent, '');
  assert.equal(ui.id('copy-result').disabled, true);
  assert.equal(ui.doc.querySelector('input[name="multiplier"]:checked').value, '1');
  assert.equal(ui.doc.querySelector('input[name="rate-group"]:checked'), null);
  ui.select('rate-group', 'sdk');
  assert.equal(ui.id('base-amount').textContent, '$750.00');
  assert.equal(ui.id('quote-group').textContent, 'Nugget Web SDK');
  assert.equal(ui.id('quote-program').textContent, 'Nugget');
  assert.equal(ui.id('policy-link').href, 'https://hackerone.com/eternal-private');
  assert.match(ui.id('rate-rows').textContent, /\$500–\$1,000/);
  ui.select('rate-group', 'dashboard');
  assert.equal(ui.id('base-amount').textContent, '$1,500.00');
  assert.equal(ui.id('quote-group').textContent, 'Nugget Dashboard');
  assert.match(ui.id('rate-rows').textContent, /\$1,000–\$2,000/);
  ui.select('program', 'eternal');
  assert.equal(ui.id('quote-result').hidden, true);
});

test('published USD ranges stay expanded and match all five selected policies', () => {
  const ui = setup();
  const table = ui.doc.querySelector('.rates-table');
  assert.equal(table.closest('details'), null);
  assert.equal(table.querySelector('thead th:last-child').textContent, 'Base reward (USD)');
  const expected = [
    ['eternal','tier-1',['$100–$300','$300–$1,000','$1,000–$2,000','$2,000–$4,000']],
    ['eternal','tier-2',['$100–$200','$200–$500','$500–$1,000','$1,000–$2,000']],
    ['eternal','tier-3',['$50–$100','$100–$250','$250–$500','$500–$1,000']],
    ['eternal-private','sdk',['$100–$200','$200–$300','$300–$500','$500–$1,000']],
    ['eternal-private','dashboard',['$100–$200','$200–$500','$500–$1,000','$1,000–$2,000']],
  ];
  for (const [program, group, ranges] of expected) {
    ui.select('program', program);
    ui.select('rate-group', group);
    assert.deepEqual([...table.querySelectorAll('.rate-value')].map(cell => cell.textContent), ranges);
    assert.deepEqual([...table.querySelectorAll('tbody td:first-of-type')].map(cell => cell.textContent), ['0.1–3.9','4.0–6.9','7.0–8.9','9.0–10.0']);
    ui.score('9.5');
    ui.select('multiplier', '5');
    assert.deepEqual([...table.querySelectorAll('.rate-value')].map(cell => cell.textContent), ranges);
  }
});

test('slider updates score, severity, rate highlight and calculation together', () => {
  const ui = setup();
  ui.select('rate-group', 'tier-1');
  for (const [ticks, label] of [[0,'None'],[1,'Low'],[39,'Low'],[40,'Medium'],[69,'Medium'],[70,'High'],[89,'High'],[90,'Critical'],[100,'Critical']]) {
    ui.change(ui.id('cvss-slider'), String(ticks), 'input');
    assert.equal(ui.id('cvss-score').value, (ticks/10).toFixed(1));
    assert.equal(ui.id('quote-severity').textContent, label);
    const selected = ui.doc.querySelector('tr[aria-current="true"]');
    assert.equal(selected?.dataset.severity || 'none', label.toLowerCase());
  }
  assert.equal(ui.id('base-amount').textContent, '$4,000.00');
});

test('every multiplier card applies its labeled bonus without replacing the base', () => {
  const ui = setup();
  ui.select('rate-group', 'tier-1');
  ui.score('9.5');
  const expected = [['1','$3,000.00'],['1.5','$4,500.00'],['2','$6,000.00'],['2.5','$7,500.00'],['3','$9,000.00'],['3.5','$10,500.00'],['4','$12,000.00'],['4.5','$13,500.00'],['5','$15,000.00']];
  for (const [multiplier, amount] of expected) {
    ui.select('multiplier', multiplier);
    assert.equal(ui.id('base-amount').textContent, '$3,000.00');
    assert.equal(ui.id('manual-result').hidden, multiplier === '1');
    if (multiplier !== '1') assert.equal(ui.id('adjusted-amount').textContent, amount);
  }
  ui.select('rate-group', 'tier-2');
  assert.equal(ui.id('bonus-status').textContent, 'No bonus applied');
  assert.equal(ui.doc.querySelector('input[name="multiplier"]:checked').value, '1');
});

test('asset search preserves exact identifiers and only changes tier on explicit selection', () => {
  const ui = setup();
  const dialog = ui.id('asset-dialog');
  dialog.showModal = () => dialog.setAttribute('open', '');
  dialog.close = () => dialog.removeAttribute('open');
  ui.select('rate-group', 'tier-1');
  ui.score('9.5');
  ui.select('multiplier', '2');
  ui.doc.querySelector('button[data-view-group="tier-2"]').click();
  assert.equal(dialog.open, true);
  assert.equal(ui.id('asset-dialog-list').children.length, 9);
  assert.equal(ui.id('quote-group').textContent, 'Tier 1');
  ui.change(ui.id('asset-search'), '6670536058', 'input');
  assert.equal(ui.id('asset-dialog-list').children.length, 1);
  assert.match(ui.id('asset-dialog-list').textContent, /District · iOS/);
  assert.match(ui.id('asset-dialog-list').textContent, /6670536058/);
  ui.change(ui.id('asset-search'), 'no-such-asset', 'input');
  assert.equal(ui.id('asset-search-empty').hidden, false);
  ui.change(ui.id('asset-search'), '', 'input');
  assert.equal(ui.id('asset-dialog-list').children.length, 9);
  ui.id('asset-dialog-select').click();
  assert.equal(dialog.open, false);
  assert.equal(ui.id('quote-group').textContent, 'Tier 2');
  assert.equal(ui.id('base-amount').textContent, '$1,500.00');
  assert.equal(ui.id('bonus-status').textContent, 'No bonus applied');
  assert.equal(ui.id('manual-result').hidden, true);
});

test('copy uses current program/asset; async clipboard status cannot leak into another quote', async () => {
  let copied;
  let complete;
  const ui = setup({writeClipboard: text => { copied = text; return new Promise(resolve => { complete = resolve; }); }});
  ui.select('program','eternal-private');
  ui.select('rate-group','sdk');
  ui.score('9.5');
  ui.id('copy-result').click();
  assert.match(copied, /Nugget · Nugget Web SDK/);
  assert.match(copied, /\$750.00 USD/);
  ui.select('rate-group','dashboard');
  complete();
  await Promise.resolve();
  assert.equal(ui.id('copy-status').textContent, '');
  ui.id('copy-result').click();
  assert.match(copied, /Nugget · Nugget Dashboard/);
  assert.match(copied, /\$1,500.00 USD/);
  complete();
  await Promise.resolve();
  assert.equal(ui.id('copy-status').textContent, 'Calculation copied');
});

test('clipboard failure is visible and never reports success', async () => {
  const ui = setup({writeClipboard: () => Promise.reject(new Error('denied'))});
  ui.select('rate-group','tier-1');
  ui.score('9.5');
  ui.id('copy-result').click();
  await Promise.resolve();
  assert.match(ui.id('copy-status').textContent, /Copy unavailable/);
});
