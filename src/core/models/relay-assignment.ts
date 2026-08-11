/**
 * Relay team assignment (E10 Phase 3). Given a forked/looped course and relay
 * settings (teams × legs), assign each (team, leg) cell a specific variation so a
 * mass-started field splits up and no team can follow another.
 *
 * This is a **faithful port of the fairness behaviour** of PurplePen's
 * `RelayVariations` (petergolde/PurplePen), adapted from PP's recursive fork TREE
 * to Overprint's FLAT generator list (ADR-017): `Course.variations` is a set of
 * independent generators along the trunk, so PP's per-fork scoring — which has no
 * cross-fork interaction term — ports directly over the flat list. A leg
 * assignment is a **choice vector** (one int per generator: a branch index for a
 * fork, a permutation RANK for a loop), identical in meaning to an enumerated
 * `Variation`, so `variationCode` yields codes byte-identical to the Variations
 * picker.
 *
 * Determinism: reproducible **within Overprint across runs/platforms** via a fixed
 * seed. It is NOT bit-identical to PurplePen — a different PRNG family, and PP's
 * loop shuffle vs our uniform-rank draw — so a `.ppen` and Overprint will not
 * produce the same grid (they never could). That is expected and fine.
 *
 * Faithful quirks reproduced from PP (see inline notes):
 * - Loops are EXCLUDED from cross-team branch-following (Check 1); their fairness
 *   comes from the within-team loop validation + the whole-leg duplicate penalty.
 * - The ×3 "first generator" boost is consumed even by a leading loop, so a fork
 *   after a leading loop does not get it.
 * - Per-fork branch usage within a team is a hard multiset (floor(L/k) + bias to
 *   the first L%k branches) — the same bias the uneven-division warning reports.
 *
 * Pure and dependency-light (no store/geometry). `minUniquePathsByLeg` collapses
 * to `totalVariations` for every leg — **provably exact** for the flat, unpinned
 * model (PP's CalcMinUniquePaths reduces to ∏dims with no nesting/pinning); this
 * must become per-leg if fixed-branch pinning is ever added.
 */
import type { Control, Course, RelaySettings } from './types';
import type { ControlId } from '@/utils/id';
import {
  factorial,
  nthPermutation,
  resolveGenerators,
  variationCode,
  type ResolvedGenerator,
} from './variation-enumerator';

/** PurplePen's fixed PRNG seed, kept for provenance (output still differs — different PRNG). */
const RELAY_SEED = 8713527;

/** A per-team assignment: one variation code per leg (index 0 = leg 1). */
export interface TeamAssignment {
  teamNumber: number;
  /** `legs[l]` is the variation code for leg l+1 ('' when the course has no variations). */
  legs: string[];
}

/** A warning that a fork's branches don't divide evenly across the legs. */
export interface RelayWarning {
  kind: 'unevenDivision';
  /** Control code at the fork anchor. */
  anchorCode: number;
  /** Legs on the busier branches, and their labels. */
  moreLegs: number;
  moreLabels: string[];
  /** Legs on the quieter branches, and their labels. */
  lessLegs: number;
  lessLabels: string[];
}

export interface RelayAssignment {
  teams: TeamAssignment[];
  /** Total distinct variations of the course (∏ generator dims; 1 if none). */
  totalVariations: number;
  warnings: RelayWarning[];
}

/** Small, fast, seedable PRNG (mulberry32). Deterministic per seed. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A leg assignment: choice[g] = branch index (fork) or permutation rank (loop). */
type Choice = number[];

/** Whole-leg equality: every generator's choice matches (PP LegEquals). */
function legEquals(a: Choice, b: Choice): boolean {
  for (let g = 0; g < a.length; g++) if (a[g] !== b[g]) return false;
  return true;
}

/** Two teams are identical iff every leg matches (PP TeamAssignment.Equals). */
function teamEquals(a: Choice[], b: Choice[]): boolean {
  if (a.length !== b.length) return false;
  for (let l = 0; l < a.length; l++) if (!legEquals(a[l]!, b[l]!)) return false;
  return true;
}

/**
 * The cycling multiset of branch indices for a fork: `[0,1,…,k-1,0,1,…]` of length
 * `legs` (PP GetPossibleBranches). Removing one occurrence per earlier leg's pick
 * makes each team's per-branch usage exactly `floor(L/k) + (b < L%k ? 1 : 0)`.
 */
function possibleBranches(k: number, legs: number): number[] {
  const result: number[] = [];
  let branch = 0;
  for (let i = 0; i < legs; i++) {
    result.push(branch);
    branch = (branch + 1) % k;
  }
  return result;
}

/** Remove the first occurrence of `value` from `arr` (in place). */
function removeFirst(arr: number[], value: number): void {
  const i = arr.indexOf(value);
  if (i >= 0) arr.splice(i, 1);
}

interface RelayContext {
  generators: ResolvedGenerator[];
  legs: number;
  totalVariations: number;
  rng: () => number;
}

