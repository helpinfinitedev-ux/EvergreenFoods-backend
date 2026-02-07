import { Request, Response, Router } from "express";
import { prisma } from "../../app";
import { Transaction } from "@prisma/client";

const getCashIn = async (transactions: Transaction[], isBank: boolean) => {
  let sellTransactions = transactions.filter((t) => t.type === "SELL");

  let advancePaymentTransactions = transactions.filter((t) => t.type === "RECEIVE_PAYMENT").filter((t) => t.companyId || t.customerId);

  if (!isBank) {
    advancePaymentTransactions = advancePaymentTransactions.filter((t) => t.bankId === null);
  }

  const sellTxnByDriver = sellTransactions.reduce(
    (acc, t: any) => {
      acc[t.driverId] = {
        narration: t.driver?.name + " " + "Supply",
        amount: (acc?.[t.driverId]?.amount || 0) + (isBank ? Number(t.paymentUpi || 0) : Number(t.paymentCash || 0)),
        createdAt: t.createdAt,
      };

      return acc;
    },
    {} as Record<string, any>
  );

  const receivePaymentByCompanyAndCustomer = advancePaymentTransactions.reduce(
    (acc, t: any) => {
      acc[t.companyId || t.customerId] = {
        narration: "Payment received from " + (t.company?.name || "") + " " + (t.customer?.name || "") + " ",
        amount: (acc?.[t.companyId || t.customerId]?.amount || 0) + Number(t.totalAmount || 0),
        createdAt: t.createdAt,
      };
      return acc;
    },
    {} as Record<string, any>
  );

  const res = [...Object.values(sellTxnByDriver), ...Object.values(receivePaymentByCompanyAndCustomer)].sort((a, b) => b.createdAt - a.createdAt);
  return res.map((r) => ({
    narration: r.narration,
    amount: r.amount,
    createdAt: r.createdAt,
  }));
};

const getCashOut = async (transactions: Transaction[], isBank: boolean) => {
  const paymentTransactions = transactions.filter((t) => t.type === "PAYMENT");
  const expenseTransactions = transactions.filter((t) => t.type === "EXPENSE");
  const sellTxnByDriver = paymentTransactions.reduce(
    (acc, t: any) => {
      acc[t.companyId || t.customerId] = {
        narration: "Payment done to " + (t.company?.name || "") + " " + (t.customer?.name || "") + " ",
        amount: (acc?.[t.companyId || t.customerId]?.amount || 0) + Number(t.totalAmount || 0),
        createdAt: t.createdAt,
      };
      return acc;
    },
    {} as Record<string, any>
  );

  console.log(expenseTransactions);

  const expenseTxnByDriver = expenseTransactions.reduce(
    (acc, t: any) => {
      acc[t.driverId] = {
        narration: t.driver?.name + " " + t?.expense?.type + " Expense",
        amount: (acc?.[t.driverId]?.amount || 0) + Number(t.totalAmount || 0),
        createdAt: t.createdAt,
      };
      return acc;
    },
    {} as Record<string, any>
  );
  const res = [...Object.values(sellTxnByDriver), ...Object.values(expenseTxnByDriver)].sort((a, b) => b.createdAt - a.createdAt);
  return res.map((r) => ({
    narration: r.narration,
    amount: r.amount,
    createdAt: r.createdAt,
  }));
};

export const cashFlow = async (req: Request, res: Response) => {
  const { date, bankId = "cash" } = req.query;
  const startDate = new Date(date as string);
  const endDate = new Date(date as string);
  endDate.setHours(23, 59, 59, 999);
  startDate.setHours(0, 0, 0, 0);

  const where: any = {};
  if (bankId && bankId !== "cash") {
    where.bankId = bankId;
  }

  const transactions = await prisma.transaction.findMany({
    where: {
      createdAt: {
        gte: startDate,
        lte: endDate,
      },
      ...where,
    },
    include: {
      driver: true,
      customer: true,
      company: true,
      vehicle: true,
      bank: true,
      payments: true,
      expense: true,
    },
  });

  const cashIn = await getCashIn(transactions, bankId !== "cash");
  const cashOut = await getCashOut(transactions, bankId !== "cash");
  console.log(bankId);

  //   console.log({
  //     cashIn,
  //     transactions,
  //   });

  return res.json({ cashIn, cashOut, transactions });
};
