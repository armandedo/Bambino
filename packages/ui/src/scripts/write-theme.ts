import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { generateThemeCss } from '../theme-css';

const target = fileURLToPath(new URL('../theme.css', import.meta.url));
writeFileSync(target, generateThemeCss());
console.log(`wrote ${target}`);