/** `Math.floor(rng() * n)` — PP's `random.Next(n)`. */
function randInt(rng: () => number, n: number): number {
  return Math.floor(rng() * n);
}

/**
 * Loop-ordering validity for a team (PP ValidateLoopAssignment), on the DECODED
 * order: (1) the first loop differs across the first `k` legs; (2) a whole ordering
 * repeats at most `floor(leg / k!)` times. Both best-effort (caller gives up after
 * 200 tries), so tests treat them as seed-stable, not universal invariants.
 */
function validateLoop(
  order: number[],
  rank: number,
  gen: ResolvedGenerator,
  leg: number,
  teamLegs: Choice[],
  g: number,
): boolean {
  const k = gen.fork.branches.length;
  // Restriction 1: first loop must be new for the first k legs.
  if (leg < k) {
    for (let other = 0; other < leg; other++) {
      const otherRank = teamLegs[other]![g]!;
      if (nthPermutation(k, otherRank)[0] === order[0]) return false;
    }
  }
  // Restriction 2: the whole ordering repeats at most floor(leg / k!) times.
  const maxDups = Math.floor(leg / factorial(k));
  let dups = 0;
  for (let other = 0; other < leg; other++) {
    if (teamLegs[other]![g] === rank) dups++;
  }
  return dups <= maxDups;
}

/** Build one leg's choice vector (PP AddForkToTeamAssignment across all forks). */
function buildLegChoice(ctx: RelayContext, leg: number, teamLegs: Choice[]): Choice {
  const choice: Choice = new Array<number>(ctx.generators.length);
  for (let g = 0; g < ctx.generators.length; g++) {
    const gen = ctx.generators[g]!;
    if (gen.fork.kind === 'fork') {
      const k = gen.fork.branches.length;
      const pool = possibleBranches(k, ctx.legs);
      // Prefer branches this team's earlier legs haven't used (round-robin).
      for (let i = 0; i < leg; i++) removeFirst(pool, teamLegs[i]![g]!);
      choice[g] = pool[randInt(ctx.rng, pool.length)]!;
    } else {
      const k = gen.fork.branches.length;
      let rank = 0;
      let order: number[] = [];
      let count = 0;
      do {
        rank = randInt(ctx.rng, gen.dim);
        order = nthPermutation(k, rank);
        count++;
      } while (count < 200 && !validateLoop(order, rank, gen, leg, teamLegs, g));
      choice[g] = rank;
    }
  }
  return choice;
}

/**
 * Score a leg's assignment against accepted teams and this team's earlier legs
 * (PP ScoreLegAssignment). 0 = perfect; higher = more following.
 */
function scoreLeg(
  ctx: RelayContext,
  leg: number,
  teamLegs: Choice[],
  accepted: Choice[][],
): number {
  let score = 0;
  const current = teamLegs[leg]!;

  // Check 1: cross-team per-fork following. Loops are EXCLUDED (PP: numNonFixedBranches=0),
  // but a leading loop still consumes the ×3 first-generator boost.
  let firstGenerator = true;
  for (let g = 0; g < ctx.generators.length; g++) {
    const gen = ctx.generators[g]!;
    if (gen.fork.kind === 'loop') {
      firstGenerator = false;
      continue;
    }
    const k = gen.fork.branches.length;
    const allowed = Math.floor((1.17 * accepted.length) / k);
    let similar = 0;
    for (const team of accepted) if (team[leg]![g] === current[g]) similar++;
    let penalty = Math.max(0, similar - allowed);
    if (firstGenerator) penalty *= 3;
    if (leg === 0) penalty *= 3;
    score += penalty;
    firstGenerator = false;
  }

  // Check 2: cross-team whole-leg duplication.
  let allowedDuplicates = Math.floor(accepted.length / ctx.totalVariations);
  if (allowedDuplicates >= 1) allowedDuplicates += Math.ceil(allowedDuplicates / 3);
  let duplicates = 0;
  for (const team of accepted) if (legEquals(team[leg]!, current)) duplicates++;
  score += 10 * Math.max(0, duplicates - allowedDuplicates);

  // Check 3: within-team distinctness (only when enough distinct paths exist).
  if (ctx.legs <= ctx.totalVariations) {
    for (let other = 0; other < leg; other++) {
      if (legEquals(teamLegs[other]!, current)) score += 100;
    }
  }

  return score;
}

/**
 * Add a leg with a low score, returning the score (PP AddLegToTeamAssignment).
 * Accepts the CURRENT candidate meeting a budgeted threshold (not the best seen),
 * exactly as PP does. Mutates `teamLegs` — leaves the accepted choice at `[leg]`.
 */
