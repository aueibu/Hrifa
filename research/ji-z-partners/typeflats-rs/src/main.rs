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
//!                       [--no-canon] [--no-f2] [--single] [--max-nodes N] [--min-dim D] [--f4 M]
//! --single: one thread, the exact traversal order of typeflats.py (node counts comparable with it).
//! --min-dim D: find only types of dimension >= D (sound for those: flats below D are never entered). D = 2
//! finds every rank >= 2 type; the rank-1 (single-line) types are then left to a 1-D enumeration by span.
//! --precut / --fast / --check-fast (2026-11-26): decide children at the parent (exact); --fast uses the parent's
//! F2 factorization (O(m^2) per child), --check-fast asserts it against the slow test.
//! --canon2 (2026-11-26): faster canonical key (canon2), same symmetry classes.
//! --f4 M (2026-11-26): also prune flats of dimension <= M by the fourth-power test (f4_isotropic; sound).

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

/// exact rationals (num, den), den > 0, reduced; None on overflow
type Rat = (i128, i128);
fn rnorm(n: i128, d: i128) -> Rat {
    let g = gcd(n, d).max(1);
    let (n, d) = (n / g, d / g);
    if d < 0 { (-n, -d) } else { (n, d) }
}
fn radd(x: Rat, y: Rat) -> Option<Rat> {
    Some(rnorm(x.0.checked_mul(y.1)?.checked_add(y.0.checked_mul(x.1)?)?, x.1.checked_mul(y.1)?))
}
fn rsub(x: Rat, y: Rat) -> Option<Rat> {
    radd(x, (y.0.checked_neg()?, y.1))
}
fn rmul(x: Rat, y: Rat) -> Option<Rat> {
    Some(rnorm(x.0.checked_mul(y.0)?, x.1.checked_mul(y.1)?))
}
fn rdiv(x: Rat, y: Rat) -> Option<Rat> {
    Some(rnorm(x.0.checked_mul(y.1)?, x.1.checked_mul(y.0)?))
}

/// the parent's F2 form factored once, T G T^T = diag(D) (T rational, kept as integer rows: row_i = T_i * den_i),
/// so that each child {l . x = 0} is decided in O(m^2) integer work (`child_iso`). Restricting a form with inertia
/// (pos, neg, null) to a hyperplane l = 0, with l' = T l: if l' is nonzero on a null coordinate, the child has
/// (pos, neg, null - 1); else with s = sum over pivots l'_c^2 / D_c: s > 0 -> (pos - 1, neg, null), s < 0 ->
/// (pos, neg - 1, null), s = 0 -> (pos - 1, neg - 1, null + 1) (bordered matrix [[G, l], [l^T, 0]] has the
/// child's inertia + (1, 1, 0); its Schur complement over the nonsingular part is -s).
struct F2Fact {
    pos: usize,
    neg: usize,
    null: usize,
    null_rows: Vec<Vec<i128>>,
    piv_rows: Vec<Vec<i128>>,
    /// integer weights w_c > 0 * 1 / (den_c^2 D_c): sign(sum w_c (row_c . l)^2) = sign(s)
    w: Vec<i128>,
}

