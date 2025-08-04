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
        if ((c.email || '').trim().toLowerCase() === normalEmail) {
          linked.push({ orgId: org.id, role: c.role || 'customer', name: c.name || '', password: c.password });
        }
      });
    });
    if (linked.length > 0 && linked[0].password === pwd) {
      account = { email: normalEmail, password: pwd, name: linked[0].name, organisations: linked.map(l => ({ id: l.orgId, role: l.role })) };
      const accounts = getAccounts();
      accounts.push(account);
      saveAccounts(accounts);
    }
  }
  if (account && account.password === pwd) {
    localStorage.setItem('role', 'customer');
    localStorage.setItem('userEmail', account.email);
    if (account.organisations && account.organisations.length > 0) {
      localStorage.setItem('currentOrg', account.organisations[0].id);
      localStorage.setItem('orgRole', account.organisations[0].role);
    }
    return '/Dashboard/customer_dashboard';
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

function addNote(ticketId, type, message) {
  const tickets = getTickets();
  const ticket = tickets.find(t => t.id === ticketId);
  if (!ticket) return;
  // store newest notes at the start so recent updates show first
  ticket.notes.unshift({ type, message, time: new Date().toISOString() });
  saveTickets(tickets);
}

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function getOrganisations() {
  return JSON.parse(localStorage.getItem('organisations') || '[]');
}

function saveOrganisations(orgs) {
  localStorage.setItem('organisations', JSON.stringify(orgs));
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
  const acc = accounts.find(a => a.email === email.trim().toLowerCase());
  if (!acc || !acc.organisations) return;
  acc.organisations = acc.organisations.filter(o => o.id !== orgId);
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

function upsertAccount(email, password, name, orgId, role) {
  const normalEmail = (email || '').trim().toLowerCase();
  const accounts = getAccounts();
  let acc = accounts.find(a => a.email === normalEmail);
  if (!acc) {
    acc = { email: normalEmail, password: password || generatePassword(), name: name || '', organisations: [] };
    accounts.push(acc);
  } else {
    if (password) acc.password = password;
    if (name) acc.name = name;
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
