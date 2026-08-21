import { Router } from "express";
import { getConnection } from "../database/connection.js";
import { logger } from "../config/logger.js";
import { env } from "../config/env.js";

export const personalFinanceRouter = Router();

// Todo este módulo cuelga de /personal con authMiddleware ÚNICAMENTE (sin
// requireAdmin): cualquier usuario logueado entra, pero cada consulta va
// filtrada por req.user.id (nunca un user_id que mande el cliente), así
// nadie puede ver ni tocar el presupuesto de otro. Es 100% privado, ni
// siquiera un admin tiene bypass aquí — decisión explícita del usuario.

const clampDueDate = (year, month, day) => {
  const lastDay = new Date(year, month, 0).getDate();
  const safeDay = Math.min(day, lastDay);
  return new Date(year, month - 1, safeDay);
};

const toDateStr = (date) => date.toISOString().slice(0, 10);

// Mismo motor de reconciliación que Gerencia (ver gerencia.controller.js),
// pero acotado a un solo usuario: reserva el periodo con INSERT IGNORE
// (atómico vía la UNIQUE KEY) antes de crear el movimiento, para que dos
// requests en paralelo (GET /summary y GET /budget-items al cargar la
// pantalla) no generen movimientos duplicados.
const reconcilePersonalBudgetOccurrences = async (conn, db, userId) => {
  const [items] = await conn.query(
    `SELECT id, type, category, description, amount, due_day FROM ${db}.personal_budget_items WHERE user_id = ? AND active = 1`,
    [userId]
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
      `INSERT IGNORE INTO ${db}.personal_budget_occurrences (budget_item_id, period, due_date, status) VALUES (?, ?, ?, 'pending_confirmation')`,
      [item.id, period, dueDateStr]
    );

    if (reserveResult.affectedRows === 0) continue;

    const occurrenceId = reserveResult.insertId;

    if (item.category !== "Variable") {
      const [txResult] = await conn.query(
        `INSERT INTO ${db}.personal_transactions (user_id, type, category, description, amount, date) VALUES (?, ?, ?, ?, ?, ?)`,
        [userId, item.type, item.category, item.description, item.amount, dueDateStr]
      );
      await conn.query(
        `UPDATE ${db}.personal_budget_occurrences SET status = 'auto_applied', transaction_id = ? WHERE id = ?`,
        [txResult.insertId, occurrenceId]
      );
    }
  }
};

// ======================== GET items de presupuesto fijo ========================
personalFinanceRouter.get("/budget-items", async (req, res) => {
  let conn;

  try {
    conn = await getConnection();
    const db = env.db.database;

    await reconcilePersonalBudgetOccurrences(conn, db, req.user.id);

    const [rows] = await conn.query(
      `SELECT id, type, category, description, amount, due_day, active, created_at
       FROM ${db}.personal_budget_items
       WHERE user_id = ?
       ORDER BY type ASC, category ASC, id ASC`,
      [req.user.id]
    );

    return res.json({ status: "ok", data: rows });
  } catch (error) {
    logger.error("Error listando items de presupuesto personal:", error);
    return res.status(500).json({ status: "error", message: "Error interno del servidor", error: error.message });
  } finally {
    if (conn) conn.release();
  }
});

// ======================== POST item de presupuesto ========================
personalFinanceRouter.post("/budget-items", async (req, res) => {
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
      `INSERT INTO ${db}.personal_budget_items (user_id, type, category, description, amount, due_day) VALUES (?, ?, ?, ?, ?, ?)`,
      [req.user.id, type, category, description, amount, dueDay]
    );

    return res.status(201).json({ status: "ok", message: "Item de presupuesto guardado con éxito" });
  } catch (error) {
    logger.error("Error creando item de presupuesto personal:", error);
    return res.status(500).json({ status: "error", message: "Error interno del servidor", error: error.message });
  } finally {
    if (conn) conn.release();
  }
});