impl F2Fact {
    fn new(g: &[Vec<i128>]) -> Option<F2Fact> {
        let m = g.len();
        let mut a: Vec<Vec<Rat>> = g.iter().map(|r| r.iter().map(|&x| (x, 1)).collect()).collect();
        let mut t: Vec<Vec<Rat>> = (0..m).map(|i| (0..m).map(|j| ((i == j) as i128, 1)).collect()).collect();
        let mut act: Vec<usize> = (0..m).collect();
        let mut pivs: Vec<(usize, Rat)> = vec![];
        let mut nulls: Vec<usize> = vec![];
        while !act.is_empty() {
            let c = match act.iter().copied().find(|&c| a[c][c].0 != 0) {
                Some(c) => c,
                None => {
                    let Some((i, j)) = act.iter().flat_map(|&i| act.iter().map(move |&j| (i, j))).find(|&(i, j)| i != j && a[i][j].0 != 0) else {
                        nulls.extend(act.iter().copied());
                        break;
                    };
                    for &x in &act {
                        a[i][x] = radd(a[i][x], a[j][x])?;
                    }
                    for &x in &act {
                        a[x][i] = if x == i { a[i][i] } else { a[i][x] };
                    }
                    a[i][i] = radd(a[i][i], a[j][i])?;
                    for x in 0..m {
                        t[i][x] = radd(t[i][x], t[j][x])?;
                    }
                    i
                }
            };
            pivs.push((c, a[c][c]));
            act.retain(|&x| x != c);
            for &r in &act {
                if a[r][c].0 == 0 {
                    continue;
                }
                let f = rdiv(a[r][c], a[c][c])?;
                for &x in &act {
                    a[r][x] = rsub(a[r][x], rmul(f, a[c][x])?)?;
                }
                for x in 0..m {
                    t[r][x] = rsub(t[r][x], rmul(f, t[c][x])?)?;
                }
            }
        }
        // integer rows: row * lcm of its denominators
        let int_row = |row: &Vec<Rat>| -> Option<(Vec<i128>, i128)> {
            let mut den = 1i128;
            for &(_, d) in row {
                den = (den / gcd(den, d)).checked_mul(d)?;
            }
            Some((row.iter().map(|&(n, d)| n.checked_mul(den / d)).collect::<Option<Vec<_>>>()?, den))
        };
        let null_rows = nulls.iter().map(|&i| int_row(&t[i]).map(|x| x.0)).collect::<Option<Vec<_>>>()?;
        let mut piv_rows = vec![];
        let mut wr: Vec<Rat> = vec![];
        let (mut pos, mut neg) = (0, 0);
        for &(c, dc) in &pivs {
            if dc.0 > 0 { pos += 1 } else { neg += 1 }
            let (row, den) = int_row(&t[c])?;
            piv_rows.push(row);
            wr.push(rdiv((1, 1), rmul(dc, (den.checked_mul(den)?, 1))?)?);
        }
        let mut l = 1i128;
        for &(_, d) in &wr {
            l = (l / gcd(l, d)).checked_mul(d)?;
        }
        let w = wr.iter().map(|&(n, d)| n.checked_mul(l / d)).collect::<Option<Vec<_>>>()?;
        Some(F2Fact { pos, neg, null: nulls.len(), null_rows, piv_rows, w })
    }

    fn iso(&self) -> usize {
        self.null + self.pos.min(self.neg)
    }

    /// isotropic dimension of the child {l . x = 0}; None on overflow
    fn child_iso(&self, l: &[i128]) -> Option<usize> {
        let dot = |r: &Vec<i128>| -> Option<i128> {
            let mut s = 0i128;
            for (a, b) in r.iter().zip(l) {
                s = s.checked_add(a.checked_mul(*b)?)?;
            }
            Some(s)
        };
        for r in &self.null_rows {
            if dot(r)? != 0 {
                return Some(self.null - 1 + self.pos.min(self.neg));
            }
        }
        let mut s = 0i128;
        for (r, &w) in self.piv_rows.iter().zip(&self.w) {
            let d = dot(r)?;
            s = s.checked_add(w.checked_mul(d.checked_mul(d)?)?)?;
        }
        let (p, n) = (self.pos as i64, self.neg as i64);
        Some(if s > 0 {
            self.null + (p - 1).min(n) as usize
        } else if s < 0 {
            self.null + p.min(n - 1) as usize
        } else {
            self.null + 1 + (p - 1).min(n - 1) as usize
        })
    }
}

/// direction of a nonzero integer vector: primitive, first nonzero entry positive
fn direction(v: &[i128]) -> Vec<i128> {
    let mut d = v.to_vec();
    primitive(&mut d);
    if d.iter().find(|&&x| x != 0).map_or(false, |&x| x < 0) {
        for x in d.iter_mut() {
            *x = -*x;
        }
    }
    d
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
    /// --f4 M: apply the fourth-power test (f4_isotropic) to flats of dimension <= M (0 = off)
    f4_max_m: usize,
    /// --precut: decide BAD / F2 for each child from the parent before building it (same result, fewer nodes)
    precut: bool,
    /// --fast (with --precut): collisions by one lookup, F2 by the parent's factorization (F2Fact), repeated
    /// hyperplanes skipped; Q = +-P + t left to the child. --check-fast: also compute the slow answers and assert
    fast: bool,
    check_fast: bool,
    /// --canon2: the allocation-light canonical key (same classes, different key values)
    canon2: bool,
}

