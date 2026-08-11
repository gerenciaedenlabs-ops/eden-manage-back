import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import UnauthorizedError from "../common/errors/UnauthorizedError.js";

export const authMiddleware = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) throw new UnauthorizedError("Token no proporcionado");

    const token = authHeader.split(" ")[1];
    try {
        const decoded = jwt.verify(token, env.jwt_secret);
        req.user = decoded;
        next();
    } catch (err) {
        throw new UnauthorizedError("Token inválido o expirado");
    }
};
