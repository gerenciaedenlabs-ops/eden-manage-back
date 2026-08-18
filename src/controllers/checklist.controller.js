import { Router } from "express";
import { getConnection } from "../database/connection.js";
import { logger } from "../config/logger.js";
import { env } from "../config/env.js";

export const checklistRouter = Router();

const TABLE = "task_checklist_items";

// ======================== PUT (editar label / togglear is_checked) ========================
checklistRouter.put("/:id", async (req, res) => {
    const { id } = req.params;
    const { label, is_checked } = req.body;

    if (label === undefined && is_checked === undefined) {
        return res.status(400).json({
            status: "error",
            message: "Datos incompletos: se requiere label o is_checked"
        });
    }

    let conn;

    try {
        conn = await getConnection();
        const db = env.db.database;

        const fields = [];
        const values = [];

        if (label !== undefined) {
            fields.push("label = ?");
            values.push(label);
        }

        if (is_checked !== undefined) {
            fields.push("is_checked = ?");
            values.push(is_checked ? 1 : 0);
        }

        values.push(id);

        const query = `UPDATE ${db}.${TABLE} SET ${fields.join(", ")} WHERE id = ?;`;

        const [result] = await conn.query(query, values);

        if (result.affectedRows === 0) {
            return res.status(404).json({
                status: "error",
                message: "No se encontró el registro a actualizar"
            });
        }

        return res.json({
            status: "ok",
            message: "Item de checklist actualizado con éxito"
        });

    } catch (error) {
        logger.error("Error actualizando checklist item:", error);

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
checklistRouter.delete("/:id", async (req, res) => {
    const { id } = req.params;

    let conn;

    try {
        conn = await getConnection();
        const db = env.db.database;

        const query = `DELETE FROM ${db}.${TABLE} WHERE id = ?;`;

        const [result] = await conn.query(query, [id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({
                status: "error",
                message: "No se encontró el registro a eliminar"
            });
        }

        return res.json({
            status: "ok",
            message: "Item de checklist eliminado con éxito"
        });

    } catch (error) {
        logger.error("Error eliminando checklist item:", error);

        return res.status(500).json({
            status: "error",
            message: "Error interno del servidor",
            error: error.message
        });

    } finally {
        if (conn) conn.release();
    }
});
