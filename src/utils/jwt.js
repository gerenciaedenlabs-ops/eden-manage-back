import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

export const generateToken = (payload, expiresIn = "7d") => {
    return jwt.sign(payload, env.jwt_secret, { expiresIn });
};
