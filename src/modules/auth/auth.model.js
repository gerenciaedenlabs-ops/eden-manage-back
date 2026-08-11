// import { DataTypes } from "sequelize";
// import { sequelize } from "../../config/database.js";

// export const Auth = sequelize.define("usuarios", {
//     id: {
//         type: DataTypes.INTEGER,
//         autoIncrement: true,
//         primaryKey: true,
//     },
//     email: {
//         type: DataTypes.STRING,
//         allowNull: false,
//         unique: true,
//     },
//     password: {
//         type: DataTypes.STRING,
//         allowNull: false,
//     },
// }, {
//     tableName: "usuarios",
//     timestamps: false, // si tu tabla no tiene createdAt/updatedAt
// });

// // Funciones reutilizables tipo DAO
// export const AuthModel = {
//     async findByEmail(email) {
//         return await Auth.findOne({ where: { email } });
//     },

//     async create(userData) {
//         const user = await Auth.create(userData);
//         return user.id;
//     },
// };
