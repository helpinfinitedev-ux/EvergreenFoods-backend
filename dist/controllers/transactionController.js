"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.addFuel = exports.addWeightLoss = exports.addPalti = exports.addShopBuy = exports.addSellEntry = exports.addBuyEntry = exports.getRecentActivity = exports.getDashboardSummary = void 0;
const app_1 = require("../app");
const stockService_1 = require("../services/stockService");
// Dashboard Summary
const getDashboardSummary = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        if (!userId)
            return res.status(401).json({ error: "Unauthorized" });
        const stats = yield (0, stockService_1.getDashboardStats)(userId);
        res.json(stats);
    }
    catch (e) {
        res.status(500).json({ error: "Failed to fetch summary" });
    }
});
exports.getDashboardSummary = getDashboardSummary;
// Recent Activity
const getRecentActivity = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        if (!userId)
            return res.status(401).json({ error: "Unauthorized" });
        const transactions = yield app_1.prisma.transaction.findMany({
            where: { driverId: userId },
            orderBy: { date: "desc" },
            take: 20,
        });
        res.json(transactions);
    }
    catch (e) {
        res.status(500).json({ error: "Failed to fetch activity" });
    }
});
exports.getRecentActivity = getRecentActivity;
// Add Buy Entry
const addBuyEntry = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        if (!userId)
            return res.status(401).json({ error: "Unauthorized" });
        const { amount, rate, totalAmount, details, imageUrl } = req.body;
        const tx = yield app_1.prisma.transaction.create({
            data: {
                driverId: userId,
                type: "BUY",
                amount: amount,
                unit: "KG",
                rate: rate,
                totalAmount: totalAmount,
                details,
                imageUrl,
            },
        });
        res.json(tx);
    }
    catch (e) {
        res.status(500).json({ error: "Failed to add entry" });
    }
});
exports.addBuyEntry = addBuyEntry;
// Add Sell Entry (With Stock Validation)
const addSellEntry = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        if (!userId)
            return res.status(401).json({ error: "Unauthorized" });
        const { amount, customerId, rate, totalAmount, paymentCash, paymentUpi, details } = req.body;
        // 1. Check Stock
        const currentStock = yield (0, stockService_1.getDriverStock)(userId);
        if (amount > currentStock) {
            // Allow a tiny margin for float errors? No, strict for now.
            return res.status(400).json({ error: `Insufficient stock. Available: ${currentStock}` });
        }
        // 2. Wrap in Transaction
        // We need to update Customer Balance + Create Transaction atomically
        const result = yield app_1.prisma.$transaction((tx) => __awaiter(void 0, void 0, void 0, function* () {
            // Create Sell Transaction
            const transaction = yield tx.transaction.create({
                data: {
                    driverId: userId,
                    type: "SELL",
                    amount,
                    unit: "KG",
                    rate,
                    totalAmount,
                    paymentCash,
                    paymentUpi,
                    customerId,
                    details,
                },
            });
            // Update Customer Balance
            // Balance = Old Balance + Bill Amount - (Cash + UPI)
            const bill = Number(totalAmount);
            const paid = Number(paymentCash || 0) + Number(paymentUpi || 0);
            const change = bill - paid;
            yield tx.customer.update({
                where: { id: customerId },
                data: {
                    balance: {
                        increment: change,
                    },
                },
            });
            return transaction;
        }));
        res.json(result);
    }
    catch (e) {
        console.error(e);
        res.status(500).json({ error: "Failed to add sell entry" });
    }
});
exports.addSellEntry = addSellEntry;
// Add Shop Buy
const addShopBuy = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        if (!userId)
            return res.status(401).json({ error: "Unauthorized" });
        const { amount, rate, totalAmount, details } = req.body;
        const tx = yield app_1.prisma.transaction.create({
            data: {
                driverId: userId,
                type: "SHOP_BUY",
                amount,
                unit: "KG",
                rate,
                totalAmount,
                details,
            },
        });
        res.json(tx);
    }
    catch (e) {
        res.status(500).json({ error: "Failed" });
    }
});
exports.addShopBuy = addShopBuy;
// Add Palti
const addPalti = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        if (!userId)
            return res.status(401).json({ error: "Unauthorized" });
        const { amount, transferDriverName, paltiAction } = req.body;
        const tx = yield app_1.prisma.transaction.create({
            data: {
                driverId: userId,
                type: "PALTI",
                amount,
                unit: "KG",
                transferDriverName,
                paltiAction, // ADD or SUBTRACT
            },
        });
        res.json(tx);
    }
    catch (e) {
        res.status(500).json({ error: "Failed" });
    }
});
exports.addPalti = addPalti;
// Add Weight Loss
const addWeightLoss = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        if (!userId)
            return res.status(401).json({ error: "Unauthorized" });
        const { amount, subType, details, imageUrl } = req.body;
        const tx = yield app_1.prisma.transaction.create({
            data: {
                driverId: userId,
                type: "WEIGHT_LOSS",
                subType, // MORTALITY or WASTE
                amount,
                unit: "KG",
                details,
                imageUrl,
            },
        });
        res.json(tx);
    }
    catch (e) {
        res.status(500).json({ error: "Failed" });
    }
});
exports.addWeightLoss = addWeightLoss;
// Add Fuel
const addFuel = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        if (!userId)
            return res.status(401).json({ error: "Unauthorized" });
        const { amount, rate, totalAmount, vehicleId, currentKm, details, imageUrl, location, locationCoords } = req.body;
        const result = yield app_1.prisma.$transaction((tx) => __awaiter(void 0, void 0, void 0, function* () {
            const transaction = yield tx.transaction.create({
                data: {
                    driverId: userId,
                    type: "FUEL",
                    amount,
                    unit: "LITRE",
                    rate,
                    totalAmount,
                    vehicleId,
                    details,
                    imageUrl,
                    location,
                    gpsLat: locationCoords === null || locationCoords === void 0 ? void 0 : locationCoords.lat,
                    gpsLng: locationCoords === null || locationCoords === void 0 ? void 0 : locationCoords.lng,
                },
            });
            if (vehicleId && currentKm) {
                yield tx.vehicle.update({
                    where: { id: vehicleId },
                    data: {
                        currentKm: Number(currentKm),
                        imageUrl: imageUrl, // Save latest fuel slip image to vehicle
                    },
                });
            }
            return transaction;
        }));
        res.json(result);
    }
    catch (e) {
        console.error(e);
        res.status(500).json({ error: "Failed" });
    }
});
exports.addFuel = addFuel;
