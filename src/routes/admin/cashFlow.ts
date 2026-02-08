import { Request, Response, Router } from "express";
import { prisma } from "../../app";
import { Transaction } from "@prisma/client";

const getCashIn = async (transactions: Transaction[], isBank: boolean) => {
  let sellTransactions = transactions.filter((t) => t.type === "SELL");

  let advancePaymentTransactions = transactions.filter((t) => t.type === "RECEIVE_PAYMENT").filter((t) => t.companyId || t.customerId || t.driverId);
  let cashToBankTransactions = transactions.filter((t) => t.type === "CASH_TO_BANK");

  if (!isBank) {
    sellTransactions = [];
    advancePaymentTransactions = advancePaymentTransactions.filter((t) => t.bankId === null);
    cashToBankTransactions = cashToBankTransactions.filter((t) => t.bankId === null);
  } else {
    sellTransactions = sellTransactions.filter((t) => t.bankId !== null);
  }

  const sellTxnByDriver = sellTransactions.reduce(
    (acc, t: any) => {
      acc[t.id] = {
        narration: t.driver?.name + " " + "Received" + `from ${t.company?.name || t.customer?.name || t.driver?.name}`,
        amount: (acc?.[t.id]?.amount || 0) + (isBank ? Number(t.paymentUpi || 0) : Number(t.paymentCash || 0)),
        createdAt: t.createdAt,
      };

      return acc;
    },
    {} as Record<string, any>
  );

  const receivePaymentByCompanyAndCustomer = advancePaymentTransactions.reduce(
    (acc, t: any) => {
      acc[t.id] = {
        narration: "Payment received from " + (t.company?.name || "") + " " + (t.customer?.name || "") + " " + (t.driver?.name || "") + " ",
        amount: (acc?.[t.id]?.amount || 0) + Number(t.totalAmount || 0),
        createdAt: t.createdAt,
      };
      return acc;
    },
    {} as Record<string, any>
  );

  const cashToBankTxnByDriver = cashToBankTransactions.reduce(
    (acc, t: any) => {
      acc[t.id] = {
        narration: `Deposited to ${t.bank?.name}`,
        amount: (acc?.[t.id]?.amount || 0) + Number(t.totalAmount || 0),
        createdAt: t.createdAt,
      };
      return acc;
    },
    {} as Record<string, any>
  );

  const res = [...Object.values(sellTxnByDriver), ...Object.values(receivePaymentByCompanyAndCustomer), ...Object.values(cashToBankTxnByDriver)].sort((a, b) => b.createdAt - a.createdAt);
  return res.map((r) => ({
    narration: r.narration,
    amount: r.amount,
    createdAt: r.createdAt,
  }));
};

const getCashOut = async (transactions: Transaction[], isBank: boolean) => {
  const paymentTransactions = transactions.filter((t) => t.type === "PAYMENT");
  const expenseTransactions = transactions.filter((t) => t.type === "EXPENSE");
  let depositTransactions: any = [];

  if (!isBank) {
    depositTransactions = transactions.filter((t) => t.type === "CASH_TO_BANK");
  }

  const sellTxnByDriver = paymentTransactions.reduce(
    (acc, t: any) => {
      acc[t.id] = {
        narration: "Payment done to " + (t.company?.name || "") + " " + (t.customer?.name || "") + " ",
        amount: (acc?.[t.id]?.amount || 0) + Number(t.totalAmount || 0),
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

  const depositTxnByDriver = depositTransactions.reduce(
    (acc: any, t: any) => {
      acc[t.id] = {
        narration: `Deposited to ${t.bank?.name}`,
        amount: (acc?.[t.id]?.amount || 0) + Number(t.totalAmount || 0),
        createdAt: t.createdAt,
      };
      return acc;
    },
    {} as Record<string, any>
  );

  const res = [...Object.values(sellTxnByDriver), ...Object.values(expenseTxnByDriver), ...Object.values(depositTxnByDriver)].sort((a, b) => b.createdAt - a.createdAt);
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