function addLeg(
  ctx: RelayContext,
  leg: number,
  teamLegs: Choice[],
  accepted: Choice[][],
): number {
  let minScore = Number.POSITIVE_INFINITY;
  for (let count = 0; ; count++) {
    teamLegs[leg] = buildLegChoice(ctx, leg, teamLegs);
    const score = scoreLeg(ctx, leg, teamLegs, accepted);
    if (score === 0) return score;
    if (score <= minScore && count > 20) return score;
    if (score <= (minScore * 4) / 3 && count > 50) return score;
    if (score <= minScore * 2 && count > 75) return score;
    if (count > 100) return score;
    minScore = Math.min(minScore, score);
    teamLegs.pop(); // reject; retry (PP RemoveForkFromTeamAssignment)
  }
}

/** Build a whole team leg-by-leg, tracking its total score (PP GeneratePotentialTeam). */
function generatePotentialTeam(
  ctx: RelayContext,
  accepted: Choice[][],
): { legs: Choice[]; score: number } {
  const legs: Choice[] = [];
  let score = 0;
  for (let leg = 0; leg < ctx.legs; leg++) {
    score += addLeg(ctx, leg, legs, accepted);
  }
  return { legs, score };
}

/**
 * Best-of-100 team selection (PP GenerateTeam): primary objective minimise exact
 * duplicate teams vs already-accepted; secondary minimise following score. Ported
 * control flow verbatim, including the i>=10 tie-return and i>25 dup-free break.
 */
function generateTeam(ctx: RelayContext, accepted: Choice[][]): Choice[] {
  let minDupCount = Number.POSITIVE_INFINITY;
  let minTotalScore = Number.POSITIVE_INFINITY;
  let minTeam: Choice[] | null = null;

  for (let i = 0; i < 100; i++) {
    const team = generatePotentialTeam(ctx, accepted);
    let countDups = 0;
    for (const t of accepted) if (teamEquals(t, team.legs)) countDups++;

    if (countDups < minDupCount) {
      minDupCount = countDups;
      minTotalScore = team.score;
      minTeam = team.legs;
    } else if (countDups === minDupCount && team.score <= minTotalScore) {
      if (team.score === minTotalScore && i >= 10) return team.legs;
      minTotalScore = team.score;
      minTeam = team.legs;
    }

    if (countDups === 0 && team.score === 0) return team.legs;
    if (countDups === 0 && i > 25) break;
  }

  return minTeam!;
}

/** Clamp to a non-negative integer with a floor (PP settings are always sane ints). */
function clampInt(value: number, min: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.floor(value));
}

/** Uneven-division warnings — fork generators only (loops never warn: all loops are run). */
function branchWarnings(
  generators: ResolvedGenerator[],
  course: Course,
  controls: Record<ControlId, Control>,
  legs: number,
): RelayWarning[] {
  const warnings: RelayWarning[] = [];
  for (const gen of generators) {
    if (gen.fork.kind !== 'fork') continue;
    const k = gen.fork.branches.length;
    const more = legs % k;
    if (more === 0) continue;
    const legsPerBranch = Math.floor(legs / k);
    const labels = gen.fork.branches.map((b) => b.label);
    const anchorCC = course.controls[gen.anchorIndex]!;
    warnings.push({
      kind: 'unevenDivision',
      anchorCode: controls[anchorCC.controlId]?.code ?? 0,
      moreLegs: legsPerBranch + 1,
      moreLabels: labels.slice(0, more),
      lessLegs: legsPerBranch,
      lessLabels: labels.slice(more),
    });
  }
  return warnings;
}

/**
 * Assign relay variations to `teams × legs`. Returns one code per (team, leg).
 * A course with no usable generators yields all-`''` cells; `teams === 0` yields
 * an empty team list.
 */
export function assignRelayTeams(
  course: Course,
  controls: Record<ControlId, Control>,
  settings: RelaySettings,
): RelayAssignment {
  const { generators } = resolveGenerators(course);
  const dims = generators.map((g) => g.dim);
  const totalVariations = dims.reduce((acc, d) => acc * d, 1);

  const teams = clampInt(settings.teams, 0);
  const legs = clampInt(settings.legs, 1);
  const firstTeamNumber = clampInt(settings.firstTeamNumber, 0);

  const warnings = branchWarnings(generators, course, controls, legs);

  // No teams configured, or an unforked course → nothing to scramble.
  if (teams === 0) {
    return { teams: [], totalVariations, warnings };
  }
  if (generators.length === 0) {
    const emptyLegs = new Array<string>(legs).fill('');
    return {
      teams: Array.from({ length: teams }, (_, t) => ({
        teamNumber: firstTeamNumber + t,
        legs: [...emptyLegs],
      })),
      totalVariations,
      warnings,
    };
  }

  const ctx: RelayContext = {
    generators,
    legs,
    totalVariations,
    rng: mulberry32(RELAY_SEED),
  };

  const accepted: Choice[][] = [];
  const result: TeamAssignment[] = [];
  for (let t = 0; t < teams; t++) {
    const teamLegs = generateTeam(ctx, accepted);
    accepted.push(teamLegs);
    result.push({
      teamNumber: firstTeamNumber + t,
      legs: teamLegs.map((choice) => variationCode(generators, choice)),
    });
  }

  return { teams: result, totalVariations, warnings };
}
