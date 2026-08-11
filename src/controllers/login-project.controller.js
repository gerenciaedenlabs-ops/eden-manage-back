import { hashPassword, verifyPassword } from "../utils/handle/handle-password.js"
import { generateToken } from "../utils/handle/handle-token.js";
import { getConnection } from "../database/connection.js";
import { logger } from "../config/logger.js";
import { env } from "../config/env.js";
import * as jose from "jose";


import { Router } from "express";

export const authUserRouter = Router();

// const TABLE = "example";

authUserRouter.delete("/logout", async (req, res) => {
  const { token } = req.body;

  // 1️⃣ Validación
  if (!token) {
    return res.status(400).json({
      status: "error",
      message: "El token es requerido"
    });
  }

  let conn;

  try {
    conn = await getConnection();
    const db = env.db.database;

    // 2️⃣ Eliminar sesión por token
    const queryDelete = `
            DELETE FROM ${db}.user_sessions
            WHERE token = ?
        `;
    const [result] = await conn.query(queryDelete, [token]);

    if (result.affectedRows === 0) {
      return res.status(404).json({
        status: "error",
        message: "Sesión no encontrada"
      });
    }

    // 3️⃣ Respuesta exitosa
    return res.status(200).json({
      status: "ok",
      message: "Sesión cerrada exitosamente"
    });

  } catch (error) {
    logger.error("Error cerrando sesión:", error);

    return res.status(500).json({
      status: "error",
      message: "Error interno del servidor",
      error: error.message
    });

  } finally {
    if (conn) conn.release();
  }
});

authUserRouter.post("/login", async (req, res) => {
  const { email, password } = req.body;

  // 1️⃣ Validación estilo plantilla
  if (!email || !password) {
    return res.status(400).json({
      status: "error",
      message: "Datos incompletos: se requiere email y password"
    });
  }

  let conn;

  try {
    conn = await getConnection();
    const db = env.db.database;

    // 2️⃣ Buscar usuario
    const queryUser = `
            SELECT 
                id,
                name,
                email,
                password,
                department,
                role
            FROM ${db}.users
            WHERE email = ?
            LIMIT 1
        `;
    const [users] = await conn.query(queryUser, [email]);

    if (users.length === 0) {
      return res.status(404).json({
        status: "error",
        message: "Usuario no encontrado"
      });
    }

    const user = users[0];

    // 3️⃣ Validar contraseña
    const validPassword = await verifyPassword(password, user.password);

    if (!validPassword) {
      return res.status(401).json({
        status: "error",
        message: "Contraseña incorrecta"
      });
    }

    // 4️⃣ Generar token
    const token = await generateToken(
      {
        id: user.id,
      },
      "2h"
    );

    // Eliminar contraseña del objeto user
    delete user.password;

    // 5️⃣ Registrar sesión
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 2 * 60 * 60 * 1000); // +2 horas

    const querySession = `
            INSERT INTO ${db}.user_sessions
                (user_id, token, created_at, expires_at)
            VALUES (?, ?, ?, ?)
        `;
    await conn.query(querySession, [
      user.id,
      token,
      now,
      expiresAt
    ]);

    // 6️⃣ Responder
    return res.status(200).json({
      status: "ok",
      message: "Login exitoso 🚀",
      user,
      token
    });

  } catch (error) {
    logger.error("Error en login:", error);

    return res.status(500).json({
      status: "error",
      message: "Error al iniciar sesión",
      error: error.message
    });

  } finally {
    if (conn) conn.release();
  }
});

authUserRouter.post("/register", async (req, res) => {
  const { name, email, password, role, department } = req.body;

  // 1️⃣ Validación según plantilla
  if (!name || !email || !password || !role) {
    return res.status(400).json({
      status: "error",
      message: "Datos incompletos: name, email, password y role son obligatorios"
    });
  }

  let conn;

  try {
    conn = await getConnection();
    const db = env.db.database;

    // 2️⃣ Iniciar transacción
    await conn.beginTransaction();

    // 3️⃣ Verificar si el email ya existe
    const queryCheckEmail = `
            SELECT id FROM ${db}.users
            WHERE email = ?
            LIMIT 1
        `;
    const [existing] = await conn.query(queryCheckEmail, [email]);

    if (existing.length > 0) {
      await conn.rollback();
      return res.status(409).json({
        status: "error",
        message: "El correo ya está registrado"
      });
    }

    // 4️⃣ Obtener rol solicitado
    const queryRole = `
            SELECT id FROM ${db}.roles
            WHERE name = ?
            LIMIT 1
        `;
    const [roleResult] = await conn.query(queryRole, [role]);

    if (roleResult.length === 0) {
      await conn.rollback();
      return res.status(400).json({
        status: "error",
        message: `El rol '${role}' no existe`
      });
    }

    const roleId = roleResult[0].id;

    // 5️⃣ Hash de contraseña
    const hashedPassword = await hashPassword(password);

    // 6️⃣ Insertar usuario
    const queryInsertUser = `
            INSERT INTO ${db}.users
                (name, email, password, department)
            VALUES (?, ?, ?, ?)
        `;
    const [insertUser] = await conn.query(queryInsertUser, [
      name,
      email,
      hashedPassword,
      department || null
    ]);

    const userId = insertUser.insertId;

    // 7️⃣ Insertar relación user → role
    const queryUserRole = `
            INSERT INTO ${db}.user_roles (user_id, role_id)
            VALUES (?, ?)
        `;
    await conn.query(queryUserRole, [userId, roleId]);

    // 8️⃣ Confirmar transacción
    await conn.commit();

    // 9️⃣ Generar token
    const token = await generateToken({ id: userId }, "2h");


    return res.status(201).json({
      status: "ok",
      message: "Usuario registrado correctamente 🚀",
      user: {
        id: userId,
        name,
        email,
        department,
        role
      },
      token
    });

  } catch (error) {
    logger.error("Error al registrar usuario:", error);

    // Revertir transacción en caso de error
    if (conn) await conn.rollback();

    return res.status(500).json({
      status: "error",
      message: "Error del servidor",
      error: error.message
    });

  } finally {
    if (conn) conn.release();
  }
});
