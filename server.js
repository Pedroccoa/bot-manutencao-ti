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

function normalizeStr(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const STOP_WORDS = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);

// Encontra técnico cadastrado a partir do nome lido na tela do sistema (ex: CAPRI/OTRS)
function findMatchingTecnico(rawName, tecnicos = []) {
  const target = normalizeStr(rawName);
  if (!target || target === 'a definir' || target === '-' || target === 'root@localhost') {
    return null;
  }

  // 1. Igualdade exata ou inclusão direta do nome completo
  for (const tec of tecnicos) {
    const nTec = normalizeStr(tec.nome);
    if (!nTec) continue;
    if (target === nTec || target.includes(nTec) || (target.length >= 5 && nTec.includes(target))) {
      return tec;
    }
  }

  // 2. Comparação por palavras significativas do nome (ex: "Pedro Gabriel" ou "Pedro Carmo" -> "Pedro Gabriel do Carmo")
  const targetTokens = target.split(/[^a-z0-9]+/).filter(w => w.length >= 2 && !STOP_WORDS.has(w));
  if (targetTokens.length === 0) return null;

  let bestMatch = null;
  let bestScore = 0;

  for (const tec of tecnicos) {
    const tecTokens = normalizeStr(tec.nome).split(/[^a-z0-9]+/).filter(w => w.length >= 2 && !STOP_WORDS.has(w));
    if (tecTokens.length === 0) continue;

    const matchedTokens = tecTokens.filter(t => targetTokens.includes(t));
    // Se bateu pelo menos 2 nomes (ex: primeiro + segundo/último) ou 100% de um nome único
    if (matchedTokens.length >= 2 || (tecTokens.length === 1 && matchedTokens.length === 1)) {
      const score = matchedTokens.length / tecTokens.length;
      if (score > bestScore) {
        bestScore = score;
        bestMatch = tec;
      }
    }
  }

  return bestMatch;
}

