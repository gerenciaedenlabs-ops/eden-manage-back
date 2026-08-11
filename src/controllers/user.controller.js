import { Router } from "express";
import { getConnection } from "../database/connection.js";
import { logger } from "../config/logger.js";
import { env } from "../config/env.js";

export const usersRouter = Router();

const TABLE = "users";

// ======================== GET Usuario ========================
usersRouter.get("/", async (req, res) => {
  let conn;

  try {
    conn = await getConnection();
    const db = env.db.database;

    const query = `
        SELECT
            u.id,
            u.name,
            u.email,
            d.name AS department,
            r.name AS role
        FROM ${db}.${TABLE} u
        LEFT JOIN ${db}.departments d
            ON u.department = d.id
        LEFT JOIN ${db}.roles r
            ON u.role = r.id;
    `;

    const [rows] = await conn.query(query);

    if (!rows || rows.length === 0) {
      return res.status(404).json({
        status: "error",
        message: "No se encontraron registros",
      });
    }

    return res.json({
      status: "ok",
      data: rows,
    });
  } catch (error) {
    logger.error("Error en usersRouter:", error);

    return res.status(500).json({
      status: "error",
      message: "Error interno del servidor",
      error: error.message,
    });
  } finally {
    if (conn) conn.release();
  }
});

// ======================== GET Roles ========================
usersRouter.get("/roles", async (req, res) => {
  let conn;

  try {
    conn = await getConnection();
    const db = env.db.database;

    const query = `
        SELECT id, name FROM ${db}.roles
        `;

    const [rows] = await conn.query(query);

    if (!rows || rows.length === 0) {
      return res.status(404).json({
        status: "error",
        message: "No se encontraron registros",
      });
    }

    return res.json({
      status: "ok",
      data: rows,
    });
  } catch (error) {
    logger.error("Error en usersRouter:", error);

    return res.status(500).json({
      status: "error",
      message: "Error interno del servidor",
      error: error.message,
    });
  } finally {
    if (conn) conn.release();
  }
});

// ======================== GET Departamento ========================
usersRouter.get("/department", async (req, res) => {
  let conn;

  try {
    conn = await getConnection();
    const db = env.db.database;

    const query = `
        SELECT id, name FROM ${db}.departments
        `;

    const [rows] = await conn.query(query);

    if (!rows || rows.length === 0) {
      return res.status(404).json({
        status: "error",
        message: "No se encontraron registros",
      });
    }

    return res.json({
      status: "ok",
      data: rows,
    });
  } catch (error) {
    logger.error("Error en usersRouter:", error);

    return res.status(500).json({
      status: "error",
      message: "Error interno del servidor",
      error: error.message,
    });
  } finally {
    if (conn) conn.release();
  }
});

// ======================== POST Usuario ========================
usersRouter.post("/", async (req, res) => {
  const { name, role, department } = req.body;

  if (!name || !role || !department) {
    return res.status(400).json({
      status: "error",
      message: "Datos incompletos: se requiere name, role y department",
    });
  }

  let conn;

  try {
    conn = await getConnection();
    const db = env.db.database;

    const query = `
            INSERT INTO ${db}.${TABLE} (name, role, department) VALUES (?, ?, ?)
        `;

    await conn.query(query, [name, role, department]);

    return res.status(201).json({
      status: "ok",
      message: "Datos guardados con éxito 🚀",
    });
  } catch (error) {
    logger.error("Error guardando ModulePermissions:", error);

    return res.status(500).json({
      status: "error",
      message: "Error al guardar los datos",
      error: error.message,
    });
  } finally {
    if (conn) conn.release();
  }
});

// ======================== PUT Usuario ========================
usersRouter.put("/:id", async (req, res) => {
  const { id } = req.params;
  const { name, role, department } = req.body;

  if (!id) {
    return res.status(400).json({
      status: "error",
      message: "El ID es requerido",
    });
  }

  if (!name || !department) {
    return res.status(400).json({
      status: "error",
      message: "Datos incompletos: se requiere name, role y department",
    });
  }

  let conn;

  try {
    conn = await getConnection();
    const db = env.db.database;

    const query = `
        UPDATE ${db}.${TABLE} SET name = ?, role = ?, department = ? WHERE id = ?;
        `;

    const [result] = await conn.query(query, [name, role, department, id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({
        status: "error",
        message: "No se encontró el registro a actualizar",
      });
    }

    return res.json({
      status: "ok",
      message: "Registro actualizado con éxito",
    });
  } catch (error) {
    logger.error("Error actualizando ModulePermissions:", error);

    return res.status(500).json({
      status: "error",
      message: "Error interno del servidor",
      error: error.message,
    });
  } finally {
    if (conn) conn.release();
  }
});

// ======================== DELETE Usuario ========================
usersRouter.delete("/:id", async (req, res) => {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({
      status: "error",
      message: "El ID es requerido",
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
        message: "No se encontró el registro a eliminar",
      });
    }

    return res.json({
      status: "ok",
      message: "Registro eliminado con éxito",
    });
  } catch (error) {
    logger.error("Error eliminando ModulePermissions:", error);

    return res.status(500).json({
      status: "error",
      message: "Error interno del servidor",
      error: error.message,
    });
  } finally {
    if (conn) conn.release();
  }
});
