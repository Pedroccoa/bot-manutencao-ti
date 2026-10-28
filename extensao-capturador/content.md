(function () {
  if (document.getElementById('techbot-ticket-capturer')) return;

  let timer = null;
  let tecnicosList = [];

  const box = document.createElement('div');
  box.id = 'techbot-ticket-capturer';
  box.style.cssText = 'position:fixed;bottom:16px;right:16px;z-index:999999;background:#0f172a;color:#f8fafc;border:2px solid #25d366;border-radius:12px;padding:12px;width:380px;font-family:system-ui,sans-serif;font-size:12px;box-shadow:0 10px 25px rgba(0,0,0,0.65);';

  box.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
      <strong style="color:#4ade80;font-size:13px;">🤖 TechBot — Chamados & Técnicos</strong>
      <button id="tb-min-btn" style="background:none;border:none;color:#94a3b8;cursor:pointer;font-size:16px;font-weight:bold;">−</button>
    </div>
    <div id="tb-body">
      <div style="margin-bottom:8px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px;">
          <label style="color:#94a3b8;font-size:11px;">👨‍💻 Técnico (Nome - Telefone):</label>
          <button id="tb-toggle-add-tec" style="background:#1e293b;border:1px solid #3b82f6;color:#60a5fa;border-radius:4px;padding:1px 6px;font-size:10px;cursor:pointer;">
            ➕ Cadastrar Técnico
          </button>
        </div>
        <div style="display:flex;gap:4px;">
          <select id="tb-tecnico-select" style="flex:1;padding:6px;border-radius:6px;border:1px solid #334155;background:#1e293b;color:#fff;font-size:12px;">
            <option value="">Carregando técnicos...</option>
          </select>
          <button id="tb-del-tec" title="Remover técnico selecionado" style="background:#1e293b;border:1px solid #334155;color:#f87171;border-radius:6px;padding:0 8px;cursor:pointer;">🗑️</button>
        </div>
      </div>

      <div id="tb-add-tec-form" style="display:none;background:#1e293b;border:1px solid #334155;border-radius:8px;padding:8px;margin-bottom:8px;">
        <div style="font-weight:bold;color:#93c5fd;margin-bottom:6px;font-size:11px;">Novo Técnico</div>
        <input id="tb-new-tec-nome" type="text" placeholder="Nome do técnico (ex: Carlos)"
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
          🔍 Ler Chamados da Tela
        </button>
        <button id="tb-toggle-auto" style="flex:1;padding:7px;border:none;border-radius:6px;background:#16a34a;color:#fff;font-weight:bold;cursor:pointer;">
          ▶️ Auto (15s)
        </button>
      </div>

      <div id="tb-status" style="color:#cbd5e1;background:#1e293b;padding:7px;border-radius:6px;max-height:220px;overflow-y:auto;font-size:11px;line-height:1.4;">
        Pronto. Selecione um técnico acima e clique em Ler.
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

  function callBg(action, extra = {}) {
    return new Promise((resolve, reject) => {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({ action, ...extra }, (res) => {
          if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
          if (res && res.ok) return resolve(res.data);
          reject(new Error((res && res.error) || 'Erro na comunicação com localhost:3000'));
        });
      } else {
        reject(new Error('Recarregue a extensão em Extensões.'));
      }
    });
  }

  async function loadTecnicos() {
    try {
      const list = await callBg('GET_TECNICOS');
      tecnicosList = Array.isArray(list) ? list : [];
      const savedId = localStorage.getItem('tb_selected_tec_id') || '';

      if (tecnicosList.length === 0) {
        selectEl.innerHTML = '<option value="">Nenhum técnico cadastrado (clique em ➕)</option>';
      } else {
        selectEl.innerHTML = tecnicosList.map(t =>
          `<option value="${t.id}" ${String(t.id) === String(savedId) ? 'selected' : ''}>${t.nome} - ${t.telefone}</option>`
        ).join('');
      }
    } catch (err) {
      selectEl.innerHTML = '<option value="">Servidor localhost:3000 offline</option>';
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
      localStorage.setItem('tb_selected_tec_id', created.id);
      document.getElementById('tb-new-tec-nome').value = '';
      document.getElementById('tb-new-tec-fone').value = '';
      addFormEl.style.display = 'none';
      await loadTecnicos();
      statusEl.innerHTML = `<span style="color:#4ade80;">✅ Técnico <strong>${created.nome} - ${created.telefone}</strong> salvo!</span>`;
    } catch (err) {
      alert('Erro ao salvar técnico: ' + err.message);
    }
  };

  document.getElementById('tb-del-tec').onclick = async () => {
    const id = selectEl.value;
    if (!id) return;
    const tec = tecnicosList.find(t => String(t.id) === String(id));
    if (!confirm(`Remover o técnico ${tec ? tec.nome : ''}?`)) return;
    try {
      await callBg('DELETE_TECNICO', { id });
      await loadTecnicos();
    } catch (err) {
      alert('Erro ao remover: ' + err.message);
    }
  };

  function getSelectedTecnico() {
    const id = selectEl.value;
    return tecnicosList.find(t => String(t.id) === String(id)) || tecnicosList[0] || null;
  }

  // Extrai o título da linha da tabela (OTRS / Znuny / GLPI / Portais)
  function findTitleNearElement(el, numero) {
    // 1. Verifica se o próprio link ou pai tem atributo title com o assunto
    const row = el.closest('tr') || el.closest('li') || el.parentElement;
    if (!row) return '';

    // Procura primeiro por colunas clássicas de Título/Assunto no OTRS/GLPI
    const titleCell = row.querySelector(
      'td.Title, td.Subject, .Title, [class*="Title"], [class*="title"], [class*="assunto" i], [class*="subject" i]'
    );
    if (titleCell) {
      const attrTitle = titleCell.getAttribute('title') || (titleCell.querySelector('[title]') && titleCell.querySelector('[title]').getAttribute('title'));
      const txt = (attrTitle || titleCell.innerText || '').trim();
      if (txt && !txt.includes(numero)) return txt;
    }

    // 2. Procura em elementos com atributo title="..." dentro da mesma linha
    const titledEls = row.querySelectorAll('[title]');
    for (const tEl of titledEls) {
      const tVal = (tEl.getAttribute('title') || '').trim();
      const mDash = tVal.match(/Chamado\s*#?\s*\d+\s*[—\-–:]\s*(.+)/i);
      if (mDash) return mDash[1].trim();
    }

    // 3. Analisa todas as células <td> da mesma linha <tr>
    const cells = Array.from(row.querySelectorAll('td'));
    if (cells.length > 1) {
      const candidates = [];
      cells.forEach(td => {
        const raw = (td.getAttribute('title') || td.innerText || '').replace(/\s+/g, ' ').trim();
        if (!raw || raw.includes(numero)) return;
        // Ignora células de data/hora, idade ("2 horas", "15 min"), estados curtos ("novo", "aberto")
        if (/^\d{1,2}[\/\-]\d{1,2}/.test(raw)) return;
        if (/^\d+\s*(min|h|hora|dia|d|s|mês|ano)/i.test(raw)) return;
        if (/^(novo|aberto|pendente|fechado|em atendimento|baixa|média|alta|urgente|normal|\d+)$/i.test(raw)) return;
        if (raw.length >= 5) {
          candidates.push(raw);
        }
      });
      if (candidates.length > 0) {
        return candidates[0];
      }
    }

    return '';
  }

  function extractTicketsFromPage() {
    const foundMap = new Map();
    const fullText = document.body ? document.body.innerText : '';

    // 1. Padrão no cabeçalho/texto: "Chamado#2026102710003647 — Monitor com defeito na tela"
    const regexChamadoCompleto = /Chamado\s*#?\s*(\d{8,22})\s*[—\-–:]\s*([^\r\n]+)/gi;
    let match;
    while ((match = regexChamadoCompleto.exec(fullText)) !== null) {
      const numero = match[1].trim();
      const assunto = (match[2] || '').trim();
      if (assunto && !foundMap.has(numero)) {
        foundMap.set(numero, { numero, assunto });
      }
    }

    // 2. Procura elementos DOM (links <a>, spans, células <td>) que contenham o número 202...
    const allElements = document.querySelectorAll('a, td, span, div, h1, h2, h3');
    allElements.forEach(el => {
      if (el.children.length > 2) return;
      const txt = (el.innerText || '').trim();
      const m = txt.match(/\b(202\d{11,17})\b/);
      if (m) {
        const numero = m[1];
        const existing = foundMap.get(numero);
        if (!existing || !existing.assunto) {
          // Verifica se no próprio texto do elemento tem "— Título"
          const inlineMatch = txt.match(/202\d{11,17}\s*[—\-–:]\s*(.+)/);
          const tituloExtraido = inlineMatch ? inlineMatch[1].trim() : findTitleNearElement(el, numero);
          if (!existing || tituloExtraido) {
            foundMap.set(numero, { numero, assunto: tituloExtraido || '' });
          }
        }
      }
    });

    return Array.from(foundMap.values());
  }

  async function scanAndSend(forceAll = false, singleTicket = null) {
    const tec = getSelectedTecnico();
    const tickets = singleTicket ? [singleTicket] : extractTicketsFromPage();

    if (tickets.length === 0) {
      statusEl.innerHTML = '⚠️ Nenhum Chamado# detectado nesta tela ainda.';
      return;
    }

    try {
      const data = await callBg('IMPORT_TICKETS', {
        payload: {
          tickets,
          tecnicoNome: tec ? tec.nome : 'A definir',
          notifyPhone: tec ? tec.telefone : '',
          forceNotify: forceAll || Boolean(singleTicket),
          siteTitle: document.title || location.hostname
        }
      });

      let html = `<div style="margin-bottom:4px;">🎫 <strong>${tickets.length} chamado(s) na tela:</strong></div>`;
      tickets.slice(0, 12).forEach((t, idx) => {
        const valTitulo = (t.assunto || '').replace(/"/g, '&quot;');
        html += `
          <div style="background:#0f172a;border:1px solid #334155;border-radius:6px;padding:5px;margin-bottom:5px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px;">
              <strong style="color:#60a5fa;">Chamado#${t.numero}</strong>
              <button class="tb-send-one" data-idx="${idx}" style="background:#16a34a;border:none;color:#fff;border-radius:4px;padding:2px 7px;font-size:10px;font-weight:bold;cursor:pointer;" title="Enviar este chamado para o WhatsApp do técnico selecionado">
                📲 Enviar
              </button>
            </div>
            <input type="text" class="tb-edit-resumo" data-idx="${idx}" value="${valTitulo}" placeholder="Digite ou edite o Resumo/Título do chamado..."
              style="width:100%;padding:4px 6px;border-radius:4px;border:1px solid #334155;background:#1e293b;color:#f8fafc;font-size:11px;" />
          </div>`;
      });

      if (data && data.notifiedCount > 0) {
        html += `<div style="color:#4ade80;font-weight:bold;margin-top:4px;">✅ ${data.notifiedCount} enviado(s) p/ ${tec ? tec.nome : 'WhatsApp'}!</div>`;
      } else if (data && data.importedCount > 0) {
        html += `<div style="color:#fbbf24;margin-top:4px;">📥 ${data.importedCount} novo(s) salvo(s)!</div>`;
      } else {
        html += `<div style="color:#94a3b8;margin-top:4px;">✔️ Você pode editar o título acima e clicar em <strong>📲 Enviar</strong>.</div>`;
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

  document.getElementById('tb-scan-now').onclick = () => scanAndSend(false, null);

  autoBtn.onclick = () => {
    if (timer) {
      clearInterval(timer);
      timer = null;
      autoBtn.textContent = '▶️ Auto (15s)';
      autoBtn.style.background = '#16a34a';
    } else {
      scanAndSend(false, null);
      timer = setInterval(() => scanAndSend(false, null), 15000);
      autoBtn.textContent = '⏹️ Parar Auto';
      autoBtn.style.background = '#dc2626';
    }
  };

  loadTecnicos();
})();
