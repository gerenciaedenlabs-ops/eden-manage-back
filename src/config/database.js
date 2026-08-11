// import { Sequelize } from "sequelize";
// import { env } from "./env.js";
// import { logger } from "./logger.js";

// export const sequelize = new Sequelize(
//     env.db.database,
//     env.db.user,
//     env.db.password,
//     {
//         host: env.db.host,
//         port: env.db.port,
//         dialect: "mysql",
//         logging: (msg) => logger.debug(msg), // o false si no quieres logs SQL
//     }
// );

// export const testConnection = async () => {
//     try {
//         await sequelize.authenticate();
//         logger.info("✓ Conexión a la base de datos establecida correctamente.");
//     } catch (error) {
//         logger.error("✖ Error al conectar a la base de datos:", error);
//         throw error;
//     }
// };

// export const syncModels = async () => {
//     try {
//         await sequelize.sync({ alter: false }); // alter=true solo en desarrollo
//         logger.info("✉ Modelos sincronizados con la base de datos.");
//     } catch (error) {
//         logger.error("✖ Error al sincronizar modelos:", error);
//     }
// };
