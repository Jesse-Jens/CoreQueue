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
  ticket.notes.push({ type, message, time: new Date().toISOString() });
  saveTickets(tickets);
}

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
