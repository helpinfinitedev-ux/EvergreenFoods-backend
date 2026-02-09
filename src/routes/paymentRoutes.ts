import { Request, Response, Router } from "express";
import { prisma } from "../app";
import { authenticate, AuthRequest, requireAdmin } from "../middleware/authMiddleware";
import { updateBankBalance } from "../services/bank.service";
import { updateTotalCashAndTodayCash } from "../services/cash.service";
import { getEntityDetails, updateEntityBalance } from "../services/transactions/receivePayments.service";

// GET all payments with optional filters
export const getPayments = async (req: Request, res: Response) => {
  try {
    const { startDate, endDate, bankId, page: pageRaw } = req.query;
    const pageSize = 10;
    const page = Math.max(1, Number(pageRaw || 1) || 1);
    const skip = (page - 1) * pageSize;

    const queryObj: any = {};

    const where: any = {};
    if (bankId) {
      where.bankId = bankId;
    }
    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = new Date(startDate as string);
      if (endDate) where.date.lte = new Date(endDate as string);
    }

    queryObj.where = where;
    queryObj.orderBy = { date: "desc" };
    if (pageRaw) {
      queryObj.take = pageSize;
      queryObj.skip = skip;
    }
    queryObj.include = { company: true, customer: true, driver: true };

    const [total, rows] = await Promise.all([prisma.payments.count({ where }), prisma.payments.findMany(queryObj)]);
    console.log(rows?.length);

    res.json({
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      rows,
    });
  } catch (error) {
    console.error("Get payments error:", error);
    res.status(500).json({ error: "Failed to fetch payments" });
  }
};

// POST create a new payment
export const createPayment = async (req: Request, res: Response) => {
  try {
    const { amount, companyName, description, date, bankId, companyId, customerId, entityType } = req.body as {
      amount: number;
      companyName?: string;
      description?: string;
      date?: string;
      bankId?: string;
      companyId?: string;
      customerId?: string;
      entityType?: string;
    };

    const numericAmount = Number(amount);
    if (Number.isNaN(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({ error: "amount must be a number > 0" });
    }

    const payment = await prisma.$transaction(
      async (tx) => {
        // 1. Handle Bank Logic
        if (bankId) {
          await updateBankBalance(tx, bankId, numericAmount, "decrement");
        } else {
          await updateTotalCashAndTodayCash(tx, numericAmount, "decrement");
        }
        if (!entityType || !["customer", "company"].includes(entityType as "customer" | "company")) {
          throw new Error("INVALID_ENTITY_TYPE");
        }
        const entity = await getEntityDetails(tx, customerId || companyId || "", entityType as "customer" | "company");
        if (!entity) throw new Error("ENTITY_NOT_FOUND");

        // 3. Handle Company Balance Logic
        await updateEntityBalance(tx, entity, numericAmount, entityType as "customer" | "company", entityType === "customer" ? "increment" : "decrement");

        const transaction = await tx.transaction.create({
          data: {
            amount: 0,
            totalAmount: numericAmount,
            bankId: bankId || null,
            companyId: companyId || null,
            customerId: customerId || null,
            driverId: (req as AuthRequest).user?.userId || "",
            type: "PAYMENT",
            subType: entityType?.toUpperCase(),
            details: description || `Payment to ${entityType?.toUpperCase()} ${entity?.name}`,
            date: new Date(),
            unit: "INR",
          },
        });

        return tx.payments.create({
          data: {
            amount: numericAmount,
            companyName: companyName || null,
            description: description || null,
            date: date ? new Date(date) : new Date(),
            bankId: bankId || null,
            companyId: companyId || null,
            customerId: customerId || null,
            transactionId: transaction.id,
          },
        });
      },
      {
        timeout: 60_000, // 60 seconds
        maxWait: 10_000, // wait for a connection
      }
    );

    res.status(201).json(payment);
  } catch (error) {
    if ((error as Error).message === "BANK_NOT_FOUND") {
      return res.status(404).json({ error: "Bank not found" });
    }
    if ((error as Error).message === "COMPANY_NOT_FOUND") {
      return res.status(404).json({ error: "Company not found" });
    }
    if ((error as Error).message === "BANK_INSUFFICIENT_FUNDS") {
      return res.status(400).json({ error: "Not enough momey in bank" });
    }
    if ((error as Error).message === "TOTAL_CASH_ID_NOT_SET") {
      return res.status(400).json({ error: "TOTAL_CASH_ID is not configured" });
    }
    if ((error as Error).message === "TOTAL_CAPITAL_NOT_FOUND") {
      return res.status(404).json({ error: "Total capital record not found" });
    }
    console.error("Create payment error:", error);
    res.status(500).json({ error: "Failed to create payment" });
  }
};

// PATCH update a payment
export const updatePayment = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { amount, companyName, description, date, bankId } = req.body as {
      amount?: number;
      companyName?: string;
      description?: string;
      date?: string;
      bankId?: string | null;
    };

    const company = await prisma.company.findUnique({
      where: { name: companyName },
    });

    if (!company) {
      return res.status(404).json({ error: "Company not found" });
    }

    const companyId = company.id;

    const existing = await prisma.payments.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: "Payment not found" });
    }

    const data: any = {};
    let numericAmount = 0;
    if (amount !== undefined) {
      numericAmount = Number(amount);
      if (Number.isNaN(numericAmount) || numericAmount <= 0) {
        return res.status(400).json({ error: "amount must be a number > 0" });
      }
      data.amount = numericAmount;
    }
    if (companyName !== undefined) data.companyName = companyName || null;
    if (description !== undefined) data.description = description || null;
    if (date !== undefined) data.date = new Date(date);
    if (bankId !== undefined) data.bankId = bankId || null;

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: "Nothing to update" });
    }

    const updated = await prisma.payments.update({
      where: { id },
      data,
    });

    await prisma.company.update({
      where: { id: companyId },
      data: { amountDue: { decrement: numericAmount } },
    });

    res.json(updated);
  } catch (error) {
    console.error("Update payment error:", error);
    res.status(500).json({ error: "Failed to update payment" });
  }
};

