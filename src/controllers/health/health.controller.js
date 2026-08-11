// import express from "express";
// import { testConnection } from "../config/database.js";
// import { logger } from "../config/logger.js";

// export const healthRouter = express.Router();

// healthRouter.get("/", async (req, res) => {
//     try {
//         await testConnection();
//         logger.info("✓ Health check OK");

//         res.status(200).json({
//             status: "ok",
//             database: "connected",
//             timestamp: new Date().toISOString(),
//         });
//     } catch (error) {
//         logger.error("✖ Health check failed:", error);

//         res.status(500).json({
//             status: "error",
//             database: "disconnected",
//             error: error.message,
//             timestamp: new Date().toISOString(),
//         });
//     }
// });
