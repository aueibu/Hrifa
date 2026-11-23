// jsdom smoke for live-series.html: the confirmed scenario numbers + every control, with a silent fake Web Audio (no sound).
// Usage (Node 24, from shell/): node arcs/live-series/smoke-series.cjs <page.html> [jsdom dir]
// The jsdom dir is only needed where shell/node_modules is missing (e.g. a worktree: pass the main checkout's
// shell/node_modules/jsdom). Exit 0 = all checks passed and no script errors.
const fs = require('fs');
const JSDOM_PATH = process.argv[3] || 'jsdom';
const { JSDOM } = require(JSDOM_PATH);
const html = fs.readFileSync(process.argv[2], 'utf8');
const errors = [];
// a silent fake Web Audio: records oscillators so the toggles can be checked without sound
const OSCS = [], GAINS = [], CONVS = [];
function fakeAudio(win) {
  const param = (v) => ({ value: v, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime(x) { this.target = x; this.calls = (this.calls || 0) + 1; }, cancelScheduledValues() {} });
  const node = () => ({ connect() {}, disconnect() {} });
  win.AudioContext = class { constructor() { this.currentTime = 0; this.state = 'running'; this.destination = node(); this.sampleRate = 48000; }
    createDynamicsCompressor() { return { ...node(), threshold: param(0), knee: param(0), ratio: param(1), attack: param(0), release: param(0) }; }
    createConvolver() { const c = { ...node(), normalize: false, buffer: null }; CONVS.push(c); return c; }
    createBuffer(ch, len, rate) { const data = Array.from({ length: ch }, () => new Float32Array(len)); return { numberOfChannels: ch, length: len, sampleRate: rate, copyToChannel(src, i) { data[i].set(src); }, getChannelData(i) { return data[i]; } }; }
    resume() {} createGain() { const g = { ...node(), gain: param(1) }; GAINS.push(g); return g; } createBiquadFilter() { return { ...node(), type: '', frequency: param(350) }; }
    createOscillator() { const o = { ...node(), type: 'sine', frequency: param(440), stopped: false, start() {}, stop() { o.stopped = true; } }; OSCS.push(o); return o; } };
}
const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, beforeParse: fakeAudio,
  virtualConsole: new (require(JSDOM_PATH).VirtualConsole)().on('jsdomError', (e) => errors.push(e.message)) });
