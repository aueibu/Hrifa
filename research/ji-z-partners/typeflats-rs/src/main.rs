//! typeflats-rs (2026-11-25): Rust port of typeflats.py, the complete search for universal k-note Z-pair
//! types (see typeflats.py and PROGRESS "Theory: universal types" for the argument).
//!
//! Flats of the arrangement "interval u of P = s * interval v of Q" in coordinates (p_1..p_{k-1}, q_1..q_{k-1}),
//! root p_1 - p_0 = q_1 - q_0. Bad (pruned, inherited): two notes of a set coincide, or Q = +-P + t; also (option
//! --f2, sound) sum(P intervals^2) - sum(Q intervals^2) definite on the flat. Type: the contained edges have a
//! perfect matching. Descent: along edges from the cheapest Hall violator. Dedup up to relabeling / mirror /
//! swap by a canonical certificate (individualization-refinement on the notes of the two sets).
//!
//! Exact integer arithmetic: a flat is stored as its reduced row echelon basis with each row scaled to primitive
//! integers (pivot positive), a canonical form of the subspace. Any overflow panics (checked ops), except in the
//! --f2 test, where an overflow just means "do not prune" (sound).
//!
//! usage: typeflats-rs K [--threads T] [--frontier F] [--state DIR] [--out FILE.json] [--min-free-gb G]
//!                       [--no-canon] [--no-f2] [--single] [--max-nodes N] [--min-dim D]
//! --single: one thread, the exact traversal order of typeflats.py (node counts comparable with it).
//! --min-dim D: find only types of dimension >= D (sound for those: flats below D are never entered). D = 2
//! finds every rank >= 2 type; the rank-1 (single-line) types are then left to a 1-D enumeration by span.

use std::collections::hash_map::DefaultHasher;
use std::collections::{HashMap, HashSet, VecDeque};
use std::hash::{Hash, Hasher};
use std::io::{BufRead, Write};
use std::sync::atomic::{AtomicBool, AtomicU64, AtomicUsize, Ordering};
use std::sync::Mutex;
use std::time::Instant;

type Basis = Vec<Vec<i64>>;

fn gcd(a: i128, b: i128) -> i128 {
    let (mut a, mut b) = (a.abs(), b.abs());
    while b != 0 {
        let t = a % b;
        a = b;
        b = t;
    }
    a
}

fn mul(a: i128, b: i128) -> i128 {
    a.checked_mul(b).expect("integer overflow (mul)")
}
fn sub(a: i128, b: i128) -> i128 {
    a.checked_sub(b).expect("integer overflow (sub)")
}

fn primitive(r: &mut [i128]) {
    let g = r.iter().fold(0i128, |g, &x| gcd(g, x));
    if g > 1 {
        for x in r.iter_mut() {
            *x /= g;
        }
    }
}

/// canonical basis of the row space: reduced echelon form, rows primitive integers, pivots positive
fn rref(mut rows: Vec<Vec<i128>>, n: usize) -> Basis {
    let mut r = 0;
    for c in 0..n {
        if r == rows.len() {
            break;
        }
        let Some(p) = (r..rows.len()).find(|&i| rows[i][c] != 0) else { continue };
        rows.swap(r, p);
        for i in 0..rows.len() {
            if i != r && rows[i][c] != 0 {
                let a = rows[r][c];
                let b = rows[i][c];
                for j in 0..n {
                    rows[i][j] = sub(mul(rows[i][j], a), mul(rows[r][j], b));
                }
                primitive(&mut rows[i]);
            }
        }
        r += 1;
    }
    rows.truncate(r);
    rows.iter_mut()
        .map(|row| {
            primitive(row);
            if let Some(&f) = row.iter().find(|&&x| x != 0) {
                if f < 0 {
                    for x in row.iter_mut() {
                        *x = -*x;
                    }
                }
            }
            row.iter().map(|&x| i64::try_from(x).expect("basis entry exceeds i64")).collect()
        })
        .collect()
}

fn h128<T: Hash + ?Sized>(x: &T) -> u128 {
    let mut a = DefaultHasher::new();
    0x5au8.hash(&mut a);
    x.hash(&mut a);
    let mut b = DefaultHasher::new();
    0xa5u8.hash(&mut b);
    x.hash(&mut b);
    ((a.finish() as u128) << 64) | b.finish() as u128
}

type Pt = Vec<i64>;

struct Analysis {
    p: Vec<Pt>,
    q: Vec<Pt>,
    adj: Vec<Vec<(usize, i8)>>,
}

struct Search {
    k: usize,
    n: usize,
    pairs: Vec<(usize, usize)>,
    np: usize,
    use_canon: bool,
    f2: bool,
    /// smallest dimension of a type flat to look for: flats below it are never entered (sound for types of at
    /// least this dimension: every flat on a descent to a type contains it, so has at least its dimension)
    min_dim: usize,
}

