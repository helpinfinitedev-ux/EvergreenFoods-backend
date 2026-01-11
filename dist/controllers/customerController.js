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
exports.getCustomerHistory = exports.addCustomer = exports.getCustomers = void 0;
const app_1 = require("../app");
const getCustomers = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const customers = yield app_1.prisma.customer.findMany({
            orderBy: { name: 'asc' }
        });
        res.json(customers);
    }
    catch (e) {
        res.status(500).json({ error: 'Failed' });
    }
});
exports.getCustomers = getCustomers;
const addCustomer = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { name, mobile, address, balance } = req.body;
        const customer = yield app_1.prisma.customer.create({
            data: {
                name,
                mobile,
                address,
                balance: balance || 0
            }
        });
        res.json(customer);
    }
    catch (e) {
        res.status(400).json({ error: 'Failed to add customer' });
    }
});
exports.addCustomer = addCustomer;
const getCustomerHistory = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        // Last 7 days? Or full history?
        // Let's give last 30 days for backend
        const now = new Date();
        const past = new Date(now.setDate(now.getDate() - 30));
        const history = yield app_1.prisma.transaction.findMany({
            where: {
                customerId: id,
                date: { gte: past }
            },
            orderBy: { date: 'desc' }
        });
        res.json(history);
    }
    catch (e) {
        res.status(500).json({ error: 'Failed' });
    }
});
exports.getCustomerHistory = getCustomerHistory;
