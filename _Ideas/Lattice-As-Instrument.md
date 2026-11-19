# Harmonic Lab idea: the lattice as the instrument

> Notes from an exploratory conversation. No arc exists for this yet and nothing in the repo was changed.
>
> **Status convention** (same as `Workbench-UI-Musings.md`):
> - **DECIDED** = the user explicitly chose it.
> - **LEANING** = proposed and the user liked it, not yet confirmed as final.
> - **OPEN** = unresolved.

---

## 1. The idea

Today the lab makes pitches first (harmonics, EDO, CPS, custom) and then draws a lattice to describe them. The idea is to turn this around: the lattice is the thing that makes the pitches, and something (a molecule, a density field of points) is projected onto it and read back as a pitch field.

Two threads:

1. **Project a structure onto a lattice.** Atoms or a density field in 3D (or n-D) space are read back as harmonic content.
2. **Move a point through space.** Its motion is read as a change in pitch content. Headline example: a few water molecules going from a "liquid" state to a "frozen" state and hearing the pitch field change.

## 2. Core mechanism

A lattice is already a linear map from positions to pitch. With axes 3, 5, 7, a point (a, b, c) is the pitch 3^a * 5^b * 7^c, folded into one octave. In cents: a * 1901.955 + b * 2786.314 + c * 3368.826 (mod 1200).

