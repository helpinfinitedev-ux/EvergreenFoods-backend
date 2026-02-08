import { prisma } from "../../app";
import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { Transaction } from "@prisma/client";
import { Num } from "../../utils/num";

type PaymentBreakdown = {
  totalCollection: number;
  cash: number;
  upi: number;
};

type CompanyBuyRow = {
  companyName: string;
  quantityKg: number;
  rate: number; // price per kg
};

type LossBreakdown = {
  weightLossKg: number;
  wasteKg: number;
  mortalityKg: number;
  percentage: number; // e.g. 50 for 50%
};

type CustomerRow = {
  customerName: string;
  quantityKg: number;
  price: number; // per-unit or total, your call—just be consistent
  depositCash: number;
  depositUpi: number;
  bankName: string;
  rate: number;
};

type DriverReportPdfInput = {
  driverName: string;

  totalSellQuantityKg: number;
  totalSellAmount: number;

  losses: LossBreakdown;
  payments: PaymentBreakdown;

  rows: CustomerRow[];
  companies: CompanyBuyRow[]; // 👈 NEW

  // optional label/date at top if you want
  titleRight?: string; // e.g. "Date: 23 Jan 2026"
};

const isNil = (val: any) => val === null || val === undefined;

const getDriversActivity = (transactions: Transaction[]) => {
  const totalSellCashAmount = transactions
    .filter((t) => t.type === "SELL")
    .reduce((acc, t) => {
      acc += Number(t.paymentCash || 0);
      return acc;
    }, 0);
  const totalSellUpiAmount = transactions
    .filter((t) => t.type === "SELL")
    .reduce((acc, t) => {
      acc += Number(t.paymentUpi || 0);
      return acc;
    }, 0);
  const totalSellAmount = transactions
    .filter((t) => t.type === "SELL")
    .reduce((acc, t) => {
      acc += Number(t.totalAmount || 0);
      return acc;
    }, 0);
  const totalSellQuantity = transactions
    .filter((t) => t.type === "SELL")
    .reduce((acc, t) => {
      acc += Number(t.amount || 0);
      return acc;
    }, 0);

  const totalBuyAmount = transactions
    .filter((t) => t.type === "BUY")
    .reduce((acc, t) => {
      acc += Number(t.totalAmount || 0);
      return acc;
    }, 0);

  const totalBuyQuantityKg = transactions
    .filter((t) => t.type === "BUY")
    .reduce((acc, t) => {
      acc += Number(t.amount || 0);
      return acc;
    }, 0);

  const totalWeightLoss = transactions
    .filter((t) => t.type === "WEIGHT_LOSS")
    .reduce((acc, t) => {
      acc += Number(t.amount || 0);
      return acc;
    }, 0);

  return {
    totalSellCashAmount,
    totalSellUpiAmount,
    totalSellAmount,
    totalSellQuantity,
    totalBuyAmount,
    totalBuyQuantityKg,
    totalWeightLoss,
  };
};

export const getDrivers = async (req: Request, res: Response) => {
  const drivers = await prisma.user.findMany({
    where: { role: "DRIVER" },
    orderBy: { name: "asc" },
  });
  res.json(drivers);
};

