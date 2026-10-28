(function () {
  if (document.getElementById('techbot-ticket-capturer')) return;

  let timer = null;
  let debounceTimer = null;
  let tecnicosList = [];

  if (localStorage.getItem('tb_auto_enabled') === null) {
    localStorage.setItem('tb_auto_enabled', 'true');
  }

  const box = document.createElement('div');
  box.id = 'techbot-ticket-capturer';
  box.style.cssText = 'position:fixed;bottom:16px;right:16px;z-index:999999;background:#0f172a;color:#f8fafc;border:2px solid #25d366;border-radius:12px;padding:12px;width:395px;font-family:system-ui,sans-serif;font-size:12px;box-shadow:0 10px 25px rgba(0,0,0,0.65);';

  box.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
      <strong style="color:#4ade80;font-size:13px;">🤖 TechBot — Auto Fila & Técnico</strong>
      <button id="tb-min-btn" style="background:none;border:none;color:#94a3b8;cursor:pointer;font-size:16px;font-weight:bold;">−</button>
    </div>
    <div id="tb-body">
      <div style="margin-bottom:8px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px;">
          <label style="color:#94a3b8;font-size:11px;">👨‍💻 Modo de Atribuição / Técnicos:</label>
          <button id="tb-toggle-add-tec" style="background:#1e293b;border:1px solid #3b82f6;color:#60a5fa;border-radius:4px;padding:1px 6px;font-size:10px;cursor:pointer;">
            ➕ Cadastrar Técnico
          </button>
        </div>
        <div style="display:flex;gap:4px;">
          <select id="tb-tecnico-select" style="flex:1;padding:6px;border-radius:6px;border:1px solid #334155;background:#1e293b;color:#fff;font-size:11px;">
            <option value="AUTO">🤖 Reconhecer Técnico Automaticamente na Tela</option>
          </select>
          <button id="tb-del-tec" title="Remover técnico selecionado" style="background:#1e293b;border:1px solid #334155;color:#f87171;border-radius:6px;padding:0 8px;cursor:pointer;">🗑️</button>
        </div>
      </div>

      <div id="tb-add-tec-form" style="display:none;background:#1e293b;border:1px solid #334155;border-radius:8px;padding:8px;margin-bottom:8px;">
        <div style="font-weight:bold;color:#93c5fd;margin-bottom:6px;font-size:11px;">Novo Técnico</div>
        <input id="tb-new-tec-nome" type="text" placeholder="Nome completo como no CAPRI (ex: Lucas Gualberto Lima)"
          style="width:100%;padding:5px 7px;margin-bottom:5px;border-radius:5px;border:1px solid #475569;background:#0f172a;color:#fff;font-size:11px;" />
        <input id="tb-new-tec-fone" type="text" placeholder="Telefone c/ DDD (ex: 61999998888)"
          style="width:100%;padding:5px 7px;margin-bottom:6px;border-radius:5px;border:1px solid #475569;background:#0f172a;color:#fff;font-size:11px;" />
        <div style="display:flex;gap:5px;justify-content:flex-end;">
          <button id="tb-cancel-tec" style="padding:4px 8px;border:none;border-radius:4px;background:#475569;color:#fff;font-size:11px;cursor:pointer;">Cancelar</button>
          <button id="tb-save-tec" style="padding:4px 10px;border:none;border-radius:4px;background:#25d366;color:#052e16;font-weight:bold;font-size:11px;cursor:pointer;">💾 Salvar Técnico</button>
        </div>
      </div>

      <div style="display:flex;gap:6px;margin-bottom:8px;">
        <button id="tb-scan-now" style="flex:1;padding:7px;border:none;border-radius:6px;background:#3b82f6;color:#fff;font-weight:bold;cursor:pointer;">
          🔍 Ler & Enviar Agora
        </button>
        <button id="tb-toggle-auto" style="flex:1;padding:7px;border:none;border-radius:6px;background:#dc2626;color:#fff;font-weight:bold;cursor:pointer;">
          ⏹️ Auto Ativo (10s)
        </button>
      </div>

      <div id="tb-status" style="color:#cbd5e1;background:#1e293b;padding:7px;border-radius:6px;max-height:240px;overflow-y:auto;font-size:11px;line-height:1.4;">
        Iniciando leitura automática de filas e técnicos...
      </div>
    </div>
  `;

  document.body.appendChild(box);

  const statusEl = document.getElementById('tb-status');
  const selectEl = document.getElementById('tb-tecnico-select');
  const autoBtn = document.getElementById('tb-toggle-auto');
  const addFormEl = document.getElementById('tb-add-tec-form');

  document.getElementById('tb-min-btn').onclick = () => {
    const b = document.getElementById('tb-body');
    b.style.display = b.style.display === 'none' ? 'block' : 'none';
  };

  document.getElementById('tb-toggle-add-tec').onclick = () => {
    addFormEl.style.display = addFormEl.style.display === 'none' ? 'block' : 'none';
  };

  document.getElementById('tb-cancel-tec').onclick = () => {
    addFormEl.style.display = 'none';
  };

  function normalizeStr(str) {
    return String(str || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  const STOP_WORDS = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);

  function matchRegisteredTecnico(rawText) {
    const target = normalizeStr(rawText);
    if (!target || target === '-' || target === 'a definir' || target.includes('root@localhost')) {
      return null;
    }

    for (const tec of tecnicosList) {
      const nTec = normalizeStr(tec.nome);
      if (!nTec) continue;
      if (target === nTec || target.includes(nTec) || (target.length >= 5 && nTec.includes(target))) {
        return tec;
      }
    }

    const targetTokens = target.split(/[^a-z0-9]+/).filter(w => w.length >= 2 && !STOP_WORDS.has(w));
    if (targetTokens.length === 0) return null;

    let best = null;
    let bestScore = 0;

    for (const tec of tecnicosList) {
      const tecTokens = normalizeStr(tec.nome).split(/[^a-z0-9]+/).filter(w => w.length >= 2 && !STOP_WORDS.has(w));
      if (tecTokens.length === 0) continue;
      const hits = tecTokens.filter(t => targetTokens.includes(t));
      if (hits.length >= 2 || (tecTokens.length === 1 && hits.length === 1)) {
        const score = hits.length / tecTokens.length;
        if (score > bestScore) {
          bestScore = score;
          best = tec;
        }
      }
    }

    return best;
  }

  function callBg(action, extra = {}) {
    return new Promise((resolve, reject) => {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({ action, ...extra }, (res) => {
          if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
          if (res && res.ok) return resolve(res.data);
          reject(new Error((res && res.error) || 'Erro na comunicação com localhost:3000'));
        });
      } else {
        reject(new Error('Recarregue a extensão em chrome://extensions'));
      }
    });
  }

  async function loadTecnicos() {
    try {
      const list = await callBg('GET_TECNICOS');
      tecnicosList = Array.isArray(list) ? list : [];
      const savedId = localStorage.getItem('tb_selected_tec_id') || 'AUTO';

      const autoOption = `<option value="AUTO" ${savedId === 'AUTO' ? 'selected' : ''}>🤖 Automático (Reconhecer Técnico na Tela)</option>`;
      const tecOptions = tecnicosList.map(t =>
        `<option value="${t.id}" ${String(t.id) === String(savedId) ? 'selected' : ''}>📌 Fixar: ${t.nome} - ${t.telefone}</option>`
      ).join('');

      selectEl.innerHTML = autoOption + tecOptions;
    } catch (err) {
      selectEl.innerHTML = '<option value="AUTO">⚠️ Servidor localhost:3000 offline</option>';
    }
  }

  selectEl.onchange = () => {
    localStorage.setItem('tb_selected_tec_id', selectEl.value);
  };

  document.getElementById('tb-save-tec').onclick = async () => {
    const nome = document.getElementById('tb-new-tec-nome').value.trim();
    const telefone = document.getElementById('tb-new-tec-fone').value.replace(/\D/g, '').trim();
    if (!nome || !telefone) {
      alert('Preencha o Nome do técnico e o Telefone com DDD!');
      return;
    }
    try {
      const created = await callBg('ADD_TECNICO', { payload: { nome, telefone } });
      localStorage.setItem('tb_selected_tec_id', 'AUTO');
      document.getElementById('tb-new-tec-nome').value = '';
      document.getElementById('tb-new-tec-fone').value = '';
      addFormEl.style.display = 'none';
      await loadTecnicos();
      statusEl.innerHTML = `<span style="color:#4ade80;">✅ Técnico <strong>${created.nome} - ${created.telefone}</strong> salvo!</span>`;
      scanAndSend(false, null);
    } catch (err) {
      alert('Erro ao salvar técnico: ' + err.message);
    }
  };

  document.getElementById('tb-del-tec').onclick = async () => {
    const id = selectEl.value;
    if (!id || id === 'AUTO') {
      alert('Selecione um técnico específico na lista para remover.');
      return;
    }
    const tec = tecnicosList.find(t => String(t.id) === String(id));
    if (!confirm(`Remover o técnico ${tec ? tec.nome : ''}?`)) return;
    try {
      await callBg('DELETE_TECNICO', { id });
      localStorage.setItem('tb_selected_tec_id', 'AUTO');
      await loadTecnicos();
    } catch (err) {
      alert('Erro ao remover: ' + err.message);
    }
  };

  function getFallbackTecnico() {
    const id = selectEl.value;
    if (!id || id === 'AUTO') return null;
    return tecnicosList.find(t => String(t.id) === String(id)) || null;
  }

  function getBestElementText(el) {
    if (!el) return '';
    const titleAttr = el.getAttribute('title') ||
      (el.querySelector('[title]') && el.querySelector('[title]').getAttribute('title')) || '';
    const inner = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
    const chosen = (titleAttr && titleAttr.length >= inner.length ? titleAttr : inner).replace(/\s+/g, ' ').trim();
    return chosen;
  }

  function extractFieldByLabel(root, labelRegex) {
    if (!root) return '';
    const labels = root.querySelectorAll('label, dt, th, strong, span.Key, .Label');
    for (const lbl of labels) {
      const txt = (lbl.innerText || lbl.textContent || '').replace(/\s+/g, ' ').trim();
      if (labelRegex.test(txt)) {
        const next = lbl.nextElementSibling;
        if (next) {
          const val = getBestElementText(next);
          if (val && val !== '-') return val;
        }
        const parentRow = lbl.closest('tr') || lbl.closest('div');
        if (parentRow) {
          const valEl = parentRow.querySelector('.Value, td:last-child, dd, span:last-child, p');
          if (valEl && valEl !== lbl) {
            const val = getBestElementText(valEl);
            if (val && val !== '-') return val;
          }
        }
      }
    }
    return '';
  }

  function detectPageQueueName() {
    const fromLabel = extractFieldByLabel(document, /^(fila|queue|setor)\s*:?$/i);
    if (fromLabel) {
      return fromLabel.replace(/\s*\(\d+\)\s*$/, '').trim();
    }

    const activeTabSelectors = [
      '.QueueOverview a.Selected',
      '.QueueOverview .Selected a',
      'ul.QueueOverviewList a.Selected',
      '.Tabs li.Active a',
      '.BreadCrumb li:last-child',
      'h1'
    ];
    for (const sel of activeTabSelectors) {
      const el = document.querySelector(sel);
      if (!el) continue;
      const raw = getBestElementText(el);
      if (!raw) continue;
      if (/^Chamado\s*#/i.test(raw)) continue;
      const cleaned = raw
        .replace(/^Vis[aã]o de Filas\s*[:\-–—]\s*/i, '')
        .replace(/^Fila\s*[:\-–—]\s*/i, '')
        .replace(/\s*\(\d+\)\s*$/, '')
        .trim();
      if (cleaned && cleaned.length >= 3 && !/^todas/i.test(cleaned)) {
        return cleaned;
      }
    }

    const docTitle = (document.title || '')
      .replace(/^\d+\s*[-–—]\s*Detalhes\s*[-–—]\s*/i, '')
      .replace(/\s*[-–—]\s*Chamado\s*[-–—]\s*CAPRI.*$/i, '')
      .replace(/\s*[-–—]\s*CAPRI.*$/i, '')
      .trim();

    return docTitle && !/^Fila$/i.test(docTitle) ? docTitle : '';
  }

  function detectPageTecnicoName() {
    const fromLabel = extractFieldByLabel(
      document,
      /^(propriet[aá]rio|respons[aá]vel|t[eé]cnico|atendente|agente|owner|responsible|designado)\s*:?$/i
    );
    if (fromLabel) {
      const matched = matchRegisteredTecnico(fromLabel);
      if (matched) return matched.nome;
      const clean = fromLabel.replace(/\s*\([^)]*\)\s*$/, '').trim();
      if (clean && !/^(root@localhost|admin|-|a definir)$/i.test(clean)) {
        return clean;
      }
    }

    const sidebarEls = document.querySelectorAll('.SidebarColumn p.Value, .SidebarColumn td, .WidgetSimple p.Value, fieldset.TableLike p.Value');
    for (const el of sidebarEls) {
      const txt = getBestElementText(el);
      const matched = matchRegisteredTecnico(txt);
      if (matched) return matched.nome;
    }

    return '';
  }

  function analyzeTableColumns(table) {
    const map = { filaIdx: -1, tecnicoIdx: -1, tituloIdx: -1 };
    if (!table) return map;

    const headerRow = table.querySelector('thead tr') || table.querySelector('tr');
    if (!headerRow) return map;

    const headers = Array.from(headerRow.querySelectorAll('th, td'));
    headers.forEach((th, idx) => {
      const hText = normalizeStr(th.innerText || th.textContent || th.getAttribute('title') || '');
      const hClass = normalizeStr(th.className || '');
      const combined = `${hText} ${hClass}`;

      if (map.filaIdx === -1 && /\b(fila|queue)\b/.test(combined)) {
        map.filaIdx = idx;
      }
      if (map.tecnicoIdx === -1 && /\b(proprietario|responsavel|tecnico|atendente|agente|owner|responsible)\b/.test(combined)) {
        map.tecnicoIdx = idx;
      }
      if (map.tituloIdx === -1 && /\b(titulo|assunto|resumo|title|subject|descricao)\b/.test(combined)) {
        map.tituloIdx = idx;
      }
    });

    return map;
  }

  function extractRowMetadata(el, numero, pageFila, pageTecnico) {
    let assunto = '';
    let fila = '';
    let tecnico = '';

    const row = el.closest('tr') || el.closest('li') || el.closest('.WidgetSimple') || el.parentElement;
    if (!row) {
      return { assunto, fila: pageFila, tecnico: pageTecnico };
    }

    const table = row.closest('table');
    const colMap = analyzeTableColumns(table);
    const cells = Array.from(row.querySelectorAll('td'));

    if (cells.length > 0) {
      if (colMap.tituloIdx >= 0 && cells[colMap.tituloIdx]) {
        const val = getBestElementText(cells[colMap.tituloIdx]);
        if (val && !val.includes(numero)) assunto = val;
      }
      if (colMap.filaIdx >= 0 && cells[colMap.filaIdx]) {
        const val = getBestElementText(cells[colMap.filaIdx]);
        if (val && !val.includes(numero)) fila = val;
      }
      if (colMap.tecnicoIdx >= 0 && cells[colMap.tecnicoIdx]) {
        const val = getBestElementText(cells[colMap.tecnicoIdx]);
        if (val && !val.includes(numero)) tecnico = val;
      }
    }

    if (!assunto) {
      const titleCell = row.querySelector('td.Title, td.Subject, .Title, [class*="Title"], [class*="assunto" i], [class*="subject" i]');
      if (titleCell) {
        const txt = getBestElementText(titleCell);
        if (txt && !txt.includes(numero)) assunto = txt;
      }
    }

    if (!fila) {
      const queueCell = row.querySelector('td.Queue, .Queue, [class*="Queue"], [class*="fila" i]');
      if (queueCell) {
        const txt = getBestElementText(queueCell);
        if (txt && !txt.includes(numero)) fila = txt;
      }
      if (!fila) {
        fila = extractFieldByLabel(row, /^(fila|queue)\s*:?$/i);
      }
    }

    if (!tecnico) {
      const ownerCell = row.querySelector('td.Owner, td.Responsible, .Owner, .Responsible, [class*="Owner"], [class*="Responsible"]');
      if (ownerCell) {
        const txt = getBestElementText(ownerCell);
        if (txt && !txt.includes(numero)) tecnico = txt;
      }
      if (!tecnico) {
        tecnico = extractFieldByLabel(row, /^(propriet[aá]rio|respons[aá]vel|t[eé]cnico|atendente|agente|owner)\s*:?$/i);
      }
    }

    const matchedInTecnicoField = matchRegisteredTecnico(tecnico);
    if (matchedInTecnicoField) {
      tecnico = matchedInTecnicoField.nome;
    } else {
      for (const td of cells) {
        const cellTxt = getBestElementText(td);
        const mTec = matchRegisteredTecnico(cellTxt);
        if (mTec) {
          tecnico = mTec.nome;
          break;
        }
      }
      if (tecnico) {
        tecnico = tecnico.replace(/\s*\([^)]*\)\s*$/, '').trim();
        if (/^(root@localhost|admin|-|a definir)$/i.test(tecnico)) {
          tecnico = '';
        }
      }
    }

    if (!assunto) {
      const titledEls = row.querySelectorAll('[title]');
      for (const tEl of titledEls) {
        const tVal = (tEl.getAttribute('title') || '').trim();
        const mDash = tVal.match(/Chamado\s*#?\s*\d+\s*[—\-–:]\s*(.+)/i);
        if (mDash) {
          assunto = mDash[1].trim();
          break;
        }
      }
    }

    if (!assunto && cells.length > 1) {
      for (let i = 0; i < cells.length; i++) {
        if (i === colMap.filaIdx || i === colMap.tecnicoIdx) continue;
        const raw = getBestElementText(cells[i]);
        if (!raw || raw.includes(numero)) continue;
        if (fila && raw === fila) continue;
        if (tecnico && raw.includes(tecnico)) continue;
        if (/^\d{1,2}[\/\-]\d{1,2}/.test(raw)) continue;
        if (/^\d+\s*(min|h|hora|dia|d|s|mês|ano)/i.test(raw)) continue;
        if (/^(novo|aberto|pendente|fechado|em atendimento|baixa|média|alta|urgente|normal|\d+\s*muito\s*baixo|\d+\s*baixo|\d+\s*normal|\d+\s*alto|\d+)$/i.test(raw)) continue;
        if (raw.length >= 5) {
          assunto = raw;
          break;
        }
      }
    }

    return {
      assunto: assunto || '',
      fila: (fila || pageFila || '').replace(/\s*\(\d+\)\s*$/, '').trim(),
      tecnico: tecnico || pageTecnico || ''
    };
  }

  function extractTicketsFromPage() {
    const foundMap = new Map();
    const pageFila = detectPageQueueName();
    const pageTecnico = detectPageTecnicoName();
    const fullText = document.body ? document.body.innerText : '';

    const regexChamadoCompleto = /Chamado\s*#?\s*(\d{8,22})\s*[—\-–:]\s*([^\r\n]+)/gi;
    let match;
    while ((match = regexChamadoCompleto.exec(fullText)) !== null) {
      const numero = match[1].trim();
      const assunto = (match[2] || '').trim();
      if (assunto && !foundMap.has(numero)) {
        foundMap.set(numero, {
          numero,
          assunto,
          fila: pageFila,
          tecnico: pageTecnico
        });
      }
    }

    const allElements = document.querySelectorAll('a, td, span, div, h1, h2, h3');
    allElements.forEach(el => {
      if (el.closest('#techbot-ticket-capturer')) return;
      if (el.children.length > 2) return;
      const txt = (el.innerText || '').trim();
      const m = txt.match(/\b(202\d{11,17})\b/);
      if (m) {
        const numero = m[1];
        const existing = foundMap.get(numero);
        const inlineMatch = txt.match(/202\d{11,17}\s*[—\-–:]\s*(.+)/);
        const meta = extractRowMetadata(el, numero, pageFila, pageTecnico);
        const assuntoFinal = (inlineMatch ? inlineMatch[1].trim() : meta.assunto) || (existing ? existing.assunto : '');
        const filaFinal = meta.fila || (existing ? existing.fila : '') || pageFila;
        const tecnicoFinal = meta.tecnico || (existing ? existing.tecnico : '') || pageTecnico;

        if (!existing || assuntoFinal || filaFinal || tecnicoFinal) {
          foundMap.set(numero, {
            numero,
            assunto: assuntoFinal,
            fila: filaFinal,
            tecnico: tecnicoFinal
          });
        }
      }
    });

    return Array.from(foundMap.values());
  }

  async function scanAndSend(forceAll = false, singleTicket = null) {
    if (tecnicosList.length === 0) {
      await loadTecnicos();
    }

    const fallbackTec = getFallbackTecnico();
    const tickets = singleTicket ? [singleTicket] : extractTicketsFromPage();

    if (tickets.length === 0) {
      statusEl.innerHTML = '⚠️ Nenhum Chamado# detectado nesta tela ainda.';
      return;
    }

    try {
      const data = await callBg('IMPORT_TICKETS', {
        payload: {
          tickets,
          tecnicoNome: fallbackTec ? fallbackTec.nome : '',
          notifyPhone: fallbackTec ? fallbackTec.telefone : '',
          forceNotify: forceAll || Boolean(singleTicket),
          siteTitle: detectPageQueueName() || document.title || location.hostname
        }
      });

      let html = `<div style="margin-bottom:5px;">🎫 <strong>${tickets.length} chamado(s) lido(s):</strong></div>`;
      tickets.slice(0, 12).forEach((t, idx) => {
        const valTitulo = (t.assunto || '').replace(/"/g, '&quot;');
        const matchedTec = matchRegisteredTecnico(t.tecnico) || fallbackTec;
        const tecDisplay = matchedTec
          ? `<span style="color:#4ade80;">👨‍💻 ${matchedTec.nome} (${matchedTec.telefone})</span>`
          : (t.tecnico
              ? `<span style="color:#fbbf24;">👨‍💻 ${t.tecnico} (cadastre o fone em ➕)</span>`
              : `<span style="color:#94a3b8;">👨‍💻 A definir</span>`);
        const filaDisplay = t.fila ? `<span style="color:#93c5fd;">📂 ${t.fila}</span>` : '';

        html += `
          <div style="background:#0f172a;border:1px solid #334155;border-radius:6px;padding:6px;margin-bottom:5px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px;">
              <strong style="color:#60a5fa;">Chamado#${t.numero}</strong>
              <button class="tb-send-one" data-idx="${idx}" style="background:#16a34a;border:none;color:#fff;border-radius:4px;padding:2px 7px;font-size:10px;font-weight:bold;cursor:pointer;" title="Forçar envio/reenvio deste chamado no WhatsApp">
                📲 Enviar
              </button>
            </div>
            <div style="font-size:10px;display:flex;flex-direction:column;gap:2px;margin-bottom:4px;">
              ${filaDisplay}
              ${tecDisplay}
            </div>
            <input type="text" class="tb-edit-resumo" data-idx="${idx}" value="${valTitulo}" placeholder="Resumo/Título do chamado..."
              style="width:100%;padding:4px 6px;border-radius:4px;border:1px solid #334155;background:#1e293b;color:#f8fafc;font-size:11px;" />
          </div>`;
      });

      if (data && data.notifiedCount > 0) {
        const dests = (data.notifiedDetails || []).map(d => `${d.tecnico} (${d.codigo})`).join(', ');
        html += `<div style="color:#4ade80;font-weight:bold;margin-top:4px;">✅ ${data.notifiedCount} enviado(s) automaticamente p/ WhatsApp: ${dests}!</div>`;
      } else if (data && data.importedCount > 0) {
        html += `<div style="color:#fbbf24;margin-top:4px;">📥 ${data.importedCount} novo(s) chamado(s) registrado(s)!</div>`;
      } else {
        html += `<div style="color:#94a3b8;margin-top:4px;">✔️ Monitorando fila e técnicos automaticamente.</div>`;
      }

      statusEl.innerHTML = html;

      statusEl.querySelectorAll('.tb-send-one').forEach(btn => {
        btn.onclick = () => {
          const i = Number(btn.getAttribute('data-idx'));
          const inputResumo = statusEl.querySelector(`.tb-edit-resumo[data-idx="${i}"]`);
          const item = tickets[i];
          if (item) {
            item.assunto = inputResumo ? inputResumo.value.trim() : item.assunto;
            scanAndSend(true, item);
          }
        };
      });
    } catch (err) {
      statusEl.innerHTML = `<span style="color:#f87171;">❌ Erro: ${err.message}</span>`;
    }
  }

  function startAutoLoop() {
    if (timer) clearInterval(timer);
    timer = setInterval(() => scanAndSend(false, null), 10000);
    localStorage.setItem('tb_auto_enabled', 'true');
    autoBtn.textContent = '⏹️ Auto Ativo (10s)';
    autoBtn.style.background = '#dc2626';
  }

  function stopAutoLoop() {
    if (timer) clearInterval(timer);
    timer = null;
    localStorage.setItem('tb_auto_enabled', 'false');
    autoBtn.textContent = '▶️ Ativar Auto (10s)';
    autoBtn.style.background = '#16a34a';
  }

  document.getElementById('tb-scan-now').onclick = () => scanAndSend(true, null);

  autoBtn.onclick = () => {
    if (timer) {
      stopAutoLoop();
    } else {
      scanAndSend(false, null);
      startAutoLoop();
    }
  };

  const observer = new MutationObserver(() => {
    if (localStorage.getItem('tb_auto_enabled') !== 'true') return;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      scanAndSend(false, null);
    }, 1500);
  });

  (async function init() {
    await loadTecnicos();
    await scanAndSend(false, null);
    if (localStorage.getItem('tb_auto_enabled') === 'true') {
      startAutoLoop();
    } else {
      stopAutoLoop();
    }
    const targetNode = document.querySelector('#MainBox, .MainBox, #AppWrapper') || document.body;
    if (targetNode) {
      observer.observe(targetNode, { childList: true, subtree: true });
    }
  })();
})();
