const puppeteer = require('puppeteer');
const AdmZip = require('adm-zip');
const path = require('path');
const fs = require('fs');
const os = require('os');

async function validarDocumento() {
  let browser;
  let caminhoAssinatura = null;
  let caminhoArquivo;
  let caminhoZipAssinatura;
  
  try {
    // ========================================
    // PARTE 1: BUSCAR ARQUIVOS NO DOWNLOADS
    // ========================================
    console.log('========================================');
    console.log('PARTE 1: Buscando arquivos no Downloads');
    console.log('========================================');
    
    const downloadsPath = path.join(os.homedir(), 'Downloads');
    console.log(`Pasta Downloads: ${downloadsPath}`);
    
    // Listar todos os arquivos na pasta Downloads
    const files = fs.readdirSync(downloadsPath)
      .map(file => ({
        name: file,
        path: path.join(downloadsPath, file),
        time: fs.statSync(path.join(downloadsPath, file)).mtime.getTime()
      }))
      .filter(file => fs.statSync(file.path).isFile()) // Apenas arquivos, não pastas
      .sort((a, b) => b.time - a.time); // Ordenar por data (mais recente primeiro)
    
    console.log(`Total de arquivos encontrados: ${files.length}`);
    
    // Pegar os 2 arquivos mais recentes
    const recentFiles = files.slice(0, 10);
    
    console.log('10 arquivos mais recentes:');
    recentFiles.forEach((file, index) => {
      const ext = path.extname(file.name).toLowerCase();
      console.log(`  ${index + 1}. ${file.name} [${ext}]`);
    });
    
    if (recentFiles.length < 2) {
      throw new Error('Não foram encontrados 2 arquivos na pasta Downloads');
    }
    
    // Identificar qual é PDF e qual é ZIP nos 2 mais recentes
    const twoMostRecent = recentFiles.slice(0, 2);
    
    for (const file of twoMostRecent) {
      const ext = path.extname(file.name).toLowerCase();
      if (ext === '.pdf') {
        caminhoArquivo = file.path;
        console.log(`✓ PDF encontrado: ${file.name}`);
      } else if (ext === '.zip') {
        caminhoZipAssinatura = file.path;
        console.log(`✓ ZIP encontrado: ${file.name}`);
      }
    }
    
    // Verificar se encontrou ambos os arquivos
    if (!caminhoArquivo) {
      throw new Error('Nenhum arquivo PDF encontrado entre os 2 arquivos mais recentes');
    }
    
    if (!caminhoZipAssinatura) {
      throw new Error('Nenhum arquivo ZIP encontrado entre os 2 arquivos mais recentes');
    }
    
    // ========================================
    // PARTE 2: EXTRAIR P7S DO ZIP
    // ========================================
    console.log('========================================');
    console.log('PARTE 2: Extraindo P7S do ZIP');
    console.log('========================================');
    
    const zip = new AdmZip(caminhoZipAssinatura);
    const zipEntries = zip.getEntries();
    
    console.log(`Arquivos dentro do ZIP:`);
    zipEntries.forEach(entry => {
      console.log(`  - ${entry.entryName}`);
    });
    
    // Procura o arquivo .p7s dentro do ZIP
    const p7sEntry = zipEntries.find(entry => 
      entry.entryName.toLowerCase().endsWith('.p7s')
    );
    
    if (!p7sEntry) {
      throw new Error('Nenhum arquivo .p7s encontrado dentro do ZIP');
    }
    
    console.log(`✓ Arquivo P7S encontrado: ${p7sEntry.entryName}`);
    
    // Extrai no diretório temporário
    const nomeArquivoP7S = path.basename(p7sEntry.entryName);
    caminhoAssinatura = path.join(os.tmpdir(), nomeArquivoP7S);
    console.log(`Extraindo para: ${caminhoAssinatura}`);
    fs.writeFileSync(caminhoAssinatura, p7sEntry.getData());
    
    console.log(`✓ Arquivo P7S extraído com sucesso!`);
    
    // ========================================
    // PARTE 3: AUTOMAÇÃO COM PUPPETEER
    // ========================================
    console.log('========================================');
    console.log('PARTE 3: Iniciando automação');
    console.log('========================================');
    
    // Lança o navegador visível (não headless) - VOLTANDO AO CHROMIUM
    try {
      browser = await puppeteer.launch({
        headless: false, // Mostra o navegador
        args: [
          '--start-maximized',
          '--disable-blink-features=AutomationControlled' // Esconde que é bot
        ],
        defaultViewport: null // Usa o tamanho da janela
      });
    } catch (launchError) {
      if (launchError.message.includes('Could not find Chrome')) {
        console.log('Chrome não encontrado. Tentando instalar...');
        const { execSync } = require('child_process');
        
        try {
          execSync('npx puppeteer browsers install chrome', { stdio: 'inherit' });
          console.log('Chrome instalado! Tentando novamente...');
          
          browser = await puppeteer.launch({
            headless: false,
            args: [
              '--start-maximized',
              '--disable-blink-features=AutomationControlled'
            ],
            defaultViewport: null
          });
        } catch (installError) {
          throw new Error(`Não foi possível instalar ou executar o Chrome: ${installError.message}`);
        }
      } else {
        throw launchError;
      }
    }

    const pages = await browser.pages();
    const page = pages[0]; // Usa a primeira aba ao invés de criar nova

    console.log('Navegando para o site...');
    await page.goto('https://validar.iti.gov.br/', {
      waitUntil: 'networkidle2'
    });

        // Verifica se existe o botão de cookies e clica
    console.log('Verificando botão de cookies...');
    await new Promise(resolve => setTimeout(resolve, 1000)); // Aguarda 1 segundo
    
    try {
      // Tenta vários seletores diferentes
      const cookieButton = await page.$('button[onclick="cookiebutton()"]') 
        || await page.$('button.deny.grabt')
        || await page.$('button:has-text("Aceitar cookies")');
      
      if (cookieButton) {
        console.log('Botão de cookies encontrado! Clicando...');
        await cookieButton.click();
        await new Promise(resolve => setTimeout(resolve, 500));
        console.log('✓ Cookies aceitos!');
      } else {
        console.log('Botão de cookies não encontrado');
        // Tenta com evaluate como alternativa
        const clicked = await page.evaluate(() => {
          const buttons = Array.from(document.querySelectorAll('button'));
          const cookieBtn = buttons.find(btn => 
            btn.textContent.includes('Aceitar cookies') || 
            btn.onclick?.toString().includes('cookiebutton')
          );
          if (cookieBtn) {
            cookieBtn.click();
            return true;
          }
          return false;
        });
        if (clicked) {
          console.log('✓ Cookies aceitos via evaluate!');
        } else {
          console.log('Botão de cookies realmente não existe');
        }
      }
    } catch (error) {
      console.log('Erro ao clicar em cookies:', error.message);
    }

    console.log('Fazendo upload do arquivo principal...');
    console.log(`Caminho do PDF: ${caminhoArquivo}`);
    const inputFile = await page.$('#signature_files');
    if (!inputFile) {
      throw new Error('Elemento #signature_files não encontrado');
    }
    await inputFile.uploadFile(caminhoArquivo);
    console.log('✓ Upload do PDF concluído!');
    
    // Aguarda um pouco para o arquivo ser processado
    await new Promise(resolve => setTimeout(resolve, 1000));

    console.log('Clicando em Assinatura Destacada...');
    await page.click('#detached');

    // Aguarda o popup/modal aparecer e clica em confirmar
    console.log('Aguardando popup...');
    await new Promise(resolve => setTimeout(resolve, 1000)); // Espera 1 segundo
    
    // Clica no botão Confirmar do popup
    console.log('Clicando em Confirmar...');
    await page.click('#confirmButton');

    console.log('Fazendo upload do arquivo de assinatura destacada...');
    console.log(`Caminho do P7S: ${caminhoAssinatura}`);
    const inputFileDetached = await page.$('#signature_filesDetached');
    if (!inputFileDetached) {
      throw new Error('Elemento #signature_filesDetached não encontrado');
    }
    await inputFileDetached.uploadFile(caminhoAssinatura);
    console.log('✓ Upload do P7S concluído!');
    
    // Aguarda um pouco para o arquivo ser processado
    await new Promise(resolve => setTimeout(resolve, 1000));

    console.log('Aceitando termos de uso...');
    await page.click('#acceptTerms');

    console.log('Clicando em Validar...');
    await page.click('#validateSignature');

    // Aguarda o resultado aparecer (ajuste o seletor conforme necessário)
    console.log('Aguardando resultado...');
    await page.waitForNavigation({ 
      waitUntil: 'networkidle2',
      timeout: 60000 // 60 segundos
    }).catch(() => {
      console.log('Aguardando elementos de resultado na mesma página...');
    });

    // Aguarda mais tempo para garantir que a página carregou completamente
    console.log('Aguardando página carregar completamente...');
    await new Promise(resolve => setTimeout(resolve, 5000)); // 5 segundos

    console.log('========================================');
    console.log('Processo concluído! Resultados exibidos no navegador.');
    console.log('O navegador e executável serão fechados automaticamente em 5 minutos.');
    console.log('========================================');

    // Contador regressivo de 5 minutos
    let countdown = 300; // 5 minutos em segundos
    
    console.log(`⏱️  Fechamento automático em ${Math.floor(countdown/60)}:${(countdown%60).toString().padStart(2, '0')}`);
    
    const timer = setInterval(() => {
      countdown -= 10; // Atualiza a cada 10 segundos
      
      if (countdown > 0) {
        console.log(`⏱️  Fechamento automático em ${Math.floor(countdown/60)}:${(countdown%60).toString().padStart(2, '0')}`);
      } else {
        clearInterval(timer);
        
        console.log('========================================');
        console.log('⏰ Tempo esgotado! Fechando navegador e executável...');
        console.log('========================================');
        
        // Fecha o navegador e encerra o processo
        setTimeout(async () => {
          try {
            await browser.close();
            console.log('✓ Navegador fechado!');
          } catch (e) {
            console.log('Aviso ao fechar navegador:', e.message);
          }
          
          console.log('✓ Encerrando processo Electron...');
          process.exit(0);
        }, 2000); // 2 segundos para fechar tudo
      }
    }, 10000); // Atualiza a cada 10 segundos

  } catch (error) {
    console.error('========================================');
    console.error('ERRO durante a automação:', error.message);
    console.error('========================================');
    console.error('Stack completo:', error);
    console.error('Navegador e executável serão fechados em 30 segundos.');
    console.error('========================================');
    
    // Em caso de erro, fecha tudo em 30 segundos
    setTimeout(async () => {
      console.log('⚠️  Fechando por erro...');
      if (browser) {
        try {
          await browser.close();
          console.log('✓ Navegador fechado!');
        } catch (e) {
          console.log('Erro ao fechar navegador:', e.message);
        }
      }
      process.exit(1);
    }, 30000); // 30 segundos
  }
}

// Exporta a função para ser usada em outro arquivo
module.exports = { validarDocumento };