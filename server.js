require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const fetch = require('node-fetch');

const app = express();
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'storage.json');
const CF_TOKEN_FILE = path.join(DATA_DIR, 'cloudflare-token');
const MAIL_FILE = path.join(DATA_DIR, 'mail.json');
const DEFAULT_GRAPH_API = 'https://graph.microsoft.com/v1.0';
const GRAPH_SCOPE = 'https://graph.microsoft.com/.default';
const MAX_TRACKED_MESSAGE_IDS = 200;

let mailFetchLock = false;

app.use(express.json({limit: '1mb'}));

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({
      accounts: [],
      organisations: [],
      tickets: [],
      incomingEmails: [],
      nextTicketId: 1,
      nextOrgId: 1,
      adminPassword: 'admin123',
      mailSync: {
        lastReceivedDate: null,
        processedIds: []
      }
    }, null, 2));
  } else {
    try {
      const store = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      let updated = false;
      if (!Array.isArray(store.incomingEmails)) {
        store.incomingEmails = [];
        updated = true;
      }
      if (!store.mailSync || typeof store.mailSync !== 'object') {
        store.mailSync = {
          lastReceivedDate: store.lastMailSync || null,
          processedIds: []
        };
        updated = true;
      }
      if (!Array.isArray(store.mailSync.processedIds)) {
        store.mailSync.processedIds = [];
        updated = true;
      }
      if ('lastMailSync' in store) {
        delete store.lastMailSync;
        updated = true;
      }
      if (updated) {
        fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2));
      }
    } catch {}
  }
  if (!fs.existsSync(CF_TOKEN_FILE)) fs.writeFileSync(CF_TOKEN_FILE, '');
  if (!fs.existsSync(MAIL_FILE)) {
    fs.writeFileSync(MAIL_FILE, JSON.stringify({
      address: '',
      tenantId: '',
      clientId: '',
      clientSecret: ''
    }, null, 2));
  }
}

ensureDataFile();

function loadStore() {
  ensureDataFile();
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return {
      accounts: [],
      organisations: [],
      tickets: [],
      incomingEmails: [],
      nextTicketId: 1,
      nextOrgId: 1,
      adminPassword: 'admin123',
      mailSync: { lastReceivedDate: null, processedIds: [] }
    };
  }
}

function saveStore(store) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2));
}

function ensureMailState(store) {
  if (!Array.isArray(store.incomingEmails)) store.incomingEmails = [];
  if (!store.mailSync || typeof store.mailSync !== 'object') {
    store.mailSync = { lastReceivedDate: null, processedIds: [] };
  }
  if (!Array.isArray(store.mailSync.processedIds)) {
    store.mailSync.processedIds = [];
  }
}

