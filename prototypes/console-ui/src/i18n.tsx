// PROTOTYPE, throwaway. English is the key; German terms are proposals for review (see README).
import { createContext, useContext, useState, ReactNode } from 'react';

const de: Record<string, string> = {
  'Rule base': 'Regelwerk', 'Rules': 'Regeln', 'Rule': 'Regel', 'Zones': 'Zonen', 'Zone': 'Zone', 'Objects': 'Objekte', 'Change sets': 'Änderungspakete',
  'Change set': 'Änderungspaket', 'Pending changes': 'Ausstehende Änderungen', 'Preview': 'Vorschau', 'Commit': 'Commit', 'Submit': 'Einreichen',
  'Discard': 'Verwerfen', 'Emergency Commit': 'Notfall-Commit', 'Approval': 'Freigabe', 'Affected Zones': 'Betroffene Zonen', 'Write order': 'Schreibreihenfolge',
  'Changes': 'Änderungen', 'Policy findings': 'Policy-Befunde', 'No.': 'Nr.', 'Name': 'Name', 'Source': 'Quelle', 'Destination': 'Ziel', 'Service': 'Dienst',
  'Action': 'Aktion', 'Hits': 'Treffer', 'Comment': 'Kommentar', 'Ticket': 'Ticket', 'Owner': 'Verantwortlich', 'Expiry': 'Ablauf', 'Enabled': 'Aktiv',
  'allow': 'zulassen', 'deny': 'verweigern', 'Search Rules, objects, Rule IDs, tickets…': 'Regeln, Objekte, Regel-IDs, Tickets suchen…', 'Clone': 'Klonen',
  'Disable': 'Deaktivieren', 'Enable': 'Aktivieren', 'Delete': 'Löschen', 'Move to…': 'Verschieben nach…', 'New Rule': 'Neue Regel', 'selected': 'ausgewählt',
  'Inbox': 'Posteingang', 'edits': 'Änderungen', 'based on Version': 'auf Basis von Version', 'created': 'neu', 'changed': 'geändert', 'Review and commit': 'Prüfen und committen', 'Rules are evaluated top-down. The first match wins.': 'Regeln gelten von oben nach unten. Der erste Treffer entscheidet.', 'Every Managed NSG against its Azure limits.': 'Jede verwaltete NSG gegen ihre Azure-Limits.', 'Added': 'Hinzugefügt', 'Deleted': 'Gelöscht', 'Moved': 'Verschoben', 'Turned on': 'Eingeschaltet', 'Turned off': 'Ausgeschaltet', 'Edited': 'Geändert', 'Allow': 'Zulassen', 'Deny': 'Verweigern', 'disabled': 'deaktiviert', 'new': 'neu', 'edited': 'geändert', 'moved': 'verschoben', 'deleted': 'gelöscht', 'Version': 'Version', 'Candidates': 'Kandidaten', 'Flagged': 'Markiert', 'Managed NSG': 'Verwaltete NSG', 'Egress posture': 'Ausgangsverhalten',
  'destination decides': 'Ziel entscheidet', 'strict': 'strikt', 'NSG rules': 'NSG-Regeln', 'of': 'von', 'Platform exceptions': 'Plattform-Ausnahmen',
  'Intra-zone default': 'Intra-Zonen-Standard', 'Deny-all rules': 'Deny-all-Regeln', 'Azure default rules (read-only)': 'Azure-Standardregeln (schreibgeschützt)',
  'Inherited defaults': 'Geerbte Standards', 'Open': 'Offen', 'Submitted': 'Eingereicht', 'Approved': 'Freigegeben', 'Committed': 'Committet',
  'only changed': 'nur geänderte', 'show system rows': 'Systemzeilen zeigen', 'Environment': 'Umgebung', 'VNet': 'VNet', 'Prefixes': 'Präfixe', 'Flags': 'Hinweise',
  'Source addresses': 'Quelladressen', 'Destination addresses': 'Zieladressen', 'ASGs': 'ASGs', 'cost': 'Kosten', 'NSGs': 'NSGs', 'step': 'Schritt', 'steps': 'Schritte',
  'Waiting for Submit': 'Wartet auf Einreichen', 'waiting': 'wartend', 'approved by': 'freigegeben von', 'not required': 'nicht nötig', 'four-eyes': 'Vier-Augen',
  'approver': 'Freigebender', 'none': 'keine', 'Reason (required)': 'Begründung (Pflicht)', 'Cancel': 'Abbrechen', 'Apply': 'Übernehmen', 'Done': 'Fertig',
  'Pick objects': 'Objekte wählen', 'All': 'Alle', 'Hosts & networks': 'Hosts & Netze', 'Service tags': 'Service-Tags', 'VNets': 'VNets', 'Groups': 'Gruppen',
  'covers no Zone': 'deckt keine Zone ab', 'covers': 'deckt ab', 'Zones (Coverage)': 'Zonen (Abdeckung)', 'also changed in': 'auch geändert in', 'by': 'von',
  'Rebase needed': 'Rebase nötig', 'Scheduled': 'Geplant', 'awaiting approval afterwards': 'Freigabe ausstehend (nachträglich)', 'My Change sets': 'Meine Änderungspakete',
  'Other Change sets': 'Andere Änderungspakete', 'Renumbered only': 'Nur neu nummeriert', 'Run check now': 'Jetzt prüfen', 'This Change set cannot be ordered': 'Dieses Änderungspaket lässt sich nicht ordnen',
  'Split it into two Change sets, one per direction of the flow.': 'Teilen Sie es in zwei Änderungspakete, eines je Richtung des Flusses.',
  'Crossing flows': 'Kreuzende Flüsse', 'waits for': 'wartet auf', 'No edits yet. Edit a cell, drag a Rule or use the toolbar.': 'Noch keine Änderungen. Zelle bearbeiten, Regel ziehen oder Werkzeugleiste nutzen.',
  'Not onboardable': 'Nicht aufnehmbar', 'Onboard': 'Aufnehmen', 'Existing NSG': 'Vorhandene NSG', 'Highest use per subscription and region': 'Höchste Nutzung je Subscription und Region',
  'Edit Rules': 'Regeln bearbeiten', 'Start a Change set to edit': 'Zum Bearbeiten ein Änderungspaket starten', 'Start Change set': 'Änderungspaket starten',
  'Effective rule set': 'Effektiver Regelsatz', 'Inbound': 'Eingehend', 'Outbound': 'Ausgehend', 'All Rules': 'Alle Regeln', 'Search Zones…': 'Zonen suchen…',
  'This Change set also touches': 'Dieses Änderungspaket betrifft außerdem', 'other Zones': 'weitere Zonen', 'Deployments, Drift, audit…': 'Deployments, Drift, Audit…',
  'later prototype': 'späterer Prototyp', 'no flow data': 'keine Flow-Daten', 'Data from': 'Daten von', 'hits ~70 min old': 'Treffer ~70 Min. alt',
  'Rule cost': 'Regelkosten', 'Approve as kim (prototype)': 'Als kim freigeben (Prototyp)', 'Committed as Version': 'Committet als Version', 'Deployments started': 'Deployments gestartet',
  'open': 'offen', 'Platform exception, cannot be overridden': 'Plattform-Ausnahme, nicht überschreibbar', 'implicit': 'implizit', 'Object library': 'Objektbibliothek',
  'used in': 'verwendet in', 'Move selected Rules': 'Ausgewählte Regeln verschieben', 'before Rule number': 'vor Regel Nr.', 'to the top': 'nach oben', 'to the bottom': 'nach unten',
  'Steps': 'Schritte', 'holds back': 'hält zurück', 'Each Affected Zone needs its Approval level.': 'Jede betroffene Zone braucht ihre Freigabestufe.',
  'drag to reorder': 'zum Umsortieren ziehen', 'Drag is off while sorted or filtered: use Move to…': 'Ziehen ist bei Sortierung oder Filter aus: „Verschieben nach…“ nutzen',
};

type T = (key: string) => string;
const Ctx = createContext<{ lang: 'en' | 'de'; setLang: (l: 'en' | 'de') => void; t: T }>({ lang: 'en', setLang: () => {}, t: k => k });
export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<'en' | 'de'>(() => (new URLSearchParams(location.search).get('lang') === 'de' ? 'de' : 'en'));
  const t: T = k => (lang === 'de' ? de[k] ?? k : k);
  return <Ctx.Provider value={{ lang, setLang, t }}>{children}</Ctx.Provider>;
}
export const useT = () => useContext(Ctx);
