const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function collectFiles(root, predicate, result = []) {
  if (!fs.existsSync(root)) return result;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      collectFiles(fullPath, predicate, result);
    } else if (predicate(fullPath)) {
      result.push(fullPath);
    }
  }
  return result;
}

function safeSegment(value, label) {
  const normalized = String(value || '').trim();
  if (!/^[A-Za-z0-9._-]+$/.test(normalized)) {
    throw new Error(`${label} must contain only letters, numbers, dots, dashes, or underscores.`);
  }
  return normalized;
}

function validateDsymZip(filePath) {
  const contents = fs.readFileSync(filePath);
  if (
    contents.length < 4 ||
    contents[0] !== 0x50 ||
    contents[1] !== 0x4b ||
    ![0x03, 0x05, 0x07].includes(contents[2])
  ) {
    throw new Error(`${path.basename(filePath)} is not a recognizable ZIP archive.`);
  }
}

function validateSourceMap(filePath) {
  let sourceMap;
  try {
    sourceMap = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    throw new Error(`${path.basename(filePath)} is not valid source-map JSON.`);
  }
  if (
    sourceMap?.version !== 3 ||
    !Array.isArray(sourceMap.sources) ||
    sourceMap.sources.length === 0 ||
    typeof sourceMap.mappings !== 'string'
  ) {
    throw new Error(`${path.basename(filePath)} is not a usable version 3 source map.`);
  }
}

function archiveReleaseDiagnostics({
  inputDir,
  outputDir,
  version,
  buildNumber,
  bundleIdentifier = 'app.replit.shuut',
}) {
  const releaseVersion = safeSegment(version, 'version');
  const releaseBuild = safeSegment(buildNumber, 'build number');
  const sourceRoot = path.resolve(inputDir);
  const destination = path.resolve(outputDir, `${releaseVersion}+${releaseBuild}`);

  const dsyms = collectFiles(sourceRoot, (file) => file.endsWith('.dSYM.zip'));
  const sourceMaps = collectFiles(
    sourceRoot,
    (file) => file.endsWith('.map') && /(?:ios|hermes)/i.test(file),
  );

  if (dsyms.length === 0) {
    throw new Error('No zipped iOS dSYM was found. Export and zip the build dSYMs first.');
  }
  if (sourceMaps.length === 0) {
    throw new Error('No iOS/Hermes source map was found. Export the exact build source map first.');
  }
  dsyms.forEach(validateDsymZip);
  sourceMaps.forEach(validateSourceMap);

  fs.rmSync(destination, { recursive: true, force: true });
  fs.mkdirSync(destination, { recursive: true });

  const artifacts = [...dsyms, ...sourceMaps].map((source, index) => {
    const fileName = `${String(index + 1).padStart(2, '0')}-${path.basename(source)}`;
    const target = path.join(destination, fileName);
    fs.copyFileSync(source, target);
    return {
      file: fileName,
      kind: source.endsWith('.dSYM.zip') ? 'ios-dsym' : 'hermes-source-map',
      sha256: sha256(target),
      bytes: fs.statSync(target).size,
    };
  });

  const manifest = {
    schemaVersion: 1,
    release: `${bundleIdentifier}@${releaseVersion}+${releaseBuild}`,
    bundleIdentifier,
    version: releaseVersion,
    buildNumber: releaseBuild,
    artifacts,
  };
  fs.writeFileSync(
    path.join(destination, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  return { destination, manifest };
}

function parseArguments(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith('--') || value === undefined) {
      throw new Error('Arguments must be provided as --name value pairs.');
    }
    values[key.slice(2)] = value;
  }
  return values;
}

if (require.main === module) {
  try {
    const args = parseArguments(process.argv.slice(2));
    const { destination, manifest } = archiveReleaseDiagnostics({
      inputDir: args.input,
      outputDir: args.output || 'release-diagnostics',
      version: args.version,
      buildNumber: args.build,
    });
    console.log(`Archived ${manifest.release} diagnostics at ${destination}`);
  } catch (error) {
    console.error(`Could not archive release diagnostics: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = {
  archiveReleaseDiagnostics,
  parseArguments,
  validateDsymZip,
  validateSourceMap,
};