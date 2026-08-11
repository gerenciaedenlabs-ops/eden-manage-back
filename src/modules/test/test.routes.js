import express from "express";
import { testController } from "./test.controller.js";
import { authMiddleware } from "../../middlewares/auth.middleware.js";

const router = express.Router();

router.get("/", authMiddleware, testController.get);
router.post("/", authMiddleware, testController.create);
router.put("/:id", authMiddleware, testController.update);
router.delete("/:id", authMiddleware, testController.remove);

export default router;
