export const successResponse = (res, data = {}, message = "Operación exitosa") => {
    return res.status(200).json({
        success: true,
        message,
        data,
    });
};