// ======================== PUT item de presupuesto ========================
personalFinanceRouter.put("/budget-items/:id", async (req, res) => {
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

  values.push(id, req.user.id);

  let conn;

  try {
    conn = await getConnection();
    const db = env.db.database;

    const [result] = await conn.query(
      `UPDATE ${db}.personal_budget_items SET ${fields.join(", ")} WHERE id = ? AND user_id = ?`,
      values
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ status: "error", message: "No se encontró el registro a actualizar" });
    }

    return res.json({ status: "ok", message: "Item de presupuesto actualizado con éxito" });
  } catch (error) {
    logger.error("Error actualizando item de presupuesto personal:", error);
    return res.status(500).json({ status: "error", message: "Error interno del servidor", error: error.message });
  } finally {
    if (conn) conn.release();
  }
});

// ======================== DELETE item de presupuesto ========================
personalFinanceRouter.delete("/budget-items/:id", async (req, res) => {
  const { id } = req.params;
  let conn;

  try {
    conn = await getConnection();
    const db = env.db.database;

    const [result] = await conn.query(
      `DELETE FROM ${db}.personal_budget_items WHERE id = ? AND user_id = ?`,
      [id, req.user.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ status: "error", message: "No se encontró el registro a eliminar" });
    }

    return res.json({ status: "ok", message: "Item de presupuesto eliminado con éxito" });
  } catch (error) {
    logger.error("Error eliminando item de presupuesto personal:", error);
    return res.status(500).json({ status: "error", message: "Error interno del servidor", error: error.message });
  } finally {
    if (conn) conn.release();
  }
});

// ======================== GET movimientos puntuales ========================
personalFinanceRouter.get("/transactions", async (req, res) => {
  let conn;

  try {
    conn = await getConnection();
    const db = env.db.database;

    const [rows] = await conn.query(
      `SELECT id, type, category, description, amount, date, created_at
       FROM ${db}.personal_transactions
       WHERE user_id = ?
       ORDER BY date DESC, id DESC`,
      [req.user.id]
    );

    return res.json({ status: "ok", data: rows });
  } catch (error) {
    logger.error("Error listando movimientos personales:", error);
    return res.status(500).json({ status: "error", message: "Error interno del servidor", error: error.message });
  } finally {
    if (conn) conn.release();
  }
});

// ======================== POST movimiento puntual ========================
personalFinanceRouter.post("/transactions", async (req, res) => {
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
      `INSERT INTO ${db}.personal_transactions (user_id, type, category, description, amount, date) VALUES (?, ?, ?, ?, ?, ?)`,
      [req.user.id, type, category, description, amount, date]
    );

    return res.status(201).json({ status: "ok", message: "Movimiento guardado con éxito" });
  } catch (error) {
    logger.error("Error creando movimiento personal:", error);
    return res.status(500).json({ status: "error", message: "Error interno del servidor", error: error.message });
  } finally {
    if (conn) conn.release();
  }
});

// ======================== PUT movimiento puntual ========================
personalFinanceRouter.put("/transactions/:id", async (req, res) => {
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
      `UPDATE ${db}.personal_transactions SET type = ?, category = ?, description = ?, amount = ?, date = ? WHERE id = ? AND user_id = ?`,
      [type, category, description, amount, date, id, req.user.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ status: "error", message: "No se encontró el registro a actualizar" });
    }

    return res.json({ status: "ok", message: "Movimiento actualizado con éxito" });
  } catch (error) {
    logger.error("Error actualizando movimiento personal:", error);
    return res.status(500).json({ status: "error", message: "Error interno del servidor", error: error.message });
  } finally {
    if (conn) conn.release();
  }
});

// ======================== DELETE movimiento puntual ========================
personalFinanceRouter.delete("/transactions/:id", async (req, res) => {
  const { id } = req.params;
  let conn;

  try {
    conn = await getConnection();
    const db = env.db.database;

    const [result] = await conn.query(
      `DELETE FROM ${db}.personal_transactions WHERE id = ? AND user_id = ?`,
      [id, req.user.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ status: "error", message: "No se encontró el registro a eliminar" });
    }

    return res.json({ status: "ok", message: "Movimiento eliminado con éxito" });
  } catch (error) {
    logger.error("Error eliminando movimiento personal:", error);
    return res.status(500).json({ status: "error", message: "Error interno del servidor", error: error.message });
  } finally {
    if (conn) conn.release();
  }
});

