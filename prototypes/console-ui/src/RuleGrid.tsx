// PROTOTYPE, throwaway. The Rule base table on AG Grid Community. This is also the AG Grid check of issue 25.
// A row reads as a flow: source, arrow, destination, service, action.
import { useEffect, useMemo, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { AllCommunityModule, ModuleRegistry, themeQuartz, ColDef, GridApi, RowClassRules, ICellRendererParams } from 'ag-grid-community';
import { Tooltip } from '@fluentui/react-components';
import { ShieldError16Filled, Warning16Filled, Info16Regular, Clock16Regular, PeopleSwap16Regular, LayerDiagonal16Regular, ErrorCircle16Filled, LockClosed12Regular,
  Copy16Regular, Delete16Regular, Eye16Regular, EyeOff16Regular, ArrowRight12Filled, PanelRight16Regular, Filter16Regular, ArrowUp16Regular, ArrowDown16Regular, ArrowSort16Regular, Add16Regular, Checkmark12Filled, Dismiss12Filled } from '@fluentui/react-icons';
import { Rule, svcName, ref } from './data';
import { useStore, alsoChanged, St } from './store';
import { useT } from './i18n';
import { useMode } from './theme';
import { Chip, RefsEditor } from './ObjectPicker';

ModuleRegistry.registerModules([AllCommunityModule]);
// Every colour is a CSS variable, so the same grid theme serves light and dark.
export const gridTheme = themeQuartz.withParams({
  fontFamily: 'inherit', fontSize: 13, headerHeight: 36, spacing: 6, cellHorizontalPadding: 12,
  accentColor: 'var(--accent)', foregroundColor: 'var(--ink)', backgroundColor: 'var(--surface)', chromeBackgroundColor: 'var(--surface)', borderColor: 'var(--line)',
  headerBackgroundColor: 'var(--surface)', headerTextColor: 'var(--ink3)', headerFontWeight: 500, headerFontSize: 12, columnBorder: false, headerColumnBorder: false,
  headerColumnResizeHandleColor: 'var(--line)', rowBorder: { style: 'solid', width: 1, color: 'var(--line2)' }, wrapperBorder: false, wrapperBorderRadius: 0, rowHoverColor: 'var(--hover)',
  selectedRowBackgroundColor: 'var(--sel)', iconSize: 14, checkboxBorderRadius: 4, checkboxUncheckedBorderColor: 'var(--ink3)', checkboxUncheckedBackgroundColor: 'transparent',
  menuBackgroundColor: 'var(--raised)', inputBorder: { style: 'solid', width: 1, color: 'var(--line)' }, focusShadow: '0 0 0 2px var(--accent)', pinnedRowBorder: { style: 'solid', width: 1, color: 'var(--line)' },
  pinnedColumnBorder: false, dragHandleColor: 'var(--ink3)',
});

export type SysRow = { id: string; system: 'pe' | 'intra' | 'inherited' | 'egress' | 'denyall' | 'azure'; name: string; text: string };
export const systemTop: SysRow[] = [{ id: 'sys-pe', system: 'pe', name: 'Platform exceptions', text: 'Azure Load Balancer health probes are allowed above every Rule. No Rule can override them.' }];
export const systemBottom: SysRow[] = [
  { id: 'sys-intra', system: 'intra', name: 'Intra-zone default', text: 'Traffic that stays inside one Zone is allowed. A Rule above can override it.' },
  { id: 'sys-inh', system: 'inherited', name: 'Inherited defaults', text: '1,612 Zones keep what Azure allowed before onboarding: VirtualNetwork in and out, Internet out.' },
  { id: 'sys-deny', system: 'denyall', name: 'Deny-all rules', text: 'Everything else is denied, inbound and outbound, on every Managed NSG.' },
  { id: 'sys-az', system: 'azure', name: 'Azure default rules', text: 'Read-only and never reached: AllowVnetInBound, AllowInternetOutBound and the other four sit below the Deny-all rules.' },
];

// How many object tokens fit a cell: whole tokens only, the rest collapses into "+N" (never a token cut to one letter).
const tokW = (id: string) => 35 + 7.2 * (id.startsWith('svc') ? svcName(id) : ref(id).name).length;
function fit(ids: string[], avail: number) {
  let used = tokW(ids[0]); let n = 1;
  while (n < ids.length) { const w = tokW(ids[n]) + 5; if (used + w + (ids.length - n - 1 ? 30 : 0) > avail) break; used += w; n++; }
  return n;
}
function Toks({ ids, width, arrow }: { ids: string[]; width: number; arrow?: boolean }) {
  const n = fit(ids, width - 24 - (arrow ? 20 : 0));
  return <div className="chips">{arrow && <ArrowRight12Filled className="flow" />}{ids.slice(0, n).map(id => <Chip key={id} id={id} />)}{ids.length > n && <span className="more" title={ids.slice(n).map(id => (id.startsWith('svc') ? svcName(id) : ref(id).name)).join(', ')}>+{ids.length - n}</span>}</div>;
}
export const compact = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(n));
export type FilterKey = 'all' | 'deny' | 'disabled' | 'expiring' | 'findings' | 'unused' | 'changed';
const passes: Record<FilterKey, (r: Rule, st?: St) => boolean> = {
  all: () => true, deny: r => r.action === 'deny', disabled: r => !r.enabled, expiring: r => !!r.expiry,
  findings: r => !!(r.policy || r.importNote || r.layerWarn), unused: r => r.hits === 0, changed: (_r, st) => !!st,
};
export function countFilters(rules: Rule[], status: Map<string, St>) {
  const c: Record<FilterKey, number> = { all: rules.length, deny: 0, disabled: 0, expiring: 0, findings: 0, unused: 0, changed: status.size };
  for (const r of rules) for (const k of ['deny', 'disabled', 'expiring', 'findings', 'unused'] as const) if (passes[k](r)) c[k]++;
  return c;
}

