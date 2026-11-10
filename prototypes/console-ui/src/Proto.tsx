// PROTOTYPE, throwaway. Prototype-only controls, kept out of the design: a dashed button in the rail.
import { useEffect, useState } from 'react';
import { Popover, PopoverTrigger, PopoverSurface } from '@fluentui/react-components';
import { Beaker20Regular } from '@fluentui/react-icons';
import { useStore, Scenario } from './store';
import { useFlow } from './flow';
import { perfBus } from './bits';

export function ProtoButton() {
  const s = useStore(); const f = useFlow(); const [perf, setPerf] = useState('');
  useEffect(() => { const h = (e: Event) => setPerf((e as CustomEvent).detail); perfBus.addEventListener('ready', h); return () => perfBus.removeEventListener('ready', h); }, []);
  if (!(import.meta.env.DEV || import.meta.env.VITE_PROTOTYPE_BAR)) return null;
  return (
    <Popover positioning="after-bottom"><PopoverTrigger disableButtonEnhancement><button className="rail-i proto-b" title="Prototype controls"><Beaker20Regular /></button></PopoverTrigger>
      <PopoverSurface style={{ width: 320, padding: '14px 16px' }}>
        <div className="panel-h">Prototype controls</div>
        <p className="muted" style={{ margin: '0 0 10px' }}>Not part of the design. Forces states that are hard to construct by hand.</p>
        <label style={{ fontSize: 13 }}>Write order scenario<br />
          <select value={s.scenario} onChange={e => s.setScenario(e.target.value as Scenario)} style={{ width: '100%', marginTop: 4, padding: 6, borderRadius: 6 }}>
            <option value="auto">From the edits</option><option value="crossing">Force Crossing flows</option><option value="unorderable">Force “cannot be ordered”</option>
          </select></label>
        <div className="proto-36">
          <b>Issue 36</b>
          <label><input type="checkbox" checked={f.small} onChange={e => f.setSmall(e.target.checked)} /> Small profile: no Folders yet</label>
          <label><input type="checkbox" checked={f.forceDeny} onChange={e => f.setForceDeny(e.target.checked)} /> Force a deny Policy finding on the first changed Rule</label>
          <label><input type="checkbox" checked={f.toolPath} onChange={e => f.setToolPath(e.target.checked)} /> This Change set closes a Tool path</label>
          <label><input type="checkbox" checked={f.retrans} onChange={e => f.setRetrans(e.target.checked)} /> A Re-translation is open in Production</label>
          <span>kim commits Version {f.latest + 1}, and your Change set needs a Rebase:</span>
          <button disabled={!!f.pending} onClick={() => f.startRebase('full', s)}>with conflicts on a Rule, a position and a Folder</button>
          <button disabled={!!f.pending || f.small} onClick={() => f.startRebase('folder', s)}>with a conflict on a Folder only (submit and approve first: the Approvals stay)</button>
          <p className="muted">Both first add the edits the conflicts need to your Change set.</p>
        </div>
        {perf && <p className="muted" style={{ margin: '10px 0 0' }}>{perf}</p>}
      </PopoverSurface>
    </Popover>
  );
}
