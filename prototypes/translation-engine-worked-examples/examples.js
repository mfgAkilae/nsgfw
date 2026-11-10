// PROTOTYPE, throwaway. Worked examples for issue 22 as data. Each example is a list of steps;
// a step builds and commits a Version, or edits a Change set on top of the last Version.
(function (root) {
  'use strict';
  const E = root.Engine;

  // ---------- one small estate shared by all examples (no real IDs) ----------
  const VNETS = {
    hub: { space: ['10.0.0.0/16'], env: 'prod', region: 'westeurope', peers: ['spoke1', 'spoke2', 'spoke3'], subscription: 'sub-connectivity' },
    spoke1: { space: ['10.1.0.0/16'], env: 'prod', region: 'westeurope', peers: ['hub'], subscription: 'sub-app1' },
    spoke2: { space: ['10.2.0.0/16'], env: 'prod', region: 'westeurope', peers: ['hub'], subscription: 'sub-app2' },
    spoke3: { space: ['10.3.0.0/16', 'fd00:3::/48'], env: 'prod', region: 'westeurope', peers: ['hub'], subscription: 'sub-app3' },
    lab: { space: ['10.1.0.0/16'], env: 'prod', region: 'northeurope', peers: [], subscription: 'sub-lab' }
  };
  const ENVS = { prod: { name: 'Production', mode: 'arm', asgPattern: 'asg-{object}-{vnet}', flushConnection: false }, tf: { name: 'Platform (Terraform)', mode: 'terraform', asgPattern: 'asg-{object}-{vnet}', flushConnection: false } };
  const ZONES = {
    web: { vnet: 'spoke1', prefixes: ['10.1.1.0/24'] }, app: { vnet: 'spoke1', prefixes: ['10.1.2.0/24'] }, db: { vnet: 'spoke1', prefixes: ['10.1.3.0/24'] },
    billing: { vnet: 'spoke1', prefixes: ['10.1.4.0/24'] }, hr: { vnet: 'spoke1', prefixes: ['10.1.5.0/24'] }, aks2: { vnet: 'spoke1', prefixes: ['10.1.8.0/22'] },
    api: { vnet: 'spoke2', prefixes: ['10.2.1.0/24'] }, pg: { vnet: 'spoke2', prefixes: ['10.2.5.0/24'], kind: 'pgflex' }, aks: { vnet: 'spoke2', prefixes: ['10.2.8.0/22'] },
    appgw: { vnet: 'hub', prefixes: ['10.0.1.0/24'], kind: 'appgw' },
    dual: { vnet: 'spoke3', prefixes: ['10.3.1.0/24', 'fd00:3:0:1::/64'] }, dual2: { vnet: 'spoke3', prefixes: ['10.3.2.0/24', 'fd00:3:0:2::/64'] },
    labapp: { vnet: 'lab', prefixes: ['10.1.2.0/24'] }
  };
  const SUBNETS = { mgmt: { vnet: 'hub', prefixes: ['10.0.9.0/24'], name: 'hub/mgmt (jump hosts, not a Zone)' }, labclients: { vnet: 'lab', prefixes: ['10.1.4.0/24'], name: 'lab/clients (not a Zone)' } };
  const NICS = {
    'nic-web1': { name: 'vm-web1-nic', vnet: 'spoke1', subnet: 'web', ips: ['10.1.1.4'] }, 'nic-web2': { name: 'vm-web2-nic', vnet: 'spoke1', subnet: 'web', ips: ['10.1.1.5'] },
    'nic-app1': { name: 'vm-app1-nic', vnet: 'spoke1', subnet: 'app', ips: ['10.1.2.4'] }, 'nic-db1': { name: 'vm-db1-nic', vnet: 'spoke1', subnet: 'db', ips: ['10.1.3.4'] },
    'nic-api1': { name: 'vm-api1-nic', vnet: 'spoke2', subnet: 'api', ips: ['10.2.1.4'] }, 'nic-jump1': { name: 'vm-jump1-nic', vnet: 'hub', subnet: 'mgmt', ips: ['10.0.9.4'] },
    'nic-vmss0': { name: 'vmss-api_0-nic', vnet: 'spoke2', subnet: 'api', ips: ['10.2.1.10'], vmss: true }, 'nic-vmss1': { name: 'vmss-api_1-nic', vnet: 'spoke2', subnet: 'api', ips: ['10.2.1.11'], vmss: true },
    'nic-dual1': { name: 'vm-dual1-nic', vnet: 'spoke3', subnet: 'dual', ips: ['10.3.1.4', 'fd00:3:0:1::4'] }
  };
  const OBJECTS = {
    onprem: { kind: 'cidr', value: '192.168.10.0/24', name: 'onprem-clients' }, net10: { kind: 'cidr', value: '10.0.0.0/8', name: 'net-10' },
    'spoke1-net': { kind: 'cidr', value: '10.1.0.0/16', name: 'spoke1-range' }, web01: { kind: 'host', value: '10.1.1.5', name: 'web01' },
    'tag-internet': { kind: 'tag', value: 'Internet', name: 'Internet' }, 'tag-storage': { kind: 'tag', value: 'Storage.WestEurope', name: 'Storage.WestEurope' },
    'tag-sql': { kind: 'tag', value: 'Sql.WestEurope', name: 'Sql.WestEurope' }, 'tag-afd': { kind: 'tag', value: 'AzureFrontDoor.Backend', name: 'AzureFrontDoor.Backend' },
    'tag-gwm': { kind: 'tag', value: 'GatewayManager', name: 'GatewayManager' }, 'tag-vnet': { kind: 'tag', value: 'VirtualNetwork', name: 'VirtualNetwork (imported tag)' },
    'sub-mgmt': { kind: 'subnet', subnet: 'mgmt', name: 'hub-mgmt-subnet' }, 'vnet-spoke1': { kind: 'vnet', vnet: 'spoke1', name: 'VNet spoke1' }
  };
  const SERVICES = {
    https: { proto: 'Tcp', ports: '443', name: 'https' }, ssh: { proto: 'Tcp', ports: '22', name: 'ssh' }, rdp: { proto: 'Tcp', ports: '3389', name: 'rdp' },
    sql: { proto: 'Tcp', ports: '1433', name: 'mssql' }, pgsql: { proto: 'Tcp', ports: '5432', name: 'postgres' }, smb: { proto: 'Tcp', ports: '445', name: 'smb' },
    telnet: { proto: 'Tcp', ports: '23', name: 'telnet' }, 'tcp-8443': { proto: 'Tcp', ports: '8443', name: 'tcp/8443' }, 'udp-53': { proto: 'Udp', ports: '53', name: 'dns-udp' },
    http: { proto: 'Tcp', ports: '80', name: 'http' }, 'tcp-80-90': { proto: 'Tcp', ports: '80-90', name: 'tcp/80-90' }, 'tcp-91': { proto: 'Tcp', ports: '91', name: 'tcp/91' },
    'tcp-8080': { proto: 'Tcp', ports: '8080', name: 'tcp/8080' }, 'tcp-8000s': { proto: 'Tcp', ports: '8000-8100', name: 'tcp/8000-8100' },
    'gwm-ports': { proto: 'Tcp', ports: '65200-65535', name: 'appgw-infra' }, kubelet: { proto: 'Tcp', ports: '10250', name: 'kubelet' }
  };
  function world(zones, o) {
    o = o || {};
    const inst = { internal: ['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16'], envs: E.clone(ENVS), vnets: E.clone(VNETS), subnets: E.clone(SUBNETS), nics: E.clone(NICS),
      objects: Object.assign(E.clone(OBJECTS), E.clone(o.objects || {})), services: Object.assign(E.clone(SERVICES), E.clone(o.services || {})), zones: {}, rules: E.clone(o.rules || []) };
    for (const z of zones) { const [id, ov] = typeof z === 'string' ? [z, {}] : z; inst.zones[id] = Object.assign({ state: 'managed', posture: 'dest', inherit: {}, extra: [] }, E.clone(ZONES[id]), E.clone(ov)); }
    if (o.edit) o.edit(inst);
    return inst;
  }
  const R = (id, name, src, dst, svc, action, extra) => Object.assign({ id, name, src, dst, svc, action: action || 'allow' }, extra || {});
  const asg = (name, members) => ({ kind: 'asg', name, members });
  const rule = (I, id) => I.rules.find(r => r.id === id);

  // ---------- steps ----------
  function commit(S) {
    const out = E.translate(S.inst, Object.assign({ prev: S.committed ? S.committed.out : null }, S.opt || {}));
    S.committed = { inst: E.clone(S.inst), out }; S.version = (S.version || 0) + 1; S.pending = false;
  }
  const step = (label, kind, fn, x) => Object.assign({ label, kind, run: S => { S.note = null; fn(S); } }, x || {});
  const V = (label, build, x) => step(label, 'version', S => { S.inst = build(S); S.failed = null; S.deployed = null; commit(S); if (S.seed) { S.committed.out = S.seed; S.seed = null; } }, x);
  const C = (label, edit, x) => step(label, 'change', S => { S.inst = E.clone(S.inst); edit(S.inst, S); S.pending = true; }, x);
  const K = (label, x) => step(label, 'commit', S => { S.failed = null; S.deployed = null; commit(S); }, x);
  const X = (label, fn, x) => step(label, 'action', fn, x); // anything else (fail a write, an engine upgrade)

  // derived view of a state: target output, Preview, Affected Zones, Deployment plan
  function derive(S) {
    const D = {};
    if (!S.inst) return D;
    D.out = S.pending ? E.translate(S.inst, Object.assign({ prev: S.committed ? S.committed.out : null }, S.opt || {})) : S.committed.out;
    if (S.pending && S.committed) {
      const dep = S.deployed || { inst: S.committed.inst, out: S.committed.out };
      D.preview = E.preview(S.committed.out, D.out);
      D.affected = E.affectedZones(S.committed.inst, S.inst);
      D.plan = E.plan(dep, { inst: S.inst, out: D.out });
      if (S.failed) D.waiting = E.blocked(D.plan, S.failed);
    }
    return D;
  }
  function runTo(ex, k) { const S = { inst: null, committed: null }; for (let i = 0; i <= k; i++) ex.steps[i].run(S); return S; }

  // check helpers
  const nr = (D, z, dir) => D.out.nsgs[z][dir].filter(r => r.kind === 'rule');
  const of = (D, z, dir, id) => nr(D, z, dir).filter(r => r.ruleId === id);
  const dropped = (D, z, id) => D.out.nsgs[z].dropped.filter(d => d.rule.ruleId === id);
  const prio = (D, z, dir, id) => of(D, z, dir, id).map(r => r.priority);
  const edgesOf = D => D.plan.edges.filter(e => e.kind === 'crossing').map(e => e.from.slice(4) + '>' + e.to.slice(4));
  const errKinds = D => D.plan.errors.map(e => e.kind);
  const affected = D => Object.keys(D.affected).sort().join(',');

  const EX = [];
  const add = (group, key, title, text, watch, steps) => EX.push({ group, key, title, text, watch, steps });

  // ======================= Placement =======================
  add('Placement', 'zone-zone', 'Zone to Zone, both Egress postures',
    'One allow Rule from Zone web to Zone db. With the default Egress posture (destination-enforced), only the destination NSG gets an NSG rule; web lets internal traffic out through its egress allow. Step 2 sets web to strict.',
    ['db inbound holds the NSG rule in both steps.', 'web outbound holds it only when web is strict; before, the engine lists it as left out.', 'Affected Zones of the posture change: see the open question in the ticket.'],
    [V('Version 1: web → db mssql', () => world(['web', 'db'], { rules: [R(1, 'web to db', ['zone:web'], ['zone:db'], ['sql'])] }), { checks: [['db inbound has the NSG rule', (S, D) => of(D, 'db', 'in', 1).length === 1], ['web outbound leaves it out', (S, D) => !of(D, 'web', 'out', 1).length && dropped(D, 'web', 1).length === 1]] }),
     C('Change set: Zone web becomes strict', I => { I.zones.web.posture = 'strict'; }, { checks: [['web outbound now has it', (S, D) => of(D, 'web', 'out', 1).length === 1], ['egress allow is gone from web', (S, D) => !D.out.nsgs.web.out.some(r => r.kind === 'egress')]] })]);

  add('Placement', 'internet', 'Zone to Internet, and "any" is not the Internet',
    'Step 1: "web → Internet (tag) https" lands only outbound on web, because a service tag covers no Zone. Step 2 writes the same Rule with any as the destination, as firewall administrators often do. any stands for every address, so its Coverage is every Zone.',
    ['Step 2: the Rule now lands inbound on every Zone and opens web → app and web → db on 443.', 'Rule cost goes from 1 NSG to 3 NSGs.'],
    [V('Version 1: web → Internet https', () => world(['web', 'app', 'db'], { rules: [R(1, 'web out https', ['zone:web'], ['tag-internet'], ['https'])] }), { checks: [['only web, outbound', (S, D) => D.out.cost[1].nsgs.join() === 'web' && of(D, 'web', 'out', 1).length === 1]] }),
     C('Change set: destination any instead of Internet', I => { rule(I, 1).dst = ['any']; }, { checks: [['lands on 3 NSGs', (S, D) => D.out.cost[1].nsgs.length === 3], ['app inbound now allows web on 443', (S, D) => of(D, 'app', 'in', 1).length === 1]] })]);

  add('Placement', 'tags', 'Service-tag sources and destinations',
    'Front Door reaches web through a service tag as source; app reaches Storage and SQL through two service tags. A service tag covers no Zone, so each Rule lands only on the Zone side. One NSG rule holds one service tag, so two tags make two NSG rules.',
    ['web inbound: one NSG rule with source AzureFrontDoor.Backend.', 'app outbound: two NSG rules, one per tag. app is destination-enforced, but the engine keeps them: a tag is not known to lie inside the Internal address space.'],
    [V('Version 1', () => world(['web', 'app'], { rules: [R(1, 'front door to web', ['tag-afd'], ['zone:web'], ['https']), R(2, 'app to storage and sql', ['zone:app'], ['tag-storage', 'tag-sql'], ['https'])] }),
      { checks: [['two NSG rules on app outbound', (S, D) => of(D, 'app', 'out', 2).length === 2], ['Rule 1 only on web inbound', (S, D) => D.out.cost[1].nsgs.join() === 'web']] })]);

  add('Placement', 'coverage', 'Coverage: host inside a Zone, CIDR over several Zones, any',
    'web and app are strict here, so their outbound side shows. Rule 1 has a host inside web as source, Rule 2 a CIDR that covers web, app and db, Rule 3 any as source.',
    ['Rule 1 lands outbound on web with only the host, not the whole Zone.', 'Rule 2 lands outbound on web and app (strict) and is left out on db (destination-enforced).', 'Rule 3 lands outbound on every strict Zone; on db it is left out.'],
    [V('Version 1', () => world([['web', { posture: 'strict' }], ['app', { posture: 'strict' }], 'db'], { rules: [R(1, 'web01 to db', ['web01'], ['zone:db'], ['sql']), R(2, 'spoke1 ssh to db', ['spoke1-net'], ['zone:db'], ['ssh']), R(3, 'any to web', ['any'], ['zone:web'], ['https'])] }),
      { checks: [['host only on web outbound', (S, D) => JSON.stringify(of(D, 'web', 'out', 1)[0].src.prefixes) === '["10.1.1.5"]'], ['CIDR lands on web, app, db', (S, D) => D.out.cost[2].nsgs.sort().join() === 'app,db,web'], ['db leaves Rule 2 out', (S, D) => dropped(D, 'db', 2).length === 1]] })]);

  add('Placement', 'deny-allow', 'Deny before allow, deny on both sides',
    'A deny for ssh from app sits above a broad allow from spoke1. Under ADR 0016 the deny lands on both sides. The destination-enforced source leaves both NSG rules out, because db inbound decides. Step 2 makes app strict.',
    ['db inbound: the deny has the lower priority number, so it wins.', 'Step 2: app outbound gets both, deny first.'],
    [V('Version 1', () => world(['app', 'db'], { rules: [R(1, 'no ssh from app', ['zone:app'], ['zone:db'], ['ssh'], 'deny'), R(2, 'spoke1 to db', ['spoke1-net'], ['zone:db'], ['any'])] }),
      { checks: [['deny above allow on db', (S, D) => prio(D, 'db', 'in', 1)[0] < prio(D, 'db', 'in', 2)[0]], ['app outbound leaves both out', (S, D) => dropped(D, 'app', 1).length === 1 && dropped(D, 'app', 2).length === 1]] }),
     C('Change set: app becomes strict', I => { I.zones.app.posture = 'strict'; }, { checks: [['app outbound has deny then allow', (S, D) => prio(D, 'app', 'out', 1)[0] < prio(D, 'app', 'out', 2)[0]]] })]);

  add('Placement', 'one-sided', 'The former one-sided deny',
    '"deny any → db rdp". ADR 0004 put it only on db. Under ADR 0016 it lands on db and on the source side of every Zone. Destination-enforced Zones leave it out, because its destination lies entirely inside Zones; strict Zones keep it.',
    ['db inbound: the deny.', 'app (strict) outbound: the deny. web (destination-enforced): left out.'],
    [V('Version 1', () => world(['web', ['app', { posture: 'strict' }], 'db'], { rules: [R(1, 'no rdp to db', ['any'], ['zone:db'], ['rdp'], 'deny')] }),
      { checks: [['on app outbound', (S, D) => of(D, 'app', 'out', 1).length === 1], ['left out on web', (S, D) => dropped(D, 'web', 1).length === 1], ['on db inbound', (S, D) => of(D, 'db', 'in', 1).length === 1]] })]);

  add('Placement', 'kept-allow', 'An allow that must stay, denies inside and outside Zones',
    'web is destination-enforced. Rule 1 allows smb to db. Rule 2 denies smb to app (a destination inside Zones). Rule 3 denies smb to all of 10.0.0.0/8, which reaches beyond Zones (on-premises, subnets that are not Zones).',
    ['web outbound keeps Rule 3 (its destination reaches outside Zones) and Rule 1 (Rule 3 below it overlaps it; without Rule 1 the egress allow would never be reached for db:445).', 'web outbound leaves Rule 2 out (db… app inbound holds it).', 'Rule 3 also lands inbound on web itself and closes smb inside web: the Rule base says so, above the Intra-zone default.'],
    [V('Version 1', () => world(['web', 'app', 'db'], { rules: [R(1, 'web smb to db', ['zone:web'], ['zone:db'], ['smb']), R(2, 'no smb to app', ['zone:web'], ['zone:app'], ['smb'], 'deny'), R(3, 'no smb from web', ['zone:web'], ['net10'], ['smb'], 'deny')] }),
      { checks: [['Rule 1 kept on web outbound', (S, D) => of(D, 'web', 'out', 1).length === 1], ['Rule 2 left out', (S, D) => dropped(D, 'web', 2).length === 1], ['Rule 3 kept', (S, D) => of(D, 'web', 'out', 3).length === 1], ['Rule 3 inbound on web too', (S, D) => of(D, 'web', 'in', 3).length === 1]] })]);

  add('Placement', 'internal', 'The Internal address space',
    'web is destination-enforced. Rule 1 allows ssh to on-premises clients (192.168.10.0/24, inside the default Internal address space). Rule 2 allows https to a partner network in 100.64.0.0/10, which is not. Step 2 adds 100.64.0.0/10 to the Internal address space.',
    ['Rule 1 is left out: on-premises is reachable from web without any Rule, and on-premises has no NSG.', 'Step 2: Rule 2 is left out too. Affected Zones are empty, so the instance default (four-eyes) applies, if this is a Change set at all.'],
    [V('Version 1', () => world(['web'], { objects: { partner: { kind: 'cidr', value: '100.64.0.0/10', name: 'partner-net' } }, rules: [R(1, 'web to onprem ssh', ['zone:web'], ['onprem'], ['ssh']), R(2, 'web to partner', ['zone:web'], ['partner'], ['https'])] }),
      { checks: [['Rule 1 left out', (S, D) => dropped(D, 'web', 1).length === 1], ['Rule 2 kept', (S, D) => of(D, 'web', 'out', 2).length === 1]] }),
     C('Change set: add 100.64.0.0/10 to the Internal address space', I => { I.internal.push('100.64.0.0/10'); }, { checks: [['Rule 2 left out now', (S, D) => dropped(D, 'web', 2).length === 1], ['no Affected Zones', (S, D) => affected(D) === '']] })]);

  add('Placement', 'intra', 'Intra-zone default and a Rule above it',
    'Traffic inside app is allowed by the Intra-zone default at 4080. Rule 1 denies rdp inside app and sits above it.',
    ['app inbound: Rule 1 in the Rules band, then 4080.', 'app outbound leaves the deny out (its destination is a Zone); inbound enforces it.'],
    [V('Version 1', () => world(['app'], { rules: [R(1, 'no rdp inside app', ['zone:app'], ['zone:app'], ['rdp'], 'deny')] }),
      { checks: [['deny above intra-zone', (S, D) => prio(D, 'app', 'in', 1)[0] < 4080 && D.out.nsgs.app.in.some(r => r.name === 'nsgfw-intrazone-in-v4')]] })]);

  add('Placement', 'dual', 'A dual-stack Zone',
    'dual and dual2 carry IPv4 and IPv6 prefixes. Until the empirical checks show that Azure accepts both families in one NSG rule, the engine splits per family.',
    ['Platform exceptions 100 (AzureLoadBalancer) and 101 (IPv6 probe source), Intra-zone default 4080 and 4081.', 'Rule 1 (any → dual): two NSG rules, IPv4 and IPv6. It also lands outbound on dual and dual2 for IPv6, because no IPv6 prefix is internal.', 'Rule 2 (dual → dual2) on destination-enforced dual: the IPv4 NSG rule is left out, the IPv6 one stays, because the default Internal address space holds no IPv6 prefix.', 'Step 2: one NSG rule per Rule if mixed families were allowed (engine option).'],
    [V('Version 1', () => world(['dual', 'dual2'], { rules: [R(1, 'any to dual', ['any'], ['zone:dual'], ['https']), R(2, 'dual to dual2', ['zone:dual'], ['zone:dual2'], ['tcp-8443'])] }),
      { checks: [['two NSG rules for Rule 1', (S, D) => of(D, 'dual', 'in', 1).length === 2], ['IPv6 kept outbound on dual', (S, D) => of(D, 'dual', 'out', 2).length === 1 && of(D, 'dual', 'out', 2)[0].dst.fam === 6], ['platform 101 present', (S, D) => D.out.nsgs.dual.in.some(r => r.priority === 101)]] }),
     X('Engine option: mixed families in one NSG rule', S => { S.opt = { splitFamilies: false }; S.inst = E.clone(S.inst); S.pending = true; }, { checks: [['one NSG rule for Rule 1', (S, D) => of(D, 'dual', 'in', 1).length === 1]] })]);

  add('Placement', 'appgw', 'An Application Gateway v2 Zone',
    'appgw is an Application Gateway v2 subnet. Its outbound stays open, because Microsoft writes that outbound NSG rules that deny any outbound connectivity must not be created. The public frontend IP is an Extra prefix, as the listener rule needs it in its destination. Rules 1 and 2 are the ready-made Rules from the service catalog.',
    ['No outbound Deny-all and no egress allow on appgw. Rule 3 still lands outbound, without effect, so the NSG is right if the setting is ever removed.', 'Inbound destination holds the subnet and the public frontend IP.', 'Extra prefixes count in both directions, so the public frontend IP also shows up as a source of Rule 3 on web. Harmless, but not what the prefix is for.'],
    [V('Version 1', () => world([['appgw', { extra: ['198.51.100.10/32'] }], 'web'], { rules: [R(1, 'AppGW infrastructure', ['tag-gwm'], ['zone:appgw'], ['gwm-ports']), R(2, 'AppGW listeners', ['tag-internet'], ['zone:appgw'], ['https']), R(3, 'appgw to web', ['zone:appgw'], ['zone:web'], ['https'])] }),
      { checks: [['no outbound deny-all on appgw', (S, D) => !D.out.nsgs.appgw.out.some(r => r.kind === 'denyall')], ['Rule 3 outbound on appgw', (S, D) => of(D, 'appgw', 'out', 3).length === 1], ['frontend IP in destination', (S, D) => of(D, 'appgw', 'in', 2)[0].dst.prefixes.includes('198.51.100.10/32')]] })]);

  add('Placement', 'aks', 'Extra prefixes: the pod range of an AKS overlay cluster',
    'aks holds the nodes of an AKS cluster with Azure CNI Overlay. Pod traffic inside the cluster is not encapsulated, so the subnet NSG sees pod addresses from 10.244.0.0/16, which belong to no subnet. Step 1 onboards the Zone without Extra prefixes; step 2 adds the pod range.',
    ['Step 1: pod to pod traffic hits the Deny-all rules (the cluster breaks), and the object "pods" covers no Zone, so Rule 1 lands nowhere outbound.', 'Step 2: the Intra-zone default holds the node and the pod range, and "pods" covers aks.'],
    [V('Version 1: aks without Extra prefixes', () => world(['aks', ['db', { posture: 'strict' }]], { objects: { pods: { kind: 'cidr', value: '10.244.0.0/16', name: 'aks-pods' } }, rules: [R(1, 'pods may not reach kubelet', ['pods'], ['zone:aks'], ['kubelet'], 'deny'), R(2, 'aks to db', ['zone:aks'], ['zone:db'], ['pgsql'])] }),
      { checks: [['pod to pod dropped', (S, D) => !E.flowAllowed(S.inst, D.out, {}, { s: E.ip('10.244.1.5'), d: E.ip('10.244.2.6'), proto: 'Tcp', port: 8080 }, 'aks', 'aks').every(x => x)], ['pods cover no Zone', (S, D) => E.coverage('pods', S.inst).length === 0]] }),
     C('Change set: Extra prefix 10.244.0.0/16 on aks', I => { I.zones.aks.extra = ['10.244.0.0/16']; }, { checks: [['pod to pod allowed', (S, D) => E.flowAllowed(S.inst, D.out, {}, { s: E.ip('10.244.1.5'), d: E.ip('10.244.2.6'), proto: 'Tcp', port: 8080 }, 'aks', 'aks').every(x => x)], ['pods cover aks', (S, D) => E.coverage('pods', S.inst).join() === 'aks'], ['intra-zone holds both', (S, D) => D.out.nsgs.aks.in.find(r => r.name === 'nsgfw-intrazone-in-v4').src.prefixes.length === 2]] })]);

  add('Placement', 'pods-twice', 'The same pod range on two Zones',
    'Two AKS clusters, aks (spoke2) and aks2 (spoke1), both use the default pod range 10.244.0.0/16 as an Extra prefix. The object "pods" covers both. Rule 1 was meant for the pods of aks only. Step 2 binds the object to spoke2.',
    ['Step 1: Rule 1 lands inbound on both clusters.', 'Rule 2 (aks → aks2) carries 10.244.0.0/16 on both sides of aks2\'s inbound NSG rule. Pod traffic leaves a cluster through the node IP, so inside aks2 the source 10.244.0.0/16 means aks2\'s own pods: the Rule also allows aks2 pods → aks2 on 443.', 'Step 2: Rule 1 lands only on aks.'],
    [V('Version 1', () => world([['aks', { extra: ['10.244.0.0/16'] }], ['aks2', { extra: ['10.244.0.0/16'] }]], { objects: { pods: { kind: 'cidr', value: '10.244.0.0/16', name: 'aks-pods' } }, rules: [R(1, 'no ssh into aks pods', ['any'], ['pods'], ['ssh'], 'deny'), R(2, 'aks to aks2', ['zone:aks'], ['zone:aks2'], ['https'])] }),
      { checks: [['pods cover both', (S, D) => E.coverage('pods', S.inst).sort().join() === 'aks,aks2'], ['Rule 1 inbound on aks2', (S, D) => of(D, 'aks2', 'in', 1).length === 1]] }),
     C('Change set: bind "pods" to VNet spoke2', I => { I.objects.pods.bind = ['spoke2']; }, { checks: [['pods cover aks only', (S, D) => E.coverage('pods', S.inst).join() === 'aks'], ['aks2 loses Rule 1', (S, D) => !of(D, 'aks2', 'in', 1).length]] })]);

  add('Placement', 'binding', 'VNet binding with overlapping address spaces',
    'VNet lab is not connected to anything and reuses 10.1.0.0/16, the range of spoke1. Its Zone labapp has the same prefix as app (10.1.2.0/24). The object "app-servers" is 10.1.2.0/24. In lab, 10.1.1.0/24 (the prefix of Zone web) is the client subnet, which is not a Zone.',
    ['Step 1: Rule 1 also lands inbound on labapp and opens lab clients → labapp on ssh.', 'Step 2: with a VNet binding to spoke1, it lands only on app.'],
    [V('Version 1', () => world(['web', 'app', 'labapp'], { objects: { 'app-servers': { kind: 'cidr', value: '10.1.2.0/24', name: 'app-servers' } }, edit: I => { I.subnets.labclients.prefixes = ['10.1.1.0/24']; }, rules: [R(1, 'web ssh to app servers', ['zone:web'], ['app-servers'], ['ssh'])] }),
      { checks: [['labapp gets the NSG rule', (S, D) => of(D, 'labapp', 'in', 1).length === 1], ['lab clients reach labapp on ssh', (S, D) => E.flowAllowed(S.inst, D.out, {}, { s: E.ip('10.1.1.20'), d: E.ip('10.1.2.5'), proto: 'Tcp', port: 22 }, null, 'labapp').every(x => x)]] }),
     C('Change set: bind "app-servers" to spoke1', I => { I.objects['app-servers'].bind = ['spoke1']; }, { checks: [['only app now', (S, D) => D.out.cost[1].nsgs.join() === 'app'], ['lab clients blocked', (S, D) => !E.flowAllowed(S.inst, D.out, {}, { s: E.ip('10.1.1.20'), d: E.ip('10.1.2.5'), proto: 'Tcp', port: 22 }, null, 'labapp').some(x => x)]] })]);

  // ======================= Priorities and names =======================
  add('Priorities and names', 'bands', 'The fixed priority bands',
    'One Managed NSG with every block: db has all three Inherited defaults (as after an Import) and is destination-enforced.',
    ['100–119 Platform exceptions, 120–4079 Rules, 4080–4089 Intra-zone default, 4090–4095 Inherited defaults, 4096 Deny-all, 65000+ Azure default rules (read-only).', 'Prototype choice, not decided: the egress allow of the Egress posture sits at 4094 (IPv4) and 4095 (IPv6), in the band that ADR 0011 gives the Inherited defaults.', 'A single NSG rule takes the middle of the Rules band (2100).'],
    [V('Version 1', () => world([['db', { inherit: { inVNet: true, outVNet: true, outInternet: true } }]], { rules: [R(1, 'any to db', ['any'], ['zone:db'], ['sql']), R(2, 'db to storage', ['zone:db'], ['tag-storage'], ['https'])] }),
      { checks: [['inherited at 4090', (S, D) => D.out.nsgs.db.in.some(r => r.priority === 4090 && r.kind === 'inherited')], ['egress at 4094', (S, D) => D.out.nsgs.db.out.some(r => r.priority === 4094 && r.kind === 'egress')], ['middle of the band', (S, D) => prio(D, 'db', 'in', 1)[0] === 2100]] })]);

  const fourRules = () => [R(1, 'web01 to db', ['web01'], ['zone:db'], ['sql']), R(2, 'app to db', ['zone:app'], ['zone:db'], ['sql']), R(3, 'onprem to db', ['onprem'], ['zone:db'], ['sql']), R(4, 'any https to db', ['any'], ['zone:db'], ['https'])];
  add('Priorities and names', 'stable', 'Insert, move and disable with stable priorities',
    'Four Rules land inbound on db. The first Commit spreads them evenly over the Rules band. Then a Rule is inserted, one is moved to the top, and one is disabled, each committed.',
    ['Insert: Rule 5 takes the middle of the gap between Rule 1 and Rule 2; no other NSG rule changes.', 'Move: only Rule 4 changes its priority.', 'Disable: Rule 2\'s NSG rule disappears; the others keep their numbers.'],
    [V('Version 1: four Rules', () => world(['web', 'app', 'db'], { rules: fourRules() }), { checks: [['spread evenly', (S, D) => JSON.stringify([1, 2, 3, 4].map(i => prio(D, 'db', 'in', i)[0])) === '[911,1703,2496,3288]']] }),
     C('Change set: insert Rule 5 between Rule 1 and Rule 2', I => { I.rules.splice(1, 0, R(5, 'web to db https', ['zone:web'], ['zone:db'], ['https'])); }, { checks: [['middle of the gap', (S, D) => prio(D, 'db', 'in', 5)[0] === 1307], ['others unchanged', (S, D) => D.preview.every(p => !p.renumbered.length)]] }),
     K('Commit (Version 2)'),
     C('Change set: move Rule 4 to the top', I => { const r = rule(I, 4); I.rules = [r].concat(I.rules.filter(x => x.id !== 4)); }, { checks: [['Rule 4 takes the gap above Rule 1', (S, D) => prio(D, 'db', 'in', 4)[0] === 515], ['one NSG rule changes', (S, D) => D.preview[0].renumbered.length === 1]] }),
     K('Commit (Version 3)'),
     C('Change set: disable Rule 2', I => { rule(I, 2).enabled = false; }, { checks: [['one NSG rule removed, none renumbered', (S, D) => D.preview[0].removed.length === 1 && !D.preview[0].renumbered.length]] })]);

  add('Priorities and names', 'window', 'A window rebalance',
    'After many edits, Rules 2–5 sit at 1000–1003 in db (the stored NSG rules of the last Version say so). A new Rule goes between Rule 3 and Rule 4, where no number is free.',
    ['The window grows around the spot until it is at most half occupied (here 997–1006) and only that window is spread.', 'Rules 1 and 6 keep 500 and 3000.', 'The Preview groups the priority-only changes.'],
    [V('Version 1 (stored priorities from history)', S => { const I = world(['web', 'app', 'db'], { rules: [R(1, 'r1', ['web01'], ['zone:db'], ['sql']), R(2, 'r2', ['zone:app'], ['zone:db'], ['sql']), R(3, 'r3', ['onprem'], ['zone:db'], ['sql']), R(4, 'r4', ['any'], ['zone:db'], ['https']), R(5, 'r5', ['zone:web'], ['zone:db'], ['rdp']), R(6, 'r6', ['zone:app'], ['zone:db'], ['ssh'])] });
      const out = E.translate(I); const want = { 1: 500, 2: 1000, 3: 1001, 4: 1002, 5: 1003, 6: 3000 }; out.nsgs.db.in.forEach(r => { if (r.ruleId) r.priority = want[r.ruleId]; }); S.seed = out; return I; },
      { checks: [['history applied', (S, D) => prio(D, 'db', 'in', 3)[0] === 1001]] }),
     C('Change set: insert Rule 7 between Rule 3 and Rule 4', I => { I.rules.splice(3, 0, R(7, 'r7 new', ['onprem'], ['zone:db'], ['https'])); }, { checks: [['window 997–1006', (S, D) => D.out.nsgs.db.windows.some(w => w.from === 997 && w.to === 1006)], ['Rules 1 and 6 keep their numbers', (S, D) => prio(D, 'db', 'in', 1)[0] === 500 && prio(D, 'db', 'in', 6)[0] === 3000], ['4 NSG rules renumbered', (S, D) => D.preview[0].renumbered.length === 4]] })]);

  add('Priorities and names', 'split', 'The split cross product',
    'One Rule with four source Objects of three kinds and three services of two protocols lands inbound on db. Per direction it becomes protocol group × source partition × destination partition: (Tcp 443,8443 | Udp 53) × (prefix list | service tag | ASG chunk) × (db).',
    ['Six NSG rules with consecutive priorities, one name each.', 'The prefix list holds on-premises and the host; the tag and the ASG stand alone.'],
    [V('Version 1', () => world(['web', 'db'], { objects: { 'asg-web': asg('web-servers', ['nic-web1', 'nic-web2']), jump: { kind: 'host', value: '172.16.9.9', name: 'jumphost' } }, rules: [R(1, 'many to db', ['onprem', 'jump', 'tag-afd', 'asg-web'], ['zone:db'], ['https', 'tcp-8443', 'udp-53'])] }),
      { checks: [['six NSG rules', (S, D) => of(D, 'db', 'in', 1).length === 6], ['consecutive priorities', (S, D) => { const p = prio(D, 'db', 'in', 1); return p.every((x, i) => !i || x === p[i - 1] + 1); }], ['Tcp ports merged into one list', (S, D) => of(D, 'db', 'in', 1)[0].ports.join() === '443,8443']] })]);

  add('Priorities and names', 'pruning', 'Own-side pruning and list normalization',
    'Address group AppServers = Zone app, Zone api and host 10.1.2.5 (inside app). Its services are tcp/80, tcp/80-90 and tcp/91. app and api are strict.',
    ['On app outbound the source is only app\'s prefix: api is pruned (not app\'s side), the host disappears because the app prefix contains it.', 'Ports merge to 80-91.', 'On db inbound the far side stays complete (app and api), the host again normalized away.'],
    [V('Version 1', () => world([['app', { posture: 'strict' }], ['api', { posture: 'strict' }], 'db'], { objects: { app05: { kind: 'host', value: '10.1.2.5', name: 'app05' }, AppServers: { kind: 'group', name: 'AppServers', members: ['zone:app', 'zone:api', 'app05'] } }, rules: [R(1, 'AppServers to db', ['AppServers'], ['zone:db'], ['http', 'tcp-80-90', 'tcp-91'])] }),
      { checks: [['app outbound source pruned', (S, D) => JSON.stringify(of(D, 'app', 'out', 1)[0].src.prefixes) === '["10.1.2.0/24"]'], ['ports 80-91', (S, D) => of(D, 'app', 'out', 1)[0].ports.join() === '80-91'], ['db inbound source complete', (S, D) => JSON.stringify(of(D, 'db', 'in', 1)[0].src.prefixes) === '["10.1.2.0/24","10.2.1.0/24"]']] })]);

  add('Priorities and names', 'names', 'NSG rule names',
    'Rule 1042 "web to db". Names follow nsgfw-r<Rule ID>-<in|out>-<hash>, and the hash covers only the split key (protocol, kind and identity of each side\'s partition).',
    ['Adding a port and a prefix keeps the name (step 2).', 'Renaming the Rule keeps the name; only the description changes (step 4).', 'A new protocol or a new partition (a service tag) adds NSG rules with new names (step 6).'],
    [V('Version 1', () => world(['web', 'db'], { rules: [R(1042, 'web to db', ['zone:web'], ['zone:db'], ['https'])] })),
     C('Change set: add tcp/8443 and on-premises to the Rule', I => { const r = rule(I, 1042); r.svc.push('tcp-8443'); r.src.push('onprem'); }, { checks: [['same name', (S, D) => of(D, 'db', 'in', 1042)[0].name === S.committed.out.nsgs.db.in.find(r => r.ruleId === 1042).name]] }),
     K('Commit (Version 2)'),
     C('Change set: rename the Rule', I => { rule(I, 1042).name = 'web tier to SQL'; }, { checks: [['same name, new description', (S, D) => D.preview[0].changed.length === 1 && D.preview[0].changed[0].before.name === D.preview[0].changed[0].after.name]] }),
     K('Commit (Version 3)'),
     C('Change set: add udp/53 and the Front Door tag', I => { const r = rule(I, 1042); r.svc.push('udp-53'); r.src.push('tag-afd'); }, { checks: [['three new NSG rules, old one kept', (S, D) => D.preview[0].added.length === 3 && !D.preview[0].removed.length]] })]);

  add('Priorities and names', 'limits', 'Limit warning and a limit breach',
    'db is the destination of 1,800 Rules (one host each). That is above 90 % of the 1,994 custom NSG rules counted per NSG. A Change set adds 200 more. Step 3 shows the address limit: one Rule with an Address group of 6,100 hosts.',
    ['Version 1: a warning, no block.', 'Step 2: the Change set is blocked; the message names the NSG, the limit, the count and the Rules with the most NSG rules there.', 'Step 3: 6,100 source prefixes against 6,000 per side.'],
    [V('Version 1: 1,800 Rules into db', () => world(['db'], { edit: I => { for (let i = 0; i < 1800; i++) { const id = 'h' + i; I.objects[id] = { kind: 'host', value: `172.20.${i >> 8}.${i & 255}`, name: id }; I.rules.push(R(10000 + i, 'partner ' + i, [id], ['zone:db'], ['https'])); } } }),
      { checks: [['warning', (S, D) => D.out.warnings.some(w => /NSG rules/.test(w.text))], ['no error', (S, D) => !D.out.errors.length]] }),
     C('Change set: 200 more Rules', I => { for (let i = 1800; i < 2000; i++) { const id = 'h' + i; I.objects[id] = { kind: 'host', value: `172.20.${i >> 8}.${i & 255}`, name: id }; I.rules.push(R(10000 + i, 'partner ' + i, [id], ['zone:db'], ['https'])); } }, { checks: [['blocked', (S, D) => D.out.errors.some(e => e.limit === 'NSG rules')]] }),
     V('Separate Version: one Rule with 6,100 hosts', () => world(['db'], { edit: I => { const m = []; for (let i = 0; i < 6100; i++) { const id = 'g' + i; I.objects[id] = { kind: 'host', value: `172.21.${i >> 8}.${i & 255}`, name: id }; m.push(id); } I.objects.partners = { kind: 'group', name: 'partners', members: m }; I.rules.push(R(1, 'partners to db', ['partners'], ['zone:db'], ['https'])); } }),
      { checks: [['address limit breached', (S, D) => D.out.errors.some(e => e.limit === 'source prefixes')]] })]);

  // ======================= ASGs =======================
  const asgWorld = (zones, objs, rules, edit) => world(zones, { objects: objs, rules, edit });
  add('ASGs', 'asg-asg', 'ASG to ASG in one VNet',
    'ASG objects web-servers (two VMs in Zone web) and db-servers (one VM in Zone db), all in spoke1. web is strict.',
    ['Both NSG rules reference Managed ASGs on both sides: asg-web-servers-spoke1 → asg-db-servers-spoke1.', 'Two Managed ASGs, one per object in spoke1.'],
    [V('Version 1', () => asgWorld([['web', { posture: 'strict' }], 'db'], { 'asg-web': asg('web-servers', ['nic-web1', 'nic-web2']), 'asg-db': asg('db-servers', ['nic-db1']) }, [R(1, 'web servers to db servers', ['asg-web'], ['asg-db'], ['sql'])]),
      { checks: [['ASG on both sides', (S, D) => { const r = of(D, 'db', 'in', 1)[0]; return r.src.kind === 'asgs' && r.dst.kind === 'asgs'; }], ['two Managed ASGs', (S, D) => Object.keys(D.out.asgs).length === 2]] })]);

  add('ASGs', 'asg-spokes', 'An ASG object across two spokes',
    'ASG object web-servers has one member in spoke1 (Zone web) and one in spoke2 (Zone api, strict). Rule: web-servers → db (spoke1).',
    ['db inbound: one NSG rule with the Managed ASG of spoke1 and one with the member IP from spoke2 (ASGs and prefixes never share a side).', 'api outbound (strict): source is the Managed ASG of spoke2.', 'Two Managed ASGs: one per VNet that holds members.'],
    [V('Version 1', () => asgWorld(['web', ['api', { posture: 'strict' }], 'db'], { 'asg-web': asg('web-servers', ['nic-web1', 'nic-api1']) }, [R(1, 'web servers to db', ['asg-web'], ['zone:db'], ['sql'])]),
      { checks: [['two NSG rules on db', (S, D) => of(D, 'db', 'in', 1).length === 2], ['IP fallback 10.2.1.4', (S, D) => of(D, 'db', 'in', 1).some(r => r.src.fallback && r.src.prefixes.join() === '10.2.1.4')], ['api outbound uses spoke2 ASG', (S, D) => of(D, 'api', 'out', 1)[0].src.asgs.join() === 'asg-web-servers-spoke2']] })]);

  add('ASGs', 'asg-pg', 'An ASG object on a PostgreSQL flexible server Zone',
    'pg holds a PostgreSQL flexible server, which takes no ASGs in NSG rules. Rule: web-servers → pg postgres.',
    ['pg inbound uses the member IPs of every member, also of the member in its own VNet (spoke2).'],
    [V('Version 1', () => asgWorld(['web', 'api', 'pg'], { 'asg-web': asg('web-servers', ['nic-web1', 'nic-api1']) }, [R(1, 'web servers to postgres', ['asg-web'], ['zone:pg'], ['pgsql'])]),
      { checks: [['only IPs on pg', (S, D) => of(D, 'pg', 'in', 1).length === 1 && of(D, 'pg', 'in', 1)[0].src.prefixes.join() === '10.1.1.4,10.2.1.4']] })]);

  add('ASGs', 'ext-asg', 'An External ASG object with scale-set members',
    'The API team\'s IaC owns the Unmanaged ASG asg-vmss-api; its scale-set instances in Zone api are members. The tool reads them and never writes. api is strict.',
    ['db inbound (spoke1): the instances\' IPs.', 'api outbound (spoke2): the Unmanaged ASG by its own name.', 'No Managed ASG.'],
    [V('Version 1', () => asgWorld([['api', { posture: 'strict' }], 'db'], { 'vmss-api': { kind: 'extasg', asgName: 'asg-vmss-api', vnet: 'spoke2', name: 'vmss-api (External)', members: ['nic-vmss0', 'nic-vmss1'] } }, [R(1, 'api scale set to db', ['vmss-api'], ['zone:db'], ['sql'])]),
      { checks: [['IPs on db', (S, D) => of(D, 'db', 'in', 1)[0].src.prefixes.join() === '10.2.1.10,10.2.1.11'], ['Unmanaged ASG on api', (S, D) => of(D, 'api', 'out', 1)[0].src.asgs.join() === 'asg-vmss-api'], ['no Managed ASG', (S, D) => !Object.keys(D.out.asgs).length]] })]);

  add('ASGs', 'asg-outside', 'An ASG member outside every Zone',
    'ASG object jump-hosts has one member in hub/mgmt, a subnet that is not a Zone. Rule: jump-hosts → web ssh.',
    ['The object covers no Zone, so no outbound NSG rule anywhere.', 'web inbound uses the member IP (another VNet).', 'The Managed ASG asg-jump-hosts-hub still exists, because the member is written into it.'],
    [V('Version 1', () => asgWorld(['web'], { 'asg-jump': asg('jump-hosts', ['nic-jump1']) }, [R(1, 'jump hosts ssh to web', ['asg-jump'], ['zone:web'], ['ssh'])]),
      { checks: [['IP on web', (S, D) => of(D, 'web', 'in', 1)[0].src.prefixes.join() === '10.0.9.4'], ['Managed ASG in hub', (S, D) => !!D.out.asgs['asg-jump-hosts-hub']]] })]);

  add('ASGs', 'asg-empty', 'An empty ASG object',
    'ASG object batch-servers has no members yet.',
    ['No NSG rule, the Rule is marked "no effect", no Managed ASG.'],
    [V('Version 1', () => asgWorld(['db'], { 'asg-batch': asg('batch-servers', []) }, [R(1, 'batch to db', ['asg-batch'], ['zone:db'], ['sql'])]),
      { checks: [['no effect', (S, D) => D.out.noEffect.includes(1)], ['no Managed ASG', (S, D) => !Object.keys(D.out.asgs).length]] })]);

  add('ASGs', 'asg-delete', 'IP fallback: a deleted member\'s IP leaves allow Rules on its own',
    'web-servers has members in spoke1 and spoke2; db (spoke1) holds the spoke2 member\'s IP. The VM in spoke2 is deleted in Azure. The tool removes its IP from allow Rules without Approval (issue 27, point 14). Step 3 repeats it with the object also in a deny Rule.',
    ['Step 2: the tool\'s Change set removes the member; db loses one NSG rule; it only closes, so no Approval.', 'Step 3/4: the same object is also in "deny web-servers → app ssh". Removing the member closes on the allow Rule and opens on the deny Rule (the IP leaves a deny). A member belongs to the object, not to one Rule, so the tool cannot remove it from the allow Rule only. Open question.'],
    [V('Version 1', () => asgWorld(['web', 'api', 'db'], { 'asg-web': asg('web-servers', ['nic-web1', 'nic-api1']) }, [R(1, 'web servers to db', ['asg-web'], ['zone:db'], ['sql'])])),
     C('Azure: vm-api1 is deleted; the tool prepares the removal', (I, S) => { delete I.nics['nic-api1']; I.objects['asg-web'].members = ['nic-web1']; S.note = 'Change set prepared by the tool, Author: the tool. ' + E.rulesUsing(S.committed.inst, 'asg-web').map(r => `Rule ${r.id} (${r.action}): removing the member ${r.action === 'allow' ? 'only closes' : 'opens'}`).join('; ') + '.'; },
      { checks: [['IP partition gone from db', (S, D) => of(D, 'db', 'in', 1).length === 1], ['only closes', (S, D) => E.rulesUsing(S.committed.inst, 'asg-web').every(r => r.action === 'allow')]] }),
     V('Version 1b: the object is also in a deny Rule', () => asgWorld(['web', 'api', 'app', 'db'], { 'asg-web': asg('web-servers', ['nic-web1', 'nic-api1']) }, [R(2, 'web servers no ssh to app', ['asg-web'], ['zone:app'], ['ssh'], 'deny'), R(1, 'web servers to db', ['asg-web'], ['zone:db'], ['sql'])])),
     C('Azure: vm-api1 is deleted again', (I, S) => { delete I.nics['nic-api1']; I.objects['asg-web'].members = ['nic-web1']; S.note = E.rulesUsing(S.committed.inst, 'asg-web').map(r => `Rule ${r.id} (${r.action}): removing the member ${r.action === 'allow' ? 'closes' : 'opens (the IP leaves a deny Rule)'}`).join('; ') + '. Not automatic as one member removal.'; },
      { checks: [['one allow and one deny use the object', (S, D) => E.rulesUsing(S.committed.inst, 'asg-web').map(r => r.action).sort().join() === 'allow,deny']] })]);

  add('ASGs', 'asg-tf-dual', 'A dual-stack ASG member in a Terraform Environment',
    'spoke3 belongs to a Terraform Environment. ASG object dual-servers has one VM with an IPv4 and an IPv6 address. The azurerm association writes ASG membership on IPv4 IP configurations only, so the IPv6 address goes through the IP fallback, also inside the ASG\'s VNet.',
    ['dual2 inbound: the Managed ASG (IPv4 and IPv6 destination) plus one NSG rule with the member\'s IPv6 address.', 'Step 2 (ARM): no IPv6 fallback; whether ARM needs it waits for the empirical check.'],
    [V('Version 1', () => world(['dual', 'dual2'], { objects: { 'asg-dual': asg('dual-servers', ['nic-dual1']) }, rules: [R(1, 'dual servers to dual2', ['asg-dual'], ['zone:dual2'], ['https'])], edit: I => { I.vnets.spoke3.env = 'tf'; } }),
      { checks: [['IPv6 fallback present', (S, D) => of(D, 'dual2', 'in', 1).some(r => r.src.fallback && r.src.prefixes.join() === 'fd00:3:0:1::4')]] }),
     C('Change set: the same in an ARM Environment', I => { I.vnets.spoke3.env = 'prod'; }, { checks: [['no fallback', (S, D) => !of(D, 'dual2', 'in', 1).some(r => r.src.fallback)]] })]);

  // ======================= Write order =======================
  add('Write order', 'no-edge', 'An everyday Change set needs no order',
    'web is strict; db has the Inherited default "inbound from VirtualNetwork". The Change set replaces "allow web → db https" by "allow web → db ssh" (the case that the first form of ADR 0018 rejected).',
    ['No Crossing flow: db lets web in on both ports in both states, so db neither closes nor opens.', 'One step, both NSGs in parallel.'],
    [V('Version 1', () => world([['web', { posture: 'strict' }], ['db', { inherit: { inVNet: true } }]], { rules: [R(1, 'web to db https', ['zone:web'], ['zone:db'], ['https'])] })),
     C('Change set: https becomes ssh', I => { I.rules = [R(2, 'web to db ssh', ['zone:web'], ['zone:db'], ['ssh'])]; }, { checks: [['no edges', (S, D) => !edgesOf(D).length], ['one step', (S, D) => D.plan.levels.length === 1]] })]);

  const tagWorld = rules => world([['web', { posture: 'strict' }], ['api', { posture: 'strict' }]], { rules });
  add('Write order', 'crossing', 'A Crossing flow: the closing NSG goes first',
    'Imported Rules with the VirtualNetwork tag land on one side only. Old: "web → VirtualNetwork ssh" opens web outbound. New: it is gone, and "VirtualNetwork → api ssh" opens api inbound. Both Versions deny web → api ssh, because web and api are strict. Written in the wrong order (api first), the flow would be open.',
    ['One edge: NSG of web before NSG of api.', 'The witness flow and the tag case under which it crosses: web and api are in spokes that are not peered, so the engine does not know whether VirtualNetwork holds the other spoke. With a UDR to the hub firewall it does, because Azure adds UDR prefixes to the tag.'],
    [V('Version 1', () => tagWorld([R(1, 'web ssh to vnet', ['zone:web'], ['tag-vnet'], ['ssh'])])),
     C('Change set', I => { I.rules = [R(2, 'vnet ssh to api', ['tag-vnet'], ['zone:api'], ['ssh'])]; }, { checks: [['edge web before api', (S, D) => edgesOf(D).join() === 'web>api'], ['two steps', (S, D) => D.plan.levels.length === 2]] })]);

  add('Write order', 'tag-both', 'A service tag evaluated both ways',
    'api has the Inherited default "inbound from VirtualNetwork". Old: web is destination-enforced and "deny web → api" closes the flow on api. New: the deny is gone and web becomes strict, so web\'s Deny-all closes it. Whether api lets web in now depends on whether api\'s VirtualNetwork tag contains web (spoke1), which the engine cannot read.',
    ['The engine evaluates both cases and unites the edges: NSG of web before NSG of api.', 'An engine that assumed "the tag does not contain web" would find no edge, and writing api first would open web → api.'],
    [V('Version 1', () => world(['web', ['api', { inherit: { inVNet: true } }]], { rules: [R(1, 'web may not reach api', ['zone:web'], ['zone:api'], ['any'], 'deny')] })),
     C('Change set: drop the deny, web becomes strict', I => { I.rules = []; I.zones.web.posture = 'strict'; }, { checks: [['edge web before api', (S, D) => edgesOf(D).join() === 'web>api'], ['found under the case "contains"', (S, D) => D.plan.edges.find(e => e.kind === 'crossing').witness.cases.some(c => /VirtualNetwork contains/.test(c))]] })]);

  add('Write order', 'cycle', 'A cycle fails validation, and the split',
    'The Change set swaps one-sided tag Rules in both directions: ssh from web to api, and rdp from api to web. Each flow crosses, in opposite directions.',
    ['Step 2: edges web → api and api → web: a cycle. Validation fails and the Preview names both flows.', 'Step 3/4: split into a closing Commit and an opening Commit; neither has a cycle.'],
    [V('Version 1', () => tagWorld([R(1, 'web ssh to vnet', ['zone:web'], ['tag-vnet'], ['ssh']), R(2, 'api rdp to vnet', ['zone:api'], ['tag-vnet'], ['rdp'])])),
     C('Change set (unsplit)', I => { I.rules = [R(3, 'vnet ssh to api', ['tag-vnet'], ['zone:api'], ['ssh']), R(4, 'vnet rdp to web', ['tag-vnet'], ['zone:web'], ['rdp'])]; }, { checks: [['cycle error', (S, D) => errKinds(D).includes('cycle')]] }),
     C('Split, Commit 1: only the closing part', I => { I.rules = []; }, { checks: [['no cycle', (S, D) => !errKinds(D).includes('cycle')]] }),
     K('Commit (Version 2)'),
     C('Split, Commit 2: the opening part', I => { I.rules = [R(3, 'vnet ssh to api', ['tag-vnet'], ['zone:api'], ['ssh']), R(4, 'vnet rdp to web', ['tag-vnet'], ['zone:web'], ['rdp'])]; }, { checks: [['no cycle', (S, D) => !errKinds(D).includes('cycle')]] })]);

  const memberObjs = () => ({ 'asg-admin': asg('admins', ['nic-web1']), 'asg-batch': asg('batch', ['nic-web2']) });
  const memberRules = () => [R(1, 'admins rdp to db', ['asg-admin'], ['zone:db'], ['rdp']), R(2, 'batch to db', ['asg-batch'], ['zone:db'], ['sql'])];
  add('Write order', 'members', 'The three ASG member steps',
    'ASG objects admins (vm-web1) and batch (vm-web2) are allowed into db. The Change set removes vm-web1 from admins, adds vm-app1 to batch, and adds a new Rule on db.',
    ['Step 1: vm-web1 leaves admins (it only closes under the Deployed NSG contents).', 'Step 2: the NSG of db.', 'Step 3: vm-app1 joins batch (it only opens under the target).', 'Step 3 of this example: vm-web2 moves from batch to admins in one network interface write, and vm-app1 joins batch. No NSG changes. The move closes sql and opens rdp, so it fits neither step and the Change set fails validation, although the write is atomic and no NSG write can mix with it. Open question.'],
    [V('Version 1', () => world(['web', 'app', 'db'], { objects: memberObjs(), rules: memberRules() })),
     C('Change set', I => { I.objects['asg-admin'].members = []; I.objects['asg-batch'].members.push('nic-app1'); I.rules.push(R(3, 'web https to db', ['zone:web'], ['zone:db'], ['https'])); },
      { checks: [['vm-web1 in step 1, vm-app1 in step 3', (S, D) => D.plan.members.find(m => m.nic === 'nic-web1').step === 1 && D.plan.members.find(m => m.nic === 'nic-app1').step === 3], ['three levels', (S, D) => D.plan.levels.length === 3]] }),
     C('Other Change set on Version 1: vm-web2 moves to admins, vm-app1 joins batch', (I, S) => { S.inst = E.clone(S.committed.inst); I = S.inst; I.objects['asg-batch'].members = ['nic-app1']; I.objects['asg-admin'].members.push('nic-web2'); },
      { checks: [['fails validation', (S, D) => errKinds(D).includes('member')], ['no NSG write', (S, D) => !D.plan.writes.some(w => w.kind === 'nsg')]] })]);

  add('Write order', 'failed', 'A failed write delays only the writes with an edge from it',
    'The Change set of "A Crossing flow" plus unrelated changes on db and app. One edge: web before api.',
    ['Step 3: the NSG of web fails. api waits; db and app are written. There is no hold on Affected Zones.', 'Step 4: the NSG of db fails instead. Nothing waits.', 'Step 5: a newer Version is committed while web still has its old content. Its Deployment plans from the Deployed state, so api still waits for web.'],
    [V('Version 1', () => world([['web', { posture: 'strict' }], ['api', { posture: 'strict' }], 'app', 'db'], { rules: [R(1, 'web ssh to vnet', ['zone:web'], ['tag-vnet'], ['ssh'])] })),
     C('Change set', I => { I.rules = [R(2, 'vnet ssh to api', ['tag-vnet'], ['zone:api'], ['ssh']), R(3, 'any https to db', ['any'], ['zone:db'], ['https']), R(4, 'onprem to app', ['onprem'], ['zone:app'], ['rdp'])]; }),
     X('Deployment: the NSG of web fails', S => { S.failed = ['nsg:web']; }, { checks: [['only api waits', (S, D) => D.waiting.join() === 'nsg:api']] }),
     X('Instead: the NSG of db fails', S => { S.failed = ['nsg:db']; }, { checks: [['nothing waits', (S, D) => !D.waiting.length]] }),
     X('Next Version while web still fails', S => {
       const v1 = S.committed.out; commit(S); S.failed = null; // Version 2 was committed; its Deployment is the one that failed
       const dep = { inst: S.committed.inst, out: E.clone(S.committed.out) }; dep.out.nsgs.web = v1.nsgs.web; dep.out.nsgs.api = v1.nsgs.api; // db and app were written
       S.deployed = dep; S.inst = E.clone(S.inst); S.inst.rules.push(R(5, 'web https to app', ['zone:web'], ['zone:app'], ['https'])); S.pending = true;
       S.note = 'Deployed state: web and api still old (web failed, api waited), db and app new. The new Deployment delivers the rest.'; },
      { checks: [['edge web before api remains', (S, D) => edgesOf(D).includes('web>api')]] })]);

  add('Write order', 'retire', 'Zone removal and its Retired NSG',
    'Zone web is removed. Its NSG becomes a Retired NSG (Platform exceptions and Deny-all only), and "deny web → db" goes, because it names web. "allow 10.0.0.0/8 → db" stays.',
    ['Old: db denies web. New: the Retired NSG denies outbound. Written in the wrong order (db first), old web lets internal traffic out and new db lets 10.0.0.0/8 in.', 'Edge: NSG of web (retire) before NSG of db.'],
    [V('Version 1', () => world(['web', 'db'], { rules: [R(1, 'web may not reach db', ['zone:web'], ['zone:db'], ['any'], 'deny'), R(2, 'internal to db', ['net10'], ['zone:db'], ['any'])] })),
     C('Change set: remove Zone web', I => { I.zones.web.state = 'retired'; I.rules = I.rules.filter(r => r.id !== 1); }, { checks: [['edge web before db', (S, D) => edgesOf(D).join() === 'web>db']] })]);

  add('Write order', 'legacy', 'First Commit of an NSG adopted in place',
    'db\'s existing NSG has only the Azure default rules; AllowVnetInBound lets the VNet in. db is onboarded in place and its legacy NSG is the Deployed state. In the same Change set web switches from strict to destination-enforced. Step 2 opts db out of Inherited defaults; step 3 keeps the default.',
    ['Step 2: old web denies web → db, new db denies it. Written web first, new web lets it out and legacy db lets it in. Edge: NSG of db before NSG of web.', 'Step 3 (Inherited defaults kept, the default): db still lets the VNet in, so nothing crosses.'],
    [V('Deployed state: db with its legacy NSG', () => world([['web', { posture: 'strict' }], ['db', { state: 'legacy', nsg: 'nsg-db-legacy', legacy: { name: 'nsg-db-legacy', in: [], out: [] } }]])),
     C('Onboarding Change set, db opts out of Inherited defaults', I => { I.zones.db = Object.assign({}, I.zones.db, { state: 'managed', inherit: {}, adopted: true }); delete I.zones.db.legacy; I.zones.web.posture = 'dest'; }, { checks: [['edge db before web', (S, D) => edgesOf(D).join() === 'db>web']] }),
     C('Same, with Inherited defaults (the Import default)', I => { I.zones.db.inherit = { inVNet: true, outVNet: true, outInternet: true }; }, { checks: [['no edge', (S, D) => !edgesOf(D).length]] })]);

  // ======================= Terraform =======================
  add('Terraform', 'contract', 'A Data contract for one root module',
    'spoke3 (subscription sub-app3) belongs to a Terraform Environment. The tool writes one JSON file per root module; the repository\'s HCL reads it.',
    ['Full rule list per NSG with names and priorities, flush_connection from the Environment, subnet associations, Managed ASGs, network interface memberships.', 'The dual-stack member\'s IPv6 address is in the NSG rules through the IP fallback.'],
    [V('Version 7', () => world(['dual', 'dual2'], { objects: { 'asg-dual': asg('dual-servers', ['nic-dual1']) }, rules: [R(1, 'dual servers to dual2', ['asg-dual'], ['zone:dual2'], ['https']), R(2, 'any to dual', ['any'], ['zone:dual'], ['https'])], edit: I => { I.vnets.spoke3.env = 'tf'; } }),
      { panel: (S, D) => [{ title: 'Data contract: envs/sub-app3/nsgfw.json', kind: 'json', value: E.dataContract(S.inst, D.out, 'sub-app3', 'v7') }], checks: [['two NSGs in the contract', (S, D) => Object.keys(E.dataContract(S.inst, D.out, 'sub-app3', 'v7').network_security_groups).length === 2]] })]);

  add('Terraform', 'pr-steps', 'One Deployment with an edge: one pull request per step',
    'The Crossing-flow Change set in the Terraform Environment: dual and dual2 are strict, and the VirtualNetwork Rules swap sides.',
    ['Two pull requests: the first changes the NSG of dual (closes), the second the NSG of dual2 (opens). The tool opens the second only after Azure shows the first target.', 'Each pull request carries the whole Data contract, with the later NSG still at its Deployed content.'],
    [V('Version 1', () => world([['dual', { posture: 'strict' }], ['dual2', { posture: 'strict' }]], { rules: [R(1, 'dual ssh to vnet', ['zone:dual'], ['tag-vnet'], ['ssh'])], edit: I => { I.vnets.spoke3.env = 'tf'; } })),
     C('Change set', I => { I.rules = [R(2, 'vnet ssh to dual2', ['tag-vnet'], ['zone:dual2'], ['ssh'])]; },
      { panel: (S, D) => D.plan.prSteps.map((ids, k) => ({ title: `Pull request ${k + 1} of ${D.plan.prSteps.length}`, kind: 'list', value: ids.map(id => D.plan.writes.find(w => w.id === id).label) })), checks: [['two pull requests', (S, D) => D.plan.prSteps.length === 2 && D.plan.prSteps[0].join() === 'nsg:dual']] })]);

  // ======================= Import =======================
  const legacyBilling = { name: 'nsg-billing', in: [
    { name: 'allow-web-https', priority: 100, access: 'Allow', proto: 'Tcp', ports: '443', src: '10.1.1.0/24', dst: '*' },
    { name: 'deny-spoke1-https', priority: 200, access: 'Deny', proto: 'Tcp', ports: '443', src: '10.1.0.0/16', dst: '*' },
    { name: 'allow-onprem-rdp', priority: 300, access: 'Allow', proto: 'Tcp', ports: '3389', src: '192.168.10.0/24', dst: '*' }],
    out: [{ name: 'billing-to-db', priority: 100, access: 'Allow', proto: 'Tcp', ports: '1433', src: '*', dst: '10.1.3.0/24' },
      { name: 'deny-internet', priority: 110, access: 'Deny', proto: '*', ports: '*', src: '*', dst: 'Internet' }] };
  function doImport(S, zid, legacy, existing, opt) {
    const I = S.inst, imp = E.importNsg(I, zid, legacy, opt); let n = 100;
    imp.rules.forEach(r => (r.id = n++));
    Object.assign(I.objects, imp.newObjects); Object.assign(I.services, imp.newServices);
    const policies = E.uniq(imp.rules.map(r => r.policy)).map(p => imp.rules.filter(r => r.policy === p));
    const m = E.constraintMerge(existing || I.rules, policies, I);
    I.rules = m.order.map(r => { const x = E.clone(r); delete x.policy; return x; });
    I.zones[zid] = Object.assign({}, I.zones[zid], { state: 'managed', inherit: imp.flags, adopted: true }); delete I.zones[zid].legacy;
    return { imp, m };
  }
  function importPanel(S, D, zid) {
    const r = S.importResult, rows = [];
    r.imp.rules.forEach(x => rows.push([`Rule ${x.id}`, x.name, `${x.imported.nsg} ${x.imported.dir} ${x.imported.priority}`, x.src.map(s => E.refLabel(S.inst, s)).join(', ') + ' → ' + x.dst.map(s => E.refLabel(S.inst, s)).join(', ')]));
    const fc = ['in', 'out'].map(d => ({ d, c: E.zoneFlowChanges(S.committed.out.nsgs[zid], D.out.nsgs[zid], zid, S.inst, d, 6) }));
    return [{ title: 'Imported Rules and their provenance', kind: 'table', head: ['Rule', 'name', 'from', 'source → destination'], rows },
      { title: 'Merge constraints', kind: 'list', value: r.m.edges.filter(e => e.kind !== 'order').map(e => `${e.kind === 'deny-first' ? 'deny first' : 'cycle broken'}: Rule ${e.a} before Rule ${e.b}`) },
      { title: 'Import notes', kind: 'list', value: r.imp.notes.concat(r.m.notes).map(n => `${n.level}: ${n.text}`).concat(fc.flatMap(({ d, c }) => [].concat(c.openCount ? [`warning: ${c.openCount} ${d}bound address pair(s) open against the old NSG, e.g. ${c.opens.slice(0, 3).map(o => o.flow + ' by ' + o.by).join('; ')}`] : [], c.closeCount ? [`info: ${c.closeCount} ${d}bound address pair(s) close against the old NSG, e.g. ${c.closes.slice(0, 3).map(o => o.flow + ' by ' + o.by).join('; ')}`] : []))) },
      { title: 'Inherited defaults set by Import', kind: 'list', value: Object.entries(r.imp.flags).map(([k, v]) => `${k}: ${v ? 'set' : 'not set'}`) }];
  }
  add('Import', 'merge', 'The constraint merge',
    'Zone billing is onboarded in place. Its legacy NSG has three inbound and two outbound rules. The Rule base already has three Rules. Import makes one Rule per NSG rule and merges them.',
    ['Each legacy (NSG, direction) keeps its order; the existing Rules keep theirs.', 'Where Rules of different policies overlap with different actions, the deny comes first: the imported "deny spoke1 https" goes above the existing "web to anything https".', 'Imported Rules otherwise go as low as their constraints allow (a prototype choice; the verdict is the same either way).', 'Import notes compare the new NSG of billing with the legacy one: the existing telnet deny now closes telnet into billing.'],
    [V('Deployed state: Rule base and legacy NSG', () => world(['web', 'db', ['billing', { state: 'legacy', nsg: 'nsg-billing', legacy: legacyBilling }]], { rules: [R(1, 'no telnet', ['any'], ['net10'], ['telnet'], 'deny'), R(2, 'web to anything https', ['zone:web'], ['any'], ['https']), R(3, 'spoke1 sql to db', ['spoke1-net'], ['zone:db'], ['sql'])] })),
     C('Onboarding Change set with Import', (I, S) => { S.importResult = doImport(S, 'billing', legacyBilling); },
      { panel: (S, D) => importPanel(S, D, 'billing'), checks: [['order E1, I1, I2, E2, I4, I5, E3, I3', (S, D) => S.inst.rules.map(r => r.id).join() === '1,100,101,2,103,104,3,102'], ['outbound Internet flag not set', (S, D) => !S.importResult.imp.flags.outInternet], ['telnet into billing closes', (S, D) => E.zoneFlowChanges(S.committed.out.nsgs.billing, D.out.nsgs.billing, 'billing', S.inst, 'in').closes.some(c => /Tcp\/23/.test(c.flow))]] })]);

  const legacyCycle = { name: 'nsg-billing', in: [
    { name: 'allow-app-8080', priority: 100, access: 'Allow', proto: 'Tcp', ports: '8080', src: '10.1.2.0/24', dst: '*' },
    { name: 'deny-spoke1-8000s', priority: 200, access: 'Deny', proto: 'Tcp', ports: '8000-8100', src: '10.1.0.0/16', dst: '*' }], out: [] };
  add('Import', 'cycle-break', 'A cycle broken toward closing',
    'Existing: "allow spoke1 → any 8080" above "deny any → any 8000-8100". Legacy billing: "allow app 8080" above "deny spoke1 8000-8100". The constraints form a cycle.',
    ['The imported deny moves above the imported allow. That only closes flows: app → billing 8080, which the legacy NSG allowed.', 'A warning Import note lists it.'],
    [V('Deployed state', () => world(['app', ['billing', { state: 'legacy', nsg: 'nsg-billing', legacy: legacyCycle }]], { rules: [R(1, 'spoke1 to 8080', ['spoke1-net'], ['any'], ['tcp-8080']), R(2, 'no 8000s', ['any'], ['any'], ['tcp-8000s'], 'deny')] })),
     C('Onboarding Change set with Import', (I, S) => { S.importResult = doImport(S, 'billing', legacyCycle); },
      { panel: (S, D) => importPanel(S, D, 'billing'), checks: [['cycle broken', (S, D) => S.importResult.m.edges.some(e => e.kind === 'cycle-break')], ['app → billing 8080 closes', (S, D) => !E.flowAllowed(S.inst, D.out, {}, { s: E.ip('10.1.2.9'), d: E.ip('10.1.4.9'), proto: 'Tcp', port: 8080 }, 'app', 'billing').some(x => x)]] })]);

  const legacyHr = { name: 'nsg-hr', in: [
    { name: 'allow-onprem-rdp', priority: 100, access: 'Allow', proto: 'Tcp', ports: '3389', src: '192.168.10.0/24', dst: '*' },
    { name: 'deny-all-in', priority: 4000, access: 'Deny', proto: '*', ports: '*', src: '*', dst: '*' }], out: [] };
  add('Import', 'inherited', 'Inherited defaults in the band 4090–4095, and a merge proposal',
    'billing (legacy NSG without a custom deny-all) and hr (legacy NSG with "deny-all-in") are onboarded in one Change set. Both have "allow-onprem-rdp".',
    ['billing gets all three Inherited defaults at 4090/4091; hr gets none inbound, because its custom deny-all shadowed AllowVnetInBound. The custom deny-all is dropped as redundant (info).', 'The two rdp Rules differ only in their own Zone: the Change set proposes one Rule with both Zones, and the merge keeps the order constraints.'],
    [V('Deployed state', () => world([['billing', { state: 'legacy', nsg: 'nsg-billing', legacy: legacyBilling }], ['hr', { state: 'legacy', nsg: 'nsg-hr', legacy: legacyHr }], 'db', 'web'], { rules: [] })),
     C('Onboarding Change set with Import of both', (I, S) => {
       const a = E.importNsg(I, 'billing', legacyBilling), b = E.importNsg(I, 'hr', legacyHr); let n = 100;
       a.rules.concat(b.rules).forEach(r => (r.id = n++)); [a, b].forEach(x => { Object.assign(I.objects, x.newObjects); Object.assign(I.services, x.newServices); });
       const pols = E.uniq(a.rules.concat(b.rules).map(r => r.policy)).map(p => a.rules.concat(b.rules).filter(r => r.policy === p));
       const m = E.constraintMerge([], pols, I); I.rules = m.order.map(r => { const x = E.clone(r); delete x.policy; return x; });
       I.zones.billing = Object.assign({}, I.zones.billing, { state: 'managed', inherit: a.flags, adopted: true }); I.zones.hr = Object.assign({}, I.zones.hr, { state: 'managed', inherit: b.flags, adopted: true });
       delete I.zones.billing.legacy; delete I.zones.hr.legacy;
       S.importBoth = { a, b, m, proposals: E.mergeProposals(a.rules.concat(b.rules), m, I) }; },
      { panel: (S, D) => [{ title: 'Inherited defaults', kind: 'list', value: [`billing: ${JSON.stringify(S.importBoth.a.flags)}`, `hr: ${JSON.stringify(S.importBoth.b.flags)}`] },
        { title: 'Import notes', kind: 'list', value: S.importBoth.a.notes.concat(S.importBoth.b.notes).map(n => `${n.level}: ${n.text}`) },
        { title: 'Merge proposals', kind: 'list', value: S.importBoth.proposals.map(p => `${p.names.join(' + ')} (Rules ${p.rules.join(', ')}): ${p.possible ? 'can merge into one Rule with both Zones' : 'cannot merge'}, ${p.why}`) }],
        checks: [['hr has no inbound flag', (S, D) => !S.importBoth.b.flags.inVNet], ['billing inbound flag at 4090', (S, D) => D.out.nsgs.billing.in.some(r => r.priority === 4090)], ['rdp merge proposed', (S, D) => S.importBoth.proposals.some(p => p.possible && p.names.every(n => n === 'allow-onprem-rdp'))]] })]);

  const legacyBind = { name: 'nsg-billing', in: [{ name: 'allow-app-half-https', priority: 100, access: 'Allow', proto: 'Tcp', ports: '443', src: '10.1.2.0/25', dst: '*' }], out: [] };
  add('Import', 'import-binding', 'How Import could use VNet bindings',
    'billing (spoke1) is onboarded. Its legacy NSG lets 10.1.2.0/25 in on 443. That prefix is part of Zone app (spoke1) and of Zone labapp in the unconnected VNet lab, so Import creates a CIDR object (issue 18). labapp is strict. In lab, 10.1.4.0/24 (billing\'s prefix) is a client subnet that is not a Zone.',
    ['Step 2 (as decided): the new object covers labapp too, so the imported Rule lands outbound on labapp and opens labapp → lab clients on 443, in a VNet the old NSG could never see.', 'Step 3 (prototype proposal): Import binds the new object to the VNets connected to billing\'s VNet. It then covers only app.'],
    [V('Deployed state', () => world([['app', { posture: 'strict' }], ['labapp', { posture: 'strict' }], ['billing', { state: 'legacy', nsg: 'nsg-billing', legacy: legacyBind }]], { rules: [] })),
     C('Import as decided (no binding)', (I, S) => { S.importResult = doImport(S, 'billing', legacyBind); }, { panel: (S, D) => importPanel(S, D, 'billing'), checks: [['lands on labapp', (S, D) => D.out.cost[100].nsgs.includes('labapp')]] }),
     C('Import with the binding proposal', (I, S) => { S.inst = E.clone(S.committed.inst); S.importResult = doImport(S, 'billing', legacyBind, null, { bindings: 'connected' }); }, { panel: (S, D) => importPanel(S, D, 'billing'), checks: [['not on labapp', (S, D) => !D.out.cost[100].nsgs.includes('labapp')]] })]);

  // ======================= Change workflow =======================
  add('Change workflow', 'affected', 'Affected Zones under ADR 0016',
    'web, app and db are destination-enforced, api is strict. The Change set adds three Rules. Step 3 switches app to strict.',
    ['"any → db": db (destination) and api (strict source); not web or app.', '"web → Internet": the destination reaches outside Zones, so web counts.', '"app → web": only web.', 'Step 3: app\'s posture change makes app affected, and also web, because Rule 3 uses app (a changed Zone). Is web meant to approve that?'],
    [V('Version 1', () => world(['web', 'app', 'db', ['api', { posture: 'strict' }]], { rules: [] })),
     C('Change set: three Rules', I => { I.rules = [R(1, 'any to db', ['any'], ['zone:db'], ['sql']), R(2, 'web to internet', ['zone:web'], ['tag-internet'], ['https']), R(3, 'app to web', ['zone:app'], ['zone:web'], ['https'])]; }, { checks: [['api, db, web', (S, D) => affected(D) === 'api,db,web']] }),
     K('Commit (Version 2)'),
     C('Change set: app becomes strict', I => { I.zones.app.posture = 'strict'; }, { checks: [['app and web', (S, D) => affected(D) === 'app,web']] })]);

  add('Change workflow', 'rebase', 'Order conflicts at Rebase',
    'A Change set based on Version 5 inserts Rule 9 "allow app host → db ssh" between Rule 2 and Rule 3. Meanwhile Version 6 was committed.',
    ['Case A: Version 6 moved the deny Rule 1 (app → db ssh) below Rule 3. Rule 1 overlaps Rule 9 with the other action, and their order changed: conflict.', 'Case B: Version 6 moved Rule 4 (allow on-premises → db ssh) to the top. Same action: clean Rebase, Approvals kept.'],
    [V('Version 5 and the Change set', S => { const I = world(['web', 'app', 'db'], { objects: { app10: { kind: 'host', value: '10.1.2.10', name: 'app10' } }, rules: [R(1, 'no ssh from app', ['zone:app'], ['zone:db'], ['ssh'], 'deny'), R(2, 'web to db https', ['zone:web'], ['zone:db'], ['https']), R(3, 'spoke1 to db', ['spoke1-net'], ['zone:db'], ['any']), R(4, 'onprem ssh to db', ['onprem'], ['zone:db'], ['ssh']), R(9, 'app10 ssh to db', ['app10'], ['zone:db'], ['ssh'])] });
       const placed = { id: 9, above: 2, below: 3 };
       S.rebase = { A: E.rebase([1, 2, 3, 4], placed, [2, 3, 1, 4], I), B: E.rebase([1, 2, 3, 4], placed, [4, 1, 2, 3], I) }; return I; },
      { panel: S => ['A', 'B'].map(k => ({ title: `Case ${k}`, kind: 'list', value: [`intended order: ${S.rebase[k].intended.join(', ')}`, `after Rebase: ${S.rebase[k].rebased.join(', ')}`, S.rebase[k].conflicts.length ? `conflict with Rule ${S.rebase[k].conflicts.join(', ')}: an author confirms the position` : 'clean Rebase, Approvals kept', S.rebase[k].quiet.length ? `order changed without conflict: Rule ${S.rebase[k].quiet.join(', ')} (same action or no overlap)` : ''].filter(Boolean) })),
        checks: [['case A conflicts with Rule 1', S => S.rebase.A.conflicts.join() === '1'], ['case B clean', S => !S.rebase.B.conflicts.length && S.rebase.B.quiet.join() === '4']] })]);

  add('Change workflow', 'engine-version', 'The engine version in the output',
    'Version 12 was translated by engine 0.1.0, which splits IPv4 and IPv6. A tool upgrade brings engine 0.2.0, which (say, after the empirical check) writes both families in one NSG rule. The Rule base does not change.',
    ['The output carries the engine version.', 'The new engine changes the NSGs for an unchanged Rule base, so the tool prepares a "re-translation" Change set with this Preview instead of changing NSGs with the next Commit and without Approval.'],
    [V('Version 12 (engine 0.1.0)', () => world(['dual', 'dual2'], { rules: [R(1, 'any to dual', ['any'], ['zone:dual'], ['https']), R(2, 'dual to dual2', ['zone:dual'], ['zone:dual2'], ['tcp-8443'])] })),
     X('Upgrade: engine 0.2.0', S => { S.opt = { splitFamilies: false, engineVersion: '0.2.0-prototype' }; S.inst = E.clone(S.inst); S.pending = true; S.note = 'Re-translation Change set prepared by the tool; Affected Zones are the Zones whose NSGs change.'; },
      { checks: [['engine version in output', (S, D) => D.out.engineVersion === '0.2.0-prototype'], ['NSGs change', (S, D) => D.preview.length > 0]] })]);

  // What the prototype asks the map owner to react to (each links to the example that shows it)
  const QUESTIONS = [
    { key: 'internal-import', ex: 'merge', text: 'Imported Zones start destination-enforced, so Import opens outbound traffic from the new Zone to every Internal address outside its VirtualNetwork tag. That breaks "behaviour is preserved by default" for outbound. Accept with a warning Import note, or start imported Zones differently?' },
    { key: 'ipv6-internal', ex: 'dual', text: 'The default Internal address space holds no IPv6 prefix. Between dual-stack Zones, IPv6 then behaves as if every Zone were strict: "any → dual" lands outbound on every dual-stack Zone, which brings back the broad-source cost of ADR 0016 for IPv6. Add unique local addresses (fc00::/7) or the VNets\' IPv6 ranges to the default?' },
    { key: 'member-delete', ex: 'asg-delete', text: 'A deleted ASG member\'s IP leaves allow Rules on its own (issue 27, point 14). When the same object is also in a deny Rule, removing the member opens there. What does the tool do then?' },
    { key: 'member-neither', ex: 'members', text: 'A member change that fits neither step fails validation (ADR 0018), even when it is one atomic network interface write and the Deployment writes no NSG it could mix with. Keep the rule, allow that case, or split such a change into two writes?' },
    { key: 'import-binding', ex: 'import-binding', text: 'Import creates a CIDR object when a prefix matches Zones in unconnected VNets, and the object then lands on Zones in VNets the old NSG never saw. Should Import bind such objects to the VNets connected to the onboarded Zone?' },
    { key: 'posture-affected', ex: 'affected', text: 'A Zone\'s Egress posture change makes every Rule that uses the Zone "changed through a changed Zone", so the Zones on the far side become Affected Zones although their NSGs and verdicts stay the same. Intended?' },
    { key: 'internal-cs', ex: 'internal', text: 'Changing the Internal address space changes the outbound NSG of every destination-enforced Zone but has no Affected Zones. Is it a Change set (with the instance default four-eyes), or an admin setting with its own Approval?' },
    { key: 'egress-band', ex: 'bands', text: 'The egress allow of the destination-enforced posture has no decided priority. The prototype puts it at 4094 (IPv4) and 4095 (IPv6), inside 4090–4095, the band ADR 0011 gives the Inherited defaults. Keep, or move it?' },
    { key: 'first-spread', ex: 'stable', text: 'The first Commit spreads NSG rules evenly over 120–4079 (911, 1703, 2496, 3288). Keep the plain middle-of-the-gap numbers, or round them (for example to multiples of 10) so they read like a firewall\'s?' },
    { key: 'sibling-priority', ex: 'names', text: 'New NSG rules of an existing Rule take the middle of the gap (3089–3091), away from their sibling at 2100. Issue 13 says both: one Rule\'s NSG rules take consecutive priorities (point 6), and a new NSG rule takes the middle of the gap (point 4). Place them next to their siblings when the numbers are free?' },
    { key: 'tag-knowledge', ex: 'crossing', text: 'For Crossing flows the prototype treats addresses of the NSG\'s own VNet and of directly peered VNets as inside VirtualNetwork (documented), and private addresses as outside Azure service tags. Everything else is evaluated both ways. Accept this as engine knowledge?' },
    { key: 'any-internet', ex: 'internet', text: 'Observation: "web → any" opens web to every Zone, because any covers every Zone. Should the Rule editor warn when any is a destination next to a Zone source and offer the Internet tag?' },
    { key: 'pods-shared', ex: 'pods-twice', text: 'Observation: with the same Extra prefix on two Zones, a Rule between them also matches the destination cluster\'s own pods. Warn in the object editor?' }
  ];

  root.Examples = { EX, QUESTIONS, derive, runTo, world, R, commit };
})(typeof window !== 'undefined' ? window : globalThis);
