// PROTOTYPE, throwaway. Prototype-only controls, kept out of the design: a dashed button in the rail.
import { useEffect, useState } from 'react';
import { Popover, PopoverTrigger, PopoverSurface } from '@fluentui/react-components';
import { Beaker20Regular } from '@fluentui/react-icons';
import { useStore, Scenario } from './store';
import { perfBus } from './bits';

export function ProtoButton() {
  const s = useStore(); const [perf, setPerf] = useState('');
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
        {perf && <p className="muted" style={{ margin: '10px 0 0' }}>{perf}</p>}
      </PopoverSurface>
    </Popover>
  );
}