async function fetchIncomingMail() {
  if (mailFetchLock) return [];
  mailFetchLock = true;
  try {
    const cfg = normalizeMailSettings(getMailConfig());
    if (!cfg.tenantId || !cfg.clientId || !cfg.clientSecret || !cfg.address) return [];

    const store = loadStore();
    ensureMailState(store);

    const token = await getGraphToken(cfg);
    const base = cfg.graphApi;
    const mailboxPath = encodeURIComponent(cfg.address);
    const since = store.mailSync.lastReceivedDate;

    const headers = {
      Authorization: `Bearer ${token}`,
      Prefer: 'outlook.body-content-type="html"',
      ConsistencyLevel: 'eventual'
    };

    const collected = [];
    const processed = new Set(store.mailSync.processedIds || []);

    const initialUrl = new URL(`${base}/users/${mailboxPath}/mailFolders/Inbox/messages`);
    initialUrl.searchParams.set('$top', '50');
    initialUrl.searchParams.set('$orderby', 'receivedDateTime asc');
    initialUrl.searchParams.set('$select', 'id,subject,from,body,bodyPreview,hasAttachments,receivedDateTime,isRead');
    if (since) {
      initialUrl.searchParams.set('$filter', `(isRead eq false) and receivedDateTime gt ${since}`);
    } else {
      initialUrl.searchParams.set('$filter', 'isRead eq false');
    }

    let nextUrl = initialUrl.toString();

    while (nextUrl) {
      const res = await fetch(nextUrl, { headers });
      if (!res.ok) {
        const text = await res.text();
        console.error('mail fetch failed', res.status, text);
        break;
      }
      const data = await res.json();
      const messages = Array.isArray(data.value) ? data.value : [];
      for (const m of messages) {
        if (!m || !m.id || processed.has(m.id)) continue;
        const fromAddress = (m.from && m.from.emailAddress && m.from.emailAddress.address) || '';
        const email = {
          id: m.id,
          subject: m.subject || '(no subject)',
          from: fromAddress,
          body: (m.body && m.body.content) || m.bodyPreview || '',
          receivedDateTime: m.receivedDateTime || null,
          attachments: []
        };

        if (m.hasAttachments) {
          try {
            const attachmentUrl = `${base}/users/${mailboxPath}/messages/${encodeURIComponent(m.id)}/attachments?$select=id,name,contentType,contentBytes,size`;
            const attRes = await fetch(attachmentUrl, { headers: { Authorization: `Bearer ${token}` } });
            if (attRes.ok) {
              const attData = await attRes.json();
              (attData.value || []).forEach(a => {
                if (!a || !a.name || !a.contentBytes) return;
                email.attachments.push({
                  name: a.name,
                  data: `data:${a.contentType || 'application/octet-stream'};base64,${a.contentBytes}`
                });
              });
            } else {
              const errText = await attRes.text();
              console.error('attachment fetch failed', attRes.status, errText);
            }
          } catch (err) {
            console.error('attachment fetch failed', err);
          }
        }

        collected.push(email);
        processed.add(m.id);

        if (email.receivedDateTime) {
          const current = store.mailSync.lastReceivedDate ? new Date(store.mailSync.lastReceivedDate) : null;
          const candidate = new Date(email.receivedDateTime);
          if (!current || candidate > current) {
            store.mailSync.lastReceivedDate = candidate.toISOString();
          }
        }

        try {
          await fetch(`${base}/users/${mailboxPath}/messages/${encodeURIComponent(m.id)}`, {
            method: 'PATCH',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ isRead: true })
          });
        } catch (err) {
          console.error('mark read failed', err);
        }
      }

      if (collected.length >= MAX_TRACKED_MESSAGE_IDS) break;
      nextUrl = data['@odata.nextLink'] || '';
    }

    if (!collected.length) return [];

    const existingQueue = Array.isArray(store.incomingEmails) ? store.incomingEmails : [];
    collected.forEach(email => {
      if (!existingQueue.find(x => x.id === email.id)) existingQueue.push(email);
    });
    existingQueue.sort((a, b) => {
      const aDate = a.receivedDateTime ? new Date(a.receivedDateTime).getTime() : 0;
      const bDate = b.receivedDateTime ? new Date(b.receivedDateTime).getTime() : 0;
      return bDate - aDate;
    });
    store.incomingEmails = existingQueue;

    const combined = [...(store.mailSync.processedIds || []), ...collected.map(e => e.id)];
    const deduped = [];
    combined.forEach(id => {
      if (!deduped.includes(id)) deduped.push(id);
    });
    store.mailSync.processedIds = deduped.slice(-MAX_TRACKED_MESSAGE_IDS);

    saveStore(store);
    return collected;
  } catch (e) {
    console.error('mail fetch failed', e);
    return [];
  } finally {
    mailFetchLock = false;
  }
}

setInterval(fetchIncomingMail, 60 * 1000);
fetchIncomingMail();

app.get('/api/storage', (req, res) => {
  fs.readFile(DATA_FILE, 'utf8', (err, data) => {
    if (err) return res.json({});
    try {
      res.json(JSON.parse(data || '{}'));
    } catch {
      res.json({});
    }
  });
});

app.post('/api/storage', (req, res) => {
  try {
    const incoming = req.body || {};
    const current = loadStore();
    const next = { ...current };
    const replaceKeys = ['accounts', 'organisations', 'tickets', 'incomingEmails', 'nextTicketId', 'nextOrgId', 'adminPassword'];
    replaceKeys.forEach(key => {
      if (key in incoming) {
        next[key] = incoming[key];
      }
    });
    if ('mailSync' in incoming) {
      const incomingMailSync = incoming.mailSync || {};
      next.mailSync = Object.assign({}, current.mailSync || { lastReceivedDate: null, processedIds: [] }, incomingMailSync);
      if (!Array.isArray(next.mailSync.processedIds)) {
        next.mailSync.processedIds = [];
      }
      if (next.mailSync.processedIds.length > MAX_TRACKED_MESSAGE_IDS) {
        next.mailSync.processedIds = next.mailSync.processedIds.slice(-MAX_TRACKED_MESSAGE_IDS);
      }
    }
    ensureMailState(next);
    fs.writeFile(DATA_FILE, JSON.stringify(next, null, 2), err => {
      if (err) return res.status(500).json({ error: 'write_failed' });
      res.json({ status: 'ok' });
    });
  } catch (e) {
    console.error('storage sync failed', e);
    res.status(500).json({ error: 'write_failed' });
  }
});

