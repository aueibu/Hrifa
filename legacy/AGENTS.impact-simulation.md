## Imported Claude Cowork project instructions

# Impact Simulation → Glyph Generation: Project Instructions

## Purpose

This project simulates real-world objects dropped onto surfaces, uses the physically simulated landing/rebound behavior to populate a grid, and then uses the resulting grid occupancy pattern as the basis for hand-drawn geometric/organic glyphs. The glyphs are intended for use as decorative marks. The core requirement is that the underlying grid data come from **physically plausible drop simulations**, not synthetic or hand-composed values — the realism of the physics is what gives the glyphs their legitimacy.

## Simulation Scope

- **Objects:** 20 mm cubes of the following materials — tungsten, titanium, bismuth, carbon, aluminum, iron, copper, lead, zinc, vanadium, chromium, nickel, tin, antimony, zirconium, niobium, molybdenum, magnesium
- **Surfaces:** strips at 100 x 20 x 1 mm, in aluminum, copper, zinc, nickel, tin, iron
- **Drop heights:** 0 to 3 m
- **Physics engine:** Rapier
- **Grid resolution:** landing positions are projected onto a grid (10x10 or 25x25) after the drop/bounce simulation settles

## Grid → Glyph Logic

- Grid cell occupancy count acts as a heat map for glyph emphasis:
  - 1 occupant → small line or dot
  - 2 occupants → open circle
  - 3+ occupants → closed dot or reinforced line
- Adjacent occupied cells grow into a connected, longer form of that value's mark
- Final glyphs are drawn by hand as a loose interpretation of the grid results — not a literal cell-by-cell rendering

## What's Needed From This Project Chat

This chat will be pointed at a folder of markdown documents derived from the ASM Metals Handbook series (property/reference data for various alloys and materials). The goal is to extract and organize the physical/mechanical property data needed to make the drop simulation accurate for the object and surface materials listed above. Specifically, for each material/alloy:

- **Density** (for mass and momentum calculations)
- **Elastic modulus** (tension, shear, compression where available — for deformation/stiffness behavior on impact)
- **Hardness** (where available — relevant to contact behavior and potential surface deformation)
- **Any data relevant to coefficient of restitution or rebound behavior**, if present in the source material (this is less commonly tabulated directly in ASM volumes and may need to be inferred or approximated from hardness/modulus data)

Only some of the listed materials may be covered in a given handbook volume — flag any object or surface material for which reference data is missing so it can be sourced separately.

## Working Notes

- The materials list spans both common structural metals (iron, aluminum, copper) and less common/special-purpose ones (tungsten, bismuth, vanadium, zirconium, niobium, molybdenum) — these may be split across different ASM Handbook volumes (e.g., Vol. 1 for irons/steels, Vol. 2 for nonferrous/special-purpose materials).
- Output should ideally be organized as a single reference table (material → density → elastic modulus → hardness → notes) that can be fed directly into the simulation setup.
