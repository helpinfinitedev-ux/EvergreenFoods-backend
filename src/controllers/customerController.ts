import { Request, Response } from "express";
import { prisma } from "../app";
import { AuthRequest } from "../middleware/authMiddleware";
import { updateTotalCashAndTodayCash } from "../services/cash.service";

export const getCustomers = async (req: Request, res: Response) => {
  try {
    const customers = await prisma.customer.findMany({
      orderBy: { name: "asc" },
    });
    res.json(customers);
  } catch (e) {
    res.status(500).json({ error: "Failed" });
  }
};

export const addCustomer = async (req: Request, res: Response) => {
  try {
    const { name, mobile, address, balance } = req.body;
    const customer = await prisma.customer.create({
      data: {
        name,
        mobile,
        address,
        balance: balance || 0,
      },
    });
    res.json(customer);
  } catch (e) {
    res.status(400).json({ error: "Failed to add customer" });
  }
};

export const updateCustomer = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, mobile, address, balance } = req.body;

    const data: {
      name?: string;
      mobile?: string;
      address?: string | null;
      balance?: number;
    } = {};
    if (name !== undefined) data.name = name;
    if (mobile !== undefined) data.mobile = mobile;
    if (address !== undefined) data.address = address || null;
    if (balance !== undefined) data.balance = Number(balance);

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: "Nothing to update" });
    }

    const updated = await prisma.customer.update({
      where: { id },
      data,
    });
    res.json(updated);
  } catch (e) {
    res.status(400).json({ error: "Failed to update customer" });
  }
};

export const getCustomerHistory = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    // Last 7 days? Or full history?
    // Let's give last 30 days for backend
    const now = new Date();
    const past = new Date(now.setDate(now.getDate() - 30));

    const history = await prisma.transaction.findMany({
      where: {
        customerId: id,
        createdAt: { gte: past },
      },
      orderBy: { createdAt: "desc" },
      include: {
        bank: true,
        driver: true,
      },
    });
    res.json(history);
  } catch (e) {
    res.status(500).json({ error: "Failed" });
  }
};

export const addCustomerAdvance = async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthRequest).user?.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { id } = req.params;
    const { amount, details } = req.body as {
      amount: number;
      details?: string;
    };

    const numericAmount = Number(amount);
    if (Number.isNaN(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({ error: "amount must be a number > 0" });
    }

    const result = await prisma.$transaction(async (tx) => {
      const customer = await tx.customer.findUnique({ where: { id } });
      if (!customer) {
        throw new Error("CUSTOMER_NOT_FOUND");
      }

      await tx.transaction.create({
        data: {
          driverId: userId,
          customerId: id,
          type: "ADVANCE_PAYMENT",
          amount: 0,
          unit: "Kg",
          totalAmount: numericAmount,
          details: details?.trim() || "Advance payment",
        },
      });

      const updatedCustomer = await tx.customer.update({
        where: { id },
        data: { balance: { increment: -numericAmount } },
      });

      const cashAmount = numericAmount;

      await updateTotalCashAndTodayCash(tx, cashAmount, "increment");

      return updatedCustomer;
    });

    res.json({ success: true, customer: result });
  } catch (e: any) {
    if (e?.message === "CUSTOMER_NOT_FOUND") {
      return res.status(404).json({ error: "Customer not found" });
    }
    res.status(500).json({ error: "Failed to add customer advance" });
  }
};
