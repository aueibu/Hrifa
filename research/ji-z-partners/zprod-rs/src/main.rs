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

/// zprod.in_hull (Caratheodory: a convex combination of some affinely independent subset)
fn in_hull(x: &[i32], pts: &[Pt]) -> bool {
    let d = x.len();
    for r in 1..=pts.len().min(d + 1) {
        for c in combinations(pts.len(), r) {
            let sub_pts: Vec<&Pt> = c.iter().map(|&i| &pts[i]).collect();
            if let Some(lam) = bary(x, &sub_pts) {
                if lam.iter().all(|l| l.n >= 0) {
                    return true;
                }
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
    let ps: HashSet<&Pt> = plus.iter().collect();
    let mut out = vec![];
    let mut x = lo.clone();
    loop {
        if !ps.contains(&x) && in_hull(&x, plus) {
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
/// One unit of generation work: a shape and the indices of its first one or two non-zero plus points
/// (a valid prefix: pairwise differences allowed). The units of a shape together generate exactly what
/// gen_v generates; two-point prefixes keep the units small (one-point ones were badly unbalanced).
type Root = ((usize, usize), Vec<usize>);

fn roots(dset: &HashSet<Pt>, boxv: &[Pt], shapes: &[(usize, usize)]) -> Vec<Root> {
    let mut out = vec![];
    for &sh in shapes {
        if sh.0 <= 1 {
            out.push((sh, vec![]));
        } else if sh.0 == 2 {
            for j in 0..boxv.len() {
                out.push((sh, vec![j]));
            }
        } else {
            for j1 in 0..boxv.len() {
                for j2 in j1 + 1..boxv.len() {
                    if dset.contains(&sub(&boxv[j2], &boxv[j1])) {
                        out.push((sh, vec![j1, j2]));
                    }
                }
            }
        }
    }
    out
}

/// gen_v restricted to one Root
fn gen_root<Fn_: FnMut(Factor)>(dset: &HashSet<Pt>, boxv: &[Pt], dim: usize, root: &Root, emit: Fn_) {
    gen_v_impl(dset, boxv, dim, &[root.0], &root.1, emit)
}

#[allow(dead_code)]
fn gen_v<Fn_: FnMut(Factor)>(dset: &HashSet<Pt>, boxv: &[Pt], dim: usize, shapes: &[(usize, usize)], emit: Fn_) {
    gen_v_impl(dset, boxv, dim, shapes, &[], emit)
}

fn gen_v_impl<Fn_: FnMut(Factor)>(
    dset: &HashSet<Pt>,
    boxv: &[Pt],
    dim: usize,
    shapes: &[(usize, usize)],
    prefix: &[usize],
    mut emit: Fn_,
) {
    fn plus_sets<G: FnMut(&[usize])>(
        boxv: &[Pt],
        dset: &HashSet<Pt>,
        need: usize,
        start: usize,
        chosen: &mut Vec<usize>,
        cb: &mut G,
    ) {
        if need == 0 {
            cb(chosen);
            return;
        }
        for j in start..boxv.len() {
            let v = &boxv[j];
            if chosen.iter().all(|&w| dset.contains(&sub(v, &boxv[w]))) {
                chosen.push(j);
                plus_sets(boxv, dset, need - 1, j + 1, chosen, cb);
                chosen.pop();
            }
        }
    }
    let zero = vec![0; dim];
    for &(vp, vm) in shapes {
        // with a prefix, the first non-zero plus points are fixed (roots() checked their differences)
        let mut chosen: Vec<usize> = prefix.to_vec();
        let need = vp - 1 - chosen.len();
        let start = chosen.last().map_or(0, |j| j + 1);
        plus_sets(boxv, dset, need, start, &mut chosen, &mut |rest: &[usize]| {
            let mut plus = vec![zero.clone()];
            plus.extend(rest.iter().map(|&j| boxv[j].clone()));
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
struct Ctx {
    cand: Vec<Pt>,     // allowed intervals >= 0, lexicographic
    dim: usize,
    // difference lookup: enc(x) = sum x_i * stride_i on a grid with offset off_i; d in D <=> bit set
    stride: Vec<i64>,
    center: i64,
    dbits: Vec<u64>,
    dhash: HashSet<i64>,
    use_bits: bool,
    ucoeffs: Vec<i32>,
    max_neg: i32,
    max_nodes: u64,
    ks: Vec<i64>,
}

impl Ctx {
    fn new(d: &[Pt], args: &Args) -> Ctx {
        let dim = d[0].len();
        let b: Vec<i64> = (0..dim).map(|i| d.iter().map(|p| p[i].abs() as i64).max().unwrap()).collect();
        // P points lie within [-2B, 2B], so their differences within [-4B, 4B]
        let width: Vec<i64> = b.iter().map(|x| 8 * x + 1).collect();
        let mut stride = vec![1i64; dim];
        for i in (0..dim.saturating_sub(1)).rev() {
            stride[i] = stride[i + 1] * width[i + 1];
        }
        let center: i64 = (0..dim).map(|i| 4 * b[i] * stride[i]).sum();
        let total: i64 = width.iter().product();
        let use_bits = total <= (1i64 << 33);
        let mut dbits = vec![];
        let mut dhash = HashSet::new();
        if use_bits {
            dbits = vec![0u64; (total as usize + 63) / 64];
        }
        for p in d {
            let e: i64 = p.iter().zip(&stride).map(|(x, s)| *x as i64 * s).sum::<i64>() + center;
            if use_bits {
                dbits[(e >> 6) as usize] |= 1 << (e & 63);
            } else {
                dhash.insert(e);
            }
        }
        let zero = vec![0; dim];
        let cand: Vec<Pt> = d.iter().filter(|p| **p >= zero).cloned().collect();
        Ctx {
            cand,
            dim,
            stride,
            center,
            dbits,
            dhash,
            use_bits,
            ucoeffs: args.ucoeffs.clone(),
            max_neg: args.max_neg,
            max_nodes: args.max_nodes,
            ks: args.k.clone(),
        }
    }
    fn enc(&self, p: &[i32]) -> i64 {
        p.iter().zip(&self.stride).map(|(x, s)| *x as i64 * s).sum()
    }
    #[inline]
    fn allowed(&self, diff_enc: i64) -> bool {
        let e = diff_enc + self.center;
        if self.use_bits {
            (self.dbits[(e >> 6) as usize] >> (e & 63)) & 1 == 1
        } else {
            self.dhash.contains(&e)
        }
    }
}

struct Search<'a> {
    ctx: &'a Ctx,
    nv: usize,
    nvs: usize,
    pid: Vec<u32>, // pid[i * nv + j] = id of cand[i] + V[j]
    qid: Vec<u32>,
    vc: Vec<i16>,
    vsc: Vec<i16>,
    fin_p: Vec<Vec<u32>>,
    fin_q: Vec<Vec<u32>>,
    p_enc: Vec<i64>,
    p_pts: Vec<Pt>,
    q_pts: Vec<Pt>,
    pc: Vec<i16>,
    qc: Vec<i16>,
    notes: Vec<u32>,
    targets: Vec<i64>,
    pos_max: i32,
    usum: i64,
    pos: i32,
    neg: i32,
    nodes: u64,
    res: Vec<(Vec<Pt>, Vec<Pt>)>,
}

fn intern(map: &mut HashMap<Pt, u32>, pts: &mut Vec<Pt>, p: Pt) -> u32 {
    if let Some(&i) = map.get(&p) {
        return i;
    }
    let i = pts.len() as u32;
    pts.push(p.clone());
    map.insert(p, i);
    i
}

/// zprod.search_U with --fast; returns (products, complete)
fn search_u(ctx: &Ctx, v: &Factor) -> (Vec<(Vec<Pt>, Vec<Pt>)>, bool) {
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
    let n = ctx.cand.len();
    let (nv, nvs) = (v.len(), vs.len());
    let (mut pmap, mut qmap) = (HashMap::new(), HashMap::new());
    let (mut p_pts, mut q_pts) = (vec![], vec![]);
    let mut pid = Vec::with_capacity(n * nv);
    let mut qid = Vec::with_capacity(n * nvs);
    for u in &ctx.cand {
        for (w, _) in v {
            pid.push(intern(&mut pmap, &mut p_pts, add(u, w)));
        }
        for (w, _) in &vs {
            qid.push(intern(&mut qmap, &mut q_pts, add(u, w)));
        }
    }
    // a P / Q point is final after its last (largest-index) contributor is decided
    let finals = |ids: &Vec<u32>, w: usize, npts: usize| -> Vec<Vec<u32>> {
        let mut last = vec![0usize; npts];
        for i in 0..n {
            for j in 0..w {
                last[ids[i * w + j] as usize] = i;
            }
        }
        let mut out = vec![vec![]; n];
        for (p, &i) in last.iter().enumerate() {
            out[i].push(p as u32);
        }
        out
    };
    let fin_p = finals(&pid, nv, p_pts.len());
    let fin_q = finals(&qid, nvs, q_pts.len());
    let p_enc: Vec<i64> = p_pts.iter().map(|p| ctx.enc(p)).collect();
    let mut s = Search {
        ctx,
        nv,
        nvs,
        vc: v.iter().map(|(_, c)| *c as i16).collect(),
        vsc: vs.iter().map(|(_, c)| *c as i16).collect(),
        pc: vec![0; p_pts.len()],
        qc: vec![0; q_pts.len()],
        pid,
        qid,
        fin_p,
        fin_q,
        p_enc,
        p_pts,
        q_pts,
        notes: vec![],
        targets,
        pos_max: usum_max as i32 + ctx.max_neg,
        usum: 0,
        pos: 0,
        neg: 0,
        nodes: 0,
        res: vec![],
    };
    let complete = s.rec(0);
    (s.res, complete)
}

impl<'a> Search<'a> {
    /// returns false when the node budget is exceeded (search stopped)
    fn rec(&mut self, i: usize) -> bool {
        self.nodes += 1;
        if self.ctx.max_nodes > 0 && self.nodes > self.ctx.max_nodes {
            return false;
        }
        let n = self.ctx.cand.len();
        if i == n {
            if self.targets.contains(&self.usum) {
                let ps: Vec<Pt> =
                    self.pc.iter().enumerate().filter(|(_, &c)| c == 1).map(|(k, _)| self.p_pts[k].clone()).collect();
                if !ps.is_empty() {
                    let qs: Vec<Pt> = self
                        .qc
                        .iter()
                        .enumerate()
                        .filter(|(_, &c)| c == 1)
                        .map(|(k, _)| self.q_pts[k].clone())
                        .collect();
                    self.res.push((ps, qs));
                }
            }
            return true;
        }
        // --fast: U's lowest point (0, the first candidate) has coefficient 1
        let nc = if i == 0 { 1 } else { self.ctx.ucoeffs.len() };
        for ci in 0..nc {
            let c = if i == 0 { 1 } else { self.ctx.ucoeffs[ci] };
            if c > 0 && self.pos + c > self.pos_max {
                continue;
            }
            if c < 0 && self.neg - c > self.ctx.max_neg {
                continue;
            }
            if c != 0 {
                let c16 = c as i16;
                for j in 0..self.nv {
                    self.pc[self.pid[i * self.nv + j] as usize] += c16 * self.vc[j];
                }
                for j in 0..self.nvs {
                    self.qc[self.qid[i * self.nvs + j] as usize] += c16 * self.vsc[j];
                }
            }
            let mut ok = true;
            let nn = self.notes.len();
            for t in 0..self.fin_p[i].len() {
                let p = self.fin_p[i][t];
                let x = self.pc[p as usize];
                if x < 0 || x > 1 {
                    ok = false;
                    break;
                }
                if x == 1 {
                    let ep = self.p_enc[p as usize];
                    for &r in &self.notes {
                        if !self.ctx.allowed(ep - self.p_enc[r as usize]) {
                            ok = false;
                            break;
                        }
                    }
                    if !ok {
                        break;
                    }
                    self.notes.push(p);
                }
            }
            if ok {
                for &q in &self.fin_q[i] {
                    let x = self.qc[q as usize];
                    if x < 0 || x > 1 {
                        ok = false;
                        break;
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
            self.notes.truncate(nn);
            if c != 0 {
                let c16 = c as i16;
                for j in 0..self.nv {
                    self.pc[self.pid[i * self.nv + j] as usize] -= c16 * self.vc[j];
                }
                for j in 0..self.nvs {
                    self.qc[self.qid[i * self.nvs + j] as usize] -= c16 * self.vsc[j];
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
    let dim = d[0].len();
    let dset: HashSet<Pt> = d.iter().cloned().collect();
    let zero = vec![0; dim];
    let boxv: Vec<Pt> = d.iter().filter(|p| **p > zero).cloned().collect(); // lex positive allowed intervals
    eprintln!(
        "zprod-rs: {} allowed intervals (primes {:?}, q {}), {} lexicographically positive; k {:?}; shapes {:?}; U coefficients {:?}",
        d.len(),
        args.primes,
        args.q,
        boxv.len(),
        args.k,
        args.shapes,
        args.ucoeffs
    );
    let dset = Arc::new(dset);
    let boxv = Arc::new(boxv);
    if args.count_only {
        // parallel over generation roots, one shape at a time
        for &sh in &args.shapes {
            let t1 = Instant::now();
            let rs = Arc::new(roots(&dset, &boxv, &[sh]));
            let next = Arc::new(AtomicUsize::new(0));
            let total = Arc::new(AtomicU64::new(0));
            let hs: Vec<_> = (0..args.threads)
                .map(|_| {
                    let (rs, next, total, dset, boxv) = (rs.clone(), next.clone(), total.clone(), dset.clone(), boxv.clone());
                    std::thread::spawn(move || loop {
                        let i = next.fetch_add(1, Ordering::Relaxed);
                        if i >= rs.len() {
                            break;
                        }
                        let mut c = 0u64;
                        gen_root(&dset, &boxv, dim, &rs[i], |_| c += 1);
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
    let rs = Arc::new(roots(&dset, &boxv, &args.shapes));
    let next = Arc::new(AtomicUsize::new(0));
    let (otx, orx) = sync_channel::<(u64, u64, u64, Vec<String>)>(args.threads * 4);
    let mut workers = vec![];
    for _ in 0..args.threads {
        let (rs, next, otx, ctx, dset, boxv) = (rs.clone(), next.clone(), otx.clone(), ctx.clone(), dset.clone(), boxv.clone());
        workers.push(std::thread::spawn(move || loop {
            let i = next.fetch_add(1, Ordering::Relaxed);
            if i >= rs.len() {
                break;
            }
            let (mut nf, mut np, mut ns) = (0u64, 0u64, 0u64);
            let mut lines = vec![];
            gen_root(&dset, &boxv, dim, &rs[i], |v| {
                let (prods, complete) = search_u(&ctx, &v);
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
