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
  ui.change(ui.id('multiplier'), '2');
  assert.equal(ui.id('base-amount').textContent, '$3,000.00');
  assert.equal(ui.id('adjusted-amount').textContent, '$6,000.00');
  ui.select('rate-group', 'tier-2');
  assert.equal(ui.id('base-amount').textContent, '$1,500.00');
  assert.equal(ui.id('multiplier').value, '1');
  assert.equal(ui.id('manual-result').hidden, true);
  ui.select('rate-group', 'tier-3');
  assert.equal(ui.id('base-amount').textContent, '$750.00');
  ui.change(ui.id('multiplier'), '5');
  ui.select('program', 'eternal-private');
  assert.equal(ui.id('base-amount').textContent, '');
  assert.equal(ui.id('copy-result').disabled, true);
  assert.equal(ui.id('multiplier').value, '1');
  assert.equal(ui.doc.querySelector('input[name="rate-group"]:checked'), null);
  ui.select('rate-group', 'sdk');
  assert.equal(ui.id('base-amount').textContent, '$750.00');
  assert.equal(ui.id('quote-group').textContent, 'Nugget Web SDK');
  assert.equal(ui.id('quote-program').textContent, 'Eternal Private');
  assert.equal(ui.id('policy-link').href, 'https://hackerone.com/eternal-private');
  assert.match(ui.id('rate-rows').textContent, /\$500–\$1,000/);
  ui.select('rate-group', 'dashboard');
  assert.equal(ui.id('base-amount').textContent, '$1,500.00');
  assert.equal(ui.id('quote-group').textContent, 'Nugget Dashboard');
  assert.match(ui.id('rate-rows').textContent, /\$1,000–\$2,000/);
  ui.select('program', 'eternal');
  assert.equal(ui.id('quote-result').hidden, true);
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

test('copy uses current program/asset; async clipboard status cannot leak into another quote', async () => {
  let copied;
  let complete;
  const ui = setup({writeClipboard: text => { copied = text; return new Promise(resolve => { complete = resolve; }); }});
  ui.select('program','eternal-private');
  ui.select('rate-group','sdk');
  ui.score('9.5');
  ui.id('copy-result').click();
  assert.match(copied, /Eternal Private · Nugget Web SDK/);
  assert.match(copied, /\$750.00 USD/);
  ui.select('rate-group','dashboard');
  complete();
  await Promise.resolve();
  assert.equal(ui.id('copy-status').textContent, '');
  ui.id('copy-result').click();
  assert.match(copied, /Eternal Private · Nugget Dashboard/);
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
