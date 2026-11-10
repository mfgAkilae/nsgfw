// PROTOTYPE, throwaway. One small glyph per object kind, so a token says what it is without colour noise.
import { ObjKind } from './data';
type K = ObjKind | 'svc';
const paths: Record<K, JSX.Element> = {
  zone: <><rect x="1.5" y="1.5" width="9" height="9" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.3" /><rect x="4" y="4" width="4" height="4" rx=".6" fill="currentColor" /></>,
  vnet: <path d="M6 1.2 10.2 3.6v4.8L6 10.8 1.8 8.4V3.6Z" fill="none" stroke="currentColor" strokeWidth="1.3" />,
  ip: <circle cx="6" cy="6" r="2.6" fill="currentColor" />,
  cidr: <><circle cx="6" cy="6" r="4.3" fill="none" stroke="currentColor" strokeWidth="1.3" /><circle cx="6" cy="6" r="1.6" fill="currentColor" /></>,
  tag: <path d="M1.5 2.5h5l4 3.5-4 3.5h-5Z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />,
  subnet: <rect x="1.5" y="1.5" width="9" height="9" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.2" strokeDasharray="2 1.6" />,
  asg: <><circle cx="6" cy="3" r="1.7" fill="currentColor" /><circle cx="2.8" cy="8.6" r="1.7" fill="currentColor" /><circle cx="9.2" cy="8.6" r="1.7" fill="currentColor" /></>,
  extasg: <><circle cx="6" cy="3" r="1.5" fill="none" stroke="currentColor" strokeWidth="1.1" /><circle cx="2.8" cy="8.6" r="1.5" fill="none" stroke="currentColor" strokeWidth="1.1" /><circle cx="9.2" cy="8.6" r="1.5" fill="none" stroke="currentColor" strokeWidth="1.1" /></>,
  group: <><rect x="1.2" y="3.5" width="6.5" height="6.5" rx="1" fill="none" stroke="currentColor" strokeWidth="1.2" /><rect x="4.3" y="1.2" width="6.5" height="6.5" rx="1" fill="currentColor" opacity=".85" /></>,
  any: <path d="M6 1.5v9M2.1 3.75l7.8 4.5M2.1 8.25l7.8-4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />,
  svc: <path d="M2 4h8M2 8h8M4.5 2v8M7.5 2v8" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />,
};
export const Glyph = ({ kind }: { kind: K }) => <svg className={`glyph g-${kind}`} width="12" height="12" viewBox="0 0 12 12" aria-hidden>{paths[kind]}</svg>;
