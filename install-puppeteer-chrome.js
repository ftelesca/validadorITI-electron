const fs = require('fs');
const path = require('path');
const os = require('os');

console.log('Checking for system Chrome installation...');

function findSystemChrome() {
  const possiblePaths = [];
  
  if (os.platform() === 'win32') {
    // Windows Chrome paths
    possiblePaths.push(
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      path.join(os.homedir(), 'AppData\\Local\\Google\\Chrome\\Application\\chrome.exe')
    );
  } else if (os.platform() === 'darwin') {
    // macOS Chrome paths
    possiblePaths.push(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    );
  } else {
    // Linux Chrome paths
    possiblePaths.push(
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium-browser',
      '/snap/bin/chromium'
    );
  }
  
  for (const chromePath of possiblePaths) {
    if (fs.existsSync(chromePath)) {
      console.log(`✓ Found Chrome at: ${chromePath}`);
      return chromePath;
    }
  }
  
  return null;
}

const chromePath = findSystemChrome();

if (chromePath) {
  console.log('✓ System Chrome found and ready to use!');
  
  // Create a config file that the app can read
  const config = {
    chromePath: chromePath,
    chromeFound: true
  };
  
  fs.writeFileSync(path.join(__dirname, 'chrome-config.json'), JSON.stringify(config, null, 2));
  console.log('Chrome configuration saved.');
} else {
  console.log('⚠ Chrome not found on system. The application may not work properly.');
  console.log('Please install Google Chrome from: https://www.google.com/chrome/');
  
  const config = {
    chromePath: null,
    chromeFound: false
  };
  
  fs.writeFileSync(path.join(__dirname, 'chrome-config.json'), JSON.stringify(config, null, 2));
}