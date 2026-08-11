import { Router } from "express";
import { getConnection } from "../database/connection.js";
import { logger } from "../config/logger.js";
import { env } from "../config/env.js";
import { randomUUID } from "node:crypto";
import multer from "multer";

export const pricesRouter = Router();

const storage = multer.memoryStorage();
const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }
});

const paymentUpload = upload.fields([
    { name: 'image', maxCount: 1 },
    { name: 'signature', maxCount: 1 }
]);

// Table Names
const TABLE_PROJECTS = "prices_projects";
const TABLE_PHASES = "prices_phases";
const TABLE_PARTIES = "prices_involved_parties";
const TABLE_PAYMENTS = "prices_payments";

// =================================================================
// 1. PROJECTS
// =================================================================

// GET /projects (Select all projects)
pricesRouter.get("/projects", async (req, res) => {
    let conn;
    try {
        conn = await getConnection();
        const db = env.db.database;

        const query = `SELECT * FROM ${db}.${TABLE_PROJECTS}`;
        const [rows] = await conn.query(query);

        if (!rows || rows.length === 0) {
            return res.status(404).json({
                status: "error",
                message: "No se encontraron proyectos"
            });
        }

        return res.json({
            status: "ok",
            data: rows
        });

    } catch (error) {
        logger.error("Error en GET /projects:", error);
        return res.status(500).json({
            status: "error",
            message: "Error interno del servidor",
            error: error.message
        });
    } finally {
        if (conn) conn.release();
    }
});

// GET /projects/:id (Select a single project)
pricesRouter.get("/projects/:id", async (req, res) => {
    const { id } = req.params;
    let conn;
    try {
        conn = await getConnection();
        const db = env.db.database;

        const query = `SELECT * FROM ${db}.${TABLE_PROJECTS} WHERE id = ?`;
        const [rows] = await conn.query(query, [id]);

        if (!rows || rows.length === 0) {
            return res.status(404).json({
                status: "error",
                message: "Proyecto no encontrado"
            });
        }

        return res.json({
            status: "ok",
            data: rows[0]
        });

    } catch (error) {
        logger.error("Error en GET /projects/:id:", error);
        return res.status(500).json({
            status: "error",
            message: "Error interno del servidor",
            error: error.message
        });
    } finally {
        if (conn) conn.release();
    }
});

