import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve('public/santa');

// String-hiding and minification obfuscator
function obfuscateCode(source) {
  const stringTable = [];
  const stringMap = new Map();

  let processed = source.replace(/(["'])(?:(?=(\\?))\2.)*?\1/g, (match) => {
    const raw = match.slice(1, -1);
    if (raw.length < 2) return match;
    let idx;
    if (stringMap.has(raw)) {
      idx = stringMap.get(raw);
    } else {
      idx = stringTable.length;
      stringTable.push(raw);
      stringMap.set(raw, idx);
    }
    return `_0xstr(${idx})`;
  });

  const encodedTable = Buffer.from(JSON.stringify(stringTable)).toString('base64');

  processed = processed.replace(/\/\/[^\n\r]*/g, '');
  processed = processed.replace(/\/\*[\s\S]*?\*\//g, '');
  processed = processed.replace(/\s+/g, ' ').trim();

  return `(function(){'use strict';var _0xtbl=JSON.parse(atob("${encodedTable}"));function _0xstr(i){return _0xtbl[i];};${processed}})();`;
}

// Read modules
const shieldJs = fs.readFileSync(path.join(ROOT, 'js/shield.js'), 'utf8');
const audioJs = fs.readFileSync(path.join(ROOT, 'js/santa-audio.js'), 'utf8');
const voiceJs = fs.readFileSync(path.join(ROOT, 'js/santa-voice.js'), 'utf8');
const landingJs = fs.readFileSync(path.join(ROOT, 'js/landing-controller.js'), 'utf8');
const callJs = fs.readFileSync(path.join(ROOT, 'js/call-controller.js'), 'utf8');

// 1. Core bundle
const coreBundle = [shieldJs, audioJs, voiceJs].join('\n;\n');
fs.writeFileSync(path.join(ROOT, 'js/santa-core.min.js'), obfuscateCode(coreBundle), 'utf8');

// 2. Landing bundle
const landingBundle = [shieldJs, audioJs, voiceJs, landingJs].join('\n;\n');
fs.writeFileSync(path.join(ROOT, 'js/landing.min.js'), obfuscateCode(landingBundle), 'utf8');

// 3. Call bundle
const callBundle = [shieldJs, audioJs, voiceJs, callJs].join('\n;\n');
fs.writeFileSync(path.join(ROOT, 'js/call.min.js'), obfuscateCode(callBundle), 'utf8');

console.log('✅ All Santa bundles (core, landing, call) obfuscated & built successfully.');