app.get('/api/cloudflare', (req, res) => {
  let token = '';
  try { token = fs.readFileSync(CF_TOKEN_FILE, 'utf8').trim(); } catch {}
  let status = 'unknown';
  let enabled = false;
  try { status = execSync('systemctl is-active corequeue-cloudflared.service').toString().trim(); }
  catch { status = 'inactive'; }
  try { enabled = execSync('systemctl is-enabled corequeue-cloudflared.service').toString().trim() === 'enabled'; }
  catch { enabled = false; }
  res.json({ token, status, enabled });
});

app.post('/api/cloudflare', (req, res) => {
  const body = req.body || {};
  let token = '';
  try { token = fs.readFileSync(CF_TOKEN_FILE, 'utf8').trim(); } catch {}
  if (typeof body.token === 'string') {
    token = body.token.trim();
    try { fs.writeFileSync(CF_TOKEN_FILE, token); } catch {}
  }
  const reset = () => { try { execSync('systemctl reset-failed corequeue-cloudflared.service'); } catch {} };
  if (body.enable === true) {
    if (!token) return res.status(400).json({ error: 'missing_token' });
    reset();
    try {
      execSync('systemctl enable corequeue-cloudflared.service');
      execSync('systemctl start corequeue-cloudflared.service');
    } catch {}
  } else if (body.enable === false) {
    try {
      execSync('systemctl stop corequeue-cloudflared.service');
      execSync('systemctl disable corequeue-cloudflared.service');
    } catch {}
  } else if (typeof body.token === 'string') {
    if (token) {
      reset();
      try { execSync('systemctl restart corequeue-cloudflared.service'); } catch {}
    }
  }
  let status = 'unknown';
  let enabled = false;
  try { status = execSync('systemctl is-active corequeue-cloudflared.service').toString().trim(); }
  catch { status = 'inactive'; }
  try { enabled = execSync('systemctl is-enabled corequeue-cloudflared.service').toString().trim() === 'enabled'; }
  catch { enabled = false; }
  res.json({ status, enabled });
});

function getMailConfig() {
  const cfg = { address: '', tenantId: '', clientId: '', clientSecret: '', graphApi: DEFAULT_GRAPH_API, tokenEndpoint: '' };
  try {
    Object.assign(cfg, JSON.parse(fs.readFileSync(MAIL_FILE, 'utf8')));
  } catch {}
  if (!cfg.address && process.env.SHARED_MAILBOX_UPN) cfg.address = process.env.SHARED_MAILBOX_UPN;
  if (!cfg.tenantId && process.env.TENANT_ID) cfg.tenantId = process.env.TENANT_ID;
  if (!cfg.clientId && process.env.CLIENT_ID) cfg.clientId = process.env.CLIENT_ID;
  if (!cfg.clientSecret && process.env.CLIENT_SECRET) cfg.clientSecret = process.env.CLIENT_SECRET;
  if (!cfg.graphApi && process.env.GRAPH_API) cfg.graphApi = process.env.GRAPH_API;
  if (!cfg.tokenEndpoint && process.env.TOKEN_ENDPOINT) cfg.tokenEndpoint = process.env.TOKEN_ENDPOINT;
  return cfg;
}

function normalizeMailSettings(cfg) {
  const normalized = { ...cfg };
  normalized.address = (cfg.address || '').trim();
  normalized.tenantId = (cfg.tenantId || '').trim();
  normalized.clientId = (cfg.clientId || '').trim();
  normalized.clientSecret = (cfg.clientSecret || '').trim();
  normalized.graphApi = ((cfg.graphApi || '').trim()) || DEFAULT_GRAPH_API;
  normalized.tokenEndpoint = (cfg.tokenEndpoint || '').trim();
  return normalized;
}

async function getGraphToken(cfg) {
  const params = new URLSearchParams();
  params.append('client_id', cfg.clientId);
  params.append('scope', GRAPH_SCOPE);
  params.append('client_secret', cfg.clientSecret);
  params.append('grant_type', 'client_credentials');
  const tokenUrl = cfg.tokenEndpoint || `https://login.microsoftonline.com/${cfg.tenantId}/oauth2/v2.0/token`;
  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`token_request_failed: ${text}`);
  }
  const data = await res.json();
  if (!data.access_token) {
    throw new Error(data.error_description || 'no_access_token');
  }
  return data.access_token;
}

app.get('/api/mail/config', (req, res) => {
  res.json(getMailConfig());
});

