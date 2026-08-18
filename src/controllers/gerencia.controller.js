import { Router } from "express";
import { getConnection } from "../database/connection.js";
import { logger } from "../config/logger.js";
import { env } from "../config/env.js";

export const gerenciaRouter = Router();

// Ajusta un día de mes (1-31) al último día real de ese mes/año (ej. 31 -> 28/29 en febrero).
const clampDueDate = (year, month, day) => {
  const lastDay = new Date(year, month, 0).getDate();
  const safeDay = Math.min(day, lastDay);
  return new Date(year, month - 1, safeDay);
};

const toDateStr = (date) => date.toISOString().slice(0, 10);

// Revisa los items activos del presupuesto fijo y, para los que ya cumplieron su día
// del mes y todavía no tienen una "occurrence" para el periodo actual, la crea:
// - Categoría != Variable -> aplica el movimiento automáticamente.
// - Categoría == Variable -> queda pendiente de confirmación (no crea movimiento aún).
//
// Esta función se llama desde varios endpoints (GET /summary, GET /budget-items), y el
// frontend los llama en paralelo al cargar la pantalla -> pueden ejecutarse dos
// reconciliaciones al mismo tiempo. Para que sea segura ante esa concurrencia, primero
// se "reserva" el periodo con INSERT IGNORE (protegido por la UNIQUE KEY
// (budget_item_id, period) a nivel de base de datos, atómico): si dos requests compiten,
// solo uno logra insertar la fila (affectedRows=1) y es el único que sigue adelante y
// crea el movimiento; el otro ve affectedRows=0 y no hace nada. Antes esta función
// primero creaba el movimiento y solo después intentaba reservar el periodo, dejando una
// ventana real de carrera que producía movimientos duplicados.
const reconcileBudgetOccurrences = async (conn, db) => {
  const [items] = await conn.query(
    `SELECT id, type, category, description, amount, due_day FROM ${db}.gerencia_budget_items WHERE active = 1`
  );

  if (items.length === 0) return;

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const period = `${year}-${String(month).padStart(2, "0")}`;
  const today = new Date(year, month - 1, now.getDate());

  for (const item of items) {
    const dueDate = clampDueDate(year, month, item.due_day);
    if (dueDate > today) continue;

    const dueDateStr = toDateStr(dueDate);

    const [reserveResult] = await conn.query(
      `INSERT IGNORE INTO ${db}.gerencia_budget_occurrences (budget_item_id, period, due_date, status) VALUES (?, ?, ?, 'pending_confirmation')`,
      [item.id, period, dueDateStr]
    );

    // affectedRows = 0 significa que ya existía (otro request se adelantó, o ya se procesó antes).
    if (reserveResult.affectedRows === 0) continue;

    const occurrenceId = reserveResult.insertId;

    if (item.category !== "Variable") {
      const [txResult] = await conn.query(
        `INSERT INTO ${db}.gerencia_transactions (type, category, description, amount, date) VALUES (?, ?, ?, ?, ?)`,
        [item.type, item.category, item.description, item.amount, dueDateStr]
      );
      await conn.query(
        `UPDATE ${db}.gerencia_budget_occurrences SET status = 'auto_applied', transaction_id = ? WHERE id = ?`,
        [txResult.insertId, occurrenceId]
      );
    }
    // Variable: queda tal cual, insertada como 'pending_confirmation'.
  }
};

// ======================== GET items de presupuesto fijo mensual ========================
gerenciaRouter.get("/budget-items", async (req, res) => {
  let conn;

  try {
    conn = await getConnection();
    const db = env.db.database;

    await reconcileBudgetOccurrences(conn, db);

    const [rows] = await conn.query(
      `SELECT id, type, category, description, amount, due_day, active, created_at
       FROM ${db}.gerencia_budget_items
       ORDER BY type ASC, category ASC, id ASC`
    );

    return res.json({ status: "ok", data: rows });
  } catch (error) {
    logger.error("Error listando items de presupuesto:", error);
    return res.status(500).json({ status: "error", message: "Error interno del servidor", error: error.message });
  } finally {
    if (conn) conn.release();
  }
});