/// shared state of a parallel run
struct Shared {
    shards: Vec<Mutex<HashSet<u128>>>,
    nodes: AtomicU64,
    freeze: AtomicBool,
}

impl Shared {
    fn new() -> Self {
        Shared { shards: (0..256).map(|_| Mutex::new(HashSet::new())).collect(), nodes: AtomicU64::new(0), freeze: AtomicBool::new(false) }
    }
    /// true if this canonical class is new (claimed now); frozen: true unless already present
    fn claim(&self, key: u128) -> bool {
        let mut s = self.shards[(key as usize) & 255].lock().unwrap();
        if self.freeze.load(Ordering::Relaxed) {
            !s.contains(&key)
        } else {
            s.insert(key)
        }
    }
    fn len(&self) -> usize {
        self.shards.iter().map(|s| s.lock().unwrap().len()).sum()
    }
}

#[derive(Default)]
struct Stats {
    nodes: u64,
    bad: u64,
    f2cut: u64,
    dup: u64,
}

impl Search {
    fn new(k: usize, use_canon: bool, f2: bool, min_dim: usize) -> Self {
        let mut pairs = vec![];
        for i in 0..k {
            for j in i + 1..k {
                pairs.push((i, j));
            }
        }
        let np = pairs.len();
        Search { k, n: 2 * (k - 1), pairs, np, use_canon, f2, min_dim: min_dim.max(1) }
    }

    fn point(&self, b: &Basis, side: usize, i: usize) -> Pt {
        if i == 0 {
            return vec![0; b.len()];
        }
        let x = side * (self.k - 1) + i - 1;
        b.iter().map(|r| r[x]).collect()
    }

    fn analyse(&self, b: &Basis) -> Option<Analysis> {
        let k = self.k;
        let p: Vec<Pt> = (0..k).map(|i| self.point(b, 0, i)).collect();
        let q: Vec<Pt> = (0..k).map(|i| self.point(b, 1, i)).collect();
        let ps: HashSet<&Pt> = p.iter().collect();
        let qs: HashSet<&Pt> = q.iter().collect();
        if ps.len() < k || qs.len() < k {
            return None;
        }
        for s in [1i64, -1] {
            for t in &q {
                let img: HashSet<Pt> = p.iter().map(|x| x.iter().zip(t).map(|(a, b)| s * a + b).collect()).collect();
                if img.len() == k && img.iter().all(|x| qs.contains(x)) {
                    return None;
                }
            }
        }
        let diff = |pts: &Vec<Pt>, (i, j): (usize, usize)| -> Pt { pts[j].iter().zip(&pts[i]).map(|(b, a)| b - a).collect() };
        let mut idx: HashMap<Pt, Vec<(usize, i8)>> = HashMap::new();
        for (v, &pr) in self.pairs.iter().enumerate() {
            let d = diff(&q, pr);
            let nd: Pt = d.iter().map(|x| -x).collect();
            idx.entry(d).or_default().push((v, 1));
            idx.entry(nd).or_default().push((v, -1));
        }
        let adj = self.pairs.iter().map(|&pr| idx.get(&diff(&p, pr)).cloned().unwrap_or_default()).collect();
        Some(Analysis { p, q, adj })
    }

