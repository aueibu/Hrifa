//! zprod-rs: the `zprod.py --fast --interval-odd q` factor generation and U search, in Rust.
//!
//! Same algorithm as zprod.py (gen_V and search_U with --fast), ported step for step so the results are
//! identical, including the per-factor node budget (counted the same way). Writes raw products, one JSON
//! line per factor V that gave products or hit the budget; `zprod_rs.py` groups them into families with
//! the zgen code. Standard library only.
//!
//! usage: zprod-rs --primes 3 5 7 --q 99 --k 6 7 8 --shapes 3,1 4,1 [--ucoeffs 0 1 2] [--max-neg 1]
//!                 [--max-nodes 2000000] [--threads 16] [--count-only] --out products.jsonl

use std::collections::{HashMap, HashSet};
use std::io::{BufWriter, Write};
use std::sync::atomic::{AtomicU64, AtomicUsize, Ordering};
use std::sync::mpsc::sync_channel;
use std::sync::Arc;
use std::time::Instant;

type Pt = Vec<i32>;
type Factor = Vec<(Pt, i32)>; // sorted by point, lowest point 0 with coefficient +1

// ------------------------------------------------------------------------------------------- arguments
struct Args {
    primes: Vec<u64>,
    q: u64,
    k: Vec<i64>,
    shapes: Vec<(usize, usize)>,
    ucoeffs: Vec<i32>,
    max_neg: i32,
    max_nodes: u64,
    threads: usize,
    count_only: bool,
    no_upair: bool,
    out: String,
    cliques: usize,
    enumerate: bool,
    mem_gb: f64,
}

fn parse_args() -> Args {
    let argv: Vec<String> = std::env::args().skip(1).collect();
    let mut a = Args {
        primes: vec![],
        q: 0,
        k: vec![],
        shapes: vec![],
        ucoeffs: vec![0, 1, 2],
        max_neg: 1,
        max_nodes: 2_000_000,
        threads: 2,
        count_only: false,
        no_upair: false,
        out: String::new(),
        cliques: 0,
        enumerate: false,
        mem_gb: 6.0,
    };
    let mut i = 0;
    let vals = |i: &mut usize| -> Vec<String> {
        let mut v = vec![];
        while *i + 1 < argv.len() && !argv[*i + 1].starts_with("--") {
            *i += 1;
            v.push(argv[*i].clone());
        }
        v
    };
    while i < argv.len() {
        let key = argv[i].clone();
        match key.as_str() {
            "--primes" => a.primes = vals(&mut i).iter().map(|s| s.parse().unwrap()).collect(),
            "--q" => a.q = vals(&mut i)[0].parse().unwrap(),
            "--k" => a.k = vals(&mut i).iter().map(|s| s.parse().unwrap()).collect(),
            "--shapes" => {
                a.shapes = vals(&mut i)
                    .iter()
                    .map(|s| {
                        let mut it = s.split(',');
                        (it.next().unwrap().parse().unwrap(), it.next().unwrap().parse().unwrap())
                    })
                    .collect()
            }
            "--ucoeffs" => {
                // negative numbers start with '-' but not "--"
                let mut v = vec![];
                while i + 1 < argv.len() && !argv[i + 1].starts_with("--") {
                    i += 1;
                    v.push(argv[i].parse().unwrap());
                }
                a.ucoeffs = v;
            }
            "--max-neg" => a.max_neg = vals(&mut i)[0].parse().unwrap(),
            "--max-nodes" => a.max_nodes = vals(&mut i)[0].parse().unwrap(),
            "--threads" => a.threads = vals(&mut i)[0].parse().unwrap(),
            "--count-only" => a.count_only = true,
            "--no-upair" => a.no_upair = true,
            "--selftest-hull" => SELFTEST.store(true, std::sync::atomic::Ordering::Relaxed),
            "--out" => a.out = vals(&mut i)[0].clone(),
            "--cliques" => a.cliques = vals(&mut i)[0].parse().unwrap(),
            "--enum" => a.enumerate = true,
            "--mem-gb" => a.mem_gb = vals(&mut i)[0].parse().unwrap(),
            _ => panic!("unknown argument {key}"),
        }
        i += 1;
    }
    assert!(!a.primes.is_empty() && a.q > 0 && !a.k.is_empty() && !a.shapes.is_empty() && !a.out.is_empty());
    a
}

// ------------------------------------------------------------------------------------------- lattice
fn sub(a: &[i32], b: &[i32]) -> Pt {
    a.iter().zip(b).map(|(x, y)| x - y).collect()
}
fn add(a: &[i32], b: &[i32]) -> Pt {
    a.iter().zip(b).map(|(x, y)| x + y).collect()
}

/// zgen.gamut(primes, q): exponent vectors of a/b, a and b odd, smooth, coprime, both <= q (sorted)
fn gamut(primes: &[u64], q: u64) -> Vec<Pt> {
    fn rec(primes: &[u64], i: usize, n: u64, q: u64, e: &mut Pt, out: &mut Vec<Pt>) {
        if i == primes.len() {
            out.push(e.clone());
            return;
        }
        let mut m = n;
        let mut k = 0;
        loop {
            e[i] = k;
            rec(primes, i + 1, m, q, e, out);
            if m > q / primes[i] {
                break;
            }
            m *= primes[i];
            if m > q {
                break;
            }
            k += 1;
        }
        e[i] = 0;
    }
    let mut odds = vec![];
    let mut e = vec![0; primes.len()];
    rec(primes, 0, 1, q, &mut e, &mut odds);
    let mut set = HashSet::new();
    for a in &odds {
        for b in &odds {
            if a.iter().zip(b).all(|(x, y)| *x == 0 || *y == 0) {
                set.insert(sub(a, b));
            }
        }
    }
    let mut v: Vec<Pt> = set.into_iter().collect();
    v.sort();
    v
}

// ------------------------------------------------------------------------------------------- exact hull test
#[derive(Clone, Copy, PartialEq)]
struct F {
    n: i128,
    d: i128,
}
fn gcd(a: i128, b: i128) -> i128 {
    let (mut a, mut b) = (a.abs(), b.abs());
    while b != 0 {
        let t = a % b;
        a = b;
        b = t;
    }
    a
}
impl F {
    fn new(n: i128, d: i128) -> F {
        let g = gcd(n, d).max(1);
        let s = if d < 0 { -1 } else { 1 };
        F { n: s * n / g, d: s * d / g }
    }
    fn int(n: i128) -> F {
        F { n, d: 1 }
    }
    fn zero(&self) -> bool {
        self.n == 0
    }
    fn sub(self, o: F) -> F {
        F::new(self.n * o.d - o.n * self.d, self.d * o.d)
    }
    fn mul(self, o: F) -> F {
        F::new(self.n * o.n, self.d * o.d)
    }
    fn div(self, o: F) -> F {
        F::new(self.n * o.d, self.d * o.n)
    }
}

/// zprod._bary: solve x = sum l_i p_i, sum l_i = 1 exactly; None if no unique solution
#[allow(dead_code)]
fn bary(x: &[i32], pts: &[&Pt]) -> Option<Vec<F>> {
    let r = pts.len();
    let d = x.len();
    let mut a: Vec<Vec<F>> = (0..d)
        .map(|i| {
            let mut row: Vec<F> = pts.iter().map(|p| F::int(p[i] as i128)).collect();
            row.push(F::int(x[i] as i128));
            row
        })
        .collect();
    a.push(vec![F::int(1); r + 1]);
    let rows = a.len();
    let mut rr = 0;
    for c in 0..r {
        let p = (rr..rows).find(|&i| !a[i][c].zero())?;
        a.swap(rr, p);
        let pv = a[rr][c];
        a[rr] = a[rr].iter().map(|v| v.div(pv)).collect();
        for i in 0..rows {
            if i != rr && !a[i][c].zero() {
                let f = a[i][c];
                let prow = a[rr].clone();
                a[i] = a[i].iter().zip(&prow).map(|(v, w)| v.sub(f.mul(*w))).collect();
            }
        }
        rr += 1;
    }
    for i in rr..rows {
        if !a[i][r].zero() {
            return None;
        }
    }
    Some((0..r).map(|i| a[i][r]).collect())
}

fn combinations(n: usize, r: usize) -> Vec<Vec<usize>> {
    let mut out = vec![];
    if r > n {
        return out;
    }
    // lexicographic order, like itertools.combinations
    let mut idx: Vec<usize> = (0..r).collect();
    loop {
        out.push(idx.clone());
        let mut i = r;
        while i > 0 && idx[i - 1] == i - 1 + n - r {
            i -= 1;
        }
        if i == 0 {
            return out;
        }
        idx[i - 1] += 1;
        for j in i..r {
            idx[j] = idx[j - 1] + 1;
        }
    }
}

const MAXD: usize = 8; // up to 8 odd primes (23-limit)
const MAXR: usize = MAXD + 1;

