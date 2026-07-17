from __future__ import annotations

import html
import json

import pandas as pd


def _table(frame: pd.DataFrame, limit: int = 100) -> str:
    if frame.empty: return "<p>No data available.</p>"
    view = frame.head(limit).copy()
    for column in view.select_dtypes(include=["datetime64[ns, UTC]", "datetime64[ns]"]): view[column] = view[column].astype(str).str.slice(0, 10)
    return view.to_html(index=False, classes="data-table", border=0, escape=True)


def build_dashboard(stats: dict, tables: dict[str, pd.DataFrame]) -> str:
    cards = [("Messages", f"{stats['total_messages']:,}"), ("Archive range", f"{(stats['oldest_message_date'] or 'Unknown')[:10]} — {(stats['newest_message_date'] or 'Unknown')[:10]}"), ("Unique senders", f"{stats['unique_sender_addresses']:,}"), ("Unique domains", f"{stats['unique_sender_domains']:,}"), ("Top sender share", f"{stats['top_sender_share_percent']:.1f}%"), ("Attachments", f"{stats['messages_with_attachments']:,}")]
    cards_html = "".join(f"<div class='card'><span>{html.escape(k)}</span><strong>{html.escape(v)}</strong></div>" for k, v in cards)
    chart_data = json.dumps(tables["timeline_monthly"].to_dict("records"), default=str).replace("</", "<\\/")
    sections = [("Top senders", tables["senders"]), ("Top domains", tables["domains"]), ("Gmail labels", tables["labels"]), ("Likely subscriptions", tables["subscriptions"]), ("Possible services and accounts", tables["accounts"]), ("Potential duplicates", tables["duplicates"])]
    table_html = "".join(f"<section><div class='section-title'><h2>{title}</h2><input class='filter' placeholder='Filter this table…'></div>{_table(frame)}</section>" for title, frame in sections)
    return f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Mailbox archive analytics</title><style>
body{{margin:0;background:#f4f6f8;color:#172033;font:14px system-ui,-apple-system,Segoe UI,sans-serif}}main{{max-width:1400px;margin:auto;padding:32px}}h1{{margin:0 0 6px}}.notice{{color:#426071}}.cards{{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin:24px 0}}.card,section{{background:#fff;border:1px solid #dce3ea;border-radius:10px;padding:16px;box-shadow:0 1px 2px #00000008}}.card span{{display:block;color:#627385;font-size:12px;text-transform:uppercase;letter-spacing:.04em}}.card strong{{display:block;font-size:23px;margin-top:6px}}section{{margin:18px 0;overflow:auto}}.section-title{{display:flex;align-items:center;justify-content:space-between;gap:12px}}h2{{margin:0 0 12px;font-size:18px}}.filter{{padding:8px;border:1px solid #c9d5df;border-radius:6px}}table{{width:100%;border-collapse:collapse}}th,td{{padding:8px;text-align:left;border-bottom:1px solid #e7edf2;white-space:nowrap}}th{{background:#f4f7fa;cursor:pointer}}tr:hover td{{background:#f8fbfd}}</style></head><body><main><h1>Mailbox archive analytics</h1><p class="notice">Generated locally. No email data is uploaded or transmitted. Categories are transparent heuristic estimates, not certainty.</p><div class="cards">{cards_html}</div><section><h2>Monthly message volume</h2><canvas id="chart" height="100"></canvas></section>{table_html}</main><script>const data={chart_data};const c=document.querySelector('#chart'),x=c.getContext('2d');const total={{}};data.forEach(r=>total[r.year_month]=(total[r.year_month]||0)+r.messages);const e=Object.entries(total),max=Math.max(1,...e.map(x=>x[1]));c.width=c.clientWidth*devicePixelRatio;c.height=220*devicePixelRatio;x.scale(devicePixelRatio,devicePixelRatio);const w=c.clientWidth,h=220;x.strokeStyle='#dce3ea';x.beginPath();x.moveTo(0,h-25);x.lineTo(w,h-25);x.stroke();x.strokeStyle='#2374ab';x.lineWidth=2;x.beginPath();e.forEach(([_,v],i)=>{{let px=i*w/Math.max(1,e.length-1),py=(h-35)-v/max*(h-55);i?x.lineTo(px,py):x.moveTo(px,py)}});x.stroke();document.querySelectorAll('th').forEach(th=>th.onclick=()=>{{const t=th.closest('table'),n=[...th.parentNode.children].indexOf(th);[...t.tBodies[0].rows].sort((a,b)=>a.cells[n].innerText.localeCompare(b.cells[n].innerText,undefined,{{numeric:true}})).forEach(r=>t.tBodies[0].append(r))}});document.querySelectorAll('.filter').forEach(input=>input.oninput=()=>{{const q=input.value.toLowerCase();input.closest('section').querySelectorAll('tbody tr').forEach(row=>row.hidden=!row.innerText.toLowerCase().includes(q))}});</script></body></html>'''
