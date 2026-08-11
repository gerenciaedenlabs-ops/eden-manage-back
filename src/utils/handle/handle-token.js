import { env } from '../../config/env.js';
import jwt from 'jsonwebtoken'

export async function generateToken(payload, time = null) {
    let secretOrPrivateKey = env.variables_jwt.jwt_secret
    let options = { algorithm: env.variables_jwt.algorithm };
    if (time) {
        options.expiresIn = time;
    }
    return jwt.sign(payload, secretOrPrivateKey, options)
}

export async function verifyToken(token) {
    let secretOrPrivateKey = env.variables_jwt.jwt_secret
    return jwt.verify(token, secretOrPrivateKey)
}