// POST /projects (Insert a new Project)
pricesRouter.post("/projects", async (req, res) => {
    const { name, client, description, currency, mode, total_price, initial_payment_percentage } = req.body;

    // Required fields check (based on NOT NULL in schema)
    if (!name || !currency || !mode || total_price === undefined) {
        return res.status(400).json({
            status: "error",
            message: "Datos incompletos: se requiere name, currency, mode y total_price"
        });
    }

    let conn;
    try {
        conn = await getConnection();
        const db = env.db.database;

        const id = randomUUID();
        const created_at = new Date(); // Passing Date object, mysql2 handles it usually, or stringify? Helper used date string.
        // Example uses '2023-11-01 09:00:00'. I'll use ISO string or Date object. 
        // Best to use new Date() and let driver handle or .toISOString().

        const query = `
            INSERT INTO ${db}.${TABLE_PROJECTS} 
            (id, name, client, description, currency, mode, total_price, initial_payment_percentage, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        await conn.query(query, [
            id,
            name,
            client || null,
            description || null,
            currency,
            mode,
            total_price,
            initial_payment_percentage || 0,
            created_at
        ]);

        return res.status(201).json({
            status: "ok",
            message: "Proyecto creado con éxito",
            data: { id }
        });

    } catch (error) {
        logger.error("Error en POST /projects:", error);
        return res.status(500).json({
            status: "error",
            message: "Error al crear el proyecto",
            error: error.message
        });
    } finally {
        if (conn) conn.release();
    }
});

// PUT /projects/:id (Update project description and price)
pricesRouter.put("/projects/:id", async (req, res) => {
    const { id } = req.params;
    const { description, total_price } = req.body;

    if (!description || total_price === undefined) {
        return res.status(400).json({
            status: "error",
            message: "Datos incompletos: se requiere description y total_price"
        });
    }

    let conn;
    try {
        conn = await getConnection();
        const db = env.db.database;

        const query = `
            UPDATE ${db}.${TABLE_PROJECTS} 
            SET description = ?, total_price = ?
            WHERE id = ?
        `;

        const [result] = await conn.query(query, [description, total_price, id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({
                status: "error",
                message: "No se encontró el proyecto a actualizar"
            });
        }

        return res.json({
            status: "ok",
            message: "Proyecto actualizado con éxito"
        });

    } catch (error) {
        logger.error("Error en PUT /projects/:id:", error);
        return res.status(500).json({
            status: "error",
            message: "Error interno del servidor",
            error: error.message
        });
    } finally {
        if (conn) conn.release();
    }
});

// DELETE /projects/:id (Delete a project)
pricesRouter.delete("/projects/:id", async (req, res) => {
    const { id } = req.params;
    let conn;
    try {
        conn = await getConnection();
        const db = env.db.database;

        const query = `DELETE FROM ${db}.${TABLE_PROJECTS} WHERE id = ?`;
        const [result] = await conn.query(query, [id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({
                status: "error",
                message: "No se encontró el proyecto a eliminar"
            });
        }

        return res.json({
            status: "ok",
            message: "Proyecto eliminado con éxito"
        });

    } catch (error) {
        logger.error("Error en DELETE /projects/:id:", error);
        return res.status(500).json({
            status: "error",
            message: "Error interno del servidor",
            error: error.message
        });
    } finally {
        if (conn) conn.release();
    }
});

// =================================================================
// 2. PHASES
// =================================================================

// GET /projects/:id/phases (Select all phases for a specific project)
pricesRouter.get("/projects/:id/phases", async (req, res) => {
    const { id } = req.params; // project_id
    let conn;
    try {
        conn = await getConnection();
        const db = env.db.database;

        const query = `SELECT * FROM ${db}.${TABLE_PHASES} WHERE project_id = ?`;
        const [rows] = await conn.query(query, [id]);

        if (!rows || rows.length === 0) {
            // Note: Returning 404 for empty list might be strict but consistent with example
            return res.status(404).json({
                status: "error",
                message: "No se encontraron fases para este proyecto"
            });
        }

        return res.json({
            status: "ok",
            data: rows
        });

    } catch (error) {
        logger.error("Error en GET /projects/:id/phases:", error);
        return res.status(500).json({
            status: "error",
            message: "Error interno del servidor",
            error: error.message
        });
    } finally {
        if (conn) conn.release();
    }
});

// POST /phases (Insert a Phase)
pricesRouter.post("/phases", async (req, res) => {
    const { project_id, name, price, status } = req.body;

    if (!project_id || !name || price === undefined) {
        return res.status(400).json({
            status: "error",
            message: "Datos incompletos: se requiere project_id, name y price"
        });
    }

    let conn;
    try {
        conn = await getConnection();
        const db = env.db.database;

        const id = randomUUID();
        const phaseStatus = status || 'pending';

        const query = `
            INSERT INTO ${db}.${TABLE_PHASES} (id, project_id, name, price, status)
            VALUES (?, ?, ?, ?, ?)
        `;

        await conn.query(query, [id, project_id, name, price, phaseStatus]);

        return res.status(201).json({
            status: "ok",
            message: "Fase creada con éxito",
            data: { id }
        });

    } catch (error) {
        logger.error("Error en POST /phases:", error);
        return res.status(500).json({
            status: "error",
            message: "Error al crear la fase",
            error: error.message
        });
    } finally {
        if (conn) conn.release();
    }
});

// PUT /phases/:id (Update phase status)
pricesRouter.put("/phases/:id", async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
        return res.status(400).json({
            status: "error",
            message: "Se requiere el status"
        });
    }

    let conn;
    try {
        conn = await getConnection();
        const db = env.db.database;

        const query = `UPDATE ${db}.${TABLE_PHASES} SET status = ? WHERE id = ?`;
        const [result] = await conn.query(query, [status, id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({
                status: "error",
                message: "No se encontró la fase a actualizar"
            });
        }

        return res.json({
            status: "ok",
            message: "Estado de fase actualizado con éxito"
        });

    } catch (error) {
        logger.error("Error en PUT /phases/:id:", error);
        return res.status(500).json({
            status: "error",
            message: "Error interno del servidor",
            error: error.message
        });
    } finally {
        if (conn) conn.release();
    }
});

// DELETE /phases/:id (Delete a specific phase)
pricesRouter.delete("/phases/:id", async (req, res) => {
    const { id } = req.params;
    let conn;
    try {
        conn = await getConnection();
        const db = env.db.database;

        const query = `DELETE FROM ${db}.${TABLE_PHASES} WHERE id = ?`;
        const [result] = await conn.query(query, [id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({
                status: "error",
                message: "No se encontró la fase a eliminar"
            });
        }

        return res.json({
            status: "ok",
            message: "Fase eliminada con éxito"
        });

    } catch (error) {
        logger.error("Error en DELETE /phases/:id:", error);
        return res.status(500).json({
            status: "error",
            message: "Error interno del servidor",
            error: error.message
        });
    } finally {
        if (conn) conn.release();
    }
});

// =================================================================
// 3. INVOLVED PARTIES
// =================================================================

// GET /projects/:id/involved-parties (Select all involved parties for a project)
pricesRouter.get("/projects/:id/involved-parties", async (req, res) => {
    const { id } = req.params;
    let conn;
    try {
        conn = await getConnection();
        const db = env.db.database;

        const query = `SELECT * FROM ${db}.${TABLE_PARTIES} WHERE project_id = ?`;
        const [rows] = await conn.query(query, [id]);

        if (!rows || rows.length === 0) {
            return res.status(404).json({
                status: "error",
                message: "No se encontraron partes involucradas"
            });
        }

        return res.json({
            status: "ok",
            data: rows
        });

    } catch (error) {
        logger.error("Error en GET /projects/:id/involved-parties:", error);
        return res.status(500).json({
            status: "error",
            message: "Error interno del servidor",
            error: error.message
        });
    } finally {
        if (conn) conn.release();
    }
});

// POST /involved-parties (Insert an Involved Party)
pricesRouter.post("/involved-parties", async (req, res) => {
    const { project_id, name, role, note } = req.body;

    if (!project_id || !name || !role) {
        return res.status(400).json({
            status: "error",
            message: "Datos incompletos: se requiere project_id, name y role"
        });
    }

    let conn;
    try {
        conn = await getConnection();
        const db = env.db.database;

        const id = randomUUID();

        const query = `
            INSERT INTO ${db}.${TABLE_PARTIES} (id, project_id, name, role, note)
            VALUES (?, ?, ?, ?, ?)
        `;

        await conn.query(query, [id, project_id, name, role, note || null]);

        return res.status(201).json({
            status: "ok",
            message: "Parte involucrada agregada con éxito",
            data: { id }
        });

    } catch (error) {
        logger.error("Error en POST /involved-parties:", error);
        return res.status(500).json({
            status: "error",
            message: "Error al agregar la parte involucrada",
            error: error.message
        });
    } finally {
        if (conn) conn.release();
    }
});

// DELETE /involved-parties/:id (Delete an involved party)
pricesRouter.delete("/involved-parties/:id", async (req, res) => {
    const { id } = req.params;
    let conn;
    try {
        conn = await getConnection();
        const db = env.db.database;

        const query = `DELETE FROM ${db}.${TABLE_PARTIES} WHERE id = ?`;
        const [result] = await conn.query(query, [id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({
                status: "error",
                message: "No se encontró el registro a eliminar"
            });
        }

        return res.json({
            status: "ok",
            message: "Parte involucrada eliminada con éxito"
        });

    } catch (error) {
        logger.error("Error en DELETE /involved-parties/:id:", error);
        return res.status(500).json({
            status: "error",
            message: "Error interno del servidor",
            error: error.message
        });
    } finally {
        if (conn) conn.release();
    }
});

// =================================================================
// 4. PAYMENTS
// =================================================================

// GET /projects/:id/payments (Select all payments for a project)
pricesRouter.get("/projects/:id/payments", async (req, res) => {
    const { id } = req.params;
    let conn;
    try {
        conn = await getConnection();
        const db = env.db.database;

        const query = `SELECT * FROM ${db}.${TABLE_PAYMENTS} WHERE project_id = ?`;
        const [rows] = await conn.query(query, [id]);

        if (!rows || rows.length === 0) {
            return res.status(404).json({
                status: "error",
                message: "No se encontraron pagos para este proyecto"
            });
        }

        return res.json({
            status: "ok",
            data: rows
        });

    } catch (error) {
        logger.error("Error en GET /projects/:id/payments:", error);
        return res.status(500).json({
            status: "error",
            message: "Error interno del servidor",
            error: error.message
        });
    } finally {
        if (conn) conn.release();
    }
});

// GET /phases/:id/payments (Select payments for a specific phase)
pricesRouter.get("/phases/:id/payments", async (req, res) => {
    const { id } = req.params;
    let conn;
    try {
        conn = await getConnection();
        const db = env.db.database;

        const query = `SELECT * FROM ${db}.${TABLE_PAYMENTS} WHERE phase_id = ?`;
        const [rows] = await conn.query(query, [id]);

        if (!rows || rows.length === 0) {
            return res.status(404).json({
                status: "error",
                message: "No se encontraron pagos para esta fase"
            });
        }

        return res.json({
            status: "ok",
            data: rows
        });

    } catch (error) {
        logger.error("Error en GET /phases/:id/payments:", error);
        return res.status(500).json({
            status: "error",
            message: "Error interno del servidor",
            error: error.message
        });
    } finally {
        if (conn) conn.release();
    }
});

// POST /payments (Insert a Payment)
pricesRouter.post("/payments", paymentUpload, async (req, res) => {
    const { project_id, phase_id, amount, date, note, payment_method, percentage } = req.body;

    if (!project_id || amount === undefined || !date || !payment_method) {
        return res.status(400).json({
            status: "error",
            message: "Datos incompletos: se requiere project_id, amount, date y payment_method"
        });
    }

    let conn;
    try {
        conn = await getConnection();
        const db = env.db.database;

        const id = randomUUID();

        let imageBase64 = null;
        let signatureBase64 = null;

        if (req.files?.image?.[0]) {
            const file = req.files.image[0];
            imageBase64 = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
        }

        if (req.files?.signature?.[0]) {
            const file = req.files.signature[0];
            signatureBase64 = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
        }

        const query = `
            INSERT INTO ${db}.${TABLE_PAYMENTS} (id, project_id, phase_id, amount, date, note, image, signature, payment_method, percentage)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        await conn.query(query, [
            id,
            project_id,
            phase_id || null,
            amount,
            date,
            note || null,
            imageBase64,
            signatureBase64,
            payment_method,
            percentage || null
        ]);

        return res.status(201).json({
            status: "ok",
            message: "Pago registrado con éxito",
            data: { id }
        });

    } catch (error) {
        logger.error("Error en POST /payments:", error);
        return res.status(500).json({
            status: "error",
            message: "Error al registrar el pago",
            error: error.message
        });
    } finally {
        if (conn) conn.release();
    }
});

