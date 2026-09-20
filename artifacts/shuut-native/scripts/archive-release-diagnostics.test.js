const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { archiveReleaseDiagnostics } = require('./archive-release-diagnostics');

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'shuut-diagnostics-'));
  const input = path.join(root, 'input');
  const output = path.join(root, 'output');
  fs.mkdirSync(input, { recursive: true });
  return { root, input, output };
}

test('archives matching dSYM and Hermes map with release metadata and hashes', (t) => {
  const { root, input, output } = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(
    path.join(input, 'SHUUT.app.dSYM.zip'),
    Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00]),
  );
  fs.writeFileSync(
    path.join(input, 'ios-hermes.js.map'),
    JSON.stringify({ version: 3, sources: ['app.tsx'], names: [], mappings: '' }),
  );

  const { destination, manifest } = archiveReleaseDiagnostics({
    inputDir: input,
    outputDir: output,
    version: '1.0.0',
    buildNumber: '12',
  });

  assert.equal(manifest.release, 'app.replit.shuut@1.0.0+12');
  assert.deepEqual(
    manifest.artifacts.map((artifact) => artifact.kind).sort(),
    ['hermes-source-map', 'ios-dsym'],
  );
  assert.equal(fs.existsSync(path.join(destination, 'manifest.json')), true);
  assert.equal(manifest.artifacts.every((artifact) => artifact.sha256.length === 64), true);
});

test('refuses to create an incomplete diagnostics archive', (t) => {
  const { root, input, output } = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(
    path.join(input, 'ios-hermes.js.map'),
    JSON.stringify({ version: 3, sources: ['app.tsx'], names: [], mappings: '' }),
  );

  assert.throws(
    () =>
      archiveReleaseDiagnostics({
        inputDir: input,
        outputDir: output,
        version: '1.0.0',
        buildNumber: '12',
      }),
    /No zipped iOS dSYM/,
  );
});

test('rejects malformed files that only have the expected names', (t) => {
  const { root, input, output } = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(input, 'SHUUT.app.dSYM.zip'), 'not a zip');
  fs.writeFileSync(path.join(input, 'ios-hermes.js.map'), '{}');

  assert.throws(
    () =>
      archiveReleaseDiagnostics({
        inputDir: input,
        outputDir: output,
        version: '1.0.0',
        buildNumber: '12',
      }),
    /not a recognizable ZIP/,
  );
});