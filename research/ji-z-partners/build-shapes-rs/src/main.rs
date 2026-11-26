//! build-shapes-rs (2026-11-25): Rust port of build_shapes.py (same placements, same family keys, same JSONL).
//!
//! A shape (P, Q in Z^r, r = 1 or 2) is placed by a linear map L fixed by the images x (, y) of a unimodular pair
//! of P's differences; every x, y in the allowed set D (intervals of odd limit <= q, primes <= limit) is tried, and
//! a placement is kept when every interval inside L(P) and inside L(Q) is in D (checked up to sign; D is symmetric).
//! Families = placements merged up to transposition and mirror of each member, members unordered; a placement whose
//! members coincide is dropped. Output: one JSON line per family, sorted by key, as build_shapes.py; summary on
//! stderr. Vectors are encoded in i128 with signed base-4096 digits (one per prime), so encoding is linear.
//!
//! usage: build-shapes-rs --shapes S.jsonl [S2.jsonl ...] --k K --limit L --q Q [--threads T] [--only ID ...]

use std::collections::{BTreeMap, HashMap};
use std::io::Write;

const PR: [u64; 8] = [3, 5, 7, 11, 13, 17, 19, 23];
const BASE: i128 = 1 << 12;

fn enc(v: &[i64]) -> i128 {
    let mut s: i128 = 0;
    let mut m: i128 = 1;
    for &x in v {
        s += x as i128 * m;
        m *= BASE;
    }
    s
}

fn dec(mut s: i128, n: usize) -> Vec<i64> {
    let mut v = Vec::with_capacity(n);
    for _ in 0..n {
        let mut d = s.rem_euclid(BASE);
        if d >= BASE / 2 {
            d -= BASE;
        }
        v.push(d as i64);
        s = (s - d) / BASE;
    }
    v
}

/// all nonzero exponent vectors whose odd limit max(num, den) <= q (num, den coprime, products of the primes)
fn allowed(primes: &[u64], q: u64) -> Vec<Vec<i64>> {
    fn nums(primes: &[u64], q: u64, i: usize, cur: u64, es: &mut Vec<i64>, out: &mut Vec<Vec<i64>>) {
        if i == primes.len() {
            out.push(es.clone());
            return;
        }
        let mut v = cur;
        let mut e = 0;
        while v <= q {
            es.push(e);
            nums(primes, q, i + 1, v, es, out);
            es.pop();
            v = match v.checked_mul(primes[i]) {
                Some(x) => x,
                None => break,
            };
            e += 1;
        }
    }
    let mut halves = vec![];
    nums(primes, q, 0, 1, &mut vec![], &mut halves);
    let mut out = vec![];
    for en in &halves {
        for ed in &halves {
            if en.iter().zip(ed).all(|(&a, &b)| a == 0 || b == 0) {
                let v: Vec<i64> = en.iter().zip(ed).map(|(&a, &b)| a - b).collect();
                if v.iter().any(|&x| x != 0) {
                    out.push(v);
                }
            }
        }
    }
    out
}

/// open-addressing set of i128 (linear probing), for the hot membership test
struct Set {
    mask: usize,
    shift: u32,
    keys: Vec<i128>,
}

const EMPTY: i128 = i128::MIN;

impl Set {
    fn new(items: &[i128]) -> Self {
        let cap = (items.len() * 4).next_power_of_two().max(16);
        let mut s = Set { mask: cap - 1, shift: 64 - cap.trailing_zeros(), keys: vec![EMPTY; cap] };
        for &x in items {
            let mut i = s.h(x);
            while s.keys[i] != EMPTY && s.keys[i] != x {
                i = (i + 1) & s.mask;
            }
            s.keys[i] = x;
        }
        s
    }
    /// multiplicative hash: the HIGH bits of the product (the low bits depend only on the low digits)
    #[inline]
    fn h(&self, x: i128) -> usize {
        let u = x as u128;
        let a = (u as u64).wrapping_mul(0x9E37_79B9_7F4A_7C15) ^ ((u >> 64) as u64).wrapping_mul(0xC2B2_AE3D_27D4_EB4F);
        (a.wrapping_mul(0x9E37_79B9_7F4A_7C15) >> self.shift) as usize
    }
    #[inline]
    fn contains(&self, x: i128) -> bool {
        let mut i = self.h(x);
        loop {
            let k = self.keys[i];
            if k == x {
                return true;
            }
            if k == EMPTY {
                return false;
            }
            i = (i + 1) & self.mask;
        }
    }
}

