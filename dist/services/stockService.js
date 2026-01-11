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
exports.getDashboardStats = exports.getDriverStock = void 0;
const app_1 = require("../app");
const date_fns_1 = require("date-fns");
const getDriverStock = (driverId_1, ...args_1) => __awaiter(void 0, [driverId_1, ...args_1], void 0, function* (driverId, date = new Date()) {
    const start = (0, date_fns_1.startOfDay)(date);
    const end = (0, date_fns_1.endOfDay)(date);
    const transactions = yield app_1.prisma.transaction.findMany({
        where: {
            driverId,
            date: {
                gte: start,
                lte: end,
            },
        },
    });
    const todayBuy = transactions
        .filter(t => t.type === 'BUY' || t.type === 'SHOP_BUY' || (t.type === 'PALTI' && t.paltiAction === 'ADD'))
        .reduce((sum, t) => sum + Number(t.amount), 0);
    const todaySell = transactions
        .filter(t => t.type === 'SELL' || (t.type === 'PALTI' && t.paltiAction === 'SUBTRACT'))
        .reduce((sum, t) => sum + Number(t.amount), 0);
    const todayWeightLoss = transactions
        .filter(t => t.type === 'WEIGHT_LOSS')
        .reduce((sum, t) => sum + Number(t.amount), 0);
    return todayBuy - todaySell - todayWeightLoss;
});
exports.getDriverStock = getDriverStock;
const getDashboardStats = (driverId_1, ...args_1) => __awaiter(void 0, [driverId_1, ...args_1], void 0, function* (driverId, date = new Date()) {
    const start = (0, date_fns_1.startOfDay)(date);
    const end = (0, date_fns_1.endOfDay)(date);
    const transactions = yield app_1.prisma.transaction.findMany({
        where: {
            driverId,
            date: { gte: start, lte: end },
        },
    });
    const todayBuyKg = transactions
        .filter(t => t.type === 'BUY' || t.type === 'SHOP_BUY' || (t.type === 'PALTI' && t.paltiAction === 'ADD'))
        .reduce((sum, t) => sum + Number(t.amount), 0);
    const todaySellKg = transactions
        .filter(t => t.type === 'SELL' || (t.type === 'PALTI' && t.paltiAction === 'SUBTRACT'))
        .reduce((sum, t) => sum + Number(t.amount), 0);
    const todayWeightLoss = transactions
        .filter(t => t.type === 'WEIGHT_LOSS')
        .reduce((sum, t) => sum + Number(t.amount), 0);
    const todayFuelLiters = transactions
        .filter(t => t.type === 'FUEL')
        .reduce((sum, t) => sum + Number(t.amount), 0);
    return {
        todayBuyKg,
        todaySellKg,
        todayFuelLiters,
        todayStock: todayBuyKg - todaySellKg - todayWeightLoss,
    };
});
exports.getDashboardStats = getDashboardStats;
