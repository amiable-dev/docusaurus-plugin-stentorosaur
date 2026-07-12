const fs = require('fs-extra');
const path = require('path');
const {glob} = require('glob');

async function copyUntypedFiles() {
  const srcTheme = path.join(__dirname, 'src', 'theme');
  const libTheme = path.join(__dirname, 'lib', 'theme');

  // Find all CSS files
  const cssFiles = await glob('**/*.css', {cwd: srcTheme});
  
  // Copy each CSS file
  for (const file of cssFiles) {
    const srcFile = path.join(srcTheme, file);
    const destFile = path.join(libTheme, file);
    await fs.ensureDir(path.dirname(destFile));
    await fs.copy(srcFile, destFile);
    console.log(`Copied ${file}`);
  }

  console.log(`Copied ${cssFiles.length} CSS files to lib/theme`);
}

copyUntypedFiles().catch(console.error);
