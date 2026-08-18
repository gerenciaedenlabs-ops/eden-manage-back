import { verifyToken } from "../utils/handle/handle-token.js";

// Antes usaba jwt.verify(token, env.jwt_secret) directamente, pero esa ruta no existe
// en env (el secreto real vive en env.variables_jwt.jwt_secret) — nunca funcionó, y por
// eso este middleware tampoco se usaba en ninguna ruta real. Ahora reutiliza el mismo
// helper (verifyToken) con el que se firman los tokens en el login, para que valide
// exactamente los tokens reales que emite la app.
export const authMiddleware = async (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
        return res.status(401).json({ status: "error", message: "Token no proporcionado" });
    }

    const token = authHeader.split(" ")[1];

    try {
        const decoded = await verifyToken(token);
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ status: "error", message: "Token inválido o expirado" });
    }
};