// DELETE a payment
export const deletePayment = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    await prisma.$transaction(async (tx) => {
      const existing = await tx.payments.findUnique({ where: { id } });
      if (!existing) {
        throw new Error("PAYMENT_NOT_FOUND");
      }

      // Revert company balance if linked
      if (existing.companyId) {
        await tx.company.update({
          where: { id: existing.companyId },
          data: { amountDue: { increment: existing.amount } },
        });
      }

      if (existing.customerId) {
        await tx.customer.update({
          where: { id: existing.customerId },
          data: { balance: { decrement: existing.amount } },
        });
      }

      // Revert Bank Balance if linked
      if (existing.bankId) {
        await tx.bank.update({
          where: { id: existing.bankId },
          data: { balance: { increment: existing.amount } },
        });
      }

      // Revert Total Capital Logic (add back the cash if it was cash payment)
      if (!existing.bankId) {
        const totalCashId = process.env.TOTAL_CASH_ID;
        if (totalCashId) {
          // We can't perfectly revert "todayCash" logic without complex date checks,
          // but we MUST revert totalCash.
          // Simplification: just add back to totalCash.
          await tx.totalCapital.update({
            where: { id: totalCashId },
            data: { totalCash: { increment: existing.amount } },
          });
        }
      }

      await tx.payments.delete({ where: { id } });
      if (existing?.transactionId) {
        await tx.transaction.delete({ where: { id: existing.transactionId } });
      }
    });

    res.json({ success: true });
  } catch (error) {
    if ((error as Error).message === "PAYMENT_NOT_FOUND") {
      return res.status(404).json({ error: "Payment not found" });
    }
    console.error("Delete payment error:", error);
    res.status(500).json({ error: "Failed to delete payment" });
  }
};

// --- Routes ---
const router = Router();
router.use(authenticate);
router.use(requireAdmin);

router.get("/", getPayments);
router.post("/", createPayment);
router.patch("/:id", updatePayment);
router.delete("/:id", deletePayment);

export default router;
