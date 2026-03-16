"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const auth_middleware_1 = require("../middlewares/auth.middleware");
const message_controller_1 = require("../controllers/message.controller");
const upload_middleware_1 = require("../middlewares/upload.middleware");
const validate_middleware_1 = require("../middlewares/validate.middleware");
const zod_1 = require("zod");
const router = express_1.default.Router();
const reactSchema = zod_1.z.object({
    emoji: zod_1.z.string().min(1).max(8),
});
router.route('/:chatId').get(auth_middleware_1.protect, message_controller_1.allMessages);
router.route('/:id').delete(auth_middleware_1.protect, message_controller_1.deleteMessage);
router.route('/:id/react').put(auth_middleware_1.protect, (0, validate_middleware_1.validateBody)(reactSchema), message_controller_1.toggleReaction);
router.route('/').post(auth_middleware_1.protect, upload_middleware_1.upload.single('media'), message_controller_1.sendMessage);
exports.default = router;
