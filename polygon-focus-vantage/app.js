(() =>
{
  const canvas = document.getElementById('canvas'),
    ctx = canvas.getContext('2d'),
    dpr = Math.max(1, devicePixelRatio || 1);
  const ids =
    'setFocus addVantage randomize undo clear count countOut transfer transferOut outlook outlookOut centroidMode constructionMode height heightOut depth depthOut rotation rotOut tilt tiltOut showMidpoints showExo showB1 showB2 showTriplets showF1Outlooks showF2Vantages showBraces showSkin showLabels constructionBtn wireframeBtn status diagnostics polygonStats areaRatios perimeterRatios'
    .split(' ');
  const ui = Object.fromEntries(ids.map(id => [id, document.getElementById(id)]));
  const colors = {
    focus: '#f2b84b',
    vantage: '#74b9ff',
    mid: '#6f7d91',
    exo: '#ff8f70',
    outlook: '#9be28f',
    f2: '#d993ff',
    triplet: 'rgba(255,196,112,.2)',
    tripletLine: 'rgba(255,196,112,.78)',
    faint: 'rgba(125,137,152,.28)',
    text: '#e8eaf0'
  };
  let W = 0,
    H = 0,
    mode = 'construction',
    action = 'addVantage',
    focus = null,
    vantages = [],
    drag = null,
    lastPointer = null;
  const MIN_CONSTRUCTION_POINTS = 3;
  const add = (a, b) => (
    {
      x: a.x + b.x,
      y: a.y + b.y
    }),
    sub = (a, b) => (
    {
      x: a.x - b.x,
      y: a.y - b.y
    }),
    mul = (a, s) => (
    {
      x: a.x * s,
      y: a.y * s
    }),
    len = a => Math.hypot(a.x, a.y),
    midpoint = (a, b) => mul(add(a, b), .5);
  const vertexCentroid = p => p.length ? mul(p.reduce((s, q) => add(s, q),
  {
    x: 0,
    y: 0
  }), 1 / p.length) : null;

  function areaCentroid(p)
  {
    if (p.length < 3) return vertexCentroid(p);
    let A = 0,
      x = 0,
      y = 0;
    for (let i = 0; i < p.length; i++)
    {
      const a = p[i],
        b = p[(i + 1) % p.length],
        c = a.x * b.y - b.x * a.y;
      A += c;
      x += (a.x + b.x) * c;
      y += (a.y + b.y) * c
    }
    A *= .5;
    return Math.abs(A) < 1e-6 ? vertexCentroid(p) :
    {
      x: x / (6 * A),
      y: y / (6 * A)
    }
  }

  function polygonArea(p)
  {
    if (!p || p.length < 3) return 0;
    let s = 0;
    for (let i = 0; i < p.length; i++)
    {
      const a = p[i],
        b = p[(i + 1) % p.length];
      s += a.x * b.y - b.x * a.y
    }
    return Math.abs(s) * .5
  }

  function polygonPerimeter(p)
  {
    if (!p || p.length < 2) return 0;
    let s = 0;
    for (let i = 0; i < p.length; i++) s += len(sub(p[(i + 1) % p.length], p[i]));
    return s
  }
  const metric = v => !Number.isFinite(v) ? '—' : Math.abs(v) >= 10000 ? v.toFixed(0) : Math.abs(v) >= 1000 ? v
    .toFixed(1) : Math.abs(v) >= 100 ? v.toFixed(2) : v.toFixed(3);
  const ratio = (a, b) => !Number.isFinite(a) || !Number.isFinite(b) || Math.abs(b) < 1e-9 ? '—' : (a / b).toFixed(3);

  function geometry()
  {
    if (!focus || vantages.length < MIN_CONSTRUCTION_POINTS) return null;
    const mids = [],
      exo = [],
      outlook = [],
      t = +ui.outlook.value,
      k = +ui.transfer.value;
    for (let i = 0; i < vantages.length; i++)
    {
      const a = vantages[i],
        b = vantages[(i + 1) % vantages.length],
        m = midpoint(a, b),
        d = sub(m, focus),
        L = len(sub(b, a)) * k,
        u = len(d) > 1e-6 ? mul(d, 1 / len(d)) :
        {
          x: 1,
          y: 0
        },
        r = add(focus, mul(u, L));
      mids.push(m);
      exo.push(r);
      outlook.push(add(focus, mul(sub(r, focus), t)))
    }
    return {
      mids,
      exo,
      outlook,
      f2: ui.centroidMode.value === 'area' ? areaCentroid(outlook) : vertexCentroid(outlook)
    }
  }

  function stats(g)
  {
    const triplets = g?.exo.map((r, i) => [`V${i+1}O${i+1}R${i+1}`, [vantages[i], g.outlook[i], r]]) || [],
      ps = [
        ['B', vantages],
        ['B₂', g?.outlook || []],
        ['E', g?.exo || []], ...triplets
      ],
      m = {};
    ui.polygonStats.innerHTML = ps.map(([n, p]) =>
    {
      const per = polygonPerimeter(p),
        s = {
          area: polygonArea(p),
          perimeter: per
        };
      m[n] = s;
      return `<tr><td><strong>${n}</strong></td><td>${p.length>=3?metric(s.area):'—'}</td><td>${p.length>=3?metric(per):'—'}</td><td>${p.length>=3?metric(per/2):'—'}</td><td>${p.length>=3?metric(per/p.length):'—'}</td></tr>`
    }).join('');
    const pairs = [
      ['B₂', 'B'],
      ['E', 'B'],
      ['E', 'B₂'],
      ['B', 'B₂'],
      ['B', 'E'],
      ['B₂', 'E']
    ];
    ui.areaRatios.innerHTML = pairs.map(([a, b]) =>
      `<tr><td>${a} / ${b}</td><td>${ratio(m[a]?.area,m[b]?.area)}</td></tr>`).join('');
    ui.perimeterRatios.innerHTML = pairs.map(([a, b]) =>
      `<tr><td>${a} / ${b}</td><td>${ratio(m[a]?.perimeter,m[b]?.perimeter)}</td></tr>`).join('')
  }

  function clearCanvas()
  {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,.025)';
    for (let x = (W % 40) / 2; x < W; x += 40)
    {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke()
    }
    for (let y = (H % 40) / 2; y < H; y += 40)
    {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke()
    }
    ctx.restore()
  }

  function line(a, b, c, w = 1, d = [])
  {
    if (!a || !b) return;
    ctx.save();
    ctx.strokeStyle = c;
    ctx.lineWidth = w;
    ctx.setLineDash(d);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.restore()
  }

  function poly(p, c, w = 1, d = [])
  {
    if (p.length < 2) return;
    ctx.save();
    ctx.strokeStyle = c;
    ctx.lineWidth = w;
    ctx.setLineDash(d);
    ctx.beginPath();
    ctx.moveTo(p[0].x, p[0].y);
    p.slice(1).forEach(q => ctx.lineTo(q.x, q.y));
    ctx.closePath();
    ctx.stroke();
    ctx.restore()
  }

  // Vantages remain in insertion order. The closing edge is always implicit:
  // the final point connects back to the first point.
  function appendVantage(p)
  {
    vantages.push(p);
    draw()
  }

  function filledPoly(p, fill, stroke, w = 1, d = [])
  {
    if (p.length < 3) return;
    ctx.save();
    ctx.fillStyle = fill;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = w;
    ctx.setLineDash(d);
    ctx.beginPath();
    ctx.moveTo(p[0].x, p[0].y);
    p.slice(1).forEach(q => ctx.lineTo(q.x, q.y));
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore()
  }

  function point(p, c, r, l)
  {
    ctx.save();
    ctx.fillStyle = c;
    ctx.strokeStyle = '#0d1014';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    if (l && ui.showLabels.checked)
    {
      ctx.font = '12px system-ui';
      ctx.fillStyle = colors.text;
      ctx.fillText(l, p.x + 8, p.y - 8)
    }
    ctx.restore()
  }

  function rayEnd(f, m, r)
  {
    const d = sub(m, f),
      n = len(d);
    return n < 1e-9 ? r : add(f, mul(d, (Math.max(n, len(sub(r, f))) + 18) / n))
  }

  function construction(g)
  {
    if (!focus) return;
    if (vantages.length >= 2 && ui.showB1.checked) poly(vantages, colors.vantage, 1.6);
    if (g)
    {
      if (ui.showTriplets.checked) g.exo.forEach((r, i) => filledPoly([vantages[i], g.outlook[i], r], colors.triplet,
        colors.tripletLine, 1.2));
      if (ui.showMidpoints.checked) g.mids.forEach((m, i) =>
      {
        line(focus, rayEnd(focus, m, g.exo[i]), colors.faint, 1, [5, 5]);
        point(m, colors.mid, 3, 'M' + (i + 1));
        const d = sub(m, focus),
          n = len(d);
        if (n) line(add(m, mul(
        {
          x: -d.y / n,
          y: d.x / n
        }, -5)), add(m, mul(
        {
          x: -d.y / n,
          y: d.x / n
        }, 5)), colors.mid)
      });
      if (ui.showExo.checked) poly(g.exo, colors.exo, 1.5);
      if (ui.showB2.checked) poly(g.outlook, colors.outlook, 1.8);
      if (ui.showF1Outlooks.checked) g.outlook.forEach(o => line(focus, o, 'rgba(155,226,143,.65)', 1.2));
      if (ui.showF2Vantages.checked) vantages.forEach(v => line(g.f2, v, 'rgba(217,147,255,.65)', 1.2));
      if (ui.showBraces.checked)
      {
        g.outlook.forEach(o => line(focus, o, 'rgba(155,226,143,.35)'));
        g.outlook.forEach(o => line(g.f2, o, 'rgba(217,147,255,.34)'))
      }
      g.exo.forEach((r, i) =>
      {
        if (ui.showExo.checked) point(r, colors.exo, 4, 'R' + (i + 1));
        point(g.outlook[i], colors.outlook, 4, 'O' + (i + 1))
      });
      point(g.f2, colors.f2, 6, 'F₂')
    }
    vantages.forEach((v, i) => point(v, colors.vantage, 5, 'V' + (i + 1)));
    point(focus, colors.focus, 7, 'F')
  }

  function project(p)
  {
    const r = +ui.rotation.value * Math.PI / 180,
      t = +ui.tilt.value * Math.PI / 180,
      x = p.x,
      y = p.y,
      z = p.z,
      xr = x * Math.cos(r) - y * Math.sin(r),
      yr = x * Math.sin(r) + y * Math.cos(r),
      yp = yr * Math.cos(t) - z * Math.sin(t),
      zp = yr * Math.sin(t) + z * Math.cos(t),
      s = 1 / (1 + zp / 1200);
    return {
      x: W / 2 + xr * s,
      y: H / 2 + yp * s,
      depth: zp
    }
  }

  function wire(g)
  {
    if (!focus || !g) return;
    const c = vertexCentroid(vantages.concat([focus])),
      local = p => (
      {
        x: p.x - c.x,
        y: p.y - c.y
      }),
      h = +ui.height.value,
      d = +ui.depth.value,
      F = project(
      {
        ...local(focus),
        z: h
      }),
      V = vantages.map(p => project(
      {
        ...local(p),
        z: 0
      })),
      O = g.outlook.map(p => project(
      {
        ...local(p),
        z: -d
      })),
      R = g.exo.map(p => project(
      {
        ...local(p),
        z: -d * .5
      })),
      F2 = project(
      {
        ...local(g.f2),
        z: -h
      });
    if (ui.showTriplets.checked)
      for (let i = 0; i < V.length; i++) filledPoly([V[i], O[i], R[i]], colors.triplet, colors.tripletLine, 1.1);
    if (ui.showF1Outlooks.checked) O.forEach(o => line(F, o, 'rgba(155,226,143,.65)', 1.2));
    if (ui.showF2Vantages.checked) V.forEach(v => line(F2, v, 'rgba(217,147,255,.65)', 1.2));
    if (ui.showB1.checked) poly(V, colors.vantage, 1.4);
    if (ui.showB2.checked) poly(O, colors.outlook, 1.6);
    if (ui.showExo.checked) poly(R, colors.exo, 1.2, [5, 4]);
    if (ui.showSkin.checked)
      for (let i = 0; i < V.length; i++)
      {
        const j = (i + 1) % V.length;
        line(V[i], V[j], 'rgba(215,221,232,.28)');
        line(O[i], O[j], 'rgba(215,221,232,.28)');
        line(V[i], O[i], 'rgba(215,221,232,.35)')
      }
    if (ui.showBraces.checked)
      for (let i = 0; i < V.length; i++)
      {
        line(F, V[i], 'rgba(116,185,255,.55)');
        line(O[i], F2, 'rgba(217,147,255,.55)')
      }
    if (ui.showMidpoints.checked) R.forEach(r => line(F, r, 'rgba(127,137,152,.25)', 1, [5, 5]));
    V.forEach((p, i) => point(p, colors.vantage, 4, 'V' + (i + 1)));
    O.forEach((p, i) => point(p, colors.outlook, 4, 'O' + (i + 1)));
    if (ui.showExo.checked) R.forEach((p, i) => point(p, colors.exo, 3, 'R' + (i + 1)));
    point(F, colors.focus, 6, 'F₁');
    point(F2, colors.f2, 6, 'F₂')
  }

  function diagnostics(g)
  {
    if (!g)
    {
      ui.diagnostics.textContent = 'Add a focus and at least three vantages.';
      return
    }
    ui.diagnostics.innerHTML = '<table>' + g.mids.map((m, i) =>
    {
      const L = len(sub(vantages[(i + 1) % vantages.length], vantages[i])),
        fm = len(sub(m, focus)),
        fr = len(sub(g.exo[i], focus)),
        cross = (m.x - focus.x) * (g.exo[i].y - focus.y) - (m.y - focus.y) * (g.exo[i].x - focus.x);
      return `<tr><td>Edge ${i+1}</td><td>L ${metric(L)} · FM ${metric(fm)} · FR ${metric(fr)} · ${fr<fm?'before':'at/after'} M · col. ${Math.abs(cross)<.01?'ok':metric(Math.abs(cross))}</td></tr>`
    }).join('') + '</table>'
  }

  function draw()
  {
    clearCanvas();
    const g = geometry();
    mode === 'construction' ? construction(g) : wire(g);
    const n = vantages.length,
      ct = ui.centroidMode.value === 'vertex' ? 'vertex' : 'area';
    ui.status.innerHTML =
      `<strong>${n} vantage${n===1?'':'s'}</strong> · <strong>${ui.constructionMode.value}</strong><br>` + (g ?
        `F₂ uses the <strong>${ct} centroid</strong> of B₂.<br>` :
        'Add at least three vantages to activate the radial construction.<br>') +
      `The polygon is always closed: the last vantage connects to the first.<br>Rᵢ distance = edge length × ${(+ui.transfer.value).toFixed(2)}.<br>The dashed guide is the full ray through Mᵢ.<br>Oᵢ lies ${(+ui.outlook.value).toFixed(2)} of the way from F to Rᵢ.`;
    diagnostics(g);
    stats(g)
  }

  function randomize()
  {
    const n = +ui.count.value;
    focus = {
      x: W * .5,
      y: H * .42
    };
    vantages = [];
    const rx = Math.min(W * .28, 260),
      ry = Math.min(H * .25, 210);
    for (let i = 0; i < n; i++)
    {
      const a = -Math.PI / 2 + i * Math.PI * 2 / n + (Math.random() - .5) * .18,
        j = .78 + Math.random() * .38;
      vantages.push(
      {
        x: focus.x + Math.cos(a) * rx * j,
        y: focus.y + 90 + Math.sin(a) * ry * j
      })
    }
    draw()
  }

  function pos(e)
  {
    const r = canvas.getBoundingClientRect();
    return {
      x: e.clientX - r.left,
      y: e.clientY - r.top
    }
  }

  function hit(p)
  {
    // Use a generous hit area so points are easy to grab, even though their
    // drawn markers are smaller. Existing points always take priority over
    // the "add vantage" action.
    if (focus && Math.hypot(p.x - focus.x, p.y - focus.y) <= 16) return {
      type: 'focus'
    };
    for (let i = 0; i < vantages.length; i++)
      if (Math.hypot(p.x - vantages[i].x, p.y - vantages[i].y) <= 16) return {
        type: 'vantage',
        index: i
      };
    return null
  }
  canvas.addEventListener('pointerdown', e =>
  {
    e.preventDefault();
    const p = pos(e),
      h = hit(p);
    if (h)
    {
      drag = h;
      canvas.setPointerCapture(e.pointerId)
    }
    else if (mode === 'wireframe')
    {
      drag = {
        type: 'rotate'
      };
      lastPointer = p;
      canvas.setPointerCapture(e.pointerId)
    }
    else if (action === 'setFocus')
    {
      focus = p;
      action = 'addVantage';
      draw()
    }
    else
    {
      appendVantage(p)
    }
  });
  canvas.addEventListener('pointermove', e =>
  {
    const p = pos(e);

    // Give feedback when the pointer is over a movable point. Do not change
    // the cursor while the wireframe view is being rotated.
    if (!drag && mode === 'construction')
      canvas.style.cursor = hit(p) ? 'grab' : 'crosshair';
    if (!drag) return;
    if (drag.type === 'focus' || drag.type === 'vantage')
      canvas.style.cursor = 'grabbing';
    if (drag.type === 'focus') focus = p;
    else if (drag.type === 'vantage') vantages[drag.index] = p;
    else
    {
      ui.rotation.value = Math.max(-180, Math.min(180, +ui.rotation.value + (p.x - lastPointer.x) * .7));
      ui.tilt.value = Math.max(10, Math.min(85, +ui.tilt.value - (p.y - lastPointer.y) * .35));
      lastPointer = p;
      sync()
    }
    draw()
  });
  ['pointerup', 'pointercancel'].forEach(e => canvas.addEventListener(e, () =>
  {
    drag = null;
    lastPointer = null
    canvas.style.cursor = mode === 'construction' ? 'crosshair' : 'grab';
  }));

  function undo()
  {
    if (vantages.length) vantages.pop();
    else if (focus) focus = null;
    action = 'addVantage';
    draw()
  }
  ui.setFocus.onclick = () =>
  {
    action = 'setFocus';
    draw()
  };
  ui.addVantage.onclick = () =>
  {
    action = 'addVantage';
    draw()
  };
  ui.randomize.onclick = randomize;
  ui.undo.onclick = undo;
  ui.clear.onclick = () =>
  {
    focus = null;
    vantages = [];
    action = 'addVantage';
    draw()
  };
  ui.constructionBtn.onclick = () =>
  {
    mode = 'construction';
    ui.constructionBtn.classList.add('active');
    ui.wireframeBtn.classList.remove('active');
    draw()
  };
  ui.wireframeBtn.onclick = () =>
  {
    mode = 'wireframe';
    ui.wireframeBtn.classList.add('active');
    ui.constructionBtn.classList.remove('active');
    draw()
  };
  window.addEventListener('keydown', e =>
  {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z')
    {
      e.preventDefault();
      undo()
    }
  });

  function sync()
  {
    const canonical = ui.constructionMode.value === 'canonical';
    if (canonical)
    {
      ui.transfer.value = '1';
      ui.outlook.value = '.5'
    }
    ui.transfer.disabled = canonical;
    ui.outlook.disabled = canonical;
    ui.countOut.value = ui.count.value;
    ui.transferOut.value = (+ui.transfer.value).toFixed(2) + '×';
    ui.outlookOut.value = (+ui.outlook.value).toFixed(2);
    ui.heightOut.value = ui.height.value;
    ui.depthOut.value = ui.depth.value;
    ui.rotOut.value = ui.rotation.value + '°';
    ui.tiltOut.value = ui.tilt.value + '°'
  }
  'count transfer outlook centroidMode constructionMode height depth rotation tilt showMidpoints showExo showB1 showB2 showTriplets showF1Outlooks showF2Vantages showBraces showSkin showLabels'
  .split(' ').forEach(id => ui[id].addEventListener('input', () =>
  {
    sync();
    draw()
  }));

  function resize()
  {
    const r = canvas.getBoundingClientRect();
    W = r.width;
    H = r.height;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw()
  }
  window.addEventListener('resize', resize);
  sync();
  resize();
  setTimeout(randomize, 30);
})();
