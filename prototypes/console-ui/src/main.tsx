// PROTOTYPE, throwaway. Console UI of issue 25: one design in light and dark (?theme=dark|light, ?lang=de).
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from './theme';
import { LangProvider } from './i18n';
import { StoreProvider } from './store';
import { SessionProvider } from './session';
import Console from './Console';
import './app.css';

createRoot(document.getElementById('root')!).render(
  <ThemeProvider><LangProvider><StoreProvider><SessionProvider><Console /></SessionProvider></StoreProvider></LangProvider></ThemeProvider>,
);
