#!/usr/bin/env node
/* Unified stentorosaur CLI entry (ADR-005 §11, ticket #74). */
const {main} = require('../lib/cli.js');
main().then(code => {
  process.exitCode = code;
});
