import { Router } from "express";
import { getConnection } from "../database/connection.js";
import { logger } from "../config/logger.js";
import { env } from "../config/env.js";

export const exampleRouter = Router();

// Nombre de la tabla unificada
const TABLE = "example";

// ======================== GET ========================
exampleRouter.get("/", async (req, res) => {
    let conn;

    try {
        conn = await getConnection();
        const db = env.db.database;

        const query = `
            SELECT * FROM ${db}.${TABLE}
        `;

        const [rows] = await conn.query(query);

        if (!rows || rows.length === 0) {
            return res.status(404).json({
                status: "error",
                message: "No se encontraron registros"
            });
        }

        return res.json({
            status: "ok",
            data: rows
        });

    } catch (error) {
        logger.error("Error en exampleRouter:", error);

        return res.status(500).json({
            status: "error",
            message: "Error interno del servidor",
            error: error.message
        });

    } finally {
        if (conn) conn.release();
    }
});

// ======================== POST ========================
exampleRouter.post("/", async (req, res) => {
    const { column1, column2 } = req.body;

    if (!column1 || !column2) {
        return res.status(400).json({
            status: "error",
            message: "Datos incompletos: se requiere column1 y column2"
        });
    }

    let conn;

    try {
        conn = await getConnection();
        const db = env.db.database;

        const query = `
            INSERT INTO ${db}.${TABLE} (column1, column2)
            VALUES (?, ?)
        `;

        await conn.query(query, [column1, column2]);

        return res.status(201).json({
            status: "ok",
            message: "Datos guardados con éxito 🚀"
        });

    } catch (error) {
        logger.error("Error guardando ModulePermissions:", error);

        return res.status(500).json({
            status: "error",
            message: "Error al guardar los datos",
            error: error.message
        });

    } finally {
        if (conn) conn.release();
    }
});

// ======================== PUT ========================
exampleRouter.put("/:id", async (req, res) => {
    const { id } = req.params;
    const { column1, column2 } = req.body;

    if (!id) {
        return res.status(400).json({
            status: "error",
            message: "El ID es requerido"
        });
    }

    if (!column1 || !column2) {
        return res.status(400).json({
            status: "error",
            message: "Datos incompletos: se requiere column1 y column2"
        });
    }

    let conn;

    try {
        conn = await getConnection();
        const db = env.db.database;

        const query = `
            UPDATE ${db}.${TABLE}
            SET column1 = ?, column2 = ?
            WHERE id = ?
        `;

        const [result] = await conn.query(query, [column1, column2, id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({
                status: "error",
                message: "No se encontró el registro a actualizar"
            });
        }

        return res.json({
            status: "ok",
            message: "Registro actualizado con éxito"
        });

    } catch (error) {
        logger.error("Error actualizando ModulePermissions:", error);

        return res.status(500).json({
            status: "error",
            message: "Error interno del servidor",
            error: error.message
        });

    } finally {
        if (conn) conn.release();
    }
});

// ======================== DELETE ========================
exampleRouter.delete("/:id", async (req, res) => {
    const { id } = req.params;

    if (!id) {
        return res.status(400).json({
            status: "error",
            message: "El ID es requerido"
        });
    }

    let conn;

    try {
        conn = await getConnection();
        const db = env.db.database;

        const query = `
            DELETE FROM ${db}.${TABLE}
            WHERE id = ?
        `;

        const [result] = await conn.query(query, [id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({
                status: "error",
                message: "No se encontró el registro a eliminar"
            });
        }

        return res.json({
            status: "ok",
            message: "Registro eliminado con éxito"
        });

    } catch (error) {
        logger.error("Error eliminando ModulePermissions:", error);

        return res.status(500).json({
            status: "error",
            message: "Error interno del servidor",
            error: error.message
        });

    } finally {
        if (conn) conn.release();
    }
});