/// bary() without heap allocation (it ran millions of times and 16 threads fought over the allocator):
/// is x = sum l_i p_i, sum l_i = 1 uniquely solvable with every l_i >= 0?
fn bary_nonneg(x: &[i32], pts: &[&[i32]; MAXR], r: usize) -> bool {
    let d = x.len();
    let rows = d + 1;
    let mut a = [[F::int(0); MAXR + 1]; MAXD + 1];
    for i in 0..d {
        for c in 0..r {
            a[i][c] = F::int(pts[c][i] as i128);
        }
        a[i][r] = F::int(x[i] as i128);
    }
    for c in 0..=r {
        a[d][c] = F::int(1);
    }
    let mut rr = 0;
    for c in 0..r {
        let mut p = rr;
        while p < rows && a[p][c].zero() {
            p += 1;
        }
        if p == rows {
            return false;
        }
        a.swap(rr, p);
        let pv = a[rr][c];
        for k in 0..=r {
            a[rr][k] = a[rr][k].div(pv);
        }
        for i in 0..rows {
            if i != rr && !a[i][c].zero() {
                let f = a[i][c];
                for k in 0..=r {
                    a[i][k] = a[i][k].sub(f.mul(a[rr][k]));
                }
            }
        }
        rr += 1;
    }
    for i in rr..rows {
        if !a[i][r].zero() {
            return false;
        }
    }
    (0..r).all(|i| a[i][r].n >= 0)
}

/// zprod.in_hull (Caratheodory: a convex combination of some affinely independent subset)
fn in_hull(x: &[i32], pts: &[Pt]) -> bool {
    let d = x.len();
    assert!(d <= MAXD, "more than {MAXD} primes");
    let n = pts.len();
    let empty: &[i32] = &[];
    for r in 1..=n.min(d + 1) {
        let mut idx = [0usize; MAXR];
        for (j, v) in idx.iter_mut().enumerate().take(r) {
            *v = j;
        }
        loop {
            let mut sp: [&[i32]; MAXR] = [empty; MAXR];
            for j in 0..r {
                sp[j] = &pts[idx[j]];
            }
            if bary_nonneg(x, &sp, r) {
                return true;
            }
            let mut i = r;
            while i > 0 && idx[i - 1] == i - 1 + n - r {
                i -= 1;
            }
            if i == 0 {
                break;
            }
            idx[i - 1] += 1;
            for j in i..r {
                idx[j] = idx[j - 1] + 1;
            }
        }
    }
    false
}

/// zprod.interior_points, in itertools.product (lexicographic) order
fn interior_points(plus: &[Pt]) -> Vec<Pt> {
    let dim = plus[0].len();
    let lo: Vec<i32> = (0..dim).map(|i| plus.iter().map(|p| p[i]).min().unwrap()).collect();
    let hi: Vec<i32> = (0..dim).map(|i| plus.iter().map(|p| p[i]).max().unwrap()).collect();
    let mut out = vec![];
    let mut x = lo.clone();
    loop {
        if !plus.iter().any(|p| *p == x) && in_hull(&x, plus) {
            out.push(x.clone());
        }
        let mut i = dim;
        loop {
            if i == 0 {
                return out;
            }
            i -= 1;
            if x[i] < hi[i] {
                x[i] += 1;
                for j in i + 1..dim {
                    x[j] = lo[j];
                }
                break;
            }
        }
    }
}

/// exact integer determinant (Bareiss elimination), n <= MAXD
fn det_int(m: &[[i128; MAXD]; MAXD], n: usize) -> i128 {
    if n == 0 {
        return 1;
    }
    let mut a = *m;
    let mut sign = 1i128;
    let mut prev = 1i128;
    for k in 0..n - 1 {
        if a[k][k] == 0 {
            let mut p = k + 1;
            while p < n && a[p][k] == 0 {
                p += 1;
            }
            if p == n {
                return 0;
            }
            a.swap(k, p);
            sign = -sign;
        }
        for i in k + 1..n {
            for j in k + 1..n {
                a[i][j] = (a[i][j] * a[k][k] - a[i][k] * a[k][j]) / prev;
            }
        }
        prev = a[k][k];
    }
    sign * a[n - 1][n - 1]
}

/// Exact membership in the convex hull of a small point set, in integers only, set up once per set.
/// The points span an affine space of dimension r: x is in it when x - p0 = sum lambda_i b_i, solved on r
/// coordinates (cols) with an integer adjugate and checked on the others. Inside it, the hull's facets come
/// from r-subsets of the points projected onto cols (the projection is one-to-one on the affine space).
struct HullTest {
    r: usize,
    p0: Pt,
    cols: Vec<usize>,
    others: Vec<usize>,
    det: i128,
    adj: [[i128; MAXD]; MAXD],
    b: Vec<Pt>,
    facets: Vec<([i128; MAXD], i128)>,
}

impl HullTest {
    fn new(pts: &[Pt]) -> HullTest {
        let d = pts[0].len();
        assert!(d <= MAXD, "more than {MAXD} primes");
        let p0 = pts[0].clone();
        // basis of the differences, by fraction-free row reduction
        let mut ech: Vec<(usize, Vec<i128>)> = vec![];
        let mut b: Vec<Pt> = vec![];
        for p in &pts[1..] {
            let orig = sub(p, &p0);
            let mut v: Vec<i128> = orig.iter().map(|&x| x as i128).collect();
            for (pc, row) in &ech {
                if v[*pc] != 0 {
                    let (a, c) = (row[*pc], v[*pc]);
                    for k in 0..d {
                        v[k] = v[k] * a - row[k] * c;
                    }
                    let g = v.iter().fold(0i128, |g, &x| gcd(g, x));
                    if g > 1 {
                        for x in v.iter_mut() {
                            *x /= g;
                        }
                    }
                }
            }
            if let Some(pc) = v.iter().position(|&x| x != 0) {
                ech.push((pc, v));
                b.push(orig);
            }
        }
        let r = b.len();
        // r coordinates on which the basis is independent
        let mut cols = vec![];
        let mut det = 0;
        let mut a = [[0i128; MAXD]; MAXD];
        for c in combinations(d, r) {
            let mut m = [[0i128; MAXD]; MAXD];
            for j in 0..r {
                for i in 0..r {
                    m[j][i] = b[i][c[j]] as i128; // A[j][i] = b_i[cols_j]
                }
            }
            let dt = det_int(&m, r);
            if dt != 0 {
                cols = c;
                det = dt;
                a = m;
                break;
            }
        }
        let others: Vec<usize> = (0..d).filter(|i| !cols.contains(i)).collect();
        // adjugate of A: adj[i][j] = (-1)^(i+j) det(A without row j and column i)
        let mut adj = [[0i128; MAXD]; MAXD];
        for i in 0..r {
            for j in 0..r {
                let mut m = [[0i128; MAXD]; MAXD];
                let mut rr = 0;
                for row in 0..r {
                    if row == j {
                        continue;
                    }
                    let mut cc = 0;
                    for col in 0..r {
                        if col == i {
                            continue;
                        }
                        m[rr][cc] = a[row][col];
                        cc += 1;
                    }
                    rr += 1;
                }
                let s = if (i + j) % 2 == 0 { 1 } else { -1 };
                adj[i][j] = s * det_int(&m, r - 1);
            }
        }
        // facets of the projected points
        let proj: Vec<Vec<i128>> = pts.iter().map(|p| cols.iter().map(|&c| (p[c] - p0[c]) as i128).collect()).collect();
        let mut facets = vec![];
        for s in combinations(proj.len(), r) {
            let mut n = [0i128; MAXD];
            for j in 0..r {
                let mut m = [[0i128; MAXD]; MAXD];
                for (rr, &si) in s[1..].iter().enumerate() {
                    let mut cc = 0;
                    for col in 0..r {
                        if col == j {
                            continue;
                        }
                        m[rr][cc] = proj[si][col] - proj[s[0]][col];
                        cc += 1;
                    }
                }
                let sg = if j % 2 == 0 { 1 } else { -1 };
                n[j] = sg * det_int(&m, r - 1);
            }
            if n[..r].iter().all(|&x| x == 0) {
                continue;
            }
            let dot = |q: &Vec<i128>| (0..r).map(|j| n[j] * q[j]).sum::<i128>();
            let c = dot(&proj[s[0]]);
            let vals: Vec<i128> = proj.iter().map(|q| dot(q) - c).collect();
            if vals.iter().all(|&v| v <= 0) {
                facets.push((n, c));
            } else if vals.iter().all(|&v| v >= 0) {
                let mut nn = [0i128; MAXD];
                for j in 0..r {
                    nn[j] = -n[j];
                }
                facets.push((nn, -c));
            }
        }
        HullTest { r, p0, cols, others, det, adj, b, facets }
    }

