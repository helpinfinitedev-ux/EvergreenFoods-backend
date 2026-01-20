import { prisma } from '../app';
import { startOfDay, endOfDay } from 'date-fns';

export const getDriverStock = async (driverId: string, date: Date = new Date()) => {
    const start = startOfDay(date);
    const end = endOfDay(date);

    const transactions = await prisma.transaction.findMany({
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
};

export const getDashboardStats = async (driverId: string, date: Date = new Date()) => {
    const start = startOfDay(date);
    const end = endOfDay(date);

    const transactions = await prisma.transaction.findMany({
        where: {
            driverId,
            date: { gte: start, lte: end },
        },
    });
    const allTransactions = await prisma.transaction.findMany({where:{
        driverId
    }});

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

    const todayStock = todayBuyKg - todaySellKg - todayWeightLoss;

    const totalStockIn = allTransactions.filter((t) => t.type === "BUY" || t.type === "SHOP_BUY" || (t.type === "PALTI" && t.paltiAction === "ADD")).reduce((sum, t) => sum + Number(t.amount || 0), 0);
    const totalStockOut = allTransactions.filter((t) => t.type === "SELL" || (t.type === "PALTI" && t.paltiAction === "SUBTRACT")).reduce((sum, t) => sum + Number(t.amount || 0), 0);
    const totalWeightLoss = allTransactions.filter((t) => t.type === "WEIGHT_LOSS").reduce((sum, t) => sum + Number(t.amount || 0), 0); 

    const totalStock = totalStockIn - totalStockOut - totalWeightLoss;


    return {
        todayBuyKg,
        todaySellKg,
        todayFuelLiters,
        todayStock: totalStock
    }
}
