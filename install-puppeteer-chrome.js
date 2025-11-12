const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

console.log('Checking Chrome for Testing installation...');

function checkChromeInstallation() {
  try {
    // Check if Chrome for Testing is already installed
    const cacheDir = path.join(os.homedir(), '.cache', 'puppeteer');
    const chromeDirs = fs.existsSync(cacheDir) ? 
      fs.readdirSync(cacheDir).filter(dir => dir.startsWith('chrome')) : [];
    
    if (chromeDirs.length > 0) {
      console.log(`✓ Chrome for Testing already installed: ${chromeDirs.join(', ')}`);
      return true;
    }
    
    // Alternative check for @puppeteer/browsers cache
    const browsersCache = path.join(os.homedir(), '.cache', 'puppeteer', 'chrome');
    if (fs.existsSync(browsersCache)) {
      console.log('✓ Chrome for Testing found in browsers cache');
      return true;
    }
    
    return false;
  } catch (error) {
    console.log('Could not check existing installation, proceeding with install...');
    return false;
  }
}

if (checkChromeInstallation()) {
  console.log('Chrome for Testing is already available, skipping installation.');
  process.exit(0);
}

console.log('Installing Chrome for Testing...');

try {
  // Install Chrome for Testing (not standard Chrome)
  execSync('npx @puppeteer/browsers install chrome@stable', {
    stdio: 'inherit',
    cwd: __dirname
  });
  
  console.log('✓ Chrome for Testing installed successfully!');
} catch (error) {
  console.error('Error installing Chrome for Testing:', error.message);
  console.log('Falling back to puppeteer browsers install...');
  
  try {
    execSync('npx puppeteer browsers install chrome', {
      stdio: 'inherit',
      cwd: __dirname
    });
    console.log('✓ Puppeteer Chrome installed successfully!');
  } catch (fallbackError) {
    console.error('Fallback also failed:', fallbackError.message);
    process.exit(1);
  }
}