    #[inline]
    fn contains(&self, x: &[i32]) -> bool {
        let r = self.r;
        let mut y = [0i128; MAXD];
        for j in 0..r {
            y[j] = (x[self.cols[j]] - self.p0[self.cols[j]]) as i128;
        }
        if !self.others.is_empty() {
            let mut lam = [0i128; MAXD]; // det * lambda
            for i in 0..r {
                lam[i] = (0..r).map(|j| self.adj[i][j] * y[j]).sum();
            }
            for &o in &self.others {
                let lhs = self.det * (x[o] - self.p0[o]) as i128;
                let rhs: i128 = (0..r).map(|i| lam[i] * self.b[i][o] as i128).sum();
                if lhs != rhs {
                    return false;
                }
            }
        }
        self.facets.iter().all(|(n, c)| (0..r).map(|j| n[j] * y[j]).sum::<i128>() <= *c)
    }
}

static SELFTEST: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

/// interior_points with HullTest instead of the subset-by-subset test (same points, same order)
fn interior_points_fast(plus: &[Pt]) -> Vec<Pt> {
    let dim = plus[0].len();
    let ht = HullTest::new(plus);
    let lo: Vec<i32> = (0..dim).map(|i| plus.iter().map(|p| p[i]).min().unwrap()).collect();
    let hi: Vec<i32> = (0..dim).map(|i| plus.iter().map(|p| p[i]).max().unwrap()).collect();
    let mut out = vec![];
    let mut x = lo.clone();
    loop {
        if !plus.iter().any(|p| *p == x) && ht.contains(&x) {
            out.push(x.clone());
        }
        let mut i = dim;
        loop {
            if i == 0 {
                if SELFTEST.load(std::sync::atomic::Ordering::Relaxed) {
                    let slow = interior_points(plus);
                    if slow != out {
                        eprintln!("SELFTEST MISMATCH plus {plus:?}: fast {out:?} slow {slow:?}");
                        std::process::exit(3);
                    }
                }
                return out;
            }
            i -= 1;
            if x[i] < hi[i] {
                x[i] += 1;
                for j in i + 1..dim {
                    x[j] = lo[j];
                }
                break;
            }
        }
    }
}

fn normalize(terms: &[(Pt, i32)]) -> Factor {
    let m = terms.iter().map(|(p, _)| p).min().unwrap().clone();
    let cm = terms.iter().find(|(p, _)| *p == m).unwrap().1;
    let sgn = if cm > 0 { 1 } else { -1 };
    let mut v: Factor = terms.iter().map(|(p, c)| (sub(p, &m), sgn * c)).collect();
    v.sort();
    v
}

fn reversal(v: &Factor) -> Factor {
    let t: Vec<(Pt, i32)> = v.iter().map(|(p, c)| (p.iter().map(|x| -x).collect(), *c)).collect();
    normalize(&t)
}

// ------------------------------------------------------------------------------------------- V generation
/// zprod.gen_V with --fast (HD = D): plus points from the lexicographically positive allowed intervals,
/// every pairwise difference allowed; minus points among the lattice points of the plus points' hull.
/// `comp` is that pairwise test as a table (no allocation in the inner loop).
struct GenCtx {
    boxv: Vec<Pt>,
    comp: Vec<u8>, // comp[a * n + b] = 1 when boxv[a] - boxv[b] is an allowed interval
    n: usize,
    dim: usize,
}

impl GenCtx {
    fn new(d: &[Pt]) -> GenCtx {
        let dim = d[0].len();
        let zero = vec![0; dim];
        let dset: HashSet<Pt> = d.iter().cloned().collect();
        let boxv: Vec<Pt> = d.iter().filter(|p| **p > zero).cloned().collect(); // lex positive allowed intervals
        let n = boxv.len();
        let mut comp = vec![0u8; n * n];
        for a in 0..n {
            for b in 0..n {
                if dset.contains(&sub(&boxv[a], &boxv[b])) {
                    comp[a * n + b] = 1;
                }
            }
        }
        GenCtx { boxv, comp, n, dim }
    }
    #[inline]
    fn ok(&self, a: usize, b: usize) -> bool {
        self.comp[a * self.n + b] == 1
    }
}

/// One unit of generation work: a shape and the indices of its first one or two non-zero plus points
/// (a valid prefix: pairwise differences allowed). The units of a shape together generate exactly what
/// gen_v generates; two-point prefixes keep the units small (one-point ones were badly unbalanced).
type Root = ((usize, usize), Vec<usize>);

fn roots(g: &GenCtx, shapes: &[(usize, usize)]) -> Vec<Root> {
    let mut out = vec![];
    for &sh in shapes {
        if sh.0 <= 1 {
            out.push((sh, vec![]));
        } else if sh.0 == 2 {
            for j in 0..g.n {
                out.push((sh, vec![j]));
            }
        } else {
            for j1 in 0..g.n {
                for j2 in j1 + 1..g.n {
                    if g.ok(j2, j1) {
                        out.push((sh, vec![j1, j2]));
                    }
                }
            }
        }
    }
    out
}

/// gen_v restricted to one Root
fn gen_root<Fn_: FnMut(Factor)>(g: &GenCtx, root: &Root, emit: Fn_) {
    gen_v_impl(g, &[root.0], &root.1, emit)
}

fn gen_v_impl<Fn_: FnMut(Factor)>(g: &GenCtx, shapes: &[(usize, usize)], prefix: &[usize], mut emit: Fn_) {
    fn plus_sets<G: FnMut(&[usize])>(g: &GenCtx, need: usize, start: usize, chosen: &mut Vec<usize>, cb: &mut G) {
        if need == 0 {
            cb(chosen);
            return;
        }
        for j in start..g.n {
            if chosen.iter().all(|&w| g.ok(j, w)) {
                chosen.push(j);
                plus_sets(g, need - 1, j + 1, chosen, cb);
                chosen.pop();
            }
        }
    }
    let zero = vec![0; g.dim];
    for &(vp, vm) in shapes {
        // with a prefix, the first non-zero plus points are fixed (roots() checked their differences)
        let mut chosen: Vec<usize> = prefix.to_vec();
        let need = vp - 1 - chosen.len();
        let start = chosen.last().map_or(0, |j| j + 1);
        plus_sets(g, need, start, &mut chosen, &mut |rest: &[usize]| {
            let mut plus = vec![zero.clone()];
            plus.extend(rest.iter().map(|&j| g.boxv[j].clone()));
            let minus_sets: Vec<Vec<Pt>> = if vm == 0 {
                vec![vec![]]
            } else {
                let inner = interior_points_fast(&plus);
                if inner.len() < vm {
                    return;
                }
                combinations(inner.len(), vm).into_iter().map(|c| c.iter().map(|&i| inner[i].clone()).collect()).collect()
            };
            for minus in minus_sets {
                let mut terms: Vec<(Pt, i32)> = plus.iter().map(|p| (p.clone(), 1)).collect();
                for p in &minus {
                    terms.push((p.clone(), -1));
                }
                let v = normalize(&terms);
                let r = reversal(&v);
                let negv: Vec<(Pt, i32)> = v.iter().map(|(p, c)| (p.clone(), -c)).collect();
                if r == v || r == normalize(&negv) {
                    continue;
                }
                emit(v);
            }
        });
    }
}

// ------------------------------------------------------------------------------------------- U search
/// Points used by the search lie in [-2B, 2B] per axis (U and V coordinates are within B = the largest
/// |coordinate| of an allowed interval), so they are cells of a fixed grid: no hashing, no allocation.
/// Differences of P points lie in [-4B, 4B]: a second encoding with a bit table of the allowed intervals.
struct Ctx {
    n: usize,          // candidate U points: allowed intervals >= 0, lexicographic
    cand_g: Vec<i64>,  // their grid cells
    cand_denc: Vec<i64>, // their difference-grid codes (U - U pruning)
    upair: bool,
    dim: usize,
    gb: Vec<i64>,      // B per axis
    gstride: Vec<i64>, // grid (width 4B + 1)
    gtotal: usize,
    denc: Vec<i64>,    // per grid cell: its difference-grid code
    dcenter: i64,
    dbits: Vec<u64>,
    dhash: HashSet<i64>,
    use_bits: bool,
    ucoeffs: Vec<i32>,
    max_neg: i32,
    max_nodes: u64,
    ks: Vec<i64>,
}

fn strides(width: &[i64]) -> Vec<i64> {
    let dim = width.len();
    let mut s = vec![1i64; dim];
    for i in (0..dim.saturating_sub(1)).rev() {
        s[i] = s[i + 1] * width[i + 1];
    }
    s
}

