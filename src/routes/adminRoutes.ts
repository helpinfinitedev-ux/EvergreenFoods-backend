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

    const allTransactions = await prisma.transaction.findMany();
    // const totalCashIn = allTransactions.filter((t) => t.type === "SELL" || t.type === "ADVANCE_PAYMENT").reduce((sum, t) => sum + Number(t.paymentCash || 0) + Number(t.paymentUpi || 0), 0);
    // const totalCashOut = allTransactions.reduce((sum, t) => sum + Number(t.totalAmount || 0), 0);
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

// 2A. Admin Borrowed Money
export const getBorrowedInfo = async (req: Request, res: Response) => {
  try {
    const adminId = (req as any).user?.userId;
    if (!adminId) return res.status(401).json({ error: "Unauthorized" });

    const rows = await prisma.borrowedMoney.findMany({
      where: { adminId },
      orderBy: { borrowedOn: "desc" },
    });

    res.json(rows);
  } catch (error) {
    console.error("Get borrowed info error:", error);
    res.status(500).json({ error: "Failed to fetch borrowed info" });
  }
};

export const addBorrowedInfo = async (req: Request, res: Response) => {
  try {
    const adminId = (req as any).user?.userId;
    if (!adminId) return res.status(401).json({ error: "Unauthorized" });

    const { borrowedMoney, borrowedFrom, borrowedOn } = req.body as {
      borrowedMoney?: number;
      borrowedFrom?: string;
      borrowedOn?: string;
    };

    const data: any = {};
    if (borrowedMoney !== undefined) {
      const amount = Number(borrowedMoney);
      if (Number.isNaN(amount) || amount < 0) return res.status(400).json({ error: "borrowedMoney must be a number >= 0" });
      data.borrowedMoney = amount;
    }
    if (borrowedFrom !== undefined) data.borrowedFrom = String(borrowedFrom) || null;
    if (borrowedOn !== undefined) data.borrowedOn = borrowedOn ? new Date(borrowedOn) : null;

    const created = await prisma.borrowedMoney.create({
      data: {
        adminId,
        borrowedMoney: data.borrowedMoney ?? 0,
        borrowedFrom: data.borrowedFrom ?? null,
        borrowedOn: data.borrowedOn ?? null,
      },
    });

    res.json(created);
  } catch (error) {
    console.error("Add borrowed info error:", error);
    res.status(500).json({ error: "Failed to add borrowed info" });
  }
};

export const updateBorrowedInfo = async (req: Request, res: Response) => {
  try {
    const adminId = (req as any).user?.userId;
    if (!adminId) return res.status(401).json({ error: "Unauthorized" });

    const { id } = req.params;
    const { borrowedMoney, borrowedFrom, borrowedOn } = req.body as {
      borrowedMoney?: number;
      borrowedFrom?: string;
      borrowedOn?: string;
    };

    const existing = await prisma.borrowedMoney.findUnique({ where: { id } });
    if (!existing || existing.adminId !== adminId) {
      return res.status(404).json({ error: "Borrowed entry not found" });
    }

    const data: any = {};
    if (borrowedMoney !== undefined) {
      const amount = Number(borrowedMoney);
      if (Number.isNaN(amount) || amount < 0) return res.status(400).json({ error: "borrowedMoney must be a number >= 0" });
      data.borrowedMoney = amount;
    }
    if (borrowedFrom !== undefined) data.borrowedFrom = String(borrowedFrom) || null;
    if (borrowedOn !== undefined) data.borrowedOn = borrowedOn ? new Date(borrowedOn) : null;

    if (Object.keys(data).length === 0) return res.status(400).json({ error: "Nothing to update" });

    const updated = await prisma.borrowedMoney.update({
      where: { id },
      data,
    });

    res.json(updated);
  } catch (error) {
    console.error("Update borrowed info error:", error);
    res.status(500).json({ error: "Failed to update borrowed info" });
  }
};

