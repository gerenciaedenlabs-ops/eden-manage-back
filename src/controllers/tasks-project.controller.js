import { Router } from "express";
import { getConnection } from "../database/connection.js";
import { logger } from "../config/logger.js";
import { env } from "../config/env.js";

export const tasksRouter = Router();

const TABLE = "tasks";

// ======================== POST tarea ========================
tasksRouter.post("/", async (req, res) => {
    const { project_id, title, description, assigned_to, status, parent_id, tags, due_date } = req.body;

    if (!project_id || !title || !description || !status) {
        return res.status(400).json({
            status: "error",
            message: "Datos incompletos: se requiere project_id, title, description y status"
        });
    }

    let conn;

    try {
        conn = await getConnection();
        const db = env.db.database;

        const query = `
      INSERT INTO ${db}.tasks (project_id, title, description, assigned_to, status, parent_id, tags, due_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `;

        await conn.query(query, [project_id, title, description, assigned_to || null, status, parent_id || null, tags || null, due_date || null]);

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
    const { title, description, assigned_to, tags, due_date } = req.body;

    if (!id) {
        return res.status(400).json({
            status: "error",
            message: "El ID es requerido"
        });
    }

    if (!title || !description) {
        return res.status(400).json({
            status: "error",
            message: "Datos incompletos: se requiere title y description"
        });
    }

    let conn;

    try {
        conn = await getConnection();
        const db = env.db.database;

        // tags/due_date son opcionales: si no vienen en el body, se dejan intactos
        // (no se pisan con NULL) para no perder datos al editar solo otros campos.
        const fields = ["title = ?", "description = ?", "assigned_to = ?"];
        const values = [title, description, assigned_to || null];

        if (tags !== undefined) {
            fields.push("tags = ?");
            values.push(tags || null);
        }

        if (due_date !== undefined) {
            fields.push("due_date = ?");
            values.push(due_date || null);
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

// ======================== POST checklist item ========================
tasksRouter.post("/:id/checklist", async (req, res) => {
    const { id } = req.params;
    const { label } = req.body;

    if (!label || !label.trim()) {
        return res.status(400).json({
            status: "error",
            message: "Datos incompletos: se requiere label"
        });
    }

    let conn;

    try {
        conn = await getConnection();
        const db = env.db.database;

        const query = `
        INSERT INTO ${db}.task_checklist_items (task_id, label) VALUES (?, ?)
        `;

        const [result] = await conn.query(query, [id, label.trim()]);

        return res.status(201).json({
            status: "ok",
            message: "Item de checklist creado con éxito",
            data: { id: result.insertId, task_id: Number(id), label: label.trim(), is_checked: 0 }
        });

    } catch (error) {
        logger.error("Error creando checklist item:", error);

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