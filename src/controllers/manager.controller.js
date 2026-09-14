import { Router } from "express";
import { getConnection } from "../database/connection.js";
import { logger } from "../config/logger.js";
import { env } from "../config/env.js";
import { githubApiRequest } from "../utils/github-app.js";

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

// Actualiza el status de tareas/subtareas ya existentes (reimport del mismo
// backlog con estados nuevos), en bloques de IMPORT_CHUNK_SIZE por statement.
const bulkUpdateTaskStatus = async (conn, db, updates) => {
  for (const batch of chunkArray(updates, IMPORT_CHUNK_SIZE)) {
    const whenClauses = batch.map(() => "WHEN ? THEN ?").join(" ");
    const caseValues = batch.flatMap((u) => [u.id, u.status]);
    const ids = batch.map((u) => u.id);
    const placeholders = ids.map(() => "?").join(",");

    await conn.query(
      `UPDATE ${db}.tasks SET status = CASE id ${whenClauses} END WHERE id IN (${placeholders})`,
      [...caseValues, ...ids]
    );
  }
};

// Padre expresado como "[ID] Título" (formato del backlog de seguimiento de
// HUs exportado a Excel) — captura el código y el título sin el prefijo.
const PARENT_WITH_CODE_REGEX = /^\[([^\]]+)\]\s*(.*)$/;

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
        SELECT p.id, p.title, p.description, p.status,
          COALESCE(ROUND(SUM(t.status = 'completed') / NULLIF(COUNT(t.id), 0) * 100, 2), 0) as progress
        FROM ${db}.projects p
        LEFT JOIN ${db}.tasks t ON t.project_id = p.id
        WHERE p.type_id = 2
        GROUP BY p.id, p.title, p.description, p.status
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
      SELECT p.id, p.title, p.description, p.status, p.type_id,
        COALESCE(ROUND(SUM(t.status = 'completed') / NULLIF(COUNT(t.id), 0) * 100, 2), 0) as progress
      FROM ${db}.projects p
      LEFT JOIN ${db}.tasks t ON t.project_id = p.id
      WHERE p.activate = 1
      GROUP BY p.id, p.title, p.description, p.status, p.type_id
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

    // Metadata del catálogo ERP (módulo/épica/rol/caso de uso/prioridad/release/
    // puntos/código externo): liviana por fila, se manda siempre en el listado
    // del tablero para poder armar badges y la vista jerárquica sin otra
    // llamada. Lo pesado (criterios de aceptación, reglas de negocio, notas UX)
    // se trae aparte en GET /task/:id, igual que ya pasa con description.
    const rootQuery = `
        SELECT t.id, t.project_id, t.parent_id, t.title,
        LEFT(t.description, ${DESCRIPTION_PREVIEW_LENGTH}) as description,
        (CHAR_LENGTH(t.description) > ${DESCRIPTION_PREVIEW_LENGTH}) as description_truncated,
        t.tags, t.due_date, t.created_by, u.name as assigned_to, creator.name as created_by_name, t.status,
        t.external_code, t.priority, t.release_tag, t.story_points,
        tm.code as module_code, tm.name as module_name,
        te.name as epic_name, tr.name as role_name,
        tuc.code as use_case_code, tuc.name as use_case_name
        FROM ${db}.tasks t
        LEFT JOIN ${db}.users u
        ON t.assigned_to = u.id
        LEFT JOIN ${db}.users creator
        ON t.created_by = creator.id
        LEFT JOIN ${db}.task_modules tm ON t.module_id = tm.id
        LEFT JOIN ${db}.task_epics te ON t.epic_id = te.id
        LEFT JOIN ${db}.task_roles tr ON t.role_id = tr.id
        LEFT JOIN ${db}.task_use_cases tuc ON t.use_case_id = tuc.id
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
        t.tags, t.due_date, t.created_by, u.name as assigned_to, creator.name as created_by_name, t.status,
        t.external_code, t.priority, t.release_tag, t.story_points,
        tm.code as module_code, tm.name as module_name,
        te.name as epic_name, tr.name as role_name,
        tuc.code as use_case_code, tuc.name as use_case_name
        FROM ${db}.tasks t
        LEFT JOIN ${db}.users u
        ON t.assigned_to = u.id
        LEFT JOIN ${db}.users creator
        ON t.created_by = creator.id
        LEFT JOIN ${db}.task_modules tm ON t.module_id = tm.id
        LEFT JOIN ${db}.task_epics te ON t.epic_id = te.id
        LEFT JOIN ${db}.task_roles tr ON t.role_id = tr.id
        LEFT JOIN ${db}.task_use_cases tuc ON t.use_case_id = tuc.id
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

    // 1) Tareas raíz: las que ya existen en el proyecto se actualizan de
    // estado; solo se insertan las que son nuevas. Así un reimport del mismo
    // backlog no duplica tareas, solo refresca su status. El match primario
    // es por el código [ID] (más robusto que el título: las tareas ya
    // importadas antes lo llevan incrustado al inicio del título, ej.
    // "[0015] Account lockout for failed attempts"); si una fila no trae ID
    // o no matchea por código, cae a comparar título exacto (con o sin ese
    // prefijo) como respaldo.
    const LEADING_CODE_REGEX = /^\[([^\]]+)\]\s*/;

    const [existingRootRows] = await conn.query(
      `SELECT id, title FROM ${db}.tasks WHERE project_id = ? AND parent_id IS NULL`,
      [project_id]
    );
    const existingRootIdByTitle = {};
    const idCodeToId = {}; // ID de la fila en el Excel -> id en BD (existente o nueva)
    existingRootRows.forEach((t) => {
      const rawTitle = t.title.trim();
      existingRootIdByTitle[rawTitle] = t.id;
      const codeMatch = rawTitle.match(LEADING_CODE_REGEX);
      if (codeMatch) {
        idCodeToId[codeMatch[1].trim()] = t.id;
        existingRootIdByTitle[rawTitle.replace(LEADING_CODE_REGEX, "").trim()] = t.id;
      }
    });

    const titleToId = {};
    const rootToInsert = [];
    const rootToUpdate = [];

    rootRows.forEach((row) => {
      const title = row.titulo.trim();
      const status = normalizeImportStatus(row.status);
      const code = row.id ? String(row.id).trim() : null;
      const existingId = (code && idCodeToId[code]) || existingRootIdByTitle[title];

      if (existingId) {
        rootToUpdate.push({ id: existingId, status });
        titleToId[title] = existingId;
        if (code) idCodeToId[code] = existingId;
      } else {
        // Se mantiene la convención "[ID] Título" del backlog original para que
        // las tareas nuevas queden visualmente consistentes con las existentes.
        rootToInsert.push({ ...row, title, insertTitle: code ? `[${code}] ${title}` : title, status, code });
      }
    });

    const rootInsertRows = rootToInsert.map((row) => [
      project_id,
      row.insertTitle,
      row.descripcion || "",
      row.status,
      null,
      row.tags || null,
      created_by || null,
    ]);
    const newRootIds = await bulkInsertTasks(conn, db, rootInsertRows);

    rootToInsert.forEach((row, idx) => {
      titleToId[row.title] = newRootIds[idx];
      if (row.code) idCodeToId[row.code] = newRootIds[idx];
    });

    if (rootToUpdate.length > 0) {
      await bulkUpdateTaskStatus(conn, db, rootToUpdate);
    }

    // 2) Subtareas ya existentes bajo cualquier padre de este proyecto (mismo
    // upsert por código [ID] con respaldo por (padre, título) exacto).
    const [existingSubtaskRows] = await conn.query(
      `SELECT id, parent_id, title FROM ${db}.tasks WHERE project_id = ? AND parent_id IS NOT NULL`,
      [project_id]
    );
    const existingSubtaskIdByKey = {};
    const subtaskCodeToId = {};
    existingSubtaskRows.forEach((t) => {
      const rawTitle = t.title.trim();
      existingSubtaskIdByKey[`${t.parent_id}::${rawTitle}`] = t.id;
      const codeMatch = rawTitle.match(LEADING_CODE_REGEX);
      if (codeMatch) {
        subtaskCodeToId[codeMatch[1].trim()] = t.id;
        existingSubtaskIdByKey[`${t.parent_id}::${rawTitle.replace(LEADING_CODE_REGEX, "").trim()}`] = t.id;
      }
    });

    // Resolver padres: el Padre puede venir como "[ID] Título" (backlog de
    // seguimiento de HUs) o como título exacto (plantilla plana original).
    // Se omiten las subtareas que no matchean ningún padre.
    const resolvedSubtaskRows = subtaskRows
      .map((row) => {
        const cleanTitle = cleanSubtaskTitle(row.titulo);
        const rawPadre = row.padre ? row.padre.trim() : null;
        if (!rawPadre) return null;

        const codeMatch = rawPadre.match(PARENT_WITH_CODE_REGEX);
        const parentId = codeMatch
          ? idCodeToId[codeMatch[1].trim()] || titleToId[codeMatch[2].trim()]
          : titleToId[rawPadre];
        if (!parentId) return null;

        const tag = row.tags || extractTagFromTitle(cleanTitle);
        const status = normalizeImportStatus(row.status);
        return { ...row, cleanTitle, parentId, tag, status };
      })
      .filter(Boolean);

    const subtaskToInsert = [];
    const subtaskToUpdate = [];

    resolvedSubtaskRows.forEach((row) => {
      const code = row.id ? String(row.id).trim() : null;
      const existingId =
        (code && subtaskCodeToId[code]) || existingSubtaskIdByKey[`${row.parentId}::${row.cleanTitle}`];
      if (existingId) {
        subtaskToUpdate.push({ id: existingId, status: row.status });
      } else {
        row.insertTitle = code ? `[${code}] ${row.cleanTitle}` : row.cleanTitle;
        subtaskToInsert.push(row);
      }
    });

    const subtaskInsertRows = subtaskToInsert.map((row) => [
      project_id,
      row.insertTitle,
      row.descripcion || "",
      row.status,
      row.parentId,
      row.tag,
      created_by || null,
    ]);
    const newSubtaskIds = await bulkInsertTasks(conn, db, subtaskInsertRows);

    if (subtaskToUpdate.length > 0) {
      await bulkUpdateTaskStatus(conn, db, subtaskToUpdate);
    }

    // 3) Bulk insert del checklist (bullets de "Criterios de Aceptación") solo
    // para tareas/subtareas nuevas: las que ya existían conservan su
    // checklist tal cual (marcado manualmente), no se vuelve a poblar.
    const checklistInsertRows = [];

    rootToInsert.forEach((row, idx) => {
      extractChecklistItems(row.descripcion).forEach((label, i) => {
        checklistInsertRows.push([newRootIds[idx], label, i]);
      });
    });

    subtaskToInsert.forEach((row, idx) => {
      extractChecklistItems(row.descripcion).forEach((label, i) => {
        checklistInsertRows.push([newSubtaskIds[idx], label, i]);
      });
    });

    if (checklistInsertRows.length > 0) {
      await bulkInsertChecklistItems(conn, db, checklistInsertRows);
    }

    const tasksCreated = rootToInsert.length;
    const subtasksCreated = subtaskToInsert.length;
    const tasksUpdated = rootToUpdate.length;
    const subtasksUpdated = subtaskToUpdate.length;
    const checklistItemsCreated = checklistInsertRows.length;

    await conn.commit();

    return res.status(201).json({
      status: "ok",
      message: "Importación completada con éxito",
      created: {
        tasks: tasksCreated,
        subtasks: subtasksCreated,
        checklist_items: checklistItemsCreated
      },
      updated: {
        tasks: tasksUpdated,
        subtasks: subtasksUpdated
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

// ======================== POST importar catálogo ERP (Módulos/Roles/Casos de Uso/Épicas/HUs/Criterios) ========================
// Importador dedicado al formato "ERP EDEN" (workbook con hojas Historias de
// Usuario + Criterios de aceptación + Módulos + Casos de Uso + Roles), distinto
// del importador plano/agrupado de /import-tasks: acá cada Historia de Usuario
// se enlaza a un módulo, una épica, un rol y (opcionalmente) un caso de uso como
// catálogo relacional propio del proyecto, y sus criterios de aceptación quedan
// en filas propias (Dado/Cuando/Entonces) en vez de bullets en la descripción.
// El parseo del .xlsx ocurre en el frontend (import-tasks-modal); acá solo se
// persiste lo ya estructurado.
const VALID_PRIORITIES = new Set(["Must", "Should", "Could"]);

const upsertModules = async (conn, db, projectId, modules) => {
  for (const m of modules) {
    if (!m.code) continue;
    await conn.query(
      `INSERT INTO ${db}.task_modules (project_id, code, name, grupo, descripcion, objetivo, release_base)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE name = VALUES(name), grupo = VALUES(grupo), descripcion = VALUES(descripcion),
         objetivo = VALUES(objetivo), release_base = VALUES(release_base)`,
      [projectId, m.code, m.name || m.code, m.grupo || null, m.descripcion || null, m.objetivo || null, m.release_base || null]
    );
  }

  const [rows] = await conn.query(`SELECT id, code FROM ${db}.task_modules WHERE project_id = ?`, [projectId]);
  const byCode = {};
  rows.forEach((r) => (byCode[r.code] = r.id));
  return byCode;
};

const upsertRoles = async (conn, db, projectId, roles) => {
  for (const r of roles) {
    if (!r.name) continue;
    await conn.query(
      `INSERT INTO ${db}.task_roles (project_id, name, tipo, descripcion)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE tipo = VALUES(tipo), descripcion = VALUES(descripcion)`,
      [projectId, r.name, r.tipo || null, r.descripcion || null]
    );
  }

  const [rows] = await conn.query(`SELECT id, name FROM ${db}.task_roles WHERE project_id = ?`, [projectId]);
  const byName = {};
  rows.forEach((r) => (byName[r.name] = r.id));
  return byName;
};

const upsertUseCases = async (conn, db, projectId, useCases, moduleByCode) => {
  for (const uc of useCases) {
    if (!uc.code) continue;
    const moduleId = uc.module_code ? moduleByCode[uc.module_code] || null : null;
    await conn.query(
      `INSERT INTO ${db}.task_use_cases (project_id, module_id, code, name, actor_principal, actores_secundarios, objetivo, release_minimo)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE module_id = VALUES(module_id), name = VALUES(name), actor_principal = VALUES(actor_principal),
         actores_secundarios = VALUES(actores_secundarios), objetivo = VALUES(objetivo), release_minimo = VALUES(release_minimo)`,
      [projectId, moduleId, uc.code, uc.name || uc.code, uc.actor_principal || null, uc.actores_secundarios || null, uc.objetivo || null, uc.release_minimo || null]
    );
  }

  const [rows] = await conn.query(`SELECT id, code FROM ${db}.task_use_cases WHERE project_id = ?`, [projectId]);
  const byCode = {};
  rows.forEach((r) => (byCode[r.code] = r.id));
  return byCode;
};

const upsertEpics = async (conn, db, projectId, epicsList, moduleByCode) => {
  for (const e of epicsList) {
    const moduleId = moduleByCode[e.module_code];
    if (!moduleId || !e.name) continue;

    await conn.query(
      `INSERT INTO ${db}.task_epics (project_id, module_id, name) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE name = VALUES(name)`,
      [projectId, moduleId, e.name]
    );
  }

  const [rows] = await conn.query(
    `SELECT te.id, te.name, tm.code as module_code FROM ${db}.task_epics te
     JOIN ${db}.task_modules tm ON tm.id = te.module_id WHERE te.project_id = ?`,
    [projectId]
  );
  const byKey = {};
  rows.forEach((r) => (byKey[`${r.module_code}::${r.name}`] = r.id));
  return byKey;
};

// 19 columnas de tasks (mismo truco de ids contiguos que bulkInsertTasks):
// assigned_to y parent_id no aplican a historias importadas (sin colaborador,
// sin jerarquía por parent_id — la jerarquía acá es módulo/épica).
const bulkInsertErpTasks = async (conn, db, rows) => {
  const ids = [];

  for (const batch of chunkArray(rows, IMPORT_CHUNK_SIZE)) {
    const placeholders = batch
      .map(() => "(?, ?, ?, NULL, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .join(", ");
    const values = batch.flat();

    const [result] = await conn.query(
      `INSERT INTO ${db}.tasks
        (project_id, title, description, assigned_to, status, parent_id, tags, created_by,
         module_id, epic_id, role_id, use_case_id, priority, release_tag, story_points,
         external_code, business_rules, ux_notes, dependencies_raw)
       VALUES ${placeholders}`,
      values
    );

    for (let i = 0; i < batch.length; i++) ids.push(result.insertId + i);
  }

  return ids;
};

projectManagerRouter.post("/:project_id/import-erp-catalog", async (req, res) => {
  const { project_id } = req.params;
  const { created_by, modules = [], roles = [], useCases = [], epics = [], stories = [] } = req.body;

  if (!project_id) {
    return res.status(400).json({ status: "error", message: "El ID del proyecto es requerido" });
  }

  if (!Array.isArray(stories) || stories.length === 0) {
    return res.status(400).json({
      status: "error",
      message: "Se requiere un array 'stories' con al menos una historia de usuario"
    });
  }

  let conn;

  try {
    conn = await getConnection();
    const db = env.db.database;

    await conn.beginTransaction();

    const moduleByCode = await upsertModules(conn, db, project_id, modules);
    const roleByName = await upsertRoles(conn, db, project_id, roles);
    const useCaseByCode = await upsertUseCases(conn, db, project_id, useCases, moduleByCode);

    // Módulos/roles/casos de uso referenciados por alguna historia pero
    // ausentes de sus catálogos (ej. se excluyó la hoja "Roles" al importar):
    // se crean versiones mínimas para no perder el enlace.
    const missingModuleCodes = new Set();
    const missingRoleNames = new Set();
    const missingUseCaseCodes = new Set();

    stories.forEach((s) => {
      if (s.module_code && !moduleByCode[s.module_code]) missingModuleCodes.add(s.module_code);
      if (s.role_name && !roleByName[s.role_name]) missingRoleNames.add(s.role_name);
      if (s.use_case_code && !useCaseByCode[s.use_case_code]) missingUseCaseCodes.add(s.use_case_code);
    });

    if (missingModuleCodes.size > 0) {
      const extra = await upsertModules(
        conn, db, project_id,
        [...missingModuleCodes].map((code) => ({ code, name: code }))
      );
      Object.assign(moduleByCode, extra);
    }
    if (missingRoleNames.size > 0) {
      const extra = await upsertRoles(
        conn, db, project_id,
        [...missingRoleNames].map((name) => ({ name }))
      );
      Object.assign(roleByName, extra);
    }
    if (missingUseCaseCodes.size > 0) {
      const extra = await upsertUseCases(
        conn, db, project_id,
        [...missingUseCaseCodes].map((code) => ({ code, name: code })),
        moduleByCode
      );
      Object.assign(useCaseByCode, extra);
    }

    // Épicas declaradas explícitamente + cualquier (módulo, épica) que traiga
    // una historia y no esté en la lista (mismo criterio de auto-creación).
    const epicKeys = new Set(epics.map((e) => `${e.module_code}::${e.name}`));
    const allEpics = [...epics];
    stories.forEach((s) => {
      if (s.module_code && s.epic_name) {
        const key = `${s.module_code}::${s.epic_name}`;
        if (!epicKeys.has(key)) {
          epicKeys.add(key);
          allEpics.push({ module_code: s.module_code, name: s.epic_name });
        }
      }
    });
    const epicByKey = await upsertEpics(conn, db, project_id, allEpics, moduleByCode);

    // Upsert de historias: match por (project_id, external_code). Igual que en
    // /import-tasks, reimportar el mismo backlog actualiza en vez de duplicar.
    const [existingRows] = await conn.query(
      `SELECT id, external_code FROM ${db}.tasks WHERE project_id = ? AND external_code IS NOT NULL`,
      [project_id]
    );
    const existingIdByCode = {};
    existingRows.forEach((r) => (existingIdByCode[r.external_code] = r.id));

    const toInsert = [];
    const toUpdate = [];

    stories.forEach((s) => {
      if (!s.title || !s.title.trim()) return;

      const resolved = {
        ...s,
        title: s.title.trim(),
        moduleId: s.module_code ? moduleByCode[s.module_code] || null : null,
        epicId: s.module_code && s.epic_name ? epicByKey[`${s.module_code}::${s.epic_name}`] || null : null,
        roleId: s.role_name ? roleByName[s.role_name] || null : null,
        useCaseId: s.use_case_code ? useCaseByCode[s.use_case_code] || null : null,
        priority: VALID_PRIORITIES.has(s.priority) ? s.priority : null,
        status: normalizeImportStatus(s.status),
        points: s.story_points !== "" && s.story_points != null && Number.isFinite(Number(s.story_points))
          ? Number(s.story_points)
          : null,
      };

      const existingId = s.external_code ? existingIdByCode[s.external_code] : null;
      if (existingId) {
        toUpdate.push({ ...resolved, id: existingId });
      } else {
        toInsert.push(resolved);
      }
    });

    const insertRows = toInsert.map((s) => [
      project_id,
      s.title,
      s.story_text || "",
      s.status,
      s.tags || null,
      created_by || null,
      s.moduleId,
      s.epicId,
      s.roleId,
      s.useCaseId,
      s.priority,
      s.release_tag || null,
      s.points,
      s.external_code || null,
      s.business_rules || null,
      s.ux_notes || null,
      s.dependencies_raw || null,
    ]);
    const newIds = await bulkInsertErpTasks(conn, db, insertRows);
    toInsert.forEach((s, idx) => (s.id = newIds[idx]));

    for (const s of toUpdate) {
      await conn.query(
        `UPDATE ${db}.tasks SET title = ?, description = ?, status = ?, tags = ?,
           module_id = ?, epic_id = ?, role_id = ?, use_case_id = ?, priority = ?,
           release_tag = ?, story_points = ?, business_rules = ?, ux_notes = ?, dependencies_raw = ?
         WHERE id = ?`,
        [
          s.title, s.story_text || "", s.status, s.tags || null,
          s.moduleId, s.epicId, s.roleId, s.useCaseId, s.priority,
          s.release_tag || null, s.points, s.business_rules || null, s.ux_notes || null, s.dependencies_raw || null,
          s.id,
        ]
      );
    }

    // Criterios de aceptación: se refrescan por completo para las historias
    // tocadas en este import (nuevas o actualizadas), así un reimport siempre
    // deja los criterios exactamente como en la hoja.
    const allStoryRows = [...toInsert, ...toUpdate];
    const touchedIds = allStoryRows.map((s) => s.id);

    if (touchedIds.length > 0) {
      for (const idBatch of chunkArray(touchedIds, IMPORT_CHUNK_SIZE)) {
        const placeholders = idBatch.map(() => "?").join(",");
        await conn.query(
          `DELETE FROM ${db}.task_acceptance_criteria WHERE task_id IN (${placeholders})`,
          idBatch
        );
      }
    }

    const criteriaRows = [];
    allStoryRows.forEach((s) => {
      (s.criteria || []).forEach((c, i) => {
        criteriaRows.push([
          s.id, c.code || null, c.dado || null, c.cuando || null,
          c.entonces || null, c.texto_completo || null, c.resultado_prueba || null, i,
        ]);
      });
    });

    if (criteriaRows.length > 0) {
      for (const batch of chunkArray(criteriaRows, IMPORT_CHUNK_SIZE)) {
        const placeholders = batch.map(() => "(?, ?, ?, ?, ?, ?, ?, ?)").join(", ");
        await conn.query(
          `INSERT INTO ${db}.task_acceptance_criteria
            (task_id, code, dado, cuando, entonces, texto_completo, resultado_prueba, position)
           VALUES ${placeholders}`,
          batch.flat()
        );
      }
    }

    await conn.commit();

    return res.status(201).json({
      status: "ok",
      message: "Importación del catálogo ERP completada con éxito",
      created: {
        modules: Object.keys(moduleByCode).length,
        roles: Object.keys(roleByName).length,
        use_cases: Object.keys(useCaseByCode).length,
        epics: Object.keys(epicByKey).length,
        tasks: toInsert.length,
        criteria: criteriaRows.length
      },
      updated: {
        tasks: toUpdate.length
      }
    });

  } catch (error) {
    if (conn) await conn.rollback();
    logger.error("Error importando catálogo ERP:", error);

    return res.status(500).json({
      status: "error",
      message: "Error interno del servidor",
      error: error.message
    });

  } finally {
    if (conn) conn.release();
  }
});

// ======================== GET repositorios vinculados a un proyecto ========================
projectManagerRouter.get("/:project_id/repositories", async (req, res) => {
  const { project_id } = req.params;
  let conn;

  try {
    conn = await getConnection();
    const db = env.db.database;

    const [rows] = await conn.query(
      `SELECT id, repo_full_name, repo_url, default_branch, is_private, created_at
       FROM ${db}.project_repositories WHERE project_id = ? ORDER BY id ASC`,
      [project_id]
    );

    return res.json({ status: "ok", data: rows });

  } catch (error) {
    logger.error("Error listando repositorios del proyecto:", error);

    return res.status(500).json({
      status: "error",
      message: "Error interno del servidor",
      error: error.message
    });

  } finally {
    if (conn) conn.release();
  }
});

// ======================== POST vincular repositorio existente ========================
// Confirma contra la API de GitHub (no confía en el string suelto del
// body): si la GitHub App no tiene acceso a ese repo, esto falla antes de
// guardar nada en la base de datos.
projectManagerRouter.post("/:project_id/repositories/link", async (req, res) => {
  const { project_id } = req.params;
  const { repo_full_name, created_by } = req.body;

  if (!repo_full_name || !repo_full_name.includes("/")) {
    return res.status(400).json({
      status: "error",
      message: "Se requiere repo_full_name en formato 'organización/repositorio'"
    });
  }

  let conn;

  try {
    const repo = await githubApiRequest(`/repos/${repo_full_name}`);

    conn = await getConnection();
    const db = env.db.database;

    await conn.query(
      `INSERT INTO ${db}.project_repositories (project_id, repo_full_name, repo_url, default_branch, is_private, created_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [project_id, repo.full_name, repo.html_url, repo.default_branch, repo.private ? 1 : 0, created_by || null]
    );

    return res.status(201).json({ status: "ok", message: "Repositorio vinculado con éxito" });

  } catch (error) {
    if (error.status === 404) {
      return res.status(404).json({
        status: "error",
        message: "La GitHub App no tiene acceso a ese repositorio (o no existe)"
      });
    }
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ status: "error", message: "Ese repositorio ya está vinculado a este proyecto" });
    }

    logger.error("Error vinculando repositorio:", error);

    return res.status(500).json({
      status: "error",
      message: "Error interno del servidor",
      error: error.message
    });

  } finally {
    if (conn) conn.release();
  }
});

