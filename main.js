const { app } = require('electron');
const { validarDocumento } = require('./validador');

// Disable GUI
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('--disable-gpu');
app.commandLine.appendSwitch('--no-sandbox');

// Single instance only
if (!app.requestSingleInstanceLock()) {
  app.quit();
  return;
}

// Register protocol
if (!app.isDefaultProtocolClient('validardoc')) {
  app.setAsDefaultProtocolClient('validardoc');
}

// Execute task when app launches
async function executeTask() {
  console.log('========================================');
  console.log('Iniciando validação de documento...');
  console.log('========================================');
  
  try {
    await validarDocumento();
    // Note: validarDocumento já tem seu próprio timer de 5 minutos
    // e chama process.exit(0) quando termina
  } catch (error) {
    console.error('Erro fatal:', error);
    // validarDocumento já tem tratamento de erro com timer de 30s
    // mas garantimos que o app fecha caso algo dê muito errado
    setTimeout(() => {
      process.exit(1);
    }, 35000);
  }
}

// Launch on ready
app.whenReady().then(() => {
  executeTask();
});

// macOS: Handle protocol
app.on('open-url', (event, url) => {
  event.preventDefault();
  executeTask();
});

// Windows: Handle second instance
app.on('second-instance', () => {
  console.log('App já está rodando, ignorando segunda instância...');
});

// Prevent default window-all-closed behavior (we're headless)
app.on('window-all-closed', () => {
  // Don't quit - let the script finish
});