// ======================== POST item de presupuesto ========================
gerenciaRouter.post("/budget-items", async (req, res) => {
  const { type, category, description, amount, due_day } = req.body;

  if (!type || !category || !description || !amount || !due_day) {
    return res.status(400).json({
      status: "error",
      message: "Datos incompletos: se requiere type, category, description, amount y due_day",
    });
  }

  const dueDay = Number(due_day);
  if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31) {
    return res.status(400).json({ status: "error", message: "due_day debe ser un entero entre 1 y 31" });
  }

  let conn;

  try {
    conn = await getConnection();
    const db = env.db.database;

    await conn.query(
      `INSERT INTO ${db}.gerencia_budget_items (type, category, description, amount, due_day) VALUES (?, ?, ?, ?, ?)`,
      [type, category, description, amount, dueDay]
    );

    return res.status(201).json({ status: "ok", message: "Item de presupuesto guardado con éxito" });
  } catch (error) {
    logger.error("Error creando item de presupuesto:", error);
    return res.status(500).json({ status: "error", message: "Error interno del servidor", error: error.message });
  } finally {
    if (conn) conn.release();
  }
});

// ======================== PUT item de presupuesto (edición parcial) ========================
gerenciaRouter.put("/budget-items/:id", async (req, res) => {
  const { id } = req.params;
  const { type, category, description, amount, due_day, active } = req.body;

  const fields = [];
  const values = [];

  if (type !== undefined) { fields.push("type = ?"); values.push(type); }
  if (category !== undefined) { fields.push("category = ?"); values.push(category); }
  if (description !== undefined) { fields.push("description = ?"); values.push(description); }
  if (amount !== undefined) { fields.push("amount = ?"); values.push(amount); }
  if (due_day !== undefined) { fields.push("due_day = ?"); values.push(Number(due_day)); }
  if (active !== undefined) { fields.push("active = ?"); values.push(active ? 1 : 0); }

  if (fields.length === 0) {
    return res.status(400).json({ status: "error", message: "No hay datos para actualizar" });
  }

  values.push(id);

  let conn;

  try {
    conn = await getConnection();
    const db = env.db.database;

    const [result] = await conn.query(
      `UPDATE ${db}.gerencia_budget_items SET ${fields.join(", ")} WHERE id = ?`,
      values
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ status: "error", message: "No se encontró el registro a actualizar" });
    }

    return res.json({ status: "ok", message: "Item de presupuesto actualizado con éxito" });
  } catch (error) {
    logger.error("Error actualizando item de presupuesto:", error);
    return res.status(500).json({ status: "error", message: "Error interno del servidor", error: error.message });
  } finally {
    if (conn) conn.release();
  }
});

// ======================== DELETE item de presupuesto ========================
gerenciaRouter.delete("/budget-items/:id", async (req, res) => {
  const { id } = req.params;
  let conn;

  try {
    conn = await getConnection();
    const db = env.db.database;

    const [result] = await conn.query(`DELETE FROM ${db}.gerencia_budget_items WHERE id = ?`, [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ status: "error", message: "No se encontró el registro a eliminar" });
    }

    return res.json({ status: "ok", message: "Item de presupuesto eliminado con éxito" });
  } catch (error) {
    logger.error("Error eliminando item de presupuesto:", error);
    return res.status(500).json({ status: "error", message: "Error interno del servidor", error: error.message });
  } finally {
    if (conn) conn.release();
  }
});

// ======================== GET movimientos puntuales ========================
gerenciaRouter.get("/transactions", async (req, res) => {
  let conn;

  try {
    conn = await getConnection();
    const db = env.db.database;

    const [rows] = await conn.query(
      `SELECT id, type, category, description, amount, date, created_at
       FROM ${db}.gerencia_transactions
       ORDER BY date DESC, id DESC`
    );

    return res.json({ status: "ok", data: rows });
  } catch (error) {
    logger.error("Error listando transacciones de gerencia:", error);
    return res.status(500).json({ status: "error", message: "Error interno del servidor", error: error.message });
  } finally {
    if (conn) conn.release();
  }
});

