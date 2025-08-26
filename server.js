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
      adminPassword: 'admin123'
    }, null, 2));
  }
  if (!fs.existsSync(CF_TOKEN_FILE)) fs.writeFileSync(CF_TOKEN_FILE, '');
  if (!fs.existsSync(MAIL_FILE)) {
    fs.writeFileSync(MAIL_FILE, JSON.stringify({
      address: 'service@techfusion-it.com',
      tenantId: '',
      clientId: '',
      clientSecret: ''
    }, null, 2));
  }
}

ensureDataFile();

async function fetchIncomingMail() {
  const cfg = getMailConfig();
  if (!cfg.tenantId || !cfg.clientId || !cfg.clientSecret || !cfg.address) return [];
  try {
    const token = await getGraphToken(cfg);
    const msgRes = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(cfg.address)}/mailFolders('Inbox')/messages?$top=10&$select=id,subject,from,body,hasAttachments`, { headers: { Authorization: `Bearer ${token}` } });
    if (!msgRes.ok) {
      const text = await msgRes.text();
      console.error('mail fetch failed', msgRes.status, text);
      return [];
    }
    const msgData = await msgRes.json();
    const messages = msgData.value || [];
    const emails = [];
    for (const m of messages) {
      const email = {
        id: m.id,
        subject: m.subject,
        from: (m.from && m.from.emailAddress && m.from.emailAddress.address) || '',
        body: (m.body && m.body.content) || '',
        attachments: []
      };
      if (m.hasAttachments) {
        const attRes = await fetch(
          `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(cfg.address)}/messages/${m.id}/attachments`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (attRes.ok) {
          const attData = await attRes.json();
          (attData.value || []).forEach(a => {
            email.attachments.push({
              name: a.name,
              data: `data:${a.contentType};base64,${a.contentBytes}`
            });
          });
        }
      }
      emails.push(email);
      await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(cfg.address)}/messages/${m.id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ isRead: true })
      });
    }
    const store = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    store.incomingEmails = store.incomingEmails || [];
    emails.forEach(e => {
      if (!store.incomingEmails.find(x => x.id === e.id)) store.incomingEmails.push(e);
    });
    fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2));
    return emails;
  } catch (e) {
    console.error('mail fetch failed', e);
    return [];
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
  fs.writeFile(DATA_FILE, JSON.stringify(req.body || {}, null, 2), err => {
    if (err) return res.status(500).json({ error: 'write_failed' });
    res.json({ status: 'ok' });
  });
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
  try {
    const raw = fs.readFileSync(MAIL_FILE, 'utf8');
    return JSON.parse(raw);
  } catch {
    return { address: '', tenantId: '', clientId: '', clientSecret: '' };
  }
}

async function getGraphToken(cfg) {
  const params = new URLSearchParams();
  params.append('client_id', cfg.clientId);
  params.append('scope', 'https://graph.microsoft.com/.default');
  params.append('client_secret', cfg.clientSecret);
  params.append('grant_type', 'client_credentials');
  const res = await fetch(`https://login.microsoftonline.com/${cfg.tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    body: params
  });
  const data = await res.json();
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
  const cfg = getMailConfig();
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
        toRecipients: [{ emailAddress: { address: body.to } }],
        ccRecipients: body.cc ? [{ emailAddress: { address: body.cc } }] : [],
        bccRecipients: body.bcc ? [{ emailAddress: { address: body.bcc } }] : []
      }
    };
    await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(cfg.address)}/sendMail`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(msg)
    });
    res.json({ status: 'sent' });
  } catch (e) {
    console.error('mail send failed', e);
    res.status(500).json({ error: 'mail_send_failed' });
  }
});

app.post('/api/mail/test', async (req, res) => {
  const cfg = getMailConfig();
  if (!cfg.tenantId || !cfg.clientId || !cfg.clientSecret || !cfg.address) {
    return res.status(400).json({ error: 'mail_not_configured' });
  }
  try {
    const token = await getGraphToken(cfg);
    const msg = {
      message: {
        subject: 'CoreQueue Mail Test',
        body: { contentType: 'HTML', content: '<p>This is a CoreQueue test email.</p>' },
        toRecipients: [{ emailAddress: { address: cfg.address } }]
      }
    };
    await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(cfg.address)}/sendMail`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(msg)
    });
    // give the service a moment and pull new mail
    await new Promise(r => setTimeout(r, 2000));
    const emails = await fetchIncomingMail();
    res.json({ status: 'sent', fetched: emails.length });
  } catch (e) {
    console.error('mail test failed', e);
    res.status(500).json({ error: 'mail_test_failed' });
  }
});

app.use(express.static(path.join(__dirname, 'frontend'), { extensions: ['html'] }));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'login.html'));
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`CoreQueue server listening on ${port}`));
