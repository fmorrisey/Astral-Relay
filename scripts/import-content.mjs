import 'dotenv/config';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import DB from '../src/db/index.js';
import config from '../src/config.js';
import { Post } from '../src/models/Post.js';
import { ImportService } from '../src/services/importer.js';

// Reads existing Astro content in the mounted workspace into the CMS.
//
//   npm run import -- --dry-run              show what would happen
//   npm run import                           import everything
//   npm run import -- --collection writing   limit to one collection
//
// A script rather than a UI action: it is a one-off, it needs no auth, and a
// dry run is easier to trust than a button.

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');

const argv = process.argv.slice(2);
const dryRun = argv.includes('--dry-run');
const collections = argv
  .map((a, i) => (a === '--collection' ? argv[i + 1] : null))
  .filter(Boolean);

const configured = config.dbPath;
const dbPath = configured.startsWith('/') ? configured : join(projectRoot, configured);

const db = new DB(dbPath);

try {
  // Content is attributed to the first account, matching how the setup wizard
  // creates the owner. There is no per-file author in Astro frontmatter.
  const user = db.prepare('SELECT id, username FROM users ORDER BY id LIMIT 1').get();
  if (!user) {
    console.error('No user exists yet. Complete the setup wizard before importing.');
    process.exit(1);
  }

  const importer = new ImportService({
    workspacePath: config.workspacePath,
    postModel: new Post(db),
    db
  });

  console.log(`Workspace: ${importer.contentRoot()}`);
  console.log(`Author:    ${user.username}`);
  if (dryRun) console.log('Mode:      DRY RUN - nothing will be written\n');
  else console.log('');

  const results = importer.importAll({ userId: user.id, dryRun, collections });

  if (results.length === 0) {
    console.log('No .md files found.');
  }

  for (const r of results) {
    const label = r.slug ? `${r.collection}/${r.slug}` : r.collection;
    if (r.action === 'skipped') {
      console.log(`  SKIP    ${label.padEnd(38)} ${r.reason}`);
    } else {
      const verb = r.action === 'created' ? 'CREATE' : 'UPDATE';
      console.log(`  ${verb}  ${label.padEnd(38)} ${r.title}`);
    }
  }

  const created = results.filter(r => r.action === 'created').length;
  const updated = results.filter(r => r.action === 'updated').length;
  const skipped = results.filter(r => r.action === 'skipped').length;

  console.log(`\n${created} created, ${updated} updated, ${skipped} skipped.`);
  if (skipped > 0) {
    console.log('Skipped entries were reported, not silently dropped - fix the cause and re-run.');
  }
  if (dryRun) {
    console.log('Dry run: no changes were made. Re-run without --dry-run to apply.');
  }
} catch (err) {
  console.error(`Import failed: ${err.message}`);
  process.exitCode = 1;
} finally {
  db.close();
}
