// Runner de un solo uso para aplicar un archivo .sql de src/database/migrations/
// Uso: node scripts/run-migration.js src/database/migrations/2026_08_add_subtasks_checklist.sql
import { readFile } from "fs/promises";
import { getConnection } from "../src/database/connection.js";

const filePath = process.argv[2];

if (!filePath) {
    console.error("Uso: node scripts/run-migration.js <ruta-al-archivo.sql>");
    process.exit(1);
}

const sql = await readFile(filePath, "utf-8");
const statements = sql
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);

const conn = await getConnection();

try {
    for (const statement of statements) {
        console.log(`\n> Ejecutando:\n${statement};`);
        await conn.query(statement);
        console.log("  ✓ OK");
    }
    console.log(`\nMigración completada: ${statements.length} statements ejecutados.`);
} catch (error) {
    console.error("\n✗ Error ejecutando la migración:", error.message);
    process.exitCode = 1;
} finally {
    conn.release();
    process.exit();
}
