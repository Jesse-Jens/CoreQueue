loadServerStorage();

// global sets of available ticket statuses and priorities
// used to populate filter dropdowns independent of current tickets
const ALL_STATUSES = ['Open', 'In Progress', 'Awaiting Customer', 'Awaiting Technician', 'Awaiting External Provider', 'Resolved', 'Archived'];
const ALL_PRIORITIES = ['Critical', 'High', 'Medium', 'Low'];

function loadServerStorage() {
  try {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', '/api/storage', false);
    xhr.send(null);
    if (xhr.status === 200 && xhr.responseText) {
      const data = JSON.parse(xhr.responseText || '{}');
      ['accounts','organisations','tickets','incomingEmails','nextTicketId','nextOrgId','adminPassword'].forEach(key => {
        if (key in data) {
          const val = data[key];
          if (val !== undefined) {
            localStorage.setItem(key, typeof val === 'object' ? JSON.stringify(val) : String(val));
          }
        }
      });
    }
  } catch (e) {
    console.error('Failed to load server storage', e);
  }
}

function syncServerStorage() {
  try {
    const keys = ['accounts','organisations','tickets','incomingEmails','nextTicketId','nextOrgId','adminPassword'];
    const data = {};
    keys.forEach(key => {
      const raw = localStorage.getItem(key);
      if (raw !== null) {
        try {
          data[key] = JSON.parse(raw);
        } catch {
          data[key] = raw;
        }
      }
    });
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/storage', false);
    xhr.setRequestHeader('Content-Type', 'application/json');
    try {
      xhr.send(JSON.stringify(data));
    } catch (err) {
      console.error('Failed to sync storage', err);
    }
  } catch (e) {
    console.error('Failed to gather storage', e);
  }
}

function login(email, password) {
  const normalEmail = email.trim().toLowerCase();
  const pwd = password.trim();
  const adminPassword = localStorage.getItem('adminPassword') || 'admin123';
  if (normalEmail === 'admin@corequeue.local' && pwd === adminPassword) {
    localStorage.setItem('role', 'technician');
    localStorage.setItem('userEmail', normalEmail);
    return '/Dashboard/dashboard';
  }
  let account = findAccount(normalEmail);
  if (!account) {
    const orgs = getOrganisations();
    const linked = [];
    orgs.forEach(org => {
      (org.contacts || []).forEach(c => {
        if ((c.email || '').trim().toLowerCase() === normalEmail && (c.portalAccess || c.password)) {
          linked.push({ orgId: org.id, role: c.role || 'customer', name: c.name || '', password: c.password });
        }
      });
    });
    if (linked.length > 0) {
      const pass = linked[0].password || pwd;
      if (!linked[0].password || linked[0].password === pwd) {
        account = { email: normalEmail, password: pass, name: linked[0].name, organisations: linked.map(l => ({ id: l.orgId, role: l.role })), blocked: false };
        const accounts = getAccounts();
        accounts.push(account);
        saveAccounts(accounts);
        if (!linked[0].password) updateContactPasswords(normalEmail, pass);
      }
    }
  }
  if (account && !account.blocked && account.password === pwd) {
    const globalRole = account.isTechnician ? 'technician' : 'customer';
    localStorage.setItem('role', globalRole);
    localStorage.setItem('userEmail', account.email);
    if (account.organisations && account.organisations.length > 0) {
      localStorage.setItem('currentOrg', account.organisations[0].id);
      localStorage.setItem('orgRole', account.organisations[0].role);
    } else {
      localStorage.removeItem('currentOrg');
      localStorage.removeItem('orgRole');
    }
    return globalRole === 'technician' ? '/Dashboard/dashboard' : '/Dashboard/customer_dashboard';
  }
  return null;
}

function signOut() {
  localStorage.removeItem('role');
  window.location.href = '/login';
}

function requireLogin(roleRequired) {
  const role = localStorage.getItem('role');
  if (!role) {
    window.location.href = '/login';
    return false;
  }
  if (roleRequired && role !== roleRequired) {
    if (roleRequired === 'customer' && role === 'technician') return true; // allow technicians to view customer pages
    window.location.href = role === 'technician'
      ? '/Dashboard/dashboard'
      : '/Dashboard/customer_dashboard';
    return false;
  }
  return true;
}

function applyTheme() {
  const theme = localStorage.getItem('theme') || 'dark';
  document.body.classList.toggle('light', theme === 'light');
  document.querySelectorAll('.theme-toggle').forEach(btn => {
    btn.textContent = theme === 'light' ? '🌙' : '☀️';
  });
  const select = document.getElementById('darkmode');
  if (select) select.value = theme;
}

function initTheme() {
  applyTheme();
  document.querySelectorAll('.theme-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const newTheme = document.body.classList.contains('light') ? 'dark' : 'light';
      localStorage.setItem('theme', newTheme);
      applyTheme();
    });
  });
  const select = document.getElementById('darkmode');
  if (select) {
    select.addEventListener('change', () => {
      localStorage.setItem('theme', select.value);
      applyTheme();
    });
  }
}

function getTickets() {
  return JSON.parse(localStorage.getItem('tickets') || '[]');
}