export const generateTodaysReport = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { start, end } = req.query;

  // frontend

  const driver = await prisma.user.findUnique({ where: { id } });
  if (!driver) {
    return res.status(404).json({ error: "Driver not found" });
  }

  const transactions = await prisma.transaction.findMany({
    where: {
      driverId: id,
      createdAt: {
        gte: new Date(start as string),
        lte: new Date(end as string),
      },
    },
    include: {
      customer: {
        select: { name: true, id: true, balance: true },
      },
      driver: {
        select: { name: true, id: true },
      },
      company: {
        select: { name: true, id: true, amountDue: true },
      },
      bank: {
        select: { name: true, id: true },
      },
    },
  });
  transactions.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  let customerToBalanceMap: Record<string, any> = {};

  const getEntityBalance = (t: any) => {
    let balance = 0;
    const change = Number(t.totalAmount) - Number(t.paymentCash || 0) - Number(t.paymentUpi || 0);
    const entityId = t.customer?.id || t?.company?.id || t?.driver?.id || "";

    balance = (Number(customerToBalanceMap[entityId]) || 0) + t?.company?.idchange;

    customerToBalanceMap[entityId] = balance;
    return balance;
  };

  const customers = transactions
    .filter((t) => t.type === "SELL")
    .map((t) => {
      const change = Number(t.totalAmount) - Number(t.paymentCash || 0) - Number(t.paymentUpi || 0);
      const entityId = t.customer?.id || t?.company?.id || t?.driver?.id;
      let balance = 0;
      balance = Num(t?.customer?.balance) || Num(t?.company?.amountDue) || 0;

      customerToBalanceMap[entityId] = balance;
      console.log("BALANCE", balance);
      return {
        customerName: t?.customer?.name || t?.company?.name || t.details?.split(" ")[4] || t?.driver?.name,
        quantityKg: Number(t.amount || 0),
        rate: Number(t.rate || 0),
        price: Number(t.totalAmount || 0),
        depositCash: Number(t.paymentCash || 0),
        depositUpi: Number(t.paymentUpi || 0),
        bankName: t.bank?.name || "",
        balance: balance,
      };
    });

  console.log("customer", customerToBalanceMap);

  const payments = transactions
    .filter((t) => t.type === "SELL")
    .reduce(
      (acc, t) => {
        acc.totalCollection += Number(t.paymentCash || 0) + Number(t.paymentUpi || 0);
        acc.cash += Number(t.paymentCash || 0);
        acc.upi += Number(t.paymentUpi || 0);
        return acc;
      },
      { totalCollection: 0, cash: 0, upi: 0 }
    );

  const losses = transactions
    .filter((t) => t.type === "WEIGHT_LOSS")
    .reduce(
      (acc, t) => {
        acc.weightLossKg += Number(t.amount || 0);
        acc.mortalityKg += Number(t.subType === "MORTALITY" ? t.amount : 0);
        acc.wasteKg += Number(t.subType === "WASTE" ? t.amount : 0);
        return acc;
      },
      { weightLossKg: 0, wasteKg: 0, mortalityKg: 0, percentage: 0 }
    );

  const totalSellQuantityKg = transactions
    .filter((t) => t.type === "SELL")
    .reduce((acc, t) => {
      acc += Number(t.amount || 0);
      return acc;
    }, 0);

  const totalSellAmount = transactions
    .filter((t) => t.type === "SELL")
    .reduce((acc, t) => {
      acc += Number(t.totalAmount || 0);
      return acc;
    }, 0);

  const totalBuyQuantityKg = transactions
    .filter((t) => t.type === "BUY")
    .reduce((acc, t) => {
      acc += Number(t.amount || 0);
      return acc;
    }, 0);

  const totalBuyAmount = transactions
    .filter((t) => t.type === "BUY")
    .reduce((acc, t) => {
      acc += Number(t.totalAmount || 0);
      return acc;
    }, 0);

  const totalShopBuyQuantityKg = transactions
    .filter((t) => t.type === "SHOP_BUY")
    .reduce(
      (acc, t) => {
        acc.totalShopBuyQuantityKg += Number(t.amount || 0);
        return acc;
      },
      { totalShopBuyQuantityKg: 0 }
    );

  const totalShopBuyAmount = transactions
    .filter((t) => t.type === "SHOP_BUY")
    .reduce(
      (acc, t) => {
        acc.totalShopBuyAmount += Number(t.totalAmount || 0);
        return acc;
      },
      { totalShopBuyAmount: 0 }
    );

  const companies = transactions
    .filter((t) => t.type === "BUY")
    .map((t) => {
      return {
        companyName: t.company?.name || t.customer?.name || t?.details?.split(" ")?.[3] || t?.driver?.name || "",
        quantityKg: Number(t.amount || 0),
        rate: Number(t.rate || 0),
      };
    });

  const weightLossPercentage = losses.weightLossKg > 0 ? (losses.weightLossKg / totalBuyQuantityKg) * 100 : 0;
  losses.percentage = weightLossPercentage;
  const result: DriverReportPdfInput = {
    driverName: driver.name,
    totalSellQuantityKg: totalSellQuantityKg,
    totalSellAmount: totalSellAmount,
    losses: losses,
    payments: payments,
    rows: customers,
    companies,
  };
  return res.json(result);
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

export const updateDriverStatus = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { status } = req.body; // ACTIVE / BLOCKED
  await prisma.user.update({ where: { id }, data: { status } });
  res.json({ success: true });
};

export const updateDriver = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { password, baseSalary } = req.body as {
      password?: string;
      baseSalary?: number;
    };

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

export const getAllDriversActivitySummary = async (req: Request, res: Response) => {
  const { start, end } = req.query;

  const transactions = await prisma.transaction.findMany({
    where: {
      createdAt: {
        gte: new Date(start as string),
        lte: new Date(end as string),
      },
    },
    include: {
      customer: {
        select: { name: true },
      },
      driver: {
        select: { name: true },
      },
      company: {
        select: { name: true },
      },
      bank: {
        select: { name: true },
      },
    },
  });

  const groupTransactions = transactions.reduce(
    (acc, txn) => {
      acc[txn?.driverId] = [...(acc[txn?.driverId] || []), txn];
      return acc;
    },
    {} as Record<string, Transaction[]>
  );

  const driversActivity = Object.entries(groupTransactions).map(([driverId, transactions]: [string, Transaction[]]) => {
    return {
      driverId,
      driverName: (transactions[0] as any)?.driver?.name || "",
      ...getDriversActivity(transactions as Transaction[]),
    };
  });
  console.log(driversActivity);
  return res.json({ driversActivity });
};