    /// largest dimension of a subspace of the flat on which F2 = sum P-int^2 - sum Q-int^2 vanishes identically:
    /// nullity + min(positive, negative) of its inertia (exact rationals in i128; None on overflow). A type flat
    /// lies in such a subspace (on it the interval multisets agree, so F2 = 0 there), so a flat whose value is
    /// below min_dim holds no type of dimension >= min_dim. With min_dim 1 this is exactly "F2 definite".
    fn isotropic_dim(&self, p: &[Pt], q: &[Pt]) -> Option<usize> {
        let m = p[0].len();
        if m == 0 {
            return Some(0);
        }
        let mut g = vec![vec![0i128; m]; m];
        for (pts, sg) in [(p, 1i128), (q, -1i128)] {
            for &(i, j) in &self.pairs {
                let d: Vec<i128> = (0..m).map(|r| (pts[j][r] - pts[i][r]) as i128).collect();
                for r in 0..m {
                    if d[r] != 0 {
                        for c in 0..m {
                            if d[c] != 0 {
                                g[r][c] += sg * d[r] * d[c];
                            }
                        }
                    }
                }
            }
        }
        type R = (i128, i128); // num / den, den > 0, reduced
        fn norm(n: i128, d: i128) -> R {
            let g = gcd(n, d).max(1);
            let (n, d) = (n / g, d / g);
            if d < 0 { (-n, -d) } else { (n, d) }
        }
        fn add(x: R, y: R) -> Option<R> {
            Some(norm(x.0.checked_mul(y.1)?.checked_add(y.0.checked_mul(x.1)?)?, x.1.checked_mul(y.1)?))
        }
        fn sub(x: R, y: R) -> Option<R> {
            add(x, (y.0.checked_neg()?, y.1))
        }
        fn mul(x: R, y: R) -> Option<R> {
            Some(norm(x.0.checked_mul(y.0)?, x.1.checked_mul(y.1)?))
        }
        fn div(x: R, y: R) -> Option<R> {
            Some(norm(x.0.checked_mul(y.1)?, x.1.checked_mul(y.0)?))
        }
        let mut a: Vec<Vec<R>> = g.into_iter().map(|r| r.into_iter().map(|x| (x, 1)).collect()).collect();
        let mut act: Vec<usize> = (0..m).collect();
        let (mut pos, mut neg, mut null) = (0usize, 0usize, 0usize);
        while !act.is_empty() {
            let c = match act.iter().copied().find(|&c| a[c][c].0 != 0) {
                Some(c) => c,
                None => {
                    // every remaining diagonal is 0: use an off-diagonal entry (congruence row/col i += row/col j)
                    let Some((i, j)) = act.iter().flat_map(|&i| act.iter().map(move |&j| (i, j))).find(|&(i, j)| i != j && a[i][j].0 != 0) else {
                        null += act.len();
                        break;
                    };
                    for &t in &act {
                        a[i][t] = add(a[i][t], a[j][t])?;
                    }
                    for &t in &act {
                        a[t][i] = if t == i { a[i][i] } else { a[i][t] };
                    }
                    a[i][i] = add(a[i][i], a[j][i])?;
                    i
                }
            };
            if a[c][c].0 > 0 { pos += 1 } else { neg += 1 }
            act.retain(|&t| t != c);
            for &r in &act {
                if a[r][c].0 == 0 {
                    continue;
                }
                let f = div(a[r][c], a[c][c])?;
                for &s in &act {
                    a[r][s] = sub(a[r][s], mul(f, a[c][s])?)?;
                }
            }
        }
        Some(null + pos.min(neg))
    }

    /// F2 = sum P-int^2 - sum Q-int^2 definite on the flat? (exact rationals in i128; overflow -> false)
    #[allow(dead_code)]
    fn square_sum_definite(&self, p: &[Pt], q: &[Pt]) -> bool {
        let m = p[0].len();
        if m == 0 {
            return false;
        }
        let mut g = vec![vec![0i128; m]; m];
        for (pts, sg) in [(p, 1i128), (q, -1i128)] {
            for &(i, j) in &self.pairs {
                let d: Vec<i128> = (0..m).map(|r| (pts[j][r] - pts[i][r]) as i128).collect();
                for r in 0..m {
                    if d[r] != 0 {
                        for c in 0..m {
                            if d[c] != 0 {
                                g[r][c] += sg * d[r] * d[c];
                            }
                        }
                    }
                }
            }
        }
        // rational elimination: entries as (num, den) with den > 0
        let mut a: Vec<Vec<(i128, i128)>> = g.into_iter().map(|r| r.into_iter().map(|x| (x, 1)).collect()).collect();
        let mut sign = 0;
        for c in 0..m {
            let (pn, pd) = a[c][c];
            if pn == 0 {
                return false;
            }
            let s = if pn > 0 { 1 } else { -1 };
            if sign != 0 && s != sign {
                return false;
            }
            sign = s;
            for r in c + 1..m {
                let (rn, rd) = a[r][c];
                if rn == 0 {
                    continue;
                }
                // f = a[r][c] / a[c][c] = (rn/rd) / (pn/pd) = rn*pd / (rd*pn)
                let (Some(fn_), Some(fd)) = (rn.checked_mul(pd), rd.checked_mul(pn)) else { return false };
                for j in c..m {
                    let (xn, xd) = a[r][j];
                    let (yn, yd) = a[c][j];
                    // x - f*y = xn/xd - fn*yn/(fd*yd)
                    let Some(tn) = fn_.checked_mul(yn) else { return false };
                    let Some(td) = fd.checked_mul(yd) else { return false };
                    let (Some(u1), Some(u2), Some(den)) = (xn.checked_mul(td), tn.checked_mul(xd), xd.checked_mul(td)) else { return false };
                    let Some(num) = u1.checked_sub(u2) else { return false };
                    let gg = gcd(num, den).max(1);
                    let (mut nn, mut dd) = (num / gg, den / gg);
                    if dd < 0 {
                        nn = -nn;
                        dd = -dd;
                    }
                    a[r][j] = (nn, dd);
                }
            }
        }
        true
    }

