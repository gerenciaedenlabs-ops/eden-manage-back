import { getConnection } from "../database/connection.js";
import { env } from "../config/env.js";

// Mismo criterio que usa el frontend para decidir isAdmin (role=4 "administradores"
// o department=2 "TI Admin"), pero aplicado del lado del servidor — debe ir después de
// authMiddleware, que ya dejó req.user.id disponible a partir del token.
const ADMIN_ROLE_ID = 4;
const ADMIN_DEPARTMENT_ID = 2;

export const requireAdmin = async (req, res, next) => {
    const userId = req.user?.id;

    if (!userId) {
        return res.status(401).json({ status: "error", message: "No autorizado" });
    }

    let conn;

    try {
        conn = await getConnection();
        const db = env.db.database;

        const [[user]] = await conn.query(
            `SELECT role, department FROM ${db}.users WHERE id = ?`,
            [userId]
        );

        const isAdmin = !!user && (user.role === ADMIN_ROLE_ID || user.department === ADMIN_DEPARTMENT_ID);

        if (!isAdmin) {
            return res.status(403).json({ status: "error", message: "No tienes permisos de administrador" });
        }

        next();
    } catch (error) {
        return res.status(500).json({ status: "error", message: "Error verificando permisos", error: error.message });
    } finally {
        if (conn) conn.release();
    }
};
