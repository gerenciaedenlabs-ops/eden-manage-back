import { Router } from "express";
import { getConnection } from "../database/connection.js";
import { logger } from "../config/logger.js";
import { env } from "../config/env.js";

export const projectManagerRouter = Router();

// Extrae los bullets ("- ...") que siguen al marcador "**Criterios de Aceptación:**"
// dentro de una descripción, para poblar el checklist automáticamente al importar.
const extractChecklistItems = (description) => {
  if (!description) return [];

  const marker = "**Criterios de Aceptación:**";
  const idx = description.indexOf(marker);
  if (idx === -1) return [];

  const after = description.slice(idx + marker.length).split("\n");
  const items = [];

  for (const rawLine of after) {
    const line = rawLine.trim();
    if (line.startsWith("- ")) {
      items.push(line.slice(2).trim());
    } else if (line === "") {
      continue;
    } else {
      break;
    }
  }

  return items;
};

// Limpia el prefijo "↳ " (y espacios) que usan las filas Subtask del Excel.
const cleanSubtaskTitle = (rawTitle) => rawTitle.replace(/^[\s↳]+/, "").trim();

// Extrae el tag FE/BE/QA de un título de subtarea ya limpio, ej. "[FE] Formulario de login".
const extractTagFromTitle = (cleanTitle) => {
  const match = cleanTitle.match(/^\[(FE|BE|QA)\]/i);
  return match ? match[1].toUpperCase() : null;
};

// Tamaño de lote para los INSERT masivos de la importación (evita 1 round-trip por fila).
const IMPORT_CHUNK_SIZE = 200;

const chunkArray = (arr, size) => {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
};

// Estados válidos del tablero: cualquier otro valor (o ausente, como en la
// plantilla plana original que no manda status) cae en "pending".
const VALID_IMPORT_STATUSES = new Set(["pending", "inProgress", "completed"]);
const normalizeImportStatus = (status) => (VALID_IMPORT_STATUSES.has(status) ? status : "pending");

// Inserta tareas/subtareas en bloques de IMPORT_CHUNK_SIZE filas por statement.
// Los ids se derivan de result.insertId + índice: en un INSERT multi-fila simple,
// MySQL siempre reserva ids AUTO_INCREMENT contiguos para ese statement.
const bulkInsertTasks = async (conn, db, rows) => {
  const ids = [];

  for (const batch of chunkArray(rows, IMPORT_CHUNK_SIZE)) {
    const placeholders = batch.map(() => "(?, ?, ?, NULL, ?, ?, ?, ?)").join(", ");
    const values = batch.flat();

    const [result] = await conn.query(
      `INSERT INTO ${db}.tasks (project_id, title, description, assigned_to, status, parent_id, tags, created_by) VALUES ${placeholders}`,
      values
    );

    for (let i = 0; i < batch.length; i++) ids.push(result.insertId + i);
  }

  return ids;
};

const bulkInsertChecklistItems = async (conn, db, rows) => {
  for (const batch of chunkArray(rows, IMPORT_CHUNK_SIZE)) {
    const placeholders = batch.map(() => "(?, ?, ?)").join(", ");
    const values = batch.flat();

    await conn.query(
      `INSERT INTO ${db}.task_checklist_items (task_id, label, position) VALUES ${placeholders}`,
      values
    );
  }
};

// Nombre de la tabla unificada
const TABLE = "example";

// ======================== GET tipos de proyectos ========================
projectManagerRouter.get("/project-type", async (req, res) => {
  let conn;

  try {
    conn = await getConnection();
    const db = env.db.database;

    const query = `
            SELECT * FROM ${db}.project_types
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
    logger.error("Error en projectManagerRouter:", error);

    return res.status(500).json({
      status: "error",
      message: "Error interno del servidor",
      error: error.message
    });

  } finally {
    if (conn) conn.release();
  }
});

// ======================== GET proyectos freelance ========================
projectManagerRouter.get("/project-freelance", async (req, res) => {
  let conn;

  try {
    conn = await getConnection();
    const db = env.db.database;

    const query = `
        SELECT id, title, description, progress, status FROM ${db}.projects WHERE type_id = 2
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
    logger.error("Error en projectManagerRouter:", error);

    return res.status(500).json({
      status: "error",
      message: "Error interno del servidor",
      error: error.message
    });

  } finally {
    if (conn) conn.release();
  }
});

