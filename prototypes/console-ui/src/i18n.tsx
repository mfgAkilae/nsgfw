// PROTOTYPE, throwaway. English is the key; German terms are proposals for review (see README).
import { createContext, useContext, useState, ReactNode } from 'react';

const de: Record<string, string> = {
  'Rule base': 'Regelwerk', 'Rule': 'Regel', 'Zones': 'Zonen', 'Zone': 'Zone', 'Objects': 'Objekte', 'Change sets': 'Änderungspakete',
  'Change set': 'Änderungspaket', 'Pending changes': 'Ausstehende Änderungen', 'Preview': 'Vorschau', 'Commit': 'Commit', 'Submit': 'Einreichen',
  'Discard': 'Verwerfen', 'Emergency Commit': 'Notfall-Commit', 'Approval': 'Freigabe', 'Affected Zones': 'Betroffene Zonen', 'Write order': 'Schreibreihenfolge',
  'Changes': 'Änderungen', 'Policy findings': 'Policy-Befunde', 'No.': 'Nr.', 'Name': 'Name', 'Source': 'Quelle', 'Destination': 'Ziel', 'Service': 'Dienst',
  'Action': 'Aktion', 'Hits': 'Treffer', 'Comment': 'Kommentar', 'Ticket': 'Ticket', 'Owner': 'Verantwortlich', 'Expiry': 'Ablauf', 'Enabled': 'Aktiv',
  'allow': 'zulassen', 'deny': 'verweigern', 'Search Rules, objects, Rule IDs, tickets…': 'Regeln, Objekte, Regel-IDs, Tickets suchen…', 'Clone': 'Klonen',
  'Disable': 'Deaktivieren', 'Enable': 'Aktivieren', 'Delete': 'Löschen', 'Move to…': 'Verschieben nach…', 'New Rule': 'Neue Regel', 'selected': 'ausgewählt',
  'Inbox': 'Posteingang', 'Disabled': 'Deaktiviert', 'Azure default rules': 'Azure-Standardregeln', 'Rules': 'Regeln', 'Egress posture': 'Ausgangsverhalten',
  'Azure Load Balancer health probes are allowed above every Rule. No Rule can override them.': 'Health Probes des Azure Load Balancer sind über allen Regeln erlaubt. Keine Regel kann das überschreiben.',
  'Traffic that stays inside one Zone is allowed. A Rule above can override it.': 'Verkehr innerhalb einer Zone ist erlaubt. Eine Regel darüber kann das überschreiben.',
  '1,612 Zones keep what Azure allowed before onboarding: VirtualNetwork in and out, Internet out.': '1.612 Zonen behalten, was Azure vor der Aufnahme erlaubte: VirtualNetwork ein- und ausgehend, Internet ausgehend.',
  'Everything else is denied, inbound and outbound, on every Managed NSG.': 'Alles andere wird verweigert, eingehend und ausgehend, auf jeder verwalteten NSG.',
  'Read-only and never reached: AllowVnetInBound, AllowInternetOutBound and the other four sit below the Deny-all rules.': 'Schreibgeschützt und nie erreicht: AllowVnetInBound, AllowInternetOutBound und die vier weiteren liegen unter den Deny-all-Regeln.', 'NSG rule': 'NSG-Regel', 'Open details': 'Details öffnen', 'Open': 'Offen', 'Light mode': 'Heller Modus', 'Dark mode': 'Dunkler Modus', 'Filter Rules by name, object, ID or ticket': 'Regeln filtern nach Name, Objekt, ID oder Ticket',
  'Jump to': 'Springen zu', 'Comfortable rows': 'Luftige Zeilen', 'Compact rows': 'Kompakte Zeilen', 'Show what sits above and below the Rules': 'Zeigen, was über und unter den Regeln liegt', 'Side panel': 'Seitenleiste',
  'Back to all Rules': 'Zurück zu allen Regeln', 'Clear selection': 'Auswahl aufheben', 'With findings': 'Mit Befunden', 'No hits': 'Ohne Treffer', 'Expiring': 'Läuft ab', 'Changed': 'Geändert',
  'land on this Zone inbound': 'wirken eingehend auf diese Zone', 'land on this Zone outbound': 'wirken ausgehend auf diese Zone', 'Top-down, the first match wins. Flow data is about 70 minutes old.': 'Von oben nach unten, der erste Treffer entscheidet. Flow-Daten sind etwa 70 Minuten alt.',
  'Every Managed NSG against its Azure limits. Click a Zone to see the Rules that land on it.': 'Jede verwaltete NSG gegen ihre Azure-Limits. Ein Klick auf eine Zone zeigt die Regeln, die auf sie wirken.',
  'Zones, addresses, Azure service tags, ASG objects and groups.': 'Zonen, Adressen, Azure-Service-Tags, ASG-Objekte und Gruppen.', 'Close': 'Schließen', 'Policy': 'Policy', 'Managed NSGs change': 'verwaltete NSGs ändern sich',
  'Cannot be ordered': 'Nicht ordenbar', 'write steps': 'Schreibschritte', 'write step': 'Schreibschritt', 'Approvals': 'Freigaben', 'No Approval needed': 'Keine Freigabe nötig', 'Policy finding blocks': 'Policy-Befund blockiert',
  'Review': 'Prüfen', 'Submit for Approval': 'Zur Freigabe einreichen', 'No Rule selected': 'Keine Regel gewählt', 'Click a Rule to see its objects in full and what it becomes in Azure.': 'Ein Klick auf eine Regel zeigt ihre Objekte vollständig und was in Azure daraus wird.',
  'open Zone': 'Zone öffnen', 'outside every Zone': 'außerhalb jeder Zone', 'From': 'Von', 'to': 'nach', 'on': 'auf', 'In Azure': 'In Azure', 'Managed NSGs': 'verwalteten NSGs', 'No NSG rule: neither side covers a Zone.': 'Keine NSG-Regel: keine Seite deckt eine Zone ab.',
  'more NSGs': 'weitere NSGs', 'Needs attention': 'Braucht Aufmerksamkeit', 'Details': 'Details', 'never': 'nie', 'data about 70 minutes old': 'Daten etwa 70 Minuten alt', 'No flow data for this Rule': 'Keine Flow-Daten für diese Regel',
  'Flow data is about 70 minutes old': 'Flow-Daten sind etwa 70 Minuten alt', 'expires': 'läuft ab', 'Drag is off while sorted: use Move to…': 'Ziehen ist bei Sortierung aus: „Verschieben nach…“ nutzen',
  'Rule name, number or ID, Zone, or an action': 'Regelname, Nummer oder ID, Zone oder eine Aktion', 'Actions': 'Aktionen', 'Review Change set': 'Änderungspaket prüfen', 'Go to Rule base': 'Zum Regelwerk', 'Go to Zones': 'Zu den Zonen',
  'Go to Objects': 'Zu den Objekten', 'Go to Change sets': 'Zu den Änderungspaketen', 'Switch light and dark mode': 'Hell und dunkel wechseln', 'Switch language': 'Sprache wechseln', 'choose': 'wählen', 'open': 'öffnen', 'close': 'schließen',
  'Nothing matches. Try a Rule number like 42, a Zone name or an address prefix.': 'Kein Treffer. Versuchen Sie eine Regelnummer wie 42, einen Zonennamen oder ein Adresspräfix.', 'All': 'Alle', 'edits': 'Änderungen', 'based on Version': 'auf Basis von Version', 'created': 'neu', 'changed': 'geändert', 'Review and commit': 'Prüfen und committen', 'Rules are evaluated top-down. The first match wins.': 'Regeln gelten von oben nach unten. Der erste Treffer entscheidet.', 'Every Managed NSG against its Azure limits.': 'Jede verwaltete NSG gegen ihre Azure-Limits.', 'Added': 'Hinzugefügt', 'Deleted': 'Gelöscht', 'Moved': 'Verschoben', 'Turned on': 'Eingeschaltet', 'Turned off': 'Ausgeschaltet', 'Edited': 'Geändert', 'Allow': 'Zulassen', 'Deny': 'Verweigern', 'disabled': 'deaktiviert', 'new': 'neu', 'edited': 'geändert', 'moved': 'verschoben', 'deleted': 'gelöscht', 'Version': 'Version', 'Candidates': 'Kandidaten', 'Flagged': 'Markiert', 'Managed NSG': 'Verwaltete NSG',
  'destination decides': 'Ziel entscheidet', 'strict': 'strikt', 'NSG rules': 'NSG-Regeln', 'of': 'von', 'Platform exceptions': 'Plattform-Ausnahmen',
  'Intra-zone default': 'Intra-Zonen-Standard', 'Deny-all rules': 'Deny-all-Regeln', 'Azure default rules (read-only)': 'Azure-Standardregeln (schreibgeschützt)',
  'Inherited defaults': 'Geerbte Standards', 'Submitted': 'Eingereicht', 'Approved': 'Freigegeben', 'Committed': 'Committet',
  'only changed': 'nur geänderte', 'show system rows': 'Systemzeilen zeigen', 'Environment': 'Umgebung', 'VNet': 'VNet', 'Prefixes': 'Präfixe', 'Flags': 'Hinweise',
  'Source addresses': 'Quelladressen', 'Destination addresses': 'Zieladressen', 'ASGs': 'ASGs', 'cost': 'Kosten', 'NSGs': 'NSGs', 'step': 'Schritt', 'steps': 'Schritte',
  'Waiting for Submit': 'Wartet auf Einreichen', 'waiting': 'wartend', 'approved by': 'freigegeben von', 'not required': 'nicht nötig', 'four-eyes': 'Vier-Augen',
  'approver': 'Freigebender', 'none': 'keine', 'Reason (required)': 'Begründung (Pflicht)', 'Cancel': 'Abbrechen', 'Apply': 'Übernehmen', 'Done': 'Fertig',
  'Pick objects': 'Objekte wählen', 'Hosts & networks': 'Hosts & Netze', 'Service tags': 'Service-Tags', 'VNets': 'VNets', 'Groups': 'Gruppen',
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
  'Platform exception, cannot be overridden': 'Plattform-Ausnahme, nicht überschreibbar', 'implicit': 'implizit', 'Object library': 'Objektbibliothek',
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