// ======================== POST movimiento puntual ========================
gerenciaRouter.post("/transactions", async (req, res) => {
  const { type, category, description, amount, date } = req.body;

  if (!type || !category || !description || !amount || !date) {
    return res.status(400).json({
      status: "error",
      message: "Datos incompletos: se requiere type, category, description, amount y date",
    });
  }

  let conn;

  try {
    conn = await getConnection();
    const db = env.db.database;

    await conn.query(
      `INSERT INTO ${db}.gerencia_transactions (type, category, description, amount, date) VALUES (?, ?, ?, ?, ?)`,
      [type, category, description, amount, date]
    );

    return res.status(201).json({ status: "ok", message: "Movimiento guardado con éxito" });
  } catch (error) {
    logger.error("Error creando transacción de gerencia:", error);
    return res.status(500).json({ status: "error", message: "Error interno del servidor", error: error.message });
  } finally {
    if (conn) conn.release();
  }
});

// ======================== PUT movimiento puntual ========================
gerenciaRouter.put("/transactions/:id", async (req, res) => {
  const { id } = req.params;
  const { type, category, description, amount, date } = req.body;

  if (!type || !category || !description || !amount || !date) {
    return res.status(400).json({
      status: "error",
      message: "Datos incompletos: se requiere type, category, description, amount y date",
    });
  }

  let conn;

  try {
    conn = await getConnection();
    const db = env.db.database;

    const [result] = await conn.query(
      `UPDATE ${db}.gerencia_transactions SET type = ?, category = ?, description = ?, amount = ?, date = ? WHERE id = ?`,
      [type, category, description, amount, date, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ status: "error", message: "No se encontró el registro a actualizar" });
    }

    return res.json({ status: "ok", message: "Movimiento actualizado con éxito" });
  } catch (error) {
    logger.error("Error actualizando transacción de gerencia:", error);
    return res.status(500).json({ status: "error", message: "Error interno del servidor", error: error.message });
  } finally {
    if (conn) conn.release();
  }
});

// ======================== DELETE movimiento puntual ========================
gerenciaRouter.delete("/transactions/:id", async (req, res) => {
  const { id } = req.params;
  let conn;

  try {
    conn = await getConnection();
    const db = env.db.database;

    const [result] = await conn.query(`DELETE FROM ${db}.gerencia_transactions WHERE id = ?`, [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ status: "error", message: "No se encontró el registro a eliminar" });
    }

    return res.json({ status: "ok", message: "Movimiento eliminado con éxito" });
  } catch (error) {
    logger.error("Error eliminando transacción de gerencia:", error);
    return res.status(500).json({ status: "error", message: "Error interno del servidor", error: error.message });
  } finally {
    if (conn) conn.release();
  }
});

// ======================== GET préstamos (con cuotas anidadas) ========================
gerenciaRouter.get("/loans", async (req, res) => {
  let conn;

  try {
    conn = await getConnection();
    const db = env.db.database;

    const [loans] = await conn.query(
      `SELECT l.id, l.collaborator_id, u.name AS collaborator_name, l.amount, l.reason, l.loan_date, l.installments_count
       FROM ${db}.gerencia_loans l
       LEFT JOIN ${db}.users u ON l.collaborator_id = u.id
       ORDER BY l.loan_date DESC, l.id DESC`
    );

    let installments = [];
    if (loans.length > 0) {
      const ids = loans.map((l) => l.id);
      const placeholders = ids.map(() => "?").join(",");
      const [rows] = await conn.query(
        `SELECT id, loan_id, installment_number, due_date, amount, paid, paid_at
         FROM ${db}.gerencia_loan_installments
         WHERE loan_id IN (${placeholders})
         ORDER BY installment_number ASC`,
        ids
      );
      installments = rows;
    }

    const installmentsByLoan = {};
    installments.forEach((row) => {
      if (!installmentsByLoan[row.loan_id]) installmentsByLoan[row.loan_id] = [];
      installmentsByLoan[row.loan_id].push(row);
    });

    const data = loans.map((loan) => ({
      ...loan,
      installments: installmentsByLoan[loan.id] || [],
    }));

    return res.json({ status: "ok", data });
  } catch (error) {
    logger.error("Error listando préstamos:", error);
    return res.status(500).json({ status: "error", message: "Error interno del servidor", error: error.message });
  } finally {
    if (conn) conn.release();
  }
});

