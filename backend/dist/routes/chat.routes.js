"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const auth_middleware_1 = require("../middlewares/auth.middleware");
const chat_controller_1 = require("../controllers/chat.controller");
const router = express_1.default.Router();
router.route('/').post(auth_middleware_1.protect, chat_controller_1.accessChat);
router.route('/').get(auth_middleware_1.protect, chat_controller_1.fetchChats);
router.route('/:chatId/read').put(auth_middleware_1.protect, chat_controller_1.markAsRead);
router.route('/:chatId').delete(auth_middleware_1.protect, chat_controller_1.deleteChat);
exports.default = router;