- Whole-number positions give just intonation (what the lab's lattice view shows today).
- Positions between nodes give microtonal pitches, for example (0.5, 0, 0) is half a fifth, about 951 cents.
- So there is a natural "how snapped" knob: raw positions versus rounded to the nearest node. **LEANING**

**The freezing story (LEANING):** liquid atoms are scattered, so they give a rough cluster of unrelated microtonal pitches. Frozen atoms sit on regular sites, so the same cluster resolves into a clean just chord. Plotting the lab's live roughness against time would show it falling as the water freezes.

## 3. Readouts

| Readout | What a pitch is | Liquid | Ice | Status |
|---|---|---|---|---|
| A. Position | Each atom's location through the axes | Random smear | Clean chord if spacing lines up | **DECIDED** (wanted) |
| B. Distance | Each atom pair's distance as an interval | One broad blur | A few sharp intervals | Not chosen (later extra, does not use the lattice) |
| C. Density | Blur atoms into a density field, read each node's density as that pitch's loudness | Weak, even loudness | Strong loudness on few nodes | **DECIDED** (wanted) |

## 4. Atoms, not molecules

Every atom is its own point (water is 1 oxygen + 2 hydrogens), because the molecule's shape is what makes the chord.

- Water geometry: O-H 0.957 A, H-O-H 104.5 degrees. With O at the origin, H at (+-0.757, 0.586, 0) A.
- Worked example with axes 3, 5, 7 and 1 A = one step: O = 0 cents, H1 about 673 cents, H2 about 193 cents.
- **Rotation changes the chord**, because the axes are tied to primes. A molecule's orientation becomes a control (spin it, sweep its chord).
- **Weighting: oxygen heavier than hydrogen, 8 to 1 (by electron count). DECIDED.** Reason: the oxygen framework of ice becomes the main chord and hydrogens add color. Alternatives not taken: mass 16 to 1, equal weight.

## 5. Geometry: what is defined and what is free

| Part | Defined or free |
|---|---|
| Inside one molecule (bond lengths, angle) | Defined by physics |
| Molecule's rotation in space | Arbitrary |
| Molecules relative to each other in ice | Defined by the crystal (each oxygen has 4 neighbors about 2.76 A away) |
| Molecules relative to each other in liquid | Statistical, no fixed arrangement |

Liquid versus crystal is a **state** of a substance, not a property of the molecule (water freezes at 0 C, aspirin melts at about 135 C). A crystal database only ever holds the ordered state, so the liquid has no file and must be generated.

## 6. Molecule sources and formats

- **PubChem** (3D coordinates), **Protein Data Bank** (large biomolecules), **Crystallography Open Database** and the **CCDC** (crystals as `.cif`).
- **XYZ** is the simplest format: one element plus three coordinates per line.
- **RDKit** (also runs in a browser) can build 3D coordinates from a name-like string such as `O`.
- **LEANING:** no live database lookups. A small built-in list (water, ammonia, methane, CO2), plus a paste box for XYZ text, plus a CIF reader for crystals. Offline, nothing loaded from outside.

## 7. Crystal boxes (unit cells)

Example read from the CCDC page the user supplied (aspirin, shown in the chemical diagram as a benzene ring with a COOH group and an O-C(=O)CH3 group on neighboring corners, C9H8O4, 21 atoms):

`Space group P 2_1/c (14); a 11.233(3) A, b 6.5440(10) A, c 11.231(3) A; alpha 90, beta 95.89(2), gamma 90`

- Box volume about 821 A^3, normally 4 molecules per box. The number in brackets is the uncertainty in the last digit.
- The space group is a set of symmetry rules that generate the full atom list from the few atoms the file lists.
- The `.cif` stores atoms as fractions of the box edges. The box numbers convert fractions to angstroms.
- The diagram alone has no coordinates, so the importer must read the `.cif`.
- With the 8-to-1 weighting, aspirin's 4 oxygens and 9 carbons dominate and its 8 hydrogens barely register.

**Two mappings (LEANING):**

| Option | Mapping | Result for an atom at box position (0.5, 0, 0) |
|---|---|---|
| 1. Real distances | Convert to angstroms, 1 A = one step per axis | An arbitrary pitch |
| 2. Box edges as prime axes | One box edge = one step (a = 3/1, b = 5/1, c = 7/1) | Exactly 951 cents. Moving one box over adds a pure 3/1. |

Option 2 makes the crystal's repeat distance a clean interval, so the crystal sits exactly on the harmonic lattice. **Revised (LEANING): these are not two mappings but one mapping with one knob, "angstroms per step".** Option 1 is a fixed value (such as 1 A per step); option 2 is the value set to each box edge's own length. A liquid made by wobbling the ice can use the ice box's scale, so no morph between mappings is needed.

The trade-off, with a pair of atoms 1.514 A apart (the two hydrogens of water) along the 3 axis:

| Scale | Ice box (a = 4.52 A) | Protein box (a = 50 A) |
|---|---|---|
| Fixed 1 A per step | 480 cents | 480 cents |
| One box edge per step | 637 cents | 58 cents |

- A fixed scale keeps the same molecule sounding the same everywhere, but a crystal's repeat distance does not land on a clean interval.
- Box-edge scale makes the crystal repeat exactly, but the same molecule sounds different in different boxes.
- Correction made in the conversation: earlier it was said the box-edge scale loses size information. The real loss is smaller: only that two crystals with the same arrangement but different size (for example NaCl and KCl, or ice expanding on freezing) would sound identical.
- For the water and ice slice this is moot, because there is one scale (the ice box) throughout. It matters only when comparing different crystals, so the default is **OPEN**.

## 7b. Test cases

- **Water and ice: the first slice. LEANING.** One molecule gives both ends of the morph (ice from a crystal file, liquid made by loosening the same ice).
- **Aspirin: later.** Crystal only, useful as a test that the CIF reader works on a real, larger file.

## 7c. Choosing the axes ("realizations")

- **The octave (2) is left out as an axis. DECIDED.** Pitches fold into one octave, matching the rest of the lab. (If 2 were an axis, one step along it would raise the pitch a whole octave, so height in space would become register in sound. Not taken for the first slice.)
- Forced: primes are the axes (they are independent directions), and the number of axes equals the number of space dimensions (3D = 3 primes).
- Free: which primes (the prime limit) and which prime goes on which axis.
- **Let the data choose, with an override so other realizations can be heard. DECIDED.** The lab's `rankAxes3d` already scores every three-prime choice by how many notes land on the grid; the structure's atoms would feed the same ranking. Caveat: this tunes the axes to the data, so it always flatters what is loaded.
- A realization = a set of three primes plus which prime goes on which box edge (6 assignments per prime set).
- **The picker shows the best few, with a "show all" toggle. LEANING (agreed in conversation).**
- The axes are not equal in sound: one step is 702 cents on the 3 axis, 386 on the 5 axis, 969 on the 7 axis. A per-axis scale could be a knob.

**Crystal boxes (facts from the conversation):**

- Two different boxes, not to be confused: every molecule has a **bounding box** (the smallest box around its atoms, set by its size), but only a crystal has a **unit cell** (the repeating tile, which holds one or more molecules). A single molecule, a gas, or a liquid has no unit cell. Cells tile space with no gaps but are not always cubes: seven shapes, from cubic (most regular) to triclinic (all angles off square). The choice of box for a crystal is a convention.
- Sizes: NaCl cubic 5.6 A (4 pairs); common ice hexagonal, about 4.5 A, 4.5 A and 7.3 A, gamma 120 degrees (4 molecules); aspirin 11.2 x 6.5 x 11.2 A (4 molecules, 84 atoms); proteins 50 to 100+ A (thousands of atoms).
- The crystallographic "lattice" (grid of box corners) is the same kind of object as the harmonic lattice: an endless grid of whole-number steps along three directions.

**Using the crystal's symmetry:**

1. It says which edges are equivalent. Cubic: all three; ice: two equal, one special; aspirin (monoclinic): only b is special. Correction made in the conversation: aspirin's a and c being nearly equal (11.233 vs 11.231 A) is a coincidence, not a symmetry. In a cubic crystal swapping edges leaves the structure unchanged but changes the sound, so each assignment is the same crystal heard differently.
2. It generates the atoms. The file lists a few atoms and the space group makes the rest. P 2_1/c gives four rules (positions in the box): (x, y, z); (-x, y+1/2, -z+1/2); (-x, -y, -z); (x, -y+1/2, z+1/2). The importer must apply the rules from the file.
3. It passes into sound. The inversion rule (-x, -y, -z) puts a twin of every atom at -p; since the pitch map is linear, the twin's pitch is the mirror (673 cents gives 527). So the chord has a mirror partner for every note around the root, the otonal/utonal relationship. In the standard setting the inversion center is at the box corner.

## 7d. The chemistry view (user's expectations)

- **First version (DECIDED):** a 3D view showing the lattice axes, with the molecule or crystal inside its bounding box as a visual cue. Separate from the lab's existing lattice visualizer (section 9, question 5).
- **Later (wanted):** a list of other molecules. Hover to preview one, and overlay, combine, or replace.
- Not every crystal is made of molecules: molecular crystals (ice, aspirin, dry ice, C60 as an fcc crystal of 60-atom balls) have separate molecules; ionic (table salt), covalent network (diamond, graphite sheets) and metallic (copper, iron) crystals do not. So the importer should read atoms with positions (and a unit cell when there is one), and the list is a list of structures, not molecules. The bounding box around one molecule and the natural contact distance between molecules apply only to molecular things; diamond has no separate piece to place.
- Consequences noted:
  - For a crystal the box is the unit cell. For a lone molecule, a liquid or a gas there is no cell, so the box would be drawn around the atoms. That box is only a visual cue and should not set the scale by itself (a small molecule and a large one would then sound equally spread out).
  - Combining structures with different boxes (water 4.5 A, aspirin 11 A) conflicts with a per-box scale. LEANING: one scale for the whole scene, set from the first structure (or chosen) and shared by everything added to it. This partly settles the "angstroms per step" default for the later multi-molecule case.
  - Moving a whole molecule through the lattice is a transposition: pitch is linear, so shifting every atom by a vector adds the same interval to every note, and the chord keeps its shape. Rotating a molecule changes the chord's shape (a reharmonization). This connects the moving-point idea to the overlay idea.
  - **DECIDED (user confirmed):** hovering a list item shows a faint ghost of it overlapped at the same origin as the current structure (its pitch points as ghost marks in the reference lattice, nothing placed, no spacing rules). Add places it side by side at its natural contact distance (adjustable, with a minimum). Replace swaps it for the current one. Example with two waters (0, 193, 673 cents): overlapped they are the same three notes stacked; placed 2.9 A apart along the 3 axis at 1 A per step the second is transposed by about 716 cents, giving six notes (0, 193, 673, 716, 909, 189), where 189 and 193 would beat.

## 7e. How close molecules get (physical spacing)

| Kind of distance | Typical value |
|---|---|
| Covalent bond (inside a molecule): O-H, C-H, C-C | 0.96, 1.09, 1.54 A |
| Hydrogen bond between waters (O to O) | about 2.7 to 2.8 A (ice 2.76 A) |
| Ionic contact (Na to Cl in salt) | 2.82 A |
| Plain contact between non-bonded molecules (sum of van der Waals radii: H 1.2, C 1.7, N 1.55, O 1.52 A) | O...O about 3.0 A, C...C about 3.4 A |
| Closer than that | Strong repulsion: not allowed |

- Volume per molecule of water: liquid about 30 A^3 (neighbors about 3.1 A apart), ice about 33 A^3 (ice is open and less dense), gas at room temperature and pressure about 40,600 A^3 (about 34 A apart, over 1000 times the volume).
- Orientation matters for polar molecules: in ice each water points its hydrogens at neighbors' oxygens, in a tetrahedral pattern (about 109.5 degrees). Plain non-polar molecules just pack as close as they touch.
- Consequences for the lab (LEANING): the stylized liquid wobble should keep a minimum distance between molecules (about 2.5 to 3 A for O...O), so the cloud is a constrained jostle rather than uniform random scatter. Combining structures could place them at their natural contact distance; a deliberate overlap at the same origin would be an artistic option, not a physical one. Physics fixes only the distance, not the interval: the interval depends on the axes, the scale and the direction of the contact. Example, an N...O contact of about 2.9 A at 1 A per step: along the 3 axis about 716 cents (a fifth, 14 cents sharp), along the 5 axis about 880, along the 7 axis about 170, along the diagonal (split equally across the three axes) about 290. A different scale changes all of these. **OPEN:** whether overlap should be allowed.

## 7f. Real-world anchors for the scale and the primes (discussion, nothing decided)

- A **step** is one whole unit along a lattice axis, which multiplies the pitch by that axis's prime (3 gives 702 cents folded, 5 gives 386, 7 gives 969). "Angstroms per step" is the zoom between real space and the lattice: a small scale makes pitch change fast with distance, a large scale makes nearby atoms sound close.
- The scale can be anchored to a real length in the structure. Example, the O-H bond of water (0.957 A) along the 3 axis: one step = a bond length gives 702 cents; one step = the ice nearest-neighbor contact (2.76 A) gives about 659 cents; one step = a unit-cell edge is the box-edge option. Bond anchor: the molecule is built from pure ratios. Contact anchor: neighbors sit at pure ratios.
- The primes have no natural real-world meaning. Possible conventions: "close means consonant" (the strongest or shortest contact direction gets 3, the next 5, the weakest 7), or symmetry-equivalent edges get similar roles. Both are aesthetic, not physics.
- Possible extra readout (idea, not chosen), readout D: a crystal's diffraction peaks occur at whole-number multiples of 1/a, the same integer structure as the harmonic series. Hearing the diffraction pattern as overtones would be a physics-first alternative; a liquid has no sharp peaks, so it would be a smeared spectrum.

## 7g. Readout D in detail (diffraction as a spectrum): idea, not chosen

- A crystal repeating every a along an edge decomposes into waves at whole-number multiples of 1/a (the harmonic series, in space). Diffraction measures these as one peak per integer combination (h, k, l); loudness comes from the atoms in the cell (structure factor); symmetry silences some peaks (systematic absences).
- **D1, peaks as lattice nodes:** (h, k, l) are the exponents on the prime axes, so every peak lands exactly on a node (always exact just intonation, no snap needed), with physical loudness.
- **D2, peaks as a spectrum:** peaks at their physical spacing (ratio of 1/d). Salt (a = 5.64 A, first five peaks (111), (200), (220), (311), (222)): ratios 1, 1.155, 1.633, 1.915, 2, about 0, 249, 849, 1125, 1200 cents. Inharmonic, bell-like.
- **Temperature:** thermal wobble weakens the high peaks first (the Debye-Waller effect), so the brightest overtones fade first as the slider rises. A liquid has no sharp peaks, only one broad bump.
- The 8-to-1 oxygen to hydrogen weight matches X-ray scattering, which goes by electron count (it is why X-rays see hydrogen faintly).
- **Crystal size:** a crystal of N cells has peaks about 1/N wide, so crystal size could control peak sharpness (Scherrer broadening). Possible extra control.
- Cost: the peak loudness is a direct sum over the atoms, cheap in the browser for a few hundred atoms.
- For a cubic crystal the peak ratios depend only on the lattice type (not the atoms, the box size or the temperature); atoms set the loudness and may silence peaks; temperature changes loudness only; box size scales the whole set (the overall pitch is a free choice). First six peaks, in cents above the first:

| Crystal | Structure | Peaks |
|---|---|---|
| Table salt, KCl, copper, gold, aluminum | Face-centered cubic | 0, 249, 849, 1125, 1200, 1449 |
| Iron, tungsten, chromium | Body-centered cubic | 0, 600, 951, 1200, 1393, 1551 |
| Cesium chloride | Simple cubic | 0, 600, 951, 1200, 1393, 1551 |
| Diamond, silicon | Diamond cubic | 0, 849, 1125, 1449, 1598, 1800 |
| Ice (the common form) | Hexagonal | 0, 105, 217, 656, 953, ... |

  Body-centered and simple cubic differ from the seventh peak (about 1684 against 1800 cents). Diamond has the face-centered box but two peaks are silenced by symmetry. KCl has the same peak positions as NaCl, but its odd-numbered peaks nearly vanish because K+ and Cl- have almost equal electron counts. Ice is not cubic, so its ratios depend on the box shape; its first three peaks cluster tightly.
- No crystal is infinite (largest on Earth: gypsum beams in the Naica caves, 11 to 12 m; white dwarf cores and neutron star crusts are predicted to crystallize). The infinite model works because even 1 cm holds millions of cells across.

## 7h. Words: the levels of structure (reference)

| Level | Size | What it is | Example |
|---|---|---|---|
| Atom | about 1 A | One nucleus with its electrons; its kind is the element | oxygen atom |
| Ion | about 1 to 2 A | An atom that gained or lost electrons | Na+, Cl- |
| Molecule | 1 to 10 A (proteins hundreds) | Atoms bonded together as a separate group; the atoms may be one element (O2, C60) or several (H2O) | H2O, aspirin |
| Crystal | nanometers to meters | Pieces repeating in a regular pattern; the pieces are molecules (ice), ions (salt), network-bonded atoms (diamond) or metal atoms (copper) | ice, salt, diamond |
| Mineral | cm to m | A natural crystal with fixed composition; mostly not molecular (halite ionic, quartz a network, copper an element; diamond and ice are minerals); aspirin is a crystal but not a mineral | halite, quartz |
| Rock | larger | A mixture of minerals | granite |

- NaCl: two elements, in the crystal as Na+ and Cl- ions; each Na+ has 6 Cl- neighbors at 2.82 A and vice versa (a 3D checkerboard), no Na is paired with one Cl, so there is no NaCl molecule; the formula only gives the 1 to 1 ratio. One cell holds 4 Na+ and 4 Cl-.
- For the lab everything on this ladder is a list of atoms in positions, so the importer does not need to know which kind of crystal it has, only the atoms and, for a crystal, the box.

## 7i. Bonds (reference)

All bonds are electrical attractions; the types differ in what the electrons do. NaCl is not a molecule because the attraction is not directed at one partner (each Na+ pulls equally on its 6 Cl-). The categories blur into each other.

| Bond | What happens | Directional? | Rough strength (kJ/mol) | Example |
|---|---|---|---|---|
| Covalent | Atoms share electrons | Yes (fixes angles) | hundreds | inside water, diamond |
| Ionic | Electron moves across, opposite charges attract | No | hundreds | salt |
| Metallic | Electrons shared by all atoms | No | medium to strong | copper, iron |
| Hydrogen bond | H on one molecule drawn to a neighbor's O | Yes, roughly linear | about 10 to 40 | between waters in ice |
| Dipole and dispersion | Attraction between uneven electron clouds | Little | about 1 to 10 | between aspirin molecules |

- Melting points follow bond strength: ice 0 C, aspirin about 135 C, salt 801 C, copper about 1085 C, diamond not below about 3,500 C.
- This explains the temperature stages: heating breaks the weak bonds between molecules first (liquid, then gas, still intact molecules); only much more heat breaks the strong bonds inside a molecule (the plasma idea).
- Bond type sets spacing (covalent about 1 A, hydrogen bond and ionic contact about 2.8 A): the spacing table in 7e is a table of bond types.

## 8. The liquid-to-frozen morph

- Stylized version: start from the ice crystal and add a random wobble that grows as a temperature slider rises. Sounds right, not physically exact.
- Physical version: real liquid frames from a molecular dynamics simulation, produced offline and imported.
- **Stylized wobble, driven by a temperature control. DECIDED.** Imported simulation frames are not taken.
- Idea (user): the same control could continue past liquid into gas, and maybe plasma. **OPEN** (how each state behaves is still to be discussed, see the question list).
- **Still versus animated (LEANING, still first):** still means atoms sit at one wobbled snapshot per temperature (a steady chord); animated means atoms keep jiggling, so each pitch moves constantly (a shimmer). Example, ice atoms vibrating about 0.1 A: about +-190 cents at 1 A per step, about +-42 cents at the 4.52 A box-edge scale, so the scale sets the vibrato depth. Still should use a fixed random seed (each atom keeps the same random offset and the slider only scales it), so a temperature always sounds the same and the slider glides smoothly. Animation is the same capability as the moving-point glide, so it comes with it.
- Other possible controls (later, none decided): **pressure** (squeezes or expands the structure; for ice, a 10% squeeze of the 2.76 A contact at a fixed 2.76 A per step moves a 702 cent interval to about 512; it is inaudible with the box-edge scale, so it needs a fixed scale), **order** (crystalline versus glassy, independent of temperature; heat alone cannot make a glass), **crystal size** (peak sharpness in readout D). One temperature slider is a path at fixed pressure.

## 9. Open questions

1. A moving point: **DECIDED as the end goal: continuous glide.** Reason (user): scales can then be heard as gradations along the lattice. Today the lab's pitches are fixed values, so glide is new to the pitch model. Plan (LEANING): the thin slice uses the snap knob from section 2 (fully snapped = steps, unsnapped = glide), so glide is the same mechanism with snap at zero. Still to check in the code: how much of the lab's pitch model assumes fixed notes.
2. Does the freeze use one mapping, or morph between the two in section 7?
3. ~~Stylized wobble or imported simulation frames~~ **DECIDED**: stylized wobble with a temperature control (section 8). Still open: gas and plasma behavior, and whether melting is gradual or sudden.
4. Temperature slider: **LEANING (user: one control is enough for now)**: one main slider driving, in lockstep, the wobble size, which bonds break (weakest first, see 7i) and, for readout D, the high peaks fading first; an advanced panel could unlock each separately. Other controls are for later (section 8). Still open: the default prime limit, and whether the per-axis scale knob exists. (Axes: octave left out and data-chooses-with-override are decided, see 7c.)
5. **DECIDED (user): the existing lattice visualizer is only a reference.** The chemistry side (xyz structures, atoms, temperature) needs its own view, or at least its own mode. Still open: what that view contains, and which existing readouts (roughness, field tables) it feeds.
6. Which dimensions: only 3D, or n-D with more than three primes?

## 10. Next steps

- Keep discussing before drafting an arc (user's choice).
- When ready, per `shell/CLAUDE.md`: write the concrete scenarios as a table and get them confirmed (options must show an example where they differ), build a thin slice first (one point cloud, three prime axes, a freeze slider with the roughness readout moving), then draft `arcs/<name>/ARC.md` for approval.
