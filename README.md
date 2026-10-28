# 🔧 TechBot OS — Painel de Manutenção TI, Capturador CAPRI & Bot de WhatsApp

Sistema completo para gestão de Ordens de Serviço de TI, captura automática de chamados (CAPRI / OTRS / GLPI) via extensão de navegador e envio automático de alertas para técnicos pelo WhatsApp.

## 📂 Estrutura do Projeto

- `server.js` — Servidor Node.js (`Express` + `whatsapp-web.js`) com API REST, integração via QR Code do WhatsApp e reconhecimento automático de técnicos/filas.
- `index.html` — Painel Web Kanban com controle de bancada, checklist técnico, impressão de comprovante de OS e simulador do Bot.
- `extensao-capturador/` — Extensão Chrome/Edge (Manifest V3) que lê automaticamente números de chamados, filas, resumos e técnicos na tela e envia direto para o WhatsApp.
- `data/tarefas.json` — Banco de dados JSON local com chamados e técnicos cadastrados.

## 🚀 Como executar

1. **Instale as dependências:**
   ```powershell
   npm.cmd install
   ```
2. **Inicie o servidor e conecte o WhatsApp:**
   ```powershell
   node server.js
   ```
   Escaneie o QR Code exibido no terminal com o seu WhatsApp.
3. **Acesse o Painel Web:**
   Abra `http://localhost:3000` no navegador.
4. **Instale a Extensão Capturadora:**
   - Acesse `chrome://extensions` ou `edge://extensions`
   - Ative o **Modo do desenvolvedor**
   - Clique em **Carregar sem compactação** e selecione a pasta `extensao-capturador`.
