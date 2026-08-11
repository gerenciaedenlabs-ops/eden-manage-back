// import bcrypt from "bcrypt";
// import { AuthModel } from "./auth.model.js";
// import { generateToken } from "../../utils/jwt.js";
// import AppError from "../../common/errors/AppError.js";

// export const AuthService = {
//     async login(email, password) {
//         const user = await AuthModel.findByEmail(email);
//         if (!user) throw new AppError("Usuario no encontrado", 404);

//         const match = await bcrypt.compare(password, user.password);
//         if (!match) throw new AppError("Contraseña incorrecta", 401);

//         const token = generateToken({ id: user.id, email: user.email });
//         return { token, user };
//     },

//     async register(data) {
//         const hashed = await bcrypt.hash(data.password, 10);
//         const id = await AuthModel.create({ ...data, password: hashed });
//         return { id };
//     },
// };
