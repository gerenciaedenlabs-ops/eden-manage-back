import { Router } from "express";
import { getConnection } from "../database/connection.js";
import { logger } from "../config/logger.js";
import { env } from "../config/env.js";

export const notificationsRouter = Router();

// ======================== GET notificaciones del usuario autenticado ========================
notificationsRouter.get("/", async (req, res) => {
    let conn;

    try {
        conn = await getConnection();
        const db = env.db.database;

        const [rows] = await conn.query(
            `SELECT id, type, message, related_task_id, is_read, created_at
             FROM ${db}.notifications
             WHERE user_id = ?
             ORDER BY created_at DESC
             LIMIT 50`,
            [req.user.id]
        );

        const [[{ unread }]] = await conn.query(
            `SELECT COUNT(*) as unread FROM ${db}.notifications WHERE user_id = ? AND is_read = 0`,
            [req.user.id]
        );

        return res.json({
            status: "ok",
            data: rows,
            unread
        });

    } catch (error) {
        logger.error("Error obteniendo notificaciones:", error);

        return res.status(500).json({
            status: "error",
            message: "Error interno del servidor",
            error: error.message
        });

    } finally {
        if (conn) conn.release();
    }
});

// ======================== PUT marcar una notificación como leída ========================
notificationsRouter.put("/:id/read", async (req, res) => {
    const { id } = req.params;

    let conn;

    try {
        conn = await getConnection();
        const db = env.db.database;

        const [result] = await conn.query(
            `UPDATE ${db}.notifications SET is_read = 1 WHERE id = ? AND user_id = ?`,
            [id, req.user.id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ status: "error", message: "No se encontró la notificación" });
        }

        return res.json({ status: "ok", message: "Notificación marcada como leída" });

    } catch (error) {
        logger.error("Error actualizando notificación:", error);

        return res.status(500).json({
            status: "error",
            message: "Error interno del servidor",
            error: error.message
        });

    } finally {
        if (conn) conn.release();
    }
});

// ======================== PUT marcar todas como leídas ========================
notificationsRouter.put("/read-all", async (req, res) => {
    let conn;

    try {
        conn = await getConnection();
        const db = env.db.database;

        await conn.query(
            `UPDATE ${db}.notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0`,
            [req.user.id]
        );

        return res.json({ status: "ok", message: "Notificaciones marcadas como leídas" });

    } catch (error) {
        logger.error("Error actualizando notificaciones:", error);

        return res.status(500).json({
            status: "error",
            message: "Error interno del servidor",
            error: error.message
        });

    } finally {
        if (conn) conn.release();
    }
});
