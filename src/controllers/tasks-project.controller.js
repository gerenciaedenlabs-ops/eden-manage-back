import { Router } from "express";
import { getConnection } from "../database/connection.js";
import { logger } from "../config/logger.js";
import { env } from "../config/env.js";

export const tasksRouter = Router();

const TABLE = "tasks";

// ======================== POST tarea ========================
tasksRouter.post("/", async (req, res) => {
    const { project_id, title, description, assigned_to, status } = req.body;

    if (!project_id || !title || !description || !assigned_to || !status) {
        return res.status(400).json({
            status: "error",
            message: "Datos incompletos: se requiere project_id, title, description, assigned_to y status"
        });
    }

    let conn;

    try {
        conn = await getConnection();
        const db = env.db.database;

        const query = `
      INSERT INTO ${db}.tasks (project_id, title, description, assigned_to, status) VALUES (?, ?, ?, ?, ?)
      `;

        await conn.query(query, [project_id, title, description, assigned_to, status]);

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
tasksRouter.put("/:id", async (req, res) => {
    const { id } = req.params;
    const { title, description, assigned_to } = req.body;

    if (!id) {
        return res.status(400).json({
            status: "error",
            message: "El ID es requerido"
        });
    }

    if (!title || !description || !assigned_to) {
        return res.status(400).json({
            status: "error",
            message: "Datos incompletos: se requiere title, description y assigned_to"
        });
    }

    let conn;

    try {
        conn = await getConnection();
        const db = env.db.database;

        const query = `
        UPDATE ${db}.${TABLE} SET title = ?, description = ?, assigned_to = ? WHERE id = ?;
        `;

        const [result] = await conn.query(query, [title, description, assigned_to, id]);

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

// ======================== PUT estado de la tarea ========================
tasksRouter.put("/state/:id", async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    if (!id) {
        return res.status(400).json({
            status: "error",
            message: "El ID es requerido"
        });
    }

    if (!status) {
        return res.status(400).json({
            status: "error",
            message: "Datos incompletos: se requiere status"
        });
    }

    let conn;

    try {
        conn = await getConnection();
        const db = env.db.database;

        const query = `
        UPDATE ${db}.tasks SET status = ? WHERE id = ?
        `;

        const [result] = await conn.query(query, [status, id]);

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
tasksRouter.delete("/:id", async (req, res) => {
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
            DELETE FROM ${db}.${TABLE} WHERE id = ?;
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