struct Shape {
    id: String,
    r: usize,
    pc: Vec<(i64, i64)>,
    qc: Vec<(i64, i64)>,
    diffs: Vec<(i64, i64)>,
}

/// pull the integers out of the JSON array that follows "key": on a line (shape files are machine-written)
fn json_ints(line: &str, key: &str) -> Vec<i64> {
    let at = line.find(&format!("\"{key}\"")).unwrap_or_else(|| panic!("no {key} in {line}"));
    let rest = &line[at + key.len() + 2..];
    let start = rest.find('[').unwrap();
    let mut depth = 0;
    let mut end = start;
    for (i, c) in rest[start..].char_indices() {
        match c {
            '[' => depth += 1,
            ']' => {
                depth -= 1;
                if depth == 0 {
                    end = start + i;
                    break;
                }
            }
            _ => {}
        }
    }
    rest[start..=end]
        .split(|c: char| !(c.is_ascii_digit() || c == '-'))
        .filter(|t| !t.is_empty() && *t != "-")
        .map(|t| t.parse().unwrap())
        .collect()
}

fn json_scalar(line: &str, key: &str) -> String {
    let at = line.find(&format!("\"{key}\"")).unwrap_or_else(|| panic!("no {key} in {line}"));
    let rest = line[at + key.len() + 2..].trim_start_matches([':', ' ']);
    let end = rest.find([',', '}']).unwrap();
    rest[..end].trim().trim_matches('"').to_string()
}

impl Shape {
    fn from_line(line: &str) -> Option<Shape> {
        let r: usize = json_scalar(line, "rank").parse().unwrap();
        let id = json_scalar(line, "type");
        let pts = |key: &str| -> Vec<Vec<i64>> { json_ints(line, key).chunks(r).map(|c| c.to_vec()).collect() };
        let (p, q) = (pts("P"), pts("Q"));
        // basis differences e1 (, e2) of P with |det| = 1, first in permutation order as build_shapes.py
        let k = p.len();
        let mut best: Option<(Vec<i64>, Vec<i64>)> = None;
        'outer: for i0 in 0..k {
            for i1 in 0..k {
                if i1 == i0 {
                    continue;
                }
                let e1: Vec<i64> = (0..r).map(|c| p[i1][c] - p[i0][c]).collect();
                if r == 1 {
                    if e1[0].abs() == 1 {
                        best = Some((e1, vec![]));
                        break 'outer;
                    }
                    continue;
                }
                for i2 in 0..k {
                    if i2 == i0 || i2 == i1 {
                        continue;
                    }
                    let e2: Vec<i64> = (0..r).map(|c| p[i2][c] - p[i0][c]).collect();
                    if (e1[0] * e2[1] - e1[1] * e2[0]).abs() == 1 {
                        best = Some((e1, e2));
                        break 'outer;
                    }
                }
            }
        }
        let Some((e1, e2)) = best else {
            eprintln!("skipped: shape {id}: no unimodular pair of differences");
            return None;
        };
        let co = |v: &Vec<i64>| -> (i64, i64) {
            if r == 1 {
                (v[0] * e1[0], 0)
            } else {
                let (a, b, c, d) = (e1[0], e1[1], e2[0], e2[1]);
                let det = a * d - b * c;
                ((v[0] * d - v[1] * c).div_euclid(det), (-v[0] * b + v[1] * a).div_euclid(det))
            }
        };
        let pc: Vec<_> = p.iter().map(co).collect();
        let qc: Vec<_> = q.iter().map(co).collect();
        let mut diffs = std::collections::BTreeSet::new();
        for s in [&pc, &qc] {
            for i in 0..s.len() {
                for j in i + 1..s.len() {
                    let mut d = (s[i].0 - s[j].0, s[i].1 - s[j].1);
                    if d.0 < 0 || (d.0 == 0 && d.1 < 0) {
                        d = (-d.0, -d.1);
                    }
                    diffs.insert(d);
                }
            }
        }
        let mut diffs: Vec<_> = diffs.into_iter().collect();
        diffs.sort_by_key(|d| d.0.abs() + d.1.abs()); // stable: small combinations first, early reject
        Some(Shape { id, r, pc, qc, diffs })
    }
}

