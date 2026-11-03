#!/usr/bin/env node
// Local test fixture: the prompt is test-owned JavaScript, never a model request.
const { createRequire } = await import('node:module');
const require = createRequire(import.meta.url);
eval(process.argv[process.argv.indexOf('-p') + 1]);