// ======================== GET deudas (con cuotas anidadas) ========================
personalFinanceRouter.get("/debts", async (req, res) => {
  let conn;

  try {
    conn = await getConnection();
    const db = env.db.database;

    const [debts] = await conn.query(
      `SELECT id, title, amount, reason, start_date, installments_count
       FROM ${db}.personal_debts
       WHERE user_id = ?
       ORDER BY start_date DESC, id DESC`,
      [req.user.id]
    );

    let installments = [];
    if (debts.length > 0) {
      const ids = debts.map((d) => d.id);
      const placeholders = ids.map(() => "?").join(",");
      const [rows] = await conn.query(
        `SELECT id, debt_id, installment_number, due_date, amount, paid, paid_at
         FROM ${db}.personal_debt_installments
         WHERE debt_id IN (${placeholders})
         ORDER BY installment_number ASC`,
        ids
      );
      installments = rows;
    }

    const installmentsByDebt = {};
    installments.forEach((row) => {
      if (!installmentsByDebt[row.debt_id]) installmentsByDebt[row.debt_id] = [];
      installmentsByDebt[row.debt_id].push(row);
    });

    const data = debts.map((debt) => ({
      ...debt,
      installments: installmentsByDebt[debt.id] || [],
    }));

    return res.json({ status: "ok", data });
  } catch (error) {
    logger.error("Error listando deudas personales:", error);
    return res.status(500).json({ status: "error", message: "Error interno del servidor", error: error.message });
  } finally {
    if (conn) conn.release();
  }
});

// ======================== POST deuda (genera cuotas automáticamente) ========================
personalFinanceRouter.post("/debts", async (req, res) => {
  const { title, amount, reason, start_date, installments_count } = req.body;

  if (!title || !amount || !start_date || !installments_count) {
    return res.status(400).json({
      status: "error",
      message: "Datos incompletos: se requiere title, amount, start_date e installments_count",
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
      `INSERT INTO ${db}.personal_debts (user_id, title, amount, reason, start_date, installments_count) VALUES (?, ?, ?, ?, ?, ?)`,
      [req.user.id, title, totalAmount, reason || null, start_date, count]
    );

    const debtId = result.insertId;

    // Monto base por cuota, redondeado a centavos; la última cuota absorbe el residuo
    // de redondeo para que la suma cuadre exacto con el monto total.
    const baseInstallment = Math.floor((totalAmount / count) * 100) / 100;
    const values = [];

    for (let i = 1; i <= count; i++) {
      const dueDate = new Date(start_date);
      dueDate.setMonth(dueDate.getMonth() + i);
      const dueDateStr = dueDate.toISOString().slice(0, 10);

      const isLast = i === count;
      const installmentAmount = isLast
        ? Math.round((totalAmount - baseInstallment * (count - 1)) * 100) / 100
        : baseInstallment;

      values.push(debtId, i, dueDateStr, installmentAmount);
    }

    const placeholders = Array(count).fill("(?, ?, ?, ?)").join(", ");
    await conn.query(
      `INSERT INTO ${db}.personal_debt_installments (debt_id, installment_number, due_date, amount) VALUES ${placeholders}`,
      values
    );

    await conn.commit();

    return res.status(201).json({ status: "ok", message: "Deuda registrada con éxito", data: { id: debtId } });
  } catch (error) {
    if (conn) await conn.rollback();
    logger.error("Error creando deuda personal:", error);
    return res.status(500).json({ status: "error", message: "Error interno del servidor", error: error.message });
  } finally {
    if (conn) conn.release();
  }
});

// ======================== DELETE deuda ========================
personalFinanceRouter.delete("/debts/:id", async (req, res) => {
  const { id } = req.params;
  let conn;

  try {
    conn = await getConnection();
    const db = env.db.database;

    const [result] = await conn.query(
      `DELETE FROM ${db}.personal_debts WHERE id = ? AND user_id = ?`,
      [id, req.user.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ status: "error", message: "No se encontró la deuda a eliminar" });
    }

    return res.json({ status: "ok", message: "Deuda eliminada con éxito" });
  } catch (error) {
    logger.error("Error eliminando deuda personal:", error);
    return res.status(500).json({ status: "error", message: "Error interno del servidor", error: error.message });
  } finally {
    if (conn) conn.release();
  }
});