type Canon = Vec<Vec<i64>>;

fn canon(s: &[Vec<i64>]) -> Canon {
    let m = s.iter().min().unwrap().clone();
    let mut v: Canon = s.iter().map(|p| p.iter().zip(&m).map(|(a, b)| a - b).collect()).collect();
    v.sort();
    v
}

fn canon_any(s: &[Vec<i64>]) -> Canon {
    let neg: Vec<Vec<i64>> = s.iter().map(|p| p.iter().map(|x| -x).collect()).collect();
    canon(s).min(canon(&neg))
}

fn odd_limit(v: &[i64], primes: &[u64]) -> u128 {
    let (mut num, mut den) = (1u128, 1u128);
    for (&p, &e) in primes.iter().zip(v) {
        if e > 0 {
            num *= (p as u128).pow(e as u32);
        } else if e < 0 {
            den *= (p as u128).pow((-e) as u32);
        }
    }
    num.max(den)
}

fn gcd(a: u128, b: u128) -> u128 {
    if b == 0 { a } else { gcd(b, a % b) }
}

fn ratio(v: &[i64], primes: &[u64]) -> String {
    let (mut num, mut den) = (1u128, 1u128);
    for (&p, &e) in primes.iter().zip(v) {
        if e > 0 {
            num *= (p as u128).pow(e as u32);
        } else if e < 0 {
            den *= (p as u128).pow((-e) as u32);
        }
    }
    while num >= 2 * den {
        den *= 2;
    }
    while num < den {
        num *= 2;
    }
    let g = gcd(num, den);
    let (num, den) = (num / g, den / g);
    if den == 1 { format!("{num}") } else { format!("{num}/{den}") }
}

type Found = HashMap<(Canon, Canon), (usize, Vec<i128>, Vec<i128>)>;

