import { Router } from "express";
import { getConnection } from "../database/connection.js";
import { logger } from "../config/logger.js";
import { env } from "../config/env.js";

export const projectManagerRouter = Router();

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

    const query = `
        SELECT t.id, t.project_id, t.title, t.description, u.name as assigned_to, t.status 
        FROM ${db}.tasks t
        INNER JOIN ${db}.users u
        ON t.assigned_to = u.id
        WHERE project_id = ?
        `;

    const [rows] = await conn.query(query, [project_id]);

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