export const deleteBorrowedInfo = async (req: Request, res: Response) => {
  try {
    const adminId = (req as any).user?.userId;
    if (!adminId) return res.status(401).json({ error: "Unauthorized" });

    const { id } = req.params;

    const existing = await prisma.borrowedMoney.findUnique({ where: { id } });
    if (!existing || existing.adminId !== adminId) {
      return res.status(404).json({ error: "Borrowed entry not found" });
    }

    await prisma.borrowedMoney.delete({ where: { id } });

    res.json({ success: true });
  } catch (error) {
    console.error("Delete borrowed info error:", error);
    res.status(500).json({ error: "Failed to delete borrowed info" });
  }
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

// 2B. Customer Payments Received
export const getCustomersWithDue = async (req: Request, res: Response) => {
  try {
    const startDate = req.query.startDate as string | undefined;
    const endDate = req.query.endDate as string | undefined;

    const where: any = { balance: { gt: 0 } };
    if (startDate || endDate) {
      where.updatedAt = {};
      if (startDate) {
        const sd = new Date(startDate);
        if (Number.isNaN(sd.getTime())) return res.status(400).json({ error: "Invalid startDate" });
        where.updatedAt.gte = sd;
      }
      if (endDate) {
        const ed = new Date(endDate);
        if (Number.isNaN(ed.getTime())) return res.status(400).json({ error: "Invalid endDate" });
        ed.setHours(23, 59, 59, 999);
        where.updatedAt.lte = ed;
      }
    }

    const customers = await prisma.customer.findMany({
      where,
      orderBy: { name: "asc" },
    });
    res.json(customers);
  } catch (error) {
    console.error("Get customers with due error:", error);
    res.status(500).json({ error: "Failed to fetch customers" });
  }
};

export const receiveCustomerPayment = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { amount, method, bankId } = req.body as {
      amount: number;
      method: "CASH" | "BANK";
      bankId?: string;
    };

    const numericAmount = Number(amount);
    if (Number.isNaN(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({ error: "amount must be a number > 0" });
    }
    if (!["CASH", "BANK"].includes(method)) {
      return res.status(400).json({ error: "method must be CASH or BANK" });
    }
    if (method === "BANK" && !bankId) {
      return res.status(400).json({ error: "bankId is required for BANK payments" });
    }

    const result = await prisma.$transaction(async (tx) => {
      const customer = await tx.customer.findUnique({ where: { id } });
      if (!customer) {
        throw new Error("CUSTOMER_NOT_FOUND");
      }

      if (method === "BANK") {
        const bank = await tx.bank.findUnique({ where: { id: bankId } });
        if (!bank) {
          throw new Error("BANK_NOT_FOUND");
        }
        await tx.bank.update({
          where: { id: bankId },
          data: { balance: { increment: numericAmount } },
        });
      }

      if (method === "CASH") {
        const totalCashId = process.env.TOTAL_CASH_ID;
        if (!totalCashId) {
          throw new Error("TOTAL_CASH_ID_NOT_SET");
        }

        const capital = await tx.totalCapital.findUnique({ where: { id: totalCashId } });
        if (!capital) {
          throw new Error("TOTAL_CAPITAL_NOT_FOUND");
        }

        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        let todayCashUpdate: number;
        if (capital.cashLastUpdatedAt) {
          const lastUpdated = new Date(capital.cashLastUpdatedAt);
          const lastUpdatedDay = new Date(lastUpdated.getFullYear(), lastUpdated.getMonth(), lastUpdated.getDate());
          if (lastUpdatedDay.getTime() === today.getTime()) {
            todayCashUpdate = Number(capital.todayCash) + numericAmount;
          } else {
            todayCashUpdate = numericAmount;
          }
        } else {
          todayCashUpdate = numericAmount;
        }

        await tx.totalCapital.update({
          where: { id: totalCashId },
          data: {
            totalCash: { increment: numericAmount },
            todayCash: todayCashUpdate,
            cashLastUpdatedAt: now,
          },
        });
      }

      const newBalance = Math.max(0, Number(customer.balance) - numericAmount);
      const updatedCustomer = await tx.customer.update({
        where: { id },
        data: { balance: newBalance },
      });
      const updatedTransaction = await tx.transaction.create({
        data: {
          type: "RECEIVE_PAYMENT",
          amount: 0,
          totalAmount: numericAmount,
          customerId: id,
          unit: "INR",
          driverId: (req as any).user.userId,
        },
      });

      return updatedCustomer;
    });

    res.json({ success: true, customer: result });
  } catch (error: any) {
    if (error?.message === "CUSTOMER_NOT_FOUND") {
      return res.status(404).json({ error: "Customer not found" });
    }
    if (error?.message === "BANK_NOT_FOUND") {
      return res.status(404).json({ error: "Bank not found" });
    }
    if (error?.message === "TOTAL_CASH_ID_NOT_SET") {
      return res.status(400).json({ error: "TOTAL_CASH_ID is not configured" });
    }
    if (error?.message === "TOTAL_CAPITAL_NOT_FOUND") {
      return res.status(404).json({ error: "Total capital record not found" });
    }
    console.error("Receive customer payment error:", error);
    res.status(500).json({ error: "Failed to receive payment" });
  }
};

