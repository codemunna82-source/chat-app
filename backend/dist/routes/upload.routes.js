"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const auth_middleware_1 = require("../middlewares/auth.middleware");
const upload_controller_1 = require("../controllers/upload.controller");
const router = express_1.default.Router();
router.route('/presignedUrl').get(auth_middleware_1.protect, upload_controller_1.getPresignedUrl);
exports.default = router;
