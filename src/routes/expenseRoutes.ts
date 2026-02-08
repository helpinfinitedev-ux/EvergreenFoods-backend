import { Request, Response, Router } from "express";
import { prisma } from "../app";
import { authenticate, requireAdmin } from "../middleware/authMiddleware";
import { updateTotalCashAndTodayCash } from "../services/cash.service";
import { updateBankBalance } from "../services/bank.service";

// GET all expenses with optional filters
export const getExpenses = async (req: Request, res: Response) => {
  try {
    const { type, startDate, endDate, category, driverId } = req.query;

    const where: any = {};

    if (type) {
      where.type = type;
    }

    if (category) {
      where.category = category;
    }
    if (driverId) {
      where.driverId = driverId as string;
    }

    if (startDate || endDate) {
      where.date = {};
      if (startDate) {
        where.date.gte = new Date(startDate as string);
      }
      if (endDate) {
        where.date.lte = new Date(endDate as string);
      }
    }

    const expenses = await prisma.expense.findMany({
      where,
      orderBy: { date: "desc" },
      include: {
        driver: {
          select: {
            name: true,
            id: true,
          },
        },
      },
    });

    res.json(expenses);
  } catch (error) {
    console.error("Get expenses error:", error);
    res.status(500).json({ error: "Failed to fetch expenses" });
  }
};

// GET expense summary (totals by type)
export const getExpenseSummary = async (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = req.query;

    const where: any = {};
    if (startDate || endDate) {
      where.date = {};
      if (startDate) {
        where.date.gte = new Date(startDate as string);
      }
      if (endDate) {
        where.date.lte = new Date(endDate as string);
      }
    }

    const expenses = await prisma.expense.findMany({ where });

    const cashTotal = expenses.filter((e) => e.type === "CASH").reduce((sum, e) => sum + Number(e.amount), 0);

    const bankTotal = expenses.filter((e) => e.type === "BANK").reduce((sum, e) => sum + Number(e.amount), 0);

    res.json({
      cashTotal,
      bankTotal,
      total: cashTotal + bankTotal,
      count: expenses.length,
    });
  } catch (error) {
    console.error("Get expense summary error:", error);
    res.status(500).json({ error: "Failed to fetch expense summary" });
  }
};

// POST create a new expense
export const createExpense = async (req: Request, res: Response) => {
  try {
    const { type, amount, description, category, date, bankId, driverId } = req.body as {
      type: "CASH" | "BANK";
      amount: number;
      description: string;
      category?: string;
      date?: string;
      bankId?: string;
      driverId?: string;
    };

    if (!type || !amount || !description) {
      return res.status(400).json({ error: "Type, amount, and description are required" });
    }

    if (!["CASH", "BANK"].includes(type)) {
      return res.status(400).json({ error: "Type must be CASH or BANK" });
    }

    const numericAmount = Number(amount);
    if (Number.isNaN(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({ error: "amount must be a number > 0" });
    }

    if (type === "BANK" && !bankId) {
      return res.status(400).json({ error: "bankId is required for BANK expenses" });
    }

    const created = await prisma.$transaction(async (tx) => {
      if (type === "BANK") {
        await updateBankBalance(tx, bankId || "", numericAmount, "decrement");
      }

      if (type === "CASH") {
        await updateTotalCashAndTodayCash(tx, numericAmount, "decrement");
      }
      const expense = await tx.expense.create({
        data: {
          type,
          amount: numericAmount,
          description,
          category: category || null,
          date: date ? new Date(date) : new Date(),
          bankId: type === "BANK" ? bankId : null,
          driverId: driverId || null,
        },
      });
      await tx.transaction.create({
        data: {
          amount: 0,
          totalAmount: numericAmount,
          driverId: driverId || (req as any).user?.userId || "",
          type: "EXPENSE",
          subType: category?.toLocaleUpperCase(),
          details: description || null,
          date: date ? new Date(date) : new Date(),
          unit: "",
          bankId: type === "BANK" ? bankId : null,
          expenseId: expense.id,
        },
      });

      return expense;
    });

    res.status(201).json(created);
  } catch (error: any) {
    if (error?.message === "BANK_NOT_FOUND") {
      return res.status(404).json({ error: "Bank not found" });
    }
    if (error?.message === "BANK_INSUFFICIENT_FUNDS") {
      return res.status(400).json({ error: "Not enough momey in bank" });
    }
    if (error?.message === "TOTAL_CASH_ID_NOT_SET") {
      return res.status(400).json({ error: "TOTAL_CASH_ID is not configured" });
    }
    if (error?.message === "TOTAL_CAPITAL_NOT_FOUND") {
      return res.status(404).json({ error: "Total capital record not found" });
    }
    console.error("Create expense error:", error);
    res.status(500).json({ error: "Failed to create expense" });
  }
};

// PUT update an expense
export const updateExpense = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { type, amount, description, category, date } = req.body;

    const existingExpense = await prisma.expense.findUnique({
      where: { id },
    });

    if (!existingExpense) {
      return res.status(404).json({ error: "Expense not found" });
    }

    const updateData: any = {};
    if (type) updateData.type = type;
    if (amount) updateData.amount = parseFloat(amount);
    if (description) updateData.description = description;
    if (category !== undefined) updateData.category = category;
    if (date) updateData.date = new Date(date);

    const expense = await prisma.expense.update({
      where: { id },
      data: updateData,
    });

    res.json(expense);
  } catch (error) {
    console.error("Update expense error:", error);
    res.status(500).json({ error: "Failed to update expense" });
  }
};

// DELETE an expense
export const deleteExpense = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const existingExpense = await prisma.expense.findUnique({
      where: { id },
    });
    const existingTransaction = await prisma.transaction.findFirst({
      where: { expenseId: id },
    });

    if (!existingExpense) {
      return res.status(404).json({ error: "Expense not found" });
    }

    const expenseAmount = Number(existingExpense.amount);

    await prisma.$transaction(async (tx) => {
      // Restore amount to bank or total cash
      if (existingExpense.type === "BANK" && existingExpense.bankId) {
        await tx.bank.update({
          where: { id: existingExpense.bankId },
          data: { balance: { increment: expenseAmount } },
        });
      } else if (existingExpense.type === "CASH") {
        const totalCashId = process.env.TOTAL_CASH_ID;
        if (totalCashId) {
          await tx.totalCapital.update({
            where: { id: totalCashId },
            data: { totalCash: { increment: expenseAmount } },
          });
        }
      }

      // Delete the expense
      await tx.expense.delete({
        where: { id },
      });
      if (existingTransaction) {
        await tx.transaction.delete({
          where: { id: existingTransaction.id },
        });
      }
    });

    res.json({ success: true, message: "Expense deleted successfully" });
  } catch (error) {
    console.error("Delete expense error:", error);
    res.status(500).json({ error: "Failed to delete expense" });
  }
};

// --- Routes ---
const router = Router();
router.use(authenticate);
router.use(requireAdmin);

router.get("/", getExpenses);
router.get("/summary", getExpenseSummary);
router.post("/", createExpense);
router.put("/:id", updateExpense);
router.delete("/:id", deleteExpense);

export default router;