impl Ctx {
    fn new(d: &[Pt], args: &Args) -> Ctx {
        let dim = d[0].len();
        let b: Vec<i64> = (0..dim).map(|i| d.iter().map(|p| p[i].abs() as i64).max().unwrap()).collect();
        let gwidth: Vec<i64> = b.iter().map(|x| 4 * x + 1).collect();
        let gstride = strides(&gwidth);
        let gcenter: i64 = (0..dim).map(|i| 2 * b[i] * gstride[i]).sum();
        let gtotal: usize = gwidth.iter().product::<i64>() as usize;
        let dwidth: Vec<i64> = b.iter().map(|x| 8 * x + 1).collect();
        let dstride = strides(&dwidth);
        let dcenter: i64 = (0..dim).map(|i| 4 * b[i] * dstride[i]).sum();
        let dtotal: i64 = dwidth.iter().product();
        let use_bits = dtotal <= (1i64 << 33);
        let mut dbits = vec![];
        let mut dhash = HashSet::new();
        if use_bits {
            dbits = vec![0u64; (dtotal as usize + 63) / 64];
        }
        for p in d {
            let e: i64 = p.iter().zip(&dstride).map(|(x, s)| *x as i64 * s).sum::<i64>() + dcenter;
            if use_bits {
                dbits[(e >> 6) as usize] |= 1 << (e & 63);
            } else {
                dhash.insert(e);
            }
        }
        // difference-grid code of every grid cell
        let mut denc = vec![0i64; gtotal];
        for (g, slot) in denc.iter_mut().enumerate() {
            let mut rem = g as i64;
            let mut code = 0;
            for i in 0..dim {
                let c = rem / gstride[i];
                rem %= gstride[i];
                code += (c - 2 * b[i]) * dstride[i];
            }
            *slot = code;
        }
        let zero = vec![0; dim];
        let cand: Vec<&Pt> = d.iter().filter(|p| **p >= zero).collect();
        let cand_g: Vec<i64> = cand.iter().map(|p| p.iter().zip(&gstride).map(|(x, s)| *x as i64 * s).sum::<i64>() + gcenter).collect();
        Ctx {
            n: cand.len(),
            cand_denc: cand_g.iter().map(|&g| denc[g as usize]).collect(),
            cand_g,
            upair: !args.no_upair,
            dim,
            gb: b,
            gstride,
            gtotal,
            denc,
            dcenter,
            dbits,
            dhash,
            use_bits,
            ucoeffs: args.ucoeffs.clone(),
            max_neg: args.max_neg,
            max_nodes: args.max_nodes,
            ks: args.k.clone(),
        }
    }
    fn goff(&self, p: &[i32]) -> i64 {
        p.iter().zip(&self.gstride).map(|(x, s)| *x as i64 * s).sum()
    }
    fn decode(&self, g: usize) -> Pt {
        let mut rem = g as i64;
        (0..self.dim)
            .map(|i| {
                let c = rem / self.gstride[i];
                rem %= self.gstride[i];
                (c - 2 * self.gb[i]) as i32
            })
            .collect()
    }
    #[inline]
    fn allowed(&self, diff_code: i64) -> bool {
        let e = diff_code + self.dcenter;
        if self.use_bits {
            (self.dbits[(e >> 6) as usize] >> (e & 63)) & 1 == 1
        } else {
            self.dhash.contains(&e)
        }
    }
}

/// per-thread buffers, reused across factors
struct Workspace {
    pslot: Vec<u32>, // grid cell -> compact P id (u32::MAX = unused)
    qslot: Vec<u32>,
    p_cell: Vec<u32>, // compact id -> grid cell
    q_cell: Vec<u32>,
    pid: Vec<u32>, // pid[i * nv + j] = compact id of cand[i] + V[j]
    qid: Vec<u32>,
    last: Vec<u32>,
    pos: Vec<u32>,
    fin_p_off: Vec<u32>, // finals as flat lists: fin_p[fin_p_off[i]..fin_p_off[i + 1]]
    fin_p: Vec<u32>,
    fin_q_off: Vec<u32>,
    fin_q: Vec<u32>,
    p_enc: Vec<i64>,
    pc: Vec<i16>,
    qc: Vec<i16>,
    notes: Vec<u32>,
    unz: Vec<u32>, // candidates with a nonzero U coefficient, in order
}

impl Workspace {
    fn new(ctx: &Ctx) -> Workspace {
        Workspace {
            pslot: vec![u32::MAX; ctx.gtotal],
            qslot: vec![u32::MAX; ctx.gtotal],
            p_cell: vec![],
            q_cell: vec![],
            pid: vec![],
            qid: vec![],
            last: vec![],
            pos: vec![],
            fin_p_off: vec![],
            fin_p: vec![],
            fin_q_off: vec![],
            fin_q: vec![],
            p_enc: vec![],
            pc: vec![],
            qc: vec![],
            notes: vec![],
            unz: vec![],
        }
    }
}

fn build_ids(ctx: &Ctx, off: &[i64], slot: &mut [u32], cells: &mut Vec<u32>, ids: &mut Vec<u32>) {
    cells.clear();
    ids.clear();
    for i in 0..ctx.n {
        let base = ctx.cand_g[i];
        for &o in off {
            let g = (base + o) as usize;
            let mut id = slot[g];
            if id == u32::MAX {
                id = cells.len() as u32;
                slot[g] = id;
                cells.push(g as u32);
            }
            ids.push(id);
        }
    }
}

/// a point is final after its last (largest-index) contributor is decided
fn build_finals(
    n: usize,
    w: usize,
    ids: &[u32],
    npts: usize,
    last: &mut Vec<u32>,
    pos: &mut Vec<u32>,
    off: &mut Vec<u32>,
    fin: &mut Vec<u32>,
) {
    last.clear();
    last.resize(npts, 0);
    for i in 0..n {
        for j in 0..w {
            last[ids[i * w + j] as usize] = i as u32;
        }
    }
    off.clear();
    off.resize(n + 1, 0);
    for &i in last.iter() {
        off[i as usize + 1] += 1;
    }
    for i in 0..n {
        off[i + 1] += off[i];
    }
    fin.clear();
    fin.resize(npts, 0);
    pos.clear();
    pos.extend_from_slice(&off[..n]);
    for (p, &i) in last.iter().enumerate() {
        fin[pos[i as usize] as usize] = p as u32;
        pos[i as usize] += 1;
    }
}

struct Search<'a> {
    ctx: &'a Ctx,
    ws: &'a mut Workspace,
    nv: usize,
    nvs: usize,
    vc: Vec<i16>,
    vsc: Vec<i16>,
    targets: Vec<i64>,
    pos_max: i32,
    usum: i64,
    pos: i32,
    neg: i32,
    nodes: u64,
    res: Vec<(Vec<Pt>, Vec<Pt>)>,
}

/// zprod.search_U with --fast; returns (products, complete)
fn search_u(ctx: &Ctx, ws: &mut Workspace, v: &Factor) -> (Vec<(Vec<Pt>, Vec<Pt>)>, bool) {
    let vs = reversal(v);
    let vsum: i64 = v.iter().map(|(_, c)| *c as i64).sum();
    if vsum <= 0 {
        return (vec![], true);
    }
    let mut targets: Vec<i64> = ctx.ks.iter().filter(|k| *k % vsum == 0).map(|k| k / vsum).collect();
    targets.sort();
    targets.dedup();
    if targets.is_empty() {
        return (vec![], true);
    }
    let usum_max = *targets.last().unwrap();
    let voff: Vec<i64> = v.iter().map(|(p, _)| ctx.goff(p)).collect();
    let vsoff: Vec<i64> = vs.iter().map(|(p, _)| ctx.goff(p)).collect();
    {
        let w = &mut *ws;
        build_ids(ctx, &voff, &mut w.pslot, &mut w.p_cell, &mut w.pid);
        build_ids(ctx, &vsoff, &mut w.qslot, &mut w.q_cell, &mut w.qid);
        let (np, nq) = (w.p_cell.len(), w.q_cell.len());
        build_finals(ctx.n, v.len(), &w.pid, np, &mut w.last, &mut w.pos, &mut w.fin_p_off, &mut w.fin_p);
        build_finals(ctx.n, vs.len(), &w.qid, nq, &mut w.last, &mut w.pos, &mut w.fin_q_off, &mut w.fin_q);
        w.p_enc.clear();
        for k in 0..np {
            let g = w.p_cell[k] as usize;
            w.p_enc.push(ctx.denc[g]);
        }
        w.pc.clear();
        w.pc.resize(np, 0);
        w.qc.clear();
        w.qc.resize(nq, 0);
        w.notes.clear();
        w.unz.clear();
    }
    let mut s = Search {
        ctx,
        ws,
        nv: v.len(),
        nvs: vs.len(),
        vc: v.iter().map(|(_, c)| *c as i16).collect(),
        vsc: vs.iter().map(|(_, c)| *c as i16).collect(),
        targets,
        pos_max: usum_max as i32 + ctx.max_neg,
        usum: 0,
        pos: 0,
        neg: 0,
        nodes: 0,
        res: vec![],
    };
    let complete = s.rec(0);
    let res = std::mem::take(&mut s.res);
    let w = s.ws;
    // free the grid slots for the next factor
    for k in 0..w.p_cell.len() {
        let g = w.p_cell[k] as usize;
        w.pslot[g] = u32::MAX;
    }
    for k in 0..w.q_cell.len() {
        let g = w.q_cell[k] as usize;
        w.qslot[g] = u32::MAX;
    }
    (res, complete)
}

