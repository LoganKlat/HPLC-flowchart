import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// Load .env.local if present
const envPath = path.resolve('.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const idx = trimmed.indexOf('=');
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim();
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_OWNER = process.env.GITHUB_OWNER || 'LoganKlat';
const GITHUB_REPO = process.env.GITHUB_REPO || 'HPLC-flowchart';
const DEFAULT_BRANCH = process.env.GITHUB_BRANCH || 'main';

if (!GITHUB_TOKEN) {
  console.error('Error: GITHUB_TOKEN not set in environment or .env.local');
  process.exit(1);
}

const API_BASE = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}`;

async function ghRequest(endpoint, options = {}) {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'Antigravity-Agent',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(options.headers || {}),
    },
  });

  const contentType = res.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await res.json() : await res.text();

  if (!res.ok) {
    const msg = typeof data === 'object' && data.message ? data.message : String(data);
    throw new Error(`GitHub API error ${res.status} on ${endpoint}: ${msg}`);
  }
  return data;
}

function calculateGitBlobSha(buffer) {
  const header = Buffer.from(`blob ${buffer.length}\0`);
  return crypto.createHash('sha1').update(header).update(buffer).digest('hex');
}

// Patterns to ignore when syncing to GitHub
const IGNORED_NAMES = new Set([
  'node_modules',
  '.git',
  '.next',
  '.vercel',
  'out',
  'build',
  'dist',
  'coverage',
]);

function shouldIgnore(relPath) {
  const normalized = relPath.replace(/\\/g, '/');
  const parts = normalized.split('/');
  for (const p of parts) {
    if (IGNORED_NAMES.has(p)) return true;
    if (p.startsWith('.env')) return true;
  }
  if (normalized.endsWith('.tsbuildinfo')) return true;
  if (normalized.endsWith('.DS_Store')) return true;
  if (normalized === 'next-env.d.ts' || normalized.endsWith('/next-env.d.ts')) return true;
  return false;
}

function listLocalFiles(dir = '.', baseDir = '.') {
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relPath = path.relative(baseDir, fullPath).replace(/\\/g, '/');

    if (shouldIgnore(relPath)) continue;

    if (entry.isDirectory()) {
      results.push(...listLocalFiles(fullPath, baseDir));
    } else if (entry.isFile()) {
      results.push(relPath);
    }
  }
  return results;
}

async function getStatus() {
  const branchData = await ghRequest(`/git/ref/heads/${DEFAULT_BRANCH}`);
  const latestCommitSha = branchData.object.sha;
  const commitData = await ghRequest(`/git/commits/${latestCommitSha}`);
  const remoteTreeData = await ghRequest(`/git/trees/${commitData.tree.sha}?recursive=1`);

  const remoteFilesMap = new Map();
  for (const item of remoteTreeData.tree) {
    if (item.type === 'blob') {
      remoteFilesMap.set(item.path, item);
    }
  }

  const localFiles = listLocalFiles();
  const localFileSet = new Set(localFiles);

  const added = [];
  const modified = [];
  const unchanged = [];
  const deleted = [];

  for (const relPath of localFiles) {
    const buf = fs.readFileSync(relPath);
    const localSha = calculateGitBlobSha(buf);
    const remote = remoteFilesMap.get(relPath);

    if (!remote) {
      added.push(relPath);
    } else if (remote.sha !== localSha) {
      modified.push(relPath);
    } else {
      unchanged.push(relPath);
    }
  }

  for (const [remotePath] of remoteFilesMap) {
    if (!localFileSet.has(remotePath)) {
      deleted.push(remotePath);
    }
  }

  return {
    latestCommitSha,
    baseTreeSha: commitData.tree.sha,
    added,
    modified,
    deleted,
    unchangedCount: unchanged.length,
  };
}

async function push(commitMessage) {
  if (!commitMessage) {
    throw new Error('Please provide a commit message: npm run gh:push -- "Your commit message"');
  }

  console.log(`Checking status against branch '${DEFAULT_BRANCH}'...`);
  const status = await getStatus();

  const totalChanges = status.added.length + status.modified.length + status.deleted.length;
  if (totalChanges === 0) {
    console.log('No local changes detected compared to remote branch.');
    return;
  }

  console.log(`Changes to commit:`);
  if (status.added.length) console.log(`  Added (${status.added.length}):`, status.added);
  if (status.modified.length) console.log(`  Modified (${status.modified.length}):`, status.modified);
  if (status.deleted.length) console.log(`  Deleted (${status.deleted.length}):`, status.deleted);

  // Upload blobs for added and modified files
  const treeEntries = [];
  const filesToUpload = [...status.added, ...status.modified];

  for (const file of filesToUpload) {
    const buf = fs.readFileSync(file);
    const contentB64 = buf.toString('base64');
    console.log(`Uploading blob: ${file}...`);
    const blobRes = await ghRequest('/git/blobs', {
      method: 'POST',
      body: JSON.stringify({
        content: contentB64,
        encoding: 'base64',
      }),
    });
    treeEntries.push({
      path: file,
      mode: '100644',
      type: 'blob',
      sha: blobRes.sha,
    });
  }

  for (const file of status.deleted) {
    treeEntries.push({
      path: file,
      mode: '100644',
      type: 'blob',
      sha: null,
    });
  }

  console.log('Creating new git tree...');
  const newTree = await ghRequest('/git/trees', {
    method: 'POST',
    body: JSON.stringify({
      base_tree: status.baseTreeSha,
      tree: treeEntries,
    }),
  });

  console.log('Creating commit...');
  const newCommit = await ghRequest('/git/commits', {
    method: 'POST',
    body: JSON.stringify({
      message: commitMessage,
      tree: newTree.sha,
      parents: [status.latestCommitSha],
      author: {
        name: 'Logan Klat',
        email: '115082291+LoganKlat@users.noreply.github.com',
        date: new Date().toISOString(),
      },
    }),
  });

  console.log(`Updating ref 'refs/heads/${DEFAULT_BRANCH}'...`);
  await ghRequest(`/git/refs/heads/${DEFAULT_BRANCH}`, {
    method: 'PATCH',
    body: JSON.stringify({
      sha: newCommit.sha,
      force: false,
    }),
  });

  console.log('\nSuccessfully pushed commit to GitHub!');
  console.log(`Commit SHA: ${newCommit.sha}`);
  console.log(`Commit URL: https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/commit/${newCommit.sha}`);
}

async function main() {
  const action = process.argv[2] || 'status';
  const msg = process.argv.slice(3).join(' ');

  try {
    if (action === 'status') {
      console.log(`Checking status against ${GITHUB_OWNER}/${GITHUB_REPO} [${DEFAULT_BRANCH}]...`);
      const status = await getStatus();
      console.log(`\nRemote commit: ${status.latestCommitSha}`);
      console.log(`Unchanged files: ${status.unchangedCount}`);
      console.log(`Added: ${status.added.length}`);
      if (status.added.length) console.log(status.added.map(f => `  + ${f}`).join('\n'));
      console.log(`Modified: ${status.modified.length}`);
      if (status.modified.length) console.log(status.modified.map(f => `  ~ ${f}`).join('\n'));
      console.log(`Deleted: ${status.deleted.length}`);
      if (status.deleted.length) console.log(status.deleted.map(f => `  - ${f}`).join('\n'));
    } else if (action === 'push') {
      await push(msg);
    } else {
      console.log('Usage: node scripts/github-sync.mjs [status | push <message>]');
    }
  } catch (err) {
    console.error('Operation failed:', err);
    process.exit(1);
  }
}

main();
