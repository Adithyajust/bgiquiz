import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';
const files=[];function scan(dir){for(const name of readdirSync(dir)){const path=join(dir,name);if(statSync(path).isDirectory())scan(path);else if(path.endsWith('.js'))files.push(path);}}scan('dist/server');
let hosted=false;for(const path of files){const code=readFileSync(path,'utf8');assert.ok(!code.includes('node:sqlite')&&!code.includes('node-organizer'),`Native database adapter found in Worker build: ${path}`);hosted ||= code.includes('cloudflare:workers');}
assert.ok(hosted,'Cloudflare runtime missing from hosted build');
const manifest=JSON.parse(readFileSync('.openai/hosting.json','utf8'));assert.equal(manifest.d1,'DB');assert.ok(manifest.project_id);console.log('Hosted runtime and SQL binding verified.');
