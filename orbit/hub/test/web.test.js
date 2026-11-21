import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const web = path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), 'web');

// A syntax error in any of these leaves the desktop app as a blank page, and no other test loads them.
test('every desktop script parses', () => {
  const scripts = [path.join(web, 'sw.js'), ...fs.readdirSync(path.join(web, 'js')).filter((f) => f.endsWith('.js')).map((f) => path.join(web, 'js', f))];
  for (const file of scripts) {
    const run = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    assert.equal(run.status, 0, `${path.basename(file)}: ${run.stderr.split('\n').find((l) => /Error/.test(l)) ?? run.stderr}`);
  }
});