app.post('/api/mail/config', (req, res) => {
  const cfg = Object.assign(getMailConfig(), req.body || {});
  fs.writeFile(MAIL_FILE, JSON.stringify(cfg, null, 2), err => {
    if (err) return res.status(500).json({ error: 'write_failed' });
    res.json({ status: 'ok' });
  });
});

app.get('/api/mail/fetch', async (req, res) => {
  const emails = await fetchIncomingMail();
  res.json(emails);
});

app.post('/api/mail/send', async (req, res) => {
  const cfg = normalizeMailSettings(getMailConfig());
  if (!cfg.tenantId || !cfg.clientId || !cfg.clientSecret || !cfg.address) {
    return res.status(400).json({ error: 'mail_not_configured' });
  }
  const body = req.body || {};
  if (!body.to || !body.subject || !body.body) return res.status(400).json({ error: 'missing_fields' });
  try {
    const token = await getGraphToken(cfg);
    const msg = {
      message: {
        subject: body.subject,
        body: { contentType: 'HTML', content: body.body },
        from: { emailAddress: { address: cfg.address } },
        sender: { emailAddress: { address: cfg.address } },
        toRecipients: [{ emailAddress: { address: body.to } }],
        ccRecipients: body.cc ? [{ emailAddress: { address: body.cc } }] : [],
        bccRecipients: body.bcc ? [{ emailAddress: { address: body.bcc } }] : []
      },
      saveToSentItems: true
    };
    const base = cfg.graphApi;
    const sendRes = await fetch(
      `${base}/users/${encodeURIComponent(cfg.address)}/sendMail`,
      {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify(msg)
      }
    );
    if (!sendRes.ok) {
      let details = await sendRes.text();
      try { details = JSON.parse(details); } catch {}
      console.error('mail send failed', sendRes.status, details);
      if (details && details.error &&
          (details.error.code === 'ErrorAccessDenied' || details.error.code === 'AccessDenied')) {
        const msg = details.error.message || 'access_denied';
        return res.status(403).json({ error: 'mail_access_denied', details: msg });
      }
      if (details && details.error && details.error.message) {
        details = details.error.message;
      } else if (typeof details === 'object') {
        details = JSON.stringify(details);
      }
      return res.status(500).json({ error: 'mail_send_failed', details });
    }
    res.json({ status: 'sent' });
  } catch (e) {
    console.error('mail send failed', e);
    res.status(500).json({ error: 'mail_send_failed', details: e.message });
  }
});

app.post('/api/mail/test', async (req, res) => {
  const cfg = normalizeMailSettings(getMailConfig());
  if (!cfg.tenantId || !cfg.clientId || !cfg.clientSecret || !cfg.address) {
    return res.status(400).json({ error: 'mail_not_configured' });
  }
  try {
    const token = await getGraphToken(cfg);
    const msg = {
      message: {
        subject: 'CoreQueue Mail Test',
        body: { contentType: 'HTML', content: '<p>This is a CoreQueue test email.</p>' },
        from: { emailAddress: { address: cfg.address } },
        sender: { emailAddress: { address: cfg.address } },
        toRecipients: [{ emailAddress: { address: cfg.address } }]
      },
      saveToSentItems: false
    };
    const base = cfg.graphApi;
    const sendRes = await fetch(
      `${base}/users/${encodeURIComponent(cfg.address)}/sendMail`,
      {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify(msg)
      }
    );
    if (!sendRes.ok) {
      let details = await sendRes.text();
      try { details = JSON.parse(details); } catch {}
      console.error('mail test send failed', sendRes.status, details);
      if (details && details.error &&
          (details.error.code === 'ErrorAccessDenied' || details.error.code === 'AccessDenied')) {
        const msg = details.error.message || 'access_denied';
        return res.status(403).json({ error: 'mail_access_denied', details: msg });
      }
      if (details && details.error && details.error.message) {
        details = details.error.message;
      } else if (typeof details === 'object') {
        details = JSON.stringify(details);
      }
      return res.status(500).json({ error: 'mail_test_failed', details });
    }
    // give the service a moment and pull new mail
    await new Promise(r => setTimeout(r, 5000));
    const emails = await fetchIncomingMail();
    res.json({ status: 'sent', fetched: emails.length });
  } catch (e) {
    console.error('mail test failed', e);
    res.status(500).json({ error: 'mail_test_failed', details: e.message });
  }
});

app.use(express.static(path.join(__dirname, 'frontend'), { extensions: ['html'] }));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'login.html'));
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`CoreQueue server listening on ${port}`));