    fn matching(&self, adj: &[Vec<(usize, i8)>]) -> (Vec<i64>, Vec<i64>) {
        let np = self.np;
        let mut mp = vec![-1i64; np];
        let mut mq = vec![-1i64; np];
        fn aug(u: usize, adj: &[Vec<(usize, i8)>], seen: &mut Vec<bool>, mp: &mut Vec<i64>, mq: &mut Vec<i64>) -> bool {
            for &(v, _) in &adj[u] {
                if seen[v] {
                    continue;
                }
                seen[v] = true;
                if mq[v] == -1 || aug(mq[v] as usize, adj, seen, mp, mq) {
                    mp[u] = v as i64;
                    mq[v] = u as i64;
                    return true;
                }
            }
            false
        }
        for u in 0..np {
            let mut seen = vec![false; np];
            aug(u, adj, &mut seen, &mut mp, &mut mq);
        }
        (mp, mq)
    }

    /// (X sorted, N as flags) from unmatched u0
    fn violator(&self, adj: &[Vec<(usize, i8)>], mb: &[i64], u0: usize) -> (Vec<usize>, Vec<bool>) {
        let mut inx = vec![false; self.np];
        let mut inn = vec![false; self.np];
        inx[u0] = true;
        let mut stack = vec![u0];
        while let Some(u) = stack.pop() {
            for &(v, _) in &adj[u] {
                if !inn[v] {
                    inn[v] = true;
                    let w = mb[v];
                    if w != -1 && !inx[w as usize] {
                        inx[w as usize] = true;
                        stack.push(w as usize);
                    }
                }
            }
        }
        ((0..self.np).filter(|&u| inx[u]).collect(), inn)
    }

    fn edge_form(&self, u: usize, v: usize, s: i64) -> Vec<i64> {
        let mut f = vec![0i64; self.n];
        let (i, j) = self.pairs[u];
        let (a, b) = self.pairs[v];
        for (side, idx, c) in [(0, j, 1), (0, i, -1), (1, b, -s), (1, a, s)] {
            if idx > 0 {
                f[side * (self.k - 1) + idx - 1] += c;
            }
        }
        f
    }

    fn cut(&self, b: &Basis, f: &[i64]) -> Basis {
        let vals: Vec<i128> = b.iter().map(|r| r.iter().zip(f).map(|(&x, &y)| x as i128 * y as i128).sum()).collect();
        let piv = vals.iter().position(|&x| x != 0).expect("form vanishes on the flat");
        let vp = vals[piv];
        let mut rows = vec![];
        for (t, r) in b.iter().enumerate() {
            if t == piv {
                continue;
            }
            rows.push((0..self.n).map(|x| sub(mul(r[x] as i128, vp), mul(b[piv][x] as i128, vals[t]))).collect());
        }
        if rows.is_empty() {
            return vec![];
        }
        rref(rows, self.n)
    }

    fn root(&self) -> Basis {
        let full: Vec<Vec<i128>> = (0..self.n).map(|r| (0..self.n).map(|c| (r == c) as i128).collect()).collect();
        let full = rref(full, self.n);
        self.cut(&full, &self.edge_form(0, 0, 1))
    }

    /// canonical certificate of the flat up to relabeling notes of each set, mirroring either set, swapping
    fn canon(&self, p: &[Pt], q: &[Pt]) -> u128 {
        let mut best: Option<Vec<u8>> = None;
        for sp in [1i64, -1] {
            for sq in [1i64, -1] {
                let a: Vec<Pt> = p.iter().map(|x| x.iter().map(|v| sp * v).collect()).collect();
                let b: Vec<Pt> = q.iter().map(|x| x.iter().map(|v| sq * v).collect()).collect();
                for (x, y) in [(&a, &b), (&b, &a)] {
                    let c = canon_struct(self.k, x, y);
                    if best.as_ref().map_or(true, |bb| c < *bb) {
                        best = Some(c);
                    }
                }
            }
        }
        h128(&best.unwrap())
    }