fn work(sh: &Shape, si: usize, xs: &[i128], d: &[i128], set: &Set, n: usize, found: &mut Found) {
    let ys: Vec<i128> = if sh.r == 2 { d.to_vec() } else { vec![0] };
    for &x in xs {
        for &y in &ys {
            if !sh.diffs.iter().all(|&(a, b)| set.contains(a as i128 * x + b as i128 * y)) {
                continue;
            }
            let pa: Vec<i128> = sh.pc.iter().map(|&(a, b)| a as i128 * x + b as i128 * y).collect();
            let pb: Vec<i128> = sh.qc.iter().map(|&(a, b)| a as i128 * x + b as i128 * y).collect();
            let va: Vec<Vec<i64>> = pa.iter().map(|&s| dec(s, n)).collect();
            let vb: Vec<Vec<i64>> = pb.iter().map(|&s| dec(s, n)).collect();
            let (ca, cb) = (canon_any(&va), canon_any(&vb));
            if ca == cb {
                continue;
            }
            let key = if ca <= cb { (ca, cb) } else { (cb, ca) };
            // deterministic representative: smallest (shape, A, B)
            let cand = (si, pa, pb);
            match found.get(&key) {
                Some(old) if (old.0, &old.1, &old.2) <= (cand.0, &cand.1, &cand.2) => {}
                _ => {
                    found.insert(key, cand);
                }
            }
        }
    }
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let opt = |name: &str| args.iter().position(|a| a == name).map(|i| args[i + 1].clone());
    let multi = |name: &str| -> Option<Vec<String>> {
        let i = args.iter().position(|a| a == name)?;
        Some(args[i + 1..].iter().take_while(|a| !a.starts_with("--")).cloned().collect())
    };
    let k: usize = opt("--k").expect("--k").parse().unwrap();
    let limit: u64 = opt("--limit").expect("--limit").parse().unwrap();
    let q: u64 = opt("--q").expect("--q").parse().unwrap();
    let threads: usize = opt("--threads").map(|x| x.parse().unwrap()).unwrap_or(12);
    let only = multi("--only");
    let files = multi("--shapes").expect("--shapes");
    let primes: Vec<u64> = PR.iter().copied().filter(|&p| p <= limit).collect();
    let n = primes.len();
    let vecs = allowed(&primes, q);
    let d: Vec<i128> = vecs.iter().map(|v| enc(v)).collect();
    let set = Set::new(&d);
    let mut shapes = vec![];
    for f in &files {
        for line in std::fs::read_to_string(f).unwrap().lines().filter(|l| !l.trim().is_empty()) {
            let lk: usize = json_scalar(line, "k").parse().unwrap();
            let r: usize = json_scalar(line, "rank").parse().unwrap();
            let id = json_scalar(line, "type");
            if lk != k || r > 2 || only.as_ref().is_some_and(|o| !o.contains(&id)) {
                continue;
            }
            if let Some(s) = Shape::from_line(line) {
                shapes.push(s);
            }
        }
    }
    // L and -L give mirrored placements (the same family): x >= 0 only (as build_shapes.py)
    let xs: Vec<i128> = d.iter().copied().filter(|&x| x >= 0).collect();
    let mut fams: Found = HashMap::new();
    for (si, sh) in shapes.iter().enumerate() {
        let chunks: Vec<Vec<i128>> = (0..threads * 8).map(|c| xs.iter().skip(c).step_by(threads * 8).copied().collect()).collect();
        let next = std::sync::atomic::AtomicUsize::new(0);
        let results: Vec<Found> = std::thread::scope(|sc| {
            let hs: Vec<_> = (0..threads)
                .map(|_| {
                    sc.spawn(|| {
                        let mut f = Found::new();
                        loop {
                            let c = next.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
                            if c >= chunks.len() {
                                break;
                            }
                            work(sh, si, &chunks[c], &d, &set, n, &mut f);
                        }
                        f
                    })
                })
                .collect();
            hs.into_iter().map(|h| h.join().unwrap()).collect()
        });
        for f in results {
            for (key, cand) in f {
                match fams.get(&key) {
                    Some(old) if (old.0, &old.1, &old.2) <= (cand.0, &cand.1, &cand.2) => {}
                    _ => {
                        fams.insert(key, cand);
                    }
                }
            }
        }
    }
    let sorted: BTreeMap<_, _> = fams.into_iter().collect();
    let mut first: BTreeMap<u64, u128> = BTreeMap::new();
    let out = std::io::stdout();
    let mut out = std::io::BufWriter::new(out.lock());
    let fmt_vecs = |c: &Canon| format!("[{}]", c.iter().map(|v| format!("[{}]", v.iter().map(|x| x.to_string()).collect::<Vec<_>>().join(", "))).collect::<Vec<_>>().join(", "));
    for ((ca, cb), (si, pa, pb)) in &sorted {
        let mut va: Vec<Vec<i64>> = pa.iter().map(|&s| dec(s, n)).collect();
        let mut vb: Vec<Vec<i64>> = pb.iter().map(|&s| dec(s, n)).collect();
        let mut fq = 0u128;
        for a in &va {
            for b in &va {
                let diff: Vec<i64> = a.iter().zip(b).map(|(x, y)| x - y).collect();
                fq = fq.max(odd_limit(&diff, &primes));
            }
        }
        let used: Vec<u64> = (0..n).filter(|&i| va.iter().chain(&vb).any(|v| v[i] != 0)).map(|i| primes[i]).collect();
        for &p in &used {
            let e = first.entry(p).or_insert(fq);
            *e = (*e).min(fq);
        }
        va.sort();
        vb.sort();
        let ra: Vec<String> = va.iter().map(|v| format!("\"{}\"", ratio(v, &primes))).collect();
        let rb: Vec<String> = vb.iter().map(|v| format!("\"{}\"", ratio(v, &primes))).collect();
        writeln!(out, "{{\"k\": {k}, \"limit\": {limit}, \"q\": {fq}, \"primes_used\": [{}], \"shape\": \"{}\", \"members\": [[{}], [{}]], \"key\": [{}, {}]}}",
                 used.iter().map(|p| p.to_string()).collect::<Vec<_>>().join(", "), shapes[*si].id, ra.join(", "), rb.join(", "),
                 fmt_vecs(ca), fmt_vecs(cb)).unwrap();
    }
    out.flush().unwrap();
    eprintln!("k={k} limit={limit} q<={q}: {} intervals, {} shapes, {} families; first q per prime: {:?}",
              vecs.len(), shapes.len(), sorted.len(), first);
}
