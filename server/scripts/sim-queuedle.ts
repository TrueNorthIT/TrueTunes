// Queuedle simulation harness.
//
// Runs N seeded days of the real generator (server/src/shared/gameGenerator.ts) against a
// realistic synthetic aggregate built from production counts, and prints the metrics the
// Queuedle requirements (Q-1..Q-4) are about.
//
// Run from server/:   npm run sim:queuedle                 (1,000 days, both data variants)
//                     npm run sim:queuedle -- --days 365   (fewer days)
//                     npm run sim:queuedle -- --variant ninetyDay
// (the script compiles with tsc -p tsconfig.sim.json, then runs the compiled output)
//
// See scripts/queuedle-sim/analysis.ts for the exact definition of a "forced" answer.

import { buildRealisticAggregate, DataVariant, totalTrackPlays } from './queuedle-sim/fixture';
import { bandFor, buildReport, findForced, simulateDays, SimReport } from './queuedle-sim/analysis';

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const pct = (x: number, dp = 1) => `${(x * 100).toFixed(dp)}%`;

function printHistogram(title: string, h: Record<string, number>, total: number): void {
  console.log(`  ${title}`);
  for (const [label, n] of Object.entries(h)) {
    console.log(`    ${label.padEnd(9)} ${String(n).padStart(6)}  ${pct(total === 0 ? 0 : n / total).padStart(6)}`);
  }
}

function printReport(variant: DataVariant, plays: number, items: string, r: SimReport, sampleForced: string[]): void {
  const totalQuestions = Object.values(r.gapHistogram).reduce((a, b) => a + b, 0);
  console.log(`\n=== ${variant}: ${r.days} days (${items}; ${plays} track plays) ===`);
  console.log(
    `  category mix:      track ${r.categoryMix.track}, artist ${r.categoryMix.artist}, album ${r.categoryMix.album}, none ${r.categoryMix.none}`,
  );
  console.log(`  lowData days:      ${pct(r.lowDataShare)}   (full 10-question games: ${pct(r.fullGameShare)})`);
  console.log(`  questions/day:     ${r.questionsPerDay.toFixed(2)}`);
  console.log(`  forced answers:    ${r.forcedCount} of ${r.asked} bridge questions = ${pct(r.forcedShare, 2)}   (Q-1 definition, min gap 2)`);
  console.log(`    forced under today's rules only (gap 1 allowed): ${r.forcedLegacyCount} = ${pct(r.forcedLegacyShare, 2)}`);
  console.log(`    by kind:         ${JSON.stringify(r.forcedByKind)}`);
  console.log(`    by bridge count: ${JSON.stringify(r.forcedByBridgeCount)}`);
  console.log(
    `  carried item wins: ${r.carry.carriedWins} of ${r.carry.questions} = ${pct(r.carry.carriedWinShare)}   (target 40-60%)`,
  );
  console.log(`  1-play gaps:       ${r.oneGapCount} of ${totalQuestions} questions = ${pct(r.oneGapShare, 2)}   (3 vs 4 specifically: ${r.threeVsFourCount})`);
  console.log(`  pair rule breaches (gap<2 or ratio outside 1.15-3): ${r.pairViolations}`);
  console.log(`  count scale (floor = lowest count shown in any game, ceiling = top count in data): ${JSON.stringify(r.ranges)}`);
  const rampTable = (title: string, st: SimReport['ramp']) => {
    console.log(`  ${title}`);
    console.log('    Q    n   meanRatio  inBand  band');
    for (const row of st.byQuestion) {
      console.log(
        `    ${String(row.question).padEnd(3)} ${String(row.n).padStart(5)}   ${row.meanRatio.toFixed(2).padStart(6)}   ${pct(row.inBandShare).padStart(6)}  ${bandFor(row.question)}`,
      );
    }
    console.log(
      `    band means: easy ${st.bandMeans.easy.toFixed(2)}, medium ${st.bandMeans.medium.toFixed(2)}, hard ${st.bandMeans.hard.toFixed(2)}; overall in-band ${pct(st.inBandShare)}`,
    );
  };
  rampTable('difficulty ramp (all days)', r.ramp);
  rampTable('difficulty ramp (track days)', r.rampByCategory.track);
  rampTable('difficulty ramp (artist days)', r.rampByCategory.artist);
  printHistogram('absolute gap histogram (all questions)', r.gapHistogram, totalQuestions);
  printHistogram('ratio histogram (all questions)', r.ratioHistogram, totalQuestions);
  if (sampleForced.length > 0) {
    console.log('  first forced examples:');
    for (const s of sampleForced) console.log(`    ${s}`);
  }
}

const days = Number(arg('days', '1000'));
const which = arg('variant', 'both');
const variants: DataVariant[] = which === 'both' ? ['allTime', 'ninetyDay'] : [which as DataVariant];

for (const variant of variants) {
  const agg = buildRealisticAggregate(variant);
  const eligible = (m: Record<string, { count: number }>) => Object.values(m).filter((x) => x.count >= 3).length;
  const items = `items with >=3 plays: ${eligible(agg.trackMap)} tracks, ${eligible(agg.artistMap)} artists, ${eligible(agg.albumMap)} albums`;
  const results = simulateDays(agg, days);
  const report = buildReport(agg, results);
  const samples = findForced(results, report.ranges)
    .slice(0, 5)
    .map((f) => `${f.seed} Q${f.questionIndex} ${f.category} bridge "${f.bridgeName}" shown as ${f.bridgeCount} vs hidden ${f.otherCount} -> ${f.kind}`);
  printReport(variant, totalTrackPlays(agg), items, report, samples);
}
