const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'storage.json');

app.use(express.json({limit: '1mb'}));

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({
      accounts: [],
      organisations: [],
      tickets: [],
      nextTicketId: 1,
      nextOrgId: 1,
      adminPassword: 'admin123'
    }, null, 2));
  }
}

ensureDataFile();

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

app.use(express.static(path.join(__dirname, 'frontend'), { extensions: ['html'] }));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'login.html'));
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`CoreQueue server listening on ${port}`));
