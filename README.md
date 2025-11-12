# Validador ITI - Automação Electron

Aplicação desktop para automação da validação de documentos digitais no site do ITI (Instituto Nacional de Tecnologia da Informação).

## 🚀 Funcionalidades

- **Detecção automática** dos arquivos mais recentes no Downloads (PDF + ZIP)
- **Extração automática** do arquivo P7S do ZIP para diretório temporário
- **Automação completa** do processo de validação no site validar.iti.gov.br
- **Interface visual** usando Chromium
- **Timer de 2 minutos** para visualização dos resultados
- **Fechamento automático** após exibição dos resultados

## 📋 Pré-requisitos

- Windows 10/11
- Node.js 16+ 
- Arquivos na pasta Downloads:
  - 1 arquivo PDF (documento a ser validado)
  - 1 arquivo ZIP (contendo arquivo .p7s da assinatura)

## 🛠️ Instalação

1. Clone o repositório:
```bash
git clone https://github.com/seu-usuario/validador-electron.git
cd validador-electron
```

2. Instale as dependências:
```bash
npm install
```

## 💻 Uso

### Desenvolvimento
```bash
npm start
```

### Build para produção
```bash
npm run pack
```

O executável será gerado em: `dist/ValidadorITI-win32-x64/ValidadorITI.exe`

## 🔧 Como funciona

1. **Busca arquivos**: Identifica os 2 arquivos mais recentes no Downloads
2. **Extrai P7S**: Descompacta o arquivo .p7s do ZIP para temp
3. **Abre navegador**: Inicia Chromium e navega para o site do ITI
4. **Automação**: Faz upload dos arquivos e processa a validação
5. **Exibe resultados**: Mostra os resultados por 2 minutos
6. **Encerra automaticamente**: Fecha navegador e aplicação

## 📂 Estrutura do projeto

```
validador-electron/
├── main.js          # Processo principal do Electron
├── validador.js     # Lógica de automação com Puppeteer
├── package.json     # Configurações e dependências
└── dist/            # Builds gerados
```

## 🛡️ Dependências

- **electron**: Framework para aplicações desktop
- **puppeteer**: Automação do navegador
- **adm-zip**: Manipulação de arquivos ZIP

## 📝 Licença

MIT License

## 🤝 Contribuição

1. Fork o projeto
2. Crie uma branch para sua feature (`git checkout -b feature/AmazingFeature`)
3. Commit suas mudanças (`git commit -m 'Add some AmazingFeature'`)
4. Push para a branch (`git push origin feature/AmazingFeature`)
5. Abra um Pull Request

## 📞 Suporte

Para problemas ou sugestões, abra uma [issue](https://github.com/seu-usuario/validador-electron/issues).