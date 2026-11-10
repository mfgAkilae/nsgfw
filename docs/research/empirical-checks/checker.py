#!/usr/bin/env python3
"""Empirical checks that run on the prober VM (vm-a). Python standard library only.

The prober VM is both the controller and the traffic source, so every timestamp
comes from one clock: ARM writes, long-running-operation polling and TCP probes.

Usage: python3 checker.py <config.json>
The config is written by run.py. Results go to a blob container through a SAS URL.

Checks (see ../empirical-checks.md):
  T1  priority uniqueness and swaps (API only, unassociated NSG)
  T2  one NSG PUT takes effect as a whole, and the effect time after the LRO
  T3  a failed NSG PUT applies nothing
  T5  one network interface PUT that changes ASG membership takes effect as a whole
  T7  one subnet PUT that swaps the subnet's NSG takes effect as a whole (source and destination side)
  T8  one private endpoint PUT that swaps its ASG: interim states and the lag after Succeeded
  T9  which rights a private endpoint PUT that changes only its ASGs needs (runs before T8)
"""
import json
import select
import socket
import struct
import sys
import threading
import time
import traceback
import urllib.error
import urllib.request

CFG = json.load(open(sys.argv[1]))
ARM = "https://management.azure.com"
NET_API = "2024-05-01"
SUB, RG = CFG["subscriptionId"], CFG["resourceGroup"]
RGP = f"/subscriptions/{SUB}/resourceGroups/{RG}"
NET = f"{RGP}/providers/Microsoft.Network"
SRC_PREFIX = CFG["srcPrefix"]
TARGETS = CFG["targets"]  # {"b": ip, "c": ip}
RESULTS = {"config": {k: v for k, v in CFG.items() if k not in ("sasUrl", "subscriptionId", "miClientId")},
           "tests": {}}
LOG = []


def now():
    return time.time()


def log(msg):
    line = f"{time.strftime('%H:%M:%S')} {msg}"
    LOG.append(line)
    print(line, flush=True)


# ---------------------------------------------------------------- ARM access

_tok = {"v": None, "exp": 0}


def token():
    if _tok["v"] and _tok["exp"] - 300 > now():
        return _tok["v"]
    url = ("http://169.254.169.254/metadata/identity/oauth2/token?api-version=2018-02-01"
           "&resource=https://management.azure.com/&client_id=" + CFG["miClientId"])
    d = json.load(urllib.request.urlopen(
        urllib.request.Request(url, headers={"Metadata": "true"}), timeout=10))
    _tok.update(v=d["access_token"], exp=int(d["expires_on"]))
    return _tok["v"]


def arm(method, path=None, body=None, url=None, api=NET_API, headers=None):
    if url is None:
        url = f"{ARM}{path}{'&' if '?' in path else '?'}api-version={api}"
    data = json.dumps(body).encode() if body is not None else None
    h = {"Authorization": "Bearer " + token(), "Content-Type": "application/json"}
    h.update(headers or {})
    for attempt in range(8):
        req = urllib.request.Request(url, data=data, method=method, headers=h)
        try:
            r = urllib.request.urlopen(req, timeout=120)
            txt = r.read().decode()
            hdr = {k.lower(): v for k, v in r.headers.items()}
            return r.status, hdr, (json.loads(txt) if txt else {})
        except urllib.error.HTTPError as e:
            txt = e.read().decode()
            hdr = {k.lower(): v for k, v in e.headers.items()}
            try:
                j = json.loads(txt)
            except ValueError:
                j = {"raw": txt[:2000]}
            if e.code == 429 or (e.code >= 500 and method == "GET"):
                time.sleep(min(int(hdr.get("retry-after", "5")), 30))
                continue
            return e.code, hdr, j
        except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
            log(f"transport error {e!r}, retry")
            time.sleep(3)
    raise RuntimeError(f"{method} {url} failed after retries")


def wait_for_access():
    """Role assignments take minutes to propagate. Wait until the identity can read and write."""
    for _ in range(120):
        st, _, _ = arm("GET", f"{NET}/networkSecurityGroups/nsg-scratch")
        if st == 200:
            st2, _, _ = arm("PATCH", f"{NET}/networkSecurityGroups/nsg-scratch",
                            {"tags": {"probe": "write-access"}})
            if st2 in (200, 201, 202):
                return
        time.sleep(10)
    raise RuntimeError("managed identity never got access")


