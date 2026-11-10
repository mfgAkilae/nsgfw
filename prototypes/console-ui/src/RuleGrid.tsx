// PROTOTYPE, throwaway. The Rule base table on AG Grid Community. This is also the AG Grid check of issue 25.
import { useEffect, useMemo, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { AllCommunityModule, ModuleRegistry, themeQuartz, ColDef, GridApi, RowClassRules, ICellRendererParams } from 'ag-grid-community';
import { Menu, MenuTrigger, MenuPopover, MenuList, MenuItem, Button, Tooltip } from '@fluentui/react-components';
import { MoreHorizontal16Regular, ShieldError16Filled, Warning16Filled, Info16Regular, Clock16Regular, PeopleSwap16Regular, LayerDiagonal16Regular, ErrorCircle16Filled } from '@fluentui/react-icons';
import { Rule, svcName, ref } from './data';
import { useStore, alsoChanged, cost } from './store';
import { useT } from './i18n';
import { Chip, RefsEditor } from './ObjectPicker';

ModuleRegistry.registerModules([AllCommunityModule]);
export const gridTheme = themeQuartz.withParams({ fontFamily: 'Segoe UI, system-ui, sans-serif', fontSize: 13, rowHeight: 34, headerHeight: 34, spacing: 5, accentColor: '#0f6cbd', wrapperBorderRadius: 4, headerBackgroundColor: '#f5f5f5' });

export type SysRow = { id: string; system: 'pe' | 'intra' | 'inherited' | 'denyall' | 'azure'; name: string; text: string };
export const systemTop: SysRow[] = [{ id: 'sys-pe', system: 'pe', name: 'Platform exceptions', text: 'AzureLoadBalancer → any · allow (health probes) · above every Rule, cannot be overridden' }];
export const systemBottom: SysRow[] = [
  { id: 'sys-intra', system: 'intra', name: 'Intra-zone default', text: 'Traffic inside one Zone · allow · a Rule above can override it' },
  { id: 'sys-inh', system: 'inherited', name: 'Inherited defaults', text: 'On 1,612 Zones: VirtualNetwork in/out, Internet out · remove per Zone through a Change set' },
  { id: 'sys-deny', system: 'denyall', name: 'Deny-all rules', text: 'any → any · deny · inbound and outbound on every Managed NSG' },
  { id: 'sys-az', system: 'azure', name: 'Azure default rules (read-only)', text: 'AllowVnetInBound, AllowAzureLoadBalancerInBound, DenyAllInBound, AllowVnetOutBound, AllowInternetOutBound, DenyAllOutBound · never reached' },
];

const compact = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(n));

export interface RuleGridHandle { selected(): string[]; api(): GridApi | undefined }
interface Props { rows: Rule[]; quick?: string; readOnly?: boolean; onlyChanged?: boolean; showSystem?: boolean; systemRows?: { top: SysRow[]; bottom: SysRow[] }; showCost?: boolean; onSelection?: (ids: string[]) => void; onMoveTo?: (ids: string[]) => void; height?: string; onReady?: (ms: number) => void; compactCols?: boolean }

