#!/usr/bin/env node
// Cuts an alpha: bumps to the next -alpha version, commits, tags v<version>,
// and pushes. The Publish workflow picks up the tag and releases to npm under
// the `alpha` dist-tag. Usage: npm run release:alpha
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const run = (cmd) => execSync(cmd, { stdio: 'inherit' });
const out = (cmd) => execSync(cmd).toString().trim();

if (out('git status --porcelain')) {
    console.error('Working tree is dirty — commit or stash before releasing.');
    process.exit(1);
}

const { version } = JSON.parse(readFileSync('package.json', 'utf8'));

if (version.includes('-alpha')) {
    // 2.0.0-alpha.0 -> 2.0.0-alpha.1
    run('npm version prerelease --preid alpha');
} else {
    // First alpha of an unreleased version: 2.0.0 -> 2.0.0-alpha.0
    run(`npm version ${version}-alpha.0`);
}

run('git push --follow-tags');
console.log('Tag pushed — the Publish workflow will release it under the "alpha" dist-tag.');