function cleanQueueName(rawFila, fallbackSiteTitle = '') {
  let f = String(rawFila || '').replace(/\s+/g, ' ').trim();
  if (!f && fallbackSiteTitle) {
    f = String(fallbackSiteTitle)
      .replace(/^\d+\s*[-–—]\s*Detalhes\s*[-–—]\s*/i, '')
      .replace(/\s*[-–—]\s*Chamado\s*[-–—]\s*CAPRI.*$/i, '')
      .replace(/\s*[-–—]\s*CAPRI.*$/i, '')
      .trim();
  }
  // Remove contadores no final como "Fila X (12)"
  f = f.replace(/\s*\(\d+\)\s*$/, '').trim();
  if (!f || /^detalhes$/i.test(f) || /^sistema de chamados$/i.test(f)) {
    return 'Fila CAPRI';
  }
  return f;
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

function buildTicketMessage({ tecnicoNome, telefone, numeroChamado, resumo, fila }) {
  const numLimpo = String(numeroChamado || '').replace(/^Chamado\s*#?/i, '').replace(/^#/, '').trim();
  const nome = tecnicoNome || 'Técnico TI';
  const fone = telefone || 'Sem telefone';
  const textoResumo = resumo || 'Verificar chamado no sistema';
  const nomeFila = fila ? String(fila).trim() : '';

  return (
    `*${nome}* - ${fone}\n\n` +
    (nomeFila ? `*Fila:* ${nomeFila}\n\n` : '') +
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

  const existenteIdx = db.tecnicos.findIndex(t => normalizeStr(t.nome) === normalizeStr(nome));
  if (existenteIdx !== -1) {
    db.tecnicos[existenteIdx].nome = nome;
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
      tecnicoNome = '',
      notifyPhone = '',
      forceNotify = false,
      siteTitle = 'Sistema de Chamados'
    } = req.body;

    const db = readDb();
    const fallbackPhone = String(notifyPhone || '').replace(/\D/g, '');
    const fallbackTecNome = String(tecnicoNome || '').trim();
    const novosChamados = [];
    const paraNotificar = [];

    for (const item of tickets) {
      const rawNum = typeof item === 'object' ? item.numero : item;
      const assunto = typeof item === 'object' ? String(item.assunto || '').trim() : '';
      const rawFila = typeof item === 'object' ? String(item.fila || '').trim() : '';
      const rawTecItem = typeof item === 'object' ? String(item.tecnico || '').trim() : '';

      const numLimpo = String(rawNum || '').replace(/\D/g, '').trim();
      if (!numLimpo) continue;

      const codigoChamado = `Chamado#${numLimpo}`;
      const filaLimpa = cleanQueueName(rawFila, siteTitle);

      // Reconhece automaticamente o técnico pelo nome lido na linha/página do chamado
      const matchedTec =
        findMatchingTecnico(rawTecItem, db.tecnicos) ||
        findMatchingTecnico(fallbackTecNome, db.tecnicos);

      const resolvedTecNome = matchedTec
        ? matchedTec.nome
        : (rawTecItem && rawTecItem !== 'A definir' ? rawTecItem : (fallbackTecNome || 'A definir'));

      const resolvedPhone = matchedTec
        ? String(matchedTec.telefone || '').replace(/\D/g, '')
        : fallbackPhone;

      const isGenericDesc = (txt) =>
        !txt ||
        txt === 'Verificar descrição no sistema' ||
        txt.startsWith('Capturado automaticamente') ||
        txt.startsWith('Chamado#');

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
          fila: filaLimpa,
          setor: filaLimpa,
          telefone: resolvedPhone || '',
          tecnico: resolvedTecNome || 'A definir',
          prioridade: 'Alta',
          status: 'Pendente',
          descricao: assunto || 'Verificar descrição no sistema',
          observacaoTecnica: '',
          notificadoWhatsApp: false,
          ultimoTelefoneNotificado: '',
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

        if (resolvedPhone) {
          paraNotificar.push(novo);
        }
      } else {
        const tinhaResumoGenerico = isGenericDesc(existente.descricao);

        if (assunto && (!existente.descricao || tinhaResumoGenerico || forceNotify)) {
          existente.descricao = assunto;
          existente.equipamento = assunto;
        }

        if (rawFila || !existente.fila || existente.setor.includes('CAPRI - Central')) {
          existente.fila = filaLimpa;
          existente.setor = filaLimpa;
        }

        const mudouTecnico =
          resolvedTecNome &&
          resolvedTecNome !== 'A definir' &&
          normalizeStr(existente.tecnico) !== normalizeStr(resolvedTecNome);

        if (resolvedTecNome && resolvedTecNome !== 'A definir') {
          existente.tecnico = resolvedTecNome;
        }
        if (resolvedPhone) {
          existente.telefone = resolvedPhone;
        }

        // Dispara automaticamente se:
        // 1) O usuário forçou envio manual (forceNotify), OU
        // 2) O chamado agora tem técnico/telefone reconhecido e ainda não foi notificado para esse número, OU
        // 3) O chamado tinha sido capturado sem resumo na fila e agora abriu o detalhe com o resumo real e ainda não tinha enviado completo
        const precisaNotificarAutomatico =
          Boolean(existente.telefone) &&
          (
            forceNotify ||
            !existente.notificadoWhatsApp ||
            existente.ultimoTelefoneNotificado !== existente.telefone ||
            mudouTecnico ||
            (tinhaResumoGenerico && Boolean(assunto) && !existente.notificadoComResumo)
          );

        if (precisaNotificarAutomatico) {
          paraNotificar.push(existente);
        }
      }
    }

    let notifiedCount = 0;
    const notifiedDetails = [];

    if (botReady && paraNotificar.length > 0) {
      for (const chamado of paraNotificar) {
        const targetPhone = String(chamado.telefone || fallbackPhone || '').replace(/\D/g, '');
        if (!targetPhone) continue;

        const msg = buildTicketMessage({
          tecnicoNome: chamado.tecnico || 'Técnico TI',
          telefone: targetPhone,
          numeroChamado: chamado.numeroExterno || chamado.codigo,
          resumo: chamado.descricao || chamado.equipamento,
          fila: chamado.fila || chamado.setor
        });

        try {
          await sendWhatsAppAlert(targetPhone, msg);
          chamado.notificadoWhatsApp = true;
          chamado.ultimoTelefoneNotificado = targetPhone;
          if (chamado.descricao && !chamado.descricao.startsWith('Verificar descrição')) {
            chamado.notificadoComResumo = true;
          }
          notifiedCount++;
          notifiedDetails.push({
            codigo: chamado.codigo,
            tecnico: chamado.tecnico,
            telefone: targetPhone,
            fila: chamado.fila || chamado.setor
          });
        } catch (err) {
          console.error('Erro ao enviar WhatsApp:', err.message);
        }
      }
    }

    writeDb(db);

    res.json({
      ok: true,
      importedCount: novosChamados.length,
      notifiedCount,
      notifiedDetails,
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
      (t.fila || t.setor ? `*Fila:* ${t.fila || t.setor}\n\n` : '') +
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

    const tecCadastrado = findMatchingTecnico(destino, db.tecnicos);
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
      resumo: task.descricao || task.equipamento,
      fila: task.fila || task.setor
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
