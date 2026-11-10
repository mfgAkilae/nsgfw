// PROTOTYPE, throwaway. Inlines engine.js, examples.js and page.js into worked-examples.html (one file, opens by double-click).
import { readFileSync, writeFileSync } from 'node:fs';
const here = f => new URL('./' + f, import.meta.url);
const html = readFileSync(here('template.html'), 'utf8').replace(/\/\*@inline ([\w.]+)\*\//g, (_, f) => readFileSync(here(f), 'utf8').replace(/<\/script/gi, '<\\/script'));
writeFileSync(here('worked-examples.html'), html);
console.log('wrote worked-examples.html', html.length, 'bytes');
