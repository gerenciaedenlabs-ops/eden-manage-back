export const AuthorizationVerify = (req, res, next) => {
    // Si API_KEY no está configurado, rechaza siempre (fail-closed) — antes,
    // sin API_KEY seteado, una request sin header "api-key" pasaba igual
    // (undefined !== undefined es false), dejando la ruta abierta sin querer.
    if (!process.env.API_KEY || req.headers["api-key"] !== process.env.API_KEY) {
        return res.status(401).json({
            status: 401,
            message: 'Unauthorized'
        });
    }
    next()
}