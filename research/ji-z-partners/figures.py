"""Figures and summary tables from tables/families.csv + tables/factors.csv.

usage: python3 figures.py RUN_DIR
"""
import sys, json, collections
import numpy as np
import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from zcore import exps, ratio, tenney, unit_links, canon

run = sys.argv[1]
SURF, INK, INK2, GRID = "#fcfcfb", "#0b0b0b", "#52514e", "#e4e3df"
BLUE, ORANGE, AQUA = "#2a78d6", "#eb6834", "#1baf7a"
plt.rcParams.update({"figure.facecolor": SURF, "axes.facecolor": SURF, "savefig.facecolor": SURF,
                     "axes.edgecolor": INK2, "axes.labelcolor": INK, "text.color": INK,
                     "xtick.color": INK2, "ytick.color": INK2, "axes.spines.top": False,
                     "axes.spines.right": False, "font.size": 10, "axes.grid": True,
                     "grid.color": GRID, "axes.axisbelow": True, "grid.linewidth": 0.6})

df = pd.read_csv("tables/families.csv")
fa = pd.read_csv("tables/factors.csv")
df = df.merge(fa, on="family")
df["mechanism"] = np.where(df.explained.str.startswith("direct sum"), "0/1 factors (direct sum)", "signed factor")
summ = pd.read_csv(f"{run}/summary.csv").set_index("notes")

# ---------- tables ----------
by_k = df.groupby("k").agg(families=("family", "size"),
                           direct_sum=("mechanism", lambda s: (s == "0/1 factors (direct sum)").sum()),
                           signed=("mechanism", lambda s: (s == "signed factor").sum()),
                           contains_smaller=("explained", lambda s: (s == "contains smaller Z-pair").sum()),
                           lattice_mirror=("hex_related", lambda s: s.notna().sum()),
                           up_to_lattice_symmetry=("hex_key", "nunique"),
                           same_link_pattern=("same_link", "mean"),
                           shared_mean=("shared_max", "mean"),
                           distinct_ic_mean=("distinct_ic", "mean"))
by_k["set_classes"] = summ.loc[by_k.index, "set_classes"]
by_k["per_million_classes"] = by_k.families / by_k.set_classes * 1e6
by_k.to_csv("tables/by_k.csv")
print(by_k.round(3).to_string())
print(pd.crosstab(df.k, [df.n_factors, df.n_flipped]))
print(df.signed_factors.str.split(" ; ").explode().value_counts().head(12))
vf = df.groupby("V").agg(families=("family", "size"), ks=("k", lambda s: ",".join(map(str, sorted(set(s)))))).sort_values("families", ascending=False)
vf.to_csv("tables/flipped_factor_V.csv"); print(vf.head(15).to_string()); print("distinct flipped V:", len(vf))

# ---------- fig 1: families per k, and mechanism shares ----------
fig, ax = plt.subplots(1, 2, figsize=(11, 4))
ks = by_k.index.values
ax[0].bar(ks, by_k.families, color=BLUE, width=0.7)
ax[0].set_yscale("log"); ax[0].set_xlabel("notes k"); ax[0].set_title("Z-families per k (log scale)", loc="left")
for k, v in zip(ks, by_k.families):
    if k % 3 == 0 or k == 16:
        ax[0].annotate(f"{v:,}", (k, v), ha="center", va="bottom", fontsize=8, color=INK2)
ax[0].set_xticks(range(6, 17))
ax[1].plot(ks, by_k.per_million_classes, color=BLUE, lw=2, marker="o", ms=6)
ax[1].set_yscale("log"); ax[1].set_xlabel("notes k"); ax[1].set_xticks(range(6, 17))
ax[1].set_title("Z-families per million set classes", loc="left")
for k in (9, 12, 15):
    ax[1].axvline(k, color=GRID, lw=3, zorder=0)
fig.tight_layout(); fig.savefig("figs/fig1_counts.png", dpi=150); plt.close(fig)

# ---------- fig 2: mechanism split ----------
fig, ax = plt.subplots(figsize=(7, 3.8))
d = by_k.direct_sum / by_k.families; s = by_k.signed / by_k.families
ax.bar(ks, d, color=BLUE, width=0.7, label="0/1 factors: P = A⊕B, Q = A⊕(−B)")
ax.bar(ks, s, bottom=d, color=ORANGE, width=0.7, label="a factor has a −1 coefficient",
       edgecolor=SURF, linewidth=2)
