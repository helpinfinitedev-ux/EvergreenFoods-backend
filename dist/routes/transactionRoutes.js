"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authMiddleware_1 = require("../middleware/authMiddleware");
const transactionController_1 = require("../controllers/transactionController");
const router = (0, express_1.Router)();
router.use(authMiddleware_1.authenticate);
// Dashboard
router.get('/dashboard/summary', transactionController_1.getDashboardSummary);
router.get('/recent', transactionController_1.getRecentActivity);
// Entries
router.post('/buy', transactionController_1.addBuyEntry);
router.post('/sell', transactionController_1.addSellEntry);
router.post('/shop-buy', transactionController_1.addShopBuy);
router.post('/palti', transactionController_1.addPalti);
router.post('/weight-loss', transactionController_1.addWeightLoss);
router.post('/fuel', transactionController_1.addFuel);
exports.default = router;
