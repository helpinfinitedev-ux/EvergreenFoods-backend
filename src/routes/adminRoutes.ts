import { Request, Response, Router } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../app";
import { authenticate } from "../middleware/authMiddleware";
import { updateTotalCashAndTodayCash } from "../services/cash.service";
import { getAdminDashboard } from "./admin/dashboard";
import { createDriver, deleteDriver, generateTodaysReport, getAllDriversActivitySummary, getDrivers, updateDriver, updateDriverStatus } from "./admin/driver";
import { getEntityDetails, updateEntityBalance } from "../services/transactions/receivePayments.service";
import { updateBankBalance } from "../services/bank.service";
import { Transaction } from "@prisma/client";
import { getPaymentsReceived } from "./admin/payments";
import { cashFlow } from "./admin/cashFlow";

// --- Controllers ---

// 2. Driver Management

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

// 2B. Customer Payments Received
export const getCustomersWithDue = async (req: Request, res: Response) => {
  try {
    const startDate = req.query.startDate as string | undefined;
    const endDate = req.query.endDate as string | undefined;

    const where: Record<string, any> = {};
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
    const { driverId, customerId, companyId, amount, method, bankId } = req.body as {
      driverId?: string;
      customerId?: string;
      companyId?: string;
      amount: number;
      method: "CASH" | "BANK";
      bankId?: string;
    };

    let updatedTransaction: Transaction;

    console.log(req.body);

    const type = driverId ? "driver" : customerId ? "customer" : companyId ? "company" : undefined;
    if (!type) {
      return res.status(400).json({ error: "Invalid entity type" });
    }

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
      const entity = await getEntityDetails(tx, driverId || customerId || companyId || "", type);
      if (!entity) {
        throw new Error("ENTITY_NOT_FOUND");
      }

      if (method === "BANK") {
        await updateBankBalance(tx, bankId || "", numericAmount, "increment");
      }

      if (method === "CASH") {
        await updateTotalCashAndTodayCash(tx, numericAmount, "increment");
      }

      await updateEntityBalance(tx, entity, numericAmount, type, type === "customer" ? "decrement" : "increment");

      updatedTransaction = await tx.transaction.create({
        data: {
          type: "RECEIVE_PAYMENT",
          subType: type.toUpperCase(),
          amount: 0,
          totalAmount: numericAmount,
          details: `In ${method}`,
          customerId,
          companyId,
          bankId: method === "BANK" ? bankId : null,
          driverId: driverId || (req as any).user?.userId,
          unit: "Kg",
        },
      });
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
    const { bankName, amount, date, bankId } = req.body as {
      bankName: string;
      amount: number;
      date?: string;
      bankId: string;
    };

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

      await updateTotalCashAndTodayCash(tx, numericAmount, "decrement");
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

      const transaction = await tx.transaction.create({
        data: {
          amount: 0,
          totalAmount: numericAmount,
          driverId: (req as any).user.userId,
          type: "CASH_TO_BANK",
          subType: "DEPOSIT",
          details: `Deposited to ${bankName}`,
          date: parsedDate,
          unit: "INR",
          bankId,
          cashToBankId: cashToBank.id,
        },
      });

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
    const { bankName, amount, bankId } = req.body as {
      bankName?: string;
      amount?: number;
      bankId?: string;
    };

    const existing = await prisma.cashToBank.findUnique({ where: { id }, include: { transactions: true } });
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
      await updateTotalCashAndTodayCash(tx, Math.abs(amountDifference), amountDifference > 0 ? "decrement" : "increment");
      // Handle totalCash and todayCash adjustments if amount changed

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

      await tx.transaction.update({
        where: { id: existing.transactions[0]?.id },
        data: {
          cashToBankId: cashToBank.id,
          totalAmount: newAmount,
          details: `Updated cash-to-bank to ${bankName}`,
          bankId: newBankId,
          amount: 0,
        },
      });

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
  const { type, startDate, bankId, endDate, customerId, companyId, totalAmount, driverId, details, page, companyName } = req.query;

  const where: any = {};
  if (type) where.type = type;
  if (driverId) where.driverId = driverId;
  if (customerId) where.customerId = customerId;
  if (companyId) where.companyId = companyId;
  if (bankId) where.bankId = bankId;
  if (totalAmount) {
    where.totalAmount = {
      gte: Number(totalAmount),
    };
    where.paymentCash = {
      gte: Number(totalAmount),
    };
    where.paymentUpi = {
      gte: Number(totalAmount),
    };
  }
  if (startDate && endDate) {
    where.createdAt = {
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
        include: { driver: true, customer: true, vehicle: true, company: true, bank: true },
        orderBy: { createdAt: "desc" },
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
    orderBy: { createdAt: "desc" },
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
      include: {
        drivers: true,
        transactions: { take: 10, orderBy: { createdAt: "desc" } },
      },
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
    const { amount, rate, totalAmount, details, companyId, customerId, driverId, type, entityType } = req.body;

    const transaction = await prisma.transaction.findUnique({ where: { id } });

    if (!transaction) {
      return res.status(404).json({ error: "Transaction not found" });
    }

    const updatedTransaction = await prisma.$transaction(
      async (tx) => {
        const updated = await tx.transaction.update({
          where: { id },
          data: {
            companyId,
            customerId,
            amount: amount !== undefined ? Number(amount) : transaction.amount,
            rate: rate !== undefined ? Number(rate) : transaction.rate,
            totalAmount: totalAmount !== undefined ? Number(totalAmount) : transaction.totalAmount,
            details: details !== undefined ? (String(details).trim() === "" ? null : String(details)) : transaction.details,
          },
          include: { driver: true, customer: true, vehicle: true },
        });

        const entity = await getEntityDetails(tx, companyId || customerId || driverId || "", entityType);
        if (!entity) {
          throw new Error("ENTITY_NOT_FOUND");
        }

        console.log(entity);

        const amountDifference = Number(totalAmount) - Number(transaction.totalAmount);
        await updateEntityBalance(tx, entity, amountDifference, entityType, entityType === "customer" ? "decrement" : "increment");

        return updated;
      },
      {
        timeout: 60000,
      }
    );

    res.json({ success: true, transaction: updatedTransaction });
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
      if (transaction?.companyId) {
        const bill = Number(transaction.totalAmount || 0);
        const paid = Number(transaction.paymentCash || 0) + Number(transaction.paymentUpi || 0);
        const change = bill - paid;
        if (change !== 0) {
          await tx.company.update({
            where: { id: transaction.companyId },
            data: { amountDue: { increment: change } },
          });
        }
        if (transaction?.bankId) {
          await updateBankBalance(tx, transaction.bankId, paid, "increment");
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
    const transactionCount = await prisma.transaction.count({
      where: { vehicleId: id },
    });
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
    const { name, label, balance } = req.body as {
      name?: string;
      label?: string;
      balance?: number;
    };

    const bank = await prisma.bank.findUnique({ where: { id } });
    if (!bank) {
      return res.status(404).json({ error: "Bank not found" });
    }

    const data: any = {};
    let numericBalance = Number(balance);
    if (name !== undefined) {
      if (String(name).trim() === "") return res.status(400).json({ error: "name cannot be empty" });
      data.name = String(name).trim();
    }
    if (label !== undefined) {
      data.label = String(label).trim();
    }
    if (balance !== undefined) {
      numericBalance = Number(balance);
      if (Number.isNaN(numericBalance)) return res.status(400).json({ error: "balance must be a number" });
      data.balance = {
        increment: numericBalance,
      };
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: "Nothing to update" });
    }

    const updated = await prisma.bank.update({
      where: { id },
      data,
    });

    await prisma.transaction.create({
      data: {
        amount: 0,
        totalAmount: numericBalance,
        driverId: (req as any).user.userId,
        type: "UPDATE_BANK",
        subType: "UPDATE",
        bankId: id,
        details: `Updated bank balance to ${numericBalance}`,
      },
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
    const { fromBankId, toBankId, amount } = req.body as {
      fromBankId: string;
      toBankId: string;
      amount: number;
    };

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

      await tx.transaction.create({
        data: {
          amount: 0,
          totalAmount: numericAmount,
          driverId: (req as any).user.userId,
          type: "BANK_TO_BANK",
          subType: "TRANSFER",
          bankId: fromBankId,
          details: `Transferred to ${toBank.name}`,
        },
      });

      await tx.transaction.create({
        data: {
          amount: 0,
          totalAmount: numericAmount,
          driverId: (req as any).user.userId,
          type: "BANK_TO_BANK",
          subType: "RECEIVE",
          bankId: toBankId,
          details: `Received from ${fromBank.name}`,
        },
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

export const updateTotalCapital = async (req: Request, res: Response) => {
  try {
    const { amount } = req.body;
    let numericAmount = Number(amount || 0);
    await prisma.$transaction(async (tx) => {
      let operation: "increment" | "decrement" = "increment";
      if (amount < 0) {
        operation = "decrement";
      }

      await updateTotalCashAndTodayCash(tx, Math.abs(amount), operation);
      await tx.transaction.create({
        data: {
          amount: 0,
          totalAmount: numericAmount,
          driverId: (req as any).user.userId,
          type: "UPDATE_CASH",
          subType: operation === "increment" ? "ADD" : "SUBTRACT",
          details: ` ${operation === "increment" ? "added" : "subtracted"} ${Math.abs(amount)} to cash`,
          unit: "INR",
          bankId: null,
          customerId: null,
          companyId: null,
          vehicleId: null,
          expenseId: null,
          cashToBankId: null,
        },
      });
    });
    res.json({ success: true, message: "Total capital updated successfully" });
  } catch (error) {
    console.error("Update total capital error:", error);
    res.status(500).json({ error: "Failed to update total capital" });
  }
};

// --- Routes ---
const router = Router();
router.use(authenticate); // Admin Middleware Check Needed ideally

//dashboard
router.get("/dashboard", getAdminDashboard);

//drivers
router.get("/drivers", getDrivers);
router.post("/drivers", createDriver);
router.put("/drivers/:id", updateDriver);
router.delete("/drivers/:id", deleteDriver);
router.put("/drivers/:id/status", updateDriverStatus);
router.get("/drivers/:id/report", generateTodaysReport);
router.get("/drivers/activity-summary", getAllDriversActivitySummary);

router.get("/customers/due", getCustomersWithDue);
router.post("/receive-payment", receiveCustomerPayment);
router.get("/payments-received/:id", getPaymentsReceived);
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
router.patch("/update-total-capital", updateTotalCapital);

//borrowed info
router.get("/borrowed-money", getBorrowedInfo);
router.post("/borrowed-money", addBorrowedInfo);
router.put("/borrowed-money/:id", updateBorrowedInfo);
router.delete("/borrowed-money/:id", deleteBorrowedInfo);

//cash flow
router.get("/cash-flow", cashFlow);

export default router;