impl<'a> Search<'a> {
    /// returns false when the node budget is exceeded (search stopped)
    fn rec(&mut self, i: usize) -> bool {
        self.nodes += 1;
        if self.ctx.max_nodes > 0 && self.nodes > self.ctx.max_nodes {
            return false;
        }
        let n = self.ctx.n;
        if i == n {
            if self.targets.contains(&self.usum) {
                let ctx = self.ctx;
                let ws = &*self.ws;
                let ps: Vec<Pt> = (0..ws.pc.len()).filter(|&k| ws.pc[k] == 1).map(|k| ctx.decode(ws.p_cell[k] as usize)).collect();
                if !ps.is_empty() {
                    let qs: Vec<Pt> =
                        (0..ws.qc.len()).filter(|&k| ws.qc[k] == 1).map(|k| ctx.decode(ws.q_cell[k] as usize)).collect();
                    self.res.push((ps, qs));
                }
            }
            return true;
        }
        // --fast: U's lowest point (0, the first candidate) has coefficient 1
        let nc = if i == 0 { 1 } else { self.ctx.ucoeffs.len() };
        let (pa, pb) = (self.ws.fin_p_off[i] as usize, self.ws.fin_p_off[i + 1] as usize);
        let (qa, qb) = (self.ws.fin_q_off[i] as usize, self.ws.fin_q_off[i + 1] as usize);
        let (nv, nvs) = (self.nv, self.nvs);
        for ci in 0..nc {
            let c = if i == 0 { 1 } else { self.ctx.ucoeffs[ci] };
            if c > 0 && self.pos + c > self.pos_max {
                continue;
            }
            if c < 0 && self.neg - c > self.ctx.max_neg {
                continue;
            }
            // U - U pruning (exact): hull(P) = hull(U) + hull(V), so U is no wider than P in any direction and
            // P's widths are bounded by the allowed intervals; any two points of U's support (negative
            // coefficients included) differ by a lattice point of conv(D) = an allowed interval
            if c != 0 && i > 0 && self.ctx.upair {
                let ctx = self.ctx;
                let e = ctx.cand_denc[i];
                if self.ws.unz.iter().any(|&j| !ctx.allowed(e - ctx.cand_denc[j as usize])) {
                    continue;
                }
            }
            let c16 = c as i16;
            if c != 0 {
                self.ws.unz.push(i as u32);
                let ws = &mut *self.ws;
                for j in 0..nv {
                    let id = ws.pid[i * nv + j] as usize;
                    ws.pc[id] += c16 * self.vc[j];
                }
                for j in 0..nvs {
                    let id = ws.qid[i * nvs + j] as usize;
                    ws.qc[id] += c16 * self.vsc[j];
                }
            }
            let mut ok = true;
            let nn = self.ws.notes.len();
            {
                let ctx = self.ctx;
                let ws = &mut *self.ws;
                for t in pa..pb {
                    let p = ws.fin_p[t];
                    let x = ws.pc[p as usize];
                    if x < 0 || x > 1 {
                        ok = false;
                        break;
                    }
                    if x == 1 {
                        let ep = ws.p_enc[p as usize];
                        for &r in &ws.notes {
                            if !ctx.allowed(ep - ws.p_enc[r as usize]) {
                                ok = false;
                                break;
                            }
                        }
                        if !ok {
                            break;
                        }
                        ws.notes.push(p);
                    }
                }
                if ok {
                    for t in qa..qb {
                        let x = ws.qc[ws.fin_q[t] as usize];
                        if x < 0 || x > 1 {
                            ok = false;
                            break;
                        }
                    }
                }
            }
            let mut alive = true;
            if ok {
                self.usum += c as i64;
                if c > 0 {
                    self.pos += c;
                } else {
                    self.neg -= c;
                }
                alive = self.rec(i + 1);
                self.usum -= c as i64;
                if c > 0 {
                    self.pos -= c;
                } else {
                    self.neg += c;
                }
            }
            self.ws.notes.truncate(nn);
            if c != 0 {
                self.ws.unz.pop();
                let ws = &mut *self.ws;
                for j in 0..nv {
                    let id = ws.pid[i * nv + j] as usize;
                    ws.pc[id] -= c16 * self.vc[j];
                }
                for j in 0..nvs {
                    let id = ws.qid[i * nvs + j] as usize;
                    ws.qc[id] -= c16 * self.vsc[j];
                }
            }
            if !alive {
                return false;
            }
        }
        true
    }
}

// ------------------------------------------------------------------------------------------- output
fn pt_json(p: &[i32], s: &mut String) {
    s.push('[');
    for (i, x) in p.iter().enumerate() {
        if i > 0 {
            s.push(',');
        }
        s.push_str(&x.to_string());
    }
    s.push(']');
}

fn line_json(v: &Factor, complete: bool, prods: &[(Vec<Pt>, Vec<Pt>)]) -> String {
    let mut s = String::from("{\"v\":[");
    for (i, (p, c)) in v.iter().enumerate() {
        if i > 0 {
            s.push(',');
        }
        s.push('[');
        pt_json(p, &mut s);
        s.push_str(&format!(",{c}]"));
    }
    s.push_str(&format!("],\"complete\":{complete},\"prods\":["));
    for (i, (ps, qs)) in prods.iter().enumerate() {
        if i > 0 {
            s.push(',');
        }
        s.push('[');
        for (side, pts) in [ps, qs].iter().enumerate() {
            if side > 0 {
                s.push(',');
            }
            s.push('[');
            for (k, p) in pts.iter().enumerate() {
                if k > 0 {
                    s.push(',');
                }
                pt_json(p, &mut s);
            }
            s.push(']');
        }
        s.push(']');
    }
    s.push_str("]}");
    s
}

// ------------------------------------------------------------------------------------------- clique counts
/// Count every k-note set (k <= maxk) that contains its lexicographically lowest note 0 and whose pairwise
/// differences are all allowed intervals: cliques of the compatibility graph on the lexicographically
/// positive allowed intervals (0 is joined to all of them). Each set is counted once (transpositions fixed by
/// the lowest note). Bitset adjacency; parallel over pairs of first vertices.
fn count_cliques(g: &GenCtx, maxk: usize, threads: usize) {
    let n = g.n;
    assert!(n <= 64 * MAXW, "clique counter handles up to 2,048 vertices");
    let w = (n + 63) / 64;
    let mut adj = vec![vec![0u64; w]; n];
    for a in 0..n {
        for b in 0..n {
            if a != b && g.ok(a, b) {
                adj[a][b / 64] |= 1 << (b % 64);
            }
        }
    }
    let adj = Arc::new(adj);
    // counts[s] = number of cliques of s vertices among the positive intervals = sets of s + 1 notes
    let maxs = maxk - 1;
    let roots: Vec<(usize, usize)> = (0..n).flat_map(|a| (a + 1..n).filter(move |&b| g.ok(a, b)).map(move |b| (a, b))).collect();
    let roots = Arc::new(roots);
    let next = Arc::new(AtomicUsize::new(0));
    let t0 = Instant::now();
    let handles: Vec<_> = (0..threads)
        .map(|_| {
            let (adj, roots, next) = (adj.clone(), roots.clone(), next.clone());
            std::thread::spawn(move || {
                let mut counts = vec![0u64; maxs + 1];
                fn rec(adj: &[Vec<u64>], cand: &[u64], depth: usize, maxs: usize, counts: &mut [u64]) {
                    // cand: vertices that extend the current clique of `depth` vertices (all larger than its last)
                    for (wi, &word) in cand.iter().enumerate() {
                        let mut bits = word;
                        while bits != 0 {
                            let v = wi * 64 + bits.trailing_zeros() as usize;
                            bits &= bits - 1;
                            counts[depth + 1] += 1;
                            if depth + 1 < maxs {
                                // next candidates: in cand, adjacent to v, larger than v
                                let mut ncb = [0u64; MAXW]; // up to 2,048 vertices, no allocation per node
                                let nc = &mut ncb[..cand.len()];
                                let mut any = false;
                                for k in 0..cand.len() {
                                    let mut x = cand[k] & adj[v][k];
                                    if k < v / 64 {
                                        x = 0;
                                    } else if k == v / 64 {
                                        x &= if v % 64 == 63 { 0 } else { !0u64 << (v % 64 + 1) };
                                    }
                                    nc[k] = x;
                                    any |= x != 0;
                                }
                                if any {
                                    rec(adj, nc, depth + 1, maxs, counts);
                                }
                            }
                        }
                    }
                }
                loop {
                    let i = next.fetch_add(1, Ordering::Relaxed);
                    if i >= roots.len() {
                        break;
                    }
                    let (a, b) = roots[i];
                    // the clique {a, b}; extend by vertices > b adjacent to both
                    counts[2] += 1;
                    if maxs > 2 {
                        let w = adj[a].len();
                        let mut cand = vec![0u64; w];
                        for k in 0..w {
                            let mut x = adj[a][k] & adj[b][k];
                            if k < b / 64 {
                                x = 0;
                            } else if k == b / 64 {
                                x &= if b % 64 == 63 { 0 } else { !0u64 << (b % 64 + 1) };
                            }
                            cand[k] = x;
                        }
                        rec(&adj, &cand, 2, maxs, &mut counts);
                    }
                }
                counts
            })
        })
        .collect();
    let mut total = vec![0u64; maxs + 1];
    for h in handles {
        for (t, c) in total.iter_mut().zip(h.join().unwrap()) {
            *t += c;
        }
    }
    total[1] = n as u64;
    for s in 1..=maxs {
        eprintln!("  {} notes: {} sets", s + 1, total[s]);
    }
    eprintln!("zprod-rs cliques: done in {:.1}s", t0.elapsed().as_secs_f64());
}

