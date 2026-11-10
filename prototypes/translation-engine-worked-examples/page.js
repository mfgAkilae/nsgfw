// PROTOTYPE, throwaway. Page shell: renders the state of a worked example as HTML strings. The logic lives in engine.js.
(function (root) {
  'use strict';
  const E = root.Engine, X = root.Examples;
  const esc = s => String(s === undefined || s === null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const groups = E.uniq(X.EX.map(e => e.group));
  const cur = { group: groups[0], key: X.EX[0].key, step: 0, S: null, free: false };

  function load(key, step) {
    const ex = X.EX.find(e => e.key === key);
    cur.group = ex.group; cur.key = key; cur.step = Math.min(step || 0, ex.steps.length - 1); cur.free = false;
    cur.S = X.runTo(ex, cur.step);
  }
  const zoneTxt = (I, id) => id;
  function sideTxt(S, s) {
    if (s.kind === 'tag') return `<span class="tag">${esc(s.tag)}</span>`;
    if (s.kind === 'asgs') return s.asgs.map(a => `<span class="asg">${esc(a)}</span>`).join(' ');
    const p = s.prefixes, t = esc(p.length > 4 ? p.slice(0, 4).join(', ') + ` … +${p.length - 4}` : p.join(', '));
    return s.fallback ? `${t} <span class="muted">(member IPs of ${esc((S.inst.objects[s.fallback] || S.committed.inst.objects[s.fallback] || {}).name || s.fallback)})</span>` : t;
  }
  const svcTxt = r => (r.proto === '*' ? 'any' : r.proto + (r.ports.join() === '*' ? '' : ' ' + r.ports.join(', ')));
  const refs = (I, l) => l.map(r => esc(E.refLabel(I, r))).join(', ');
  const svcs = (I, l) => l.map(r => esc(E.svcLabel(I, r))).join(', ');

  function ruleTable(S, D) {
    const I = S.inst, rows = I.rules.slice(0, 12).map((r, i) => {
      const c = D.out.cost[r.id], lands = r.enabled === false ? '<span class="muted">disabled</span>' : !c || !c.nsgRules ? '<span class="warn">no effect</span>' : `${c.nsgs.length} NSG${c.nsgs.length > 1 ? 's' : ''} (${esc(c.nsgs.join(', '))}), ${c.nsgRules} NSG rule${c.nsgRules > 1 ? 's' : ''}`;
      return `<tr class="${r.enabled === false ? 'off' : ''}"><td>${i + 1}</td><td>${r.id}</td><td>${esc(r.name)}${r.imported ? ` <span class="muted">(imported: ${esc(r.imported.nsg)} ${r.imported.dir} ${r.imported.priority})</span>` : ''}</td><td>${refs(I, r.src)}</td><td>${refs(I, r.dst)}</td><td>${svcs(I, r.svc)}</td><td class="${r.action === 'deny' ? 'bad' : 'ok'}">${r.action}</td><td>${lands}</td>
        <td class="nowrap"><button data-act="up" data-id="${r.id}" title="move up">↑</button><button data-act="down" data-id="${r.id}" title="move down">↓</button><button data-act="toggle" data-id="${r.id}">${r.enabled === false ? 'enable' : 'disable'}</button></td></tr>`;
    }).join('');
    const more = I.rules.length > 12 ? `<tr><td colspan="9" class="muted">… ${I.rules.length - 12} more Rules</td></tr>` : '';
    return `<table><tr><th>#</th><th>Rule ID</th><th>Name</th><th>Source</th><th>Destination</th><th>Service</th><th>Action</th><th>Lands on</th><th></th></tr>${rows || '<tr><td colspan="9" class="muted">no Rules</td></tr>'}${more}</table>`;
  }
  function zoneTable(S) {
    const I = S.inst;
    return `<table><tr><th>Zone</th><th>VNet</th><th>Prefixes</th><th>Extra prefixes</th><th>Egress posture</th><th>Inherited defaults</th><th>Kind / state</th><th></th></tr>${Object.entries(I.zones).map(([id, z]) => {
      const inh = Object.entries(z.inherit || {}).filter(([, v]) => v).map(([k]) => ({ inVNet: 'in from VirtualNetwork', outVNet: 'out to VirtualNetwork', outInternet: 'out to Internet' }[k])).join(', ');
      const env = I.envs[I.vnets[z.vnet].env];
      return `<tr><td><b>${esc(id)}</b></td><td>${esc(z.vnet)} <span class="muted">(${esc(env.mode === 'terraform' ? 'Terraform' : 'ARM')})</span></td><td>${esc(z.prefixes.join(', '))}</td><td>${esc((z.extra || []).join(', '))}</td><td>${z.kind === 'appgw' ? 'outbound open (Application Gateway v2)' : z.posture === 'strict' ? 'strict' : 'destination-enforced'}</td><td>${esc(inh)}</td><td>${esc([z.kind && z.kind !== 'normal' ? { pgflex: 'PostgreSQL flexible server', appgw: 'Application Gateway v2' }[z.kind] : '', z.state !== 'managed' ? z.state + ' NSG' : ''].filter(Boolean).join(', '))}</td>
        <td>${z.state === 'managed' && z.kind !== 'appgw' ? `<button data-act="posture" data-zone="${esc(id)}">make ${z.posture === 'strict' ? 'destination-enforced' : 'strict'}</button>` : ''}</td></tr>`;
    }).join('')}</table><p class="muted small">Internal address space: ${esc(I.internal.join(', '))}</p>`;
  }
  function objectTable(S, D) {
    const I = S.inst, used = E.uniq(I.rules.flatMap(r => r.src.concat(r.dst)).filter(r => r !== 'any' && !r.startsWith('zone:')));
    if (!used.length) return '';
    if (used.length > 20) return `<p class="muted">${used.length} Address objects in use.</p>`;
    const val = o => o.kind === 'group' ? (o.members.length > 6 ? `${o.members.length} members` : o.members.map(m => esc(E.refLabel(I, m))).join(', ')) : o.kind === 'asg' || o.kind === 'extasg' ? (o.members.length ? o.members.map(n => I.nics[n] ? `${esc(I.nics[n].name)} (${esc(I.nics[n].ips.join(', '))}, ${esc(I.nics[n].vnet)}/${esc(I.nics[n].subnet)})` : `${esc(n)} (deleted)`).join('; ') : '<span class="warn">no members</span>') : o.kind === 'subnet' ? esc(I.subnets[o.subnet].prefixes.join(', ')) : o.kind === 'vnet' ? esc(I.vnets[o.vnet].space.join(', ')) : esc(o.value);
    const kind = o => ({ host: 'single IP', cidr: 'CIDR range', tag: 'service tag', subnet: 'subnet (not a Zone)', vnet: 'VNet', asg: 'ASG object', extasg: `External ASG object (${o.asgName})`, group: 'Address group' }[o.kind]);
    return `<table><tr><th>Address object</th><th>Kind</th><th>Value / members</th><th>VNet binding</th><th>Coverage</th></tr>${used.map(id => { const o = I.objects[id]; const cov = E.coverage(id, I);
      return `<tr><td>${esc(o.name)}</td><td>${esc(kind(o))}</td><td>${val(o)}</td><td>${esc((o.bind || []).join(', '))}</td><td>${cov.length ? esc(cov.join(', ')) : '<span class="muted">no Zone</span>'}</td></tr>`; }).join('')}</table>`;
  }
  function changedNames(D) {
    const m = {}; (D.preview || []).forEach(p => { p.added.forEach(r => (m[p.zone + r.name] = 'added')); p.changed.forEach(c => (m[p.zone + c.after.name] = 'changed')); p.renumbered.forEach(c => (m[p.zone + c.after.name] = 'renumbered')); }); return m;
  }
  function nsgCard(S, D, z, n, marks) {
    const I = S.inst, label = { platform: 'Platform exception', intra: 'Intra-zone default', inherited: 'Inherited default', egress: 'Egress posture', denyall: 'Deny-all rule', legacy: 'legacy NSG rule' };
    const prevN = S.committed && S.pending ? S.committed.out.nsgs[z] : null;
    const tbl = (dir) => {
      const list = n[dir], rows = list.slice(0, 14).map(r => {
        const mk = marks[z + r.name], old = mk === 'renumbered' && prevN ? prevN[dir].find(x => x.name === r.name) : null;
        const from = r.ruleId ? `Rule ${r.ruleId}` : label[r.kind] || r.kind;
        return `<tr class="${r.kind === 'rule' ? '' : 'posture'} ${mk ? 'mk-' + mk : ''}"><td>${r.priority}${old ? ` <span class="muted">(was ${old.priority})</span>` : ''}</td><td><code>${esc(r.name)}</code></td><td>${sideTxt(S, r.src)}</td><td>${sideTxt(S, r.dst)}</td><td>${esc(svcTxt(r))}</td><td class="${r.access === 'Deny' ? 'bad' : 'ok'}">${r.access}</td><td>${esc(from)}</td></tr>`;
      }).join('');
      const more = list.length > 14 ? `<tr><td colspan="7" class="muted">… ${list.length - 14} more NSG rules</td></tr>` : '';
      const az = E.azureDefaults(dir).map(r => `${r.priority} ${r.name}`).join(', ');
      return `<h4>${dir === 'in' ? 'Inbound' : 'Outbound'}</h4><table><tr><th>Priority</th><th>Name</th><th>Source</th><th>Destination</th><th>Service</th><th>Access</th><th>From</th></tr>${rows || '<tr><td colspan="7" class="muted">none</td></tr>'}${more}</table><p class="muted small">Azure default rules (read-only): ${esc(az)}</p>`;
    };
    const L = D.out.limits[z];
    const drop = n.dropped.length ? `<p class="small"><b>Left out on this destination-enforced Zone:</b> ${n.dropped.map(d => `Rule ${d.rule.ruleId} (${esc(svcTxt(d.rule))} to ${sideTxt(S, d.rule.dst)}): ${esc(d.why)}`).join('; ')}</p>` : '';
    const win = n.windows.length ? `<p class="small warn">Window rebalance ${n.windows.map(w => `${w.from}–${w.to}: ${w.renumbered.length} NSG rule(s) renumbered`).join('; ')}</p>` : '';
    const stateTxt = n.state === 'managed' ? '' : ` <span class="pill">${esc(n.state === 'legacy' ? 'legacy NSG (Deployed state)' : n.state + ' NSG')}</span>`;
    return `<div class="card nsg"><h3>${esc(n.name)} <span class="muted">· Zone ${esc(z)}</span>${stateTxt}</h3>${tbl('in')}${tbl('out')}${drop}${win}<p class="muted small">Limits: ${L.rules} of ${E.LIMITS.rules} NSG rules, ${L.srcPrefixes}/${L.dstPrefixes} of ${E.LIMITS.prefixesPerSide} prefixes per side, ${L.asgs} of ${E.LIMITS.asgsPerNsg} ASGs</p></div>`;
  }
  function previewHtml(S, D) {
    if (!D.preview) return '';
    if (!D.preview.length) return '<p class="muted">No NSG changes.</p>';
    return D.preview.map(p => `<p><b>${esc(p.nsg)}</b>${p.state ? ` (${esc(p.state)})` : ''}: ${[p.added.length && `${p.added.length} added`, p.removed.length && `${p.removed.length} removed`, p.changed.length && `${p.changed.length} changed`, p.renumbered.length && `${p.renumbered.length} renumbered only`].filter(Boolean).join(', ') || 'no rule change'}
      <span class="muted small">${[...p.added.map(r => '+ ' + r.name), ...p.removed.map(r => '− ' + r.name), ...p.changed.map(c => '~ ' + c.after.name)].slice(0, 8).map(esc).join(' · ')}</span></p>`).join('');
  }
  function affectedHtml(D) {
    if (!D.affected) return '';
    const z = Object.keys(D.affected);
    return z.length ? `<table><tr><th>Affected Zone</th><th>Why</th></tr>${z.map(k => `<tr><td><b>${esc(k)}</b></td><td>${D.affected[k].map(esc).join('<br>')}</td></tr>`).join('')}</table>` : '<p class="muted">No Affected Zones: the instance default (four-eyes) applies.</p>';
  }
  function planHtml(S, D) {
    const P = D.plan; if (!P) return '';
    const w = id => P.writes.find(x => x.id === id), waiting = new Set(D.waiting || []), failed = new Set(S.failed || []);
    const status = id => failed.has(id) ? ' <span class="bad">failed, retried on its own</span>' : waiting.has(id) ? ' <span class="warn">waits</span>' : '';
    const failBtn = id => w(id).kind === 'nsg' || w(id).kind === 'member' ? ` <button data-act="fail" data-write="${esc(id)}">${failed.has(id) ? 'undo fail' : 'fail this write'}</button>` : '';
    const steps = P.levels ? P.levels.map((l, i) => `<li><b>Step ${i + 1}</b>${l.length > 1 ? ' (in parallel)' : ''}: ${l.map(id => esc(w(id).label) + status(id) + failBtn(id)).join('; ')}</li>`).join('') : '';
    const crossing = P.edges.filter(e => e.kind === 'crossing').map(e => `<li><b>${esc(w(e.from).label.replace('write ', ''))}</b> before <b>${esc(w(e.to).label.replace('write ', ''))}</b>: Crossing flow ${esc(e.witness.flow)}${e.count > 1 ? ` <span class="muted">(${e.count} flow samples)</span>` : ''}. Closes: ${esc(e.witness.closes)}; opens: ${esc(e.witness.opens)}.${e.witness.cases.length ? `<br><span class="muted small">Tag case: ${esc(e.witness.cases.join('; '))}</span>` : ''}</li>`).join('');
    const mem = P.members.map(m => `<li>${esc((S.inst.nics[m.nic] || S.committed.inst.nics[m.nic]).name)}: ${esc(m.before.join(', ') || '—')} → ${esc(m.after.join(', ') || '—')} · ${m.step === 1 ? 'step 1, only closes under the Deployed contents' : m.step === 3 ? 'last step, only opens under the target' : m.step === 'split' ? 'fits neither step as one write, so it is split: leaving in step 1, joining in the last step' : '<span class="bad">fits no step</span>'}${m.effect && (m.effect.opens.length || m.effect.closes.length) ? `<br><span class="muted small">${m.effect.closes.length ? 'closes e.g. ' + esc(m.effect.closes[0]) : ''} ${m.effect.opens.length ? 'opens e.g. ' + esc(m.effect.opens[0]) : ''}</span>` : ''}</li>`).join('');
    const errs = P.errors.map(e => `<div class="verdict bad">${esc(e.text)}${e.flows ? `<br><span class="small">Flows: ${e.flows.map(esc).join('; ')}</span>` : ''}</div>`).join('');
    return `${errs}${steps ? `<ol class="plain">${steps}</ol>` : P.writes.length ? '' : '<p class="muted">Nothing to write.</p>'}${crossing ? `<h4>Order from Crossing flows</h4><ul>${crossing}</ul>` : P.writes.length ? '<p class="muted small">No Crossing flow: apart from dependencies, the writes run in any order.</p>' : ''}${mem ? `<h4>ASG member changes</h4><ul>${mem}</ul>` : ''}`;
  }
  function panelHtml(p) {
    if (p.kind === 'json') return `<details open><summary>${esc(p.title)}</summary><pre>${esc(JSON.stringify(p.value, null, 2))}</pre></details>`;
    if (p.kind === 'table') return `<h4>${esc(p.title)}</h4><table><tr>${p.head.map(h => `<th>${esc(h)}</th>`).join('')}</tr>${p.rows.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</table>`;
    if (p.kind === 'list') return `<h4>${esc(p.title)}</h4>${p.value.length ? `<ul>${p.value.map(v => `<li>${esc(v)}</li>`).join('')}</ul>` : '<p class="muted">none</p>'}`;
    return `<h4>${esc(p.title)}</h4><p>${esc(p.value)}</p>`;
  }

  function view() {
    const ex = X.EX.find(e => e.key === cur.key), S = cur.S, D = X.derive(S), st = ex.steps[cur.step];
    const gTabs = groups.map(g => `<button class="${g === cur.group ? 'on' : ''}" data-act="group" data-group="${esc(g)}">${esc(g)}</button>`).join('');
    const eTabs = X.EX.filter(e => e.group === cur.group).map(e => `<button class="${e.key === cur.key ? 'on' : ''}" data-act="ex" data-key="${e.key}">${esc(e.title)}</button>`).join('');
    const steps = ex.steps.map((s, i) => `<button class="${i === cur.step && !cur.free ? 'primary' : i < cur.step ? 'done' : ''}" data-act="step" data-i="${i}">${i + 1}. ${esc(s.label)}</button>`).join('');
    let checks = '';
    if (cur.free) checks = '<p class="warn">Free play: you changed the state by hand, so the checks of this step no longer apply. Click a step to return.</p>';
    else if (st.checks) checks = `<ul class="checks">${st.checks.map(([l, f]) => { let ok = false; try { ok = f(S, D); } catch (e) { ok = false; } return `<li class="${ok ? 'ok' : 'bad'}">${ok ? '✓' : '✗'} ${esc(l)}</li>`; }).join('')}</ul>`;
    const marks = changedNames(D);
    const panels = !cur.free && st.panel ? st.panel(S, D).map(panelHtml).join('') : '';
    const status = S.pending ? `<span class="pill">Change set on Version ${S.version} (not committed)</span>` : `<span class="pill ok">Version ${S.version} committed and deployed</span>`;
    const errs = D.out.errors.map(e => `<div class="verdict bad">Blocked: ${esc(e.text)}</div>`).join('') + D.out.warnings.map(w => `<div class="verdict warnbg">Warning: ${esc(w.text)}</div>`).join('');
    const noEff = D.out.noEffect.length ? `<p class="warn small">No effect (covers no Zone or resolves to nothing): ${D.out.noEffect.map(id => 'Rule ' + id).join(', ')}</p>` : '';
    return `
      <div class="tabs">${gTabs}</div><div class="tabs sub">${eTabs}</div>
      <div class="card"><h2>${esc(ex.title)}</h2><p>${esc(ex.text)}</p><p class="muted"><b>Watch for</b></p><ul>${ex.watch.map(w => `<li>${esc(w)}</li>`).join('')}</ul>
        <div class="steps">${steps}</div>${checks}${S.note ? `<p class="note">${esc(S.note)}</p>` : ''}</div>
      <p>${status} <button data-act="commit">Commit this state</button> <button data-act="reset">Reset this step</button> <span class="muted small">engine ${esc(D.out.engineVersion)}</span></p>
      ${errs}${panels ? `<div class="card">${panels}</div>` : ''}
      <h2>Rule base in</h2><div class="scroll">${zoneTable(S)}${objectTable(S, D)}${ruleTable(S, D)}</div>${noEff}
      ${D.plan ? `<div class="grid2"><div class="card"><h3>Preview</h3>${previewHtml(S, D)}</div><div class="card"><h3>Affected Zones</h3>${affectedHtml(D)}</div></div><div class="card"><h3>Deployment plan</h3>${planHtml(S, D)}</div>` : ''}
      <h2>NSG rules out</h2><p class="muted small">Highlighted: <span class="mk-added">added</span> <span class="mk-changed">changed</span> <span class="mk-renumbered">renumbered only</span> against the last committed Version. Grey rows belong to no Rule.</p>
      <div class="scroll">${Object.entries(D.out.nsgs).map(([z, n]) => nsgCard(S, D, z, n, marks)).join('')}</div>`;
  }
  function questionsHtml() {
    return `<ol>${X.QUESTIONS.map(q => `<li>${esc(q.text)} <button data-act="ex" data-key="${q.ex}">show</button>${q.answer ? `<br><span class="ok small">${esc(q.answer)}</span>` : ''}</li>`).join('')}</ol>`;
  }

  // free play: thin actions on the current state
  function act(a, el) {
    const S = cur.S, I = () => { S.inst = E.clone(S.inst); S.pending = true; cur.free = true; return S.inst; };
    if (a === 'group') { const ex = X.EX.find(e => e.group === el.dataset.group); load(ex.key, 0); }
    else if (a === 'ex') { load(el.dataset.key, 0); if (root.scrollTo) root.scrollTo(0, document.getElementById('app').offsetTop - 10); }
    else if (a === 'step') load(cur.key, +el.dataset.i);
    else if (a === 'reset') load(cur.key, cur.step);
    else if (a === 'commit') { X.commit(S); S.failed = null; S.deployed = null; cur.free = true; }
    else if (a === 'up' || a === 'down') { const inst = I(), i = inst.rules.findIndex(r => r.id === +el.dataset.id), j = a === 'up' ? i - 1 : i + 1; if (j >= 0 && j < inst.rules.length) { const t = inst.rules[i]; inst.rules[i] = inst.rules[j]; inst.rules[j] = t; } }
    else if (a === 'toggle') { const r = I().rules.find(x => x.id === +el.dataset.id); r.enabled = r.enabled === false; }
    else if (a === 'posture') { const z = I().zones[el.dataset.zone]; z.posture = z.posture === 'strict' ? 'dest' : 'strict'; }
    else if (a === 'fail') { const id = el.dataset.write, f = new Set(S.failed || []); if (f.has(id)) f.delete(id); else f.add(id); S.failed = [...f]; cur.free = true; }
    render();
  }
  function render() {
    const app = document.getElementById('app');
    try { app.innerHTML = view(); } catch (e) { app.innerHTML = `<div class="verdict bad">The prototype hit an error: ${esc(e.message)}</div>`; if (root.console) console.error(e); }
  }
  function start() {
    document.getElementById('questions').innerHTML = questionsHtml();
    document.addEventListener('click', ev => { const b = ev.target.closest('button[data-act]'); if (b) act(b.dataset.act, b); });
    load(cur.key, 0); render();
  }
  root.Page = { view, load, questionsHtml, cur, start };
})(typeof window !== 'undefined' ? window : globalThis);
