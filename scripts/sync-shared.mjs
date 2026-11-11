// Copies the pure domain + sample data into supabase/functions/_shared so Edge Functions
// run exactly the same code as the browser. Tests are excluded. Run after editing src/domain or src/data.
import { cpSync, rmSync, mkdirSync } from 'node:fs';
const dest = 'supabase/functions/_shared/core';
rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });
const filter = (src) => !src.includes('__tests__') && !src.endsWith('.test.ts');
cpSync('src/domain', `${dest}/domain`, { recursive: true, filter });
cpSync('src/data', `${dest}/data`, { recursive: true, filter });
console.log('Synced src/domain and src/data -> ' + dest);