    /// depth-first (or breadth-first up to `frontier` waiting flats) search; returns type flats found and, for
    /// a frontier run, the waiting flats
    fn run(&self, starts: Vec<Basis>, frontier: usize, max_nodes: u64, shared: &Shared, seen: &mut HashSet<u128>,
           st: &mut Stats, log_types: bool) -> (Vec<Basis>, Vec<Basis>, bool) {
        let mut stack: VecDeque<Basis> = starts.into();
        let mut types = vec![];
        let seen_cap = 4_000_000;
        while !stack.is_empty() {
            if frontier > 0 && stack.len() >= frontier {
                return (types, stack.into(), false);
            }
            let basis = if frontier > 0 { stack.pop_front().unwrap() } else { stack.pop_back().unwrap() };
            st.nodes += 1;
            if st.nodes % 1000 == 0 {
                shared.nodes.fetch_add(1000, Ordering::Relaxed);
            }
            if st.nodes > max_nodes {
                return (types, vec![], false);
            }
            let Some(an) = self.analyse(&basis) else {
                st.bad += 1;
                continue;
            };
            if self.f2 && self.isotropic_dim(&an.p, &an.q).map_or(false, |d| d < self.min_dim) {
                st.bad += 1;
                st.f2cut += 1;
                continue;
            }
            if self.use_canon {
                let key = self.canon(&an.p, &an.q);
                if !shared.claim(key) {
                    st.dup += 1;
                    continue;
                }
            }
            let (mp, mq) = self.matching(&an.adj);
            if !mp.contains(&-1) {
                if log_types {
                    eprintln!("  TYPE FLAT at node {}: dim {}, P {:?}, Q {:?}", st.nodes, basis.len(), an.p, an.q);
                }
                types.push(basis);
                continue;
            }
            let mut adjq: Vec<Vec<(usize, i8)>> = vec![vec![]; self.np];
            for u in 0..self.np {
                for &(v, s) in &an.adj[u] {
                    adjq[v].push((u, s));
                }
            }
            let mut best: Option<(usize, Vec<usize>, Vec<bool>, usize)> = None;
            for (side, (ad, ma, mb)) in [(&an.adj, &mp, &mq), (&adjq, &mq, &mp)].into_iter().enumerate() {
                for u0 in 0..self.np {
                    if ma[u0] != -1 {
                        continue;
                    }
                    let (x, nn) = self.violator(ad, mb, u0);
                    let cost = x.len() * (self.np - nn.iter().filter(|&&f| f).count());
                    if best.as_ref().map_or(true, |b| cost < b.0) {
                        best = Some((cost, x, nn, side));
                    }
                }
            }
            let (_, x, nn, side) = best.unwrap();
            let mut opts = vec![];
            for &a in &x {
                for o in 0..self.np {
                    if nn[o] {
                        continue;
                    }
                    for s in [1i64, -1] {
                        opts.push(if side == 0 { (a, o, s) } else { (o, a, s) });
                    }
                }
            }
            if basis.len() <= self.min_dim {
                continue; // its children have dimension below min_dim (default 1: a 1-dim flat cut again is 0-dim)
            }
            if seen.len() > seen_cap {
                seen.clear(); // dedup is only a speed-up
            }
            for (u, v, s) in opts {
                let child = self.cut(&basis, &self.edge_form(u, v, s));
                if child.len() < self.min_dim {
                    continue;
                }
                let h = h128(&child);
                if seen.insert(h) {
                    stack.push_back(child);
                }
            }
        }
        (types, vec![], true)
    }
}

/// canonical certificate of (A, B): individualization-refinement over the 2k notes; the certificate lists, for
/// every ordered pair of distinct notes of A then of B in canonical order, the equality class of its interval
/// (classes numbered by first appearance). The minimum over all leaves is canonical.
fn canon_struct(k: usize, a: &[Pt], b: &[Pt]) -> Vec<u8> {
    // arc class table: cls[side*k*k + i*k + j]
    let mut ids: HashMap<Pt, u16> = HashMap::new();
    let mut cls = vec![u16::MAX; 2 * k * k];
    for (side, pts) in [a, b].into_iter().enumerate() {
        for i in 0..k {
            for j in 0..k {
                if i != j {
                    let d: Pt = pts[j].iter().zip(&pts[i]).map(|(y, x)| y - x).collect();
                    let n = ids.len() as u16;
                    cls[side * k * k + i * k + j] = *ids.entry(d).or_insert(n);
                }
            }
        }
    }
    let ncls = ids.len();
    let init: Vec<u32> = (0..2 * k).map(|v| (v / k) as u32).collect();
    let col = refine(k, &cls, ncls, init);
    let mut best: Option<Vec<u8>> = None;
    search_leaves(k, &cls, ncls, col, &mut best);
    best.unwrap()
}

