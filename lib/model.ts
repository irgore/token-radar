// Token Radar model — multi-chain aware, category-weighted, calibrated to DefiLlama TVL ranges.
// Every protocol scored by the same function, no special cases.

export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

export interface ModelConstants {
  base_multiple: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  chain_bonus: number;
  chain_max: number;
}

// Calibrated: wider spread, rewards multi-chain, penalises flat growth
export const MODEL: ModelConstants = {
  base_multiple: 0.42,
  growth_weight: 0.85,
  growth_floor: -60,
  growth_cap: 180,
  maturity_floor: 0.45,
  maturity_range: 0.55,
  maturity_days: 1095,
  unknown_age_days: 240,
  chain_bonus: 0.08,
  chain_max: 5,
};

export const MODEL_VERSION = 'radar-3';

export const EARLY_ROWS = 180;
export const LIVE_ROWS = 30;

// Category multipliers: protocols in hot verticals get a premium
const CATEGORY_MULT: Record<string, number> = {
  'yield': 1.20,
  'liquid staking': 1.15,
  'restaking': 1.25,
  'perpetuals': 1.10,
  'derivatives': 1.10,
  'rwa': 1.15,
  'dex': 1.05,
  'lending': 1.05,
  'cdp': 1.08,
  'prediction market': 1.12,
  'bridge': 1.0,
  'cross chain': 1.05,
  'oracle': 1.08,
  'nft marketplace': 0.80,
  'gaming': 0.75,
  'social': 0.70,
  'meme': 0.50,
  'privacy': 1.05,
  'insurance': 1.0,
  'stablecoin': 0.95,
  'wallet': 1.0,
  'infrastructure': 1.02,
  'dao': 0.85,
  'launchpad': 0.90,
  'liquid restaking': 1.25,
};

export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    base_multiple: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  category_multiplier: number;
  chain_multiplier: number;
}

export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
}

export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

function categoryMultiplier(category: string | null): number {
  if (category === null) return 1.0;
  const key = category.toLowerCase();
  return CATEGORY_MULT[key] ?? 1.0;
}

export function impliedValue(protocol: SnapshotProtocol, asOf: string, model: ModelConstants): {
  implied: number; growthPct: number; growthMult: number; maturityMult: number; age: number | null; catMult: number; chainMult: number;
} {
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult = model.maturity_floor +
    (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const catMult = categoryMultiplier(protocol.category);
  const chainCount = Math.min(protocol.chains.length, model.chain_max);
  const chainMult = 1 + chainCount * model.chain_bonus;
  const base = protocol.tvl_usd * model.base_multiple;
  const implied = Math.max(1, Math.round(base * growthMult * maturityMult * catMult * chainMult));
  return { implied, growthPct, growthMult, maturityMult, age, catMult, chainMult };
}

const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
}

function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, EARLY_ROWS);
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => {
    const { implied, growthPct, growthMult, maturityMult, age, catMult, chainMult } = impliedValue(p, snapshot.as_of, model);
    return { p, implied, growthPct, growthMult, maturityMult, age, catMult, chainMult };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.age,
    implied_value_usd: s.implied,
    model: {
      base_multiple: model.base_multiple,
      growth_pct: s.growthPct,
      growth_multiplier: round4(s.growthMult),
      maturity_multiplier: round4(s.maturityMult),
      category_multiplier: round4(s.catMult),
      chain_multiplier: round4(s.chainMult),
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age).map(stepText),
  }));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 200;
  if (p.tvl_usd >= 1_000_000_000) return 100;
  if (p.tvl_usd >= 100_000_000) return 75;
  return 40;
}