// ======================== POST freelance ========================
projectManagerRouter.post("/save-freelance", async (req, res) => {
  const { title, description, type_id, status, activate } = req.body;

  if (!title || !description || !type_id || !status || !activate) {
    return res.status(400).json({
      status: "error",
      message: "Datos incompletos: se requiere title, description, type_id, status y activate"
    });
  }

  let conn;

  try {
    conn = await getConnection();
    const db = env.db.database;

    const query = `
        INSERT INTO ${db}.projects (title, description, type_id, status, activate) VALUES (?, ?, ?, ?, ?)
        `;

    await conn.query(query, [title, description, type_id, status, activate]);

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

// ======================== GET proyectos activos ========================
projectManagerRouter.get("/project-active", async (req, res) => {
  let conn;

  try {
    conn = await getConnection();
    const db = env.db.database;

    const query = `
      SELECT id, title, description, progress, status, type_id FROM ${db}.projects WHERE activate = 1
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
    logger.error("Error en projectManagerRouter:", error);

    return res.status(500).json({
      status: "error",
      message: "Error interno del servidor",
      error: error.message
    });

  } finally {
    if (conn) conn.release();
  }
});

// ======================== GET colaboradores ========================
projectManagerRouter.get("/partners/:project_id", async (req, res) => {
  const { project_id } = req.params;

  if (!project_id) {
    return res.status(400).json({
      status: "error",
      message: "El ID es requerido"
    });
  }

  let conn;

  try {
    conn = await getConnection();
    const db = env.db.database;

    // La descripción va truncada en el listado del tablero: con cientos de
    // tareas, mandar el texto completo de cada una (criterios de aceptación
    // incluidos) puede pesar varios cientos de KB por carga, aunque la tarjeta
    // solo muestra una línea. El texto completo se trae aparte por tarea
    // (GET /task/:id) cuando se abre el detalle.
    const DESCRIPTION_PREVIEW_LENGTH = 300;

    const rootQuery = `
        SELECT t.id, t.project_id, t.parent_id, t.title,
        LEFT(t.description, ${DESCRIPTION_PREVIEW_LENGTH}) as description,
        (CHAR_LENGTH(t.description) > ${DESCRIPTION_PREVIEW_LENGTH}) as description_truncated,
        t.tags, t.due_date, t.created_by, u.name as assigned_to, creator.name as created_by_name, t.status
        FROM ${db}.tasks t
        LEFT JOIN ${db}.users u
        ON t.assigned_to = u.id
        LEFT JOIN ${db}.users creator
        ON t.created_by = creator.id
        WHERE t.project_id = ? AND t.parent_id IS NULL
        ORDER BY t.id ASC
        `;

    const [rootRows] = await conn.query(rootQuery, [project_id]);

    if (!rootRows || rootRows.length === 0) {
      return res.status(404).json({
        status: "error",
        message: "No se encontraron registros"
      });
    }

    const subQuery = `
        SELECT t.id, t.project_id, t.parent_id, t.title,
        LEFT(t.description, ${DESCRIPTION_PREVIEW_LENGTH}) as description,
        (CHAR_LENGTH(t.description) > ${DESCRIPTION_PREVIEW_LENGTH}) as description_truncated,
        t.tags, t.due_date, t.created_by, u.name as assigned_to, creator.name as created_by_name, t.status
        FROM ${db}.tasks t
        LEFT JOIN ${db}.users u
        ON t.assigned_to = u.id
        LEFT JOIN ${db}.users creator
        ON t.created_by = creator.id
        WHERE t.project_id = ? AND t.parent_id IS NOT NULL
        ORDER BY t.id ASC
        `;

    const [subRows] = await conn.query(subQuery, [project_id]);

    const allIds = [...rootRows, ...subRows].map((r) => r.id);
    let checklistRows = [];

    if (allIds.length > 0) {
      const placeholders = allIds.map(() => "?").join(",");
      const checklistQuery = `
          SELECT id, task_id, label, is_checked
          FROM ${db}.task_checklist_items
          WHERE task_id IN (${placeholders})
          ORDER BY position ASC, id ASC
          `;

      [checklistRows] = await conn.query(checklistQuery, allIds);
    }

    const checklistByTask = {};
    checklistRows.forEach((item) => {
      if (!checklistByTask[item.task_id]) checklistByTask[item.task_id] = [];
      checklistByTask[item.task_id].push(item);
    });

    const subtasksByParent = {};
    subRows.forEach((sub) => {
      sub.checklist = checklistByTask[sub.id] || [];
      if (!subtasksByParent[sub.parent_id]) subtasksByParent[sub.parent_id] = [];
      subtasksByParent[sub.parent_id].push(sub);
    });

    const data = rootRows.map((task) => ({
      ...task,
      checklist: checklistByTask[task.id] || [],
      subtasks: subtasksByParent[task.id] || [],
    }));

    return res.json({
      status: "ok",
      data
    });

  } catch (error) {
    logger.error("Error en projectManagerRouter:", error);

    return res.status(500).json({
      status: "error",
      message: "Error interno del servidor",
      error: error.message
    });

  } finally {
    if (conn) conn.release();
  }
});

// ======================== POST importar tareas desde Excel ========================
projectManagerRouter.post("/:project_id/import-tasks", async (req, res) => {
  const { project_id } = req.params;
  const { rows, created_by } = req.body;

  if (!project_id) {
    return res.status(400).json({
      status: "error",
      message: "El ID del proyecto es requerido"
    });
  }

  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({
      status: "error",
      message: "Se requiere un array 'rows' con al menos una fila para importar"
    });
  }

  let conn;

  try {
    conn = await getConnection();
    const db = env.db.database;

    await conn.beginTransaction();

    const rootRows = rows.filter((r) => r.tipo !== "Subtask" && r.titulo && r.titulo.trim());
    const subtaskRows = rows.filter((r) => r.tipo === "Subtask" && r.titulo && r.titulo.trim());

    // 1) Bulk insert de tareas raíz.
    const rootInsertRows = rootRows.map((row) => [
      project_id,
      row.titulo.trim(),
      row.descripcion || "",
      normalizeImportStatus(row.status),
      null,
      row.tags || null,
      created_by || null,
    ]);
    const rootIds = await bulkInsertTasks(conn, db, rootInsertRows);

    const titleToId = {};
    rootRows.forEach((row, idx) => {
      titleToId[row.titulo.trim()] = rootIds[idx];
    });

    // 2) Resolver padres y bulk insert de subtareas (se omiten las que no matchean título de padre).
    const resolvedSubtaskRows = subtaskRows
      .map((row) => {
        const cleanTitle = cleanSubtaskTitle(row.titulo);
        const parentTitle = row.padre ? row.padre.trim() : null;
        const parentId = parentTitle ? titleToId[parentTitle] : null;
        if (!parentId) return null;
        const tag = row.tags || extractTagFromTitle(cleanTitle);
        return { ...row, cleanTitle, parentId, tag };
      })
      .filter(Boolean);

    const subtaskInsertRows = resolvedSubtaskRows.map((row) => [
      project_id,
      row.cleanTitle,
      row.descripcion || "",
      normalizeImportStatus(row.status),
      row.parentId,
      row.tag,
      created_by || null,
    ]);
    const subtaskIds = await bulkInsertTasks(conn, db, subtaskInsertRows);

    // 3) Bulk insert del checklist (bullets de "Criterios de Aceptación") de tareas y subtareas.
    const checklistInsertRows = [];

    rootRows.forEach((row, idx) => {
      extractChecklistItems(row.descripcion).forEach((label, i) => {
        checklistInsertRows.push([rootIds[idx], label, i]);
      });
    });

    resolvedSubtaskRows.forEach((row, idx) => {
      extractChecklistItems(row.descripcion).forEach((label, i) => {
        checklistInsertRows.push([subtaskIds[idx], label, i]);
      });
    });

    if (checklistInsertRows.length > 0) {
      await bulkInsertChecklistItems(conn, db, checklistInsertRows);
    }

    const tasksCreated = rootRows.length;
    const subtasksCreated = resolvedSubtaskRows.length;
    const checklistItemsCreated = checklistInsertRows.length;

    await conn.commit();

    return res.status(201).json({
      status: "ok",
      message: "Importación completada con éxito",
      created: {
        tasks: tasksCreated,
        subtasks: subtasksCreated,
        checklist_items: checklistItemsCreated
      }
    });

  } catch (error) {
    if (conn) await conn.rollback();
    logger.error("Error importando tareas:", error);

    return res.status(500).json({
      status: "error",
      message: "Error interno del servidor",
      error: error.message
    });

  } finally {
    if (conn) conn.release();
  }
});