// ======================== POST préstamo (genera cuotas automáticamente) ========================
gerenciaRouter.post("/loans", async (req, res) => {
  const { collaborator_id, amount, reason, loan_date, installments_count } = req.body;

  if (!collaborator_id || !amount || !loan_date || !installments_count) {
    return res.status(400).json({
      status: "error",
      message: "Datos incompletos: se requiere collaborator_id, amount, loan_date e installments_count",
    });
  }

  const count = Number(installments_count);
  const totalAmount = Number(amount);

  if (!Number.isInteger(count) || count < 1) {
    return res.status(400).json({ status: "error", message: "installments_count debe ser un entero mayor a 0" });
  }

  let conn;

  try {
    conn = await getConnection();
    const db = env.db.database;

    await conn.beginTransaction();

    const [result] = await conn.query(
      `INSERT INTO ${db}.gerencia_loans (collaborator_id, amount, reason, loan_date, installments_count) VALUES (?, ?, ?, ?, ?)`,
      [collaborator_id, totalAmount, reason || null, loan_date, count]
    );

    const loanId = result.insertId;

    // Monto base por cuota, redondeado a centavos; la última cuota absorbe el residuo
    // de redondeo para que la suma cuadre exacto con el monto total del préstamo.
    const baseInstallment = Math.floor((totalAmount / count) * 100) / 100;
    const values = [];

    for (let i = 1; i <= count; i++) {
      const dueDate = new Date(loan_date);
      dueDate.setMonth(dueDate.getMonth() + i);
      const dueDateStr = dueDate.toISOString().slice(0, 10);

      const isLast = i === count;
      const installmentAmount = isLast
        ? Math.round((totalAmount - baseInstallment * (count - 1)) * 100) / 100
        : baseInstallment;

      values.push(loanId, i, dueDateStr, installmentAmount);
    }

    const placeholders = Array(count).fill("(?, ?, ?, ?)").join(", ");
    await conn.query(
      `INSERT INTO ${db}.gerencia_loan_installments (loan_id, installment_number, due_date, amount) VALUES ${placeholders}`,
      values
    );

    await conn.commit();

    return res.status(201).json({ status: "ok", message: "Préstamo registrado con éxito", data: { id: loanId } });
  } catch (error) {
    if (conn) await conn.rollback();
    logger.error("Error creando préstamo:", error);
    return res.status(500).json({ status: "error", message: "Error interno del servidor", error: error.message });
  } finally {
    if (conn) conn.release();
  }
});

// ======================== DELETE préstamo ========================
gerenciaRouter.delete("/loans/:id", async (req, res) => {
  const { id } = req.params;
  let conn;

  try {
    conn = await getConnection();
    const db = env.db.database;

    const [result] = await conn.query(`DELETE FROM ${db}.gerencia_loans WHERE id = ?`, [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ status: "error", message: "No se encontró el préstamo a eliminar" });
    }

    return res.json({ status: "ok", message: "Préstamo eliminado con éxito" });
  } catch (error) {
    logger.error("Error eliminando préstamo:", error);
    return res.status(500).json({ status: "error", message: "Error interno del servidor", error: error.message });
  } finally {
    if (conn) conn.release();
  }
});

// ======================== PUT togglear cuota pagada ========================
gerenciaRouter.put("/installments/:id", async (req, res) => {
  const { id } = req.params;
  const { paid } = req.body;

  if (paid === undefined) {
    return res.status(400).json({ status: "error", message: "Datos incompletos: se requiere paid" });
  }

  let conn;

  try {
    conn = await getConnection();
    const db = env.db.database;

    const [result] = await conn.query(
      `UPDATE ${db}.gerencia_loan_installments SET paid = ?, paid_at = ? WHERE id = ?`,
      [paid ? 1 : 0, paid ? new Date() : null, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ status: "error", message: "No se encontró la cuota a actualizar" });
    }

    return res.json({ status: "ok", message: "Cuota actualizada con éxito" });
  } catch (error) {
    logger.error("Error actualizando cuota:", error);
    return res.status(500).json({ status: "error", message: "Error interno del servidor", error: error.message });
  } finally {
    if (conn) conn.release();
  }
});

