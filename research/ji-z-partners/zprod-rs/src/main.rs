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
    out: String,
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
        out: String::new(),
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
            "--out" => a.out = vals(&mut i)[0].clone(),
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
                let inner = interior_points(&plus);
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
        let cand_g = cand.iter().map(|p| p.iter().zip(&gstride).map(|(x, s)| *x as i64 * s).sum::<i64>() + gcenter).collect();
        Ctx {
            n: cand.len(),
            cand_g,
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
            let c16 = c as i16;
            if c != 0 {
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