/// colors of the 2k notes refined to a stable partition (isomorphism-invariant ranks)
fn refine(k: usize, cls: &[u16], ncls: usize, mut col: Vec<u32>) -> Vec<u32> {
    let nv = 2 * k;
    loop {
        let ncol_before = { let mut c = col.clone(); c.sort_unstable(); c.dedup(); c.len() };
        // class signatures: sorted (side, color(tail), color(head))
        let mut csig: Vec<Vec<(u32, u32, u32)>> = vec![vec![]; ncls];
        for side in 0..2 {
            for i in 0..k {
                for j in 0..k {
                    if i != j {
                        let c = cls[side * k * k + i * k + j] as usize;
                        csig[c].push((side as u32, col[side * k + i], col[side * k + j]));
                    }
                }
            }
        }
        for s in csig.iter_mut() {
            s.sort_unstable();
        }
        let mut uniq: Vec<&Vec<(u32, u32, u32)>> = csig.iter().collect();
        uniq.sort();
        uniq.dedup();
        let ccol: Vec<u32> = csig.iter().map(|s| uniq.binary_search(&s).unwrap() as u32).collect();
        // note signatures: (old color, sorted (class color, out=0/in=1, other note color))
        let mut psig: Vec<(u32, Vec<(u32, u32, u32)>)> = (0..nv).map(|v| (col[v], vec![])).collect();
        for side in 0..2 {
            for i in 0..k {
                for j in 0..k {
                    if i != j {
                        let c = ccol[cls[side * k * k + i * k + j] as usize];
                        let (vi, vj) = (side * k + i, side * k + j);
                        psig[vi].1.push((c, 0, col[vj]));
                        psig[vj].1.push((c, 1, col[vi]));
                    }
                }
            }
        }
        for s in psig.iter_mut() {
            s.1.sort_unstable();
        }
        let mut uniq: Vec<&(u32, Vec<(u32, u32, u32)>)> = psig.iter().collect();
        uniq.sort();
        uniq.dedup();
        let newcol: Vec<u32> = psig.iter().map(|s| uniq.binary_search(&s).unwrap() as u32).collect();
        let stable = uniq.len() == ncol_before;
        col = newcol;
        if stable {
            return col;
        }
    }
}

fn search_leaves(k: usize, cls: &[u16], ncls: usize, col: Vec<u32>, best: &mut Option<Vec<u8>>) {
    let nv = 2 * k;
    // first (smallest color) non-singleton cell
    let mut count: HashMap<u32, usize> = HashMap::new();
    for &c in &col {
        *count.entry(c).or_default() += 1;
    }
    let cell = count.iter().filter(|(_, &n)| n > 1).map(|(&c, _)| c).min();
    let Some(cell) = cell else {
        // leaf: order notes by color (colors are distinct; side 0 colors < side 1 colors stay separated)
        let mut order: Vec<usize> = (0..nv).collect();
        order.sort_by_key(|&v| col[v]);
        let a_order: Vec<usize> = order.iter().filter(|&&v| v < k).cloned().collect();
        let b_order: Vec<usize> = order.iter().filter(|&&v| v >= k).map(|&v| v - k).collect();
        let mut relabel = vec![u8::MAX; ncls];
        let mut next = 0u8;
        let mut cert = Vec::with_capacity(2 * k * (k - 1));
        for (side, ord) in [(0usize, &a_order), (1usize, &b_order)] {
            for &i in ord.iter() {
                for &j in ord.iter() {
                    if i != j {
                        let c = cls[side * k * k + i * k + j] as usize;
                        if relabel[c] == u8::MAX {
                            relabel[c] = next;
                            next += 1;
                        }
                        cert.push(relabel[c]);
                    }
                }
            }
        }
        if best.as_ref().map_or(true, |b| cert < *b) {
            *best = Some(cert);
        }
        return;
    };
    for v in 0..nv {
        if col[v] != cell {
            continue;
        }
        let ind: Vec<u32> = (0..nv).map(|w| 2 * col[w] + (w == v) as u32).collect();
        let c2 = refine(k, cls, ncls, ind);
        search_leaves(k, cls, ncls, c2, best);
    }
}

fn mem_available_gb() -> Option<f64> {
    let s = std::fs::read_to_string("/proc/meminfo").ok()?;
    for line in s.lines() {
        if let Some(rest) = line.strip_prefix("MemAvailable:") {
            let kb: f64 = rest.trim().split_whitespace().next()?.parse().ok()?;
            return Some(kb / 1048576.0);
        }
    }
    None
}

