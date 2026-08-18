import { getConnection } from "../database/connection.js";
import { env } from "../config/env.js";
import { isAdminUser } from "../utils/permissions.js";

// Debe ir después de authMiddleware, que ya dejó req.user.id disponible a partir del token.
export const requireAdmin = async (req, res, next) => {
    const userId = req.user?.id;

    if (!userId) {
        return res.status(401).json({ status: "error", message: "No autorizado" });
    }

    let conn;

    try {
        conn = await getConnection();
        const db = env.db.database;

        const admin = await isAdminUser(conn, db, userId);

        if (!admin) {
            return res.status(403).json({ status: "error", message: "No tienes permisos de administrador" });
        }

        next();
    } catch (error) {
        return res.status(500).json({ status: "error", message: "Error verificando permisos", error: error.message });
    } finally {
        if (conn) conn.release();
    }
};