export const RuleGrid = forwardRef<RuleGridHandle, Props>(function RuleGrid(p, refH) {
  const s = useStore();
  const { t, lang } = useT();
  const sRef = useRef(s); sRef.current = s;
  const grid = useRef<AgGridReact>(null);
  const [sorted, setSorted] = useState(false);
  const t0 = useRef(performance.now());
  useImperativeHandle(refH, () => ({ selected: () => grid.current?.api?.getSelectedRows().map((r: Rule) => r.id) ?? [], api: () => grid.current?.api }));

  // Numbers, row classes and badges depend on the store, not on the row object: redraw the visible rows when they change.
  useEffect(() => { grid.current?.api?.redrawRows(); }, [s.status, s.numbers]);
  useEffect(() => { grid.current?.api?.refreshHeader(); grid.current?.api?.redrawRows(); }, [lang]);

  const st = (id: string) => sRef.current.status.get(id);
  const isSys = (x: any) => !!x?.system;
  const editable = (x: any) => !p.readOnly && !isSys(x?.data) && !st(x?.data?.id)?.deleted;
  const changedCls = (field: string) => ({ 'cell-changed': (x: any) => !!st(x.data?.id)?.changed?.has(field) });

  const cols = useMemo<ColDef[]>(() => [
    { colId: 'drag', headerName: '', width: 34, rowDrag: x => !p.readOnly && !isSys(x.data), sortable: false, suppressMovable: true, pinned: 'left' },
    { colId: 'no', headerName: t('No.'), width: 72, pinned: 'left', sortable: true, comparator: (_a, _b, na, nb) => (sRef.current.numbers.get(na.data.id) ?? 0) - (sRef.current.numbers.get(nb.data.id) ?? 0),
      valueGetter: x => (isSys(x.data) ? '' : sRef.current.numbers.get(x.data.id) ?? '—'), cellClass: 'num' },
    { field: 'name', headerName: t('Name'), width: 300, editable, cellClassRules: changedCls('name'), getQuickFilterText: x => `${x.data.name} ${x.data.id}`,
      cellRenderer: (x: ICellRendererParams) => isSys(x.data) ? <span className="sys"><b>{t(x.data.name)}</b> <span className="muted">{x.data.text}</span></span>
        : <span>{x.data.name} <span className="rid">{x.data.id}</span></span>,
      colSpan: x => (isSys(x.data) ? 8 : 1) },
    ...(['src', 'dst'] as const).map((f): ColDef => ({ field: f, headerName: t(f === 'src' ? 'Source' : 'Destination'), width: 230, editable, cellDataType: false, cellClassRules: changedCls(f),
      cellEditor: RefsEditor, cellEditorParams: { mode: 'addr' }, cellEditorPopup: true, cellEditorPopupPosition: 'under',
      getQuickFilterText: x => (x.data[f] as string[]).map(id => ref(id).name).join(' '),
      cellRenderer: (x: ICellRendererParams) => isSys(x.data) ? null : <div className="chips">{(x.value as string[]).slice(0, 3).map(id => <Chip key={id} id={id} />)}{x.value.length > 3 && <span className="more">+{x.value.length - 3}</span>}</div> })),
    { field: 'svc', headerName: t('Service'), width: 170, editable, cellDataType: false, cellClassRules: changedCls('svc'), cellEditor: RefsEditor, cellEditorParams: { mode: 'svc' }, cellEditorPopup: true,
      getQuickFilterText: x => x.data.svc.map(svcName).join(' '),
      cellRenderer: (x: ICellRendererParams) => isSys(x.data) ? null : <div className="chips">{(x.value as string[]).map(id => <Chip key={id} id={id} />)}</div> },
    { field: 'action', headerName: t('Action'), width: 104, editable, cellClassRules: changedCls('action'), cellEditor: 'agSelectCellEditor', cellEditorParams: { values: ['allow', 'deny'] },
      cellRenderer: (x: ICellRendererParams) => isSys(x.data) ? null : <span className={`act ${x.value}`}>{t(x.value)}</span> },
    { field: 'hits', headerName: t('Hits'), width: 86, type: 'rightAligned', headerTooltip: t('hits ~70 min old'),
      cellRenderer: (x: ICellRendererParams) => isSys(x.data) ? null : x.value == null ? <Tooltip content={t('no flow data')} relationship="label"><span className="muted">—</span></Tooltip> : <span className={x.value === 0 ? 'muted' : ''}>{compact(x.value)}</span> },
    ...(p.showCost ? [{ colId: 'cost', headerName: t('Rule cost'), width: 120, cellDataType: false, headerTooltip: 'Managed NSGs · NSG rules this Rule generates',
      valueGetter: (x: any) => (isSys(x.data) ? '' : cost(x.data)), cellRenderer: (x: ICellRendererParams) => x.value ? <span className="muted">{x.value.nsgs} NSG · {x.value.nsgRules} rules</span> : null } as ColDef] : []),
    { colId: 'flags', headerName: '', width: 92, sortable: false, cellRenderer: (x: ICellRendererParams) => isSys(x.data) ? null : <Badges r={x.data} /> },
    { field: 'comment', headerName: t('Comment'), width: 190, editable, cellClassRules: changedCls('comment') },
    ...(p.compactCols ? [] : [
      { field: 'ticket', headerName: t('Ticket'), width: 104, editable, cellClassRules: changedCls('ticket') } as ColDef,
      { field: 'owner', headerName: t('Owner'), width: 120, editable, cellClassRules: changedCls('owner') } as ColDef,
      { field: 'expiry', headerName: t('Expiry'), width: 106, editable, cellClassRules: changedCls('expiry') } as ColDef,
    ]),
    { field: 'enabled', headerName: t('Enabled'), width: 84, editable, cellDataType: 'boolean', cellClassRules: changedCls('enabled') },
    { colId: 'menu', headerName: '', width: 44, pinned: 'right', sortable: false, cellRenderer: (x: ICellRendererParams) => isSys(x.data) || p.readOnly ? null : <RowMenu r={x.data} onMoveTo={p.onMoveTo} /> },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [lang, p.readOnly, p.showCost, p.compactCols]);

  const rowClassRules = useMemo<RowClassRules>(() => ({
    'row-sys': x => isSys(x.data), 'row-added': x => !!st(x.data?.id)?.added, 'row-deleted': x => !!st(x.data?.id)?.deleted,
    'row-moved': x => !!st(x.data?.id)?.moved, 'row-changed': x => !!st(x.data?.id)?.changed, 'row-disabled': x => x.data && !isSys(x.data) && !x.data.enabled,
  }), []);

  const rows = useMemo(() => (p.onlyChanged ? p.rows.filter(r => s.status.has(r.id)) : p.rows), [p.rows, p.onlyChanged, s.status]);

  return (
    <div style={{ height: p.height ?? '100%', width: '100%', position: 'relative' }}>
      {sorted && !p.readOnly && <div className="grid-hint">{t('Drag is off while sorted or filtered: use Move to…')}</div>}
      <AgGridReact
        ref={grid} theme={gridTheme} rowData={rows} columnDefs={cols} getRowId={x => x.data.id}
        defaultColDef={{ sortable: true, resizable: true, suppressHeaderMenuButton: true }}
        rowSelection={{ mode: 'multiRow', checkboxes: x => !isSys(x.data), headerCheckbox: true, enableClickSelection: false, isRowSelectable: x => !isSys(x.data), selectAll: 'filtered' }}
        selectionColumnDef={{ pinned: 'left', width: 44 }}
        pinnedTopRowData={p.showSystem ? (p.systemRows?.top ?? systemTop) : undefined}
        pinnedBottomRowData={p.showSystem ? (p.systemRows?.bottom ?? systemBottom) : undefined}
        quickFilterText={p.quick} rowClassRules={rowClassRules} readOnlyEdit
        onCellEditRequest={e => s.editField(e.data.id, e.colDef.field as keyof Rule, e.newValue)}
        rowDragMultiRow suppressRowDrag={sorted} animateRows={false}
        onSortChanged={e => setSorted(e.api.getColumnState().some(c => c.sort && c.colId !== 'no'))}
        onRowDragEnd={e => {
          const target = e.overNode?.data as Rule | undefined;
          if (!target || isSys(target)) return;
          const moving = (e.nodes?.length ? e.nodes : [e.node]).map(n => (n.data as Rule).id).filter(id => id !== target.id);
          if (!moving.length) return;
          const all = s.rules; const from = all.findIndex(r => r.id === moving[0]); const to = all.findIndex(r => r.id === target.id);
          s.move(moving, target.id, from < to ? 'after' : 'before');
        }}
        onSelectionChanged={e => p.onSelection?.(e.api.getSelectedRows().map((r: Rule) => r.id))}
        onFirstDataRendered={() => p.onReady?.(Math.round(performance.now() - t0.current))}
        tooltipShowDelay={300}
      />
    </div>
  );
});

function Badges({ r }: { r: Rule }) {
  const { t } = useT();
  const s = useStore();
  const also = alsoChanged.get(r.id);
  const out = [];
  if (r.policy) out.push(<Tooltip key="p" content={`Policy finding · ${r.policy}`} relationship="description"><ShieldError16Filled className="b-red" /></Tooltip>);
  if (r.importNote) out.push(<Tooltip key="i" content={`Import note (${r.importNote}): from nsg-legacy-017 rule "allow-sql", priority 310, inbound`} relationship="description">{r.importNote === 'blocking' ? <ErrorCircle16Filled className="b-red" /> : r.importNote === 'warning' ? <Warning16Filled className="b-amber" /> : <Info16Regular className="b-blue" />}</Tooltip>);
  if (r.layerWarn) out.push(<Tooltip key="l" content={`Security layer: ${r.layerWarn}`} relationship="description"><LayerDiagonal16Regular className="b-amber" /></Tooltip>);
  if (r.expiry) out.push(<Tooltip key="e" content={`${t('Expiry')}: ${r.expiry}`} relationship="description"><Clock16Regular className="b-amber" /></Tooltip>);
  if (also && s.status.has(r.id)) out.push(<Tooltip key="a" content={`${t('also changed in')} "${also.set}" ${t('by')} ${also.by}`} relationship="description"><PeopleSwap16Regular className="b-red" /></Tooltip>);
  else if (also) out.push(<Tooltip key="a" content={`${t('also changed in')} "${also.set}" ${t('by')} ${also.by}`} relationship="description"><PeopleSwap16Regular className="b-grey" /></Tooltip>);
  return <span className="badges">{out}</span>;
}

function RowMenu({ r, onMoveTo }: { r: Rule; onMoveTo?: (ids: string[]) => void }) {
  const s = useStore(); const { t } = useT();
  return (
    <Menu>
      <MenuTrigger disableButtonEnhancement><Button appearance="subtle" size="small" icon={<MoreHorizontal16Regular />} aria-label="Rule actions" /></MenuTrigger>
      <MenuPopover><MenuList>
        <MenuItem onClick={() => s.clone([r.id])}>{t('Clone')}</MenuItem>
        <MenuItem onClick={() => s.setEnabled([r.id], !r.enabled)}>{t(r.enabled ? 'Disable' : 'Enable')}</MenuItem>
        <MenuItem onClick={() => onMoveTo?.([r.id])}>{t('Move to…')}</MenuItem>
        <MenuItem onClick={() => s.addRule(r.id)}>{t('New Rule')} ↓</MenuItem>
        <MenuItem onClick={() => s.remove([r.id])}>{t('Delete')}</MenuItem>
      </MenuList></MenuPopover>
    </Menu>
  );
}