// ======================== PUT togglear cuota pagada ========================
personalFinanceRouter.put("/installments/:id", async (req, res) => {
  const { id } = req.params;
  const { paid } = req.body;

  if (paid === undefined) {
    return res.status(400).json({ status: "error", message: "Datos incompletos: se requiere paid" });
  }

  let conn;

  try {
    conn = await getConnection();
    const db = env.db.database;

    // JOIN a personal_debts para verificar dueño: la cuota no tiene user_id propio.
    const [result] = await conn.query(
      `UPDATE ${db}.personal_debt_installments di
       INNER JOIN ${db}.personal_debts d ON di.debt_id = d.id
       SET di.paid = ?, di.paid_at = ?
       WHERE di.id = ? AND d.user_id = ?`,
      [paid ? 1 : 0, paid ? new Date() : null, id, req.user.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ status: "error", message: "No se encontró la cuota a actualizar" });
    }

    return res.json({ status: "ok", message: "Cuota actualizada con éxito" });
  } catch (error) {
    logger.error("Error actualizando cuota personal:", error);
    return res.status(500).json({ status: "error", message: "Error interno del servidor", error: error.message });
  } finally {
    if (conn) conn.release();
  }
});

// ======================== PUT confirmar alerta de gasto variable ========================
personalFinanceRouter.put("/budget-occurrences/:id/confirm", async (req, res) => {
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
       FROM ${db}.personal_budget_occurrences o
       INNER JOIN ${db}.personal_budget_items i ON o.budget_item_id = i.id
       WHERE o.id = ? AND i.user_id = ?`,
      [id, req.user.id]
    );

    if (!occurrence) {
      return res.status(404).json({ status: "error", message: "No se encontró la alerta" });
    }

    if (occurrence.status !== "pending_confirmation") {
      return res.status(400).json({ status: "error", message: "Esta alerta ya fue procesada" });
    }

    await conn.beginTransaction();

    const [txResult] = await conn.query(
      `INSERT INTO ${db}.personal_transactions (user_id, type, category, description, amount, date) VALUES (?, ?, ?, ?, ?, ?)`,
      [req.user.id, occurrence.type, occurrence.category, occurrence.description, amount, date]
    );

    await conn.query(
      `UPDATE ${db}.personal_budget_occurrences SET status = 'confirmed', transaction_id = ? WHERE id = ?`,
      [txResult.insertId, id]
    );

    await conn.commit();

    return res.json({ status: "ok", message: "Movimiento confirmado con éxito" });
  } catch (error) {
    if (conn) await conn.rollback();
    logger.error("Error confirmando alerta de presupuesto personal:", error);
    return res.status(500).json({ status: "error", message: "Error interno del servidor", error: error.message });
  } finally {
    if (conn) conn.release();
  }
});

// ======================== PUT descartar alerta de gasto variable ========================
personalFinanceRouter.put("/budget-occurrences/:id/dismiss", async (req, res) => {
  const { id } = req.params;
  let conn;

  try {
    conn = await getConnection();
    const db = env.db.database;

    const [result] = await conn.query(
      `UPDATE ${db}.personal_budget_occurrences o
       INNER JOIN ${db}.personal_budget_items i ON o.budget_item_id = i.id
       SET o.status = 'dismissed'
       WHERE o.id = ? AND o.status = 'pending_confirmation' AND i.user_id = ?`,
      [id, req.user.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ status: "error", message: "No se encontró la alerta o ya fue procesada" });
    }

    return res.json({ status: "ok", message: "Alerta descartada" });
  } catch (error) {
    logger.error("Error descartando alerta de presupuesto personal:", error);
    return res.status(500).json({ status: "error", message: "Error interno del servidor", error: error.message });
  } finally {
    if (conn) conn.release();
  }
});

// ======================== GET metas de ahorro (con aportes anidados) ========================
personalFinanceRouter.get("/savings-goals", async (req, res) => {
  let conn;

  try {
    conn = await getConnection();
    const db = env.db.database;

    const [goals] = await conn.query(
      `SELECT id, name, created_at FROM ${db}.personal_savings_goals WHERE user_id = ? ORDER BY id ASC`,
      [req.user.id]
    );

    let entries = [];
    if (goals.length > 0) {
      const ids = goals.map((g) => g.id);
      const placeholders = ids.map(() => "?").join(",");
      const [rows] = await conn.query(
        `SELECT id, goal_id, amount, date, note FROM ${db}.personal_savings_entries WHERE goal_id IN (${placeholders}) ORDER BY date DESC, id DESC`,
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
    logger.error("Error listando metas de ahorro personales:", error);
    return res.status(500).json({ status: "error", message: "Error interno del servidor", error: error.message });
  } finally {
    if (conn) conn.release();
  }
});

// ======================== POST meta de ahorro ========================
personalFinanceRouter.post("/savings-goals", async (req, res) => {
  const { name } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ status: "error", message: "Datos incompletos: se requiere name" });
  }

  let conn;

  try {
    conn = await getConnection();
    const db = env.db.database;

    await conn.query(
      `INSERT INTO ${db}.personal_savings_goals (user_id, name) VALUES (?, ?)`,
      [req.user.id, name.trim()]
    );

    return res.status(201).json({ status: "ok", message: "Meta de ahorro creada con éxito" });
  } catch (error) {
    logger.error("Error creando meta de ahorro personal:", error);
    return res.status(500).json({ status: "error", message: "Error interno del servidor", error: error.message });
  } finally {
    if (conn) conn.release();
  }
});

// ======================== DELETE meta de ahorro ========================
personalFinanceRouter.delete("/savings-goals/:id", async (req, res) => {
  const { id } = req.params;
  let conn;

  try {
    conn = await getConnection();
    const db = env.db.database;

    const [result] = await conn.query(
      `DELETE FROM ${db}.personal_savings_goals WHERE id = ? AND user_id = ?`,
      [id, req.user.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ status: "error", message: "No se encontró la meta a eliminar" });
    }

    return res.json({ status: "ok", message: "Meta de ahorro eliminada con éxito" });
  } catch (error) {
    logger.error("Error eliminando meta de ahorro personal:", error);
    return res.status(500).json({ status: "error", message: "Error interno del servidor", error: error.message });
  } finally {
    if (conn) conn.release();
  }
});

// ======================== POST aporte a una meta de ahorro ========================
personalFinanceRouter.post("/savings-goals/:id/entries", async (req, res) => {
  const { id } = req.params;
  const { amount, date, note } = req.body;

  if (!amount || !date) {
    return res.status(400).json({ status: "error", message: "Datos incompletos: se requiere amount y date" });
  }

  let conn;

  try {
    conn = await getConnection();
    const db = env.db.database;

    // Verifica que la meta sea del usuario antes de insertar el aporte.
    const [[goal]] = await conn.query(
      `SELECT id FROM ${db}.personal_savings_goals WHERE id = ? AND user_id = ?`,
      [id, req.user.id]
    );

    if (!goal) {
      return res.status(404).json({ status: "error", message: "No se encontró la meta de ahorro" });
    }

    await conn.query(
      `INSERT INTO ${db}.personal_savings_entries (goal_id, amount, date, note) VALUES (?, ?, ?, ?)`,
      [id, amount, date, note || null]
    );

    return res.status(201).json({ status: "ok", message: "Aporte registrado con éxito" });
  } catch (error) {
    logger.error("Error registrando aporte de ahorro personal:", error);
    return res.status(500).json({ status: "error", message: "Error interno del servidor", error: error.message });
  } finally {
    if (conn) conn.release();
  }
});

// ======================== DELETE aporte de ahorro ========================
personalFinanceRouter.delete("/savings-entries/:id", async (req, res) => {
  const { id } = req.params;
  let conn;

  try {
    conn = await getConnection();
    const db = env.db.database;

    const [result] = await conn.query(
      `DELETE e FROM ${db}.personal_savings_entries e
       INNER JOIN ${db}.personal_savings_goals g ON e.goal_id = g.id
       WHERE e.id = ? AND g.user_id = ?`,
      [id, req.user.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ status: "error", message: "No se encontró el aporte a eliminar" });
    }

    return res.json({ status: "ok", message: "Aporte eliminado con éxito" });
  } catch (error) {
    logger.error("Error eliminando aporte de ahorro personal:", error);
    return res.status(500).json({ status: "error", message: "Error interno del servidor", error: error.message });
  } finally {
    if (conn) conn.release();
  }
});

// ======================== GET resumen para el dashboard ========================
personalFinanceRouter.get("/summary", async (req, res) => {
  let conn;

  try {
    conn = await getConnection();
    const db = env.db.database;

    await reconcilePersonalBudgetOccurrences(conn, db, req.user.id);

    const [[balanceRow]] = await conn.query(
      `SELECT
         COALESCE(SUM(CASE WHEN type = 'ingreso' THEN amount ELSE 0 END), 0) AS total_ingresos,
         COALESCE(SUM(CASE WHEN type = 'gasto' THEN amount ELSE 0 END), 0) AS total_gastos
       FROM ${db}.personal_transactions WHERE user_id = ?`,
      [req.user.id]
    );

    const [[savingsRow]] = await conn.query(
      `SELECT COALESCE(SUM(e.amount), 0) AS total
       FROM ${db}.personal_savings_entries e
       INNER JOIN ${db}.personal_savings_goals g ON e.goal_id = g.id
       WHERE g.user_id = ?`,
      [req.user.id]
    );

    const [pendingConfirmations] = await conn.query(
      `SELECT o.id AS occurrence_id, o.budget_item_id, i.description, i.category, i.amount, o.due_date
       FROM ${db}.personal_budget_occurrences o
       INNER JOIN ${db}.personal_budget_items i ON o.budget_item_id = i.id
       WHERE o.status = 'pending_confirmation' AND i.user_id = ?
       ORDER BY o.due_date ASC`,
      [req.user.id]
    );

    const [[budgetRow]] = await conn.query(
      `SELECT
         COALESCE(SUM(CASE WHEN type = 'ingreso' THEN amount ELSE 0 END), 0) AS ingresos,
         COALESCE(SUM(CASE WHEN type = 'gasto' THEN amount ELSE 0 END), 0) AS gastos
       FROM ${db}.personal_budget_items
       WHERE user_id = ? AND active = 1`,
      [req.user.id]
    );

    const [byCategory] = await conn.query(
      `SELECT category, SUM(amount) AS total
       FROM ${db}.personal_budget_items
       WHERE user_id = ? AND type = 'gasto' AND active = 1
       GROUP BY category
       ORDER BY total DESC`,
      [req.user.id]
    );

    const [[debtsRow]] = await conn.query(
      `SELECT
         COALESCE((SELECT SUM(amount) FROM ${db}.personal_debts WHERE user_id = ?), 0) AS total_debt,
         COALESCE((SELECT SUM(di.amount) FROM ${db}.personal_debt_installments di
                    INNER JOIN ${db}.personal_debts d ON di.debt_id = d.id
                    WHERE d.user_id = ? AND di.paid = 1), 0) AS total_paid
      `,
      [req.user.id, req.user.id]
    );

    const [upcomingInstallments] = await conn.query(
      `SELECT di.id, di.debt_id, di.installment_number, di.due_date, di.amount, d.title AS debt_title
       FROM ${db}.personal_debt_installments di
       INNER JOIN ${db}.personal_debts d ON di.debt_id = d.id
       WHERE d.user_id = ? AND di.paid = 0
       ORDER BY di.due_date ASC
       LIMIT 5`,
      [req.user.id]
    );

    const totalDebt = Number(debtsRow.total_debt);
    const totalPaid = Number(debtsRow.total_paid);
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
        debts: {
          total_debt: totalDebt,
          total_paid: totalPaid,
          pending: totalDebt - totalPaid,
          upcoming_installments: upcomingInstallments,
        },
      },
    });
  } catch (error) {
    logger.error("Error calculando resumen personal:", error);
    return res.status(500).json({ status: "error", message: "Error interno del servidor", error: error.message });
  } finally {
    if (conn) conn.release();
  }
});