function saveTickets(tickets) {
  localStorage.setItem('tickets', JSON.stringify(tickets));
  syncServerStorage();
}

function getIncomingEmails() {
  return JSON.parse(localStorage.getItem('incomingEmails') || '[]');
}

function saveIncomingEmails(emails) {
  localStorage.setItem('incomingEmails', JSON.stringify(emails));
  syncServerStorage();
}

function removeIncomingEmail(id) {
  const emails = getIncomingEmails().filter(e => e.id !== id);
  saveIncomingEmails(emails);
}

function findOrganisationForEmail(email) {
  const domain = (email.split('@')[1] || '').toLowerCase();
  if (!domain) return null;
  const orgs = getOrganisations();
  for (const org of orgs) {
    for (const contact of org.contacts || []) {
      const cDomain = (contact.email || '').split('@')[1];
      if ((cDomain || '').toLowerCase() === domain) {
        return { orgId: org.id, contactEmail: contact.email, contactName: contact.name };
      }
    }
  }
  return null;
}

function createTicket(data) {
  const tickets = getTickets();
  const nextId = parseInt(localStorage.getItem('nextTicketId') || '1', 10);
  const id = String(nextId).padStart(5, '0');
  localStorage.setItem('nextTicketId', nextId + 1);
  const ticket = {
    id,
    status: 'Open',
    notes: [],
    inventory: [],
    timeLogs: [],
    files: [],
    created: new Date().toISOString(),
    ...data
  };
  tickets.push(ticket);
  saveTickets(tickets);
  return id;
}

function getTicket(id) {
  return getTickets().find(t => t.id === id);
}

function addNote(ticketId, note) {
  const tickets = getTickets();
  const ticket = tickets.find(t => t.id === ticketId);
  if (!ticket) return;
  note.time = new Date().toISOString();
  // store newest notes at the start so recent updates show first
  ticket.notes.unshift(note);
  saveTickets(tickets);
}

function addInventory(ticketId, record) {
  const tickets = getTickets();
  const ticket = tickets.find(t => t.id === ticketId);
  if (!ticket) return;
  ticket.inventory = ticket.inventory || [];
  ticket.inventory.push(record);
  saveTickets(tickets);
}

function addTimeLog(ticketId, log) {
  const tickets = getTickets();
  const ticket = tickets.find(t => t.id === ticketId);
  if (!ticket) return;
  ticket.timeLogs = ticket.timeLogs || [];
  log.time = new Date().toISOString();
  ticket.timeLogs.push(log);
  saveTickets(tickets);
}

function addTicketFile(ticketId, file) {
  const tickets = getTickets();
  const ticket = tickets.find(t => t.id === ticketId);
  if (!ticket) return;
  ticket.files = ticket.files || [];
  ticket.files.push(file);
  saveTickets(tickets);
}

function updateTicketFile(ticketId, index, data) {
  const tickets = getTickets();
  const ticket = tickets.find(t => t.id === ticketId);
  if (!ticket) return;
  if (!ticket.files) ticket.files = [];
  Object.assign(ticket.files[index], data);
  saveTickets(tickets);
}

function removeTicketFile(ticketId, index) {
  const tickets = getTickets();
  const ticket = tickets.find(t => t.id === ticketId);
  if (!ticket || !ticket.files) return;
  ticket.files.splice(index, 1);
  saveTickets(tickets);
}

function updateTicket(id, data) {
  const tickets = getTickets();
  const ticket = tickets.find(t => t.id === id);
  if (!ticket) return;
  Object.assign(ticket, data);
  saveTickets(tickets);
}

function currentUserName() {
  const email = localStorage.getItem('userEmail');
  if (email === 'admin@corequeue.local') return 'Admin';
  const account = findAccount(email || '');
  return (account && account.name) || email || 'User';
}

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function priorityWeight(p) {
  switch (p) {
    case 'Critical': return 4;
    case 'High': return 3;
    case 'Medium': return 2;
    case 'Low': return 1;
    default: return 0;
  }
}

function getOrganisations() {
  return JSON.parse(localStorage.getItem('organisations') || '[]');
}

function saveOrganisations(orgs) {
  localStorage.setItem('organisations', JSON.stringify(orgs));
  syncServerStorage();
}

function createOrganisation(data, contact) {
  const orgs = getOrganisations();
  const nextId = parseInt(localStorage.getItem('nextOrgId') || '1', 10);
  const id = String(nextId).padStart(5, '0');
  localStorage.setItem('nextOrgId', nextId + 1);
  if (contact) {
    contact.primary = true;
  }
  const org = {
    id,
    name: data.name,
    address: data.address || '',
    phone: data.phone || '',
    email: data.email || '',
    note: data.note || '',
    contacts: contact ? [contact] : [],
    archived: false,
    wiki: '',
    files: []
  };
  orgs.push(org);
  saveOrganisations(orgs);
  return id;
}

function getOrganisation(id) {
  return getOrganisations().find(o => o.id === id);
}

function updateOrganisation(id, data) {
  const orgs = getOrganisations();
  const org = orgs.find(o => o.id === id);
  if (!org) return;
  Object.assign(org, data);
  saveOrganisations(orgs);
}