ax.set_xticks(range(6, 17)); ax.set_xlabel("notes k"); ax.set_ylabel("share of families")
ax.set_title("How each Z-pair factors (P = U·V, Q = U·V*)", loc="left")
ax.legend(frameon=False, loc="lower left", bbox_to_anchor=(0, 1.04), ncol=2, fontsize=9)
ax.set_title("How each Z-pair factors (P = U·V, Q = U·V*)", loc="left", pad=28)
fig.tight_layout(); fig.savefig("figs/fig2_mechanism.png", dpi=150); plt.close(fig)

# ---------- fig 3: shared notes ----------
fig, ax = plt.subplots(figsize=(7, 3.8))
for k in ks:
    sub = df[df.k == k].shared_max.value_counts(normalize=True)
    ax.scatter([k] * len(sub), sub.index, s=sub.values * 400, color=BLUE, alpha=0.85, edgecolor=SURF)
ax.plot(ks, ks, color=INK2, lw=1, ls="--"); ax.text(6.2, 6.9, "all k notes shared", color=INK2, fontsize=8, rotation=20)
ax.set_xticks(range(6, 17)); ax.set_xlabel("notes k"); ax.set_ylabel("notes in common")
ax.set_title("Most notes a partner can share with its original\n(after best transposition/inversion; dot area = share)", loc="left")
fig.tight_layout(); fig.savefig("figs/fig3_shared.png", dpi=150); plt.close(fig)

# ---------- fig 4: lattice drawings of the small families ----------
E3, E5 = np.array([1, 0]), np.array([0.5, -0.866])
gamut = [exps(r) for r in open(f"{run}/gamut.txt").read().split()]


def xy(v): return v[0] * E3 + v[1] * E5


def align(P, Q):
    """move Q (by translation/inversion) to share most notes with P"""
    Ps = set(P); best = (-1, None)
    for sg in (1, -1):
        Qs = [(sg * a, sg * b) for a, b in Q]
        for p in P:
            for q in Qs:
                t = (p[0] - q[0], p[1] - q[1]); T = [(a + t[0], b + t[1]) for a, b in Qs]
                n = len(Ps & set(T))
                if n > best[0]: best = (n, T)
    return best[1]


def root_best(P, Q):
    """pick the original's note that, taken as 1/1, keeps both sets simplest (sum of Tenney heights)"""
    cands = set(P)
    r = min(cands, key=lambda c: sum(tenney((a - c[0], b - c[1])) for a, b in list(P) + list(Q)))
    sh = lambda S: [(a - r[0], b - r[1]) for a, b in S]
    return sh(P), sh(Q)


def draw(ax, P, Q, title):
    Q = align(P, Q); P, Q = root_best(P, Q)
    allp = P + Q
    A = [a for a, _ in allp]; Bv = [b for _, b in allp]
    for a in range(min(A) - 3, max(A) + 4):          # faint background lattice
        for b in range(min(Bv) - 1, max(Bv) + 2):
            c = xy((a, b)); ax.scatter(*c, s=6, color=GRID, zorder=1)
    C = np.array([xy(v) for v in allp])
    ax.set_xlim(C[:, 0].min() - 0.8, C[:, 0].max() + 0.8); ax.set_ylim(C[:, 1].min() - 0.6, C[:, 1].max() + 0.8)
    for S, col, off in ((P, BLUE, 0.0), (Q, ORANGE, 0.0)):
        for i, j in unit_links(S):
            a, b = xy(S[i]), xy(S[j]); ax.plot([a[0], b[0]], [a[1], b[1]], color=col, lw=2, alpha=0.6)
    Ps, Qs = set(P), set(Q)
    for v in Ps | Qs:
        c = xy(v)
        if v in Ps and v in Qs:
            ax.scatter(*c, s=90, color=INK, zorder=3)
        elif v in Ps:
            ax.scatter(*c, s=90, color=BLUE, zorder=3)
        else:
            ax.scatter(*c, s=90, facecolor=SURF, edgecolor=ORANGE, linewidth=2, zorder=3)
        ax.annotate(str(ratio(v)), c, xytext=(0, 7), textcoords="offset points", ha="center", fontsize=7, color=INK2)
    ax.set_title(title, fontsize=9, loc="left", pad=10); ax.set_aspect("equal", adjustable="box"); ax.set_xticks([]); ax.set_yticks([]); ax.grid(False)
    for sp in ax.spines.values(): sp.set_visible(False)