def put_and_wait(path, body, poll=0.25, timeout=600):
    """PUT, then poll the async operation. Returns timestamps and the outcome."""
    rec = {"t_sent": now()}
    st, hdr, j = arm("PUT", path, body)
    rec["t_resp"] = now()
    rec["http"] = st
    if st >= 400:
        rec.update(t_done=rec["t_resp"], final="Rejected", error=j.get("error", j))
        return rec
    aso = hdr.get("azure-asyncoperation")
    state = (j.get("properties") or {}).get("provisioningState")
    while state not in ("Succeeded", "Failed", "Canceled"):
        if now() - rec["t_sent"] > timeout:
            state = "Timeout"
            break
        time.sleep(poll)
        if aso:
            _, _, j2 = arm("GET", url=aso)
            state = j2.get("status")
            if state == "Failed":
                rec["error"] = j2.get("error")
        else:
            _, _, j2 = arm("GET", path)
            state = (j2.get("properties") or {}).get("provisioningState")
    rec["t_done"] = now()
    rec["final"] = state
    return rec


def get(path):
    st, _, j = arm("GET", path)
    if st != 200:
        raise RuntimeError(f"GET {path}: {st} {j}")
    return j


# ---------------------------------------------------------------- rules

def rule(name, prio, port, access="Allow", direction="Inbound", src=None, dst="*",
         src_asgs=None, dst_asgs=None, proto="Tcp"):
    p = {"priority": prio, "direction": direction, "access": access, "protocol": proto,
         "sourcePortRange": "*", "destinationPortRange": str(port)}
    if src_asgs:
        p["sourceApplicationSecurityGroups"] = [{"id": a} for a in src_asgs]
    else:
        p["sourceAddressPrefix"] = src or SRC_PREFIX
    if dst_asgs:
        p["destinationApplicationSecurityGroups"] = [{"id": a} for a in dst_asgs]
    else:
        p["destinationAddressPrefix"] = dst
    return {"name": name, "properties": p}


def asg_id(name):
    return f"{NET}/applicationSecurityGroups/{name}"


BASE_DENY = rule("deny-probe-ports", 4000, "5001-5006", access="Deny", src="*")
FILLERS = [rule(f"filler-{i:03d}", 1000 + i, 7000 + i, access="Deny", src="*") for i in range(300)]
T5_RULES = [
    rule("src-asg-x-5003", 300, 5003, src_asgs=[asg_id("asg-x")]),
    rule("src-asg-y-5004", 301, 5004, src_asgs=[asg_id("asg-y")]),
    rule("dst-asg-d1-5005", 310, 5005, dst_asgs=[asg_id("asg-d1")]),
    rule("dst-asg-d2-5006", 311, 5006, dst_asgs=[asg_id("asg-d2")]),
]


def nsg_body(path, rules):
    cur = get(path)
    return {"location": cur["location"], "tags": cur.get("tags", {}),
            "properties": {"securityRules": rules}}


def rule_summary(nsg):
    return sorted((r["name"], r["properties"]["priority"], r["properties"]["direction"])
                  for r in nsg["properties"].get("securityRules", []))


# ---------------------------------------------------------------- prober

class Prober:
    """K staggered workers per (target, label) pair open new TCP connections.

    Each record is (t_start, target, label, ok) with ok = 1 connected, 0 timeout
    (NSG drop), -1 refused or other error. The label is the port for plain pairs, or
    any name for pairs that also bind a source IP. SO_LINGER 0 closes with RST, so
    the prober leaves no TIME_WAIT sockets behind.
    """

    def __init__(self, interval=0.02, workers=4, timeout=0.1):
        self.interval, self.workers, self.timeout = interval, workers, timeout
        self.records, self.lock = [], threading.Lock()
        self.pairs, self.stop_evt, self.threads = [], threading.Event(), []

    def _probe(self, ip, port, src=None):
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.setsockopt(socket.SOL_SOCKET, socket.SO_LINGER, struct.pack("ii", 1, 0))
        if src:
            try:
                s.bind((src, 0))
            except OSError:  # the source IP is not on the VM: record it instead of dying
                s.close()
                time.sleep(self.timeout)
                return now(), -2
        s.setblocking(False)
        t = now()
        ok = 0
        try:
            s.connect_ex((ip, port))
            _, w, _ = select.select([], [s], [], self.timeout)
            if w:
                ok = 1 if s.getsockopt(socket.SOL_SOCKET, socket.SO_ERROR) == 0 else -1
        finally:
            s.close()
        return t, ok

    def _worker(self, tgt, ip, label, port, src, period, offset):
        nxt = now() + offset
        while not self.stop_evt.is_set():
            d = nxt - now()
            if d > 0:
                time.sleep(d)
            t, ok = self._probe(ip, port, src)
            with self.lock:
                self.records.append((t, tgt, label, ok))
            nxt += period
            if nxt < now():
                nxt = now()

    def start(self, ports):
        """ports: ints, probed on every target in TARGETS at the default rate, or dicts
        {tgt, ip, label, port, src?, interval?, workers?} for one pair. A closed port holds
        each worker for the timeout, so a pair probes a closed port every
        max(interval, timeout / workers)."""
        self.stop()
        self.stop_evt.clear()
        self.records = []
        specs = []
        for p in ports:
            if isinstance(p, int):
                specs += [{"tgt": tgt, "ip": ip, "label": p, "port": p} for tgt, ip in TARGETS.items()]
            else:
                specs.append(p)
        for sp in specs:
            interval, workers = sp.get("interval", self.interval), sp.get("workers", self.workers)
            for k in range(workers):
                th = threading.Thread(target=self._worker, daemon=True, args=(
                    sp["tgt"], sp["ip"], sp["label"], sp["port"], sp.get("src"),
                    interval * workers, k * interval))
                th.start()
                self.threads.append(th)

    def stop(self):
        self.stop_evt.set()
        for th in self.threads:
            th.join()
        self.threads = []

    def snapshot(self, since):
        with self.lock:
            return [r for r in self.records if r[0] >= since]

    def state(self, tgt, port, last=1.0):
        """1 if every probe in the last `last` seconds connected, 0 if none did, None if mixed."""
        t0 = now() - last
        with self.lock:
            oks = [r[3] == 1 for r in self.records if r[1] == tgt and r[2] == port and r[0] >= t0]
        if not oks:
            return None
        return 1 if all(oks) else (0 if not any(oks) else None)


