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

export const updateDriver = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { password, baseSalary } = req.body as { password?: string; baseSalary?: number };

    const driver = await prisma.user.findUnique({ where: { id } });
    if (!driver || driver.role !== "DRIVER") {
      return res.status(404).json({ error: "Driver not found" });
    }

    const data: any = {};

    if (password !== undefined) {
      const pwd = String(password);
      if (pwd.trim().length < 4) return res.status(400).json({ error: "Password must be at least 4 characters" });
      data.passwordHash = await bcrypt.hash(pwd, 10);
    }

    if (baseSalary !== undefined) {
      const salaryNum = Number(baseSalary);
      if (Number.isNaN(salaryNum) || salaryNum < 0) return res.status(400).json({ error: "Invalid baseSalary" });
      data.baseSalary = salaryNum;
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: "Nothing to update" });
    }

    const updated = await prisma.user.update({
      where: { id },
      data,
    });

    res.json({
      success: true,
      driver: {
        id: updated.id,
        name: updated.name,
        mobile: updated.mobile,
        role: updated.role,
        status: updated.status,
        baseSalary: updated.baseSalary,
      },
    });
  } catch (error) {
    console.error("Update driver error:", error);
    res.status(500).json({ error: "Failed to update driver" });
  }
};

export const deleteDriver = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const driver = await prisma.user.findUnique({ where: { id } });
    if (!driver || driver.role !== "DRIVER") {
      return res.status(404).json({ error: "Driver not found" });
    }

    const txCount = await prisma.transaction.count({ where: { driverId: id } });
    if (txCount > 0) {
      return res.status(400).json({ error: "Cannot delete driver with existing transactions" });
    }

    await prisma.user.delete({ where: { id } });
    res.json({ success: true });
  } catch (error) {
    console.error("Delete driver error:", error);
    res.status(500).json({ error: "Failed to delete driver" });
  }
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

// 3B. Cash To Bank
export const getCashToBank = async (req: Request, res: Response) => {
  try {
    const pageSize = 10;
    const pageRaw = req.query.page as string | undefined;
    const startDate = req.query.startDate as string | undefined;
    const endDate = req.query.endDate as string | undefined;
    const page = Math.max(1, Number(pageRaw || 1) || 1);
    const skip = (page - 1) * pageSize;

    const where: any = {};
    if (startDate || endDate) {
      where.date = {};
      if (startDate) {
        const sd = new Date(startDate);
        if (Number.isNaN(sd.getTime())) return res.status(400).json({ error: "Invalid startDate" });
        where.date.gte = sd;
      }
      if (endDate) {
        const ed = new Date(endDate);
        if (Number.isNaN(ed.getTime())) return res.status(400).json({ error: "Invalid endDate" });
        // make endDate inclusive for the day if date-only string is passed
        ed.setHours(23, 59, 59, 999);
        where.date.lte = ed;
      }
    }

    const [total, rows, totalsByBank] = await Promise.all([
      prisma.cashToBank.count({ where }),
      prisma.cashToBank.findMany({
        where,
        orderBy: { date: "desc" },
        take: pageSize,
        skip,
      }),
      prisma.cashToBank.groupBy({
        by: ["bankName"],
        where,
        _sum: { amount: true },
      }),
    ]);

    res.json({
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      rows,
      totalsByBank: totalsByBank.map((t) => ({
        bankName: t.bankName,
        totalAmount: Number((t as any)._sum?.amount || 0),
      })),
    });
  } catch (error) {
    console.error("Get cash-to-bank error:", error);
    res.status(500).json({ error: "Failed to fetch cash-to-bank" });
  }
};