// ======================== PUT confirmar alerta de gasto variable ========================
gerenciaRouter.put("/budget-occurrences/:id/confirm", async (req, res) => {
  const { id } = req.params;
  const { amount, date } = req.body;

  if (!amount || !date) {
    return res.status(400).json({ status: "error", message: "Datos incompletos: se requiere amount y date" });
  }

  let conn;

  try {
    conn = await getConnection();
    const db = env.db.database;

    const [[occurrence]] = await conn.query(
      `SELECT o.id, o.status, i.type, i.category, i.description
       FROM ${db}.gerencia_budget_occurrences o
       INNER JOIN ${db}.gerencia_budget_items i ON o.budget_item_id = i.id
       WHERE o.id = ?`,
      [id]
    );

    if (!occurrence) {
      return res.status(404).json({ status: "error", message: "No se encontró la alerta" });
    }

    if (occurrence.status !== "pending_confirmation") {
      return res.status(400).json({ status: "error", message: "Esta alerta ya fue procesada" });
    }

    await conn.beginTransaction();

    const [txResult] = await conn.query(
      `INSERT INTO ${db}.gerencia_transactions (type, category, description, amount, date) VALUES (?, ?, ?, ?, ?)`,
      [occurrence.type, occurrence.category, occurrence.description, amount, date]
    );

    await conn.query(
      `UPDATE ${db}.gerencia_budget_occurrences SET status = 'confirmed', transaction_id = ? WHERE id = ?`,
      [txResult.insertId, id]
    );

    await conn.commit();

    return res.json({ status: "ok", message: "Movimiento confirmado con éxito" });
  } catch (error) {
    if (conn) await conn.rollback();
    logger.error("Error confirmando alerta de presupuesto:", error);
    return res.status(500).json({ status: "error", message: "Error interno del servidor", error: error.message });
  } finally {
    if (conn) conn.release();
  }
});

// ======================== PUT descartar alerta de gasto variable ========================
gerenciaRouter.put("/budget-occurrences/:id/dismiss", async (req, res) => {
  const { id } = req.params;
  let conn;

  try {
    conn = await getConnection();
    const db = env.db.database;

    const [result] = await conn.query(
      `UPDATE ${db}.gerencia_budget_occurrences SET status = 'dismissed' WHERE id = ? AND status = 'pending_confirmation'`,
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ status: "error", message: "No se encontró la alerta o ya fue procesada" });
    }

    return res.json({ status: "ok", message: "Alerta descartada" });
  } catch (error) {
    logger.error("Error descartando alerta de presupuesto:", error);
    return res.status(500).json({ status: "error", message: "Error interno del servidor", error: error.message });
  } finally {
    if (conn) conn.release();
  }
});

// ======================== GET metas de ahorro (con aportes anidados) ========================
gerenciaRouter.get("/savings-goals", async (req, res) => {
  let conn;

  try {
    conn = await getConnection();
    const db = env.db.database;

    const [goals] = await conn.query(
      `SELECT id, name, created_at FROM ${db}.gerencia_savings_goals ORDER BY id ASC`
    );

    let entries = [];
    if (goals.length > 0) {
      const ids = goals.map((g) => g.id);
      const placeholders = ids.map(() => "?").join(",");
      const [rows] = await conn.query(
        `SELECT id, goal_id, amount, date, note FROM ${db}.gerencia_savings_entries WHERE goal_id IN (${placeholders}) ORDER BY date DESC, id DESC`,
        ids
      );
      entries = rows;
    }

    const entriesByGoal = {};
    entries.forEach((entry) => {
      if (!entriesByGoal[entry.goal_id]) entriesByGoal[entry.goal_id] = [];
      entriesByGoal[entry.goal_id].push(entry);
    });

    const data = goals.map((goal) => {
      const goalEntries = entriesByGoal[goal.id] || [];
      return {
        ...goal,
        entries: goalEntries,
        total: goalEntries.reduce((sum, e) => sum + Number(e.amount), 0),
      };
    });

    return res.json({ status: "ok", data });
  } catch (error) {
    logger.error("Error listando metas de ahorro:", error);
    return res.status(500).json({ status: "error", message: "Error interno del servidor", error: error.message });
  } finally {
    if (conn) conn.release();
  }
});

