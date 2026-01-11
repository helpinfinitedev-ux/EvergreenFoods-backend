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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteVehicle = exports.createVehicle = exports.getVehicleById = exports.getVehicles = exports.getAdminTransactions = exports.createFinancialNote = exports.createDriver = exports.updateDriverStatus = exports.getDrivers = exports.getAdminDashboard = void 0;
const express_1 = require("express");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const app_1 = require("../app");
const authMiddleware_1 = require("../middleware/authMiddleware");
// --- Controllers ---
// 1. Dashboard Stats
const getAdminDashboard = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const today = new Date();
        const start = new Date(today.setHours(0, 0, 0, 0));
        const end = new Date(today.setHours(23, 59, 59, 999));
        const transactions = yield app_1.prisma.transaction.findMany({
            where: { date: { gte: start, lte: end } },
        });
        const activeDrivers = yield app_1.prisma.user.count({ where: { role: "DRIVER", status: "ACTIVE" } });
        // Calculate payment received today from SELL transactions
        const sellTransactions = transactions.filter((t) => t.type === "SELL");
        const todayPaymentReceived = sellTransactions.reduce((sum, t) => sum + Number(t.paymentCash || 0) + Number(t.paymentUpi || 0), 0);
        const stats = {
            todayBuy: transactions.filter((t) => t.type === "BUY").reduce((sum, t) => sum + Number(t.amount || 0), 0),
            todaySell: sellTransactions.reduce((sum, t) => sum + Number(t.amount || 0), 0),
            todayShopBuy: transactions.filter((t) => t.type === "SHOP_BUY").reduce((sum, t) => sum + Number(t.amount || 0), 0),
            todayFuel: transactions.filter((t) => t.type === "FUEL").length,
            todayWeightLoss: transactions.filter((t) => t.type === "WEIGHT_LOSS").reduce((sum, t) => sum + Number(t.amount || 0), 0),
            todayPaymentReceived,
            activeDrivers,
        };
        res.json(stats);
    }
    catch (e) {
        res.status(500).json({ error: "Failed" });
    }
});
exports.getAdminDashboard = getAdminDashboard;
// 2. Driver Management
const getDrivers = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const drivers = yield app_1.prisma.user.findMany({
        where: { role: "DRIVER" },
        orderBy: { name: "asc" },
    });
    res.json(drivers);
});
exports.getDrivers = getDrivers;
const updateDriverStatus = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { id } = req.params;
    const { status } = req.body; // ACTIVE / BLOCKED
    yield app_1.prisma.user.update({ where: { id }, data: { status } });
    res.json({ success: true });
});
exports.updateDriverStatus = updateDriverStatus;
const createDriver = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { name, mobile, password, baseSalary } = req.body;
        const existingUser = yield app_1.prisma.user.findUnique({ where: { mobile } });
        if (existingUser) {
            return res.status(400).json({ error: "Mobile number already registered" });
        }
        const passwordHash = yield bcryptjs_1.default.hash(password, 10);
        const driver = yield app_1.prisma.user.create({
            data: {
                name,
                mobile,
                passwordHash,
                role: "DRIVER",
                baseSalary: baseSalary ? Number(baseSalary) : 0,
            },
        });
        res.json({
            success: true,
            driver: {
                id: driver.id,
                name: driver.name,
                mobile: driver.mobile,
                role: driver.role,
                status: driver.status,
                baseSalary: driver.baseSalary,
            },
        });
    }
    catch (error) {
        console.error("Create driver error:", error);
        res.status(500).json({ error: "Failed to create driver" });
    }
});
exports.createDriver = createDriver;
// 3. Financials (Debit/Credit Notes)
const createFinancialNote = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { customerId, type, amount, reason } = req.body; // type: DEBIT_NOTE or CREDIT_NOTE
    const numericAmount = Number(amount);
    if (type !== "DEBIT_NOTE" && type !== "CREDIT_NOTE")
        return res.status(400).json({ error: "Invalid type" });
    yield app_1.prisma.$transaction((tx) => __awaiter(void 0, void 0, void 0, function* () {
        // Create Transaction Record
        yield tx.transaction.create({
            data: {
                driverId: req.user.userId, // Admin ID essentially
                customerId,
                type,
                amount: 0, // Not weight
                unit: "INR",
                totalAmount: numericAmount,
                details: reason,
            },
        });
        // Update Balance
        // Debit Note: INCREASE Due (Add to balance)
        // Credit Note: DECREASE Due (Subtract from balance)
        const adjustment = type === "DEBIT_NOTE" ? numericAmount : -numericAmount;
        yield tx.customer.update({
            where: { id: customerId },
            data: { balance: { increment: adjustment } },
        });
    }));
    res.json({ success: true });
});
exports.createFinancialNote = createFinancialNote;
// 4. Reports (Transactions)
const getAdminTransactions = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { type, startDate, endDate, driverId } = req.query;
    const where = {};
    if (type)
        where.type = type;
    if (driverId)
        where.driverId = driverId;
    if (startDate && endDate) {
        where.date = {
            gte: new Date(startDate),
            lte: new Date(endDate),
        };
    }
    const logs = yield app_1.prisma.transaction.findMany({
        where,
        include: { driver: true, customer: true, vehicle: true },
        orderBy: { date: "desc" },
        take: 100, // Pagination later
    });
    res.json(logs);
});
exports.getAdminTransactions = getAdminTransactions;
// 5. Vehicle Management
const getVehicles = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const vehicles = yield app_1.prisma.vehicle.findMany({
            include: { drivers: true },
            orderBy: { createdAt: "desc" },
        });
        console.log(vehicles);
        res.json(vehicles);
    }
    catch (error) {
        console.error("Get vehicles error:", error);
        res.status(500).json({ error: "Failed to fetch vehicles" });
    }
});
exports.getVehicles = getVehicles;
const getVehicleById = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const vehicle = yield app_1.prisma.vehicle.findUnique({
            where: { id },
            include: { drivers: true, transactions: { take: 10, orderBy: { date: "desc" } } },
        });
        if (!vehicle) {
            return res.status(404).json({ error: "Vehicle not found" });
        }
        res.json(vehicle);
    }
    catch (error) {
        console.error("Get vehicle error:", error);
        res.status(500).json({ error: "Failed to fetch vehicle" });
    }
});
exports.getVehicleById = getVehicleById;
const createVehicle = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { registration, currentKm, status } = req.body;
        const existingVehicle = yield app_1.prisma.vehicle.findUnique({ where: { registration } });
        if (existingVehicle) {
            return res.status(400).json({ error: "Vehicle with this registration already exists" });
        }
        const vehicle = yield app_1.prisma.vehicle.create({
            data: {
                registration,
                currentKm: currentKm ? Number(currentKm) : 0,
                status: status || "ACTIVE",
            },
        });
        res.json({ success: true, vehicle });
    }
    catch (error) {
        console.error("Create vehicle error:", error);
        res.status(500).json({ error: "Failed to create vehicle" });
    }
});
exports.createVehicle = createVehicle;
const deleteVehicle = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const vehicle = yield app_1.prisma.vehicle.findUnique({ where: { id } });
        if (!vehicle) {
            return res.status(404).json({ error: "Vehicle not found" });
        }
        // Check if vehicle has any transactions
        const transactionCount = yield app_1.prisma.transaction.count({ where: { vehicleId: id } });
        if (transactionCount > 0) {
            return res.status(400).json({ error: "Cannot delete vehicle with existing transactions" });
        }
        // Unassign drivers from this vehicle before deleting
        yield app_1.prisma.user.updateMany({
            where: { vehicleId: id },
            data: { vehicleId: null },
        });
        yield app_1.prisma.vehicle.delete({ where: { id } });
        res.json({ success: true, message: "Vehicle deleted successfully" });
    }
    catch (error) {
        console.error("Delete vehicle error:", error);
        res.status(500).json({ error: "Failed to delete vehicle" });
    }
});
exports.deleteVehicle = deleteVehicle;
// --- Routes ---
const router = (0, express_1.Router)();
router.use(authMiddleware_1.authenticate); // Admin Middleware Check Needed ideally
router.get("/dashboard", exports.getAdminDashboard);
router.get("/drivers", exports.getDrivers);
router.post("/drivers", exports.createDriver);
router.put("/drivers/:id/status", exports.updateDriverStatus);
router.post("/financial/note", exports.createFinancialNote);
router.get("/transactions", exports.getAdminTransactions);
// Vehicle routes
router.get("/vehicles", exports.getVehicles);
router.get("/vehicles/:id", exports.getVehicleById);
router.post("/vehicles", exports.createVehicle);
router.delete("/vehicles/:id", exports.deleteVehicle);
exports.default = router;
