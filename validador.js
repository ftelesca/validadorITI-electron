const puppeteer = require('puppeteer');
const AdmZip = require('adm-zip');
const https = require('https');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { exec } = require('child_process');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

const callbackUrl = 'https://sbis.iscinternal.com/trakcare/csp/d4sign.callback.csp';

function parseRowIdFromArgs(argv = process.argv) {
  const protoArg = argv.find((a) => typeof a === 'string' && a.startsWith('validardoc://'));
  if (protoArg) {
    try {
      const url = new URL(protoArg);
      const id = url.searchParams.get('rowID');
      if (id) return id;
    } catch (e) {
      console.warn('Falha ao parsear URL do protocolo:', e);
    }
  }

  const kvArg = argv.find((a) => typeof a === 'string' && a.includes('rowID='));
  if (kvArg) {
    const m = kvArg.match(/rowID=([^&\s]+)/i);
    if (m && m[1]) return m[1];
  }
  return '';
}

function parseHeadlessFromArgs(argv = process.argv) {
  const protoArg = argv.find((a) => typeof a === 'string' && a.startsWith('validardoc://'));
  if (protoArg) {
    try {
      const url = new URL(protoArg);
      const flag = url.searchParams.get('headless');
      if (typeof flag === 'string') return flag.toLowerCase() === 'true';
    } catch (e) {
      console.warn('Falha ao parsear headless do protocolo:', e);
    }
  }
  const kvArg = argv.find((a) => typeof a === 'string' && a.includes('headless='));
  if (kvArg) {
    const m = kvArg.match(/headless=([^&\s]+)/i);
    if (m && m[1]) return m[1].toLowerCase() === 'true';
  }
  return false;
}

function sendCallback(rowID, resultValid) {
  return new Promise((resolve) => {
    const qs = `rowID=${encodeURIComponent(rowID || '')}&resultValid=${encodeURIComponent(resultValid || '')}`;
    const url = new URL(`${callbackUrl}?${qs}`);
    const options = {
      method: 'GET',
      hostname: url.hostname,
      path: url.pathname + url.search,
      port: 443,
    };

    const req = https.request(options, (res) => {
      res.on('data', () => {});
      res.on('end', () => resolve());
    });

    req.on('error', (err) => {
      console.error('Falha ao enviar callback:', err.message);
      resolve();
    });

    req.end();
  });
}

async function addFooterToPdf(pdfPath, line1, line2 = '') {
  try {
    const pdfBytes = fs.readFileSync(pdfPath);
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const pages = pdfDoc.getPages();

    pages.forEach((page) => {
      const { width } = page.getSize();
      const size = 10;
      const y1 = 18;
      const y2 = 6;
      const x1 = (width - font.widthOfTextAtSize(line1, size)) / 2;
      const x2 = (width - font.widthOfTextAtSize(line2, size)) / 2;

      page.drawText(line1, {
        x: Math.max(16, x1),
        y: y1,
        size,
        font,
        color: rgb(0, 0, 0),
      });

      if (line2) {
        page.drawText(line2, {
          x: Math.max(16, x2),
          y: y2,
          size,
          font,
          color: rgb(0, 0, 0),
        });
      }
    });

    const outPath = path.join(
      os.tmpdir(),
      `${path.basename(pdfPath, '.pdf')}_assinatura.pdf`
    );
    const updatedBytes = await pdfDoc.save();
    fs.writeFileSync(outPath, updatedBytes);
    return outPath;
  } catch (e) {
    console.error('Falha ao adicionar rodapé:', e);
    return '';
  }
}

function openPdfViewer(pdfPath) {
  if (!pdfPath) return;
  exec(`start "" "${pdfPath}"`);
}

// Função para encontrar Chrome instalado no sistema
function findChrome() {
  const possiblePaths = [
    // Chrome padrão
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(process.env.LOCALAPPDATA, 'Google\\Chrome\\Application\\chrome.exe'),
    path.join(process.env.PROGRAMFILES, 'Google\\Chrome\\Application\\chrome.exe'),
    path.join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Google\\Chrome\\Application\\chrome.exe'),
    
    // Edge (fallback - também funciona com Puppeteer)
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    path.join(process.env.PROGRAMFILES, 'Microsoft\\Edge\\Application\\msedge.exe'),
    
    // Brave (fallback)
    path.join(process.env.LOCALAPPDATA, 'BraveSoftware\\Brave-Browser\\Application\\brave.exe'),
    'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe'
  ];
  
  for (const chromePath of possiblePaths) {
    if (fs.existsSync(chromePath)) {
      console.log(`✓ Navegador encontrado: ${chromePath}`);
      return chromePath;
    }
  }
  
  return null;
}