// 3. Financials (Debit/Credit Notes)
export const createFinancialNote = async (req: Request, res: Response) => {
  const { customerId, type, amount, reason, weight } = req.body; // type: DEBIT_NOTE or CREDIT_NOTE
  const numericAmount = Number(amount);
  const numericWeight = weight ? Number(weight) : 0;

  if (type !== "DEBIT_NOTE" && type !== "CREDIT_NOTE") return res.status(400).json({ error: "Invalid type" });

  await prisma.$transaction(async (tx) => {
    // Create Transaction Record
    await tx.transaction.create({
      data: {
        driverId: (req as any).user.userId, // Admin ID essentially
        customerId,
        type,
        amount: numericWeight, // Store weight/qty
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
    const { bankName, amount, date, bankId } = req.body as { bankName: string; amount: number; date?: string; bankId: string };

    if (!bankName || String(bankName).trim() === "") return res.status(400).json({ error: "bankName is required" });
    const numericAmount = Number(amount);
    if (Number.isNaN(numericAmount) || numericAmount <= 0) return res.status(400).json({ error: "amount must be a number > 0" });

    const parsedDate = date ? new Date(date) : new Date();
    if (Number.isNaN(parsedDate.getTime())) return res.status(400).json({ error: "Invalid date" });

    const created = await prisma.$transaction(async (tx) => {
      const cashToBank = await tx.cashToBank.create({
        data: {
          bankName: String(bankName).trim(),
          amount: numericAmount,
          date: parsedDate,
          bankId,
          // operation defaults to DEPOSIT in schema
        },
      });

      if (process.env.TOTAL_CASH_ID) {
        const capitalRecord = await tx.totalCapital.findUnique({
          where: { id: process.env.TOTAL_CASH_ID },
        });

        if (capitalRecord) {
          const now = new Date();
          const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          let todayCashUpdate: number | undefined;

          if (capitalRecord.cashLastUpdatedAt) {
            const lastUpdated = new Date(capitalRecord.cashLastUpdatedAt);
            const lastUpdatedDay = new Date(lastUpdated.getFullYear(), lastUpdated.getMonth(), lastUpdated.getDate());
            if (lastUpdatedDay.getTime() === today.getTime()) {
              todayCashUpdate = Number(capitalRecord.todayCash) - numericAmount;
            }
          }
          if (+capitalRecord?.totalCash - numericAmount < 0) {
            return res.status(400).json({ error: "Total cash is not enough" });
          }
          const data: any = {
            totalCash: { decrement: numericAmount },
          };
          if (todayCashUpdate !== undefined) {
            data.todayCash = todayCashUpdate;
          }

          await tx.totalCapital.update({
            where: { id: process.env.TOTAL_CASH_ID },
            data,
          });
        }
      }
      if (bankId) {
        const bank = await tx.bank.findUnique({ where: { id: bankId } });
        if (bank) {
          const data: any = {
            balance: { increment: numericAmount },
          };
          await tx.bank.update({
            where: { id: bankId },
            data,
          });
        }
      }

      return cashToBank;
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
    const { bankName, amount, bankId } = req.body as { bankName?: string; amount?: number; bankId?: string };

    const existing = await prisma.cashToBank.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: "CashToBank entry not found" });

    const data: any = {};
    if (bankName !== undefined) {
      if (String(bankName).trim() === "") return res.status(400).json({ error: "bankName cannot be empty" });
      data.bankName = String(bankName).trim();
    }

    let newAmount: number | undefined;
    if (amount !== undefined) {
      const numericAmount = Number(amount);
      if (Number.isNaN(numericAmount) || numericAmount <= 0) return res.status(400).json({ error: "amount must be a number > 0" });
      newAmount = numericAmount;
      data.amount = numericAmount;
    }

    if (bankId !== undefined) {
      data.bankId = bankId;
    }

    if (Object.keys(data).length === 0) return res.status(400).json({ error: "Nothing to update" });

    const oldAmount = Number(existing.amount);
    const finalNewAmount = newAmount ?? oldAmount;
    const amountDifference = finalNewAmount - oldAmount;
    const oldBankId = existing.bankId;
    const newBankId = bankId !== undefined ? bankId : oldBankId;

    const updated = await prisma.$transaction(async (tx) => {
      // Update the CashToBank entry
      const cashToBank = await tx.cashToBank.update({
        where: { id },
        data,
      });

      // Handle totalCash and todayCash adjustments if amount changed
      if (amountDifference !== 0 && process.env.TOTAL_CASH_ID) {
        const capitalRecord = await tx.totalCapital.findUnique({
          where: { id: process.env.TOTAL_CASH_ID },
        });

        if (capitalRecord) {
          // If amount increased, we need to decrement more from totalCash
          // If amount decreased, we need to increment totalCash (add back the difference)
          const now = new Date();
          const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          let todayCashUpdate: number | undefined;

          if (capitalRecord.cashLastUpdatedAt) {
            const lastUpdated = new Date(capitalRecord.cashLastUpdatedAt);
            const lastUpdatedDay = new Date(lastUpdated.getFullYear(), lastUpdated.getMonth(), lastUpdated.getDate());
            if (lastUpdatedDay.getTime() === today.getTime()) {
              // Adjust todayCash by the difference
              todayCashUpdate = Number(capitalRecord.todayCash) - amountDifference;
            }
          }

          // Check if we have enough cash for an increase
          if (amountDifference > 0 && Number(capitalRecord.totalCash) - amountDifference < 0) {
            throw new Error("INSUFFICIENT_CASH");
          }

          const capitalData: any = {};
          if (amountDifference > 0) {
            capitalData.totalCash = { decrement: amountDifference };
          } else if (amountDifference < 0) {
            capitalData.totalCash = { increment: Math.abs(amountDifference) };
          }

          if (todayCashUpdate !== undefined) {
            capitalData.todayCash = Math.max(0, todayCashUpdate);
          }

          if (Object.keys(capitalData).length > 0) {
            await tx.totalCapital.update({
              where: { id: process.env.TOTAL_CASH_ID },
              data: capitalData,
            });
          }
        }
      }

      // Handle bank balance adjustments
      // If bank changed, remove from old bank and add to new bank
      // If only amount changed but same bank, just adjust the difference
      if (oldBankId && oldBankId !== newBankId) {
        // Remove old amount from old bank
        await tx.bank.update({
          where: { id: oldBankId },
          data: { balance: { decrement: oldAmount } },
        });
      }

      if (newBankId && oldBankId !== newBankId) {
        // Add new amount to new bank
        await tx.bank.update({
          where: { id: newBankId },
          data: { balance: { increment: finalNewAmount } },
        });
      } else if (newBankId && oldBankId === newBankId && amountDifference !== 0) {
        // Same bank, just adjust by the difference
        if (amountDifference > 0) {
          await tx.bank.update({
            where: { id: newBankId },
            data: { balance: { increment: amountDifference } },
          });
        } else {
          await tx.bank.update({
            where: { id: newBankId },
            data: { balance: { decrement: Math.abs(amountDifference) } },
          });
        }
      }

      return cashToBank;
    });

    res.json({ success: true, cashToBank: updated });
  } catch (error: any) {
    if (error?.message === "INSUFFICIENT_CASH") {
      return res.status(400).json({ error: "Not enough cash available for this update" });
    }
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
  const { type, startDate, endDate, driverId, details, page, companyName } = req.query;

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
  if (companyName) {
    where.companyName = {
      contains: String(companyName),
      mode: "insensitive",
    };
  }

  const pageNum = Math.max(1, Number(page) || 1);
  const pageSize = 50;

  if (page !== undefined) {
    const skip = (pageNum - 1) * pageSize;
    const [total, rows] = await Promise.all([
      prisma.transaction.count({ where }),
      prisma.transaction.findMany({
        where,
        include: { driver: true, customer: true, vehicle: true, company: true },
        orderBy: { date: "desc" },
        skip,
        take: pageSize,
      }),
    ]);
    res.json({
      page: pageNum,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      rows,
    });
    return;
  }

  const logs = await prisma.transaction.findMany({
    where,
    include: { driver: true, customer: true, vehicle: true },
    orderBy: { date: "desc" },
    take: 100, // fallback for non-paginated calls
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
    if (!registration) return res.status(400).json({ error: "Registration is required" });

    const vehicle = await prisma.vehicle.create({
      data: {
        registration,
        currentKm: Number(currentKm || 0),
        status: status || "ACTIVE",
      },
    });
    res.json(vehicle);
  } catch (error) {
    console.error("Create vehicle error:", error);
    res.status(500).json({ error: "Failed to create vehicle" });
  }
};

export const updateVehicle = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { registration, currentKm, status } = req.body;

    const existing = await prisma.vehicle.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: "Vehicle not found" });

    const data: any = {};
    if (registration !== undefined) data.registration = registration;
    if (currentKm !== undefined) data.currentKm = Number(currentKm);
    if (status !== undefined) data.status = status;

    const updated = await prisma.vehicle.update({
      where: { id },
      data,
    });
    res.json(updated);
  } catch (error) {
    console.error("Update vehicle error:", error);
    res.status(500).json({ error: "Failed to update vehicle" });
  }
};

// Update Transaction (for editing amount/rate/totalAmount)
export const updateTransaction = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { amount, rate, totalAmount, details, companyId } = req.body;

    const transaction = await prisma.transaction.findUnique({ where: { id } });
    if (!transaction) {
      return res.status(404).json({ error: "Transaction not found" });
    }

    const updated = await prisma.transaction.update({
      where: { id },
      data: {
        amount: amount !== undefined ? Number(amount) : transaction.amount,
        rate: rate !== undefined ? Number(rate) : transaction.rate,
        totalAmount: totalAmount !== undefined ? Number(totalAmount) : transaction.totalAmount,
        details: details !== undefined ? (String(details).trim() === "" ? null : String(details)) : transaction.details,
      },
      include: { driver: true, customer: true, vehicle: true },
    });

    const company = await prisma.company.findUnique({ where: { id: companyId } });
    if (!company) {
      return res.status(404).json({ error: "Company not found" });
    }

    const updatedCompany = await prisma.company.update({
      where: { id: companyId },
      data: {
        amountDue: {
          increment: Number(transaction.totalAmount),
        },
      },
    });

    res.json({ success: true, transaction: updated, company: updatedCompany });
  } catch (error) {
    console.error("Update transaction error:", error);
    res.status(500).json({ error: "Failed to update transaction" });
  }
};

