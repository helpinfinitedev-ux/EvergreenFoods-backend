import { Request, Response, Router } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../app";
import { authenticate } from "../middleware/authMiddleware";

// --- Controllers ---

// 1. Dashboard Stats
export const getAdminDashboard = async (req: Request, res: Response) => {
  try {
    const today = new Date();
    const start = new Date(today.setHours(0, 0, 0, 0));
    const end = new Date(today.setHours(23, 59, 59, 999));

    const transactions = await prisma.transaction.findMany({
      where: { date: { gte: start, lte: end } },
    });

    const activeDrivers = await prisma.user.count({ where: { role: "DRIVER", status: "ACTIVE" } });

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

    const totalStockOut = transactions.filter((t) => t.type === "SELL" || (t.type === "PALTI" && t.paltiAction === "SUBTRACT")).reduce((sum, t) => sum + Number(t.amount || 0), 0);

    const totalWeightLoss = transactions.filter((t) => t.type === "WEIGHT_LOSS").reduce((sum, t) => sum + Number(t.amount || 0), 0);

    const totalAvailableStock = totalStockIn - totalStockOut - totalWeightLoss;

    const totalWeightLossPercentage = totalWeightLoss > 0 ? (totalWeightLoss / todayBuyQuantity) * 100 : 0;

    // Calculate today's profit/loss (Sell - Buy)
    const todayProfit = todaySellTotalAmount - todayBuyTotalAmount;

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
    };

    res.json(stats);
  } catch (e) {
    res.status(500).json({ error: "Failed" });
  }
};

// 2. Driver Management
export const getDrivers = async (req: Request, res: Response) => {
  const drivers = await prisma.user.findMany({
    where: { role: "DRIVER" },
    orderBy: { name: "asc" },
  });
  res.json(drivers);
};

export const updateDriverStatus = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { status } = req.body; // ACTIVE / BLOCKED
  await prisma.user.update({ where: { id }, data: { status } });
  res.json({ success: true });
};

export const createDriver = async (req: Request, res: Response) => {
  try {
    const { name, mobile, password, baseSalary } = req.body;

    const existingUser = await prisma.user.findUnique({ where: { mobile } });
    if (existingUser) {
      return res.status(400).json({ error: "Mobile number already registered" });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const driver = await prisma.user.create({
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
  } catch (error) {
    console.error("Create driver error:", error);
    res.status(500).json({ error: "Failed to create driver" });
  }
};

// 3. Financials (Debit/Credit Notes)
export const createFinancialNote = async (req: Request, res: Response) => {
  const { customerId, type, amount, reason } = req.body; // type: DEBIT_NOTE or CREDIT_NOTE
  const numericAmount = Number(amount);

  if (type !== "DEBIT_NOTE" && type !== "CREDIT_NOTE") return res.status(400).json({ error: "Invalid type" });

  await prisma.$transaction(async (tx) => {
    // Create Transaction Record
    await tx.transaction.create({
      data: {
        driverId: (req as any).user.userId, // Admin ID essentially
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

    await tx.customer.update({
      where: { id: customerId },
      data: { balance: { increment: adjustment } },
    });
  });

  res.json({ success: true });
};

// 4. Reports (Transactions)
export const getAdminTransactions = async (req: Request, res: Response) => {
  const { type, startDate, endDate, driverId } = req.query;

  const where: any = {};
  if (type) where.type = type;
  if (driverId) where.driverId = driverId;
  if (startDate && endDate) {
    where.date = {
      gte: new Date(startDate as string),
      lte: new Date(endDate as string),
    };
  }

  const logs = await prisma.transaction.findMany({
    where,
    include: { driver: true, customer: true, vehicle: true },
    orderBy: { date: "desc" },
    take: 100, // Pagination later
  });
  res.json(logs);
};

// 5. Vehicle Management
export const getVehicles = async (req: Request, res: Response) => {
  try {
    const vehicles = await prisma.vehicle.findMany({
      include: { drivers: true },
      orderBy: { createdAt: "desc" },
    });
    console.log(vehicles);
    res.json(vehicles);
  } catch (error) {
    console.error("Get vehicles error:", error);
    res.status(500).json({ error: "Failed to fetch vehicles" });
  }
};

export const getVehicleById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const vehicle = await prisma.vehicle.findUnique({
      where: { id },
      include: { drivers: true, transactions: { take: 10, orderBy: { date: "desc" } } },
    });

    if (!vehicle) {
      return res.status(404).json({ error: "Vehicle not found" });
    }

    res.json(vehicle);
  } catch (error) {
    console.error("Get vehicle error:", error);
    res.status(500).json({ error: "Failed to fetch vehicle" });
  }
};

export const createVehicle = async (req: Request, res: Response) => {
  try {
    const { registration, currentKm, status } = req.body;

    const existingVehicle = await prisma.vehicle.findUnique({ where: { registration } });
    if (existingVehicle) {
      return res.status(400).json({ error: "Vehicle with this registration already exists" });
    }

    const vehicle = await prisma.vehicle.create({
      data: {
        registration,
        currentKm: currentKm ? Number(currentKm) : 0,
        status: status || "ACTIVE",
      },
    });

    res.json({ success: true, vehicle });
  } catch (error) {
    console.error("Create vehicle error:", error);
    res.status(500).json({ error: "Failed to create vehicle" });
  }
};

// Update Transaction (for editing rate/totalAmount)
export const updateTransaction = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { rate, totalAmount } = req.body;

    const transaction = await prisma.transaction.findUnique({ where: { id } });
    if (!transaction) {
      return res.status(404).json({ error: "Transaction not found" });
    }

    const updated = await prisma.transaction.update({
      where: { id },
      data: {
        rate: rate !== undefined ? Number(rate) : transaction.rate,
        totalAmount: totalAmount !== undefined ? Number(totalAmount) : transaction.totalAmount,
      },
      include: { driver: true, customer: true, vehicle: true },
    });

    res.json({ success: true, transaction: updated });
  } catch (error) {
    console.error("Update transaction error:", error);
    res.status(500).json({ error: "Failed to update transaction" });
  }
};

export const deleteVehicle = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const vehicle = await prisma.vehicle.findUnique({ where: { id } });
    if (!vehicle) {
      return res.status(404).json({ error: "Vehicle not found" });
    }

    // Check if vehicle has any transactions
    const transactionCount = await prisma.transaction.count({ where: { vehicleId: id } });
    if (transactionCount > 0) {
      return res.status(400).json({ error: "Cannot delete vehicle with existing transactions" });
    }

    // Unassign drivers from this vehicle before deleting
    await prisma.user.updateMany({
      where: { vehicleId: id },
      data: { vehicleId: null },
    });

    await prisma.vehicle.delete({ where: { id } });

    res.json({ success: true, message: "Vehicle deleted successfully" });
  } catch (error) {
    console.error("Delete vehicle error:", error);
    res.status(500).json({ error: "Failed to delete vehicle" });
  }
};

// --- Routes ---
const router = Router();
router.use(authenticate); // Admin Middleware Check Needed ideally

router.get("/dashboard", getAdminDashboard);
router.get("/drivers", getDrivers);
router.post("/drivers", createDriver);
router.put("/drivers/:id/status", updateDriverStatus);
router.post("/financial/note", createFinancialNote);
router.get("/transactions", getAdminTransactions);
router.put("/transactions/:id", updateTransaction);

// Vehicle routes
router.get("/vehicles", getVehicles);
router.get("/vehicles/:id", getVehicleById);
router.post("/vehicles", createVehicle);
router.delete("/vehicles/:id", deleteVehicle);

export default router;
