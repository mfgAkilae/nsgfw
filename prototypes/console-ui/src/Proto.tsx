// PROTOTYPE, throwaway. Prototype-only controls, kept out of the design: a dashed button in the rail.
import { useEffect, useState } from 'react';
import { Popover, PopoverTrigger, PopoverSurface, Button, Switch } from '@fluentui/react-components';
import { Beaker20Regular } from '@fluentui/react-icons';
import { useStore, Scenario } from './store';
import { useSession } from './session';
import { personas } from './access';
import { perfBus } from './bits';

export function ProtoButton() {
  const s = useStore(); const se = useSession(); const [perf, setPerf] = useState('');
  useEffect(() => { const h = (e: Event) => setPerf((e as CustomEvent).detail); perfBus.addEventListener('ready', h); return () => perfBus.removeEventListener('ready', h); }, []);
  if (!(import.meta.env.DEV || import.meta.env.VITE_PROTOTYPE_BAR)) return null;
  return (
    <Popover positioning="after-bottom"><PopoverTrigger disableButtonEnhancement><button className="rail-i proto-b" title="Prototype controls"><Beaker20Regular /></button></PopoverTrigger>
      <PopoverSurface style={{ width: 340, padding: '14px 16px' }}>
        <div className="panel-h">Prototype controls</div>
        <p className="muted" style={{ margin: '0 0 10px' }}>Not part of the design. Forces states that are hard to construct by hand.</p>
        <label style={{ fontSize: 13 }}>Sign in as<br />
          <select value={se.personaId} onChange={e => se.setPersona(e.target.value)} style={{ width: '100%', marginTop: 4, padding: 6, borderRadius: 6 }}>
            {personas.map(p => <option key={p.id} value={p.id}>{p.label}: {p.note}</option>)}
          </select></label>
        <p className="muted" style={{ margin: '4px 0 10px' }}>The Change set CHG-5120 stays; under every persona you are its Author.</p>
        <div style={{ fontSize: 13, marginBottom: 4 }}>Sign-in and session</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
          <Button size="small" onClick={() => se.setSignInAge(3)}>Sign-in 3 min old</Button>
          <Button size="small" onClick={() => se.setSignInAge(47)}>Sign-in 47 min old</Button>
          <Button size="small" onClick={() => se.setIdleWarnAt(Date.now() + 5 * 60_000)}>Idle warning</Button>
          <Button size="small" onClick={() => se.setSignout('idle')}>Signed out (idle)</Button>
          <Button size="small" onClick={() => se.setEndWarn(true)}>Session ends soon</Button>
          <Button size="small" onClick={() => se.setDenied({ what: 'Approving “Partner VPN access”', need: 'It needs the approver Role in app0042-db.', have: 'viewer in app0042-db; your approver Role through grp-prod-approvers ended 4 minutes ago' })}>Server denies an action</Button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 8 }}>
          <Switch label="On-premises runtime (certificate)" checked={se.onPrem} onChange={(_, d) => se.setOnPrem(d.checked)} />
          <Switch label="Audit chain broken" checked={se.chainBroken} onChange={(_, d) => se.setChainBroken(d.checked)} />
          {se.setupHidden && <Button size="small" appearance="subtle" onClick={() => se.setSetupHidden(false)}>Show Setup again</Button>}
        </div>
        <label style={{ fontSize: 13 }}>Write order scenario<br />
          <select value={s.scenario} onChange={e => s.setScenario(e.target.value as Scenario)} style={{ width: '100%', marginTop: 4, padding: 6, borderRadius: 6 }}>
            <option value="auto">From the edits</option><option value="crossing">Force Crossing flows</option><option value="unorderable">Force “cannot be ordered”</option>
          </select></label>
        {perf && <p className="muted" style={{ margin: '10px 0 0' }}>{perf}</p>}
      </PopoverSurface>
    </Popover>
  );
}