async function validarDocumento() {
  let browser;
  let caminhoAssinatura = null;
  let caminhoArquivo;
  let caminhoZipAssinatura;
  let resultValid = 'Erro';
  let nomeSignatario = 'Erro';
  let dataAssinatura = 'Erro';
  const rowID = parseRowIdFromArgs();
  const runHeadless = parseHeadlessFromArgs();

  console.log('rowID recebido:', rowID || '(vazio)');
  console.log('headless:', runHeadless);
  
  try {
    // ========================================
    // PARTE 1: BUSCAR ARQUIVOS NO DOWNLOADS
    // ========================================
    console.log('========================================');
    console.log('PARTE 1: Buscando arquivos no Downloads');
    console.log('========================================');
    
    const downloadsPath = path.join(os.homedir(), 'Downloads');
    console.log(`Pasta Downloads: ${downloadsPath}`);
    
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
    
    // Procura Chrome instalado no sistema
    const chromePath = findChrome();
    
    if (!chromePath) {
      throw new Error('Nenhum navegador compatível encontrado!\n\n' +
        'Por favor, instale um dos seguintes navegadores:\n' +
        '  • Google Chrome: https://www.google.com/chrome/\n' +
        '  • Microsoft Edge (já vem com Windows 10/11)\n\n' +
        'Após instalar, execute o validador novamente.');
    }
    
    let launchOptions = {
      headless: runHeadless,
      executablePath: chromePath,
      args: runHeadless
        ? ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
        : ['--start-maximized', '--disable-blink-features=AutomationControlled'],
      defaultViewport: runHeadless ? { width: 1280, height: 720 } : null
    };
    
    console.log(`Iniciando navegador: ${chromePath}`);
    
    try {
      browser = await puppeteer.launch(launchOptions);
    } catch (launchError) {
      throw new Error(`Erro ao iniciar o navegador: ${launchError.message}\n\n` +
        'Tente reinstalar o Google Chrome ou Microsoft Edge.');
    }

    // ========================================
    // MONITORA O FECHAMENTO DO NAVEGADOR
    // ========================================
    browser.on('disconnected', () => {
      console.log('========================================');
      console.log('⚠️  Navegador foi fechado pelo usuário!');
      console.log('Encerrando executável...');
      console.log('========================================');
      
      process.exit(0);
    });

    const pages = await browser.pages();
    const page = pages[0];

    console.log('Navegando para o site...');
    await page.goto('https://validar.iti.gov.br/', {
      waitUntil: 'networkidle2'
    });

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

    const extracted = await page.evaluate(() => {
      const bodyText = document.body.innerText || '';

      const nome = (() => {
        const m = bodyText.match(/Assinado por:\s*(.+)/i);
        return m?.[1]?.trim() || 'Erro';
      })();

      const data = (() => {
        const m = bodyText.match(/Data da assinatura:\s*([^\n\r]+)/i);
        return m?.[1]?.trim() || 'Erro';
      })();

      let res = 'Erro';
      if (/Assinatura aprovada/i.test(bodyText)) res = 'Aprovada';
      else if (/Assinatura reprovada/i.test(bodyText)) res = 'Reprovada';

      return {
        nomeSignatario: nome || 'Erro',
        dataAssinatura: data || 'Erro',
        resultValid: res,
      };
    });

    nomeSignatario = extracted.nomeSignatario || 'Erro';
    dataAssinatura = extracted.dataAssinatura || 'Erro';
    resultValid = extracted.resultValid || 'Erro';

    await sendCallback(rowID, resultValid);

    const fraseLinha1 = 'Documento assinado digitalmente de acordo com a ICP-Brasil, MP 2.200-2/2001, no sistema certificado SBIS nº XXX-Y,';
    const fraseLinha2 = `por ${nomeSignatario}, em ${dataAssinatura}. Estado da assinatura: ${resultValid}`;
    const pdfOriginal = caminhoArquivo;
    if (pdfOriginal) {
      const pdfAlterado = await addFooterToPdf(pdfOriginal, fraseLinha1, fraseLinha2);
      if (pdfAlterado) {
        openPdfViewer(pdfAlterado);
      } else {
        console.warn('Não foi possível gerar PDF com rodapé.');
      }
    } else {
      console.warn('Nenhum PDF encontrado para adicionar rodapé.');
    }

    console.log('========================================');
    console.log(`Resultado: ${resultValid}`);
    console.log('✓ Processo concluído!');
    console.log('Você pode visualizar o resultado no navegador.');
    console.log('');
    console.log('💡 O executável será encerrado automaticamente quando você');
    console.log('   fechar o navegador.');
    console.log('========================================');
    return resultValid;

  } catch (error) {
    console.error('========================================');
    console.error('ERRO durante a automação:', error.message);
    console.error('========================================');
    console.error('Stack completo:', error);
    console.error('Encerrando em 30 segundos...');
    console.error('========================================');
    resultValid = 'Erro';
    await sendCallback(rowID, resultValid);
    
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
  } finally {
    if (runHeadless && browser) {
      try {
        await browser.close();
      } catch (e) {
        console.error('Erro ao fechar navegador (headless):', e.message);
      }
      process.exit(resultValid === 'Erro' ? 1 : 0);
    }
  }
}

module.exports = { validarDocumento };