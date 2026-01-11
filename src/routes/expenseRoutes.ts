import { Request, Response, Router } from "express";
import { prisma } from "../app";
import { authenticate, requireAdmin } from "../middleware/authMiddleware";

// GET all expenses with optional filters
export const getExpenses = async (req: Request, res: Response) => {
  try {
    const { type, startDate, endDate, category } = req.query;

    const where: any = {};

    if (type) {
      where.type = type;
    }

    if (category) {
      where.category = category;
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

    const cashTotal = expenses
      .filter((e) => e.type === "CASH")
      .reduce((sum, e) => sum + Number(e.amount), 0);

    const bankTotal = expenses
      .filter((e) => e.type === "BANK")
      .reduce((sum, e) => sum + Number(e.amount), 0);

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
    const { type, amount, description, category, date } = req.body;

    if (!type || !amount || !description) {
      return res.status(400).json({ error: "Type, amount, and description are required" });
    }

    if (!["CASH", "BANK"].includes(type)) {
      return res.status(400).json({ error: "Type must be CASH or BANK" });
    }

    const expense = await prisma.expense.create({
      data: {
        type,
        amount: parseFloat(amount),
        description,
        category: category || null,
        date: date ? new Date(date) : new Date(),
      },
    });

    res.status(201).json(expense);
  } catch (error) {
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

    if (!existingExpense) {
      return res.status(404).json({ error: "Expense not found" });
    }

    await prisma.expense.delete({
      where: { id },
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