export const createCashToBank = async (req: Request, res: Response) => {
  try {
    const { bankName, amount, date } = req.body as { bankName: string; amount: number; date?: string };

    if (!bankName || String(bankName).trim() === "") return res.status(400).json({ error: "bankName is required" });
    const numericAmount = Number(amount);
    if (Number.isNaN(numericAmount) || numericAmount <= 0) return res.status(400).json({ error: "amount must be a number > 0" });

    const parsedDate = date ? new Date(date) : new Date();
    if (Number.isNaN(parsedDate.getTime())) return res.status(400).json({ error: "Invalid date" });

    const created = await prisma.cashToBank.create({
      data: {
        bankName: String(bankName).trim(),
        amount: numericAmount,
        date: parsedDate,
        // operation defaults to DEPOSIT in schema
      },
    });

    res.json({ success: true, cashToBank: created });
  } catch (error) {
    console.error("Create cash-to-bank error:", error);
    res.status(500).json({ error: "Failed to create cash-to-bank" });
  }
};

export const updateCashToBank = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { bankName, amount } = req.body as { bankName?: string; amount?: number };

    const existing = await prisma.cashToBank.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: "CashToBank entry not found" });

    const data: any = {};
    if (bankName !== undefined) {
      if (String(bankName).trim() === "") return res.status(400).json({ error: "bankName cannot be empty" });
      data.bankName = String(bankName).trim();
    }
    if (amount !== undefined) {
      const numericAmount = Number(amount);
      if (Number.isNaN(numericAmount) || numericAmount <= 0) return res.status(400).json({ error: "amount must be a number > 0" });
      data.amount = numericAmount;
    }
    if (Object.keys(data).length === 0) return res.status(400).json({ error: "Nothing to update" });

    const updated = await prisma.cashToBank.update({
      where: { id },
      data,
    });

    res.json({ success: true, cashToBank: updated });
  } catch (error) {
    console.error("Update cash-to-bank error:", error);
    res.status(500).json({ error: "Failed to update cash-to-bank" });
  }
};

export const deleteCashToBank = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const existing = await prisma.cashToBank.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: "CashToBank entry not found" });

    await prisma.cashToBank.delete({ where: { id } });
    res.json({ success: true });
  } catch (error) {
    console.error("Delete cash-to-bank error:", error);
    res.status(500).json({ error: "Failed to delete cash-to-bank" });
  }
};

// 4. Reports (Transactions)
export const getAdminTransactions = async (req: Request, res: Response) => {
  const { type, startDate, endDate, driverId, details } = req.query;

  const where: any = {};
  if (type) where.type = type;
  if (driverId) where.driverId = driverId;
  if (startDate && endDate) {
    where.date = {
      gte: new Date(startDate as string),
      lte: new Date(endDate as string),
    };
  }
  if (details) {
    where.details = {
      contains: String(details), // e.g. "abc"
      mode: "insensitive", // optional (case-insensitive)
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
    const { rate, totalAmount, details } = req.body;

    const transaction = await prisma.transaction.findUnique({ where: { id } });
    if (!transaction) {
      return res.status(404).json({ error: "Transaction not found" });
    }

    const updated = await prisma.transaction.update({
      where: { id },
      data: {
        rate: rate !== undefined ? Number(rate) : transaction.rate,
        totalAmount: totalAmount !== undefined ? Number(totalAmount) : transaction.totalAmount,
        details: details !== undefined ? (String(details).trim() === "" ? null : String(details)) : transaction.details,
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
router.put("/drivers/:id", updateDriver);
router.delete("/drivers/:id", deleteDriver);
router.put("/drivers/:id/status", updateDriverStatus);
router.post("/financial/note", createFinancialNote);
router.get("/cash-to-bank", getCashToBank);
router.post("/cash-to-bank", createCashToBank);
router.put("/cash-to-bank/:id", updateCashToBank);
router.delete("/cash-to-bank/:id", deleteCashToBank);
router.get("/transactions", getAdminTransactions);
router.put("/transactions/:id", updateTransaction);

// Vehicle routes
router.get("/vehicles", getVehicles);
router.get("/vehicles/:id", getVehicleById);
router.post("/vehicles", createVehicle);
router.delete("/vehicles/:id", deleteVehicle);

export default router;