small = df[df.k <= 7].sort_values(["k", "family"])
fig, axs = plt.subplots(3, 5, figsize=(17, 10))
for ax, (_, r) in zip(axs.flat, small.iterrows()):
    draw(ax, [tuple(v) for v in json.loads(r.P)], [tuple(v) for v in json.loads(r.Q)], f"#{r.family}  k={r.k}  shared {r.shared_max}")
for ax in axs.flat[len(small):]:
    ax.grid(False)
    ax.axis("off")
fig.suptitle("All k = 6 and k = 7 families on the 5-limit lattice (3 →, 5 ↘). Black = shared, blue = original only, orange ring = partner only",
             x=0.01, ha="left", fontsize=11)
fig.tight_layout(); fig.savefig("figs/fig4_small_families.png", dpi=150); plt.close(fig)

# ---------- fig 5: one direct-sum example, decomposed ----------
ex = df[(df.k == 9) & (df.mechanism == "0/1 factors (direct sum)")].sort_values("ic_tenney_mean").iloc[0]
A = [tuple(v) for v in json.loads(ex.ds_A)]; B = [tuple(v) for v in json.loads(ex.ds_B)]
P = [(a[0] + b[0], a[1] + b[1]) for a in A for b in B]; Q = [(a[0] - b[0], a[1] - b[1]) for a in A for b in B]
fig, axs = plt.subplots(1, 4, figsize=(13, 3.6))
for ax, S, col, t in ((axs[0], A, INK, "A"), (axs[1], B, INK, "B")):
    for v in S:
        ax.scatter(*xy(v), s=90, color=col); ax.annotate(str(ratio(v)), xy(v), xytext=(0, 7), textcoords="offset points", ha="center", fontsize=8, color=INK2)
    ax.set_title(t, loc="left"); ax.set_aspect("equal"); ax.axis("off"); ax.margins(0.4)
for ax, S, col, t in ((axs[2], P, BLUE, "A ⊕ B"), (axs[3], Q, ORANGE, "A ⊕ (−B)")):
    S, _ = root_best(S, S)
    for i, j in unit_links(S):
        a, b = xy(S[i]), xy(S[j]); ax.plot([a[0], b[0]], [a[1], b[1]], color=col, lw=2, alpha=0.6)
    for v in S:
        ax.scatter(*xy(v), s=90, color=col); ax.annotate(str(ratio(v)), xy(v), xytext=(0, 7), textcoords="offset points", ha="center", fontsize=7, color=INK2)
    ax.set_title(t, loc="left"); ax.set_aspect("equal"); ax.axis("off")
fig.suptitle(f"Family #{ex.family}: the direct-sum mechanism. Same 36 intervals, different chord", x=0.01, ha="left")
fig.tight_layout(); fig.savefig("figs/fig5_direct_sum.png", dpi=150); plt.close(fig)

# ---------- musical shortlist ----------
rows = []
for _, r in df[df.k <= 9].iterrows():
    P = [tuple(v) for v in json.loads(r.P)]; Q = align(P, [tuple(v) for v in json.loads(r.Q)])
    P, Q = root_best(P, Q)
    srt = lambda S: " ".join(str(ratio(v)) for v in sorted(S, key=ratio))
    rows.append({"family": r.family, "k": r.k, "mechanism": r.mechanism, "shared": r.shared_max,
                 "interval_tenney_mean": round(r.ic_tenney_mean, 2),
                 "pitch_tenney_mean": round(np.mean([tenney(v) for v in P + Q]), 2),
                 "lattice_mirror": r.hex_related if isinstance(r.hex_related, str) else "",
                 "original": srt(P), "partner": srt(Q)})
sl = pd.DataFrame(rows).sort_values(["k", "interval_tenney_mean", "pitch_tenney_mean"])
sl.to_csv("tables/shortlist_k6_9.csv", index=False)
print(sl.groupby("k").head(4).to_string())
