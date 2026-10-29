chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const baseUrl = String(request.serverUrl || 'http://localhost:3000').replace(/\/+$/, '');

  if (request.action === 'IMPORT_TICKETS') {
    fetch(`${baseUrl}/api/import-tickets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request.payload)
    })
      .then(res => res.json())
      .then(data => sendResponse({ ok: true, data }))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (request.action === 'GET_TECNICOS') {
    fetch(`${baseUrl}/api/tecnicos`)
      .then(res => res.json())
      .then(data => sendResponse({ ok: true, data }))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (request.action === 'ADD_TECNICO') {
    fetch(`${baseUrl}/api/tecnicos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request.payload)
    })
      .then(res => res.json())
      .then(data => sendResponse({ ok: true, data }))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (request.action === 'DELETE_TECNICO') {
    fetch(`${baseUrl}/api/tecnicos/${request.id}`, {
      method: 'DELETE'
    })
      .then(res => res.json())
      .then(data => sendResponse({ ok: true, data }))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true;
  }
});