function addContact(orgId, contact) {
  const orgs = getOrganisations();
  const org = orgs.find(o => o.id === orgId);
  if (!org) return;
  if (!org.contacts || org.contacts.length === 0) {
    contact.primary = true;
  } else {
    contact.primary = false;
  }
  org.contacts.push(contact);
  saveOrganisations(orgs);
}

function updateContact(orgId, index, contact) {
  const orgs = getOrganisations();
  const org = orgs.find(o => o.id === orgId);
  if (!org || index < 0 || index >= org.contacts.length) return;
  // preserve primary status unless explicitly set
  contact.primary = contact.primary || org.contacts[index].primary || false;
  org.contacts[index] = contact;
  saveOrganisations(orgs);
}

function removeContact(orgId, index) {
  const orgs = getOrganisations();
  const org = orgs.find(o => o.id === orgId);
  if (!org) return;
  if (org.contacts.length <= 1) return; // must have at least one contact
  const contact = org.contacts[index];
  if (contact && contact.primary) return; // cannot remove primary
  org.contacts.splice(index, 1);
  saveOrganisations(orgs);
  if (contact && contact.email) {
    unlinkAccount(contact.email, orgId);
  }
}

function unlinkAccount(email, orgId) {
  const accounts = getAccounts();
  const normalEmail = email.trim().toLowerCase();
  const idx = accounts.findIndex(a => a.email === normalEmail);
  if (idx === -1) return;
  const acc = accounts[idx];
  if (orgId && acc.organisations) {
    acc.organisations = acc.organisations.filter(o => o.id !== orgId);
  }
  if (!acc.organisations || acc.organisations.length === 0) {
    accounts.splice(idx, 1);
  }
  saveAccounts(accounts);
}

function archiveOrganisation(id) {
  updateOrganisation(id, { archived: true });
}

function unarchiveOrganisation(id) {
  updateOrganisation(id, { archived: false });
}

function addFile(orgId, file) {
  const orgs = getOrganisations();
  const org = orgs.find(o => o.id === orgId);
  if (!org) return;
  org.files = org.files || [];
  org.files.push(file);
  saveOrganisations(orgs);
}

function removeFile(orgId, index) {
  const orgs = getOrganisations();
  const org = orgs.find(o => o.id === orgId);
  if (!org || !org.files) return;
  org.files.splice(index, 1);
  saveOrganisations(orgs);
}

function renameFile(orgId, index, name) {
  const orgs = getOrganisations();
  const org = orgs.find(o => o.id === orgId);
  if (!org || !org.files || !org.files[index]) return;
  org.files[index].name = name;
  saveOrganisations(orgs);
}

function updateContactPasswords(email, password) {
  const normalEmail = email.trim().toLowerCase();
  const orgs = getOrganisations();
  let changed = false;
  orgs.forEach(org => {
    org.contacts.forEach(c => {
      if ((c.email || '').toLowerCase() === normalEmail) {
        c.password = password;
        changed = true;
      }
    });
  });
  if (changed) saveOrganisations(orgs);
}

function getAccounts() {
  return JSON.parse(localStorage.getItem('accounts') || '[]');
}

function saveAccounts(accounts) {
  localStorage.setItem('accounts', JSON.stringify(accounts));
  syncServerStorage();
}

function findAccount(email) {
  const normalEmail = email.trim().toLowerCase();
  return getAccounts().find(a => a.email === normalEmail);
}

function generatePassword(length = 8) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let pass = '';
  for (let i = 0; i < length; i++) {
    pass += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return pass;
}

function upsertAccount(email, password, name, orgId, role, blocked = false) {
  const normalEmail = (email || '').trim().toLowerCase();
  const accounts = getAccounts();
  let acc = accounts.find(a => a.email === normalEmail);
  if (!acc) {
    acc = { email: normalEmail, password: password || generatePassword(), name: name || '', organisations: [], blocked: !!blocked };
    accounts.push(acc);
  } else {
    if (password === null) {
      acc.password = generatePassword();
    } else if (password) {
      acc.password = password;
    }
    if (name) acc.name = name;
    acc.blocked = !!blocked;
  }
  if (orgId && role) {
    acc.organisations = acc.organisations || [];
    const existing = acc.organisations.find(o => o.id === orgId);
    if (existing) {
      existing.role = role;
    } else {
      acc.organisations.push({ id: orgId, role });
    }
  }
  saveAccounts(accounts);
  updateContactPasswords(normalEmail, acc.password);
  return acc.password;
}

function getInventory() {
  return JSON.parse(localStorage.getItem('inventory') || '[]');
}

function saveInventory(items) {
  localStorage.setItem('inventory', JSON.stringify(items));
  syncServerStorage();
}

function addInventoryItem(item) {
  const items = getInventory();
  items.push(item);
  saveInventory(items);
}

function updateInventoryItem(index, item) {
  const items = getInventory();
  items[index] = item;
  saveInventory(items);
}

function removeInventoryItem(index) {
  const items = getInventory();
  items.splice(index, 1);
  saveInventory(items);
}