static PRECUT_REPEAT: AtomicU64 = AtomicU64::new(0);
static CHECKED: AtomicU64 = AtomicU64::new(0);

/// flats cut by the fourth-power test (all threads)
static F4CUT: AtomicU64 = AtomicU64::new(0);
/// children rejected at the parent (--precut): BAD, F2
static PRECUT_BAD: AtomicU64 = AtomicU64::new(0);
static PRECUT_F2: AtomicU64 = AtomicU64::new(0);

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
        Search { k, n: 2 * (k - 1), pairs, np, use_canon, f2, min_dim: min_dim.max(1), f4_max_m: 0, precut: false, fast: false, check_fast: false, canon2: false }
    }

    fn point(&self, b: &Basis, side: usize, i: usize) -> Pt {
        if i == 0 {
            return vec![0; b.len()];
        }
        let x = side * (self.k - 1) + i - 1;
        b.iter().map(|r| r[x]).collect()
    }

    /// BAD: two notes of P (or of Q) coincide, or Q = +-P + t as sets (points = the notes' linear forms)
    fn points_bad(&self, p: &[Pt], q: &[Pt]) -> bool {
        let k = self.k;
        let ps: HashSet<&Pt> = p.iter().collect();
        let qs: HashSet<&Pt> = q.iter().collect();
        if ps.len() < k || qs.len() < k {
            return true;
        }
        for s in [1i64, -1] {
            for t in q {
                let img: HashSet<Pt> = p.iter().map(|x| x.iter().zip(t).map(|(a, b)| s * a + b).collect()).collect();
                if img.len() == k && img.iter().all(|x| qs.contains(x)) {
                    return true;
                }
            }
        }
        false
    }

    /// the notes of the child flat {l . x = 0} as linear forms in its own coordinates (scaled by l_c, c = first
    /// nonzero of l): a -> l_c a - a_c l with coordinate c dropped. Two forms agree on the child exactly when
    /// their images are equal, and the images are the child's coordinates up to a change of basis and the factor
    /// l_c, so equalities, the BAD tests and the F2 inertia read the same as on the child's own basis.
    /// None on overflow (then the caller takes the ordinary path).
    fn child_points(p: &[Pt], l: &[i128]) -> Option<Vec<Pt>> {
        let c = l.iter().position(|&x| x != 0)?;
        let lc = l[c];
        p.iter()
            .map(|a| {
                (0..a.len())
                    .filter(|&r| r != c)
                    .map(|r| {
                        let v = lc.checked_mul(a[r] as i128)?.checked_sub((a[c] as i128).checked_mul(l[r])?)?;
                        i64::try_from(v).ok()
                    })
                    .collect()
            })
            .collect()
    }

    fn analyse(&self, b: &Basis) -> Option<Analysis> {
        let k = self.k;
        let p: Vec<Pt> = (0..k).map(|i| self.point(b, 0, i)).collect();
        let q: Vec<Pt> = (0..k).map(|i| self.point(b, 1, i)).collect();
        if self.points_bad(&p, &q) {
            return None;
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
    /// the F2 matrix on the flat's parameters (checked; None on overflow)
    fn f2_gram(&self, p: &[Pt], q: &[Pt]) -> Option<Vec<Vec<i128>>> {
        let m = p[0].len();
        let mut g = vec![vec![0i128; m]; m];
        for (pts, sg) in [(p, 1i128), (q, -1i128)] {
            for &(i, j) in &self.pairs {
                let d: Vec<i128> = (0..m).map(|r| pts[j][r] as i128 - pts[i][r] as i128).collect();
                for r in 0..m {
                    if d[r] != 0 {
                        for c in 0..m {
                            if d[c] != 0 {
                                g[r][c] = g[r][c].checked_add(sg * d[r].checked_mul(d[c])?)?;
                            }
                        }
                    }
                }
            }
        }
        Some(g)
    }

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
        Self::max_isotropic(g)
    }

    /// largest dimension of a subspace of Sym^2(flat) on which Q4 vanishes identically, Q4(S) = sum over P-intervals
    /// d of <d d^T, S>^2 minus the same over Q-intervals (coordinates s(d) = (d_r d_c, r <= c)). On a type flat T
    /// the interval multisets agree, so F4(x) = sum P-int^4 - sum Q-int^4 vanishes on T; the t^2 coefficient of
    /// F4(x + t y) then gives Q4-polarization(x x^T, y y^T) = 0 for x, y in T, so Q4 vanishes on Sym^2(T), of
    /// dimension D(D+1)/2. A flat whose value is below min_dim(min_dim+1)/2 holds no type of dimension >= min_dim.
    /// None on overflow (then: do not prune).
    fn f4_isotropic(&self, p: &[Pt], q: &[Pt]) -> Option<usize> {
        let m = p[0].len();
        let rc: Vec<(usize, usize)> = (0..m).flat_map(|r| (r..m).map(move |c| (r, c))).collect();
        let nn = rc.len();
        let mut g = vec![vec![0i128; nn]; nn];
        for (pts, sg) in [(p, 1i128), (q, -1i128)] {
            for &(i, j) in &self.pairs {
                let d: Vec<i128> = (0..m).map(|r| (pts[j][r] - pts[i][r]) as i128).collect();
                let mut s = Vec::with_capacity(nn);
                for &(r, c) in &rc {
                    s.push(d[r].checked_mul(d[c])?);
                }
                for a in 0..nn {
                    if s[a] == 0 {
                        continue;
                    }
                    let sa = sg * s[a];
                    for b in 0..nn {
                        if s[b] != 0 {
                            g[a][b] = g[a][b].checked_add(sa.checked_mul(s[b])?)?;
                        }
                    }
                }
            }
        }
        Self::max_isotropic(g)
    }

    /// nullity + min(positive, negative) of the inertia of a symmetric integer matrix (exact rationals in i128;
    /// None on overflow): the largest dimension of a totally isotropic subspace of its quadratic form
    fn max_isotropic(g: Vec<Vec<i128>>) -> Option<usize> {
        let m = g.len();
        if m == 0 {
            return Some(0);
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
        if self.canon2 {
            return canon2(self.k, p, q);
        }
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
            let piso = if self.f2 { self.isotropic_dim(&an.p, &an.q) } else { None };
            if piso.map_or(false, |d| d < self.min_dim) {
                st.bad += 1;
                st.f2cut += 1;
                continue;
            }
            let m = basis.len();
            if m <= self.f4_max_m
                && self.f4_isotropic(&an.p, &an.q).map_or(false, |d| d < self.min_dim * (self.min_dim + 1) / 2)
            {
                st.bad += 1;
                F4CUT.fetch_add(1, Ordering::Relaxed);
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
            // --fast: the parent's note-difference directions (a child with l parallel to one forces two notes
            // equal) and, when the parent is tight for F2, its factorization (child_iso in O(m^2))
            let fast = if self.precut && self.fast {
                let mut dirs: HashSet<Vec<i128>> = HashSet::new();
                for pts in [&an.p, &an.q] {
                    for &(i, j) in &self.pairs {
                        let d: Vec<i128> = (0..m).map(|r| pts[j][r] as i128 - pts[i][r] as i128).collect();
                        dirs.insert(direction(&d));
                    }
                }
                let fact = if self.f2 && piso.map_or(true, |d| d <= self.min_dim) {
                    self.f2_gram(&an.p, &an.q).and_then(|g| F2Fact::new(&g))
                } else {
                    None
                };
                Some((dirs, fact))
            } else {
                None
            };
            let mut ls: HashSet<Vec<i128>> = HashSet::new();
            for (u, v, s) in opts {
                if let Some((dirs, fact)) = &fast {
                    let ((i, j), (a, b)) = (self.pairs[u], self.pairs[v]);
                    let l: Vec<i128> = (0..m)
                        .map(|r| {
                            (an.p[j][r] as i128 - an.p[i][r] as i128) - s as i128 * (an.q[b][r] as i128 - an.q[a][r] as i128)
                        })
                        .collect();
                    let dl = direction(&l);
                    if !ls.insert(dl.clone()) {
                        PRECUT_REPEAT.fetch_add(1, Ordering::Relaxed);
                        continue; // the same hyperplane on this parent: the same child
                    }
                    let collide = dirs.contains(&dl);
                    let tight = self.f2 && piso.map_or(true, |d| d <= self.min_dim);
                    let f2cut = if collide || !tight {
                        Some(false)
                    } else {
                        fact.as_ref().and_then(|f| f.child_iso(&l)).map(|d| d < self.min_dim)
                    };
                    if self.check_fast {
                        // the slow exact answers on the child's own forms
                        let cp = Self::child_points(&an.p, &l).expect("check: overflow");
                        let cq = Self::child_points(&an.q, &l).expect("check: overflow");
                        let slow_collide = cp.iter().collect::<HashSet<_>>().len() < self.k || cq.iter().collect::<HashSet<_>>().len() < self.k;
                        assert_eq!(collide, slow_collide, "collision mismatch: l {l:?}");
                        if !collide && tight {
                            let slow = self.isotropic_dim(&cp, &cq);
                            let fastv = fact.as_ref().and_then(|f| f.child_iso(&l));
                            if let (Some(sv), Some(fv)) = (slow, fastv) {
                                assert_eq!(sv, fv, "F2 child mismatch: l {l:?}, parent {:?}", fact.as_ref().map(|f| (f.pos, f.neg, f.null)));
                                CHECKED.fetch_add(1, Ordering::Relaxed);
                            }
                        }
                    }
                    if collide {
                        PRECUT_BAD.fetch_add(1, Ordering::Relaxed);
                        continue;
                    }
                    match f2cut {
                        Some(true) => {
                            PRECUT_F2.fetch_add(1, Ordering::Relaxed);
                            continue;
                        }
                        Some(false) => {}
                        None => {
                            // overflow in the fast path: the slow exact test on the child's forms
                            if let (Some(cp), Some(cq)) = (Self::child_points(&an.p, &l), Self::child_points(&an.q, &l)) {
                                if self.isotropic_dim(&cp, &cq).map_or(false, |d| d < self.min_dim) {
                                    PRECUT_F2.fetch_add(1, Ordering::Relaxed);
                                    continue;
                                }
                            }
                        }
                    }
                } else if self.precut {
                    // decide BAD / F2 for the child from the parent's note forms, without building the child.
                    // l = the edge form on the parent's parameters: (p_j - p_i) - s (q_b - q_a)
                    let ((i, j), (a, b)) = (self.pairs[u], self.pairs[v]);
                    let l: Vec<i128> = (0..m)
                        .map(|r| {
                            (an.p[j][r] as i128 - an.p[i][r] as i128) - s as i128 * (an.q[b][r] as i128 - an.q[a][r] as i128)
                        })
                        .collect();
                    if let (Some(cp), Some(cq)) = (Self::child_points(&an.p, &l), Self::child_points(&an.q, &l)) {
                        if self.points_bad(&cp, &cq) {
                            PRECUT_BAD.fetch_add(1, Ordering::Relaxed);
                            continue;
                        }
                        // a child's isotropic dimension is the parent's or one less (an isotropic subspace W of the
                        // parent meets the child in dim >= dim W - 1), so it is tested only when the parent is tight
                        if self.f2
                            && piso.map_or(true, |d| d <= self.min_dim)
                            && self.isotropic_dim(&cp, &cq).map_or(false, |d| d < self.min_dim)
                        {
                            PRECUT_F2.fetch_add(1, Ordering::Relaxed);
                            continue;
                        }
                    }
                }
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

// ---- canon2 (2026-11-26): the same canonical classes, allocation-light ----------------------------------------
// Profile (k 7 --min-dim 2 --fast): ~75% of the time was canon (refine's Vec signatures, sorts, binary searches,
// malloc/free). canon2 keeps the method (color refinement on the 2k notes + individualization, certificate =
// arc classes relabeled in leaf order, min over leaves and variants) with: class colors = order-free 64-bit hashes
// of their arc multisets; note colors = ranks of (old color, hash of its arcs) (an exact refinement: the old color
// is part of the key; a hash collision only merges colors = more leaves, never a wrong certificate, since the
// certificate spells out the whole class structure); the leaf search runs only on the variants (mirror / swap)
// whose refinement trace is smallest (the trace is an invariant, so isomorphic inputs choose matching variants).

fn mix(mut x: u64) -> u64 {
    x = x.wrapping_add(0x9e3779b97f4a7c15);
    x = (x ^ (x >> 30)).wrapping_mul(0xbf58476d1ce4e5b9);
    x = (x ^ (x >> 27)).wrapping_mul(0x94d049bb133111eb);
    x ^ (x >> 31)
}

fn mix3(a: u64, b: u64, c: u64) -> u64 {
    mix(mix(mix(a) ^ b) ^ c)
}

/// arc classes of variant (a, b): cls[side*k*k + i*k + j] = id of the difference vector b_j - b_i (u16::MAX on
/// the diagonal), ids numbered by sorting the differences (no per-arc allocation)
fn class_table(k: usize, a: &[Pt], b: &[Pt], sa: i64, sb: i64) -> (Vec<u16>, usize) {
    let m = a[0].len();
    let mut diffs: Vec<i64> = vec![0; 2 * k * k * m];
    let mut arcs: Vec<usize> = Vec::with_capacity(2 * k * (k - 1));
    for (side, (pts, sg)) in [(a, sa), (b, sb)].into_iter().enumerate() {
        for i in 0..k {
            for j in 0..k {
                if i != j {
                    let x = side * k * k + i * k + j;
                    for r in 0..m {
                        diffs[x * m + r] = sg * (pts[j][r] - pts[i][r]);
                    }
                    arcs.push(x);
                }
            }
        }
    }
    let key = |x: usize| &diffs[x * m..x * m + m];
    arcs.sort_unstable_by(|&x, &y| key(x).cmp(key(y)));
    let mut cls = vec![u16::MAX; 2 * k * k];
    let mut n = 0usize;
    for t in 0..arcs.len() {
        if t > 0 && key(arcs[t]) != key(arcs[t - 1]) {
            n += 1;
        }
        cls[arcs[t]] = n as u16;
    }
    (cls, n + 1)
}

/// stable refinement of note colors (ranks); returns the colors and an invariant trace of the refinement
fn refine2(k: usize, cls: &[u16], ncls: usize, mut col: Vec<u32>) -> (Vec<u32>, u64) {
    let nv = 2 * k;
    let mut trace = 0u64;
    let mut csig = vec![0u64; ncls];
    let mut acc = vec![0u64; nv];
    let mut keys: Vec<(u32, u64, usize)> = Vec::with_capacity(nv);
    loop {
        let ncol_before = {
            let mut c = col.clone();
            c.sort_unstable();
            c.dedup();
            c.len()
        };
        csig.iter_mut().for_each(|x| *x = 0);
        for side in 0..2 {
            for i in 0..k {
                for j in 0..k {
                    if i != j {
                        let c = cls[side * k * k + i * k + j] as usize;
                        csig[c] = csig[c].wrapping_add(mix3(side as u64, col[side * k + i] as u64, col[side * k + j] as u64));
                    }
                }
            }
        }
        acc.iter_mut().for_each(|x| *x = 0);
        for side in 0..2 {
            for i in 0..k {
                for j in 0..k {
                    if i != j {
                        let c = csig[cls[side * k * k + i * k + j] as usize];
                        let (vi, vj) = (side * k + i, side * k + j);
                        acc[vi] = acc[vi].wrapping_add(mix3(c, 0, col[vj] as u64));
                        acc[vj] = acc[vj].wrapping_add(mix3(c, 1, col[vi] as u64));
                    }
                }
            }
        }
        keys.clear();
        keys.extend((0..nv).map(|v| (col[v], acc[v], v)));
        keys.sort_unstable();
        let mut newcol = vec![0u32; nv];
        let mut r = 0u32;
        for t in 0..nv {
            if t > 0 && (keys[t].0, keys[t].1) != (keys[t - 1].0, keys[t - 1].1) {
                r += 1;
            }
            newcol[keys[t].2] = r;
            trace = mix3(trace, keys[t].0 as u64, keys[t].1);
        }
        let stable = (r as usize + 1) == ncol_before;
        col = newcol;
        if stable {
            return (col, trace);
        }
    }
}

fn search_leaves2(k: usize, cls: &[u16], ncls: usize, col: Vec<u32>, best: &mut Option<Vec<u8>>) {
    let nv = 2 * k;
    // first (smallest color) non-singleton cell
    let mut sorted = col.clone();
    sorted.sort_unstable();
    let cell = (1..nv).filter(|&t| sorted[t] == sorted[t - 1]).map(|t| sorted[t]).next();
    let Some(cell) = cell else {
        let mut order: Vec<usize> = (0..nv).collect();
        order.sort_unstable_by_key(|&v| col[v]);
        let mut relabel = vec![u8::MAX; ncls];
        let mut next = 0u8;
        let mut cert = Vec::with_capacity(2 * k * (k - 1));
        for side in 0..2 {
            let ord: Vec<usize> = order.iter().filter(|&&v| v / k == side).map(|&v| v - side * k).collect();
            for &i in &ord {
                for &j in &ord {
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
        let (c2, _) = refine2(k, cls, ncls, ind);
        search_leaves2(k, cls, ncls, c2, best);
    }
}

fn canon2(k: usize, p: &[Pt], q: &[Pt]) -> u128 {
    let init: Vec<u32> = (0..2 * k).map(|v| (v / k) as u32).collect();
    let mut cand: Vec<(u64, Vec<u16>, usize, Vec<u32>)> = Vec::with_capacity(8);
    for sp in [1i64, -1] {
        for sq in [1i64, -1] {
            for (x, y, sx, sy) in [(p, q, sp, sq), (q, p, sq, sp)] {
                let (cls, ncls) = class_table(k, x, y, sx, sy);
                let (col, trace) = refine2(k, &cls, ncls, init.clone());
                // the number of classes is part of the invariant too
                cand.push((mix3(trace, ncls as u64, 0), cls, ncls, col));
            }
        }
    }
    let tmin = cand.iter().map(|c| c.0).min().unwrap();
    let mut best: Option<Vec<u8>> = None;
    for (t, cls, ncls, col) in cand {
        if t == tmin {
            search_leaves2(k, &cls, ncls, col, &mut best);
        }
    }
    h128(&best.unwrap())
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
    let mut s = Search::new(k, !flag("--no-canon"), !flag("--no-f2"), min_dim);
    s.f4_max_m = opt("--f4").map(|x| x.parse().unwrap()).unwrap_or(0);
    s.precut = flag("--precut") || flag("--fast") || flag("--check-fast");
    s.fast = flag("--fast") || flag("--check-fast");
    s.check_fast = flag("--check-fast");
    s.canon2 = flag("--canon2");
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
                        println!("  {}/{} frontier flats done, {} nodes this session ({} in done flats: {} bad, {} f2-cut, {} f4-cut, {} dups), {} classes, {} type flats, free {:?} GB{}, {:.0} s",
                                 ndone0 + f, front.len(), shared.nodes.load(Ordering::Relaxed), a.nodes, a.bad, a.f2cut, F4CUT.load(Ordering::Relaxed), a.dup,
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
    println!("k {k}: {} nodes, {} bad ({} by f2, {} by f4), {} dups, {} cut at the parent ({} bad, {} f2, {} repeats; {} fast checks verified), good nodes {}, {} type flats, {} maximal classes, {}, {:.1} s",
             total.nodes, total.bad, total.f2cut, F4CUT.load(Ordering::Relaxed), total.dup,
             PRECUT_BAD.load(Ordering::Relaxed) + PRECUT_F2.load(Ordering::Relaxed), PRECUT_BAD.load(Ordering::Relaxed),
             PRECUT_F2.load(Ordering::Relaxed), PRECUT_REPEAT.load(Ordering::Relaxed), CHECKED.load(Ordering::Relaxed), total.nodes - total.bad, types.len(), reps.len(),
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
