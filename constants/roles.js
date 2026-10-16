// Role definitions for multi-role access. The role lives on the user's
// Firestore document: users/{uid}.role  ->  'admin' | 'manager' | 'employee'

export const ROLES = Object.freeze({
  ADMIN: 'admin',
  MANAGER: 'manager',
  EMPLOYEE: 'employee',
});

export const ROLE_LABELS = Object.freeze({
  [ROLES.ADMIN]: 'Admin',
  [ROLES.MANAGER]: 'Manager',
  [ROLES.EMPLOYEE]: 'Employee',
});

// Where each role lands after login. Every role shares /home for now;
// point a role at its own screen here once the per-role views exist.
export const ROLE_HOME = Object.freeze({
  [ROLES.ADMIN]: '/home',
  [ROLES.MANAGER]: '/home',
  [ROLES.EMPLOYEE]: '/home',
});

// Accounts without a (valid) role fall back to the least-privileged role,
// so existing staff keep working and nobody is elevated by accident.
export const DEFAULT_ROLE = ROLES.EMPLOYEE;

export const normalizeRole = (value) => {
  const role = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return Object.values(ROLES).includes(role) ? role : DEFAULT_ROLE;
};

export const getHomeRoute = (role) => ROLE_HOME[normalizeRole(role)];

export const hasRole = (role, allowed) => {
  const list = Array.isArray(allowed) ? allowed : [allowed];
  return list.includes(normalizeRole(role));
};

// Permissions that views can check instead of comparing role names.
export const canManageOrders = (role) => hasRole(role, [ROLES.ADMIN, ROLES.MANAGER]);

// Employees only see orders they rang up. Older orders have no cashierUid,
// so fall back to the cashier name stored on the order.
export const canSeeOrder = (role, order, uid, name) => {
  if (canManageOrders(role)) return true;
  if (order.cashierUid) return order.cashierUid === uid;
  return !!name && order.cashierName === name;
};