// PUT /payments/:id (Update payment note)
pricesRouter.put("/payments/:id", async (req, res) => {
    const { id } = req.params;
    const { note } = req.body;

    if (!note) {
        return res.status(400).json({
            status: "error",
            message: "Se requiere la nota (note) para actualizar"
        });
    }

    let conn;
    try {
        conn = await getConnection();
        const db = env.db.database;

        const query = `UPDATE ${db}.${TABLE_PAYMENTS} SET note = ? WHERE id = ?`;
        const [result] = await conn.query(query, [note, id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({
                status: "error",
                message: "No se encontró el pago a actualizar"
            });
        }

        return res.json({
            status: "ok",
            message: "Nota de pago actualizada con éxito"
        });

    } catch (error) {
        logger.error("Error en PUT /payments/:id:", error);
        return res.status(500).json({
            status: "error",
            message: "Error interno del servidor",
            error: error.message
        });
    } finally {
        if (conn) conn.release();
    }
});

// DELETE /payments/:id (Delete a specific payment)
pricesRouter.delete("/payments/:id", async (req, res) => {
    const { id } = req.params;
    let conn;
    try {
        conn = await getConnection();
        const db = env.db.database;

        const query = `DELETE FROM ${db}.${TABLE_PAYMENTS} WHERE id = ?`;
        const [result] = await conn.query(query, [id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({
                status: "error",
                message: "No se encontró el pago a eliminar"
            });
        }

        return res.json({
            status: "ok",
            message: "Pago eliminado con éxito"
        });

    } catch (error) {
        logger.error("Error en DELETE /payments/:id:", error);
        return res.status(500).json({
            status: "error",
            message: "Error interno del servidor",
            error: error.message
        });
    } finally {
        if (conn) conn.release();
    }
});
