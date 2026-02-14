import { Request, Response } from "express";
import { prisma } from "../../app";

export const getProfit = async (req: Request, res: Response) => {
  try {
    const params = req.query;
    const { start, end } = params;
    const startDate = new Date(start as string);
    const endDate = new Date(end as string);
    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(23, 59, 59, 999);
    const transactions = await prisma.transaction.findMany({
      where: {
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
    });
    const buyTransactions = transactions.filter((t) => t.type === "BUY");
    const sellTransactions = transactions.filter((t) => t.type === "SELL");
    const receivePaymentTransactions = transactions.filter((t) => t.type === "RECEIVE_PAYMENT");
    const paymentTransactions = transactions.filter((t) => t.type === "PAYMENT");
    const expenseTransactions = transactions.filter((t) => t.type === "EXPENSE");

    const expenseAmount = expenseTransactions.reduce((sum, t) => sum + Number(t.totalAmount || 0), 0);
    const paymentAmount = paymentTransactions.reduce((sum, t) => sum + Number(t.totalAmount || 0), 0);
    const receivePaymentAmount = receivePaymentTransactions.reduce((sum, t) => sum + Number(t.totalAmount || 0), 0);
    const totalBuyAmount = buyTransactions.reduce((sum, t) => sum + Number(t.totalAmount || 0), 0);
    const totalSellAmount = sellTransactions.reduce((sum, t) => sum + Number(t.totalAmount || 0), 0);
    const profit = totalSellAmount - totalBuyAmount - expenseAmount + paymentAmount - receivePaymentAmount;

    res.json({ profit });
  } catch (error) {
    console.error("Get profit error:", error);
    res.status(500).json({ error: "Failed to fetch profit" });
  }
};
