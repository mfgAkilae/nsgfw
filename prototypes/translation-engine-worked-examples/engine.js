// PROTOTYPE, throwaway. Translation engine for "Prototype: Translation engine worked examples" (issue 22).
// Pure module: no DOM. Loaded as a classic script (global `Engine`) by the page, and by run.mjs in node.
// Follows ADR 0004/0016 (placement), 0005 and issue 13 (priorities, split, names), 0006 (ASGs),
// 0017 (Extra prefixes, VNet bindings), 0011 (Import), 0018 (write order), 0010 (Data contract).
(function (root) {
  'use strict';

  const ENGINE_VERSION = '0.1.0-prototype';
  const RULES_LO = 120, RULES_HI = 4079;
  const LIMITS = { rules: 1994, prefixesPerSide: 6000, asgsPerNsg: 100, warnAt: 0.9,
    source: 'https://learn.microsoft.com/en-us/azure/azure-resource-manager/management/azure-subscription-service-limits (retrieved 2026-11-09), counted conservatively as in issue 13' };
  const DEFAULT_OPT = { splitFamilies: true, windowFill: 0.5, engineVersion: ENGINE_VERSION };

  // ---------- small helpers ----------
  const uniq = a => [...new Set(a)];
  const clone = x => JSON.parse(JSON.stringify(x));
  const cmpBig = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  function h6(s) { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16).padStart(8, '0').slice(0, 6); }

  // ---------- addresses ----------
  const pc = new Map();
  function ip4(s) { return s.split('.').reduce((a, o) => a * 256n + BigInt(+o), 0n); }
  function ip6(s) {
    const [h, t] = s.split('::'); const head = h ? h.split(':') : [], tail = t ? t.split(':') : [];
    const g = s.includes('::') ? head.concat(Array(8 - head.length - tail.length).fill('0'), tail) : head;
    return g.reduce((a, x) => a * 65536n + BigInt(parseInt(x || '0', 16)), 0n);
  }
  function P(s) {
    if (pc.has(s)) return pc.get(s);
    let r;
    if (s === '*') r = { any: true, text: '*' };
    else {
      const [ip, l] = s.split('/'); const fam = ip.includes(':') ? 6 : 4, bits = fam === 4 ? 32 : 128;
      const len = l === undefined ? bits : +l, v = fam === 4 ? ip4(ip) : ip6(ip), size = 1n << BigInt(bits - len);
      const lo = v - (v % size); r = { fam, lo, hi: lo + size - 1n, len, text: s };
    }
    pc.set(s, r); return r;
  }
  const famOfText = s => (s === '*' ? 0 : s.includes(':') ? 6 : 4);
  const contains = (a, b) => !!a.any || (!b.any && a.fam === b.fam && a.lo <= b.lo && b.hi <= a.hi);
  const overlaps = (a, b) => !!a.any || !!b.any || (a.fam === b.fam && a.lo <= b.hi && b.lo <= a.hi);
  const inP = (s, addr) => { const p = P(s); return !!p.any || (p.fam === addr.fam && p.lo <= addr.v && addr.v <= p.hi); };
  function covered(p, list) { // p inside the union of list (parsed prefixes)
    if (p.any) return list.some(q => q.any);
    const iv = list.filter(q => q.any || q.fam === p.fam).map(q => (q.any ? [0n, 1n << 129n] : [q.lo, q.hi])).sort((a, b) => cmpBig(a[0], b[0]));
    let cur = p.lo;
    for (const [lo, hi] of iv) { if (lo > cur) break; if (hi >= cur) cur = hi + 1n; if (cur > p.hi) return true; }
    return cur > p.hi;
  }
  function fmtAddr(a) {
    if (a.fam === 4) { const v = Number(a.v); return [24, 16, 8, 0].map(s => (v >>> s) & 255).join('.'); }
    const g = []; let v = a.v; for (let i = 0; i < 8; i++) { g.unshift((v & 0xffffn).toString(16)); v >>= 16n; }
    let best = [-1, 0]; for (let i = 0; i < 8;) { if (g[i] !== '0') { i++; continue; } let j = i; while (j < 8 && g[j] === '0') j++; if (j - i > best[1]) best = [i, j - i]; i = j; }
    if (best[1] < 2) return g.join(':');
    return (g.slice(0, best[0]).join(':') + '::' + g.slice(best[0] + best[1]).join(':'));
  }
  const PRIVATE = ['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', '100.64.0.0/10', 'fc00::/7', 'fe80::/10'];
  const isPrivate = a => PRIVATE.some(s => inP(s, a));
  function normPrefixes(list) { // drop duplicates and prefixes inside another prefix of the same list (issue 13, point 10)
    const u = uniq(list); if (u.includes('*')) return ['*'];
    const ps = u.map((s, i) => ({ p: P(s), i })).sort((x, y) => x.p.fam - y.p.fam || cmpBig(x.p.lo, y.p.lo) || cmpBig(y.p.hi, x.p.hi) || x.i - y.i);
    const keep = new Set(); let fam = null, maxHi = -1n; // CIDR ranges are nested or disjoint, so one sweep finds the contained ones
    for (const x of ps) { if (x.p.fam !== fam) { fam = x.p.fam; maxHi = -1n; } if (x.p.hi <= maxHi) continue; keep.add(x.i); maxHi = x.p.hi; }
    return u.filter((s, i) => keep.has(i));
  }
  function famOf(list) { const f = uniq(list.map(famOfText)); return f.length === 1 ? f[0] : 0; }

  // ---------- ports and services ----------
  function parsePorts(s) { if (s === '*') return [0, 65535]; const [a, b] = String(s).split('-'); return [+a, b === undefined ? +a : +b]; }
  function normPorts(list) {
    if (list.includes('*')) return ['*'];
    const r = list.map(parsePorts).sort((x, y) => x[0] - y[0]), out = [];
    for (const [a, b] of r) { const l = out[out.length - 1]; if (l && a <= l[1] + 1) l[1] = Math.max(l[1], b); else out.push([a, b]); }
    if (out.length === 1 && out[0][0] === 0 && out[0][1] === 65535) return ['*'];
    return out.map(([a, b]) => (a === b ? String(a) : a + '-' + b));
  }
  const PROTOS = ['Tcp', 'Udp', 'Icmp', 'Esp', 'Ah', '*'];
  function svcFlat(refs, inst) {
    const out = [];
    for (const r of refs) {
      if (r === 'any') { out.push({ proto: '*', ports: '*' }); continue; }
      const s = inst.services[r]; if (!s) throw new Error('unknown service ' + r);
      if (s.kind === 'group') out.push(...svcFlat(s.members, inst)); else out.push({ proto: s.proto, ports: s.ports || '*' });
    }
    return out;
  }
  function protoGroups(refs, inst) { // one protocol group per protocol, ports merged (issue 13, point 8)
    const f = svcFlat(refs, inst);
    if (f.some(x => x.proto === '*')) return [{ proto: '*', ports: ['*'] }];
    const by = {}; f.forEach(x => (by[x.proto] = by[x.proto] || []).push(x.ports));
    return PROTOS.filter(p => by[p]).map(p => ({ proto: p, ports: p === 'Tcp' || p === 'Udp' ? normPorts(by[p]) : ['*'] }));
  }

  // ---------- instance helpers ----------
  const isZone = (inst, id) => !!inst.zones[id] && inst.zones[id].state === 'managed';
  const zoneIds = inst => Object.keys(inst.zones).filter(id => isZone(inst, id));
  const nsgZoneIds = inst => Object.keys(inst.zones); // every zone record has an NSG (managed, retired or legacy)
  const zoneAddrs = (inst, id) => { const z = inst.zones[id]; return z.prefixes.concat(z.state === 'managed' ? z.extra || [] : []); };
  const nsgName = (inst, id) => inst.zones[id].nsg || `nsg-${inst.zones[id].vnet}-${id}`;
  const envOf = (inst, vnet) => inst.envs[inst.vnets[vnet].env];
  const membersOf = (inst, id) => (inst.objects[id].members || []).filter(n => inst.nics[n]);
  function asgName(inst, id, vnet) {
    const o = inst.objects[id];
    if (o.kind === 'extasg') return o.asgName;
    if (o.adopted && o.adopted[vnet]) return o.adopted[vnet];
    return (envOf(inst, vnet).asgPattern || 'asg-{object}-{vnet}').replace('{object}', o.name).replace('{vnet}', vnet);
  }
  function refLabel(inst, r) {
    if (r === 'any') return 'any';
    if (r.startsWith('zone:')) return 'Zone ' + r.slice(5);
    const o = inst.objects[r]; return o ? o.name : r;
  }
  function svcLabel(inst, r) { if (r === 'any') return 'any'; const s = inst.services[r]; return s ? s.name || r : r; }
  function flat(refs, inst) {
    const out = [];
    for (const r of refs) {
      if (r !== 'any' && !r.startsWith('zone:') && inst.objects[r] && inst.objects[r].kind === 'group') out.push(...flat(inst.objects[r].members, inst));
      else out.push(r);
    }
    return uniq(out);
  }

  // ---------- Coverage (ADR 0004, 0006, 0017) ----------
  function coverage(ref, inst) {
    if (ref === 'any') return zoneIds(inst);
    if (ref.startsWith('zone:')) { const z = ref.slice(5); return isZone(inst, z) ? [z] : []; }
    const o = inst.objects[ref]; if (!o) throw new Error('unknown object ' + ref);
    switch (o.kind) {
      case 'host': case 'cidr': {
        const p = P(o.value);
        return zoneIds(inst).filter(z => (!o.bind || o.bind.includes(inst.zones[z].vnet)) && zoneAddrs(inst, z).some(q => overlaps(p, P(q))));
      }
      case 'vnet': return zoneIds(inst).filter(z => inst.zones[z].vnet === o.vnet);
      case 'asg': case 'extasg': return uniq(membersOf(inst, ref).map(n => inst.nics[n].subnet).filter(s => isZone(inst, s)));
      case 'group': return uniq(o.members.flatMap(m => coverage(m, inst)));
      default: return []; // service tag, subnet that is not a Zone
    }
  }
  const covList = (refs, inst) => uniq(refs.flatMap(r => coverage(r, inst)));

  // Addresses an object stands for, as far as the engine knows them (null = unknown, e.g. a service tag)
  function refPrefixes(r, inst) {
    if (r === 'any') return ['*'];
    if (r.startsWith('zone:')) return zoneAddrs(inst, r.slice(5));
    const o = inst.objects[r];
    switch (o.kind) {
      case 'host': case 'cidr': return [o.value];
      case 'subnet': return inst.subnets[o.subnet].prefixes;
      case 'vnet': return inst.vnets[o.vnet].space;
      case 'asg': case 'extasg': return membersOf(inst, r).flatMap(n => inst.nics[n].ips);
      case 'group': { const parts = o.members.map(m => refPrefixes(m, inst)); return parts.some(p => p === null) ? null : parts.flat(); }
      default: return null;
    }
  }
  function allZonePrefixes(inst) { return zoneIds(inst).flatMap(z => zoneAddrs(inst, z)).map(P); }
  function insideZones(prefixes, inst) { if (!prefixes) return false; const zs = allZonePrefixes(inst); return prefixes.every(s => s !== '*' && covered(P(s), zs)); }
  function reachesOutsideZones(refs, inst) { return flat(refs, inst).some(r => { const p = refPrefixes(r, inst); return !p || !insideZones(p, inst); }); }

  // ---------- one side of an NSG rule: partitions (issue 13, point 8; ADR 0006) ----------
  function sideParts(refs, zid, own, inst, opt) {
    let fl = flat(refs, inst);
    if (own) fl = fl.filter(r => coverage(r, inst).includes(zid)); // own-side pruning (issue 13, point 9)
    const z = inst.zones[zid], zv = z.vnet, tf = envOf(inst, zv).mode === 'terraform';
    const pre = [], fb = [], tags = [], asgs = [];
    for (const r of fl) {
      if (r === 'any') { pre.push('*'); continue; }
      if (r.startsWith('zone:')) { pre.push(...zoneAddrs(inst, r.slice(5))); continue; }
      const o = inst.objects[r];
      if (o.kind === 'host' || o.kind === 'cidr') pre.push(o.value);
      else if (o.kind === 'subnet') pre.push(...inst.subnets[o.subnet].prefixes);
      else if (o.kind === 'vnet') pre.push(...inst.vnets[o.vnet].space);
      else if (o.kind === 'tag') tags.push(o.value);
      else if (o.kind === 'asg' || o.kind === 'extasg') {
        const mem = membersOf(inst, r), ips = ns => ns.flatMap(n => inst.nics[n].ips);
        const here = mem.filter(n => inst.nics[n].vnet === zv), away = mem.filter(n => inst.nics[n].vnet !== zv);
        if (z.kind === 'pgflex') {
          const use = own ? mem.filter(n => inst.nics[n].subnet === zid) : mem;
          if (use.length) fb.push({ obj: r, ips: ips(use), why: 'PostgreSQL flexible server takes no ASGs in NSG rules' });
          continue;
        }
        if (here.length) {
          asgs.push(asgName(inst, r, zv));
          if (tf && o.kind === 'asg') { const v6 = ips(here).filter(s => s.includes(':')); if (v6.length) fb.push({ obj: r, ips: v6, why: 'Terraform writes ASG membership on IPv4 IP configurations only' }); }
        }
        if (!own && away.length) fb.push({ obj: r, ips: ips(away), why: 'ASG members in other VNets' });
      }
    }
    const parts = [];
    const addPre = (list, id, extra) => {
      const n = normPrefixes(list); if (!n.length) return;
      if (opt.splitFamilies && !n.includes('*')) {
        const v4 = n.filter(s => !s.includes(':')), v6 = n.filter(s => s.includes(':'));
        if (v4.length) parts.push(Object.assign({ kind: 'prefixes', id: id + ':v4', fam: 4, prefixes: v4 }, extra));
        if (v6.length) parts.push(Object.assign({ kind: 'prefixes', id: id + ':v6', fam: 6, prefixes: v6 }, extra));
      } else parts.push(Object.assign({ kind: 'prefixes', id, fam: famOf(n), prefixes: n }, extra));
    };
    addPre(pre, 'prefixes', {});
    uniq(fb.map(f => f.obj)).forEach(obj => { const g = fb.filter(f => f.obj === obj); addPre(g.flatMap(f => f.ips), 'ips:' + obj, { fallback: obj, why: uniq(g.map(f => f.why)).join('; ') }); });
    uniq(tags).forEach(t => parts.push({ kind: 'tag', id: 'tag:' + t, fam: 0, tag: t }));
    const a = uniq(asgs); for (let i = 0; i < a.length; i += 10) parts.push({ kind: 'asgs', id: 'asgs:' + i / 10, fam: 0, asgs: a.slice(i, i + 10) });
    return parts;
  }

  // ---------- NSG rules of one Rule on one NSG and direction ----------
  function ruleNsgRules(rule, zid, dir, inst, opt) {
    const own = dir === 'in' ? rule.dst : rule.src, far = dir === 'in' ? rule.src : rule.dst;
    const ownP = sideParts(own, zid, true, inst, opt), farP = sideParts(far, zid, false, inst, opt);
    const srcP = dir === 'in' ? farP : ownP, dstP = dir === 'in' ? ownP : farP;
    const out = [];
    for (const pg of protoGroups(rule.svc, inst)) for (const s of srcP) for (const d of dstP) {
      if (s.fam && d.fam && s.fam !== d.fam) continue;
      const key = [pg.proto, s.id, d.id].join('|');
      out.push({ name: `nsgfw-r${rule.id}-${dir}-${h6(key)}`, key, ruleId: rule.id, dir, access: rule.action === 'deny' ? 'Deny' : 'Allow',
        proto: pg.proto, ports: pg.ports, src: s, dst: d, kind: 'rule', desc: `Rule ${rule.id}: ${rule.name}`.slice(0, 140) });
    }
    return out;
  }
  const pre = list => ({ kind: 'prefixes', id: 'p', fam: famOf(list), prefixes: list });
  const tag = t => ({ kind: 'tag', id: 'tag:' + t, fam: 0, tag: t });
  const ANY = pre(['*']);
  const fixed = (name, priority, dir, access, src, dst, kind, desc) => ({ name, priority, dir, access, proto: '*', ports: ['*'], src, dst, kind, desc });
  function azureDefaults(dir) {
    return dir === 'in'
      ? [fixed('AllowVnetInBound', 65000, 'in', 'Allow', tag('VirtualNetwork'), tag('VirtualNetwork'), 'azure'), fixed('AllowAzureLoadBalancerInBound', 65001, 'in', 'Allow', tag('AzureLoadBalancer'), ANY, 'azure'), fixed('DenyAllInBound', 65500, 'in', 'Deny', ANY, ANY, 'azure')]
      : [fixed('AllowVnetOutBound', 65000, 'out', 'Allow', tag('VirtualNetwork'), tag('VirtualNetwork'), 'azure'), fixed('AllowInternetOutBound', 65001, 'out', 'Allow', ANY, tag('Internet'), 'azure'), fixed('DenyAllOutBound', 65500, 'out', 'Deny', ANY, ANY, 'azure')];
  }
  function sidePrefixesKnown(side, inst) {
    if (side.kind === 'prefixes') return side.prefixes;
    if (side.kind === 'asgs') { const ips = []; for (const a of side.asgs) { const o = Object.keys(inst.objects).find(k => ['asg', 'extasg'].includes(inst.objects[k].kind) && membersOf(inst, k).some(n => asgName(inst, k, inst.nics[n].vnet) === a)); if (!o) return null; ips.push(...membersOf(inst, o).filter(n => asgName(inst, o, inst.nics[n].vnet) === a).flatMap(n => inst.nics[n].ips)); } return ips; }
    return null;
  }
  function sideOverlap(a, b, inst) { const x = sidePrefixesKnown(a, inst), y = sidePrefixesKnown(b, inst); if (!x || !y) return true; return x.some(s => y.some(t => overlaps(P(s), P(t)))); }
  function portsOverlap(a, b) { if (a.includes('*') || b.includes('*')) return true; return a.some(p => b.some(q => { const [x1, x2] = parsePorts(p), [y1, y2] = parsePorts(q); return x1 <= y2 && y1 <= x2; })); }
  function nsgRuleOverlap(a, b, inst) { return (a.proto === '*' || b.proto === '*' || a.proto === b.proto) && portsOverlap(a.ports, b.ports) && sideOverlap(a.src, b.src, inst) && sideOverlap(a.dst, b.dst, inst); }

  // ---------- priorities (ADR 0005, issue 13 point 4) ----------
  function lis(c) { // c: [[i, p]] ordered by i; longest strictly increasing subsequence by p
    const tails = [], prev = new Array(c.length).fill(-1), idx = [];
    c.forEach(([, p], k) => {
      let lo = 0, hi = tails.length; while (lo < hi) { const m = (lo + hi) >> 1; if (c[tails[m]][1] < p) lo = m + 1; else hi = m; }
      if (lo > 0) prev[k] = tails[lo - 1]; tails[lo] = k; idx[lo] = k;
    });
    const out = []; let k = tails.length ? tails[tails.length - 1] : -1; while (k >= 0) { out.unshift(c[k]); k = prev[k]; } return out;
  }
  function spread(list, pr, a, b, lo, hi) { // spread list[a..b] in (lo, hi), blocks of one Rule consecutive
    const blocks = []; for (let i = a; i <= b; i++) { const l = blocks[blocks.length - 1]; if (l && list[l[0]].ruleId === list[i].ruleId) l.push(i); else blocks.push([i]); }
    const step = (hi - lo) / (blocks.length + 1); let prevEnd = lo, remaining = b - a + 1;
    blocks.forEach((bl, j) => {
      let start = Math.round(lo + step * (j + 1) - (bl.length - 1) / 2);
      start = Math.max(start, prevEnd + 1); start = Math.min(start, hi - remaining);
      bl.forEach((i, k) => (pr[i] = start + k)); prevEnd = start + bl.length - 1; remaining -= bl.length;
    });
  }
  function assignPriorities(list, prev, opt) {
    // Anchors: NSG rules whose order relative to their neighbours holds keep their stored priority (longest increasing run).
    // A new or moved NSG rule takes the middle of the gap. Without a free number, a window of priorities grows around
    // the spot until it is at most half occupied, and only that window is spread evenly.
    const n = list.length, pr = new Array(n).fill(null), windows = [];
    const cand = []; list.forEach((r, i) => { const p = prev && prev.get(r.name); if (p !== undefined && p >= RULES_LO && p <= RULES_HI) cand.push([i, p]); });
    lis(cand).forEach(([i, p]) => (pr[i] = p));
    let i = 0;
    while (i < n) {
      if (pr[i] !== null) { i++; continue; }
      const a = i; while (i < n && pr[i] === null) i++; const b = i - 1;
      const lo = a > 0 ? pr[a - 1] : RULES_LO - 1, hi = b < n - 1 ? pr[b + 1] : RULES_HI + 1;
      if (b - a + 1 <= hi - lo - 1) { spread(list, pr, a, b, lo, hi); continue; }
      const c = (lo + hi) / 2; let r = Math.max(1, Math.ceil((hi - lo) / 2));
      for (;;) {
        const L = Math.max(RULES_LO, Math.floor(c - r)), H = Math.min(RULES_HI, Math.ceil(c + r)), whole = L === RULES_LO && H === RULES_HI;
        let i0 = a; while (i0 > 0 && pr[i0 - 1] !== null && pr[i0 - 1] >= L) i0--;
        let i1 = b; while (i1 + 1 < n && (pr[i1 + 1] === null || pr[i1 + 1] <= H)) i1++;
        const count = i1 - i0 + 1, size = H - L + 1;
        if (count <= opt.windowFill * size || (whole && count <= size)) {
          const before = pr.slice(i0, i1 + 1);
          for (let k = i0; k <= i1; k++) pr[k] = null;
          spread(list, pr, i0, i1, L - 1, H + 1);
          windows.push({ dir: list[0].dir, from: L, to: H, count, renumbered: list.slice(i0, i1 + 1).filter((x, k) => before[k] !== null && before[k] !== pr[i0 + k]).map(x => x.name) });
          i = i1 + 1; break;
        }
        if (whole) throw new Error('Rules band full: ' + count + ' NSG rules');
        r *= 2;
      }
    }
    list.forEach((x, k) => (x.priority = pr[k]));
    return windows;
  }

  // ---------- translate one Managed NSG ----------
  function legacySide(v) {
    const l = Array.isArray(v) ? v : [v];
    if (l.length === 1 && /^[A-Za-z]/.test(l[0])) return tag(l[0]);
    return pre(l);
  }
  function legacyRules(list, dir) {
    return list.map(l => ({ name: l.name, priority: l.priority, dir, access: l.access, proto: l.proto || '*', ports: [].concat(l.ports || '*'), src: legacySide(l.src), dst: legacySide(l.dst), kind: 'legacy', desc: l.desc || '' }));
  }
  function translateZone(inst, zid, opt, prevNsg, cov) {
    const z = inst.zones[zid], res = { zone: zid, name: nsgName(inst, zid), state: z.state, kind: z.kind || 'normal', in: [], out: [], dropped: [], windows: [] };
    if (z.state === 'legacy') { res.in = legacyRules(z.legacy.in, 'in'); res.out = legacyRules(z.legacy.out, 'out'); return res; }
    if (z.state === 'none') return res; // subnet without NSG: only Azure's defaults apply (used as Deployed state)
    const appgw = z.kind === 'appgw', dual = z.prefixes.some(s => s.includes(':'));
    const plat = [fixed('nsgfw-platform-lb', 100, 'in', 'Allow', tag('AzureLoadBalancer'), ANY, 'platform', 'Platform exception: Azure Load Balancer probes')];
    if (dual) plat.push(fixed('nsgfw-platform-lb-v6', 101, 'in', 'Allow', pre(['fe80::1234:5678:9abc']), ANY, 'platform', 'Platform exception: IPv6 probe source'));
    const denyIn = fixed('nsgfw-denyall-in', 4096, 'in', 'Deny', ANY, ANY, 'denyall', 'Deny-all rule');
    const denyOut = fixed('nsgfw-denyall-out', 4096, 'out', 'Deny', ANY, ANY, 'denyall', 'Deny-all rule');
    if (z.state === 'retired') { res.in = plat.concat(denyIn); res.out = appgw ? [] : [denyOut]; return res; }
    let inR = [], outR = [];
    for (const r of inst.rules) {
      if (r.enabled === false) continue;
      if (cov[r.id].dst.includes(zid)) inR.push(...ruleNsgRules(r, zid, 'in', inst, opt));
      if (cov[r.id].src.includes(zid)) outR.push(...ruleNsgRules(r, zid, 'out', inst, opt));
    }
    if (z.posture === 'dest' && !appgw) { // ADR 0016: leave out outbound NSG rules without effect, bottom-up
      const internal = inst.internal.map(P), kept = [];
      for (let i = outR.length - 1; i >= 0; i--) {
        const n = outR[i], known = sidePrefixesKnown(n.dst, inst);
        if (n.access === 'Deny' && known && insideZones(known, inst)) { res.dropped.unshift({ rule: n, why: 'deny whose destination lies entirely inside Zones: the same deny lands inbound there' }); continue; }
        if (n.access === 'Allow' && known && known.every(s => s !== '*' && covered(P(s), internal)) && !kept.some(k => k.access === 'Deny' && nsgRuleOverlap(k, n, inst))) {
          res.dropped.unshift({ rule: n, why: 'allow whose destination lies inside the Internal address space: the egress allow already lets it out' }); continue;
        }
        kept.unshift(n);
      }
      outR = kept;
    }
    const prevMap = d => new Map(prevNsg ? prevNsg[d].filter(x => x.kind === 'rule').map(x => [x.name, x.priority]) : []);
    res.windows = res.windows.concat(assignPriorities(inR, prevMap('in'), opt), assignPriorities(outR, prevMap('out'), opt));
    const addrs = zoneAddrs(inst, zid), v4 = addrs.filter(s => !s.includes(':')), v6 = addrs.filter(s => s.includes(':'));
    const intra = d => [].concat(v4.length ? [fixed(`nsgfw-intrazone-${d}-v4`, 4080, d, 'Allow', pre(v4), pre(v4), 'intra', 'Intra-zone default')] : [], v6.length ? [fixed(`nsgfw-intrazone-${d}-v6`, 4081, d, 'Allow', pre(v6), pre(v6), 'intra', 'Intra-zone default')] : []);
    const inh = z.inherit || {}, inhIn = [], inhOut = [];
    if (inh.inVNet) inhIn.push(fixed('nsgfw-inherit-in-vnet', 4090, 'in', 'Allow', tag('VirtualNetwork'), tag('VirtualNetwork'), 'inherited', 'Inherited default: inbound from VirtualNetwork'));
    if (inh.outVNet) inhOut.push(fixed('nsgfw-inherit-out-vnet', 4090, 'out', 'Allow', tag('VirtualNetwork'), tag('VirtualNetwork'), 'inherited', 'Inherited default: outbound to VirtualNetwork'));
    if (inh.outInternet) inhOut.push(fixed('nsgfw-inherit-out-internet', 4091, 'out', 'Allow', ANY, tag('Internet'), 'inherited', 'Inherited default: outbound to Internet'));
    const egress = [];
    if (z.posture === 'dest' && !appgw) {
      const i4 = inst.internal.filter(s => !s.includes(':')), i6 = inst.internal.filter(s => s.includes(':'));
      if (i4.length) egress.push(fixed('nsgfw-egress-internal-v4', 4094, 'out', 'Allow', ANY, pre(i4), 'egress', 'Egress posture destination-enforced: Internal address space'));
      if (i6.length) egress.push(fixed('nsgfw-egress-internal-v6', 4095, 'out', 'Allow', ANY, pre(i6), 'egress', 'Egress posture destination-enforced: Internal address space'));
    }
    res.in = plat.concat(inR, intra('in'), inhIn, [denyIn]);
    res.out = outR.concat(intra('out'), inhOut, egress, appgw ? [] : [denyOut]);
    return res;
  }

  // ---------- Managed ASGs and membership ----------
  function managedAsgs(inst) {
    const out = {};
    for (const [id, o] of Object.entries(inst.objects)) if (o.kind === 'asg') for (const n of membersOf(inst, id)) {
      const v = inst.nics[n].vnet, name = asgName(inst, id, v);
      (out[name] = out[name] || { name, object: id, vnet: v, env: inst.vnets[v].env, members: [] }).members.push(n);
    }
    return out;
  }
  function nicAsgs(inst) { // tool-written memberships per network interface
    const out = {}; Object.values(managedAsgs(inst)).forEach(a => a.members.forEach(n => (out[n] = out[n] || []).push(a.name)));
    Object.keys(out).forEach(n => out[n].sort()); return out;
  }
  function membership(inst) { // ASG name -> addresses of its members (managed and unmanaged ASGs)
    const m = {};
    for (const [id, o] of Object.entries(inst.objects)) if (o.kind === 'asg' || o.kind === 'extasg') for (const n of membersOf(inst, id)) {
      const name = asgName(inst, id, inst.nics[n].vnet); (m[name] = m[name] || []).push(...inst.nics[n].ips);
    }
    return m;
  }

  // ---------- translate the whole Rule base ----------
  function translate(inst, o) {
    const opt = Object.assign({}, DEFAULT_OPT, o || {}), prev = opt.prev || null;
    const cov = {}; inst.rules.forEach(r => (cov[r.id] = { src: covList(r.src, inst), dst: covList(r.dst, inst) }));
    const nsgs = {};
    for (const zid of nsgZoneIds(inst)) nsgs[zid] = translateZone(inst, zid, opt, prev && prev.nsgs[zid], cov);
    const cost = {}, noEffect = [];
    for (const r of inst.rules) {
      const c = { nsgs: [], nsgRules: 0 };
      for (const [zid, n] of Object.entries(nsgs)) { const k = n.in.concat(n.out).filter(x => x.ruleId === r.id).length; if (k) { c.nsgs.push(zid); c.nsgRules += k; } }
      cost[r.id] = c; if (r.enabled !== false && !c.nsgRules) noEffect.push(r.id);
    }
    const limits = {}, errors = [], warnings = [];
    for (const [zid, n] of Object.entries(nsgs)) {
      const all = n.in.concat(n.out), sum = side => all.reduce((a, x) => a + (x[side].kind === 'prefixes' ? x[side].prefixes.length : 0), 0);
      const L = { rules: all.length, srcPrefixes: sum('src'), dstPrefixes: sum('dst'), asgs: uniq(all.flatMap(x => [x.src, x.dst]).filter(s => s.kind === 'asgs').flatMap(s => s.asgs)).length };
      limits[zid] = L;
      [['rules', 'NSG rules', LIMITS.rules], ['srcPrefixes', 'source prefixes', LIMITS.prefixesPerSide], ['dstPrefixes', 'destination prefixes', LIMITS.prefixesPerSide], ['asgs', 'ASGs', LIMITS.asgsPerNsg]].forEach(([k, label, max]) => {
        if (L[k] > max) {
          const top = Object.entries(all.reduce((a, x) => (x.ruleId && (a[x.ruleId] = (a[x.ruleId] || 0) + 1), a), {})).sort((a, b) => b[1] - a[1]).slice(0, 3);
          errors.push({ kind: 'limit', nsg: n.name, limit: label, count: L[k], max, top, text: `${n.name}: ${L[k]} ${label}, limit ${max}. Most NSG rules: ${top.map(([id, c]) => `Rule ${id} (${c})`).join(', ')}` });
        } else if (L[k] >= LIMITS.warnAt * max) warnings.push({ kind: 'limit', nsg: n.name, text: `${n.name}: ${L[k]} of ${max} ${label} (${Math.round((100 * L[k]) / max)} %)` });
      });
    }
    return { engineVersion: opt.engineVersion, opt: { splitFamilies: opt.splitFamilies }, nsgs, cost, noEffect, limits, errors, warnings, asgs: managedAsgs(inst), nicAsgs: nicAsgs(inst), cov };
  }

  // ---------- evaluation (for the Rule base check, Crossing flows and member steps) ----------
  function knownTag(t, addr, zid, inst) {
    const z = inst.zones[zid], vn = [z.vnet].concat(inst.vnets[z.vnet].peers || []);
    const inVnet = vn.some(v => inst.vnets[v].space.some(s => inP(s, addr)));
    if (t === 'VirtualNetwork') return inVnet ? true : null; // documented: own VNet and peered VNets are inside the tag
    if (t === 'Internet') return inVnet ? false : null;
    return isPrivate(addr) ? false : null; // Azure service tags hold public ranges
  }
  function portIn(ports, port) { if (port === null) return true; return ports.some(p => { const [a, b] = parsePorts(p); return a <= port && port <= b; }); }
  function sideMatch(side, addr, ctx, role) {
    if (side.kind === 'prefixes') return side.prefixes.some(s => inP(s, addr));
    if (side.kind === 'tag') { const k = ctx.known(side.tag, addr); if (k !== null) return k; const key = side.tag + '|' + role; ctx.seen.add(key); return !!ctx.cases[key]; }
    if (side.kind === 'asgs') { const key = addr.fam + ':' + addr.v; return side.asgs.some(a => (ctx.members[a] || []).some(s => { const p = P(s); return p.fam === addr.fam && p.lo === addr.v; })); }
    return false;
  }
  function firstMatch(list, f, ctx) {
    for (const r of list) {
      if (r.proto !== '*' && r.proto !== f.proto) continue;
      if (!portIn(r.ports, f.port)) continue;
      if (!sideMatch(r.src, f.s, ctx, 'src') || !sideMatch(r.dst, f.d, ctx, 'dst')) continue;
      return r;
    }
    return null;
  }
  const fullList = (nsg, dir) => (nsg ? nsg[dir].slice().sort((a, b) => a.priority - b.priority) : []).concat(azureDefaults(dir));
  // All tag cases for one NSG and one flow: the known facts decide where they can, both ways elsewhere (ADR 0018)
  function tagCases(lists, f, zid, inst, members) {
    const seen = new Set(), probe = { known: (t, a) => knownTag(t, a, zid, inst), seen, cases: {}, members };
    lists.forEach(l => firstMatchAll(l, f, probe));
    const keys = [...seen], out = [];
    for (let m = 0; m < 1 << keys.length; m++) { const c = {}; keys.forEach((k, i) => (c[k] = !!(m & (1 << i)))); out.push(c); }
    return out;
  }
  function firstMatchAll(list, f, ctx) { for (const r of list) { if (r.proto !== '*' && r.proto !== f.proto) continue; if (!portIn(r.ports, f.port)) continue; sideMatch(r.src, f.s, ctx, 'src'); sideMatch(r.dst, f.d, ctx, 'dst'); } }
  function verdict(list, f, zid, inst, members, cases) {
    const r = firstMatch(list, f, { known: (t, a) => knownTag(t, a, zid, inst), seen: new Set(), cases, members });
    return { ok: !r || r.access === 'Allow', rule: r };
  }
  function cutsFrom(lists) { const c = []; lists.forEach(l => l.forEach(r => [r.src, r.dst].forEach(s => s.kind === 'prefixes' && s.prefixes.forEach(p => p !== '*' && c.push(p))))); return uniq(c); }
  function repsOf(prefixes, cuts, points) {
    const out = [];
    for (const t of uniq(prefixes)) {
      const p = P(t), cs = new Set([p.lo]);
      for (const c of cuts) { const q = P(c); if (q.fam !== p.fam) continue; if (q.lo > p.lo && q.lo <= p.hi) cs.add(q.lo); if (q.hi + 1n > p.lo && q.hi + 1n <= p.hi) cs.add(q.hi + 1n); }
      for (const s of points) { const a = P(s); if (a.fam === p.fam && a.lo >= p.lo && a.lo <= p.hi) { cs.add(a.lo); if (a.lo + 1n <= p.hi) cs.add(a.lo + 1n); } }
      const sorted = [...cs].sort(cmpBig);
      sorted.forEach((v, k) => { const end = k + 1 < sorted.length ? sorted[k + 1] - 1n : p.hi; out.push({ fam: p.fam, v: end > v ? v + 1n : v }); });
    }
    const seen = new Set(); return out.filter(a => { const k = a.fam + ':' + a.v; if (seen.has(k)) return false; seen.add(k); return true; });
  }
  function portReps(lists) {
    const cuts = new Set([1]);
    lists.forEach(l => l.forEach(r => (r.proto === 'Tcp' || r.proto === 'Udp' || r.proto === '*') && r.ports.forEach(p => { if (p === '*') return; const [a, b] = parsePorts(p); cuts.add(a); if (b < 65535) cuts.add(b + 1); })));
    const ps = [...cuts].sort((a, b) => a - b), out = [];
    ['Tcp', 'Udp'].forEach(proto => ps.forEach(port => out.push({ proto, port })));
    out.push({ proto: 'Icmp', port: null });
    return out;
  }
  const allNicIps = inst => Object.values(inst.nics).flatMap(n => n.ips);

  // Crossing flows (ADR 0018): one NSG closes a flow between two Zones, the other opens it
  function crossings(dep, tgt, membersMid) {
    const zones = uniq(Object.keys(dep.out.nsgs).concat(Object.keys(tgt.out.nsgs)));
    const sig = n => JSON.stringify(n ? n.in.concat(n.out).map(r => [r.dir, r.priority, r.access, r.proto, r.ports, r.src, r.dst]) : null);
    const changed = zones.filter(z => sig(dep.out.nsgs[z]) !== sig(tgt.out.nsgs[z]));
    const edges = {};
    const addrsOf = z => uniq([].concat(dep.inst.zones[z] ? zoneAddrs(dep.inst, z) : [], tgt.inst.zones[z] ? zoneAddrs(tgt.inst, z) : []));
    for (const A of changed) for (const B of changed) {
      if (A === B) continue;
      const Ao = fullList(dep.out.nsgs[A], 'out'), An = fullList(tgt.out.nsgs[A], 'out'), Bo = fullList(dep.out.nsgs[B], 'in'), Bn = fullList(tgt.out.nsgs[B], 'in');
      const lists = [Ao, An, Bo, Bn], cuts = cutsFrom(lists).concat(dep.inst.internal), pts = allNicIps(tgt.inst).concat(allNicIps(dep.inst));
      const S = repsOf(addrsOf(A), cuts, pts), D = repsOf(addrsOf(B), cuts, pts), ports = portReps(lists);
      const instA = tgt.inst.zones[A] ? tgt.inst : dep.inst, instB = tgt.inst.zones[B] ? tgt.inst : dep.inst;
      for (const s of S) for (const d of D) for (const pp of ports) {
        const f = { s, d, proto: pp.proto, port: pp.port };
        for (const ca of tagCases([Ao, An], f, A, instA, membersMid)) for (const cb of tagCases([Bo, Bn], f, B, instB, membersMid)) {
          const ao = verdict(Ao, f, A, instA, membersMid, ca), an = verdict(An, f, A, instA, membersMid, ca), bo = verdict(Bo, f, B, instB, membersMid, cb), bn = verdict(Bn, f, B, instB, membersMid, cb);
          let from = null, to = null, why;
          if (!ao.ok && an.ok && bo.ok && !bn.ok) { from = B; to = A; why = { closes: bn.rule, opens: an.rule }; }
          if (ao.ok && !an.ok && !bo.ok && bn.ok) { from = A; to = B; why = { closes: an.rule, opens: bn.rule }; }
          if (!from) continue;
          const key = from + '>' + to, e = edges[key] || (edges[key] = { from, to, count: 0, witness: null });
          e.count++;
          if (!e.witness) e.witness = { flow: `${fmtAddr(s)} (Zone ${A}) → ${fmtAddr(d)} (Zone ${B}) ${pp.proto}${pp.port === null ? '' : '/' + pp.port}`,
            cases: Object.entries(Object.assign({}, ca, cb)).map(([k, v]) => `${k.split('|')[0]} ${v ? 'contains' : 'does not contain'} the ${k.split('|')[1] === 'src' ? 'source' : 'destination'}`),
            closes: `${from === A ? 'outbound' : 'inbound'} ${why.closes ? why.closes.name : 'nothing (Azure default)'}`, opens: `${to === A ? 'outbound' : 'inbound'} ${why.opens ? why.opens.name : 'Azure default'}` };
        }
      }
    }
    return { changed, edges: Object.values(edges) };
  }

  // Verdict of a whole flow through the NSGs of a state (source Zone outbound, destination Zone inbound)
  function zoneOfAddr(inst, a) { return zoneIds(inst).concat(Object.keys(inst.zones).filter(z => !isZone(inst, z))).find(z => zoneAddrs(inst, z).some(s => inP(s, a))) || null; }
  function flowAllowed(inst, out, members, f, srcZone, dstZone) {
    const sz = srcZone !== undefined ? srcZone : zoneOfAddr(inst, f.s), dz = dstZone !== undefined ? dstZone : zoneOfAddr(inst, f.d);
    const lo = sz ? fullList(out.nsgs[sz], 'out') : null, li = dz ? fullList(out.nsgs[dz], 'in') : null;
    const cs = uniq([].concat(lo ? [[lo, sz]] : [], li ? [[li, dz]] : []).map(x => x));
    const caseSets = []; if (lo) caseSets.push(tagCases([lo], f, sz, inst, members)); if (li) caseSets.push(tagCases([li], f, dz, inst, members));
    const results = [];
    const combos = caseSets.length === 0 ? [[]] : caseSets.length === 1 ? caseSets[0].map(c => [c]) : caseSets[0].flatMap(a => caseSets[1].map(b => [a, b]));
    for (const c of combos) {
      let k = 0, ok = true;
      if (lo) ok = ok && verdict(lo, f, sz, inst, members, c[k++]).ok;
      if (li) ok = ok && verdict(li, f, dz, inst, members, c[k++]).ok;
      results.push(ok);
    }
    return results; // one verdict per tag case
  }

  // Flows into (in) or out of (out) one Zone whose verdict on its NSG changes between two contents (Import notes)
  function zoneFlowChanges(oldNsg, newNsg, zid, inst, dir, max) {
    const Lo = fullList(oldNsg, dir), Ln = fullList(newNsg, dir), cuts = cutsFrom([Lo, Ln]).concat(inst.internal);
    const own = repsOf(zoneAddrs(inst, zid), cuts, []);
    const far = repsOf(uniq(cuts.concat(Object.keys(inst.zones).flatMap(z => zoneAddrs(inst, z)), ['198.51.100.0/24'])), cuts, []).filter(a => !zoneAddrs(inst, zid).some(s => inP(s, a)));
    const ports = portReps([Lo, Ln]), opens = {}, closes = {};
    for (const o of own) for (const x of far) { if (o.fam !== x.fam) continue; for (const pp of ports) {
      const f = dir === 'in' ? { s: x, d: o, proto: pp.proto, port: pp.port } : { s: o, d: x, proto: pp.proto, port: pp.port };
      const pair = `${fmtAddr(f.s)} → ${fmtAddr(f.d)}`, svc = pp.proto + (pp.port === null ? '' : '/' + pp.port);
      for (const c of tagCases([Lo, Ln], f, zid, inst, {})) {
        const a = verdict(Lo, f, zid, inst, {}, c), b = verdict(Ln, f, zid, inst, {}, c), t = !a.ok && b.ok ? opens : a.ok && !b.ok ? closes : null;
        if (t) { const e = t[pair] || (t[pair] = { flow: pair, svcs: [], by: b.rule ? b.rule.name : '' }); e.svcs.push(svc); break; }
      } } }
    const fmt = t => Object.values(t).map(e => ({ flow: `${e.flow} ${e.svcs.length >= ports.length ? 'every port' : e.svcs.slice(0, 3).join(', ') + (e.svcs.length > 3 ? ' …' : '')}`, by: e.by }));
    const op = fmt(opens), cl = fmt(closes);
    return { opens: op.slice(0, max || 8), closes: cl.slice(0, max || 8), openCount: op.length, closeCount: cl.length };
  }
  function rulesUsing(inst, objId) {
    return inst.rules.filter(r => flat(r.src.concat(r.dst), inst).includes(objId) || r.src.concat(r.dst).includes(objId));
  }

  // ---------- ASG member changes (ADR 0018: three steps) ----------
  function memberChanges(depInst, tgtInst) {
    const a = nicAsgs(depInst), b = nicAsgs(tgtInst);
    // a deleted network interface needs no write
    return uniq(Object.keys(a).concat(Object.keys(b))).filter(n => tgtInst.nics[n] && JSON.stringify(a[n] || []) !== JSON.stringify(b[n] || [])).map(n => ({ nic: n, before: a[n] || [], after: b[n] || [] }));
  }
  function withNic(members, inst, nicId, asgsBefore, asgsAfter) {
    const m = clone(members), ips = (inst.nics[nicId] || { ips: [] }).ips;
    asgsBefore.forEach(a => (m[a] = (m[a] || []).filter(s => !ips.includes(s))));
    asgsAfter.forEach(a => (m[a] = uniq((m[a] || []).concat(ips))));
    return m;
  }
  function memberEffect(inst, out, before, after, nicId, otherInst) {
    const nic = inst.nics[nicId] || otherInst.nics[nicId]; const opens = [], closes = [];
    const lists = Object.values(out.nsgs).flatMap(n => [fullList(n, 'in'), fullList(n, 'out')]);
    const cuts = cutsFrom(lists), pts = allNicIps(inst);
    const others = repsOf(uniq(Object.keys(inst.zones).flatMap(z => zoneAddrs(inst, z)).concat(cuts)), cuts, pts).concat([{ fam: 4, v: ip4('198.51.100.1') }]);
    const ports = portReps(lists);
    for (const ipS of nic.ips) { const x = { fam: P(ipS).fam, v: P(ipS).lo };
      for (const y of others) { if (y.fam !== x.fam || y.v === x.v) continue;
        for (const pp of ports) for (const [s, d] of [[x, y], [y, x]]) {
          const f = { s, d, proto: pp.proto, port: pp.port };
          const sz = s === x ? (isZone(inst, nic.subnet) ? nic.subnet : null) : undefined, dz = d === x ? (isZone(inst, nic.subnet) ? nic.subnet : null) : undefined;
          const b = flowAllowed(inst, out, before, f, sz, dz), a = flowAllowed(inst, out, after, f, sz, dz);
          const fl = `${fmtAddr(s)} → ${fmtAddr(d)} ${pp.proto}${pp.port === null ? '' : '/' + pp.port}`;
          if (b.some((v, i) => !v && a[i])) opens.push(fl);
          if (b.some((v, i) => v && !a[i])) closes.push(fl);
        } } }
    return { opens: uniq(opens), closes: uniq(closes) };
  }

  // ---------- Deployment plan ----------
  function plan(dep, tgt) {
    const writes = [], edges = [], errors = [];
    const W = (id, kind, label, extra) => writes.push(Object.assign({ id, kind, label }, extra || {}));
    const dA = dep.out.asgs, tA = tgt.out.asgs;
    Object.keys(tA).filter(n => !dA[n]).forEach(n => W('asg+:' + n, 'asg-create', `create Managed ASG ${n}`, { env: tA[n].env }));
    const changes = memberChanges(dep.inst, tgt.inst);
    changes.forEach(c => W('nic:' + c.nic, 'member', `network interface ${(tgt.inst.nics[c.nic] || dep.inst.nics[c.nic]).name}: ASGs ${c.before.join(', ') || '—'} → ${c.after.join(', ') || '—'}`, { change: c, env: tgt.inst.vnets[(tgt.inst.nics[c.nic] || dep.inst.nics[c.nic]).vnet].env }));
    const sig = n => JSON.stringify(n ? n.in.concat(n.out).map(r => [r.name, r.dir, r.priority, r.access, r.proto, r.ports, r.src, r.dst]) : null);
    const zones = uniq(Object.keys(dep.out.nsgs).concat(Object.keys(tgt.out.nsgs)));
    const nsgW = zones.filter(z => tgt.out.nsgs[z] && sig(dep.out.nsgs[z]) !== sig(tgt.out.nsgs[z]));
    nsgW.forEach(z => { const st = dep.inst.zones[z] ? dep.inst.zones[z].state : 'new'; W('nsg:' + z, 'nsg', `write NSG ${tgt.out.nsgs[z].name}${st === 'legacy' ? ' (adopted in place, legacy content until now)' : st === 'none' || st === 'new' ? ' (new)' : ''}`, { zone: z, env: tgt.inst.vnets[tgt.inst.zones[z].vnet].env }); });
    zones.filter(z => tgt.inst.zones[z] && (!dep.inst.zones[z] || dep.inst.zones[z].state === 'none')).forEach(z => { W('assoc:' + z, 'assoc', `associate ${tgt.out.nsgs[z].name} with subnet ${z}`, { env: tgt.inst.vnets[tgt.inst.zones[z].vnet].env }); edges.push({ from: 'nsg:' + z, to: 'assoc:' + z, kind: 'dep', why: 'association after its NSG' }); });
    Object.keys(dA).filter(n => !tA[n]).forEach(n => W('asg-:' + n, 'asg-delete', `delete Managed ASG ${n}`, { env: dA[n].env }));
    const refs = (out, z, name) => out.nsgs[z] && out.nsgs[z].in.concat(out.nsgs[z].out).some(r => [r.src, r.dst].some(s => s.kind === 'asgs' && s.asgs.includes(name)));
    writes.filter(w => w.kind === 'asg-create').forEach(w => { const n = w.id.slice(5);
      writes.filter(x => x.kind === 'member' && x.change.after.includes(n)).forEach(x => edges.push({ from: w.id, to: x.id, kind: 'dep', why: 'ASG exists before a member joins' }));
      nsgW.filter(z => refs(tgt.out, z, n)).forEach(z => edges.push({ from: w.id, to: 'nsg:' + z, kind: 'dep', why: 'ASG exists before an NSG rule references it' })); });
    writes.filter(w => w.kind === 'asg-delete').forEach(w => { const n = w.id.slice(5);
      writes.filter(x => x.kind === 'member' && x.change.before.includes(n)).forEach(x => edges.push({ from: x.id, to: w.id, kind: 'dep', why: 'last member leaves before the ASG is deleted' }));
      nsgW.filter(z => refs(dep.out, z, n)).forEach(z => edges.push({ from: 'nsg:' + z, to: w.id, kind: 'dep', why: 'no NSG rule references the ASG any more' })); });
    // member steps
    const memDep = membership(dep.inst), memTgt = membership(tgt.inst);
    const step1 = [], step3 = [];
    let mid = clone(memDep);
    changes.forEach(c => {
      const eOld = memberEffect(dep.inst, dep.out, memDep, withNic(memDep, tgt.inst.nics[c.nic] ? tgt.inst : dep.inst, c.nic, c.before, c.after), c.nic, tgt.inst);
      c.effectOld = eOld; if (!eOld.opens.length) { step1.push(c.nic); c.effect = eOld; c.step = 1; }
    });
    step1.forEach(n => { const c = changes.find(x => x.nic === n); mid = withNic(mid, tgt.inst.nics[n] ? tgt.inst : dep.inst, n, c.before, c.after); });
    changes.filter(c => !c.step).forEach(c => {
      const eNew = memberEffect(tgt.inst, tgt.out, withNic(memTgt, tgt.inst, c.nic, c.after, c.before), memTgt, c.nic, dep.inst);
      c.effect = eNew;
      if (!eNew.closes.length) { step3.push(c.nic); c.step = 3; }
      else errors.push({ kind: 'member', text: `Member change on ${tgt.inst.nics[c.nic].name} neither only closes under the Deployed NSG contents nor only opens under the target: it closes ${eNew.closes[0]} and opens ${c.effectOld.opens[0]}. Split the Change set.` });
    });
    step1.forEach(n => nsgW.forEach(z => edges.push({ from: 'nic:' + n, to: 'nsg:' + z, kind: 'step', why: 'member change that only closes goes first' })));
    step3.forEach(n => nsgW.forEach(z => edges.push({ from: 'nsg:' + z, to: 'nic:' + n, kind: 'step', why: 'member change that only opens goes last' })));
    // Crossing flows, against the members after step 1
    const cr = crossings(dep, tgt, mid);
    cr.edges.forEach(e => { if (nsgW.includes(e.from) || nsgW.includes(e.to)) edges.push({ from: 'nsg:' + e.from, to: 'nsg:' + e.to, kind: 'crossing', why: `Crossing flow, e.g. ${e.witness.flow}`, witness: e.witness, count: e.count }); });
    // cycles among crossing edges
    const cyc = findCycle(writes.map(w => w.id), edges.filter(e => e.kind === 'crossing'));
    if (cyc) errors.push({ kind: 'cycle', cycle: cyc, text: `The write order has a cycle: ${cyc.map(id => id.replace('nsg:', 'NSG of Zone ')).join(' → ')}. The Change set cannot be ordered; split it into two Commits.`, flows: edges.filter(e => e.kind === 'crossing' && cyc.includes(e.from) && cyc.includes(e.to)).map(e => e.witness.flow) });
    const levels = cyc ? null : layer(writes.map(w => w.id), edges);
    const prSteps = cyc ? null : layer(writes.map(w => w.id), edges.filter(e => e.kind !== 'dep'));
    return { writes, edges, errors, levels, prSteps, members: changes, mid };
  }
  function findCycle(nodes, edges) {
    const adj = {}; nodes.forEach(n => (adj[n] = [])); edges.forEach(e => adj[e.from] && adj[e.from].push(e.to));
    const color = {}, stack = [];
    function dfs(n) { color[n] = 1; stack.push(n); for (const m of adj[n] || []) { if (color[m] === 1) return stack.slice(stack.indexOf(m)).concat(m); if (!color[m]) { const c = dfs(m); if (c) return c; } } stack.pop(); color[n] = 2; return null; }
    for (const n of nodes) if (!color[n]) { const c = dfs(n); if (c) return c; }
    return null;
  }
  function layer(nodes, edges) {
    const indeg = {}; nodes.forEach(n => (indeg[n] = 0)); edges.forEach(e => indeg[e.to] !== undefined && indeg[e.from] !== undefined && indeg[e.to]++);
    const levels = []; let cur = nodes.filter(n => !indeg[n]); const done = new Set();
    while (cur.length) { levels.push(cur); cur.forEach(n => done.add(n)); const next = [];
      edges.forEach(e => { if (cur.includes(e.from) && indeg[e.to] !== undefined) { indeg[e.to]--; if (!indeg[e.to] && !done.has(e.to)) next.push(e.to); } });
      cur = uniq(next); }
    return levels;
  }
  function blocked(pl, failed) { // writes that wait because of failed writes (ADR 0018: only the ones with an edge from them)
    const out = new Set(), q = [...failed];
    while (q.length) { const n = q.shift(); pl.edges.filter(e => e.from === n).forEach(e => { if (!out.has(e.to)) { out.add(e.to); q.push(e.to); } }); }
    return [...out];
  }

  // ---------- Preview (diff of two outputs) ----------
  function sameContent(a, b) { return JSON.stringify([a.access, a.proto, a.ports, a.src, a.dst, a.desc]) === JSON.stringify([b.access, b.proto, b.ports, b.src, b.dst, b.desc]); }
  function preview(prev, out) {
    const res = [];
    for (const z of uniq(Object.keys(prev ? prev.nsgs : {}).concat(Object.keys(out.nsgs)))) {
      const a = prev && prev.nsgs[z], b = out.nsgs[z];
      const item = { zone: z, nsg: (b || a).name, added: [], removed: [], changed: [], renumbered: [], state: !a ? 'new NSG' : a.state !== b.state ? `${a.state} → ${b.state}` : '' };
      for (const d of ['in', 'out']) {
        const A = new Map((a ? a[d] : []).map(r => [r.name, r])), B = new Map((b ? b[d] : []).map(r => [r.name, r]));
        B.forEach((r, n) => { const o = A.get(n); if (!o) item.added.push(r); else if (!sameContent(o, r)) item.changed.push({ before: o, after: r }); else if (o.priority !== r.priority) item.renumbered.push({ before: o, after: r }); });
        A.forEach((r, n) => { if (!B.has(n)) item.removed.push(r); });
      }
      if (item.added.length || item.removed.length || item.changed.length || item.renumbered.length || item.state) res.push(item);
    }
    return res;
  }

  // ---------- Affected Zones (ADR 0008 as amended by ADR 0016) ----------
  function affectedZones(prevInst, inst) {
    const res = {}, add = (z, why) => (res[z] = res[z] || []).push(why);
    const objChanged = id => JSON.stringify(prevInst.objects[id]) !== JSON.stringify(inst.objects[id]);
    const zoneChanged = id => JSON.stringify(prevInst.zones[id]) !== JSON.stringify(inst.zones[id]);
    const refsChanged = (refs, I) => flat(refs, I).some(r => r !== 'any' && (r.startsWith('zone:') ? zoneChanged(r.slice(5)) : objChanged(r))) || refs.some(r => r !== 'any' && !r.startsWith('zone:') && objChanged(r));
    const order = I => I.rules.map(r => r.id), po = order(prevInst), no = order(inst);
    const common = no.filter(id => po.includes(id)), stay = new Set(lis(common.map((id, i) => [i, po.indexOf(id)])).map(([i]) => common[i]));
    const ids = uniq(po.concat(no));
    for (const id of ids) {
      const r0 = prevInst.rules.find(r => r.id === id), r1 = inst.rules.find(r => r.id === id);
      const why = !r0 ? 'added' : !r1 ? 'removed' : JSON.stringify(r0) !== JSON.stringify(r1) ? 'edited' : !stay.has(id) ? 'moved' : refsChanged(r1.src.concat(r1.dst), inst) || refsChanged(r0.src.concat(r0.dst), prevInst) ? 'an Object or Zone it uses changed' : null;
      if (!why) continue;
      for (const [r, I, when] of [[r0, prevInst, 'before'], [r1, inst, 'after']]) {
        if (!r) continue;
        covList(r.dst, I).forEach(z => add(z, `Rule ${id} (${why}): destination, ${when}`));
        const outside = reachesOutsideZones(r.dst, I);
        covList(r.src, I).forEach(z => { if (outside) add(z, `Rule ${id} (${why}): source, ${when}; the destination reaches outside Zones`); else if (I.zones[z].posture === 'strict') add(z, `Rule ${id} (${why}): source with a strict Egress posture, ${when}`); });
      }
    }
    const a = nicAsgs(prevInst), b = nicAsgs(inst);
    uniq(Object.keys(a).concat(Object.keys(b))).forEach(n => { if (JSON.stringify(a[n] || []) === JSON.stringify(b[n] || [])) return; const nic = inst.nics[n] || prevInst.nics[n]; if (isZone(inst, nic.subnet) || isZone(prevInst, nic.subnet)) add(nic.subnet, `ASG member ${nic.name} added or removed`); });
    uniq(Object.keys(prevInst.zones).concat(Object.keys(inst.zones))).forEach(z => { if (zoneChanged(z)) add(z, 'the Zone itself is onboarded, removed or changed'); });
    Object.keys(res).forEach(z => (res[z] = uniq(res[z])));
    return res;
  }

  // ---------- Rebase order conflicts (ADR 0007 as amended) ----------
  function ruleOverlap(a, b, inst) {
    const sides = (x, y) => { const p = flat(x, inst).map(r => refPrefixes(r, inst)), q = flat(y, inst).map(r => refPrefixes(r, inst)); if (p.some(v => v === null) || q.some(v => v === null)) return true; return p.flat().some(s => q.flat().some(t => overlaps(P(s), P(t)))); };
    const sv = (x, y) => { const p = svcFlat(x, inst), q = svcFlat(y, inst); return p.some(m => q.some(n => (m.proto === '*' || n.proto === '*' || m.proto === n.proto) && portsOverlap([m.ports], [n.ports]))); };
    return sides(a.src, b.src) && sides(a.dst, b.dst) && sv(a.svc, b.svc);
  }
  function rebase(baseOrder, placed, latest, inst) {
    // placed: { id, above, below } as stored by the Change set; latest: Rule IDs of the latest Version
    const intended = baseOrder.slice(); intended.splice(intended.indexOf(placed.above) + 1, 0, placed.id);
    const reb = latest.slice(); const at = reb.includes(placed.above) ? reb.indexOf(placed.above) + 1 : reb.includes(placed.below) ? reb.indexOf(placed.below) : reb.length; reb.splice(at, 0, placed.id);
    const P0 = inst.rules.find(r => r.id === placed.id), conflicts = [], quiet = [];
    for (const q of inst.rules) {
      if (q.id === placed.id || !intended.includes(q.id) || !reb.includes(q.id)) continue;
      const before = intended.indexOf(q.id) < intended.indexOf(placed.id), after = reb.indexOf(q.id) < reb.indexOf(placed.id);
      if (before === after) continue;
      if (q.action !== P0.action && ruleOverlap(P0, q, inst)) conflicts.push(q.id); else quiet.push(q.id);
    }
    return { intended, rebased: reb, conflicts, quiet };
  }

  // ---------- Import (ADR 0011, issue 18) ----------
  function importNsg(inst, zid, legacy, o) {
    const opt = Object.assign({ bindings: 'none' }, o || {}), z = inst.zones[zid], zp = zoneAddrs(inst, zid).map(P);
    const notes = [], rules = [], newObjects = {}, newServices = {};
    const connected = [z.vnet].concat(inst.vnets[z.vnet].peers || []);
    const findObj = v => Object.keys(inst.objects).concat(Object.keys(newObjects)).find(k => { const x = inst.objects[k] || newObjects[k]; return (x.kind === 'host' || x.kind === 'cidr') && x.value === v && !x.bind; });
    function far(v, src) {
      if (v === '*') return 'any';
      if (/^[A-Za-z]/.test(v)) { const id = Object.keys(inst.objects).find(k => inst.objects[k].kind === 'tag' && inst.objects[k].value === v) || 'tag-' + v; if (!inst.objects[id]) newObjects[id] = { kind: 'tag', value: v, name: v }; if (v === 'VirtualNetwork') notes.push({ level: 'warning', text: `${src.name}: keeps the VirtualNetwork tag, which means different prefixes per NSG; it lands only on Zone ${zid}` }); return id; }
      const p = P(v), exact = zoneIds(inst).filter(k => zoneAddrs(inst, k).some(s => { const q = P(s); return q.fam === p.fam && q.lo === p.lo && q.hi === p.hi; }));
      const near = exact.filter(k => connected.includes(inst.zones[k].vnet));
      if (near.length === 1) return 'zone:' + near[0];
      const ex = findObj(v); if (ex) return ex;
      const sub = Object.keys(inst.subnets).find(k => inst.subnets[k].prefixes.includes(v)); if (sub) return 'sub-' + sub;
      const vn = Object.keys(inst.vnets).find(k => inst.vnets[k].space.length === 1 && inst.vnets[k].space[0] === v); if (vn) return 'vnet-' + vn;
      const id = (p.len === (p.fam === 4 ? 32 : 128) ? 'host-' : 'net-') + v.replace(/[/:.]/g, '_');
      const coveredVnets = uniq(zoneIds(inst).filter(k => zoneAddrs(inst, k).some(s => overlaps(P(s), p))).map(k => inst.zones[k].vnet));
      const unconnected = coveredVnets.filter(x => !connected.includes(x));
      const obj = { kind: p.len === (p.fam === 4 ? 32 : 128) ? 'host' : 'cidr', value: v, name: v };
      if (unconnected.length) {
        if (opt.bindings === 'connected') { obj.bind = connected.filter(x => inst.vnets[x]); notes.push({ level: 'info', text: `${src.name}: ${v} also matches Zones in VNets that ${z.vnet} is not connected to (${unconnected.join(', ')}); the new object is bound to ${obj.bind.join(', ')}` }); }
        else notes.push({ level: 'warning', text: `${src.name}: ${v} also matches Zones in VNets that ${z.vnet} is not connected to (${unconnected.join(', ')}); the new object covers them too` });
      }
      newObjects[id] = obj; return id;
    }
    function own(v, src) {
      if (v === '*' || v === 'VirtualNetwork') return ['zone:' + zid];
      if (/^[A-Za-z]/.test(v)) return [];
      const p = P(v);
      if (zp.some(q => contains(p, q))) return ['zone:' + zid];
      if (zp.some(q => contains(q, p))) { const id = findObj(v) || ('net-' + v.replace(/[/:.]/g, '_')); if (!inst.objects[id] && !newObjects[id]) newObjects[id] = { kind: p.len === 32 ? 'host' : 'cidr', value: v, name: v }; return [id]; }
      notes.push({ level: 'info', text: `${src.name}: ${v} is disjoint from Zone ${zid}; dropped` }); return [];
    }
    function svc(l) {
      const proto = l.proto || '*', ports = [].concat(l.ports || '*');
      if (proto === '*' && ports.includes('*')) return ['any'];
      const protos = proto === '*' ? ['Tcp', 'Udp'] : [proto];
      if (proto === '*') notes.push({ level: 'warning', text: `${l.name}: protocol * with ports ${ports.join(',')} is approximated as Tcp and Udp` });
      return protos.flatMap(pr => ports.map(pt => { const ex = Object.keys(inst.services).find(k => inst.services[k].proto === pr && String(inst.services[k].ports) === String(pt)); if (ex) return ex;
        const id = `${pr.toLowerCase()}-${pt}`; if (!inst.services[id]) newServices[id] = { proto: pr, ports: pt, name: `${pr.toLowerCase()}/${pt}` }; return id; }));
    }
    const flags = { inVNet: true, outVNet: true, outInternet: true };
    // an Azure default rule took effect unless a custom rule above it matches everything it matches
    const allSvc = l => (l.proto || '*') === '*' && [].concat(l.ports || '*').includes('*'), has = (v, xs) => [].concat(v).some(x => xs.includes(x));
    for (const d of ['in', 'out']) {
      const list = legacy[d].slice().sort((a, b) => a.priority - b.priority);
      for (const l of list) {
        const srcs = [].concat(l.src), dsts = [].concat(l.dst);
        if (allSvc(l) && has(l.src, ['*', 'VirtualNetwork']) && has(l.dst, ['*', 'VirtualNetwork'])) flags[d === 'in' ? 'inVNet' : 'outVNet'] = false;
        if (d === 'out' && allSvc(l) && has(l.src, ['*']) && has(l.dst, ['*', 'Internet'])) flags.outInternet = false;
        if ((l.proto || '*') === '*' && [].concat(l.ports || '*').includes('*') && srcs.includes('*') && dsts.includes('*') && l.access === 'Deny') { notes.push({ level: 'info', text: `${l.name}: custom deny-all is redundant with the Deny-all rules; dropped` }); continue; }
        if (d === 'in' && srcs.includes('AzureLoadBalancer')) { notes.push(l.access === 'Allow' ? { level: 'info', text: `${l.name}: AzureLoadBalancer allow is redundant with the Platform exceptions; dropped` } : { level: 'warning', text: `${l.name}: a deny from AzureLoadBalancer has no effect, the Platform exceptions sit above it` }); continue; }
        const src = d === 'in' ? uniq(srcs.map(v => far(v, l))) : uniq(srcs.flatMap(v => own(v, l)));
        const dst = d === 'in' ? uniq(dsts.flatMap(v => own(v, l))) : uniq(dsts.map(v => far(v, l)));
        if (!src.length || !dst.length) continue;
        rules.push({ id: l.ruleId, name: l.name, src, dst, svc: svc(l), action: l.access === 'Deny' ? 'deny' : 'allow', imported: { nsg: legacy.name, rule: l.name, priority: l.priority, dir: d }, policy: `${legacy.name}/${d}` });
      }
    }
    return { rules, newObjects, newServices, notes, flags };
  }
  // Constraint merge: each imported (NSG, direction) keeps its order, the Rule base keeps its order,
  // and where Rules of different policies overlap with different actions, the deny comes first.
  function constraintMerge(existing, policies, inst) {
    const nodes = existing.concat(policies.flat()), id = r => r.id, edges = [], notes = [];
    const chain = list => list.forEach((r, i) => i && edges.push({ a: list[i - 1].id, b: r.id, kind: 'order' }));
    chain(existing); policies.forEach(chain);
    const pol = r => r.policy || 'Rule base';
    for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
      const x = nodes[i], y = nodes[j];
      if (pol(x) === pol(y) || x.action === y.action || !ruleOverlap(x, y, inst)) continue;
      const [d, a] = x.action === 'deny' ? [x, y] : [y, x];
      edges.push({ a: d.id, b: a.id, kind: 'deny-first' });
    }
    for (let guard = 0; guard < 50; guard++) {
      const cyc = findCycle(nodes.map(id), edges.map(e => ({ from: e.a, to: e.b })));
      if (!cyc) break;
      // break toward closing: in the cycle, find an own-policy order edge allow -> deny and flip it (the deny moves up)
      let k = -1;
      for (let i = 0; i < cyc.length - 1 && k < 0; i++) { const e = edges.findIndex(e => e.a === cyc[i] && e.b === cyc[i + 1] && e.kind === 'order'); if (e >= 0) { const A = nodes.find(n => n.id === edges[e].a), B = nodes.find(n => n.id === edges[e].b); if (A.action === 'allow' && B.action === 'deny' && A.policy) k = e; } }
      if (k < 0) { notes.push({ level: 'blocking', text: 'Constraint cycle without an allow → deny order edge inside one policy' }); break; }
      const e = edges[k], A = nodes.find(n => n.id === e.a), B = nodes.find(n => n.id === e.b);
      edges.splice(k, 1, { a: e.b, b: e.a, kind: 'cycle-break' });
      notes.push({ level: 'warning', rule: B.id, text: `Cycle broken toward closing: imported deny "${B.name}" moves above imported allow "${A.name}" of the same NSG. Flows that both match now close.` });
    }
    // order: keep existing Rules as early as possible, imported Rules as late as their constraints allow
    const preds = {}; nodes.forEach(n => (preds[n.id] = new Set())); edges.forEach(e => preds[e.b].add(e.a));
    const done = new Set(), out = [];
    const ready = n => [...preds[n.id]].every(p => done.has(p));
    const ancestors = n => { const s = new Set(), q = [...preds[n.id]]; while (q.length) { const x = q.shift(); if (!s.has(x)) { s.add(x); q.push(...preds[x]); } } return s; };
    let guard = 0;
    while (out.length < nodes.length && guard++ < 10000) {
      const head = existing.find(r => !done.has(r.id));
      if (head && ready(head)) { out.push(head); done.add(head.id); continue; }
      const anc = head ? ancestors(head) : null;
      const pick = policies.flat().find(r => !done.has(r.id) && ready(r) && (!anc || anc.has(r.id)));
      if (!pick) break;
      out.push(pick); done.add(pick.id);
    }
    return { order: out, edges, notes };
  }
  // Merge proposal (issue 27, point 17): imported Rules that differ only in their own Zone
  function mergeProposals(imported, mergeResult, inst) {
    const sig = r => { const dir = r.imported.dir; return JSON.stringify([r.action, r.svc, dir, dir === 'in' ? r.src : r.dst]); };
    const groups = {}; imported.forEach(r => (groups[sig(r)] = groups[sig(r)] || []).push(r));
    return Object.values(groups).filter(g => g.length > 1 && uniq(g.map(r => r.policy)).length === g.length).map(g => {
      const ids = new Set(g.map(r => r.id)), m = 'merged';
      const edges = mergeResult.edges.map(e => ({ from: ids.has(e.a) ? m : e.a, to: ids.has(e.b) ? m : e.b })).filter(e => e.from !== e.to);
      const nodes = uniq(edges.flatMap(e => [e.from, e.to]).concat([m]));
      const cyc = findCycle(nodes, edges);
      return { rules: g.map(r => r.id), names: g.map(r => r.name), possible: !cyc, why: cyc ? `order constraints form a cycle: ${cyc.join(' → ')}` : 'no order constraint is broken' };
    });
  }

  // ---------- Data contract for one Terraform root module (ADR 0010) ----------
  function sideArm(side, inst, pfx) {
    if (side.kind === 'tag') return { [pfx + 'AddressPrefix']: side.tag };
    if (side.kind === 'asgs') return { [pfx + 'ApplicationSecurityGroups']: side.asgs.map(a => ({ id: `/subscriptions/{${pfx === 'source' ? 'sub' : 'sub'}}/resourceGroups/rg-nsgfw/providers/Microsoft.Network/applicationSecurityGroups/${a}` })) };
    return side.prefixes.length === 1 ? { [pfx + 'AddressPrefix']: side.prefixes[0] } : { [pfx + 'AddressPrefixes']: side.prefixes };
  }
  function armRule(r, inst) {
    const p = Object.assign({ priority: r.priority, direction: r.dir === 'in' ? 'Inbound' : 'Outbound', access: r.access, protocol: r.proto, sourcePortRange: '*' },
      sideArm(r.src, inst, 'source'), sideArm(r.dst, inst, 'destination'), r.ports.length === 1 ? { destinationPortRange: r.ports[0] } : { destinationPortRanges: r.ports }, { description: r.desc || '' });
    return { name: r.name, properties: p };
  }
  function dataContract(inst, out, sub, revision) {
    const zs = Object.keys(out.nsgs).filter(z => inst.vnets[inst.zones[z].vnet].subscription === sub);
    const vnets = Object.keys(inst.vnets).filter(v => inst.vnets[v].subscription === sub);
    const env = inst.envs[inst.vnets[vnets[0]].env];
    return {
      data_contract_version: '1', revision, generated_by: `nsgfw engine ${out.engineVersion}`,
      network_security_groups: Object.fromEntries(zs.map(z => [out.nsgs[z].name, {
        resource_group: inst.zones[z].rg || `rg-${inst.zones[z].vnet}`, location: inst.vnets[inst.zones[z].vnet].region, flush_connection: !!env.flushConnection,
        tags: { 'nsgfw-managed-by': 'instance-0001', 'nsgfw-zone': z },
        security_rules: out.nsgs[z].in.concat(out.nsgs[z].out).map(r => armRule(r, inst)) }])),
      subnet_nsg: zs.filter(z => inst.zones[z].state !== 'legacy').map(z => ({ subnet: `${inst.zones[z].vnet}/${z}`, network_security_group: out.nsgs[z].name })),
      application_security_groups: Object.values(out.asgs).filter(a => vnets.includes(a.vnet)).map(a => ({ name: a.name, resource_group: `rg-${a.vnet}`, location: inst.vnets[a.vnet].region, tags: { 'nsgfw-managed-by': 'instance-0001', 'nsgfw-object': a.object } })),
      network_interface_asg: Object.entries(out.nicAsgs).filter(([n]) => vnets.includes(inst.nics[n].vnet)).flatMap(([n, l]) => l.map(a => ({ network_interface: inst.nics[n].name, application_security_group: a }))),
      imports: zs.filter(z => inst.zones[z].adopted).map(z => ({ to: `network_security_groups["${out.nsgs[z].name}"]`, id: `/subscriptions/{${sub}}/resourceGroups/${inst.zones[z].rg || 'rg-' + inst.zones[z].vnet}/providers/Microsoft.Network/networkSecurityGroups/${out.nsgs[z].name}` }))
    };
  }

  root.Engine = { ENGINE_VERSION, LIMITS, DEFAULT_OPT, translate, coverage, covList, flat, refLabel, svcLabel, preview, plan, blocked, crossings, affectedZones, rebase, ruleOverlap,
    importNsg, constraintMerge, mergeProposals, dataContract, memberChanges, membership, managedAsgs, normPrefixes, normPorts, protoGroups, fullList, azureDefaults, clone, uniq, P, fmtAddr, flowAllowed, zoneIds, reachesOutsideZones,
    zoneFlowChanges, rulesUsing, ip: s => ({ fam: P(s).fam, v: P(s).lo }) };
})(typeof window !== 'undefined' ? window : globalThis);