// ------------------------------------------------------------------------------------------- shape-free enumeration
/// Every k-note set containing its lexicographically lowest note 0 whose pairwise differences are all allowed
/// intervals (the cliques counted by count_cliques), grouped by interval content: no factor shapes assumed.
/// Interval content is hashed incrementally (sum of random keys of the differences, two independent 64-bit
/// hashes); a set and its inversion share their content, so only one of the two is kept (an order-sensitive
/// hash of the set against that of its inversion). Pass A stores only the hashes of one slice (h1 mod passes)
/// and finds repeated ones; pass B re-enumerates the slice and keeps the note lists of repeated hashes; then
/// exact check (sorted difference lists, canonical forms). Families are written in the products format.
struct EnumG {
    n: usize,
    adj: Vec<Vec<u64>>,
    didx: Vec<u16>, // didx[a * n + b] = index of boxv[a] - boxv[b] in boxv (a > b), u16::MAX if not allowed
    r1: Vec<u64>,
    r2: Vec<u64>,
    ro: Vec<u64>,
}

fn splitmix(x: &mut u64) -> u64 {
    *x = x.wrapping_add(0x9E3779B97F4A7C15);
    let mut z = *x;
    z = (z ^ (z >> 30)).wrapping_mul(0xBF58476D1CE4E5B9);
    z = (z ^ (z >> 27)).wrapping_mul(0x94D049BB133111EB);
    z ^ (z >> 31)
}

impl EnumG {
    fn new(g: &GenCtx) -> EnumG {
        let n = g.n;
        assert!(n <= 64 * MAXW, "enumeration handles up to 2,048 positive intervals");
        let w = (n + 63) / 64;
        let pos: HashMap<&Pt, u16> = g.boxv.iter().enumerate().map(|(i, p)| (p, i as u16)).collect();
        let mut adj = vec![vec![0u64; w]; n];
        let mut didx = vec![u16::MAX; n * n];
        for a in 0..n {
            for b in 0..n {
                if a != b && g.ok(a, b) {
                    adj[a][b / 64] |= 1 << (b % 64);
                    if a > b {
                        didx[a * n + b] = *pos.get(&sub(&g.boxv[a], &g.boxv[b])).expect("difference of a later and an earlier positive interval is positive");
                    }
                }
            }
        }
        let mut s = 0x5EED_2026_1122u64;
        let r1 = (0..n).map(|_| splitmix(&mut s)).collect();
        let r2 = (0..n).map(|_| splitmix(&mut s)).collect();
        let ro = (0..n).map(|_| splitmix(&mut s)).collect();
        EnumG { n, adj, didx, r1, r2, ro }
    }
    #[inline]
    fn d(&self, a: u16, b: u16) -> u16 {
        self.didx[a as usize * self.n + b as usize]
    }
}

const MAXW: usize = 32; // bitset words: up to 2,048 positive intervals (was 16 / 1,024 through bin11)

impl EnumG {
    /// index of the difference of two distinct vertices (the lexicographically positive one)
    #[inline]
    fn dd(&self, a: u16, b: u16) -> u16 {
        if a > b {
            self.d(a, b)
        } else {
            self.d(b, a)
        }
    }
}

/// Sets are processed by their top note m (lexicographically largest). The largest difference in a set is
/// top minus lowest = m, and Z-partners have the same differences, so partners always share m: each group
/// can be checked on its own (no global passes).
fn group_cand(eg: &EnumG, m: usize) -> [u64; MAXW] {
    let mut c = [0u64; MAXW];
    for kk in 0..eg.adj[0].len() {
        let mut x = eg.adj[m][kk];
        if kk > m / 64 {
            x = 0;
        } else if kk == m / 64 {
            x &= (1u64 << (m % 64)) - 1; // vertices below m
        }
        c[kk] = x;
    }
    c
}

#[inline]
fn above(x: u64, kk: usize, v: usize) -> u64 {
    // keep bits of word kk that are above vertex v
    if kk < v / 64 {
        0
    } else if kk == v / 64 {
        if v % 64 == 63 {
            0
        } else {
            x & (!0u64 << (v % 64 + 1))
        }
    } else {
        x
    }
}

/// roots of group m: the first one or two vertices below m (pairs when at least 2 are needed)
fn group_roots(eg: &EnumG, m: usize, need: usize) -> Vec<(u16, u16)> {
    let c = group_cand(eg, m);
    let w = eg.adj[0].len();
    let mut out = vec![];
    for a in 0..m {
        if (c[a / 64] >> (a % 64)) & 1 == 0 {
            continue;
        }
        if need == 1 {
            out.push((a as u16, u16::MAX));
            continue;
        }
        for b in a + 1..m {
            if (c[b / 64] >> (b % 64)) & 1 == 1 && (eg.adj[a][b / 64] >> (b % 64)) & 1 == 1 {
                out.push((a as u16, b as u16));
            }
        }
    }
    let _ = w;
    out
}

/// candidates after a root: below m, joined to m, a and b, above the root's last vertex
fn root_cand(eg: &EnumG, m: usize, a: u16, b: u16) -> [u64; MAXW] {
    let c = group_cand(eg, m);
    let mut x = [0u64; MAXW];
    let last = if b == u16::MAX { a as usize } else { b as usize };
    for kk in 0..eg.adj[0].len() {
        let mut y = c[kk] & eg.adj[a as usize][kk];
        if b != u16::MAX {
            y &= eg.adj[b as usize][kk];
        }
        x[kk] = above(y, kk, last);
    }
    x
}

/// count cliques of `left` more vertices inside `cand`
fn count_rec(eg: &EnumG, cand: &[u64], left: usize) -> u64 {
    if left == 0 {
        return 1;
    }
    if left == 1 {
        return cand.iter().map(|x| x.count_ones() as u64).sum();
    }
    let mut total = 0;
    for (wi, &word) in cand.iter().enumerate() {
        let mut bits = word;
        while bits != 0 {
            let v = wi * 64 + bits.trailing_zeros() as usize;
            bits &= bits - 1;
            let mut nb = [0u64; MAXW];
            let nc = &mut nb[..cand.len()];
            let mut any = false;
            for kk in 0..cand.len() {
                nc[kk] = above(cand[kk] & eg.adj[v][kk], kk, v);
                any |= nc[kk] != 0;
            }
            if any {
                total += count_rec(eg, nc, left - 1);
            }
        }
    }
    total
}

/// put v at stack position p (0 = the top note m); hashes over all pairs with 0 and with stack[..p]
#[inline]
fn enum_push(eg: &EnumG, stack: &mut [u16; 17], h1s: &mut [u64; 18], h2s: &mut [u64; 18], hos: &mut [u64; 18], p: usize, v: u16) {
    let (mut x1, mut x2) = (h1s[p].wrapping_add(eg.r1[v as usize]), h2s[p].wrapping_add(eg.r2[v as usize]));
    for &u in &stack[..p] {
        let di = eg.dd(v, u) as usize;
        x1 = x1.wrapping_add(eg.r1[di]);
        x2 = x2.wrapping_add(eg.r2[di]);
    }
    stack[p] = v;
    h1s[p + 1] = x1;
    h2s[p + 1] = x2;
    hos[p + 1] = hos[p].wrapping_add(eg.ro[v as usize]);
}

#[allow(clippy::too_many_arguments)]
fn enum_rec<L: FnMut(&[u16; 17], usize, u64, u64)>(
    eg: &EnumG,
    need: usize,
    d: usize,
    cand: &[u64],
    stack: &mut [u16; 17],
    h1s: &mut [u64; 18],
    h2s: &mut [u64; 18],
    hos: &mut [u64; 18],
    leaf: &mut L,
) {
    if d == need {
        // keep one of the set and its inversion {m - s}: compare order-sensitive hashes
        let m = stack[0];
        let mut hinv = eg.ro[m as usize];
        for &s in &stack[1..=d] {
            hinv = hinv.wrapping_add(eg.ro[eg.d(m, s) as usize]);
        }
        if hos[d + 1] <= hinv {
            leaf(stack, d + 1, h1s[d + 1], h2s[d + 1]);
        }
        return;
    }
    for (wi, &word) in cand.iter().enumerate() {
        let mut bits = word;
        while bits != 0 {
            let v = wi * 64 + bits.trailing_zeros() as usize;
            bits &= bits - 1;
            enum_push(eg, stack, h1s, h2s, hos, d + 1, v as u16);
            if d + 1 == need {
                enum_rec(eg, need, d + 1, cand, stack, h1s, h2s, hos, leaf);
                continue;
            }
            let mut nb = [0u64; MAXW];
            let nc = &mut nb[..cand.len()];
            let mut any = false;
            for kk in 0..cand.len() {
                nc[kk] = above(cand[kk] & eg.adj[v][kk], kk, v);
                any |= nc[kk] != 0;
            }
            if any {
                enum_rec(eg, need, d + 1, nc, stack, h1s, h2s, hos, leaf);
            }
        }
    }
}

