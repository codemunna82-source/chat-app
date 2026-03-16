"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateBody = void 0;
const validateBody = (schema) => {
    return (req, res, next) => {
        const result = schema.safeParse(req.body);
        if (!result.success) {
            res.status(400).json({ message: 'Invalid request body', errors: result.error.flatten() });
            return;
        }
        req.body = result.data;
        next();
    };
};
exports.validateBody = validateBody;