export const deleteTransaction = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const result = await prisma.$transaction(async (tx) => {
      const transaction = await tx.transaction.findUnique({ where: { id } });
      if (!transaction) {
        throw new Error("TRANSACTION_NOT_FOUND");
      }
      if (transaction.type !== "SELL") {
        throw new Error("UNSUPPORTED_TRANSACTION_TYPE");
      }

      if (transaction.customerId) {
        const bill = Number(transaction.totalAmount || 0);
        const paid = Number(transaction.paymentCash || 0) + Number(transaction.paymentUpi || 0);
        const change = bill - paid;
        if (change !== 0) {
          await tx.customer.update({
            where: { id: transaction.customerId },
            data: { balance: { increment: -change } },
          });
        }
      }

      const cashAmount = Number(transaction.paymentCash || 0);
      if (cashAmount > 0) {
        const totalCashId = process.env.TOTAL_CASH_ID;
        if (!totalCashId) {
          throw new Error("TOTAL_CASH_ID_NOT_SET");
        }

        const transactionDate = new Date(transaction.date);
        const today = new Date();
        const transactionDay = new Date(transactionDate.getFullYear(), transactionDate.getMonth(), transactionDate.getDate());
        const todayDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        const isToday = transactionDay.getTime() === todayDay.getTime();

        const capital = await tx.totalCapital.findUnique({ where: { id: totalCashId } });
        if (!capital) {
          throw new Error("TOTAL_CAPITAL_NOT_FOUND");
        }

        await tx.totalCapital.update({
          where: { id: totalCashId },
          data: {
            totalCash: { decrement: cashAmount },
            ...(isToday ? { todayCash: { decrement: cashAmount }, cashLastUpdatedAt: new Date() } : {}),
          },
        });
      }

      await tx.transaction.delete({ where: { id } });
      return { success: true };
    });

    res.json(result);
  } catch (error: any) {
    if (error?.message === "TRANSACTION_NOT_FOUND") {
      return res.status(404).json({ error: "Transaction not found" });
    }
    if (error?.message === "UNSUPPORTED_TRANSACTION_TYPE") {
      return res.status(400).json({ error: "Only SELL transactions can be deleted here" });
    }
    if (error?.message === "TOTAL_CASH_ID_NOT_SET") {
      return res.status(400).json({ error: "TOTAL_CASH_ID is not configured" });
    }
    if (error?.message === "TOTAL_CAPITAL_NOT_FOUND") {
      return res.status(404).json({ error: "Total capital record not found" });
    }
    console.error("Delete transaction error:", error);
    res.status(500).json({ error: "Failed to delete transaction" });
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

// 6. Bank Management
export const getBanks = async (req: Request, res: Response) => {
  try {
    const banks = await prisma.bank.findMany({
      orderBy: { createdAt: "asc" },
    });
    res.json(banks);
  } catch (error) {
    console.error("Get banks error:", error);
    res.status(500).json({ error: "Failed to fetch banks" });
  }
};

export const getBankDetails = async (req: Request, res: Response) => {
  try {
    const banks = await prisma.bank.findMany({
      orderBy: { createdAt: "asc" },
    });
    const totalBankBalance = banks.reduce((sum, bank) => sum + Number(bank.balance || 0), 0);
    res.json({ totalBankBalance, banks });
  } catch (error) {
    console.error("Get bank details error:", error);
    res.status(500).json({ error: "Failed to fetch bank details" });
  }
};

export const updateBank = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, label, balance } = req.body as { name?: string; label?: string; balance?: number };

    const bank = await prisma.bank.findUnique({ where: { id } });
    if (!bank) {
      return res.status(404).json({ error: "Bank not found" });
    }

    const data: any = {};
    if (name !== undefined) {
      if (String(name).trim() === "") return res.status(400).json({ error: "name cannot be empty" });
      data.name = String(name).trim();
    }
    if (label !== undefined) {
      data.label = String(label).trim();
    }
    if (balance !== undefined) {
      const numericBalance = Number(balance);
      if (Number.isNaN(numericBalance)) return res.status(400).json({ error: "balance must be a number" });
      data.balance = numericBalance;
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: "Nothing to update" });
    }

    const updated = await prisma.bank.update({
      where: { id },
      data,
    });

    res.json({ success: true, bank: updated });
  } catch (error) {
    console.error("Update bank error:", error);
    res.status(500).json({ error: "Failed to update bank" });
  }
};

