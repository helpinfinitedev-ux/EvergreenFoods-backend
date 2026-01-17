import { Request, Response, Router } from "express";
import { prisma } from "../app";
import { authenticate, requireAdmin } from "../middleware/authMiddleware";

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
    queryObj.include = { company: true };

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
    const { amount, companyName, description, date, bankId, companyId } = req.body as {
      amount: number;
      companyName?: string;
      description?: string;
      date?: string;
      bankId?: string;
      companyId?: string;
    };

    const numericAmount = Number(amount);
    if (Number.isNaN(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({ error: "amount must be a number > 0" });
    }

    const payment = await prisma.$transaction(async (tx) => {
      // 1. Handle Bank Logic
      if (bankId) {
        const bank = await tx.bank.findUnique({ where: { id: bankId } });
        if (!bank) {
          throw new Error("BANK_NOT_FOUND");
        }
        if (Number(bank.balance || 0) - numericAmount < 0) {
          throw new Error("BANK_INSUFFICIENT_FUNDS");
        }
        await tx.bank.update({
          where: { id: bankId },
          data: { balance: { decrement: numericAmount } },
        });
      }

      // 2. Handle Capital Logic
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
      let todayCashUpdate: number | undefined;

      if (capital.cashLastUpdatedAt) {
        const lastUpdated = new Date(capital.cashLastUpdatedAt);
        const lastUpdatedDay = new Date(lastUpdated.getFullYear(), lastUpdated.getMonth(), lastUpdated.getDate());
        if (lastUpdatedDay.getTime() === today.getTime()) {
          const nextTodayCash = Number(capital.todayCash) - numericAmount;
          todayCashUpdate = Math.max(0, nextTodayCash);
        } else if (lastUpdatedDay.getTime() < today.getTime()) {
          todayCashUpdate = 0;
        }
      }

      const capitalData: any = {
        totalCash: { decrement: numericAmount },
      };
      if (todayCashUpdate !== undefined) {
        capitalData.todayCash = todayCashUpdate;
      }

      await tx.totalCapital.update({
        where: { id: totalCashId },
        data: capitalData,
      });

      // 3. Handle Company Balance Logic
      if (companyId) {
        const company = await tx.company.findUnique({ where: { id: companyId } });
        if (!company) throw new Error("COMPANY_NOT_FOUND");

        // Payment REDUCES the amount due
        await tx.company.update({
          where: { id: companyId },
          data: { amountDue: { decrement: numericAmount } },
        });
      }

      return tx.payments.create({
        data: {
          amount: numericAmount,
          companyName: companyName || null,
          description: description || null,
          date: date ? new Date(date) : new Date(),
          bankId: bankId || null,
          companyId: companyId || null,
        },
      });
    });

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

    const existing = await prisma.payments.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: "Payment not found" });
    }

    const data: any = {};
    if (amount !== undefined) {
      const numericAmount = Number(amount);
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
