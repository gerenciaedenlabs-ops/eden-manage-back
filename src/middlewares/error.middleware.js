import AppError from "../common/errors/AppError.js";
import { logger } from "../config/logger.js";

export const errorMiddleware = (err, req, res, next) => {
    if (err instanceof AppError) {
        logger.warn(`[${err.statusCode}] ${err.message}`);
        return res.status(err.statusCode).json({
            success: false,
            message: err.message,
        });
    }

    logger.error("Error interno:", err);
    res.status(500).json({
        success: false,
        message: "Error interno del servidor",
    });
};
