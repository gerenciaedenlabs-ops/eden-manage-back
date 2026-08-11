export const AuthorizationVerify = (req, res, next) => {
    if(req.headers["api-key"] !== process.env.API_KEY){
        return res.status(401).json({
            status: 401,
            message: 'Unauthorized'
        });
    }
    next()
}