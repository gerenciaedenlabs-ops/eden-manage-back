// // src/modules/reportes/reportes.routes.js
// import { Router } from "express";
// import * as reportesController from "./reportes.controller.js";
// import { createReporteValidation } from "./reportes.validation.js";
// import { validationResult } from "express-validator";

// const router = Router();

// // 📌 GET /reportes — obtener todos los reportes
// router.get("/", reportesController.getAllReportes);

// // 📌 POST /reportes — crear un nuevo reporte con validación
// router.post(
//     "/",
//     createReporteValidation, // <-- middleware de validación
//     (req, res, next) => {
//         const errors = validationResult(req);
//         if (!errors.isEmpty()) {
//             return res.status(400).json({ errors: errors.array() });
//         }
//         next();
//     },
//     reportesController.createReporte // <-- pasa al controlador si todo va bien
// );

// export default router;
