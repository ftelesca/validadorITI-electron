const { app } = require('electron');
const { validarDocumento } = require('./validador.js');

// Quando o Electron estiver pronto, executa o validador
app.whenReady().then(async () => {
  console.log('Iniciando validação...');
  
  try {
    await validarDocumento();
    console.log('Validação concluída!');
    
    // Não fecha o app para manter o navegador aberto
    // O usuário fecha manualmente quando terminar
  } catch (error) {
    console.error('Erro:', error);
    
    // Em caso de erro, aguarda 10 segundos antes de fechar
    setTimeout(() => {
      app.quit();
    }, 10000);
  }
});

// Impede que o app feche quando todas as janelas forem fechadas
app.on('window-all-closed', () => {
  // Não faz nada - deixa o processo rodando
});

// Para Windows/Linux - quit quando todas as janelas fecharem
app.on('will-quit', () => {
  console.log('Aplicação encerrada');
});