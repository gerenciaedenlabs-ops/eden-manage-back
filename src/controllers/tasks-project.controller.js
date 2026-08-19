import { Router } from "express";
import { getConnection } from "../database/connection.js";
import { logger } from "../config/logger.js";
import { env } from "../config/env.js";
import { isAdminUser } from "../utils/permissions.js";

export const tasksRouter = Router();

const TABLE = "tasks";

// Crea la notificación de "te asignaron una tarea" cuando assigned_to apunta
// a alguien distinto de quien hace la acción (no te notificas a ti mismo).
const notifyAssignee = async (conn, db, { assignedTo, actingUserId, taskId, title }) => {
    if (!assignedTo || Number(assignedTo) === Number(actingUserId)) return;

    await conn.query(
        `INSERT INTO ${db}.notifications (user_id, type, message, related_task_id) VALUES (?, 'task_assigned', ?, ?)`,
        [assignedTo, `Se te asignó la tarea: ${title}`, taskId]
    );
};

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
      INSERT INTO ${db}.tasks (project_id, title, description, assigned_to, status, parent_id, tags, due_date, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

        // created_by nunca se toma del body: siempre es el usuario autenticado real
        // (req.user.id viene del JWT verificado por authMiddleware), para que nadie
        // pueda atribuirse una tarea a otra persona.
        const [result] = await conn.query(query, [project_id, title, description, assigned_to || null, status, parent_id || null, tags || null, due_date || null, req.user.id]);

        await notifyAssignee(conn, db, {
            assignedTo: assigned_to,
            actingUserId: req.user.id,
            taskId: result.insertId,
            title,
        });

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

// ======================== GET tarea (detalle completo) ========================
// El listado del tablero (/project/partners/:id) manda la descripción truncada
// para no descargar cientos de KB de texto en cada carga; esta ruta trae la
// tarea puntual con su descripción completa y la de sus subtareas, para cuando
// se abre el modal de detalle.
tasksRouter.get("/:id", async (req, res) => {
    const { id } = req.params;

    let conn;

    try {
        conn = await getConnection();
        const db = env.db.database;

        const [[task]] = await conn.query(
            `SELECT t.id, t.project_id, t.parent_id, t.title, t.description, t.tags, t.due_date, t.created_by, u.name as assigned_to, creator.name as created_by_name, t.status
             FROM ${db}.tasks t
             LEFT JOIN ${db}.users u ON t.assigned_to = u.id
             LEFT JOIN ${db}.users creator ON t.created_by = creator.id
             WHERE t.id = ?`,
            [id]
        );

        if (!task) {
            return res.status(404).json({ status: "error", message: "Tarea no encontrada" });
        }

        const [subtasks] = await conn.query(
            `SELECT t.id, t.project_id, t.parent_id, t.title, t.description, t.tags, t.due_date, t.created_by, u.name as assigned_to, creator.name as created_by_name, t.status
             FROM ${db}.tasks t
             LEFT JOIN ${db}.users u ON t.assigned_to = u.id
             LEFT JOIN ${db}.users creator ON t.created_by = creator.id
             WHERE t.parent_id = ?
             ORDER BY t.id ASC`,
            [id]
        );

        const allIds = [task.id, ...subtasks.map((s) => s.id)];
        const placeholders = allIds.map(() => "?").join(",");
        const [checklistRows] = await conn.query(
            `SELECT id, task_id, label, is_checked FROM ${db}.task_checklist_items WHERE task_id IN (${placeholders}) ORDER BY position ASC, id ASC`,
            allIds
        );

        const checklistByTask = {};
        checklistRows.forEach((item) => {
            if (!checklistByTask[item.task_id]) checklistByTask[item.task_id] = [];
            checklistByTask[item.task_id].push(item);
        });

        task.checklist = checklistByTask[task.id] || [];
        task.subtasks = subtasks.map((s) => ({ ...s, checklist: checklistByTask[s.id] || [] }));

        return res.json({ status: "ok", data: task });

    } catch (error) {
        logger.error("Error obteniendo detalle de tarea:", error);

        return res.status(500).json({
            status: "error",
            message: "Error interno del servidor",
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

        const [[existing]] = await conn.query(`SELECT created_by, assigned_to FROM ${db}.${TABLE} WHERE id = ?`, [id]);

        if (!existing) {
            return res.status(404).json({ status: "error", message: "No se encontró el registro a actualizar" });
        }

        const admin = await isAdminUser(conn, db, req.user.id);
        if (!admin && existing.created_by !== req.user.id) {
            return res.status(403).json({
                status: "error",
                message: "Solo puedes editar tareas que tú creaste"
            });
        }

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

        // Solo notifica si el colaborador asignado cambió a otra persona
        // (no en cada edición de título/descripción sobre la misma asignación).
        if (Number(assigned_to) !== Number(existing.assigned_to)) {
            await notifyAssignee(conn, db, {
                assignedTo: assigned_to,
                actingUserId: req.user.id,
                taskId: id,
                title,
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

        const [[existing]] = await conn.query(`SELECT created_by FROM ${db}.${TABLE} WHERE id = ?`, [id]);

        if (!existing) {
            return res.status(404).json({ status: "error", message: "No se encontró el registro a eliminar" });
        }

        const admin = await isAdminUser(conn, db, req.user.id);
        if (!admin && existing.created_by !== req.user.id) {
            return res.status(403).json({
                status: "error",
                message: "Solo puedes eliminar tareas que tú creaste"
            });
        }

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