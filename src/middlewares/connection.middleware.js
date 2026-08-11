import { getConnection } from "../database/connection.js";

export const connectionMiddleware = async (req, res, next) => {
    try {
        const conn = getConnection();
        if (!conn) throw new Error("Sin conexión a la base de datos");
        next();
    } catch (error) {
        res.status(503).json({
            success: false,
            message: "Servicio temporalmente no disponible",
        });
    }
};
