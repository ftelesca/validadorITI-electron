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
      .filter(file => fs.statSync(file.path).isFile())
      .sort((a, b) => b.time - a.time);
    
    console.log(`Total de arquivos encontrados: ${files.length}`);
    
    const recentFiles = files.slice(0, 10);
    
    console.log('10 arquivos mais recentes:');
    recentFiles.forEach((file, index) => {
      const ext = path.extname(file.name).toLowerCase();
      console.log(`  ${index + 1}. ${file.name} [${ext}]`);
    });
    
    if (recentFiles.length < 2) {
      throw new Error('Não foram encontrados 2 arquivos na pasta Downloads');
    }
    
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
    
    const p7sEntry = zipEntries.find(entry => 
      entry.entryName.toLowerCase().endsWith('.p7s')
    );
    
    if (!p7sEntry) {
      throw new Error('Nenhum arquivo .p7s encontrado dentro do ZIP');
    }
    
    console.log(`✓ Arquivo P7S encontrado: ${p7sEntry.entryName}`);
    
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
    
    let launchOptions = {
      headless: false,
      args: [
        '--start-maximized',
        '--disable-blink-features=AutomationControlled'
      ],
      defaultViewport: null
    };
    
    try {
      const configPath = path.join(__dirname, 'chrome-config.json');
      if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        if (config.chromeFound && config.chromePath) {
          launchOptions.executablePath = config.chromePath;
          console.log(`Usando Chrome do sistema: ${config.chromePath}`);
        }
      }
    } catch (configError) {
      console.log('Não foi possível ler configuração do Chrome, usando padrão...');
    }
    
    try {
      browser = await puppeteer.launch(launchOptions);
    } catch (launchError) {
      if (launchError.message.includes('Could not find Chrome')) {
        throw new Error(`Chrome não encontrado no sistema. Por favor, instale o Google Chrome em: https://www.google.com/chrome/\n\nErro original: ${launchError.message}`);
      } else {
        throw launchError;
      }
    }

    // ========================================
    // MONITORA O FECHAMENTO DO NAVEGADOR
    // ========================================
    browser.on('disconnected', () => {
      console.log('========================================');
      console.log('⚠️  Navegador foi fechado pelo usuário!');
      console.log('Encerrando executável...');
      console.log('========================================');
      
      // Encerra o processo imediatamente
      process.exit(0);
    });

    const pages = await browser.pages();
    const page = pages[0];

    console.log('Navegando para o site...');
    await page.goto('https://validar.iti.gov.br/', {
      waitUntil: 'networkidle2'
    });

    // Verifica se existe o botão de cookies e clica
    console.log('Verificando botão de cookies...');
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    try {
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
    
    await new Promise(resolve => setTimeout(resolve, 1000));

    console.log('Clicando em Assinatura Destacada...');
    await page.click('#detached');

    console.log('Aguardando popup...');
    await new Promise(resolve => setTimeout(resolve, 1000));
    
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
    
    await new Promise(resolve => setTimeout(resolve, 1000));

    console.log('Aceitando termos de uso...');
    await page.click('#acceptTerms');

    console.log('Clicando em Validar...');
    await page.click('#validateSignature');

    console.log('Aguardando resultado...');
    await page.waitForNavigation({ 
      waitUntil: 'networkidle2',
      timeout: 60000
    }).catch(() => {
      console.log('Aguardando elementos de resultado na mesma página...');
    });

    console.log('Aguardando página carregar completamente...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    console.log('========================================');
    console.log('✓ Processo concluído!');
    console.log('Você pode visualizar o resultado no navegador.');
    console.log('');
    console.log('💡 O executável será encerrado automaticamente quando você');
    console.log('   fechar o navegador.');
    console.log('========================================');

    // REMOVE TODO O CÓDIGO DO TIMER/COUNTDOWN
    // Agora só aguarda o usuário fechar o navegador
    // O evento 'disconnected' vai capturar isso

  } catch (error) {
    console.error('========================================');
    console.error('ERRO durante a automação:', error.message);
    console.error('========================================');
    console.error('Stack completo:', error);
    console.error('Encerrando em 30 segundos...');
    console.error('========================================');
    
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
    }, 30000);
  }
}

module.exports = { validarDocumento };
