import { testService } from "./test.service.js";
import { successResponse, errorResponse } from "../../utils/response.js";

export const testController = {
    async get(req, res, next) {
        try {
            const data = await testService.getAll();
            successResponse(res, data);
        } catch (error) {
            next(error);
        }
    },

    async create(req, res, next) {
        try {
            const { column1, column2 } = req.body;
            if (!column1 || !column2) throw new Error("Datos incompletos");
            await testService.create({ column1, column2 });
            successResponse(res, null, "Datos guardados con éxito");
        } catch (error) {
            next(error);
        }
    },

    async update(req, res, next) {
        try {
            const { id } = req.params;
            const { column1, column2 } = req.body;
            if (!id || !column1 || !column2) throw new Error("Datos incompletos");
            await testService.update({ id, column1, column2 });
            successResponse(res, null, "Datos actualizados con éxito");
        } catch (error) {
            next(error);
        }
    },

    async remove(req, res, next) {
        try {
            const { id } = req.params;
            if (!id) throw new Error("ID requerido");
            await testService.remove(id);
            successResponse(res, null, "Datos eliminados con éxito");
        } catch (error) {
            next(error);
        }
    },
};
