function login(email, password) {
  if (email === 'admin@corequeue.local' && password === 'admin123') {
    localStorage.setItem('role', 'technician');
    return '/Dashboard/Dashboard.html';
  }
  if (email.endsWith('@tech.com') && password === 'tech123') {
    localStorage.setItem('role', 'technician');
    return '/Dashboard/Dashboard.html';
  }
  if (password === 'customer123') {
    localStorage.setItem('role', 'customer');
    return '/Dashboard/Customer_Dashboard.html';
  }
  return null;
}

function signOut() {
  localStorage.removeItem('role');
  window.location.href = '/Login.html';
}

function requireLogin(roleRequired) {
  const role = localStorage.getItem('role');
  if (!role) {
    window.location.href = '/Login.html';
    return false;
  }
  if (roleRequired && role !== roleRequired) {
    window.location.href = role === 'technician'
      ? '/Dashboard/Dashboard.html'
      : '/Dashboard/Customer_Dashboard.html';
    return false;
  }
  return true;
}
