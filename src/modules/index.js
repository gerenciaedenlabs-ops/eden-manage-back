import { Router } from "express";
// import authRoutes from "./auth/auth.routes.js";
// import reportesRoutes from "./reportes/reportes.routes.js";
// import { healthRouter } from "../controllers/health.controller.js";
import { healthMySQLRouter } from "../controllers/health/health2.controller.js";

import { ideaRouter } from "../controllers/idea-project.controller.js";
import { authUserRouter } from "../controllers/login-project.controller.js";
import { projectManagerRouter } from "../controllers/manager.controller.js";
import { tasksRouter } from "../controllers/tasks-project.controller.js";
import { checklistRouter } from "../controllers/checklist.controller.js";
import { gerenciaRouter } from "../controllers/gerencia.controller.js";
import { personalFinanceRouter } from "../controllers/personal-finance.controller.js";
import { notificationsRouter } from "../controllers/notifications.controller.js";
import { usersRouter } from "../controllers/user.controller.js";
import { pricesRouter } from "../controllers/prices-project.controller.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import { requireAdmin } from "../middlewares/require-admin.middleware.js";


const router = Router();

// Módulos
// router.use("/auth", authRoutes);
// router.use("/reportes", reportesRoutes);

// Rutas globales o de infraestructura
// Sequelize
// router.use("/health-sequelize", healthRouter);
// MySQL
router.use("/health-mysql", healthMySQLRouter);

router.use("/idea", ideaRouter);
router.use("/auth", authUserRouter);
router.use("/project", projectManagerRouter);
router.use("/task", authMiddleware, tasksRouter);
router.use("/checklist", authMiddleware, checklistRouter);
router.use("/gerencia", authMiddleware, requireAdmin, gerenciaRouter);
router.use("/personal", authMiddleware, personalFinanceRouter);
router.use("/notifications", authMiddleware, notificationsRouter);
router.use("/user", usersRouter);
router.use("/prices", pricesRouter);


export default router;
