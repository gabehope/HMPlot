// Reads the temporary driver's JSON only; no browser, GPU, or production edits.
import { readFile, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { createHash } from 'node:crypto';
const source = process.argv[2];
if (!source) throw Error('Pass the raw summary.json path.');
const bytes = await readFile(source), raw = JSON.parse(bytes);
const percentile = (values, at) => {
  if (!values.length) return null;
  const sorted = values.toSorted((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * at))];
};
const unionLength = intervals => {
  const sorted = intervals.toSorted((a, b) => a[0] - b[0]);
  let total = 0, start, end;
  for (const interval of sorted) {
    if (end === undefined || interval[0] > end) {
      if (end !== undefined) total += end - start;
      [start, end] = interval;
    } else end = Math.max(end, interval[1]);
  }
  return total + (end === undefined ? 0 : end - start);
};
const report = { source: basename(source), summarySHA256: createHash('sha256').update(bytes).digest('hex'), sourceFingerprint: raw.sourceFingerprint,
  sourceVerification: raw.sourceVerification, browser: raw.browser,
  limitation: 'Observer records host timestamps and allocations. Awaited spans overlap, include CPU construction/GPU waits, and do not measure GPU kernel time or establish a speed gain.',
  flights: raw.samples.map(sample => {
    const events = sample.extentFlush ?? [], flushes = events.filter(event => event.type === 'flush');
    const starts = events.filter(event => event.type === 'read-start');
    const ends = new Map(events.filter(event => event.type === 'read-end').map(event => [event.group, event]));
    const intervals = starts.filter(start => ends.has(start.group)).map(start => [start.at, ends.get(start.group).at]);
    const queue = starts.flatMap(start => start.columns.map(column => start.at - column.arrived));
    const wait = intervals.map(([start, end]) => end - start);
    const owners = Object.fromEntries([...new Set(flushes.map(flush => flush.owner))].map(owner => {
      const own = flushes.filter(flush => flush.owner === owner);
      return [owner, { flushes: own.length, reads: own.reduce((count, flush) => count + flush.groups, 0),
        multipleMaskGroups: own.filter(flush => flush.groups > 1).length,
        groupsHistogram: Object.fromEntries([...new Set(own.map(flush => flush.groups))].map(groups =>
          [groups, own.filter(flush => flush.groups === groups).length])) }];
    }));
    return { flight: sample.flight, direction: sample.direction, markWork: sample.markWork,
      ownerFlushes: flushes.length, readsStarted: starts.length,
      readsCompleted: intervals.length, multipleMaskOwnerFlushes: flushes.filter(flush => flush.groups > 1).length,
      alreadyReadyReadMergeUpperBound: flushes.reduce((count, flush) => count + flush.groups - 1, 0),
      multipleMaskGroups: flushes.filter(flush => flush.groups > 1).map(flush => ({
        groups: flush.groups,
        relativeToFirstReadMs: flush.at - (starts[0]?.at ?? flush.at),
        reads: starts.filter(start => start.flush === flush.flush && start.owner === flush.owner).map(start => ({
          mask: start.mask, requests: start.requests,
          shapes: start.columns.map(column => column.shape),
          readAwaitMs: ends.has(start.group) ? ends.get(start.group).at - start.at : null,
        })),
      })),
      owners, queuedRequests: events.filter(event => event.type === 'arrival').length,
      cacheHits: events.filter(event => event.type === 'cache-hit').length,
      requestsPerRead: { p50: percentile(starts.map(start => start.requests), .5),
        p95: percentile(starts.map(start => start.requests), .95) },
      readyToReadMs: { p50: percentile(queue, .5), p95: percentile(queue, .95), max: Math.max(0, ...queue) },
      readAwaitMs: { p50: percentile(wait, .5), p95: percentile(wait, .95),
        sumOverlapping: wait.reduce((total, value) => total + value, 0), union: unionLength(intervals) },
      errors: sample.errors, renderError: sample.renderError };
  }) };
const text = JSON.stringify(report, null, 2);
if (process.argv[3]) await writeFile(process.argv[3], text + '\n');
else console.log(text);
