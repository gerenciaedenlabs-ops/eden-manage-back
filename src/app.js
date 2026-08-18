import express from "express";
import cors from "cors";
import morgan from "morgan";
import routes from "./modules/index.js";
import { errorMiddleware } from "./middlewares/error.middleware.js";

const app = express();

// API dinámica: sin ETag ni caché HTTP del navegador, para que los GET
// siempre traigan el estado real en vez de un 304 con body vacío/obsoleto.
app.set("etag", false);
app.use((req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
});

app.use(cors());
// Los imports masivos de tareas (Excel con muchas filas/descripciones largas)
// superan fácilmente el límite por defecto de 100kb de express.json().
app.use(express.json({ limit: "20mb" }));
app.use(morgan("dev"));

app.get("/", (req, res) => {
    res.json({
        message: "Backend funcionando correctamente",
        time: new Date().toISOString()
    });
});

// Rutas principales
app.use("/edenlabs-manager/server/v1", routes);

// Middleware de errores
app.use(errorMiddleware);

export default app;