PROBER = Prober()


def wait_stable(expect, hold=3.0, timeout=90):
    """expect: {(tgt, port): 1 or 0}. Wait until each pair held that state for `hold` seconds."""
    t0 = now()
    while now() - t0 < timeout:
        if all(PROBER.state(t, p, hold) == v for (t, p), v in expect.items()):
            return now() - t0
        time.sleep(0.25)
    return None


def analyse_flip(records, rec, opening, closing, targets, probe=None):
    """Per target: when the opening port first connected, when the closing port last
    connected, and whether both were open at the same time. `probe` names a port that
    both states deny: every connect on it is a leak."""
    out = {}
    for tgt in targets:
        o = sorted(r[0] for r in records if r[1] == tgt and r[2] == opening and r[3] == 1)
        c = sorted(r[0] for r in records if r[1] == tgt and r[2] == closing and r[3] == 1
                   and r[0] >= rec["t_sent"])
        first_open = next((t for t in o if t >= rec["t_sent"]), None)
        last_close_ok = c[-1] if c else None
        # flaps: the closing port connects again after it had stopped, or the opening port
        # drops again after it had started
        o_after = [r for r in records if r[1] == tgt and r[2] == opening and first_open
                   and r[0] > first_open]
        reclose = sum(1 for r in o_after if r[3] != 1)
        trans = {}
        for port, label in ((opening, "opening"), (closing, "closing")):
            prev, out_t = None, []
            for r in sorted(r for r in records if r[1] == tgt and r[2] == port):
                ok = r[3] == 1
                if ok != prev:
                    out_t.append([round(r[0] - rec["t_done"], 3), int(ok)])
                    prev = ok
            trans[label] = out_t
        d = {
            "transitions_rel_done": trans,
            "both_closed_s": (round(first_open - last_close_ok, 3)
                              if first_open and last_close_ok and first_open > last_close_ok else None),
            "open_after_done_s": round(first_open - rec["t_done"], 3) if first_open else None,
            "open_after_resp_s": round(first_open - rec["t_resp"], 3) if first_open else None,
            "close_after_done_s": round(last_close_ok - rec["t_done"], 3) if last_close_ok else None,
            "both_open_s": (round(last_close_ok - first_open, 3)
                            if first_open and last_close_ok and last_close_ok > first_open else 0),
            "opening_port_failures_after_first_open": reclose,
        }
        if probe is not None:
            leaks = sorted(r[0] for r in records if r[1] == tgt and r[2] == probe and r[3] == 1)
            d["probe_attempts"] = sum(1 for r in records if r[1] == tgt and r[2] == probe)
            d["probe_open_count"] = len(leaks)
            d["probe_open_first_rel_done_s"] = round(leaks[0] - rec["t_done"], 3) if leaks else None
            d["probe_open_last_rel_done_s"] = round(leaks[-1] - rec["t_done"], 3) if leaks else None
        out[tgt] = d
    return out


