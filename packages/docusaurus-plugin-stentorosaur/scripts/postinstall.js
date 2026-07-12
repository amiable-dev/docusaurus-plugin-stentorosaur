#!/usr/bin/env node

/**
 * Postinstall script for @amiable-dev/docusaurus-plugin-stentorosaur
 * Automatically integrates status monitoring commands into the consuming project's Makefile
 */

const fs = require('fs');
const path = require('path');

// Find the consuming project root (go up from node_modules)
function findProjectRoot() {
  let current = process.cwd();

  // If we're in node_modules, go up to find project root
  while (current.includes('node_modules')) {
    current = path.dirname(current);
  }

  // Verify this looks like a project root
  if (fs.existsSync(path.join(current, 'package.json'))) {
    return current;
  }

  return null;
}

// Status monitoring section to add to help
const STATUS_HELP_SECTION = `
	@echo ""
	@echo "$(GREEN)Status Monitoring:$(NC) (run 'make status-help' for full list)"
	@echo "  $(YELLOW)status-add-system    $(NC) Add endpoint to monitor (name=x url=y)"
	@echo "  $(YELLOW)status-list          $(NC) List all monitored systems"
	@echo "  $(YELLOW)status-test          $(NC) Test monitoring configuration"
	@echo "  $(YELLOW)status-help          $(NC) Show all status commands"`;

// Include statement
const INCLUDE_STATEMENT = '-include node_modules/@amiable-dev/docusaurus-plugin-stentorosaur/templates/Makefile.status';

function patchMakefile(projectRoot) {
  const makefilePath = path.join(projectRoot, 'Makefile');

  if (!fs.existsSync(makefilePath)) {
    console.log('[stentorosaur] No Makefile found - skipping integration');
    console.log('[stentorosaur] Run "make status-help" after creating a Makefile with the include statement');
    return false;
  }

  let content = fs.readFileSync(makefilePath, 'utf8');
  let modified = false;

  // Check if include statement already exists
  if (!content.includes('docusaurus-plugin-stentorosaur/templates/Makefile.status')) {
    // Add include at the end
    content = content.trimEnd() + '\n\n# Status Monitoring (Stentorosaur)\n' + INCLUDE_STATEMENT + '\n';
    modified = true;
    console.log('[stentorosaur] Added Makefile.status include statement');
  }

  // Check if status help section exists in help target
  if (content.includes('help:') && !content.includes('Status Monitoring:')) {
    // Find the help target and add status section before the next target or end
    // Look for pattern: help target ends with empty @echo "" line
    const helpPattern = /(help:.*?@echo\s+["']["']\s*\n)(\n*#|\n*[a-zA-Z_-]+:|$)/s;
    const match = content.match(helpPattern);

    if (match) {
      // Insert status help section after the last @echo "" in help target
      const insertPoint = match.index + match[1].length;
      content = content.slice(0, insertPoint) + STATUS_HELP_SECTION + '\n' + content.slice(insertPoint);
      modified = true;
      console.log('[stentorosaur] Added Status Monitoring section to make help');
    }
  }

  if (modified) {
    fs.writeFileSync(makefilePath, content);
    console.log('[stentorosaur] Makefile updated successfully');
    return true;
  } else {
    console.log('[stentorosaur] Makefile already configured');
    return false;
  }
}

function main() {
  // Skip if running in CI or during npm publish
  if (process.env.CI || process.env.npm_config_ignore_scripts) {
    return;
  }

  const projectRoot = findProjectRoot();

  if (!projectRoot) {
    // Likely running during development of the plugin itself
    return;
  }

  // Don't run if this is the plugin's own directory
  const pkgPath = path.join(projectRoot, 'package.json');
  if (fs.existsSync(pkgPath)) {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    if (pkg.name === '@amiable-dev/docusaurus-plugin-stentorosaur') {
      return;
    }
  }

  try {
    patchMakefile(projectRoot);
  } catch (err) {
    console.error('[stentorosaur] Warning: Could not patch Makefile:', err.message);
  }
}

main();