fn basis_to_str(b: &Basis) -> String {
    b.iter().map(|r| r.iter().map(|x| x.to_string()).collect::<Vec<_>>().join(",")).collect::<Vec<_>>().join(";")
}
fn str_to_basis(s: &str) -> Basis {
    s.split(';').map(|r| r.split(',').map(|x| x.parse().unwrap()).collect()).collect()
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let k: usize = args.get(1).expect("usage: typeflats-rs K [options]").parse().unwrap();
    let opt = |name: &str| args.iter().position(|a| a == name).map(|i| args[i + 1].clone());
    let flag = |name: &str| args.iter().any(|a| a == name);
    let threads: usize = opt("--threads").map(|x| x.parse().unwrap()).unwrap_or(1);
    let frontier: usize = opt("--frontier").map(|x| x.parse().unwrap()).unwrap_or(3000);
    let max_nodes: u64 = opt("--max-nodes").map(|x| x.parse().unwrap()).unwrap_or(u64::MAX);
    let min_free: f64 = opt("--min-free-gb").map(|x| x.parse().unwrap()).unwrap_or(4.0);
    let state = opt("--state");
    let out = opt("--out");
    let min_dim: usize = opt("--min-dim").map(|x| x.parse().unwrap()).unwrap_or(1);
    let s = Search::new(k, !flag("--no-canon"), !flag("--no-f2"), min_dim);
    let shared = Shared::new();
    let t0 = Instant::now();
    let mut types: Vec<Basis> = vec![];
    let mut total = Stats::default();
    let mut complete = true;

    if flag("--single") || threads <= 1 {
        let mut seen = HashSet::new();
        let (t, _, c) = s.run(vec![s.root()], 0, max_nodes, &shared, &mut seen, &mut total, true);
        types = t;
        complete = c;
    } else {
        // frontier (saved in the state folder for resume)
        let fpath = state.as_ref().map(|d| format!("{d}/frontier.txt"));
        let dpath = state.as_ref().map(|d| format!("{d}/done.txt"));
        let front: Vec<Basis> = if let Some(fp) = fpath.as_ref().filter(|p| std::path::Path::new(p).exists()) {
            let f: Vec<Basis> = std::fs::read_to_string(fp).unwrap().lines().filter(|l| !l.is_empty()).map(str_to_basis).collect();
            println!("frontier loaded: {} flats", f.len());
            f
        } else {
            let mut seen = HashSet::new();
            let (t, f, _) = s.run(vec![s.root()], frontier, u64::MAX, &shared, &mut seen, &mut total, false);
            assert!(t.is_empty(), "type flat inside the frontier phase: raise or lower --frontier");
            if let Some(fp) = &fpath {
                std::fs::create_dir_all(state.as_ref().unwrap()).unwrap();
                let txt: String = f.iter().map(|b| basis_to_str(b) + "\n").collect();
                std::fs::write(format!("{fp}.tmp"), txt).unwrap();
                std::fs::rename(format!("{fp}.tmp"), fp).unwrap();
            }
            f
        };
        println!("frontier: {} flats after {} nodes, {:.0} s", front.len(), total.nodes, t0.elapsed().as_secs_f64());
        let mut done = vec![false; front.len()];
        if let Some(dp) = dpath.as_ref().filter(|p| std::path::Path::new(p).exists()) {
            // lines: "D i nodes bad" after the task's "T i basis" lines
            let mut pending: HashMap<usize, Vec<Basis>> = HashMap::new();
            for line in std::io::BufReader::new(std::fs::File::open(dp).unwrap()).lines() {
                let line = line.unwrap();
                let parts: Vec<&str> = line.split(' ').collect();
                match parts.first() {
                    Some(&"T") if parts.len() == 3 => pending.entry(parts[1].parse().unwrap()).or_default().push(str_to_basis(parts[2])),
                    Some(&"D") if parts.len() == 4 => {
                        let i: usize = parts[1].parse().unwrap();
                        done[i] = true;
                        total.nodes += parts[2].parse::<u64>().unwrap();
                        total.bad += parts[3].parse::<u64>().unwrap();
                        types.extend(pending.remove(&i).unwrap_or_default());
                    }
                    _ => {}
                }
            }
            println!("resume: {} frontier flats already done, {} nodes, {} type flats", done.iter().filter(|&&d| d).count(), total.nodes, types.len());
        }
        let todo: Vec<usize> = (0..front.len()).filter(|&i| !done[i]).collect();
        let ndone0 = front.len() - todo.len();
        let next = AtomicUsize::new(0);
        let finished = AtomicUsize::new(0);
        let dlog = Mutex::new(dpath.as_ref().map(|p| std::fs::OpenOptions::new().create(true).append(true).open(p).unwrap()));
        let found: Mutex<Vec<Basis>> = Mutex::new(vec![]);
        let agg = Mutex::new(Stats::default());
        std::thread::scope(|sc| {
            for _ in 0..threads {
                sc.spawn(|| {
                    let mut seen = HashSet::new();
                    loop {
                        let t = next.fetch_add(1, Ordering::Relaxed);
                        if t >= todo.len() {
                            break;
                        }
                        let i = todo[t];
                        let mut st = Stats::default();
                        let (ty, _, _) = s.run(vec![front[i].clone()], 0, u64::MAX, &shared, &mut seen, &mut st, false);
                        if let Some(f) = dlog.lock().unwrap().as_mut() {
                            for b in &ty {
                                writeln!(f, "T {i} {}", basis_to_str(b)).unwrap();
                            }
                            writeln!(f, "D {i} {} {}", st.nodes, st.bad).unwrap();
                            f.flush().unwrap();
                        }
                        if !ty.is_empty() {
                            println!("  +{} type flats from frontier flat {i}", ty.len());
                        }
                        found.lock().unwrap().extend(ty);
                        let mut a = agg.lock().unwrap();
                        a.nodes += st.nodes;
                        a.bad += st.bad;
                        a.f2cut += st.f2cut;
                        a.dup += st.dup;
                        drop(a);
                        finished.fetch_add(1, Ordering::Relaxed);
                    }
                });
            }
            // progress + memory guard
            sc.spawn(|| {
                let mut last = Instant::now();
                loop {
                    std::thread::sleep(std::time::Duration::from_secs(2));
                    let f = finished.load(Ordering::Relaxed);
                    let all = f >= todo.len();
                    if last.elapsed().as_secs() >= 60 || all {
                        last = Instant::now();
                        let free = mem_available_gb();
                        if let Some(fr) = free {
                            if fr < min_free && !shared.freeze.swap(true, Ordering::Relaxed) {
                                println!("  MEMORY LOW ({fr:.1} GB free): canonical table frozen (result stays complete)");
                            }
                        }
                        let a = agg.lock().unwrap();
                        println!("  {}/{} frontier flats done, {} nodes this session ({} in done flats: {} bad, {} f2-cut, {} dups), {} classes, {} type flats, free {:?} GB{}, {:.0} s",
                                 ndone0 + f, front.len(), shared.nodes.load(Ordering::Relaxed), a.nodes, a.bad, a.f2cut, a.dup,
                                 shared.len(), found.lock().unwrap().len(), free.map(|x| (x * 10.0).round() / 10.0),
                                 if shared.freeze.load(Ordering::Relaxed) { ", FROZEN" } else { "" }, t0.elapsed().as_secs_f64());
                        std::io::stdout().flush().unwrap();
                    }
                    if all {
                        break;
                    }
                }
            });
        });
        types.extend(found.into_inner().unwrap());
        let a = agg.into_inner().unwrap();
        total.nodes += a.nodes;
        total.bad += a.bad;
        total.f2cut += a.f2cut;
        total.dup += a.dup;
    }

    // maximal flats (a type flat inside another is a specialization), then one per symmetry class
    let inside = |small: &Basis, big: &Basis| -> bool {
        let rows: Vec<Vec<i128>> = big.iter().chain(small.iter()).map(|r| r.iter().map(|&x| x as i128).collect()).collect();
        rref(rows, s.n).len() == big.len()
    };
    let maximal: Vec<&Basis> = types.iter().filter(|b| !types.iter().any(|b2| b2.len() > b.len() && inside(b, b2))).collect();
    let mut reps: Vec<(u128, &Basis)> = vec![];
    for b in maximal {
        let p: Vec<Pt> = (0..k).map(|i| s.point(b, 0, i)).collect();
        let q: Vec<Pt> = (0..k).map(|i| s.point(b, 1, i)).collect();
        let key = s.canon(&p, &q);
        if !reps.iter().any(|(kk, _)| *kk == key) {
            reps.push((key, b));
        }
    }
    println!("k {k}: {} nodes, {} bad ({} by f2), {} dups, {} type flats, {} maximal classes, {}, {:.1} s",
             total.nodes, total.bad, total.f2cut, total.dup, types.len(), reps.len(),
             if complete { "COMPLETE" } else { "INCOMPLETE" }, t0.elapsed().as_secs_f64());
    let mut js = vec![];
    for (_, b) in &reps {
        let p: Vec<Pt> = (0..k).map(|i| s.point(b, 0, i)).collect();
        let q: Vec<Pt> = (0..k).map(|i| s.point(b, 1, i)).collect();
        println!("  dim {}: P {:?}\n          Q {:?}", b.len(), p, q);
        let f = |v: &Vec<Pt>| format!("[{}]", v.iter().map(|x| format!("[{}]", x.iter().map(|y| format!("\"{y}\"")).collect::<Vec<_>>().join(","))).collect::<Vec<_>>().join(","));
        js.push(format!("{{\"dim\": {}, \"P\": {}, \"Q\": {}}}", b.len(), f(&p), f(&q)));
    }
    if let Some(o) = out {
        std::fs::write(o, format!("{{\"k\": {k}, \"complete\": {complete}, \"nodes\": {}, \"types\": [{}]}}\n", total.nodes, js.join(", "))).unwrap();
    }
}
