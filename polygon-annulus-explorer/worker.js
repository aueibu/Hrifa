// worker.js -- runs LatticeCore.computeClasses off the main thread so a
// large search doesn't freeze the tab. Stateless: one message in, one
// message out, per Generate click (app.js spins up a fresh worker each
// time and terminate()s it to cancel).
importScripts("core.js");

self.onmessage = (e) => {
  const { annulus, fullLattice, n, minR, checkEdges, rejectCollinear, maxCombos, roundDp } = e.data;
  try {
    const result = LatticeCore.computeClasses({
      annulus, fullLattice, n, minR, checkEdges, rejectCollinear, maxCombos, roundDp,
    });
    self.postMessage({ ok: true, result });
  } catch (err) {
    self.postMessage({ ok: false, error: err.message });
  }
};