/// a root: top note m and the first one or two vertices below it
type ERoot = (u16, u16, u16);

/// all kept sets of one root; leaf(stack, len, h1, h2) with stack = [m, C ascending]
fn enum_root_v3<L: FnMut(&[u16; 17], usize, u64, u64)>(eg: &EnumG, need: usize, r: ERoot, leaf: &mut L) {
    let (m, a, b) = r;
    let mut stack = [0u16; 17];
    let (mut h1s, mut h2s, mut hos) = ([0u64; 18], [0u64; 18], [0u64; 18]);
    enum_push(eg, &mut stack, &mut h1s, &mut h2s, &mut hos, 0, m);
    enum_push(eg, &mut stack, &mut h1s, &mut h2s, &mut hos, 1, a);
    let mut d = 1;
    if b != u16::MAX {
        enum_push(eg, &mut stack, &mut h1s, &mut h2s, &mut hos, 2, b);
        d = 2;
    }
    let w = eg.adj[0].len();
    let cand = root_cand(eg, m as usize, a, b);
    enum_rec(eg, need, d, &cand[..w], &mut stack, &mut h1s, &mut h2s, &mut hos, leaf);
}

/// a stored set: hashes and the note indices (stack order: top note first)
#[derive(Clone, Copy)]
struct EEntry {
    h1: u64,
    h2: u64,
    s: [u16; 16],
}

/// Enumerate the given roots on all threads, keeping the sets of hash slice `pass` (of `passes`); each thread
/// files its entries into 16 buckets by the top bits of h1, so the buckets can be sorted in parallel.
fn collect_roots(eg: &Arc<EnumG>, need: usize, roots: Arc<Vec<ERoot>>, threads: usize, passes: u64, pass: u64, only: Option<Arc<HashSet<(u64, u64)>>>) -> Vec<Vec<Vec<EEntry>>> {
    let next = Arc::new(AtomicUsize::new(0));
    let hs: Vec<_> = (0..threads.min(roots.len()).max(1))
        .map(|_| {
            let (eg, roots, next, only) = (eg.clone(), roots.clone(), next.clone(), only.clone());
            std::thread::spawn(move || {
                let mut buckets: Vec<Vec<EEntry>> = (0..16).map(|_| Vec::new()).collect();
                loop {
                    let i = next.fetch_add(1, Ordering::Relaxed);
                    if i >= roots.len() {
                        break;
                    }
                    enum_root_v3(&eg, need, roots[i], &mut |st: &[u16; 17], len: usize, h1: u64, h2: u64| {
                        if passes > 1 && h1 % passes != pass {
                            return;
                        }
                        if let Some(o) = &only {
                            if !o.contains(&(h1, h2)) {
                                return;
                            }
                        }
                        let mut s = [0u16; 16];
                        s[..len].copy_from_slice(&st[..len]);
                        buckets[(h1 >> 60) as usize].push(EEntry { h1, h2, s });
                    });
                }
                buckets
            })
        })
        .collect();
    hs.into_iter().map(|h| h.join().unwrap()).collect()
}

/// first pass for a big group: only the hashes of slice `pass`, bucketed; returns the repeated (h1, h2)
fn repeated_hashes(eg: &Arc<EnumG>, need: usize, roots: Arc<Vec<ERoot>>, threads: usize, passes: u64, pass: u64) -> HashSet<(u64, u64)> {
    let next = Arc::new(AtomicUsize::new(0));
    let hs: Vec<_> = (0..threads.min(roots.len()).max(1))
        .map(|_| {
            let (eg, roots, next) = (eg.clone(), roots.clone(), next.clone());
            std::thread::spawn(move || {
                let mut buckets: Vec<Vec<(u64, u64)>> = (0..16).map(|_| Vec::new()).collect();
                loop {
                    let i = next.fetch_add(1, Ordering::Relaxed);
                    if i >= roots.len() {
                        break;
                    }
                    enum_root_v3(&eg, need, roots[i], &mut |_st: &[u16; 17], _len: usize, h1: u64, h2: u64| {
                        if passes > 1 && h1 % passes != pass {
                            return;
                        }
                        buckets[(h1 >> 60) as usize].push((h1, h2));
                    });
                }
                buckets
            })
        })
        .collect();
    let parts: Vec<Vec<Vec<(u64, u64)>>> = hs.into_iter().map(|h| h.join().unwrap()).collect();
    let mut by_bucket: Vec<Vec<(u64, u64)>> = (0..16).map(|_| Vec::new()).collect();
    for th in parts {
        for (b, v) in th.into_iter().enumerate() {
            if by_bucket[b].is_empty() {
                by_bucket[b] = v;
            } else {
                by_bucket[b].extend(v);
            }
        }
    }
    std::thread::scope(|sc| {
        let hs: Vec<_> = by_bucket
            .into_iter()
            .map(|mut v| {
                sc.spawn(move || {
                    v.sort_unstable();
                    let mut out = vec![];
                    for i in 1..v.len() {
                        if v[i] == v[i - 1] && (out.last() != Some(&v[i])) {
                            out.push(v[i]);
                        }
                    }
                    out
                })
            })
            .collect();
        hs.into_iter().flat_map(|h| h.join().unwrap()).collect()
    })
}

/// sort each bucket in parallel and return the runs of equal (h1, h2) of length >= 2 (as note lists, ascending)
fn repeated(parts: Vec<Vec<Vec<EEntry>>>, len: usize) -> Vec<Vec<Vec<u16>>> {
    let mut by_bucket: Vec<Vec<EEntry>> = (0..16).map(|_| Vec::new()).collect();
    for th in parts {
        for (b, v) in th.into_iter().enumerate() {
            if by_bucket[b].is_empty() {
                by_bucket[b] = v;
            } else {
                by_bucket[b].extend(v);
            }
        }
    }
    std::thread::scope(|sc| {
        let hs: Vec<_> = by_bucket
            .into_iter()
            .map(|mut v| {
                sc.spawn(move || {
                    v.sort_unstable_by_key(|e| (e.h1, e.h2));
                    let mut out = vec![];
                    let mut i = 0;
                    while i < v.len() {
                        let mut j = i + 1;
                        while j < v.len() && v[j].h1 == v[i].h1 && v[j].h2 == v[i].h2 {
                            j += 1;
                        }
                        if j - i >= 2 {
                            out.push(
                                v[i..j]
                                    .iter()
                                    .map(|e| {
                                        let mut s: Vec<u16> = e.s[1..len].to_vec(); // C ascending, then the top note
                                        s.push(e.s[0]);
                                        s
                                    })
                                    .collect(),
                            );
                        }
                        i = j;
                    }
                    out
                })
            })
            .collect();
        hs.into_iter().flat_map(|h| h.join().unwrap()).collect()
    })
}

/// exact check of hash groups; writes families, returns how many
fn check_groups(eg: &EnumG, g: &GenCtx, groups: Vec<Vec<Vec<u16>>>, w: &mut BufWriter<std::fs::File>) -> u64 {
    let mut families = 0;
    for sets in groups {
        let mut exact: HashMap<Vec<u16>, Vec<Vec<u16>>> = HashMap::new();
        for c in sets {
            let mut diffs: Vec<u16> = c.clone(); // differences to 0
            for i in 0..c.len() {
                for j in 0..i {
                    diffs.push(eg.dd(c[i], c[j]));
                }
            }
            diffs.sort_unstable();
            let top = *c.last().unwrap();
            let mut inv: Vec<u16> = c[..c.len() - 1].iter().map(|&s| eg.d(top, s)).collect();
            inv.push(top);
            inv.sort_unstable();
            let canon = if inv < c { inv } else { c };
            let e = exact.entry(diffs).or_default();
            if !e.contains(&canon) {
                e.push(canon);
            }
        }
        for (_, mut members) in exact {
            if members.len() < 2 {
                continue;
            }
            families += 1;
            members.sort();
            let pts = |c: &Vec<u16>| -> Vec<Pt> {
                let mut v = vec![vec![0; g.dim]];
                v.extend(c.iter().map(|&i| g.boxv[i as usize].clone()));
                v
            };
            let p0 = pts(&members[0]);
            let prods: Vec<(Vec<Pt>, Vec<Pt>)> = members[1..].iter().map(|m| (p0.clone(), pts(m))).collect();
            w.write_all(line_json(&vec![], true, &prods).as_bytes()).unwrap();
            w.write_all(b"\n").unwrap();
        }
    }
    families
}

