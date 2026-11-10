// PROTOTYPE, throwaway. One token set for light and dark. The palettes below are the single source: they become CSS variables
// (used by app.css and the AG Grid theme) and feed the two Fluent themes.
import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { createLightTheme, createDarkTheme, BrandVariants, Theme, FluentProvider } from '@fluentui/react-components';
import '@fontsource-variable/atkinson-hyperlegible-next/index.css';
import '@fontsource-variable/atkinson-hyperlegible-mono/index.css';

export type Mode = 'light' | 'dark';
const palettes = {
  light: {
    canvas: '#f3f4f7', surface: '#ffffff', raised: '#ffffff', sunken: '#f7f8fa', rail: '#141a29', railInk: '#aab3c5',
    ink: '#131a2a', ink2: '#4a5467', ink3: '#6e788c', line: '#e2e5ec', line2: '#eef0f4', hover: '#f4f5f9', sel: '#eceefe', tok: '#eff1f5',
    accent: '#4553e0', accentInk: '#ffffff', accentText: '#3a47cc', accentTint: '#eceefe',
    allow: '#0c8657', allowTint: '#e3f5ec', deny: '#d0363d', denyTint: '#fce9ea', amber: '#a86c0b', amberTint: '#fdf1d8',
    teal: '#0a8790', violet: '#8743d3', orange: '#c05f0c', shadow: '0 16px 48px rgba(19,26,42,.18), 0 2px 6px rgba(19,26,42,.08)',
  },
  dark: {
    canvas: '#0e1218', surface: '#141920', raised: '#1b212b', sunken: '#11161c', rail: '#0a0d12', railInk: '#8791a3',
    ink: '#e7ebf3', ink2: '#a9b2c2', ink3: '#7d889b', line: '#262d39', line2: '#1d232d', hover: '#1a202a', sel: '#1e2444', tok: '#1e2530',
    accent: '#7c89ff', accentInk: '#0b0e18', accentText: '#9aa4ff', accentTint: '#1d2242',
    allow: '#3ecf8e', allowTint: '#12281f', deny: '#f4737a', denyTint: '#30171a', amber: '#ebb15a', amberTint: '#2c2212',
    teal: '#45c4cc', violet: '#b48cf2', orange: '#f0935a', shadow: '0 20px 56px rgba(0,0,0,.55), 0 0 0 1px #2b3340',
  },
} as const;
const kebab = (k: string) => k.replace(/[A-Z]/g, m => `-${m.toLowerCase()}`);

const iris: BrandVariants = {
  10: '#05061a', 20: '#0d1038', 30: '#151b58', 40: '#1d2678', 50: '#263198', 60: '#2f3cb5', 70: '#3a47cc', 80: '#4553e0',
  90: '#5d6ae8', 100: '#7480ef', 110: '#7c89ff', 120: '#9aa4ff', 130: '#b5bcff', 140: '#cfd4ff', 150: '#e3e6ff', 160: '#f3f4ff',
};
const font = "'Atkinson Hyperlegible Next Variable', system-ui, sans-serif";
function fluent(mode: Mode): Theme {
  const p = palettes[mode]; const base = mode === 'dark' ? createDarkTheme(iris) : createLightTheme(iris);
  return {
    ...base, fontFamilyBase: font, fontFamilyNumeric: font, fontFamilyMonospace: "'Atkinson Hyperlegible Mono Variable', monospace",
    colorNeutralBackground1: p.raised, colorNeutralBackground2: p.sunken, colorNeutralBackground3: p.canvas, colorNeutralBackground1Hover: p.hover, colorNeutralBackground1Pressed: p.hover,
    colorSubtleBackgroundHover: p.hover, colorSubtleBackgroundPressed: p.sel, colorNeutralForeground1: p.ink, colorNeutralForeground2: p.ink2, colorNeutralForeground3: p.ink3, colorNeutralForeground4: p.ink3,
    colorNeutralStroke1: p.line, colorNeutralStroke2: p.line, colorNeutralStroke3: p.line2, colorNeutralStrokeAccessible: p.ink3,
    colorBrandBackground: p.accent, colorBrandBackgroundHover: mode === 'dark' ? '#8f9aff' : '#3a47cc', colorBrandBackgroundPressed: mode === 'dark' ? '#6f7df5' : '#2f3cb5',
    colorNeutralForegroundOnBrand: p.accentInk, colorBrandForeground1: p.accentText, colorCompoundBrandStroke: p.accent, colorCompoundBrandBackground: p.accent,
    colorBrandStroke1: p.accent, borderRadiusMedium: '7px', borderRadiusSmall: '5px',
  };
}

const Ctx = createContext<{ mode: Mode; toggle: () => void }>({ mode: 'light', toggle: () => {} });
export const useMode = () => useContext(Ctx);
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<Mode>(() => {
    const q = new URLSearchParams(location.search).get('theme');
    return q === 'dark' || q === 'light' ? q : matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });
  // Set the variables before the children render: AG Grid measures its borders on mount and needs them resolved.
  useMemo(() => {
    const el = document.documentElement; el.dataset.theme = mode; el.style.colorScheme = mode;
    Object.entries(palettes[mode]).forEach(([k, v]) => el.style.setProperty(`--${kebab(k)}`, v));
  }, [mode]);
  useEffect(() => { const u = new URL(location.href); u.searchParams.set('theme', mode); history.replaceState(null, '', u); }, [mode]);
  const theme = useMemo(() => fluent(mode), [mode]);
  return <Ctx.Provider value={{ mode, toggle: () => setMode(m => (m === 'dark' ? 'light' : 'dark')) }}><FluentProvider theme={theme} style={{ height: '100%', background: 'transparent' }}>{children}</FluentProvider></Ctx.Provider>;
}
