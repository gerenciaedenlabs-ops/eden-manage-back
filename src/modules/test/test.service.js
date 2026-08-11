import { pool } from "../../config/database.js";

export const testService = {
    async getAll() {
        const [rows] = await pool.query("SELECT * FROM table_test");
        return rows;
    },

    async create({ column1, column2 }) {
        await pool.query("INSERT INTO table_test (column1, column2) VALUES (?, ?)", [column1, column2]);
    },

    async update({ id, column1, column2 }) {
        const [result] = await pool.query(
            "UPDATE table_test SET column1 = ?, column2 = ? WHERE id = ?",
            [column1, column2, id]
        );
        if (result.affectedRows === 0) throw new Error("No se encontró el ID");
    },

    async remove(id) {
        const [result] = await pool.query("DELETE FROM table_test WHERE id = ?", [id]);
        if (result.affectedRows === 0) throw new Error("No se encontró el ID");
    },
};
