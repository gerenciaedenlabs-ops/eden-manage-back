import { Router } from "express";
import { getConnection } from "../database/connection.js";
import { logger } from "../config/logger.js";
import { env } from "../config/env.js";

export const vscodeIntegrationRouter = Router();

// Superficie mínima para la extensión de VS Code: solo leer el árbol de tareas
// de un proyecto y mover el estado de una tarea/subtarea. Nada de crear,
// editar título/descripción ni borrar — así, si la API key se filtra, el
// daño posible queda acotado a mover tarjetas de estado, no a perder datos.

const VALID_STATUSES = new Set(["pending", "inProgress", "completed"]);

// ======================== GET árbol de tareas de un proyecto ========================
vscodeIntegrationRouter.get("/tasks/:project_id", async (req, res) => {
  const { project_id } = req.params;
  let conn;

  try {
    conn = await getConnection();
    const db = env.db.database;

    const [rootRows] = await conn.query(
      `SELECT id, parent_id, title, status
       FROM ${db}.tasks
       WHERE project_id = ? AND parent_id IS NULL
       ORDER BY id ASC`,
      [project_id]
    );

    const [subRows] = await conn.query(
      `SELECT id, parent_id, title, status
       FROM ${db}.tasks
       WHERE project_id = ? AND parent_id IS NOT NULL
       ORDER BY id ASC`,
      [project_id]
    );

    const subtasksByParent = {};
    subRows.forEach((sub) => {
      if (!subtasksByParent[sub.parent_id]) subtasksByParent[sub.parent_id] = [];
      subtasksByParent[sub.parent_id].push(sub);
    });

    const data = rootRows.map((task) => ({
      ...task,
      subtasks: subtasksByParent[task.id] || [],
    }));

    return res.json({ status: "ok", data });
  } catch (error) {
    logger.error("Error listando tareas (integración VS Code):", error);
    return res.status(500).json({ status: "error", message: "Error interno del servidor", error: error.message });
  } finally {
    if (conn) conn.release();
  }
});

// ======================== PATCH mover estado de una tarea/subtarea ========================
vscodeIntegrationRouter.patch("/tasks/:id/status", async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!status || !VALID_STATUSES.has(status)) {
    return res.status(400).json({
      status: "error",
      message: `status debe ser uno de: ${[...VALID_STATUSES].join(", ")}`,
    });
  }

  let conn;

  try {
    conn = await getConnection();
    const db = env.db.database;

    const [result] = await conn.query(`UPDATE ${db}.tasks SET status = ? WHERE id = ?`, [status, id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ status: "error", message: "No se encontró la tarea" });
    }

    return res.json({ status: "ok", message: "Estado actualizado con éxito" });
  } catch (error) {
    logger.error("Error actualizando estado (integración VS Code):", error);
    return res.status(500).json({ status: "error", message: "Error interno del servidor", error: error.message });
  } finally {
    if (conn) conn.release();
  }
});
