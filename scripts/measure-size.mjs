import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
async function bytes(p) { const s = await fs.stat(p); if (!s.isDirectory()) return s.size; return (await Promise.all((await fs.readdir(p)).map(n => bytes(path.join(p, n))))).reduce((a, b) => a + b, 0); }
const groups = {};
for (const name of ['app', 'lib', 'runtime', 'tools', 'scripts']) groups[name] = await bytes(path.join(root, name));
groups.other = (await Promise.all(['server.mjs','package.json','Start-Fcut.cmd','Start-Fcut.ps1','README.md','API.md','LICENSE','THIRD_PARTY_NOTICES.md','CHALLENGE.md','CONTRIBUTING.md'].map(n => bytes(path.join(root, n))))).reduce((a, b) => a + b, 0);
const totalBytes = Object.values(groups).reduce((a, b) => a + b, 0);
const report = { measuredAt: new Date().toISOString(), budgetBytes: 100000000, totalBytes, MB: +(totalBytes / 1e6).toFixed(2), MiB: +(totalBytes / 1048576).toFixed(2), groups, originalMediaEngineBytes: 210644992, originalNodeBytes: 92825416, notes: ['Includes Node runtime, FFmpeg and FFprobe, application code and licenses.', 'Does not bundle a browser or system fonts; uses those installed on Windows.', 'User media, exports, development tools, test artifacts and this small report are excluded.', 'UPX lossless executable packing preserves existing codecs and filters; disk savings do not imply lower RAM use.'] };
await fs.writeFile(path.join(root, 'SIZE-REPORT.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
