const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const qrcode = require('qrcode');
const { Client, LocalAuth } = require('whatsapp-web.js');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

const DB_FILE = path.join(__dirname, 'data', 'tarefas.json');
let botReady = false;

function readDb() {
  const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
  if (!Array.isArray(db.tecnicos)) db.tecnicos = [];
  if (!Array.isArray(db.tasks)) db.tasks = [];
  return db;
}

function writeDb(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: { args: ['--no-sandbox', '--disable-setuid-sandbox'] }
});

async function sendWhatsAppAlert(rawPhone, textMessage) {
  if (!botReady) {
    throw new Error('O Bot do WhatsApp ainda não está conectado.');
  }
  let digits = String(rawPhone || '').replace(/\D/g, '');
  if (!digits) throw new Error('Número de telefone vazio.');
  if (!digits.startsWith('55') && digits.length <= 11) {
    digits = '55' + digits;
  }

  const numberId = await client.getNumberId(digits);
  if (!numberId) {
    throw new Error(`O número ${digits} não possui WhatsApp ativo.`);
  }
  await client.sendMessage(numberId._serialized, textMessage);
  return numberId._serialized;
}

function buildTicketMessage({ tecnicoNome, telefone, numeroChamado, resumo }) {
  const numLimpo = String(numeroChamado || '').replace(/^Chamado\s*#?/i, '').replace(/^#/, '').trim();
  const nome = tecnicoNome || 'Técnico TI';
  const fone = telefone || 'Sem telefone';
  const textoResumo = resumo || 'Verificar chamado no sistema';

  return (
    `*${nome}* - ${fone}\n\n` +
    `*Chamado#* ${numLimpo}\n\n` +
    `*Resumo do chamado :* ${textoResumo}`
  );
}

app.get('/api/tecnicos', (req, res) => {
  const db = readDb();
  res.json(db.tecnicos);
});

app.post('/api/tecnicos', (req, res) => {
  const db = readDb();
  const nome = String(req.body.nome || '').trim();
  const telefone = String(req.body.telefone || '').replace(/\D/g, '').trim();
  if (!nome || !telefone) {
    return res.status(400).json({ error: 'Informe nome e telefone.' });
  }

  const existenteIdx = db.tecnicos.findIndex(t => t.nome.toLowerCase() === nome.toLowerCase());
  if (existenteIdx !== -1) {
    db.tecnicos[existenteIdx].telefone = telefone;
    writeDb(db);
    return res.json(db.tecnicos[existenteIdx]);
  }

  const novo = { id: Date.now(), nome, telefone };
  db.tecnicos.push(novo);
  writeDb(db);
  res.json(novo);
});

app.delete('/api/tecnicos/:id', (req, res) => {
  const db = readDb();
  db.tecnicos = db.tecnicos.filter(t => String(t.id) !== String(req.params.id));
  writeDb(db);
  res.json({ ok: true });
});

app.get('/api/tasks', (req, res) => res.json(readDb().tasks));

app.post('/api/tasks', (req, res) => {
  const db = readDb();
  db.lastId = (db.lastId || 100) + 1;
  const nova = {
    id: db.lastId,
    codigo: req.body.codigo || `OS-${db.lastId}`,
    checklist: {
      backup: false,
      sistemaDrivers: false,
      officeProgramas: false,
      antivirusRede: false,
      limpezaFisica: false
    },
    ...req.body,
    criadoEm: new Date().toISOString()
  };
  db.tasks.unshift(nova);
  writeDb(db);
  res.json(nova);
});

app.patch('/api/tasks/:id', (req, res) => {
  const db = readDb();
  const idx = db.tasks.findIndex(t => String(t.id) === String(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'Não encontrada' });
  db.tasks[idx] = { ...db.tasks[idx], ...req.body };
  writeDb(db);
  res.json(db.tasks[idx]);
});

app.post('/api/notify', async (req, res) => {
  try {
    const { phone, message } = req.body;
    const sentTo = await sendWhatsAppAlert(phone, message);
    res.json({ ok: true, sentTo });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

app.post('/api/import-tickets', async (req, res) => {
  try {
    const {
      tickets = [],
      tecnicoNome = 'A definir',
      notifyPhone = '',
      forceNotify = false,
      siteTitle = 'Sistema de Chamados'
    } = req.body;

    const db = readDb();
    const targetPhone = String(notifyPhone || '').replace(/\D/g, '');
    const novosChamados = [];
    const paraNotificar = [];

    for (const item of tickets) {
      const rawNum = typeof item === 'object' ? item.numero : item;
      const assunto = typeof item === 'object' ? String(item.assunto || '').trim() : '';
      const numLimpo = String(rawNum || '').replace(/\D/g, '').trim();
      if (!numLimpo) continue;

      const codigoChamado = `Chamado#${numLimpo}`;

      const existente = db.tasks.find(
        t => String(t.numeroExterno) === numLimpo ||
             String(t.codigo).toUpperCase() === codigoChamado.toUpperCase() ||
             String(t.codigo).toUpperCase() === `#${numLimpo}`
      );

      if (!existente) {
        db.lastId = (db.lastId || 100) + 1;
        const novo = {
          id: db.lastId,
          codigo: codigoChamado,
          numeroExterno: numLimpo,
          tipo: 'Manutenção Preventiva',
          equipamento: assunto || 'Verificar descrição no sistema',
          patrimonio: numLimpo,
          setor: siteTitle,
          telefone: targetPhone || '',
          tecnico: tecnicoNome || 'A definir',
          prioridade: 'Alta',
          status: 'Pendente',
          descricao: assunto || 'Verificar descrição no sistema',
          observacaoTecnica: '',
          checklist: {
            backup: false,
            sistemaDrivers: false,
            officeProgramas: false,
            antivirusRede: false,
            limpezaFisica: false
          },
          criadoEm: new Date().toISOString(),
          origem: 'Site Externo'
        };
        db.tasks.unshift(novo);
        novosChamados.push(novo);
        paraNotificar.push(novo);
      } else {
        // Atualiza sempre o título/resumo se veio preenchido da tela
        if (assunto) {
          existente.descricao = assunto;
          existente.equipamento = assunto;
        }
        if (forceNotify) {
          if (tecnicoNome && tecnicoNome !== 'A definir') existente.tecnico = tecnicoNome;
          if (targetPhone) existente.telefone = targetPhone;
          paraNotificar.push(existente);
        }
      }
    }

    writeDb(db);

    let notifiedCount = 0;
    if (targetPhone && botReady && paraNotificar.length > 0) {
      for (const chamado of paraNotificar) {
        const msg = buildTicketMessage({
          tecnicoNome: chamado.tecnico || tecnicoNome,
          telefone: targetPhone,
          numeroChamado: chamado.numeroExterno || chamado.codigo,
          resumo: chamado.descricao || chamado.equipamento
        });

        try {
          await sendWhatsAppAlert(targetPhone, msg);
          notifiedCount++;
        } catch (err) {
          console.error('Erro ao enviar WhatsApp:', err.message);
        }
      }
    }

    res.json({
      ok: true,
      importedCount: novosChamados.length,
      notifiedCount,
      importedCodes: novosChamados.map(c => c.codigo)
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

client.on('qr', async (qr) => {
  console.log('📲 Escaneie o QR Code abaixo no seu WhatsApp:');
  const terminalQr = await qrcode.toString(qr, { type: 'terminal', small: true });
  console.log(terminalQr);
});

client.on('ready', () => {
  botReady = true;
  console.log('✅ Bot de Manutenção TI conectado ao WhatsApp e pronto para enviar chamados aos técnicos!');
});

client.on('message', async (message) => {
  const text = (message.body || '').trim();
  const low = text.toLowerCase();
  const db = readDb();

  if (['menu', 'oi', 'olá', 'ola', 'ajuda'].includes(low)) {
    return message.reply(
      `🤖 *BOT DE CHAMADOS & BANCADA TI*\n\n` +
      `👨‍💻 *Comandos de Técnicos:*\n` +
      `• */addtecnico Nome | DDD+Telefone*\n` +
      `• */tecnicos* (Lista técnicos salvos)\n\n` +
      `🎫 *Comandos de Chamados:*\n` +
      `• *2* — Listar chamados pendentes\n` +
      `• */avisar NUMERO NomeDoTecnico*\n` +
      `• */assumir NUMERO NomeDoTecnico*\n` +
      `• */concluir NUMERO Laudo final*`
    );
  }

  if (low.startsWith('/addtecnico ')) {
    const parts = text.substring(12).split('|').map(s => s.trim());
    const nome = parts[0];
    const telefone = (parts[1] || '').replace(/\D/g, '');
    if (!nome || !telefone) {
      return message.reply('⚠️ Formato: */addtecnico Nome | DDD+Telefone*\nExemplo: */addtecnico Carlos | 61999998888*');
    }
    db.tecnicos.push({ id: Date.now(), nome, telefone });
    writeDb(db);
    return message.reply(`✅ Técnico cadastrado:\n*${nome}* - ${telefone}`);
  }

  if (low === '/tecnicos') {
    if (!db.tecnicos.length) {
      return message.reply('Nenhum técnico cadastrado ainda. Use:\n*/addtecnico Nome | DDD+Telefone*');
    }
    const lista = db.tecnicos.map(t => `• *${t.nome}* - ${t.telefone}`).join('\n');
    return message.reply(`👨‍💻 *TÉCNICOS CADASTRADOS:*\n\n${lista}`);
  }

  if (low === '2') {
    const abertas = db.tasks.filter(t => t.status !== 'Concluído');
    if (!abertas.length) return message.reply('🎉 Nenhum chamado pendente!');
    const lista = abertas.map(t =>
      `*${t.tecnico || 'A definir'}* - ${t.telefone || 'S/ Tel'}\n\n` +
      `*Chamado#* ${t.numeroExterno || t.codigo}\n\n` +
      `*Resumo do chamado :* ${t.descricao || t.equipamento}\n` +
      `───────────────`
    ).join('\n');
    return message.reply(lista);
  }

  if (low.startsWith('/avisar ')) {
    const parts = text.substring(8).trim().split(' ');
    const code = (parts.shift() || '').replace(/\D/g, '');
    const destino = parts.join(' ').trim();

    const task = db.tasks.find(t =>
      String(t.numeroExterno) === code ||
      String(t.id) === code ||
      String(t.codigo).includes(code)
    );
    if (!task) return message.reply('⚠️ Chamado não encontrado.');

    const tecCadastrado = db.tecnicos.find(tc => tc.nome.toLowerCase() === destino.toLowerCase());
    const targetNome = tecCadastrado ? tecCadastrado.nome : (task.tecnico || 'Técnico TI');
    const targetPhone = tecCadastrado ? tecCadastrado.telefone : (destino.replace(/\D/g, '') || task.telefone);

    if (!targetPhone) {
      return message.reply('⚠️ Informe o nome de um técnico cadastrado ou o telefone. Ex:\n*/avisar ' + code + ' Carlos*');
    }

    task.tecnico = targetNome;
    task.telefone = targetPhone;
    writeDb(db);

    const msg = buildTicketMessage({
      tecnicoNome: targetNome,
      telefone: targetPhone,
      numeroChamado: task.numeroExterno || task.codigo,
      resumo: task.descricao || task.equipamento
    });

    try {
      await sendWhatsAppAlert(targetPhone, msg);
      return message.reply(`✅ Enviado para *${targetNome}* (${targetPhone}):\n\n${msg}`);
    } catch (err) {
      return message.reply(`❌ Erro ao enviar: ${err.message}`);
    }
  }
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`🚀 Painel Web e Receptor de Chamados rodando em http://localhost:${PORT}`);
  client.initialize();
});
