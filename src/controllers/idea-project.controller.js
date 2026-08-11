import { Router } from "express";
import { getConnection } from "../database/connection.js";
import { logger } from "../config/logger.js";
import { env } from "../config/env.js";

export const ideaRouter = Router();

const TABLE = "projects";

// Obtener ideas de proyectos
// ======================== GET ========================
ideaRouter.get("/", async (req, res) => {
    let conn;

    try {
        conn = await getConnection();
        const db = env.db.database;

        const query = `
            SELECT id, title, description FROM ${db}.${TABLE} WHERE activate = 0
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
        logger.error("Error en ideaRouter:", error);

        return res.status(500).json({
            status: "error",
            message: "Error interno del servidor",
            error: error.message
        });

    } finally {
        if (conn) conn.release();
    }
});

// Guardar idea
// ======================== POST ========================
ideaRouter.post("/", async (req, res) => {
    const { title, description, type_id } = req.body;

    if (!title || !description || !type_id) {
        return res.status(400).json({
            status: "error",
            message: "Datos incompletos: se requiere title, description y type_id"
        });
    }

    let conn;

    try {
        conn = await getConnection();
        const db = env.db.database;

        const query = `
            INSERT INTO ${db}.${TABLE} (title, description, type_id) VALUES (?, ?, ?)
        `;

        await conn.query(query, [title, description, type_id]);

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
ideaRouter.put("/:id", async (req, res) => {
    const { id } = req.params;
    const { title, description } = req.body;

    if (!id) {
        return res.status(400).json({
            status: "error",
            message: "El ID es requerido"
        });
    }

    if (!title || !description) {
        return res.status(400).json({
            status: "error",
            message: "Datos incompletos: se requiere id, title y description"
        });
    }

    let conn;

    try {
        conn = await getConnection();
        const db = env.db.database;

        const query = `
            UPDATE ${db}.${TABLE} SET title = ?, description = ? WHERE id = ?;
        `;

        const [result] = await conn.query(query, [title, description, id]);

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

// Activar los proyectos
// ======================== PUT ========================
ideaRouter.put("/active/:id", async (req, res) => {
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
            UPDATE ${db}.${TABLE} SET status = "starting", activate = 1 WHERE id = ?;
        `;

        const [result] = await conn.query(query, [id]);

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

// Desactivar los proyectos
// ======================== PUT ========================
ideaRouter.put("/deactivate/:id", async (req, res) => {
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
            UPDATE ${db}.${TABLE} SET status = "without starting", activate = 0 WHERE id = ?;
        `;

        const [result] = await conn.query(query, [id]);

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
ideaRouter.delete("/:id", async (req, res) => {
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