/// Shape-free enumeration, v3. Sets are grouped by their top note m (Z-partners share their largest
/// difference = m). Group sizes: one parallel bitset count. Small groups are batched (sets of different groups
/// can never be partners); a batch is enumerated once on all threads, keeping each set with its hashes (no
/// second pass), bucketed for a parallel sort. A group too big for the memory budget alone is split into hash
/// slices, each enumerated once. Then the exact check.
fn enumerate(g: &GenCtx, args: &Args) {
    let eg = Arc::new(EnumG::new(g));
    let n = eg.n;
    let t0 = Instant::now();
    let mut w = BufWriter::new(std::fs::File::create(&args.out).unwrap());
    let budget = (args.mem_gb * 1e9) as u64;
    const ENTRY: u64 = std::mem::size_of::<EEntry>() as u64;
    for &k in &args.k {
        let k = k as usize;
        assert!((3..=16).contains(&k), "k from 3 to 16");
        let need = k - 2; // notes besides 0 and the top note
        let tk = Instant::now();
        // roots of every group, and the size of every group (one parallel count)
        let mut roots_by_m: Vec<Vec<ERoot>> = vec![vec![]; n];
        for m in 0..n {
            roots_by_m[m] = group_roots(&eg, m, need).into_iter().map(|(a, b)| (m as u16, a, b)).collect();
        }
        let all_roots: Arc<Vec<ERoot>> = Arc::new(roots_by_m.iter().flatten().copied().collect());
        let counts: Vec<u64> = {
            let next = Arc::new(AtomicUsize::new(0));
            let hs: Vec<_> = (0..args.threads)
                .map(|_| {
                    let (eg, roots, next) = (eg.clone(), all_roots.clone(), next.clone());
                    std::thread::spawn(move || {
                        let mut c = vec![0u64; eg.n];
                        let w = eg.adj[0].len();
                        loop {
                            let i = next.fetch_add(1, Ordering::Relaxed);
                            if i >= roots.len() {
                                break;
                            }
                            let (m, a, b) = roots[i];
                            c[m as usize] += if need == 1 {
                                1
                            } else {
                                let cand = root_cand(&eg, m as usize, a, b);
                                count_rec(&eg, &cand[..w], need - 2)
                            };
                        }
                        c
                    })
                })
                .collect();
            let mut total = vec![0u64; n];
            for h in hs {
                for (t, x) in total.iter_mut().zip(h.join().unwrap()) {
                    *t += x;
                }
            }
            total
        };
        let total: u64 = counts.iter().sum();
        let biggest = counts.iter().copied().max().unwrap_or(0);
        // batches of whole groups that fit the budget (kept sets about half of each group)
        let mut batches: Vec<(Vec<usize>, u64)> = vec![]; // (groups, passes)
        let mut cur: Vec<usize> = vec![];
        let mut cur_bytes = 0u64;
        for m in 0..n {
            if counts[m] == 0 {
                continue;
            }
            let bytes = (counts[m] / 2 + 1) * ENTRY;
            if bytes > budget {
                // too big to keep its sets: hashes only (16 bytes per set) in slices, then a filtered second pass
                batches.push((vec![m], (counts[m] / 2 + 1) * 16 / budget + 1));
                continue;
            }
            if cur_bytes + bytes > budget && !cur.is_empty() {
                batches.push((std::mem::take(&mut cur), 1));
                cur_bytes = 0;
            }
            cur.push(m);
            cur_bytes += bytes;
        }
        if !cur.is_empty() {
            batches.push((cur, 1));
        }
        let mut families = 0u64;
        let mut sliced = 0u64;
        let mut big_groups = 0u64;
        for (groups, passes) in &batches {
            let roots: Arc<Vec<ERoot>> = Arc::new(groups.iter().flat_map(|&m| roots_by_m[m].iter().copied()).collect());
            let big = groups.len() == 1 && (counts[groups[0]] / 2 + 1) * ENTRY > budget;
            if big {
                // hash-only first pass per slice, then fetch just the repeated sets
                big_groups += 1;
                sliced += passes - 1;
                for pass in 0..*passes {
                    let rep = repeated_hashes(&eg, need, roots.clone(), args.threads, *passes, pass);
                    if rep.is_empty() {
                        continue;
                    }
                    let parts = collect_roots(&eg, need, roots.clone(), args.threads, *passes, pass, Some(Arc::new(rep)));
                    let reps = repeated(parts, need + 1);
                    families += check_groups(&eg, g, reps, &mut w);
                }
                continue;
            }
            let parts = collect_roots(&eg, need, roots.clone(), args.threads, 1, 0, None);
            let reps = repeated(parts, need + 1);
            families += check_groups(&eg, g, reps, &mut w);
        }
        eprintln!(
            "  k={k}: {total} sets (both orientations), largest top-note group {biggest}, {} batches ({big_groups} big groups in hash mode, {sliced} extra slices), {families} families with equal interval content, {:.1}s",
            batches.len(),
            tk.elapsed().as_secs_f64()
        );
    }
    w.flush().unwrap();
    eprintln!("zprod-rs enum: done in {:.1}s ({n} positive intervals)", t0.elapsed().as_secs_f64());
}

// ------------------------------------------------------------------------------------------- main
fn main() {
    let args = parse_args();
    let t0 = Instant::now();
    let d = gamut(&args.primes, args.q);
    let g = Arc::new(GenCtx::new(&d));
    eprintln!(
        "zprod-rs: {} allowed intervals (primes {:?}, q {}), {} lexicographically positive; k {:?}; shapes {:?}; U coefficients {:?}",
        d.len(),
        args.primes,
        args.q,
        g.n,
        args.k,
        args.shapes,
        args.ucoeffs
    );
    if args.enumerate {
        enumerate(&g, &args);
        return;
    }
    if args.cliques > 0 {
        count_cliques(&g, args.cliques, args.threads);
        return;
    }
    if args.count_only {
        // parallel over generation roots, one shape at a time
        for &sh in &args.shapes {
            let t1 = Instant::now();
            let rs = Arc::new(roots(&g, &[sh]));
            let next = Arc::new(AtomicUsize::new(0));
            let total = Arc::new(AtomicU64::new(0));
            let hs: Vec<_> = (0..args.threads)
                .map(|_| {
                    let (rs, next, total, g) = (rs.clone(), next.clone(), total.clone(), g.clone());
                    std::thread::spawn(move || loop {
                        let i = next.fetch_add(1, Ordering::Relaxed);
                        if i >= rs.len() {
                            break;
                        }
                        let mut c = 0u64;
                        gen_root(&g, &rs[i], |_| c += 1);
                        total.fetch_add(c, Ordering::Relaxed);
                    })
                })
                .collect();
            for h in hs {
                h.join().unwrap();
            }
            eprintln!("  shape {},{}: {} factors V ({:.1}s)", sh.0, sh.1, total.load(Ordering::Relaxed), t1.elapsed().as_secs_f64());
        }
        return;
    }
    let ctx = Arc::new(Ctx::new(&d, &args));
    // generation and search both run in the workers: each takes the next root, generates its factors
    // and searches each one (a single generating thread was the bottleneck)
    let rs = Arc::new(roots(&g, &args.shapes));
    let next = Arc::new(AtomicUsize::new(0));
    let (otx, orx) = sync_channel::<(u64, u64, u64, Vec<String>)>(args.threads * 4);
    let mut workers = vec![];
    for _ in 0..args.threads {
        let (rs, next, otx, ctx, g) = (rs.clone(), next.clone(), otx.clone(), ctx.clone(), g.clone());
        workers.push(std::thread::spawn(move || {
          let mut ws = Workspace::new(&ctx);
          loop {
            let i = next.fetch_add(1, Ordering::Relaxed);
            if i >= rs.len() {
                break;
            }
            let (mut nf, mut np, mut ns) = (0u64, 0u64, 0u64);
            let mut lines = vec![];
            gen_root(&g, &rs[i], |v| {
                let (prods, complete) = search_u(&ctx, &mut ws, &v);
                nf += 1;
                np += prods.len() as u64;
                if !complete {
                    ns += 1;
                }
                if !prods.is_empty() || !complete {
                    lines.push(line_json(&v, complete, &prods));
                }
            });
            otx.send((nf, np, ns, lines)).unwrap();
          }
        }));
    }
    drop(otx);
    let out_path = args.out.clone();
    let writer = std::thread::spawn(move || {
        let mut w = BufWriter::new(std::fs::File::create(&out_path).unwrap());
        let (mut nf, mut np, mut ns) = (0u64, 0u64, 0u64);
        let mut last = Instant::now();
        let t0 = Instant::now();
        for (a, b, c, lines) in orx {
            nf += a;
            np += b;
            ns += c;
            for l in lines {
                w.write_all(l.as_bytes()).unwrap();
                w.write_all(b"\n").unwrap();
            }
            if last.elapsed().as_secs() >= 60 {
                last = Instant::now();
                eprintln!("  {nf} factors, {np} products, {ns} stopped at the node budget, {:.0}s", t0.elapsed().as_secs_f64());
            }
        }
        w.flush().unwrap();
        (nf, np, ns)
    });
    for w in workers {
        w.join().unwrap();
    }
    let (nf, np, ns) = writer.join().unwrap();
    eprintln!("zprod-rs: {nf} factors V searched, {np} products, {ns} stopped at the node budget; total {:.1}s", t0.elapsed().as_secs_f64());
}
