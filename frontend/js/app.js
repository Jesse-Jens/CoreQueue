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