// ======================== POST meta de ahorro ========================
gerenciaRouter.post("/savings-goals", async (req, res) => {
  const { name } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ status: "error", message: "Datos incompletos: se requiere name" });
  }

  let conn;

  try {
    conn = await getConnection();
    const db = env.db.database;

    await conn.query(`INSERT INTO ${db}.gerencia_savings_goals (name) VALUES (?)`, [name.trim()]);

    return res.status(201).json({ status: "ok", message: "Meta de ahorro creada con éxito" });
  } catch (error) {
    logger.error("Error creando meta de ahorro:", error);
    return res.status(500).json({ status: "error", message: "Error interno del servidor", error: error.message });
  } finally {
    if (conn) conn.release();
  }
});

// ======================== DELETE meta de ahorro ========================
gerenciaRouter.delete("/savings-goals/:id", async (req, res) => {
  const { id } = req.params;
  let conn;

  try {
    conn = await getConnection();
    const db = env.db.database;

    const [result] = await conn.query(`DELETE FROM ${db}.gerencia_savings_goals WHERE id = ?`, [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ status: "error", message: "No se encontró la meta a eliminar" });
    }

    return res.json({ status: "ok", message: "Meta de ahorro eliminada con éxito" });
  } catch (error) {
    logger.error("Error eliminando meta de ahorro:", error);
    return res.status(500).json({ status: "error", message: "Error interno del servidor", error: error.message });
  } finally {
    if (conn) conn.release();
  }
});

// ======================== POST aporte a una meta de ahorro ========================
gerenciaRouter.post("/savings-goals/:id/entries", async (req, res) => {
  const { id } = req.params;
  const { amount, date, note } = req.body;

  if (!amount || !date) {
    return res.status(400).json({ status: "error", message: "Datos incompletos: se requiere amount y date" });
  }

  let conn;

  try {
    conn = await getConnection();
    const db = env.db.database;

    await conn.query(
      `INSERT INTO ${db}.gerencia_savings_entries (goal_id, amount, date, note) VALUES (?, ?, ?, ?)`,
      [id, amount, date, note || null]
    );

    return res.status(201).json({ status: "ok", message: "Aporte registrado con éxito" });
  } catch (error) {
    logger.error("Error registrando aporte de ahorro:", error);
    return res.status(500).json({ status: "error", message: "Error interno del servidor", error: error.message });
  } finally {
    if (conn) conn.release();
  }
});

// ======================== DELETE aporte de ahorro ========================
gerenciaRouter.delete("/savings-entries/:id", async (req, res) => {
  const { id } = req.params;
  let conn;

  try {
    conn = await getConnection();
    const db = env.db.database;

    const [result] = await conn.query(`DELETE FROM ${db}.gerencia_savings_entries WHERE id = ?`, [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ status: "error", message: "No se encontró el aporte a eliminar" });
    }

    return res.json({ status: "ok", message: "Aporte eliminado con éxito" });
  } catch (error) {
    logger.error("Error eliminando aporte de ahorro:", error);
    return res.status(500).json({ status: "error", message: "Error interno del servidor", error: error.message });
  } finally {
    if (conn) conn.release();
  }
});

