"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const auth_middleware_1 = require("../middlewares/auth.middleware");
const status_controller_1 = require("../controllers/status.controller");
const upload_middleware_1 = require("../middlewares/upload.middleware");
const router = express_1.default.Router();
router.route('/').get(auth_middleware_1.protect, status_controller_1.getStatuses);
router.route('/').post(auth_middleware_1.protect, upload_middleware_1.upload.single('media'), status_controller_1.createStatus);
router.route('/:id/view').put(auth_middleware_1.protect, status_controller_1.viewStatus);
exports.default = router;
