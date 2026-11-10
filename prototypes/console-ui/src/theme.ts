// PROTOTYPE, throwaway. Design tokens: "rule ledger". Colour carries meaning only (action, change, warning); cobalt is for interaction.
import { createLightTheme, BrandVariants, Theme } from '@fluentui/react-components';
import '@fontsource-variable/recursive/full.css';

export const tok = {
  ink: '#172033', ink2: '#4a5468', ink3: '#7a8396', canvas: '#f3f5f8', surface: '#ffffff', line: '#e2e6ed',
  cobalt: '#2f4fd0', allow: '#17804d', deny: '#c4343a', amber: '#b9770e', violet: '#6d46c4', teal: '#0d7a82',
};
const cobalt: BrandVariants = {
  10: '#050a1f', 20: '#0b1638', 30: '#10225a', 40: '#162d78', 50: '#1c3896', 60: '#2340b0', 70: '#2948c4', 80: '#2f4fd0',
  90: '#4a67d8', 100: '#6480df', 110: '#7e97e5', 120: '#99aeeb', 130: '#b3c4f1', 140: '#cdd9f6', 150: '#e3eafb', 160: '#f2f5fd',
};
const font = "'Recursive Variable', system-ui, sans-serif";
export const theme: Theme = {
  ...createLightTheme(cobalt), fontFamilyBase: font, fontFamilyMonospace: font, fontFamilyNumeric: font,
  colorNeutralForeground1: tok.ink, colorNeutralForeground2: tok.ink2, colorNeutralForeground3: tok.ink3, colorNeutralBackground2: tok.canvas,
  colorNeutralStroke2: tok.line, borderRadiusMedium: '5px',
};