// ======================== POST crear repositorio nuevo y vincularlo ========================
projectManagerRouter.post("/:project_id/repositories/create", async (req, res) => {
  const { project_id } = req.params;
  const { name, description, isPrivate = true, created_by } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ status: "error", message: "Se requiere el nombre del repositorio" });
  }

  let conn;

  try {
    const repo = await githubApiRequest(`/orgs/${env.github.org}/repos`, {
      method: "POST",
      body: JSON.stringify({ name: name.trim(), description: description || "", private: !!isPrivate }),
    });

    conn = await getConnection();
    const db = env.db.database;

    await conn.query(
      `INSERT INTO ${db}.project_repositories (project_id, repo_full_name, repo_url, default_branch, is_private, created_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [project_id, repo.full_name, repo.html_url, repo.default_branch, repo.private ? 1 : 0, created_by || null]
    );

    return res.status(201).json({
      status: "ok",
      message: "Repositorio creado y vinculado con éxito",
      data: { url: repo.html_url, full_name: repo.full_name }
    });

  } catch (error) {
    logger.error("Error creando repositorio en GitHub:", error);

    return res.status(500).json({
      status: "error",
      message: "No se pudo crear el repositorio en GitHub",
      error: error.message
    });

  } finally {
    if (conn) conn.release();
  }
});

// ======================== DELETE desvincular repositorio ========================
// Solo borra la fila de asociación: nunca elimina el repositorio real en
// GitHub (acción destructiva que esta ruta no debe poder disparar).
projectManagerRouter.delete("/:project_id/repositories/:repo_id", async (req, res) => {
  const { repo_id } = req.params;
  let conn;

  try {
    conn = await getConnection();
    const db = env.db.database;

    const [result] = await conn.query(`DELETE FROM ${db}.project_repositories WHERE id = ?`, [repo_id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ status: "error", message: "No se encontró el vínculo a eliminar" });
    }

    return res.json({ status: "ok", message: "Repositorio desvinculado (no se elimina de GitHub)" });

  } catch (error) {
    logger.error("Error desvinculando repositorio:", error);

    return res.status(500).json({
      status: "error",
      message: "Error interno del servidor",
      error: error.message
    });

  } finally {
    if (conn) conn.release();
  }
});
