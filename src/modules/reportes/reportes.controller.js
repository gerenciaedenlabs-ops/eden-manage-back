// // src/modules/reportes/reportes.controller.js
// import * as reportesService from "./reportes.service.js";

// export const getAllReportes = async (req, res) => {
//     try {
//         const reportes = await reportesService.getAllReportes();
//         res.status(200).json(reportes);
//     } catch (error) {
//         console.error("Error al obtener reportes:", error);
//         res.status(500).json({ message: "Error al obtener reportes" });
//     }
// };

// export const createReporte = async (req, res) => {
//     try {
//         const data = req.body;
//         const nuevoReporte = await reportesService.createReporte(data);
//         res.status(201).json(nuevoReporte);
//     } catch (error) {
//         console.error("Error al crear reporte:", error);
//         res.status(500).json({ message: "Error al crear reporte" });
//     }
// };
