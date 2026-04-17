"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const auth_middleware_1 = require("../middlewares/auth.middleware");
const call_controller_1 = require("../controllers/call.controller");
const router = express_1.default.Router();
router.route('/').post(auth_middleware_1.protect, call_controller_1.logCall);
router.route('/').get(auth_middleware_1.protect, call_controller_1.fetchCallHistory);
router.route('/').delete(auth_middleware_1.protect, call_controller_1.clearCallHistory);
router.route('/:id').delete(auth_middleware_1.protect, call_controller_1.deleteCallHistoryItem);
exports.default = router;
