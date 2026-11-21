# Runs INSIDE a zgen.py `types` process (injected once with gdb + PyPyRun_SimpleString, fresh globals).
# Finds the search's callbacks through the garbage collector (PyPy's JIT hides the running frames):
#   worker: function `found` -> closure cells hold `pats` (dict) and `count` ([int])
#   parent: function `finished` -> closure cells hold `done` (dict job index -> result) and `jobs`
# Writes ~/zruns/scrape/scrape_<pid>.json. Reads only; changes nothing in the search.
def _scrape():
    import gc, json, os

    def ser(v):
        key, rk, kp, fl = v
        return [[list(x) for x in key[0]], [list(x) for x in key[1]], rk, kp, fl]

    def cells(fn):
        return dict(zip(fn.__code__.co_freevars, [c.cell_contents for c in (fn.__closure__ or ())]))

    out = {"pid": os.getpid(), "workers": [], "parent_done": []}
    for ob in gc.get_objects():
        if type(ob).__name__ != "function":
            continue
        name = getattr(ob, "__name__", "")
        if name == "found" and ob.__closure__:
            c = cells(ob)
            if "pats" in c:
                vals = list(c["pats"].values())
                out["workers"].append({"shape": [c.get("nu"), c.get("vp"), c.get("vm")], "count": c["count"][0],
                                       "untyped_keys": sum(1 for v in vals if v[0] is None),
                                       "pats": [ser(v) for v in vals if v[0] is not None]})
        elif name == "finished" and ob.__closure__:
            c = cells(ob)
            if "done" in c and "jobs" in c:
                for i, res in list(c["done"].items()):
                    out["parent_done"].append({"i": i, "job": list(c["jobs"][i]), "count": res[2],
                                               "untyped_keys": sum(1 for v in res[3] if v[0] is None),
                                               "pats": [ser(v) for v in res[3] if v[0] is not None]})
    d = os.path.expanduser("~/zruns/scrape")
    os.makedirs(d, exist_ok=True)
    p = os.path.join(d, "scrape_%d.json" % os.getpid())
    with open(p + ".tmp", "w") as fh:
        json.dump(out, fh)
    os.replace(p + ".tmp", p)


try:
    _scrape()
except BaseException as e:
    import os
    with open(os.path.expanduser("~/zruns/scrape/error_%d.txt" % os.getpid()), "w") as fh:
        fh.write(repr(e))
