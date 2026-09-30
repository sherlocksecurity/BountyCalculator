// Published base rewards, verified against the program pages on this date.
// Campaign bonuses are deliberately not included in these base ranges.
export const VERIFIED_ON = '2026-09-30';

function freezeDeep(value) {
  for (const child of Object.values(value)) {
    if (child && typeof child === 'object') freezeDeep(child);
  }
  return Object.freeze(value);
}

export const SEVERITIES = freezeDeep([
  { id: 'low', label: 'Low', minTicks: 1, maxTicks: 39 },
  { id: 'medium', label: 'Medium', minTicks: 40, maxTicks: 69 },
  { id: 'high', label: 'High', minTicks: 70, maxTicks: 89 },
  { id: 'critical', label: 'Critical', minTicks: 90, maxTicks: 100 },
]);

export const PROGRAMS = freezeDeep([
  {
    id: 'eternal', name: 'Eternal', label: 'Public program',
    source: 'https://hackerone.com/eternal',
    description: 'Select the asset tier assigned in the Eternal program scope.',
    groupLabel: 'Asset tier',
    groups: [
      {
        id: 'tier-1', name: 'Tier 1', note: 'Core products',
        ranges: { low: [100, 300], medium: [300, 1000], high: [1000, 2000], critical: [2000, 4000] },
        scope: [
          '*.zomato.com', '*.zomans.com', '*.runnr.in', 'blinkit.com',
          '434613896 · Zomato iOS', '960335206 · Blinkit Customer iOS',
          '6670203019 · Blinkit Bistro iOS', 'com.application.zomato',
          'com.grofers.customerapp', 'com.blinkit.bistro', 'com.zomato.delivery',
          'https://mcp-server.zomato.com/mcp',
        ],
      },
      {
        id: 'tier-2', name: 'Tier 2', note: 'Extended products',
        ranges: { low: [100, 200], medium: [200, 500], high: [500, 1000], critical: [1000, 2000] },
        scope: [
          '*.blinkit.com', '*.hyperpure.com', '*.grofer.io', '*.grofers.com',
          'www.district.in', 'api2.grofers.com', 'api.grofers.com',
          'com.application.zomato.district', '6670536058 · District iOS',
        ],
      },
      {
        id: 'tier-3', name: 'Tier 3', note: 'Additional assets',
        ranges: { low: [50, 100], medium: [100, 250], high: [250, 500], critical: [500, 1000] },
        scope: ['*.district.in', '*.insider.in', '*.edition.in', '*.ticketnew.com', '*.eternal.com'],
      },
    ],
  },
  {
    id: 'eternal-private', name: 'Nugget', label: 'SDK & dashboard',
    source: 'https://hackerone.com/eternal-private',
    description: 'A new Nugget initiative, evolving with researcher feedback and findings.',
    groupLabel: 'Nugget asset',
    groups: [
      {
        id: 'sdk', name: 'Nugget Web SDK', note: 'Support-ticket integration',
        ranges: { low: [100, 200], medium: [200, 300], high: [300, 500], critical: [500, 1000] },
        scope: ['Nugget_Web_SDK'],
        scopeDescription: 'The web integration used to create support tickets. Use the testing instructions provided in the Nugget program.',
      },
      {
        id: 'dashboard', name: 'Nugget Dashboard', note: 'Eternal Tier 2 rates',
        ranges: { low: [100, 200], medium: [200, 500], high: [500, 1000], critical: [1000, 2000] },
        scope: ['Nugget Dashboard'],
        scopeDescription: 'The dashboard where tickets created through the Nugget SDK appear. Refer to the Nugget program for the authorized testing target.',
      },
    ],
  },
]);

export function getPolicy(programId, groupId) {
  const program = PROGRAMS.find(item => item.id === programId);
  if (!program) throw new RangeError('Select a valid program.');
  const group = program.groups.find(item => item.id === groupId);
  if (!group) throw new RangeError('Select an asset or tier for this program.');
  return { program, group };
}
