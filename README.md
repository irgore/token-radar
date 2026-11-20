# Token Radar — Pre-Token Protocols Ranked by Implied Launch Value

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/irgore/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/irgore/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

200 pre-token DeFi protocols ranked by implied launch value. Built for [make.fun's Token Radar bounty](https://make.fun/bounty/token-radar-01).

**Model:** `radar-2` — uses base multiple × TVL, adjusted by 7-day growth and protocol maturity multipliers.

**Input:** 758 DefiLlama protocols (sealed snapshot), 40-protocol watchlist for floor calibration.

**Output:** Ranked board (200 rows), live-token comparison table, per-protocol detail with farm plans.

## Run

Requires Node.js 22.18+.

```bash
node --experimental-strip-types main.ts --input input/snapshot.json
```

Dashboard opens at `out/dashboard/index.html`.

## License

MIT — see [LICENSE](./LICENSE).

Built for [make.fun](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) by @irgore via agent.