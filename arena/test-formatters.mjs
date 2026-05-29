import assert from 'node:assert/strict';
import { formatMemory } from './src/lib/formatters.js';

assert.equal(formatMemory(512), '512 B');
assert.equal(formatMemory(1024), '1 KB');
assert.equal(formatMemory(1024 * 1024), '1 MB');
console.log('formatMemory tests passed');
