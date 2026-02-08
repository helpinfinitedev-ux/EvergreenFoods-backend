import { Prisma, PrismaClient, Transaction } from "@prisma/client";
import { prisma } from "../app";
import { startOfDay, endOfDay } from "date-fns";
import { DefaultArgs, PrismaClientOptions } from "@prisma/client/runtime/library";

export const getDriverStock = async (driverId: string, date: Date = new Date()) => {
  const start = startOfDay(date);
  const end = endOfDay(date);

  const transactions = await prisma.transaction.findMany({
    where: {
      driverId,
    },
  });

  const todayBuy = transactions.filter((t) => t.type === "BUY" || t.type === "SHOP_BUY" || (t.type === "PALTI" && t.paltiAction === "ADD")).reduce((sum, t) => sum + Number(t.amount), 0);

  const todaySell = transactions.filter((t) => t.type === "SELL" || (t.type === "PALTI" && t.paltiAction === "SUBTRACT")).reduce((sum, t) => sum + Number(t.amount), 0);

  const todayWeightLoss = transactions.filter((t) => t.type === "WEIGHT_LOSS").reduce((sum, t) => sum + Number(t.amount), 0);

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
  const allTransactions = await prisma.transaction.findMany({
    where: {
      driverId,
    },
  });

  const todayBuyKg = transactions.filter((t) => t.type === "BUY" || t.type === "SHOP_BUY" || (t.type === "PALTI" && t.paltiAction === "ADD")).reduce((sum, t) => sum + Number(t.amount), 0);

  const todaySellKg = transactions.filter((t) => t.type === "SELL" || (t.type === "PALTI" && t.paltiAction === "SUBTRACT")).reduce((sum, t) => sum + Number(t.amount), 0);

  const todayWeightLoss = transactions.filter((t) => t.type === "WEIGHT_LOSS").reduce((sum, t) => sum + Number(t.amount), 0);

  const todayFuelLiters = transactions.filter((t) => t.type === "FUEL").reduce((sum, t) => sum + Number(t.amount), 0);

  const todayStock = todayBuyKg - todaySellKg - todayWeightLoss;

  const totalStockIn = allTransactions.filter((t) => t.type === "BUY" || t.type === "SHOP_BUY" || (t.type === "PALTI" && t.paltiAction === "ADD")).reduce((sum, t) => sum + Number(t.amount || 0), 0);
  const totalStockOut = allTransactions.filter((t) => t.type === "SELL" || (t.type === "PALTI" && t.paltiAction === "SUBTRACT")).reduce((sum, t) => sum + Number(t.amount || 0), 0);
  const totalWeightLoss = allTransactions.filter((t) => t.type === "WEIGHT_LOSS").reduce((sum, t) => sum + Number(t.amount || 0), 0);

  const totalStock = totalStockIn - totalStockOut - totalWeightLoss;

  return {
    todayBuyKg: Number(todayBuyKg?.toFixed(2)),
    todaySellKg: Number(todaySellKg?.toFixed(2)),
    todayFuelLiters: Number(todayFuelLiters?.toFixed(2)),
    todayStock: Number(totalStock?.toFixed(2)),
  };
};
