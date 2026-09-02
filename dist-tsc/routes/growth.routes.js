"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const growth_controller_1 = require("../controllers/growth.controller");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
router.get('/history', auth_1.authenticateUser, growth_controller_1.getGrowthHistory);
exports.default = router;
//# sourceMappingURL=growth.routes.js.map