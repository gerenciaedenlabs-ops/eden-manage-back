// Mismo criterio de "admin" usado en todo el backend/frontend: role=4 (administradores)
// o department=2 (TI Admin). Centralizado aquí para no duplicar la query en cada
// middleware/controller que necesite verificarlo.
const ADMIN_ROLE_ID = 4;
const ADMIN_DEPARTMENT_ID = 2;

export const isAdminUser = async (conn, db, userId) => {
  if (!userId) return false;

  const [[user]] = await conn.query(
    `SELECT role, department FROM ${db}.users WHERE id = ?`,
    [userId]
  );

  return !!user && (user.role === ADMIN_ROLE_ID || user.department === ADMIN_DEPARTMENT_ID);
};
