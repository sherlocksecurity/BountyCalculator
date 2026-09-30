import { PROGRAMS, SEVERITIES, VERIFIED_ON } from './policy.mjs?v=20260930-compact-colors';
import { MULTIPLIERS, calculateQuote, parseScore, severityForTicks, scoreLabel, formatMoney, formatRange, quoteText } from './calculator.mjs?v=20260930-compact-colors';

export function initCalculator(doc, options = {}) {
  const byId = id => doc.getElementById(id);
  const state = { programId: 'eternal', groupId: '', multiplier: '1' };
  let currentQuote = null;
  const scoreInput = byId('cvss-score');
  const slider = byId('cvss-slider');
  const assetDialog = byId('asset-dialog');
  let dialogGroupId = '';

  function textElement(tag, text, className) {
    const element = doc.createElement(tag);
    element.textContent = text;
    if (className) element.className = className;
    return element;
  }

  function program() {
    return PROGRAMS.find(item => item.id === state.programId);
  }

  function assetRow(asset) {
    const androidNames = {
      'com.application.zomato': 'Zomato · Android',
      'com.grofers.customerapp': 'Blinkit · Android',
      'com.blinkit.bistro': 'Blinkit Bistro · Android',
      'com.zomato.delivery': 'Zomato Delivery · Android',
      'com.application.zomato.district': 'District · Android',
    };
    const ios = asset.match(/^(\d+) · (.+) iOS$/);
    const name = ios ? `${ios[2]} · iOS` : androidNames[asset] ||
      (asset.startsWith('https://') ? 'Zomato MCP endpoint' : asset);
    const identifier = ios ? `App Store ID: ${ios[1]}` :
      (androidNames[asset] || asset.startsWith('https://') ? asset : '');
    const row = textElement('span', '', 'asset-row');
    row.setAttribute('role', 'listitem');
    row.append(textElement('span', name, 'asset-name'));
    if (identifier) row.append(textElement('span', identifier, 'asset-identifier'));
    return row;
  }

  function resetMultiplier() {
    state.multiplier = '1';
    for (const input of byId('multiplier-options').querySelectorAll('input')) input.checked = input.value === '1';
  }

  function renderMultiplierOptions() {
    byId('multiplier-options').replaceChildren(...MULTIPLIERS.map(value => {
      const label = textElement('label', '', 'multiplier-option');
      const input = doc.createElement('input');
      input.type = 'radio';
      input.name = 'multiplier';
      input.value = value;
      input.checked = value === state.multiplier;
      const card = textElement('span', '', 'multiplier-card');
      card.append(textElement('strong', `${value}×`), textElement('span', value === '1' ? 'No bonus' : `+${(Number(value) - 1) * 100}% bonus`));
      label.append(input, card);
      return label;
    }));
  }

  function renderGroups() {
    const selected = program();
    doc.body.dataset.program = selected.id;
    byId('group-label').textContent = selected.id === 'eternal' ? 'Select asset tier' : 'Select Nugget asset';
    byId('program-description').textContent = selected.description;
    byId('policy-link').href = selected.source;
    const labels = selected.groups.map(group => {
      const wrapper = textElement('div', '', 'group-option');
      const input = doc.createElement('input');
      input.type = 'radio';
      input.name = 'rate-group';
      input.value = group.id;
      input.id = `group-${group.id}`;
      input.checked = group.id === state.groupId;
      input.setAttribute('aria-label', group.name);
      const card = textElement('label', '', 'group-card');
      card.htmlFor = input.id;
      const summaries = { 'tier-1': 'Zomato · Blinkit · Bistro', 'tier-2': 'Blinkit · Hyperpure · District', 'tier-3': 'District · Insider · more' };
      card.append(textElement('strong', group.name), textElement('span', summaries[group.id] || group.note, 'group-note'));
      const browse = textElement('button', selected.id === 'eternal' ? `View ${group.scope.length} assets ↗` : 'View details ↗', 'view-assets');
      browse.type = 'button';
      browse.dataset.viewGroup = group.id;
      browse.setAttribute('aria-label', `View assets for ${group.name}`);
      wrapper.append(input, card, browse);
      return wrapper;
    });
    byId('group-options').replaceChildren(...labels);
    byId('group-options').style.setProperty('--group-count', String(selected.groups.length));
  }

  function filterAssets() {
    const group = program().groups.find(item => item.id === dialogGroupId);
    if (!group) return;
    const query = byId('asset-search').value.trim().toLowerCase();
    const rows = group.scope.map(assetRow).filter(row => row.textContent.toLowerCase().includes(query));
    byId('asset-dialog-list').replaceChildren(...rows);
    byId('asset-search-empty').hidden = rows.length > 0;
  }

  byId('group-options').addEventListener('click', event => {
    const button = event.target.closest('button[data-view-group]');
    if (!button) return;
    const group = program().groups.find(item => item.id === button.dataset.viewGroup);
    if (!group) return;
    dialogGroupId = group.id;
    byId('asset-dialog-title').textContent = `${program().name} · ${group.name}`;
    byId('asset-dialog-description').textContent = group.scopeDescription || 'Find your exact domain or app ID, then choose this tier.';
    byId('asset-dialog-policy').href = program().source;
    byId('asset-dialog-select').textContent = `Use ${group.name}`;
    byId('asset-search').value = '';
    filterAssets();
    assetDialog.showModal();
    byId('asset-search').focus();
  });
  byId('asset-search').addEventListener('input', filterAssets);
  byId('asset-dialog-select').addEventListener('click', () => {
    const input = byId(`group-${dialogGroupId}`);
    if (!input) return;
    input.click();
    assetDialog.close();
  });

  function renderReference(group, severity) {
    byId('rates-caption').textContent = group ? `${program().name} / ${group.name}` : `Choose ${program().id === 'eternal' ? 'an asset tier' : 'a Nugget asset'} to see its rates.`;
    byId('rate-rows').replaceChildren(...SEVERITIES.map(band => {
      const row = doc.createElement('tr');
      row.dataset.severity = band.id;
      if (severity?.id === band.id && group) {
        row.classList.add('current-severity');
        row.setAttribute('aria-current', 'true');
      }
      const name = doc.createElement('th');
      name.scope = 'row';
      name.append(textElement('span', band.label, `severity-pill ${band.id}`));
      row.append(name,
        textElement('td', `${scoreLabel(band.minTicks)}–${scoreLabel(band.maxTicks)}`),
        textElement('td', group ? formatRange(group.ranges[band.id]) : '—', 'rate-value'));
      return row;
    }));
  }

  function clearResult(message) {
    currentQuote = null;
    byId('quote-result').hidden = true;
    byId('manual-result').hidden = true;
    byId('empty-result').hidden = false;
    byId('empty-message').textContent = message;
    byId('copy-result').disabled = true;
    byId('copy-status').textContent = '';
    for (const id of ['base-amount', 'adjusted-amount', 'quote-program', 'quote-group', 'quote-severity', 'quote-score', 'quote-range', 'quote-band', 'calculation-formula', 'rounding-note']) byId(id).textContent = '';
  }

  function render() {
    byId('bonus-status').textContent = state.multiplier === '1' ? 'No bonus applied' : `${state.multiplier}× selected`;
    const group = program().groups.find(item => item.id === state.groupId);
    let ticks;
    let scoreError = '';
    if (scoreInput.value.trim() !== '') {
      try { ticks = parseScore(scoreInput.value); } catch (error) { scoreError = error.message; }
    }
    const severity = ticks === undefined ? null : severityForTicks(ticks);
    byId('score-section').dataset.severity = severity?.id || 'unset';
    scoreInput.setAttribute('aria-invalid', String(Boolean(scoreError)));
    byId('score-error').hidden = !scoreError;
    byId('score-error').textContent = scoreError;
    const pill = byId('severity-pill');
    pill.hidden = !severity;
    pill.className = `severity-pill ${severity?.id || ''}`;
    pill.textContent = severity?.label || '';
    slider.value = String(ticks ?? 0);
    slider.setAttribute('aria-valuetext', ticks === undefined ? 'No valid score entered' : `CVSS ${scoreLabel(ticks)}, ${severity.label}`);
    slider.style.setProperty('--score-progress', `${ticks ?? 0}%`);
    renderReference(group, severity);

    if (scoreError) return clearResult('Enter a valid CVSS score to calculate a bounty.');
    if (!group) return clearResult(`Choose ${program().id === 'eternal' ? 'an asset tier' : 'a Nugget asset'}${ticks === undefined ? ' and enter a CVSS score' : ''}.`);
    if (ticks === undefined) return clearResult('Enter a CVSS score to calculate the selected reward.');
    let quote;
    try { quote = calculateQuote({ ...state, score: scoreInput.value }); }
    catch (error) { return clearResult(error.message); }
    currentQuote = quote;
    byId('copy-status').textContent = '';
    byId('empty-result').hidden = true;
    byId('quote-result').hidden = false;
    byId('copy-result').disabled = false;
    byId('base-amount').textContent = formatMoney(quote.baseCents);
    byId('quote-program').textContent = quote.programName;
    byId('quote-group').textContent = quote.groupName;
    byId('quote-severity').textContent = quote.severity.label;
    byId('quote-severity').className = `severity-pill ${quote.severity.id}`;
    byId('quote-score').textContent = `CVSS ${quote.score}`;
    byId('quote-range').textContent = formatRange([quote.minimum, quote.maximum]);
    byId('quote-band').textContent = ticks === 0 ? '0.0 · None' : `${scoreLabel(quote.severity.minTicks)}–${scoreLabel(quote.severity.maxTicks)}`;
    byId('calculation-formula').textContent = ticks === 0 ? 'CVSS 0.0 has no severity and no base bounty.' :
      `${formatMoney(quote.minimum * 100)} + (${quote.score} − ${scoreLabel(quote.severity.minTicks)}) ÷ (${scoreLabel(quote.severity.maxTicks)} − ${scoreLabel(quote.severity.minTicks)}) × ${formatMoney((quote.maximum - quote.minimum) * 100)}`;
    byId('rounding-note').textContent = 'Rounded half up to the nearest USD cent. Multipliers are applied before rounding.';
    const manual = quote.multiplier !== '1';
    byId('manual-result').hidden = !manual;
    byId('manual-label').textContent = manual ? `With ${quote.multiplier}× manual multiplier` : '';
    byId('adjusted-amount').textContent = manual ? formatMoney(quote.adjustedCents) : '';
  }

  byId('program-picker').addEventListener('change', event => {
    if (!event.target.matches('input[name="program"]')) return;
    if (!PROGRAMS.some(item => item.id === event.target.value)) return;
    state.programId = event.target.value;
    state.groupId = '';
    resetMultiplier();
    renderGroups();
    render();
  });
  byId('group-options').addEventListener('change', event => {
    if (!event.target.matches('input[name="rate-group"]')) return;
    state.groupId = event.target.value;
    resetMultiplier();
    render();
  });
  scoreInput.addEventListener('input', render);
  slider.addEventListener('input', () => {
    scoreInput.value = scoreLabel(Number(slider.value));
    render();
  });
  byId('multiplier-options').addEventListener('change', event => {
    if (!event.target.matches('input[name="multiplier"]')) return;
    state.multiplier = event.target.value;
    render();
  });
  byId('copy-result').addEventListener('click', async () => {
    if (!currentQuote) return;
    const copiedQuote = currentQuote;
    const copy = options.writeClipboard || (text => {
      const clipboard = doc.defaultView?.navigator.clipboard;
      if (!clipboard) return Promise.reject(new Error('Clipboard unavailable'));
      return clipboard.writeText(text);
    });
    try {
      await copy(`${quoteText(copiedQuote)}\nRates verified: ${VERIFIED_ON}`);
      if (currentQuote === copiedQuote) byId('copy-status').textContent = 'Calculation copied';
    } catch {
      if (currentQuote === copiedQuote) byId('copy-status').textContent = 'Copy unavailable. Select the calculation text instead.';
    }
  });

  renderMultiplierOptions();
  renderGroups();
  render();
}

if (typeof document !== 'undefined') initCalculator(document);
