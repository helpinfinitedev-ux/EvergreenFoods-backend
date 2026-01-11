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
exports.deleteExpense = exports.updateExpense = exports.createExpense = exports.getExpenseSummary = exports.getExpenses = void 0;
const express_1 = require("express");
const app_1 = require("../app");
const authMiddleware_1 = require("../middleware/authMiddleware");
// GET all expenses with optional filters
const getExpenses = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { type, startDate, endDate, category } = req.query;
        const where = {};
        if (type) {
            where.type = type;
        }
        if (category) {
            where.category = category;
        }
        if (startDate || endDate) {
            where.date = {};
            if (startDate) {
                where.date.gte = new Date(startDate);
            }
            if (endDate) {
                where.date.lte = new Date(endDate);
            }
        }
        const expenses = yield app_1.prisma.expense.findMany({
            where,
            orderBy: { date: "desc" },
        });
        res.json(expenses);
    }
    catch (error) {
        console.error("Get expenses error:", error);
        res.status(500).json({ error: "Failed to fetch expenses" });
    }
});
exports.getExpenses = getExpenses;
// GET expense summary (totals by type)
const getExpenseSummary = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { startDate, endDate } = req.query;
        const where = {};
        if (startDate || endDate) {
            where.date = {};
            if (startDate) {
                where.date.gte = new Date(startDate);
            }
            if (endDate) {
                where.date.lte = new Date(endDate);
            }
        }
        const expenses = yield app_1.prisma.expense.findMany({ where });
        const cashTotal = expenses
            .filter((e) => e.type === "CASH")
            .reduce((sum, e) => sum + Number(e.amount), 0);
        const bankTotal = expenses
            .filter((e) => e.type === "BANK")
            .reduce((sum, e) => sum + Number(e.amount), 0);
        res.json({
            cashTotal,
            bankTotal,
            total: cashTotal + bankTotal,
            count: expenses.length,
        });
    }
    catch (error) {
        console.error("Get expense summary error:", error);
        res.status(500).json({ error: "Failed to fetch expense summary" });
    }
});
exports.getExpenseSummary = getExpenseSummary;
// POST create a new expense
const createExpense = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { type, amount, description, category, date } = req.body;
        if (!type || !amount || !description) {
            return res.status(400).json({ error: "Type, amount, and description are required" });
        }
        if (!["CASH", "BANK"].includes(type)) {
            return res.status(400).json({ error: "Type must be CASH or BANK" });
        }
        const expense = yield app_1.prisma.expense.create({
            data: {
                type,
                amount: parseFloat(amount),
                description,
                category: category || null,
                date: date ? new Date(date) : new Date(),
            },
        });
        res.status(201).json(expense);
    }
    catch (error) {
        console.error("Create expense error:", error);
        res.status(500).json({ error: "Failed to create expense" });
    }
});
exports.createExpense = createExpense;
// PUT update an expense
const updateExpense = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const { type, amount, description, category, date } = req.body;
        const existingExpense = yield app_1.prisma.expense.findUnique({
            where: { id },
        });
        if (!existingExpense) {
            return res.status(404).json({ error: "Expense not found" });
        }
        const updateData = {};
        if (type)
            updateData.type = type;
        if (amount)
            updateData.amount = parseFloat(amount);
        if (description)
            updateData.description = description;
        if (category !== undefined)
            updateData.category = category;
        if (date)
            updateData.date = new Date(date);
        const expense = yield app_1.prisma.expense.update({
            where: { id },
            data: updateData,
        });
        res.json(expense);
    }
    catch (error) {
        console.error("Update expense error:", error);
        res.status(500).json({ error: "Failed to update expense" });
    }
});
exports.updateExpense = updateExpense;
// DELETE an expense
const deleteExpense = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const existingExpense = yield app_1.prisma.expense.findUnique({
            where: { id },
        });
        if (!existingExpense) {
            return res.status(404).json({ error: "Expense not found" });
        }
        yield app_1.prisma.expense.delete({
            where: { id },
        });
        res.json({ success: true, message: "Expense deleted successfully" });
    }
    catch (error) {
        console.error("Delete expense error:", error);
        res.status(500).json({ error: "Failed to delete expense" });
    }
});
exports.deleteExpense = deleteExpense;
// --- Routes ---
const router = (0, express_1.Router)();
router.use(authMiddleware_1.authenticate);
router.use(authMiddleware_1.requireAdmin);
router.get("/", exports.getExpenses);
router.get("/summary", exports.getExpenseSummary);
router.post("/", exports.createExpense);
router.put("/:id", exports.updateExpense);
router.delete("/:id", exports.deleteExpense);
exports.default = router;