// ======================== GET resumen para el dashboard ========================
gerenciaRouter.get("/summary", async (req, res) => {
  let conn;

  try {
    conn = await getConnection();
    const db = env.db.database;

    await reconcileBudgetOccurrences(conn, db);

    // Saldo total: histórico real de movimientos puntuales, menos lo apartado en ahorro
    // (el presupuesto fijo en sí no cuenta aquí — solo cuenta cuando se convierte en
    // movimiento real vía la reconciliación de arriba).
    const [[balanceRow]] = await conn.query(
      `SELECT
         COALESCE(SUM(CASE WHEN type = 'ingreso' THEN amount ELSE 0 END), 0) AS total_ingresos,
         COALESCE(SUM(CASE WHEN type = 'gasto' THEN amount ELSE 0 END), 0) AS total_gastos
       FROM ${db}.gerencia_transactions`
    );

    const [[savingsRow]] = await conn.query(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM ${db}.gerencia_savings_entries`
    );

    const [pendingConfirmations] = await conn.query(
      `SELECT o.id AS occurrence_id, o.budget_item_id, i.description, i.category, i.amount, o.due_date
       FROM ${db}.gerencia_budget_occurrences o
       INNER JOIN ${db}.gerencia_budget_items i ON o.budget_item_id = i.id
       WHERE o.status = 'pending_confirmation'
       ORDER BY o.due_date ASC`
    );

    // Presupuesto fijo mensual: suma de los items activos, por tipo.
    const [[budgetRow]] = await conn.query(
      `SELECT
         COALESCE(SUM(CASE WHEN type = 'ingreso' THEN amount ELSE 0 END), 0) AS ingresos,
         COALESCE(SUM(CASE WHEN type = 'gasto' THEN amount ELSE 0 END), 0) AS gastos
       FROM ${db}.gerencia_budget_items
       WHERE active = 1`
    );

    const [byCategory] = await conn.query(
      `SELECT category, SUM(amount) AS total
       FROM ${db}.gerencia_budget_items
       WHERE type = 'gasto' AND active = 1
       GROUP BY category
       ORDER BY total DESC`
    );

    const [[payrollRow]] = await conn.query(
      `SELECT COALESCE(SUM(amount), 0) AS total
       FROM ${db}.gerencia_budget_items
       WHERE type = 'gasto' AND category = 'Nómina' AND active = 1`
    );

    const [[loansRow]] = await conn.query(
      `SELECT
         COALESCE((SELECT SUM(amount) FROM ${db}.gerencia_loans), 0) AS total_lent,
         COALESCE((SELECT SUM(amount) FROM ${db}.gerencia_loan_installments WHERE paid = 1), 0) AS total_recovered
      `
    );

    const [upcomingInstallments] = await conn.query(
      `SELECT i.id, i.loan_id, i.installment_number, i.due_date, i.amount, u.name AS collaborator_name
       FROM ${db}.gerencia_loan_installments i
       INNER JOIN ${db}.gerencia_loans l ON i.loan_id = l.id
       LEFT JOIN ${db}.users u ON l.collaborator_id = u.id
       WHERE i.paid = 0
       ORDER BY i.due_date ASC
       LIMIT 5`
    );

    const totalLent = Number(loansRow.total_lent);
    const totalRecovered = Number(loansRow.total_recovered);

    const savingsTotal = Number(savingsRow.total);

    return res.json({
      status: "ok",
      data: {
        balance_total: Number(balanceRow.total_ingresos) - Number(balanceRow.total_gastos) - savingsTotal,
        savings_total: savingsTotal,
        pending_confirmations: pendingConfirmations.map((r) => ({
          ...r,
          amount: Number(r.amount),
        })),
        monthly_budget: {
          ingresos: Number(budgetRow.ingresos),
          gastos: Number(budgetRow.gastos),
        },
        by_category: byCategory.map((r) => ({ category: r.category, total: Number(r.total) })),
        payroll_month: Number(payrollRow.total),
        loans: {
          total_lent: totalLent,
          total_recovered: totalRecovered,
          pending: totalLent - totalRecovered,
          upcoming_installments: upcomingInstallments,
        },
      },
    });
  } catch (error) {
    logger.error("Error calculando resumen de gerencia:", error);
    return res.status(500).json({ status: "error", message: "Error interno del servidor", error: error.message });
  } finally {
    if (conn) conn.release();
  }
});