def flip_series(name, n, states, write, ports_of, targets=("b", "c"), extra=None,
                closed_also=(), probe=None):
    """Alternate between two states n times. states: [A, B]; write(state) does the ARM write
    and returns the put_and_wait record; ports_of(state) -> (open_port, closed_port).
    closed_also: ports both states deny; probe: the one whose connects count as leaks."""
    flips = []
    for i in range(n):
        target_state = states[(i + 1) % 2]
        opening, closing = ports_of(target_state)
        t_mark = now() - 2
        rec = write(target_state)
        settle = wait_stable({(t, opening): 1 for t in targets} | {(t, closing): 0 for t in targets}
                             | {(t, c): 0 for t in targets for c in closed_also})
        time.sleep(1)
        recs = PROBER.snapshot(t_mark)
        f = {"i": i, "to": target_state, "http": rec["http"], "final": rec["final"],
             "lro_s": round(rec["t_done"] - rec["t_sent"], 3),
             "resp_s": round(rec["t_resp"] - rec["t_sent"], 3),
             "settled_after_done_s": round(settle, 3) if settle is not None else None,
             "targets": analyse_flip(recs, rec, opening, closing, targets, probe)}
        if rec.get("error"):
            f["error"] = rec["error"]
        if extra:
            f.update(extra(target_state))
        flips.append(f)
        log(f"{name} flip {i} -> {target_state}: lro {f['lro_s']}s "
            f"{json.dumps(f['targets'])}")
        if rec["final"] != "Succeeded" or settle is None:
            log(f"{name}: stopping series, write {rec['final']} settle {settle}")
            break
    return {"flips": flips, "summary": summarise(flips)}


