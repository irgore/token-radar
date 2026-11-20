// Token Radar entry — Node 22, standard library only.
// Scans a DefiLlama snapshot, ranks pre-token protocols by implied launch value,
// outputs a self-contained dashboard dossier.
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const TEXT_MAX_BYTES = 65_536;
const SCREENSHOT_CAPS = { max: 4, max_bytes: 524_288 };
const IMAGE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const withEquals = process.argv.find((a) => a.startsWith(`--${name}=`));
  return withEquals === undefined ? fallback : withEquals.slice(name.length + 3);
}

function die(code: number, msg: string): never {
  process.stderr.write(`token radar: ${msg}\n`);
  process.exit(code);
}

const inputArg = arg('input', '/input');
const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(inputFile)) die(2, `no snapshot at ${inputFile}; pass --input <file|dir>`);
const out = arg('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

const raw = readFileSync(inputFile, 'utf8');
const snapshot = parseSnapshot(raw);
process.stderr.write(`token radar: loaded ${snapshot.protocols.length} protocols (${snapshot.watchlist.length} on watchlist)\n`);

const { board, radar } = buildRadar(snapshot);
const issue = boardIssue(board, snapshot);
if (issue !== null) die(1, `model wrote a board the gate refuses: ${issue}`);

const top3 = board.slice(0, 3).map(r => `${r.name} ($${r.implied_value_usd.toLocaleString()})`).join(', ');
process.stderr.write(`token radar: ranked ${board.length} protocols — top 3: ${top3}\n`);
process.stderr.write(`token radar: ${radar.early_size} early-stage, ${radar.live_size} live tokens\n`);

mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
writeFileSync(join(out, 'data.js'), dataScript(radar));

function copyFiles(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const copied: string[] = [];
  for (const name of readdirSync(from)) {
    if (name.startsWith('.')) continue;
    const path = join(from, name);
    if (!statSync(path).isFile()) continue;
    copyFileSync(path, join(to, name));
    copied.push(name);
  }
  return copied;
}

copyFiles(join(here, 'dashboard'), join(out, 'dashboard'));
const shots = copyFiles(join(here, 'screenshots'), join(out, 'screenshots'));
if (shots.length < 3) die(1, `screenshots/ has ${shots.length} image(s); need 3: board, detail, filtered`);
for (const name of shots) {
  if (!IMAGE_NAME.test(name)) die(1, `screenshots/${name}: name must be letters, digits and . _ -`);
}

writeFileSync(join(out, 'dossier.json'), buildDossier(out, {
  text_max_bytes: TEXT_MAX_BYTES,
  screenshots: SCREENSHOT_CAPS,
  dashboard: { max_files: 400, max_bytes: 4_194_304 },
}));

process.stdout.write(
  `token radar: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} watchlist, ${board.length} rows (${radar.early_size} early, ${radar.live_size} live)\n` +
  `token radar: wrote ${join(out, 'board.json')}, data.js, dashboard (3 files), screenshots (${shots.length}), dossier.json\n`,
);