import { Router } from "express";
import { logger } from "../config/logger.js";
import { githubApiRequest } from "../utils/github-app.js";

export const githubRouter = Router();

// ======================== GET repos visibles a la GitHub App instalada ========================
// Alimenta el picker de "vincular repositorio existente": solo repos a los
// que la App tiene acceso (los que el admin de la org le dio al instalarla),
// no toda la cuenta de una persona.
githubRouter.get("/repos", async (req, res) => {
  const page = Number(req.query.page) || 1;

  try {
    const data = await githubApiRequest(`/installation/repositories?per_page=100&page=${page}`);

    return res.json({
      status: "ok",
      data: data.repositories.map((r) => ({
        full_name: r.full_name,
        url: r.html_url,
        private: r.private,
        default_branch: r.default_branch,
        description: r.description,
      })),
      total_count: data.total_count,
    });

  } catch (error) {
    logger.error("Error listando repos de GitHub:", error);

    return res.status(500).json({
      status: "error",
      message: "No se pudo consultar la API de GitHub",
      error: error.message
    });
  }
});
