// src/controllers/health2.controller.js
import { Router } from "express";
import { getConnection } from "../../database/connection.js";
import { logger } from "../../config/logger.js";

export const healthMySQLRouter = Router();

healthMySQLRouter.get("/", async (req, res) => {
    try {
        const conn = await getConnection();
        await conn.query("SELECT 1"); // simple ping
        conn.release();

        return res.json({
            status: "ok",
            message: "Conexión MySQL2 funcionando correctamente 🚀"
        });
    } catch (error) {
        logger.error("Error en health MySQL2:", error);
        return res.status(500).json({
            status: "error",
            message: "Fallo en la conexión MySQL2",
            error: error.message
        });
    }
});