function holdDaysFor(age: number | null): number {
  if (age === null) return 35;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('restak') || c.includes('liquid restak'))
    return `Restake $${capital} through ${name} on ${chain} using a native or LST asset. Keep APR records each week to compare against competitive restaking pools.`;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral'))
    return `Supply $${capital} USDC to ${name} on ${chain}, open a small borrow position (20-30% LTV), and repay interest weekly to maintain good standing.`;
  if (c.includes('yield') || c.includes('leveraged farm'))
    return `Supply $${capital} of paired liquidity (50:50 with USDC) to ${name}'s highest-APR pool on ${chain} and compound rewards bi-weekly.`;
  if (c.includes('dex'))
    return `Provide $${capital} USDC liquidity to a ${name} pool on ${chain} with >$1M TVL and active weekly volume. Avoid pools where single-LP share exceeds 25%.`;
  if (c.includes('bridge'))
    return `Bridge $${capital} USDC via ${name} between ${chain} and one other supported chain. Complete at least 3 cross-chain transfers over the farming period.`;
  if (c.includes('staking') || c.includes('liquid staking'))
    return `Stake $${capital} worth of ${name}'s liquid staking token on ${chain} and hold the receipt. Monitor the unbonding period before committing.`;
  if (c.includes('perpetual') || c.includes('derivative'))
    return `Deposit $${capital} USDC as trading margin on ${name} (${chain}), open a delta-neutral small hedge, and close positions that drift >5% from neutral.`;
  if (c.includes('prediction'))
    return `Fund $${capital} USDC and place one directional position on ${name}'s most liquid prediction market. Close at resolution, win or lose.`;
  if (c.includes('curator') || c.includes('allocator'))
    return `Deposit $${capital} into ${name}'s curated vault on ${chain} and hold the vault receipt tokens until at least two rebalance cycles complete.`;
  if (c.includes('stable'))
    return `Mint $${capital} of ${name}'s stablecoin on ${chain}, hold it in a non-custodial wallet, and test redemption and mint at least once during the farming window.`;
  if (c.includes('rwa'))
    return `Allocate $${capital} into ${name}'s on-chain RWA product on ${chain}. Verify the underlying asset custody report at least once during the hold period.`;
  if (c.includes('insurance'))
    return `Purchase $${capital} of risk cover from ${name} on ${chain} for a protocol you actually use — the cover must have a defined claims window.`;
  if (c.includes('oracle'))
    return `Run a ${name} data reporter node or stake $${capital} toward ${name}'s data validation on ${chain} for the full farming period.`;
  if (c.includes('privacy'))
    return `Deposit $${capital} into a ${name} shielded pool on ${chain}, hold for the full farming window, then withdraw through a fresh address.`;
  return `Deposit $${capital} USDC into ${name} on ${chain} and maintain an active position for the duration. Complete at least one protocol-native action (swap, stake, vote) per week.`;
}

export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const action = actionFor(p, capital, chain);
  const c = (p.category ?? '').toLowerCase();
  const steps: FarmStep[] = [
    {
      text: `Create a new wallet dedicated to ${p.name} farming. Keep the seed phrase offline and fund it with exactly the capital needed.`,
      cost: 'under $3 for gas on the first transaction',
      time: '5 minutes',
    },
    {
      text: action,
      cost: `$${capital} of capital and about $${capital >= 100 ? 6 : 4} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: `Perform at least one qualifying interaction each week — deposit, swap, borrow, or vote — to signal active use.`,
      cost: 'about $2 of gas per week',
      time: '10 minutes per week',
    },
    {
      text: `Hold the position for at least ${hold} days so your activity appears in multiple snapshots and on-chain records.`,
      cost: `the $${capital} stays deployed in the position`,
      time: `${hold} days`,
    },
  ];
  if (c.includes('dex') || c.includes('lend')) {
    steps.push({
      text: `Track your position's health weekly: check the pool depth or loan-to-value ratio and adjust if necessary.`,
      cost: 'no gas unless you adjust',
      time: '5 minutes per check',
    });
  }
  steps.push({
    text: `Before withdrawing, visit the protocol's official points or rewards page and claim only through links it publishes.`,
    cost: 'no fee to check; never pay anyone to claim',
    time: '10 minutes',
  });
  steps.push({
    text: `Log every transaction, date and wallet in a farm journal so you can repeat what worked or unwind safely.`,
    cost: 'nothing but the record',
    time: '5 minutes',
  });
  return steps;
}

export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    category_multiplier: (row.model as any).category_multiplier ?? 1.0,
    chain_multiplier: (row.model as any).chain_multiplier ?? 1.0,
  };
}

export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): {
  board: BoardRow[]; radar: RadarData;
} {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
}

export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw))
    throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of))
    throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0)
    throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string'))
    throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v))
      throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd))
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return { as_of: o.as_of, source: o.source, floor_usd: o.floor_usd, protocols, watchlist: o.watchlist as string[] };
}

export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++)
    if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd)
      return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd)
    return `all ${board.length} rows share the same implied value — a board that ranks nothing is not a ranking`;
  for (const r of board) {
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return `${r.slug} has ${r.farm_steps.length} farm steps`;
    for (const s of r.farm_steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0)
      return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}