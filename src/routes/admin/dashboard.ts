import { Request, Response, Router } from "express";
import { prisma } from "../../app";
import { authenticate } from "../../middleware/authMiddleware";

export const getAdminDashboard = async (req: Request, res: Response) => {
  try {
    const start = req.query.start as unknown as number;
    const end = req.query.end as unknown as number;
    console.log(req.query);
    console.log(start);
    console.log(new Date(+start));
    console.log(new Date(+end));

    const transactions = await prisma.transaction.findMany({
      where: { date: { gte: new Date(+start), lte: new Date(+end) } },
    });
    // const allTransactions = await prisma.transaction.findMany();

    // const allTransactions = await prisma.transaction.findMany();
    // const totalCashIn = allTransactions.filter((t) => t.type === "SELL" || t.type === "ADVANCE_PAYMENT").reduce((sum, t) => sum + Number(t.paymentCash || 0) + Number(t.paymentUpi || 0), 0);
    // const totalCashOut = allTransactions.reduce((sum, t) => sum + Number(t.totalAmount || 0), 0);
    const activeDrivers = await prisma.user.count({
      where: { role: "DRIVER", status: "ACTIVE" },
    });

    // Calculate payment received today from SELL transactions
    const sellTransactions = transactions.filter((t) => t.type === "SELL");
    const todayPaymentReceived = sellTransactions.reduce((sum, t) => sum + Number(t.paymentCash || 0) + Number(t.paymentUpi || 0), 0);

    // Calculate BUY stats
    const buyTransactions = transactions.filter((t) => t.type === "BUY");
    const todayBuyQuantity = buyTransactions.reduce((sum, t) => sum + Number(t.amount || 0), 0);
    const todayBuyTotalAmount = buyTransactions.reduce((sum, t) => sum + Number(t.totalAmount || 0), 0);
    const todayBuyAvgRate = todayBuyQuantity > 0 ? todayBuyTotalAmount / todayBuyQuantity : 0;

    // Calculate SELL stats
    const todaySellQuantity = sellTransactions.reduce((sum, t) => sum + Number(t.amount || 0), 0);
    const todaySellTotalAmount = sellTransactions.reduce((sum, t) => sum + Number(t.totalAmount || 0), 0);
    const todaySellAvgRate = todaySellQuantity > 0 ? todaySellTotalAmount / todaySellQuantity : 0;

    // Calculate total available stock from all drivers
    // Stock = Buy + Shop Buy + Palti(ADD) - Sell - Palti(SUBTRACT) - Weight Loss
    const totalStockIn = transactions.filter((t) => t.type === "BUY" || t.type === "SHOP_BUY" || (t.type === "PALTI" && t.paltiAction === "ADD")).reduce((sum, t) => sum + Number(t.amount || 0), 0);
    // const totalStockInAll = allTransactions.filter((t) => t.type === "BUY" || t.type === "SHOP_BUY" || (t.type === "PALTI" && t.paltiAction === "ADD")).reduce((sum, t) => sum + Number(t.amount || 0), 0);
    const totalStockOut = transactions.filter((t) => t.type === "SELL" || (t.type === "PALTI" && t.paltiAction === "SUBTRACT")).reduce((sum, t) => sum + Number(t.amount || 0), 0);
    // const totalStockOutAll = allTransactions.filter((t) => t.type === "SELL" || (t.type === "PALTI" && t.paltiAction === "SUBTRACT")).reduce((sum, t) => sum + Number(t.amount || 0), 0);
    const totalWeightLoss = transactions.filter((t) => t.type === "WEIGHT_LOSS").reduce((sum, t) => sum + Number(t.amount || 0), 0);
    // const totalWeightLossAll = allTransactions.filter((t) => t.type === "WEIGHT_LOSS").reduce((sum, t) => sum + Number(t.amount || 0), 0);
    const totalAvailableStock = totalStockIn - totalStockOut - totalWeightLoss;

    const totalWeightLossPercentage = totalWeightLoss > 0 ? (totalWeightLoss / todayBuyQuantity) * 100 : 0;

    // Calculate today's profit/loss (Sell - Buy)
    const todayProfit = todaySellTotalAmount - todayBuyTotalAmount;
    // const totalCash

    const banks = await prisma.bank.findMany({
      orderBy: { name: "asc" },
    });
    const totalBankBalance = banks.reduce((sum, bank) => sum + Number(bank.balance || 0), 0);
    const totalInMarket = await prisma.customer.aggregate({
      _sum: { balance: true },
    });
    const totalCompanyDue = await prisma.company.aggregate({
      _sum: { amountDue: true },
    });

    console.log(totalInMarket);

    const stats = {
      todayBuy: todayBuyQuantity,
      todayBuyTotalAmount,
      todayBuyAvgRate,
      todaySell: todaySellQuantity,
      todaySellTotalAmount,
      todaySellAvgRate,
      todayShopBuy: transactions.filter((t) => t.type === "SHOP_BUY").reduce((sum, t) => sum + Number(t.amount || 0), 0),
      todayFuel: transactions.filter((t) => t.type === "FUEL").length,
      todayWeightLoss: totalWeightLoss,
      todayPaymentReceived,
      activeDrivers,
      totalAvailableStock,
      totalWeightLossPercentage,
      todayProfit,
      banks: banks.map((b) => ({
        id: b.id,
        name: b.name,
        label: b.label,
        balance: Number(b.balance || 0),
      })),
      totalBankBalance,
      totalInMarket: Number(totalInMarket._sum?.balance || 0),
      totalCompanyDue: Number(totalCompanyDue._sum?.amountDue || 0),
    };

    res.json(stats);
  } catch (e) {
    console.log(e);
    res.status(500).json({ error: "Failed" });
  }
};

const router = Router();
router.use(authenticate);

router.get("/dashboard", getAdminDashboard);