// Bank to Bank Transfer
export const bankToBank = async (req: Request, res: Response) => {
  try {
    const { fromBankId, toBankId, amount } = req.body as { fromBankId: string; toBankId: string; amount: number };

    if (!fromBankId || !toBankId || !amount) {
      return res.status(400).json({ error: "fromBankId, toBankId, and amount are required" });
    }

    if (fromBankId === toBankId) {
      return res.status(400).json({ error: "Cannot transfer to the same bank" });
    }

    const numericAmount = Number(amount);
    if (Number.isNaN(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({ error: "Amount must be a positive number" });
    }

    await prisma.$transaction(async (tx) => {
      const fromBank = await tx.bank.findUnique({ where: { id: fromBankId } });
      if (!fromBank) throw new Error("FROM_BANK_NOT_FOUND");

      const toBank = await tx.bank.findUnique({ where: { id: toBankId } });
      if (!toBank) throw new Error("TO_BANK_NOT_FOUND");

      if (Number(fromBank.balance || 0) < numericAmount) {
        throw new Error("INSUFFICIENT_FUNDS");
      }

      await tx.bank.update({
        where: { id: fromBankId },
        data: { balance: { decrement: numericAmount } },
      });

      await tx.bank.update({
        where: { id: toBankId },
        data: { balance: { increment: numericAmount } },
      });
    });

    res.json({ success: true, message: "Transfer completed successfully" });
  } catch (error: any) {
    if (error?.message === "FROM_BANK_NOT_FOUND") {
      return res.status(404).json({ error: "Source bank not found" });
    }
    if (error?.message === "TO_BANK_NOT_FOUND") {
      return res.status(404).json({ error: "Destination bank not found" });
    }
    if (error?.message === "INSUFFICIENT_FUNDS") {
      return res.status(400).json({ error: "Insufficient funds in source bank" });
    }
    console.error("Bank to bank transfer error:", error);
    res.status(500).json({ error: "Failed to transfer" });
  }
};

// 6B. Total Capital
export const getTotalCapital = async (req: Request, res: Response) => {
  try {
    const totalCashId = process.env.TOTAL_CASH_ID;
    if (!totalCashId) {
      return res.status(400).json({ error: "TOTAL_CASH_ID is not configured" });
    }

    let capital = await prisma.totalCapital.findUnique({
      where: { id: totalCashId },
    });
    if (!capital) {
      return res.status(404).json({ error: "Total capital record not found" });
    }

    if (capital.cashLastUpdatedAt) {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const lastUpdated = new Date(capital.cashLastUpdatedAt);
      const lastUpdatedDay = new Date(lastUpdated.getFullYear(), lastUpdated.getMonth(), lastUpdated.getDate());

      if (lastUpdatedDay.getTime() < today.getTime()) {
        capital = await prisma.totalCapital.update({
          where: { id: totalCashId },
          data: { todayCash: 0 },
        });
      }
    }

    res.json(capital);
  } catch (error) {
    console.error("Get total capital error:", error);
    res.status(500).json({ error: "Failed to fetch total capital" });
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
router.get("/borrowed-money", getBorrowedInfo);
router.post("/borrowed-money", addBorrowedInfo);
router.put("/borrowed-money/:id", updateBorrowedInfo);
router.delete("/borrowed-money/:id", deleteBorrowedInfo);
router.get("/customers/due", getCustomersWithDue);
router.post("/customers/:id/receive-payment", receiveCustomerPayment);
router.post("/financial/note", createFinancialNote);
router.get("/cash-to-bank", getCashToBank);
router.post("/cash-to-bank", createCashToBank);
router.put("/cash-to-bank/:id", updateCashToBank);
router.delete("/cash-to-bank/:id", deleteCashToBank);
router.get("/transactions", getAdminTransactions);
router.put("/transactions/:id", updateTransaction);
router.delete("/transactions/:id", deleteTransaction);

// Vehicle routes
router.get("/vehicles", getVehicles);
router.get("/vehicles/:id", getVehicleById);
router.post("/vehicles", createVehicle);
router.put("/vehicles/:id", updateVehicle);
router.delete("/vehicles/:id", deleteVehicle);

// Bank routes
router.get("/banks", getBanks);
router.get("/banks/details", getBankDetails);
router.put("/banks/:id", updateBank);
router.post("/banks/transfer", bankToBank);

// Total capital routes
router.get("/total-capital", getTotalCapital);

export default router;