const w = dom.window, d = w.document, $ = (id) => d.getElementById(id);
let fails = 0;
const check = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) fails++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}: ${JSON.stringify(got)}${ok ? '' : ` (want ${JSON.stringify(want)})`}`); };
const trail = () => [...$('trail').querySelectorAll('.item .sub')].map((e) => e.textContent.split(' · ')[0].replace(' (exact)', ''));
const ladder = () => [...$('ladder').querySelectorAll('.item .main')].map((e) => e.textContent);
const sel = () => $('ladder').querySelector('.item.sel .main')?.textContent;
const pick = (i) => { $('example').value = String(i); $('example').dispatchEvent(new w.Event('change')); };

// Example 0: the JI scenario path
pick(0);
check('JI trail series', trail(), ['4 : 5 : 6', '4 : 5 : 6 : 7', '5 : 6 : 7', '4 : 5 : 6 : 7', '4 : 5 : 6', '8 : 9 : 10 : 12', '4 : 5 : 6', '20 : 24 : 25 : 30']);
check('JI final chosen', sel(), '20 : 24 : 25 : 30');
check('JI final Hz', $('facts').textContent.match(/([\d.]+) Hz/)[1], '13.08');
check('below hearing tag', /below hearing/.test($('facts').textContent), true);
check('trail moves', [...$('trail').querySelectorAll('.item .sub')].map((e) => (e.textContent.split(' · ')[1] || '')), ['', 'fundamental stays', 'fundamental stays', 'fundamental stays', 'fundamental stays', 'fundamental drops 1 octave', 'fundamental rises 1 octave', 'fundamental drops 2 octaves + 386¢']);
check('1/1 readout', /harmonic 20 of this series/.test($('facts').textContent), true);

// Example 1: 12-EDO C E G, B♭, D
pick(1);
check('C E G first rung', trail()[0], '4 : 5 : 6');
// M1 (human 2026-11-23): the error is shared, so C E G B♭ fits 4:5:6:7 (±16.6¢, F 65.96 Hz), not 20:25:30:36
check('C E G B♭ chosen (error shared)', trail()[1], '4 : 5 : 6 : 7');
$('trail').children[1].click();
check('C E G B♭ worst error', $('ladder').querySelector('.item.sel .side').textContent, 'worst 16.6¢');
check('C E G B♭ fundamental', $('facts').textContent.match(/([\d.]+) Hz/)[1], '65.96');
$('trail').children[2].click();
// cap 15 changes the chosen series for C E G B♭ D: 23:29:34:41:51 (errors −11.2 −12.3 +12.3 −11.6 +10.3¢, checked by hand)
$('cap').value = '15'; $('cap').dispatchEvent(new w.Event('change'));
check('C E G B♭ D at 15¢', sel(), '23 : 29 : 34 : 41 : 51');
check('ladder ascends in complexity', ladder().map((s) => +s.split(' : ')[0]).every((v, i, a) => !i || v > a[i - 1]), true);
// click a later rung
const rungs = $('ladder').querySelectorAll('.item');
rungs[rungs.length - 1].click();
check('picked rung is selected', sel(), ladder()[ladder().length - 1]);
check('pick on trail', /^\d+\. chose /.test($('trail').lastElementChild.querySelector('.main').textContent), true);
$('cap').value = '20'; $('cap').dispatchEvent(new w.Event('change'));

// Example 2: required-interval default
pick(2);
check('required default at 20¢', sel(), '10 : 12 : 16 : 21 : 30');

// Example 0 again: chip toggles, remove, harmonic click, undo, clear
pick(0);
const n0 = $('trail').children.length;
$('chips').querySelector('[data-tog="0"]').click();       // 1/1 back on
check('toggle adds a trail step', $('trail').children.length, n0 + 1);
check('after 1/1 off', sel(), '24 : 25 : 30');
check('ladder stops by harmonic 256', ladder().every((s) => +s.split(' : ')[0] <= 256), true);
$('chips').querySelector('[data-rm="0"]').click();        // remove 1/1
check('remove adds a step', $('trail').children.length, n0 + 2);
// click harmonic 32 (free) on the drawing: exact series, so the new note is exact
const g = [...$('draw').querySelectorAll('g.h')].find((x) => x.dataset.n === '32');
g.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
check('harmonic 32 added as ratio', [...$('chips').querySelectorAll('.tog')].map((b) => b.textContent).includes('8/5'), true);
check('fundamental stays after adding a harmonic', /fundamental stays/.test($('trail').lastElementChild.textContent), true);
$('undo').click();
check('step back removes last step', $('trail').children.length, n0 + 2);
$('trail').children[0].click();
check('restore step 1', sel(), '4 : 5 : 6');
$('clearTrail').click();
check('clear keeps one step', $('trail').children.length, 1);

// typed input: mixed formats and an error
$('add').value = '7\\19 700c 9/8'; $('addBtn').click();
check('mixed add ok', $('addErr').textContent, '');
$('add').value = 'abc'; $('addBtn').click();
check('bad token message', /not a ratio/.test($('addErr').textContent), true);

pick(3);
check('empty example', $('ladderNote').textContent, 'Add a note to begin.');

// audio toggles (fake audio, no sound): drone mark, held notes, arpeggio
pick(0);                                                    // ends on 20:24:25:30, F = 13.08 Hz
check('no drone mark while off', $('draw').querySelectorAll('.drone-mark').length, 0);
$('droneBtn').click();
check('drone button on', [$('droneBtn').textContent, $('droneBtn').getAttribute('aria-pressed')], ['Drone: on', 'true']);
check('drone mark + octave', $('draw').querySelectorAll('.drone-mark').length, 2);
check('drone range defaults to 55–110 Hz', $('droneRange').value, '55');
check('drone label (55 range)', $('draw').querySelector('.drone-label').textContent.startsWith('drone 104.7 Hz = harmonic 8'), true);
$('droneRange').value = '110'; $('droneRange').dispatchEvent(new w.Event('change'));
check('drone label (110 range)', $('draw').querySelector('.drone-label').textContent.startsWith('drone 209.3 Hz = harmonic 16'), true);
// M1 (human 2026-11-23): a low range, the octave 27.5–55 Hz; F 13.08 Hz -> 52.3 Hz = harmonic 4
check('range options', [...$('droneRange').options].map((o) => o.value), ['27.5', '55', '110', '220']);
$('droneRange').value = '27.5'; $('droneRange').dispatchEvent(new w.Event('change'));
check('drone label (27.5 range)', $('draw').querySelector('.drone-label').textContent.startsWith('drone 52.33 Hz = harmonic 4'), true);
$('droneRange').value = '55'; $('droneRange').dispatchEvent(new w.Event('change'));
$('chips').querySelector('[data-tog="1"]').click();        // 5/4 off -> 6/5 3/2 left... plus 1/1
check('drone follows the series', $('draw').querySelector('.drone-label').textContent.includes('harmonic'), true);
// voice switches: the drone's three layers are the last three gains created (saw, sine, octave)
$('droneBtn').click(); $('droneBtn').click();               // restart so the layers are the newest gains
const [gSaw, gSine, gOct] = GAINS.slice(-3);
const lvl = (g) => (g.gain.target !== undefined ? g.gain.target : g.gain.value);
check('default voice: saw + sine + octave', [lvl(gSaw), lvl(gSine), lvl(gOct)], [0.35, 0.8, 0.35]);
$('droneOct').click();
check('octave off: button', [$('droneOct').textContent, $('droneOct').getAttribute('aria-pressed')], ['Drone octave: off', 'false']);
check('octave off: layer silent', lvl(gOct), 0);
check('octave off: one dashed line', $('draw').querySelectorAll('.drone-mark').length, 1);
check('octave off: label', $('draw').querySelector('.drone-label').textContent.includes('octave'), false);
$('droneSine').click();
check('bare sine: button', $('droneSine').textContent, 'Drone bare sine: on');
check('bare sine: only the sine sounds', [lvl(gSaw), lvl(gSine), lvl(gOct)], [0, 1, 0]);
check('bare sine: label', $('draw').querySelector('.drone-label').textContent.includes('bare sine'), true);
check('bare sine: facts text', /as a bare sine, one pitch only/.test($('pulseNote').textContent), true);
$('droneOct').click();
check('bare sine + octave', [lvl(gSaw), lvl(gSine), lvl(gOct), $('draw').querySelectorAll('.drone-mark').length], [0, 1, 0.35, 2]);
$('droneSine').click();
check('back to default', [lvl(gSaw), lvl(gSine), lvl(gOct)], [0.35, 0.8, 0.35]);
$('droneBtn').click();
check('drone mark gone when off', $('draw').querySelectorAll('.drone-mark').length, 0);
// fundamental above the drone range: 1/1 = 880 Hz, C E G -> 4:5:6 with the error shared: F = 220 Hz raised 5.87¢
// (half of E +13.7¢ and G −2.0¢) = 220.75 Hz; range 55 -> drone 55.19 Hz = harmonic 1/4
pick(1); $('base').value = '880'; $('base').dispatchEvent(new w.Event('change'));
$('trail').children[0].click();
$('droneBtn').click();
check('drone below the fundamental', $('draw').querySelector('.drone-label').textContent.startsWith('drone 55.19 Hz = harmonic 1/4'), true);
$('droneBtn').click(); $('base').value = '261.63'; $('base').dispatchEvent(new w.Event('change'));

pick(0);
const before = OSCS.length;
$('playChord').click();
check('notes toggle on', [$('playChord').textContent, $('playChord').getAttribute('aria-pressed')], ['Notes: on', 'true']);
check('one held tone per active note', OSCS.slice(before).filter((o) => !o.stopped).length, 4);
$('chips').querySelector('[data-tog="0"]').click();        // 1/1 off
check('held notes follow a switch-off', OSCS.slice(before).filter((o) => !o.stopped).length, 3);
$('add').value = '7/4'; $('addBtn').click();
check('held notes follow an add', OSCS.slice(before).filter((o) => !o.stopped).length, 4);
$('playChord').click();
check('notes toggle off stops all', [$('playChord').textContent, OSCS.slice(before).filter((o) => !o.stopped).length], ['Notes: off', 0]);
$('playUp').click();
check('arpeggio toggle on', [$('playUp').textContent, $('playUp').getAttribute('aria-pressed')], ['Arpeggio: on', 'true']);
// notes' wave: triangle by default, bare sine switches held notes at once and new notes too
$('playUp').click();                                       // arpeggio off
const b2 = OSCS.length;
$('playChord').click();
const heldNow = () => OSCS.slice(b2).filter((o) => !o.stopped);
check('held notes are triangle', [...new Set(heldNow().map((o) => o.type))], ['triangle']);
$('noteSine').click();
check('notes bare sine: button', [$('noteSine').textContent, $('noteSine').getAttribute('aria-pressed')], ['Notes bare sine: on', 'true']);
check('held notes switch to sine', [...new Set(heldNow().map((o) => o.type))], ['sine']);
$('add').value = '11/8'; $('addBtn').click();
check('a note added while sine is on is sine', heldNow()[heldNow().length - 1].type, 'sine');
$('noteSine').click();
check('back to triangle', [...new Set(heldNow().map((o) => o.type))], ['triangle']);
$('playChord').click();

// M1 (human 2026-11-23): notes tuned to the series by default, a toggle for the typed pitches.
// C E G B♭ at 4:5:6:7 with the error shared: the fundamental moves up 14.6¢ (half of B♭ +31.2¢ and G −2.0¢),
// so tuned C sits 14.6¢ above 12-EDO; typed pitches are C 261.63 Hz and B♭ 466.17 Hz
pick(1); $('trail').children[1].click();
check('notes tuned: default on', [$('noteTuned').textContent, $('noteTuned').getAttribute('aria-pressed')], ['Notes tuned to the series: on', 'true']);
const b3 = OSCS.length;
$('playChord').click();
const fq = (o) => (o.frequency.target !== undefined ? o.frequency.target : o.frequency.value);
const heldF = () => OSCS.slice(b3).filter((o) => !o.stopped).map(fq).sort((a, b) => a - b);
check('tuned: notes are 4:5:6:7', heldF().map((f) => +((f / heldF()[0]) * 4).toFixed(4)), [4, 5, 6, 7]);
check('tuned: C 14.6¢ above 12-EDO', +(1200 * Math.log2(heldF()[0] / 261.63)).toFixed(1), 14.6);
$('noteTuned').click();
check('typed pitches: button', [$('noteTuned').textContent, $('noteTuned').getAttribute('aria-pressed')], ['Notes tuned to the series: off', 'false']);
check('typed pitches: C and B♭ as typed', [heldF()[0].toFixed(2), heldF()[3].toFixed(2)], ['261.63', '466.17']);
check('typed pitches: same four oscillators retuned', OSCS.slice(b3).filter((o) => !o.stopped).length, 4);
$('noteTuned').click();
$('playChord').click();
// M1 (human 2026-11-23): the tuning readout. C E G B♭ at 4:5:6:7 (F 65.96 Hz): differences +14.6 +0.9 +16.6 −16.6¢;
// C typed 261.63, tuned 4 x 65.96 = 263.84 Hz, beats about 2.2 per second
const tuneRows = () => [...$('tune').querySelectorAll('tbody tr')].map((tr) => [...tr.children].map((td) => td.textContent.trim()));
check('readout: one row per note', tuneRows().length, 4);
check('readout: differences', tuneRows().map((r) => r[3]), ['+14.6¢', '+0.9¢', '+16.6¢', '−16.6¢']);
check('readout: C typed, tuned, beats', [tuneRows()[0][1], tuneRows()[0][2], tuneRows()[0][5]], ['261.6 Hz', '263.8 Hz (4)', 'about 2.2 per second']);
check('readout: tempered notes have no comma', tuneRows().map((r) => r[4]), ['lowest note', '—', '—', '—']);
check('readout: tuned column sounding', [$('tune').querySelector('tbody td.snd').cellIndex, /sounding: tuned/.test($('tune').textContent)], [2, true]);
$('noteTuned').click();
check('readout: typed column sounding after the toggle', [$('tune').querySelector('tbody td.snd').cellIndex, /sounding: typed/.test($('tune').textContent)], [1, true]);
$('noteTuned').click();
// listen pairs (human 2026-11-23, mode A): G at 4:5:6:7 plays typed 392.00 Hz and its harmonic 6 x 65.9615 = 395.77 Hz as
// two sines, beating 3.8 per second as its row says; two rows on = two pairs; Stop sound ends them
check('readout: beats header', $('tune').querySelectorAll('th')[5].textContent, 'beats vs harmonic');
const b4 = OSCS.length;
const lb = () => [...$('tune').querySelectorAll('[data-listen]')];
const pairF = () => OSCS.slice(b4).filter((o) => !o.stopped).map(fq).sort((a, b) => a - b);
lb()[2].click();
check('listen: G typed + harmonic as two sines', [pairF().map((f) => f.toFixed(2)), [...new Set(OSCS.slice(b4).map((o) => o.type))], lb()[2].getAttribute('aria-pressed')], [['392.00', '395.77'], ['sine'], 'true']);
check('listen: the beat is the row\'s number', (pairF()[1] - pairF()[0]).toFixed(1), tuneRows()[2][5].match(/[\d.]+/)[0]);
lb()[3].click();
check('listen: two rows on = two pairs', [pairF().length, lb()[3].getAttribute('aria-pressed')], [4, 'true']);
$('cap').value = '30'; $('cap').dispatchEvent(new w.Event('change'));
check('listen: pairs survive a redraw', [pairF().length, lb()[2].getAttribute('aria-pressed')], [4, 'true']);
$('cap').value = '20'; $('cap').dispatchEvent(new w.Event('change'));
lb()[2].click();
check('listen: a row off ends its pair', pairF().length, 2);
$('stopAll').click();
check('listen: Stop sound ends all pairs', [pairF().length, lb().every((b) => b.getAttribute('aria-pressed') === 'false')], [0, true]);
pick(0);
// no jumping (human 2026-11-23): the exact rung keeps the same table, with 0.0¢ and no beats
check('readout: exact rung keeps the table', [tuneRows().length, tuneRows().map((r) => r[3]), tuneRows().map((r) => r[4]), tuneRows().map((r) => r[5])], [4, ['0.0¢', '0.0¢', '0.0¢', '0.0¢'], ['lowest note', 'none', 'none', 'none'], ['none', 'none', 'none', 'none']]);
// commas (human 2026-11-23): 1/1 6/5 5/4 3/2 on the simpler rung 15:18:19:23 -> 6/5 none, 5/4 76/75, 3/2 46/45 (no names)
const clickRung = (s) => [...$('ladder').querySelectorAll('.item')].find((b) => b.querySelector('.main').textContent === s).click();
clickRung('15 : 18 : 19 : 23');
check('readout: commas on a simpler rung', tuneRows().map((r) => r[4]), ['lowest note', 'none', '76/75', '46/45']);
check('readout: unnamed commas have no hint', $('tune').querySelectorAll('.hint').length, 0);
// named commas (human: a small triangle, the name on hover): 1/1 16/9 read as 4:7 moves 16/9 down by 64/63
// (septimal comma), read as 5:9 up by 81/80 (syntonic comma)
pick(3); $('add').value = '1/1 16/9'; $('addBtn').click();
const hintTitle = () => { const h = $('tune').querySelectorAll('tbody tr')[1].children[4].querySelector('.hint'); return h ? h.getAttribute('title') : null; };
clickRung('4 : 7');
check('readout: septimal comma: ratio only, triangle hint', [tuneRows()[1][4], hintTitle().startsWith("63/64, −27.3¢: septimal comma (Archytas' comma)")], ['63/64', true]);
clickRung('5 : 9');
check('readout: syntonic comma: ratio only, triangle hint', [tuneRows()[1][4], hintTitle().startsWith('81/80, +21.5¢: syntonic comma (comma of Didymus)')], ['81/80', true]);
// no jumping: the Series list is always 7 rows tall, empty or not; the table keeps its 6-row body when empty
check('no jumping: Series list height fixed with 2 rungs', $('ladder').style.height, '418px');
pick(3);
check('no jumping: Series list height fixed when empty', $('ladder').style.height, '418px');
check('no jumping: table drawn when empty', [!!$('tune').querySelector('.tune-wrap table'), tuneRows().length], [true, 0]);
check('no jumping: facts keep their seven rows when empty', $('facts').children.length, 14);
pick(0);
const foot = () => $('tune').querySelector('p').textContent;
const foot0 = foot();
$('droneSine').click();
check('readout: footnote text does not change with bare sine', foot(), foot0);
$('droneSine').click();
check('readout: fixed column widths', [...$('tune').querySelectorAll('col')].map((c) => c.style.width), ['9em', '6.5em', '8.5em', '8.5em', '8em', '11em', '5.5em']);

// reverb (the lab's presets, no custom loading)
// M1 (human 2026-11-23): the reverb starts on Hall at 30%
check('reverb starts Hall 30%', [$('reverb').value, $('mix').disabled, $('mixRead').textContent], ['hall', false, '30%']);
check('no custom option', [...$('reverb').options].map((o) => o.value), ['dry', 'room', 'hall']);
const conv = CONVS[0];
check('first sound installs Hall: normalized 2.8 s stereo impulse', [CONVS.length >= 1, conv.normalize, conv.buffer.numberOfChannels, conv.buffer.length], [true, true, 2, 134400]);
const ir = conv.buffer.getChannelData(0);
check('impulse decays (start louder than end)', Math.abs(ir[2000]) + Math.abs(ir[3000]) > Math.abs(ir[130000]) + Math.abs(ir[130100]), true);
$('reverb').value = 'room'; $('reverb').dispatchEvent(new w.Event('change'));
check('Room keeps the mix', [$('mix').disabled, $('mixRead').textContent], [false, '30%']);
$('mix').value = '55'; $('mix').dispatchEvent(new w.Event('input'));
check('mix moves', $('mixRead').textContent, '55%');
$('reverb').value = 'dry'; $('reverb').dispatchEvent(new w.Event('change'));
check('back to Dry keeps the mix, disables it', [$('mix').disabled, $('mixRead').textContent], [true, '55%']);

// drone styles: A = example 0 (F 13.08 Hz); switching 6/5 off gives 1/1 5/4 3/2 (F 65.4 Hz)
pick(0);
const setStyle = (v) => { $('droneStyle').value = v; $('droneStyle').dispatchEvent(new w.Event('change')); };
setStyle('auto');
const gi = GAINS.length;
$('droneBtn').click();
const group = GAINS[gi];
const factDrone = () => { const m = $("facts").textContent.match(/Drone(.*?)Note pulses/s); if (!m) console.log("FACTS:", JSON.stringify($("facts").textContent)); return m ? m[1].trim() : null; };
check('A below hearing, auto: pulses 1.64/s', factDrone(), 'pulses 1.64 per second (the fundamental slowed 3 octaves) (pulses below hearing)');
check('A auto: strike scheduled then decays', [group.gain.target, group.gain.calls >= 2], [0, true]);
check('A auto: label says pulsing', $('draw').querySelector('.drone-label').textContent.includes('pulsing 1.64/s'), true);
$('chips').querySelector('[data-tog="5"]').click();        // 6/5 off -> 4:5:6, F 65.4 Hz
check('B audible, auto: holds', factDrone(), 'holds (pulses below hearing)');
check('B auto: level back to steady', group.gain.target, 0.16);
check('B auto: label has no pulsing', $('draw').querySelector('.drone-label').textContent.includes('pulsing'), false);
setStyle('pulsed');
check('B pulsed: 1.02/s, 6 octaves down', factDrone(), 'pulses 1.02 per second (the fundamental slowed 6 octaves)');
check('B pulsed: decays between strikes', group.gain.target, 0);
setStyle('steady');
check('steady: holds', [factDrone(), group.gain.target], ['holds', 0.16]);
check('note pulses renamed', $('pulseBtn').textContent, 'Note pulses: off');
// M1 (human 2026-11-23): Note pulses at most 4 per second by default, a toggle for 8. Here 4:5:6 at F 65.41 Hz:
// the busiest note (6) is 392 per second; 4/s slows 7 octaves (cycle 1.96 s), 8/s slows 6 (cycle 0.98 s)
check('pulse rate default 4/s', [$('pulseRate').textContent, $('pulseRate').getAttribute('aria-pressed'), /slowed 7 octaves: one cycle every 1\.96 s/.test($('facts').textContent)], ['Note pulses: at most 4 per second', 'false', true]);
$('pulseRate').click();
check('pulse rate toggles to 8/s', [$('pulseRate').textContent, $('pulseRate').getAttribute('aria-pressed'), /slowed 6 octaves: one cycle every 0\.98 s/.test($('facts').textContent)], ['Note pulses: at most 8 per second', 'true', true]);
$('pulseBtn').click();
check('note pulses run at 8/s', $('pulseBtn').textContent, 'Note pulses: on');
$('pulseRate').click();
check('pulse rate back to 4/s', /one cycle every 1\.96 s/.test($('facts').textContent), true);

$('stopAll').click();
check('stop sound turns every toggle off', [$('playChord').textContent, $('playUp').textContent, $('droneBtn').textContent, $('pulseBtn').textContent], ['Notes: off', 'Arpeggio: off', 'Drone: off', 'Note pulses: off']);
console.log(errors.length ? `script errors: ${errors.join(' | ')}` : 'no script errors');
console.log(fails ? `${fails} FAILED` : 'all checks passed');
process.exit(fails || errors.length ? 1 : 0);
