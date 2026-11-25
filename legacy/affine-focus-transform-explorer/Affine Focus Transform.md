---
date: 2026-07-13T13:51:00
type: concept
style: b_branch
source:
  - personal
theme:
status:
tags:
---
# Affine Focus Transform (AFT)
## Definition
Let:
- `m` = modulus
- `S ⊆ Z_m` = source pitch-class set
- `f ∈ S` = chosen focus
- `a ∈ Z_m` = multiplier
The Affine Focus Transform is defined by:
    T_f,a(x) = f + a(x - f) (mod m)
for every pitch-class `x` in the set.
The transformed set is:
    T_f,a(S) = { T_f,a(x) | x ∈ S }
 
## Geometric Interpretation
The focus acts as an invariant anchor point.
1. Compute the offset of each pitch from the focus:
       d = (x - f) mod m
2. Scale that offset by the multiplier:
       d' = a·d mod m
3. Reconstruct the pitch relative to the same focus:
       x' = (f + d') mod m
Thus, the AFT scales modular distances from the chosen focus.
 
## Equivalent Affine Form
Expanding the definition:
    T_f,a(x)
    = f + a(x - f)
gives:
    T_f,a(x)
    = a·x + (1 - a)·f  (mod m)
This makes clear that AFT is an affine transformation over Z_m.
 
## Fixed Point Property
The focus is always fixed.
Proof:
    T_f,a(f)
    = f + a(f - f)
    = f
Therefore:
    T_f,a(f) = f
for all multipliers.
 
## Identity Transform
When:
    a = 1
Then:
    T_f,1(x)
    = f + (x - f)
    = x
Therefore:
    T_f,1(S) = S
for every set and every focus.
This matches the current Composition Toolbox implementation.
 
## Collapse Transform
When:
    a = 0
Then:
    T_f,0(x)
    = f
Every pitch collapses onto the focus.
The resulting set is:
    {f}
 
## Example
Source set:
    S = {0,1,4,6}
Focus:
    f = 1
Multiplier:
    a = 5
Calculations:
| x | (x-f) mod 12 | 5(x-f) mod 12 | Result |
| | :| :| :|
| 0 | 11 | 7 | 8 |
| 1 | 0 | 0 | 1 |
| 4 | 3 | 3 | 4 |
| 6 | 5 | 1 | 2 |
Result:
    T_1,5(S)
    = {1,2,4,8}
 
## Bijectivity
The transform is bijective iff:
    gcd(a,m) = 1
For modulus 12 the invertible multipliers are:
    {1,5,7,11}
All other multipliers produce many-to-one mappings.
 
## Closure Graph Construction
Given a set S:
1. Choose a focus f ∈ S
2. Apply T_f,a
3. Produce a resulting set
4. Repeat for every focus in the resulting set
5. Continue until no unseen sets remain
The resulting directed graph is the AFT closure graph.
### Nodes
Canonical pitch-class sets.
### Edges
AFT operations labeled by:
- focus
- multiplier
 
## Ordered Form
For an ordered source list:
    (x₀,x₁,...,xₙ)
and focus index k:
    yᵢ = x_k + a(xᵢ - x_k) (mod m)
This is the form used by the Composition Toolbox implementation.
 
## Implementation Reference
Composition Toolbox computes:
1. Offset from focus:
       (x - f) mod m
2. Scaled offset:
       a(x - f) mod m
3. Reconstruction:
       f + a(x - f) mod m
This definition is authoritative and supersedes earlier notes that described the transform as:
    a·x - f
which is a different affine transformation and is not the implementation currently used in the application.