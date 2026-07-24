// worker.js -- scans one rank range [startRank, endRank) of the combination
// space off the main thread. app.js splits a search across several of these
// (one per available core) and merges the results, so the search itself
// runs in parallel, not just off the UI thread. Stateless: one message in,
// one message out; app.js spins up a fresh batch of workers per Generate
// click and terminate()s all of them to cancel.
importScripts("core.js");

self.onmessage = (e) => {
  const { annulus, fullLattice, n, minR, checkEdges, rejectCollinear, roundDp, startRank, endRank } = e.data;
  try {
    const { totalValid, properMap } = LatticeCore.scanRange({
      annulus, fullLattice, n, minR, checkEdges, rejectCollinear, roundDp, startRank, endRank,
    });
    self.postMessage({ ok: true, totalValid, properMap });
  } catch (err) {
    self.postMessage({ ok: false, error: err.message });
  }
};
