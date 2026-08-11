// src/database/connection.js
import mysql from "mysql2/promise";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";

let pool;

export const initMySQL = () => {
    pool = mysql.createPool({
        host: env.db.host,
        user: env.db.user,
        password: env.db.password,
        database: env.db.database,
        port: env.db.port,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
    });

    logger.info("✓ Pool MySQL2 inicializado correctamente.");
};

export const getConnection = async () => {
    if (!pool) initMySQL();
    return await pool.getConnection();
};

export const query = async (sql, params = []) => {
    if (!pool) initMySQL();
    const [rows] = await pool.query(sql, params);
    return rows;
};
