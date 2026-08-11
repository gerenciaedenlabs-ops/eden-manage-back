// import { AuthService } from "./auth.service.js";
// import { successResponse } from "../../utils/response.js";

// export const AuthController = {
//     async login(req, res, next) {
//         try {
//             const { email, password } = req.body;
//             const result = await AuthService.login(email, password);
//             successResponse(res, result, "Inicio de sesión exitoso");
//         } catch (error) {
//             next(error);
//         }
//     },

//     async register(req, res, next) {
//         try {
//             const result = await AuthService.register(req.body);
//             successResponse(res, result, "Usuario registrado con éxito");
//         } catch (error) {
//             next(error);
//         }
//     },
// };
