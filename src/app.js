import express from "express";
import cors from "cors";
import morgan from "morgan";
import routes from "./modules/index.js";
import { errorMiddleware } from "./middlewares/error.middleware.js";

const app = express();

app.use(cors());
app.use(express.json());
app.use(morgan("dev"));

app.get("/", (req, res) => {
    res.json({
        message: "Backend funcionando correctamente",
        time: new Date().toISOString()
    });
});

// Rutas principales
app.use("/arvix-manager/server/v1", routes);

// Middleware de errores
app.use(errorMiddleware);

export default app;
