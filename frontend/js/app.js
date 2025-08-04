function login(email, password) {
  if (email === 'admin@corequeue.local' && password === 'admin123') {
    localStorage.setItem('role', 'technician');
    return '/Dashboard/dashboard';
  }
  if (email.endsWith('@tech.com') && password === 'tech123') {
    localStorage.setItem('role', 'technician');
    return '/Dashboard/dashboard';
  }
  if (password === 'customer123') {
    localStorage.setItem('role', 'customer');
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
  org.contacts.push(contact);
  saveOrganisations(orgs);
}

function updateContact(orgId, index, contact) {
  const orgs = getOrganisations();
  const org = orgs.find(o => o.id === orgId);
  if (!org || index < 0 || index >= org.contacts.length) return;
  org.contacts[index] = contact;
  saveOrganisations(orgs);
}

function archiveOrganisation(id) {
  updateOrganisation(id, { archived: true });
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