export interface RuleGridHandle { selected(): string[]; api(): GridApi | undefined; reveal(id: string): void; clearSelection(): void }
interface Props { rows: Rule[]; quick?: string; filter?: FilterKey; bands?: { top: SysRow[]; bottom: SysRow[] } | null; dense?: boolean; focusedId?: string | null;
  onFocus?: (id: string) => void; onOpen?: (id: string) => void; onQuick?: (text: string) => void; onSelection?: (ids: string[]) => void; onMoveTo?: (ids: string[]) => void; onReady?: (ms: number) => void }

export const RuleGrid = forwardRef<RuleGridHandle, Props>(function RuleGrid(p, refH) {
  const s = useStore();
  const { t, lang } = useT();
  const sRef = useRef(s); sRef.current = s;
  const pRef = useRef(p); pRef.current = p;
  const tRef = useRef(t); tRef.current = t;
  const grid = useRef<AgGridReact>(null);
  const [sorted, setSorted] = useState(false);
  const t0 = useRef(performance.now());
  useImperativeHandle(refH, () => ({
    selected: () => grid.current?.api?.getSelectedRows().map((r: Rule) => r.id) ?? [], api: () => grid.current?.api,
    reveal: id => { const n = grid.current?.api?.getRowNode(id); if (n) grid.current?.api?.ensureNodeVisible(n, 'middle'); },
    clearSelection: () => grid.current?.api?.deselectAll(),
  }));

  // Numbers, markers and badges depend on the store, not on the row object: redraw the visible rows when they change.
  useEffect(() => { grid.current?.api?.redrawRows(); }, [s.status, s.numbers]);

  useEffect(() => { grid.current?.api?.refreshHeader(); grid.current?.api?.redrawRows(); }, [lang]);
  useEffect(() => { grid.current?.api?.onFilterChanged(); }, [p.filter]);
  useEffect(() => { grid.current?.api?.resetRowHeights(); grid.current?.api?.setColumnsVisible(['flags'], !!p.dense); }, [p.dense]);
  const ruler = useRef<{ rebuild(): void; view(): void }>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; r: Rule; objs: string[] } | null>(null);

  const st = (id: string) => sRef.current.status.get(id);
  const isSys = (x: any) => !!x?.system;
  const editable = (x: any) => !isSys(x?.data) && !st(x?.data?.id)?.deleted;
  const changedCls = (field: string) => ({ 'cell-changed': (x: any) => !!st(x.data?.id)?.changed?.has(field) });
  const mark = (id: string) => { const m = st(id); return m?.deleted ? ['del', 'deleted'] : m?.added ? ['add', 'new'] : m?.moved ? ['mov', 'moved'] : m?.changed ? ['chg', 'edited'] : null; };

  const cols = useMemo<ColDef[]>(() => [
    { colId: 'no', headerName: t('No.'), width: 80, pinned: 'left', rowDrag: true, cellClass: 'c-no', resizable: false, comparator: (_a, _b, na, nb) => (sRef.current.numbers.get(na.data.id) ?? 0) - (sRef.current.numbers.get(nb.data.id) ?? 0),
      valueGetter: x => sRef.current.numbers.get(x.data.id) ?? '',
      cellRenderer: (x: ICellRendererParams) => { const m = mark(x.data.id); return <span className="no">{x.value}{m && <i className={`mdot ${m[0]}`} title={t(m[1])} />}</span>; } },
    { field: 'name', headerName: t('Name'), flex: 1.5, minWidth: 210, editable, cellClassRules: changedCls('name'), getQuickFilterText: x => `${x.data.name} ${x.data.id} ${x.data.ticket} ${x.data.owner}`,
      cellRenderer: (x: ICellRendererParams) => { const r = x.data as Rule; const m = mark(r.id); return (
        <div className="rname"><div className="rn">{r.name}</div>
          <div className="rmeta">{m && <em className={`mk ${m[0]}`}>{t(m[1])}</em>}{!r.enabled && <em className="mk off">{t('disabled')}</em>}
            {r.policy && <em className="mk del" title={r.policy}>{t('Policy finding')}</em>}{r.importNote && <em className={`mk ${r.importNote === 'blocking' ? 'del' : 'chg'}`} title={`Import note (${r.importNote})`}>{t('Import note')}</em>}
            {r.layerWarn && <em className="mk chg" title="Security layer">{r.layerWarn}</em>}{alsoChanged.has(r.id) && <em className={`mk ${m ? 'del' : 'off'}`} title={`${t('also changed in')} “${alsoChanged.get(r.id)!.set}” ${t('by')} ${alsoChanged.get(r.id)!.by}`}>{t('in another Change set')}</em>}
            <span className="mono">{r.id}</span>{r.ticket && <span>{r.ticket}</span>}<span>{r.owner}</span>{r.expiry && <span className="exp">{t('expires')} {r.expiry}</span>}</div></div>); } },
    ...(['src', 'dst'] as const).map((f): ColDef => ({ field: f, headerName: t(f === 'src' ? 'Source' : 'Destination'), flex: f === 'src' ? 1 : 1.1, minWidth: f === 'src' ? 162 : 182, editable, cellDataType: false, cellClassRules: changedCls(f),
      cellEditor: RefsEditor, cellEditorParams: { mode: 'addr' }, cellEditorPopup: true, cellEditorPopupPosition: 'under', sortable: false,
      getQuickFilterText: x => (x.data[f] as string[]).map(id => ref(id).name).join(' '),
      cellRenderer: (x: ICellRendererParams) => <Toks ids={x.value} width={x.column!.getActualWidth()} arrow={f === 'dst'} /> })),
    { field: 'svc', headerName: t('Service'), flex: 0.75, minWidth: 110, editable, cellDataType: false, cellClassRules: changedCls('svc'), cellEditor: RefsEditor, cellEditorParams: { mode: 'svc' }, cellEditorPopup: true, sortable: false,
      getQuickFilterText: x => x.data.svc.map(svcName).join(' '),
      cellRenderer: (x: ICellRendererParams) => <Toks ids={x.value} width={x.column!.getActualWidth()} /> },
    { field: 'action', headerName: t('Action'), width: 98, editable, cellClassRules: changedCls('action'), cellEditor: 'agSelectCellEditor', cellEditorParams: { values: ['allow', 'deny'] },
      cellRenderer: (x: ICellRendererParams) => <span className={`act ${x.value}`}>{x.value === 'allow' ? <Checkmark12Filled /> : <Dismiss12Filled />}{t(x.value === 'allow' ? 'Allow' : 'Deny')}</span> },
    { field: 'hits', headerName: t('Hits'), width: 84, headerTooltip: t('Flow data is about 70 minutes old'), comparator: (a, b) => (a ?? -1) - (b ?? -1),
      cellRenderer: (x: ICellRendererParams) => x.value == null ? <Tooltip content={t('No flow data for this Rule')} relationship="label"><span className="nodata">—</span></Tooltip>
        : <div className={`hitc ${x.value === 0 ? 'zero' : ''}`}><span>{compact(x.value)}</span><i><b style={{ width: `${(Math.log10(x.value + 1) / 6.7) * 100}%` }} /></i></div> },
    { colId: 'flags', headerName: '', width: 64, sortable: false, resizable: false, hide: true, cellRenderer: (x: ICellRendererParams) => <Badges r={x.data} /> },
    { field: 'comment', headerName: t('Comment'), flex: 1, minWidth: 150, editable, cellClass: 'c-comment', cellClassRules: changedCls('comment') },
    { colId: 'acts', headerName: '', width: 120, pinned: 'right', sortable: false, resizable: false, cellClass: 'c-acts', cellRenderer: (x: ICellRendererParams) => <RowActs r={x.data} onOpen={id => pRef.current.onOpen?.(id)} /> },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [lang]);

  const spine = useMemo(() => ({ 'spine-allow': (x: any) => x.data?.action === 'allow' && x.data.enabled, 'spine-deny': (x: any) => x.data?.action === 'deny' && x.data.enabled, 'spine-off': (x: any) => x.data && !isSys(x.data) && !x.data.enabled }), []);
  const rowClassRules = useMemo<RowClassRules>(() => ({
    'row-added': x => !!st(x.data?.id)?.added, 'row-deleted': x => !!st(x.data?.id)?.deleted, 'row-disabled': x => x.data && !isSys(x.data) && !x.data.enabled,
  }), []);

  // Every option object and callback below is created once. A new identity on re-render would make AG Grid rebuild its columns,
  // and a rebuild between two clicks swallows the double click that starts editing.
  const opts = useMemo(() => ({
    defaultColDef: { sortable: true, resizable: true, suppressHeaderMenuButton: true } as ColDef,
    rowSelection: { mode: 'multiRow', checkboxes: true, headerCheckbox: true, enableClickSelection: false, selectAll: 'filtered' } as const,
    selectionColumnDef: { pinned: 'left', width: 42, resizable: false, cellClassRules: spine } as ColDef,
    getRowId: (x: any) => x.data.id,
    getRowHeight: (x: any) => (x.node.rowPinned ? 36 : pRef.current.dense ? 34 : 48),
    isFullWidthRow: (x: any) => isSys(x.rowNode.data),
    fullWidthCellRenderer: (x: ICellRendererParams) => <div className={`band b-${x.data.system}`}><LockClosed12Regular /><b>{tRef.current(x.data.name)}</b><span>{tRef.current(x.data.text)}</span></div>,
    isExternalFilterPresent: () => (pRef.current.filter ?? 'all') !== 'all',
    doesExternalFilterPass: (n: any) => passes[pRef.current.filter ?? 'all'](n.data, st(n.data.id)),
    onCellEditRequest: (e: any) => sRef.current.editField(e.data.id, e.colDef.field as keyof Rule, e.newValue),
    onSortChanged: (e: any) => setSorted(e.api.getColumnState().some((c: any) => c.sort && c.colId !== 'no')),
    onRowDragEnd: (e: any) => {
      const target = e.overNode?.data as Rule | undefined;
      if (!target || isSys(target)) return;
      const moving = (e.nodes?.length ? e.nodes : [e.node]).map((n: any) => (n.data as Rule).id).filter((id: string) => id !== target.id);
      if (!moving.length) return;
      const all = sRef.current.rules; const from = all.findIndex(r => r.id === moving[0]); const to = all.findIndex(r => r.id === target.id);
      sRef.current.move(moving, target.id, from < to ? 'after' : 'before');
    },
    onRowClicked: (e: any) => { const el = e.event?.target as HTMLElement | null; if (!e.data || isSys(e.data) || el?.closest('.rowacts, .ag-selection-checkbox, .ag-drag-handle, .ag-cell-inline-editing')) return; if (e.data.id !== pRef.current.focusedId) pRef.current.onFocus?.(e.data.id); },
    onSelectionChanged: (e: any) => pRef.current.onSelection?.(e.api.getSelectedRows().map((r: Rule) => r.id)),
    onGridSizeChanged: (e: any) => { e.api.setColumnsVisible(['comment'], e.clientWidth >= 1330); setTimeout(() => e.api.refreshCells({ columns: ['src', 'dst', 'svc'], force: true }), 0); },
    onColumnResized: (e: any) => { if (e.finished) e.api.refreshCells({ columns: ['src', 'dst', 'svc'], force: true }); },
    onFirstDataRendered: () => pRef.current.onReady?.(Math.round(performance.now() - t0.current)),
    onModelUpdated: () => ruler.current?.rebuild(), onBodyScroll: () => ruler.current?.view(),
    preventDefaultOnContextMenu: true,
    onCellContextMenu: (e: any) => { if (!e.data || isSys(e.data)) return; const c = e.column?.getColId(); const ev = e.event as MouseEvent;
      setMenu({ x: ev.clientX, y: ev.clientY, r: e.data, objs: c === 'src' || c === 'dst' || c === 'svc' ? e.data[c] : [] }); if (e.data.id !== pRef.current.focusedId) pRef.current.onFocus?.(e.data.id); },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), []);

  const live = menu ? s.rules.find(x => x.id === menu.r.id) ?? menu.r : null;
  const act = (fn: () => void) => () => { fn(); setMenu(null); };
  const oname = (id: string) => (id.startsWith('svc') ? svcName(id) : ref(id).name);
  return (
    <div className={`gridbox ${p.dense ? 'dense' : ''}`}>
      {/* The focused Rule is marked by a style rule, not a redraw, for the same reason. */}
      {p.focusedId && <style>{`.gridbox .ag-row[row-id="${p.focusedId}"]{background:var(--sel)!important}.gridbox .ag-row[row-id="${p.focusedId}"] .rowacts{opacity:1}`}</style>}
      {sorted && <div className="grid-hint">{t('Drag is off while sorted: use Move to…')}</div>}
      <AgGridReact ref={grid} theme={gridTheme} containerStyle={{ flex: 1, minWidth: 0, height: '100%' }} rowData={p.rows} columnDefs={cols} {...opts}
        pinnedTopRowData={p.bands?.top} pinnedBottomRowData={p.bands?.bottom} quickFilterText={p.quick} rowClassRules={rowClassRules}
        readOnlyEdit rowDragMultiRow suppressRowDrag={sorted} animateRows={false} tooltipShowDelay={300} />
      <Ruler ref={ruler} api={() => grid.current?.api} focusedId={p.focusedId} />
      {menu && live && (
        <div className="ctx-bg" onMouseDown={() => setMenu(null)} onContextMenu={e => { e.preventDefault(); setMenu(null); }}>
          <div className="ctx" role="menu" style={{ left: Math.min(menu.x, window.innerWidth - 270), top: Math.min(menu.y, window.innerHeight - 380) }} onMouseDown={e => e.stopPropagation()}>
            <div className="ctx-h">{s.numbers.get(live.id) ?? ''} {live.name}</div>
            <button onClick={act(() => p.onOpen?.(live.id))}><PanelRight16Regular />{t('Open details')}</button>
            <button onClick={act(() => s.setEnabled([live.id], !live.enabled))}>{live.enabled ? <EyeOff16Regular /> : <Eye16Regular />}{t(live.enabled ? 'Disable' : 'Enable')}</button>
            <button onClick={act(() => s.clone([live.id]))}><Copy16Regular />{t('Clone')}</button>
            <button onClick={act(() => s.addRule(live.id))}><Add16Regular />{t('New Rule below')}</button>
            <hr />
            <button onClick={act(() => s.move([live.id], null, 'before'))}><ArrowUp16Regular />{t('Move to the top')}</button>
            <button onClick={act(() => s.move([live.id], null, 'after'))}><ArrowDown16Regular />{t('Move to the bottom')}</button>
            <button onClick={act(() => p.onMoveTo?.([live.id]))}><ArrowSort16Regular />{t('Move to…')}</button>
            {menu.objs.length > 0 && <><hr />{menu.objs.slice(0, 3).map(id => <button key={id} onClick={act(() => p.onQuick?.(oname(id)))}><Filter16Regular /><span>{t('Rules with')} <b>{oname(id)}</b></span></button>)}</>}
            <hr />
            <button className="danger" onClick={act(() => s.remove([live.id]))}><Delete16Regular />{t('Delete')}</button>
          </div>
        </div>
      )}
    </div>
  );
});

// Overview ruler: where the changed and the flagged Rules sit in the whole list, with the visible window. Click to jump.
const Ruler = forwardRef<{ rebuild(): void; view(): void }, { api: () => GridApi | undefined; focusedId?: string | null }>(function Ruler(p, r) {
  const s = useStore(); const { mode } = useMode(); const { t } = useT(); const cv = useRef<HTMLCanvasElement>(null);
  const marks = useRef({ n: 0, chg: [] as number[], warn: [] as number[], focus: -1 });
  const sRef = useRef(s); sRef.current = s; const pRef = useRef(p); pRef.current = p;
  const draw = () => {
    const c = cv.current, api = pRef.current.api(); if (!c || !api) return;
    const h = c.clientHeight, w = c.clientWidth, dpr = window.devicePixelRatio || 1; c.width = w * dpr; c.height = h * dpr;
    const g = c.getContext('2d')!; g.scale(dpr, dpr); g.clearRect(0, 0, w, h);
    const css = getComputedStyle(document.documentElement); const col = (v: string) => css.getPropertyValue(v).trim();
    const m = marks.current; if (!m.n) return;
    const y = (i: number) => Math.round((i / m.n) * (h - 4));
    const a = api.getFirstDisplayedRowIndex(), b = api.getLastDisplayedRowIndex();
    if (a >= 0) { g.fillStyle = col('--line'); g.fillRect(0, y(a), w, Math.max(8, y(b + 1) - y(a))); }
    g.fillStyle = col('--deny'); m.warn.forEach(i => g.fillRect(3, y(i), 4, 2));
    g.fillStyle = col('--amber'); m.chg.forEach(i => g.fillRect(8, y(i), 5, 3));
    if (m.focus >= 0) { g.fillStyle = col('--accent'); g.fillRect(0, y(m.focus), w, 3); }
  };
  const rebuild = () => {
    const api = pRef.current.api(); if (!api) return; const m = { n: 0, chg: [] as number[], warn: [] as number[], focus: -1 };
    api.forEachNodeAfterFilterAndSort(node => { const d = node.data as Rule | undefined; if (!d) return; const i = m.n++;
      if (sRef.current.status.has(d.id)) m.chg.push(i); if (d.policy || d.importNote === 'blocking' || d.layerWarn) m.warn.push(i); if (d.id === pRef.current.focusedId) m.focus = i; });
    marks.current = m; draw();
  };
  useImperativeHandle(r, () => ({ rebuild, view: draw }));
  useEffect(() => { rebuild(); }, [s.status, p.focusedId, mode]);
  useEffect(() => { const ro = new ResizeObserver(draw); if (cv.current) ro.observe(cv.current); return () => ro.disconnect(); }, []);
  return <canvas ref={cv} className="ruler" title={t('Where changed (amber) and flagged (red) Rules sit. Click to jump.')}
    onClick={e => { const api = pRef.current.api(); const m = marks.current; if (!api || !m.n) return; const rect = e.currentTarget.getBoundingClientRect(); api.ensureIndexVisible(Math.min(m.n - 1, Math.floor(((e.clientY - rect.top) / rect.height) * m.n)), 'middle'); }} />;
});

export function Badges({ r }: { r: Rule }) {
  const { t } = useT();
  const s = useStore();
  const also = alsoChanged.get(r.id);
  const out = [];
  if (r.policy) out.push(<Tooltip key="p" content={`Policy finding: ${r.policy}`} relationship="description"><ShieldError16Filled className="b-red" /></Tooltip>);
  if (r.importNote) out.push(<Tooltip key="i" content={`Import note (${r.importNote}) from nsg-legacy-017, rule "allow-sql", priority 310, inbound`} relationship="description">{r.importNote === 'blocking' ? <ErrorCircle16Filled className="b-red" /> : r.importNote === 'warning' ? <Warning16Filled className="b-amber" /> : <Info16Regular className="b-accent" />}</Tooltip>);
  if (r.layerWarn) out.push(<Tooltip key="l" content={`Security layer: ${r.layerWarn}`} relationship="description"><LayerDiagonal16Regular className="b-amber" /></Tooltip>);
  if (r.expiry) out.push(<Tooltip key="e" content={`${t('Expiry')}: ${r.expiry}`} relationship="description"><Clock16Regular className="b-amber" /></Tooltip>);
  if (also) out.push(<Tooltip key="a" content={`${t('also changed in')} “${also.set}” ${t('by')} ${also.by}`} relationship="description"><PeopleSwap16Regular className={s.status.has(r.id) ? 'b-red' : 'b-grey'} /></Tooltip>);
  return <span className="badges">{out}</span>;
}

function RowActs({ r, onOpen }: { r: Rule; onOpen: (id: string) => void }) {
  const s = useStore(); const { t } = useT();
  return (
    <div className="rowacts">
      <button title={t('Open details')} onClick={() => onOpen(r.id)}><PanelRight16Regular /></button>
      <button title={t(r.enabled ? 'Disable' : 'Enable')} onClick={() => s.setEnabled([r.id], !r.enabled)}>{r.enabled ? <EyeOff16Regular /> : <Eye16Regular />}</button>
      <button title={t('Clone')} onClick={() => s.clone([r.id])}><Copy16Regular /></button>
      <button title={t('Delete')} className="danger" onClick={() => s.remove([r.id])}><Delete16Regular /></button>
    </div>
  );
}