def summarise(flips):
    vals = {"open_after_done_s": [], "close_after_done_s": [], "both_open_s": [], "lro_s": []}
    for f in flips:
        vals["lro_s"].append(f["lro_s"])
        for t in f["targets"].values():
            for k in ("open_after_done_s", "close_after_done_s", "both_open_s"):
                if t[k] is not None:
                    vals[k].append(t[k])
    s = {"flips": len(flips),
         "flips_with_both_open": sum(1 for f in flips
                                     if any(t["both_open_s"] > 0 for t in f["targets"].values())),
         "flips_with_both_closed_over_100ms": sum(
             1 for f in flips if any((t.get("both_closed_s") or 0) > 0.1 for t in f["targets"].values())),
         "flips_with_both_closed_over_150ms": sum(
             1 for f in flips if any((t.get("both_closed_s") or 0) > 0.15 for t in f["targets"].values()))}
    if any("probe_open_count" in t for f in flips for t in f["targets"].values()):
        s["flips_with_probe_open"] = sum(1 for f in flips
                                         if any(t.get("probe_open_count") for t in f["targets"].values()))
        s["probe_open_total"] = sum(t.get("probe_open_count", 0) for f in flips for t in f["targets"].values())
        s["probe_attempts_total"] = sum(t.get("probe_attempts", 0) for f in flips for t in f["targets"].values())
    vals["both_closed_s"] = [t["both_closed_s"] for f in flips for t in f["targets"].values()
                             if t.get("both_closed_s") is not None]
    for k, v in vals.items():
        if v:
            v = sorted(v)
            s[k] = {"min": v[0], "median": v[len(v) // 2], "max": v[-1]}
    return s


def save(name, data):
    RESULTS["tests"][name] = data
    upload("results.json", json.dumps(RESULTS, indent=1))
    upload("status.json", json.dumps({"done": list(RESULTS["tests"]), "t": now()}))


def upload(blob, text):
    base, sas = CFG["sasUrl"].split("?", 1)
    req = urllib.request.Request(f"{base}/{blob}?{sas}", data=text.encode(), method="PUT",
                                 headers={"x-ms-blob-type": "BlockBlob",
                                          "Content-Type": "application/json"})
    try:
        urllib.request.urlopen(req, timeout=60).read()
    except Exception as e:  # results stay in memory and in the local log
        print(f"upload {blob} failed: {e!r}", flush=True)


# ---------------------------------------------------------------- T1

def t1_priorities():
    p = f"{NET}/networkSecurityGroups/nsg-scratch"
    out = {}

    def attempt(label, rules):
        rec = put_and_wait(p, nsg_body(p, rules))
        r = {"http": rec["http"], "final": rec["final"], "error": rec.get("error")}
        r["rules_after"] = rule_summary(get(p))
        out[label] = r
        log(f"T1 {label}: {rec['http']} {rec['final']} {json.dumps(rec.get('error'))[:300]}")

    attempt("a_same_priority_inbound_and_outbound",
            [rule("in-100", 100, 6001), rule("out-100", 100, 6002, direction="Outbound")])
    attempt("b_same_priority_same_direction",
            [rule("in-a", 100, 6001), rule("in-b", 100, 6002)])
    attempt("c0_baseline", [rule("r1", 100, 6001), rule("r2", 101, 6002), rule("r3", 102, 6003)])
    attempt("c1_swap_r1_r2_in_one_put",
            [rule("r1", 101, 6001), rule("r2", 100, 6002), rule("r3", 102, 6003)])
    attempt("c2_rotate_three_in_one_put",
            [rule("r1", 102, 6001), rule("r2", 101, 6002), rule("r3", 100, 6003)])
    attempt("c3_shift_window_up_by_one",
            [rule("r1", 101, 6001), rule("r2", 102, 6002), rule("r3", 103, 6003)])
    # child-resource writes
    cur = {r[0]: r[1] for r in rule_summary(get(p))}
    rp = f"{p}/securityRules"
    rec = put_and_wait(f"{rp}/r1", {"properties": rule("r1", cur["r2"], 6001)["properties"]})
    out["d_child_put_collides_same_direction"] = {"http": rec["http"], "final": rec["final"],
                                                  "error": rec.get("error"),
                                                  "rules_after": rule_summary(get(p))}
    log(f"T1 d: {rec['http']} {rec['final']} {json.dumps(rec.get('error'))[:300]}")
    rec = put_and_wait(f"{rp}/o1",
                       {"properties": rule("o1", cur["r2"], 6009, direction="Outbound")["properties"]})
    out["e_child_put_outbound_same_priority_as_inbound"] = {
        "http": rec["http"], "final": rec["final"], "error": rec.get("error"),
        "rules_after": rule_summary(get(p))}
    log(f"T1 e: {rec['http']} {rec['final']} {json.dumps(rec.get('error'))[:300]}")
    save("T1_priorities", out)


# ---------------------------------------------------------------- T2, T3

DST = f"{NET}/networkSecurityGroups/nsg-dst"


def t2_state(state, fillers):
    """state 'p1': only 5001 open; 'p2': only 5002 open. The opening rule goes first in the
    array and the deny rule last, so a rule-by-rule apply in array order would open first."""
    if state == "p1":
        rules = [rule("t2-open-5001", 200, 5001)]
    else:
        rules = [rule("t2-open-5002", 201, 5002)]
    return rules + (FILLERS if fillers else []) + [BASE_DENY]


def t2_nsg_as_a_whole():
    PROBER.start([5001, 5002])
    body0 = nsg_body(DST, t2_state("p1", False))
    put_and_wait(DST, body0)
    if wait_stable({("b", 5001): 1, ("c", 5001): 1, ("b", 5002): 0, ("c", 5002): 0},
                   timeout=600) is None:
        raise RuntimeError("listeners not reachable on 5001, or 5002 not closed")
    loc, tags = body0["location"], body0["tags"]
    ports = {"p1": (5001, 5002), "p2": (5002, 5001)}

    def writer(fillers):
        return lambda s: put_and_wait(DST, {"location": loc, "tags": tags,
                                            "properties": {"securityRules": t2_state(s, fillers)}})

    res = {"small": flip_series("T2-small", CFG.get("flips", 20), ["p1", "p2"], writer(False),
                                lambda s: ports[s])}
    save("T2_nsg_put_as_a_whole", res)
    # bring the NSG back to p1 so the large series starts from a known state
    put_and_wait(DST, {"location": loc, "tags": tags,
                       "properties": {"securityRules": t2_state("p1", True)}})
    wait_stable({("b", 5001): 1, ("c", 5001): 1, ("b", 5002): 0, ("c", 5002): 0})
    res["large_300_fillers"] = flip_series("T2-large", CFG.get("flips_large", 10), ["p1", "p2"],
                                           writer(True), lambda s: ports[s])
    save("T2_nsg_put_as_a_whole", res)


def t3_failed_put():
    """From state p1, send state p2 plus one defect. A partial apply would open 5002."""
    PROBER.start([5001, 5002])
    cur = get(DST)
    loc, tags = cur["location"], cur.get("tags", {})
    base = [rule("t2-open-5001", 200, 5001), BASE_DENY]
    put_and_wait(DST, {"location": loc, "tags": tags, "properties": {"securityRules": base}})
    wait_stable({("b", 5001): 1, ("b", 5002): 0})
    before = rule_summary(get(DST))
    opening = [rule("t2-open-5002", 201, 5002)]
    cases = {
        "duplicate_priority": opening + [BASE_DENY, rule("dup", 4000, 6100, access="Deny")],
        "invalid_prefix": opening + [BASE_DENY, rule("bad", 210, 6101, src="10.90.300.0/24")],
        "missing_asg": opening + [BASE_DENY,
                                  rule("ghost", 211, 6102, src_asgs=[asg_id("asg-does-not-exist")])],
        "asg_other_region": opening + [BASE_DENY,
                                       rule("other-region", 212, 6103, src_asgs=[asg_id("asg-other")])],
        "over_2000_rules": opening + [BASE_DENY] + [
            rule(f"bulk-{i:04d}", 1000 + i, 10000 + i, access="Deny", src="*") for i in range(2000)],
    }
    out = {}
    for name, rules in cases.items():
        t_mark = now()
        rec = put_and_wait(DST, {"location": loc, "tags": tags, "properties": {"securityRules": rules}})
        time.sleep(20)
        after = get(DST)
        recs = PROBER.snapshot(t_mark)
        opened = sorted({r[1] for r in recs if r[2] == 5002 and r[3] == 1})
        closed = sorted({r[1] for r in recs if r[2] == 5001 and r[3] != 1})
        out[name] = {"http": rec["http"], "final": rec["final"], "error": rec.get("error"),
                     "lro_s": round(rec["t_done"] - rec["t_sent"], 3),
                     "rules_unchanged": rule_summary(after) == before,
                     "provisioningState_after": after["properties"]["provisioningState"],
                     "targets_where_5002_opened": opened,
                     "targets_where_5001_failed": closed}
        log(f"T3 {name}: {json.dumps(out[name])[:400]}")
        if not out[name]["rules_unchanged"]:  # restore before the next case
            put_and_wait(DST, {"location": loc, "tags": tags, "properties": {"securityRules": base}})
            wait_stable({("b", 5001): 1, ("b", 5002): 0})
            before = rule_summary(get(DST))
    save("T3_failed_put", out)


# ---------------------------------------------------------------- T5

def nic_set_asgs(nic, asgs):
    path = f"{NET}/networkInterfaces/{nic}"
    body = get(path)
    for k in ("etag", "id", "name", "type"):
        body.pop(k, None)
    # Azure requires every IP configuration of a NIC to reference the same ASG set
    for ipc in body["properties"]["ipConfigurations"]:
        ipc["properties"]["applicationSecurityGroups"] = [{"id": asg_id(a)} for a in asgs]
    return put_and_wait(path, body)


def t5_nic_asg_as_a_whole():
    cur = get(DST)
    loc, tags = cur["location"], cur.get("tags", {})
    put_and_wait(DST, {"location": loc, "tags": tags,
                       "properties": {"securityRules": T5_RULES + [BASE_DENY]}})
    res = {}
    # source side: the prober's NIC moves between asg-x (5003) and asg-y (5004)
    PROBER.start([5003, 5004])
    nic_set_asgs("nic-a", ["asg-x"])
    if wait_stable({("b", 5003): 1, ("c", 5003): 1, ("b", 5004): 0, ("c", 5004): 0}) is None:
        raise RuntimeError("source-side ASG rule never opened 5003")
    ports = {"asg-x": (5003, 5004), "asg-y": (5004, 5003)}
    res["source_side_nic_a"] = flip_series(
        "T5-src", CFG.get("flips_nic", 10), ["asg-x", "asg-y"],
        lambda s: nic_set_asgs("nic-a", [s]), lambda s: ports[s])
    save("T5_nic_asg_as_a_whole", res)
    # destination side: vm-b's NIC moves between asg-d1 (5005) and asg-d2 (5006); vm-c is a control
    PROBER.start([5005, 5006])
    nic_set_asgs("nic-b", ["asg-d1"])
    if wait_stable({("b", 5005): 1, ("b", 5006): 0}) is None:
        raise RuntimeError("destination-side ASG rule never opened 5005")
    ports = {"asg-d1": (5005, 5006), "asg-d2": (5006, 5005)}

    def control(_s):
        return {"control_c_open": {str(p): PROBER.state("c", p, 5.0) for p in (5005, 5006)}}

    res["destination_side_nic_b"] = flip_series(
        "T5-dst", CFG.get("flips_nic", 10), ["asg-d1", "asg-d2"],
        lambda s: nic_set_asgs("nic-b", [s]), lambda s: ports[s], targets=("b",), extra=control)
    save("T5_nic_asg_as_a_whole", res)


# ---------------------------------------------------------------- T7

# Both swap NSGs deny the probe port 5001 in both directions. nsg-swap-a allows 5002 and
# nsg-swap-b allows 5003, inbound from src and outbound to dst. A subnet without an NSG
# lets 5001 through, so any connect on 5001 during a swap shows a moment without an NSG.
SWAP_PORTS = {"nsg-swap-a": (5002, 5003), "nsg-swap-b": (5003, 5002)}
PROBE_PORT = 5001
SUBNET_READ_ONLY = ("provisioningState", "ipConfigurations", "ipConfigurationProfiles",
                    "privateEndpoints", "purpose", "resourceNavigationLinks", "serviceAssociationLinks")


def subnet_path(name):
    return f"{NET}/virtualNetworks/vnet-checks/subnets/{name}"


def subnet_set_nsg(subnet, nsg):
    """One subnet PUT that changes only the NSG association, as a swap at onboarding does."""
    body = get(subnet_path(subnet))
    for k in ("etag", "id", "name", "type"):
        body.pop(k, None)
    for k in SUBNET_READ_ONLY:
        body["properties"].pop(k, None)
    body["properties"]["networkSecurityGroup"] = {"id": f"{NET}/networkSecurityGroups/{nsg}"}
    return put_and_wait(subnet_path(subnet), body)


def t7_series(name, subnet):
    """The probe port gets ten workers, one probe every 10 ms per target even while closed."""
    specs = []
    for tgt, ip in TARGETS.items():
        specs.append({"tgt": tgt, "ip": ip, "label": PROBE_PORT, "port": PROBE_PORT,
                      "interval": 0.01, "workers": 10})
        specs += [{"tgt": tgt, "ip": ip, "label": p, "port": p} for p in (5002, 5003)]
    PROBER.start(specs)
    rec = subnet_set_nsg(subnet, "nsg-swap-a")
    if rec["final"] != "Succeeded":
        raise RuntimeError(f"{name}: baseline subnet write {rec['final']} {rec.get('error')}")
    expect = ({(t, 5002): 1 for t in TARGETS} | {(t, 5003): 0 for t in TARGETS}
              | {(t, PROBE_PORT): 0 for t in TARGETS})
    if wait_stable(expect, timeout=600) is None:
        raise RuntimeError(f"{name}: baseline never reached: "
                           f"{ {f'{t}:{p}': PROBER.state(t, p, 3.0) for (t, p) in expect} }")
    t_series = now()  # from here on every connect on the probe port is a leak
    res = flip_series(name, CFG.get("flips_swap", 30), list(SWAP_PORTS),
                      lambda s: subnet_set_nsg(subnet, s), lambda s: SWAP_PORTS[s],
                      closed_also=(PROBE_PORT,), probe=PROBE_PORT)
    allrecs = PROBER.snapshot(t_series)
    res["probe_port_whole_series"] = {
        t: {"attempts": sum(1 for r in allrecs if r[1] == t and r[2] == PROBE_PORT),
            "connects": sum(1 for r in allrecs if r[1] == t and r[2] == PROBE_PORT and r[3] == 1)}
        for t in TARGETS}
    log(f"{name}: probe port over the whole series {json.dumps(res['probe_port_whole_series'])}")
    return res


def t7_subnet_nsg_swap():
    res = {}
    # destination side: src keeps nsg-src (no custom rules, outbound open), dst swaps
    res["destination_side_dst"] = t7_series("T7-dst", "dst")
    save("T7_subnet_nsg_swap", res)
    # source side: dst gets nsg-dst with only an allow for the probe ports, src swaps
    cur = get(DST)
    put_and_wait(DST, {"location": cur["location"], "tags": cur.get("tags", {}),
                       "properties": {"securityRules": [rule("allow-src-5001-5006", 200, "5001-5006")]}})
    rec = subnet_set_nsg("dst", "nsg-dst")
    if rec["final"] != "Succeeded":
        raise RuntimeError(f"T7-src: dst back to nsg-dst {rec['final']} {rec.get('error')}")
    res["source_side_src"] = t7_series("T7-src", "src")
    save("T7_subnet_nsg_swap", res)


# ---------------------------------------------------------------- T8

# The private endpoint pe-blob (blob of a storage account) listens on 443 only. NSG rules on a
# private endpoint ignore the source port, so the two ASGs are told apart by source IP:
# asg-pe1 admits 443 from vm-a's first IP, asg-pe2 from its second IP.
PE_PATH = f"{NET}/privateEndpoints/pe-blob"
PE_NSG = f"{NET}/networkSecurityGroups/nsg-pe"
PE_L1, PE_L2 = "443-from-src1", "443-from-src2"


def pe_rules(asg_rules):
    src1, src2 = CFG["srcIps"]
    if not asg_rules:
        return [rule("allow-443-from-src", 300, 443)]
    return [rule("pe1-443-from-src1", 300, 443, src=f"{src1}/32", dst_asgs=[asg_id("asg-pe1")]),
            rule("pe2-443-from-src2", 301, 443, src=f"{src2}/32", dst_asgs=[asg_id("asg-pe2")]),
            rule("deny-443", 4000, 443, access="Deny", src="*")]


def pe_set_asgs(asgs, path=PE_PATH):
    body = get(path)
    for k in ("etag", "id", "name", "type"):
        body.pop(k, None)
    body["properties"].pop("provisioningState", None)
    body["properties"]["applicationSecurityGroups"] = [{"id": asg_id(a)} for a in asgs]
    return put_and_wait(path, body)


def error_code(rec):
    return (rec.get("error") or {}).get("code")


def t8_private_endpoint_asg_swap():
    src1, src2 = CFG["srcIps"]
    pe_ip = CFG["peTarget"]
    PROBER.start([{"tgt": "pe", "ip": pe_ip, "label": PE_L1, "port": 443, "src": src1},
                  {"tgt": "pe", "ip": pe_ip, "label": PE_L2, "port": 443, "src": src2}])
    cur = get(PE_NSG)
    loc, tags = cur["location"], cur.get("tags", {})
    res = {}
    # 1. both source IPs reach the private endpoint while no ASG rule is involved
    put_and_wait(PE_NSG, {"location": loc, "tags": tags, "properties": {"securityRules": pe_rules(False)}})
    w = wait_stable({("pe", PE_L1): 1, ("pe", PE_L2): 1}, timeout=900)
    res["reachable_without_asg_rules_after_s"] = w
    if w is None:
        raise RuntimeError(f"private endpoint not reachable from both IPs: "
                           f"{PROBER.state('pe', PE_L1, 5.0)} {PROBER.state('pe', PE_L2, 5.0)}")
    # 2. the ASG rules, with the private endpoint in asg-pe1. A PE write needs the approval action
    #    on the linked storage account (T9); the prober's role on it may still be propagating.
    t_wait = now()
    rec = pe_set_asgs(["asg-pe1"])
    while error_code(rec) == "LinkedAuthorizationFailed" and now() - t_wait < 900:
        log("T8: approval right on the storage account not in effect yet, retry in 30 s")
        time.sleep(30)
        rec = pe_set_asgs(["asg-pe1"])
    res["baseline_pe_write"] = {"http": rec["http"], "final": rec["final"], "error": rec.get("error"),
                                "lro_s": round(rec["t_done"] - rec["t_sent"], 3),
                                "waited_for_role_s": round(now() - t_wait, 1)}
    if rec["final"] != "Succeeded":
        raise RuntimeError(f"private endpoint PUT {rec['final']} {rec.get('error')}")
    put_and_wait(PE_NSG, {"location": loc, "tags": tags, "properties": {"securityRules": pe_rules(True)}})
    w = wait_stable({("pe", PE_L1): 1, ("pe", PE_L2): 0}, timeout=900)
    res["asg_rules_in_effect_after_s"] = w
    if w is None:
        raise RuntimeError(f"ASG rules on the private endpoint never took effect: "
                           f"{PROBER.state('pe', PE_L1, 5.0)} {PROBER.state('pe', PE_L2, 5.0)}")
    save("T8_private_endpoint_asg_swap", res)
    ports = {"asg-pe1": (PE_L1, PE_L2), "asg-pe2": (PE_L2, PE_L1)}
    res["swap"] = flip_series("T8-pe", CFG.get("flips_swap", 30), ["asg-pe1", "asg-pe2"],
                              lambda s: pe_set_asgs([s]), lambda s: ports[s], targets=("pe",))
    save("T8_private_endpoint_asg_swap", res)


# ---------------------------------------------------------------- T9

def t9_private_endpoint_write_rights():
    """Which rights does a PE write that changes only its ASGs need? The prober holds Network
    Contributor on the resource group and no role on the storage account stpf…, which the three
    private endpoints link to: one auto-approved, one manual and approved by run.py, one manual
    and still pending."""
    out = {}
    for pe in ("pe-auto2", "pe-manual2", "pe-pending2"):
        path = f"{NET}/privateEndpoints/{pe}"
        body = get(path)
        props = body["properties"]
        kind = "auto" if props.get("privateLinkServiceConnections") else "manual"
        conns = props.get("privateLinkServiceConnections") or props.get("manualPrivateLinkServiceConnections") or []
        state = [((c.get("properties") or {}).get("privateLinkServiceConnectionState") or {}).get("status")
                 for c in conns]
        rec = pe_set_asgs(["asg-pe2"], path)
        r = {"connection": kind, "state_before": state, "http": rec["http"], "final": rec["final"],
             "error_code": error_code(rec), "error": rec.get("error"),
             "lro_s": round(rec["t_done"] - rec["t_sent"], 3)}
        if rec["final"] == "Succeeded":
            r["asgs_after"] = [a["id"].rsplit("/", 1)[1]
                               for a in get(path)["properties"].get("applicationSecurityGroups") or []]
        out[pe] = r
        log(f"T9 {pe}: {json.dumps(r)[:500]}")
    save("T9_private_endpoint_write_rights", out)


# ---------------------------------------------------------------- main

def main():
    upload("status.json", json.dumps({"started": now()}))
    try:
        log("waiting for role assignment")
        wait_for_access()
        for name, fn in (("T1", t1_priorities), ("T2", t2_nsg_as_a_whole),
                         ("T3", t3_failed_put), ("T5", t5_nic_asg_as_a_whole),
                         ("T7", t7_subnet_nsg_swap), ("T9", t9_private_endpoint_write_rights),
                         ("T8", t8_private_endpoint_asg_swap)):
            if name not in CFG.get("tests", ["T1", "T2", "T3", "T5"]):
                continue
            log(f"start {name}")
            try:
                fn()
            except Exception:
                RESULTS["tests"].setdefault(name + "_error", traceback.format_exc())
                log(traceback.format_exc())
    finally:
        PROBER.stop()
        upload("checker.log", "\n".join(LOG))
        upload("results.json", json.dumps(RESULTS, indent=1))
        upload("status.json", json.dumps({"finished": now(), "done": list(RESULTS["tests"])}))


if __name__ == "__main__":
    main()
