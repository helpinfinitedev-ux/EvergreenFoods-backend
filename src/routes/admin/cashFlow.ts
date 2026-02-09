import { Request, Response, Router } from "express";
import { prisma } from "../../app";
import { Transaction } from "@prisma/client";

const getFirst = (...values: any[]) => {
  for (let value of values) {
    if (value) {
      return value;
    }
  }
  return null;
};

const getCashIn = async (transactions: Transaction[], isBank: boolean) => {
  let sellTransactions = transactions.filter((t) => t.type === "SELL");

  let advancePaymentTransactions = transactions.filter((t) => t.type === "RECEIVE_PAYMENT").filter((t) => t.companyId || t.customerId || t.driverId);
  let cashToBankTransactions = transactions.filter((t) => t.type === "CASH_TO_BANK");
  let updateBankTransactions = transactions.filter((t) => t.type === "UPDATE_BANK");
  if (!isBank) {
    sellTransactions = [];
    advancePaymentTransactions = advancePaymentTransactions.filter((t) => t.bankId === null);
    cashToBankTransactions = cashToBankTransactions.filter((t) => t.bankId === null);
    updateBankTransactions = updateBankTransactions.filter((t) => t.bankId === null);
  } else {
    sellTransactions = sellTransactions.filter((t) => t.bankId !== null);
  }

  const sellTxnByDriver = sellTransactions.reduce(
    (acc, t: any) => {
      acc[t.id] = {
        narration: t.driver?.name + " " + "Received" + ` from ${getFirst(t.company?.name, t.customer?.name, t.driver?.name)}`,
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
        narration: "Payment received from " + getFirst(t.company?.name, t.customer?.name, t.driver?.name) + " ",
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

  const updateBankTxn = updateBankTransactions.reduce(
    (acc, t: any) => {
      acc[t.id] = {
        narration: `Updated bank balance of ${t.bank?.name}`,
        amount: (acc?.[t.id]?.amount || 0) + Number(t.totalAmount || 0),
        createdAt: t.createdAt,
      };
      return acc;
    },
    {} as Record<string, any>
  );

  const res = [...Object.values(sellTxnByDriver), ...Object.values(receivePaymentByCompanyAndCustomer), ...Object.values(cashToBankTxnByDriver), ...Object.values(updateBankTxn)].sort(
    (a, b) => b.createdAt - a.createdAt
  );
  return res.map((r) => ({
    narration: r.narration,
    amount: r.amount,
    createdAt: r.createdAt,
  }));
};

const getCashOut = async (transactions: Transaction[], isBank: boolean) => {
  let paymentTransactions = transactions.filter((t) => t.type === "PAYMENT");
  let expenseTransactions = transactions.filter((t) => t.type === "EXPENSE");
  let depositTransactions: any = [];

  console.log(paymentTransactions);

  if (!isBank) {
    paymentTransactions = paymentTransactions.filter((t) => t.bankId === null);
    depositTransactions = transactions.filter((t) => t.type === "CASH_TO_BANK");
    expenseTransactions = expenseTransactions.filter((t) => t.bankId === null);
  }

  const sellTxnByDriver = paymentTransactions.reduce(
    (acc, t: any) => {
      acc[t.id] = {
        narration: "Payment done to " + getFirst(t.company?.name, t.customer?.name, t.driver?.name) + " ",
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
      acc[t.id] = {
        narration: t.driver?.name + " " + t?.expense?.category + " Expense",
        amount: (acc?.[t.id]?.amount || 0) + Number(t.totalAmount || 0),
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

  const previousDate = new Date(startDate);
  previousDate.setDate(startDate.getDate() - 1);
  previousDate.setHours(23, 59, 59, 999);

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
  const previousDateTransactions = await prisma.transaction.findMany({
    where: {
      createdAt: {
        lte: previousDate,
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

  const previousCashIn = await getCashIn(previousDateTransactions, bankId !== "cash");
  const previousCashOut = await getCashOut(previousDateTransactions, bankId !== "cash");

  const openingBalance = previousCashIn.reduce((s, r) => s + r.amount, 0) - previousCashOut.reduce((s, r) => s + r.amount, 0);

  const cashIn = await getCashIn(transactions, bankId !== "cash");
  const cashOut = await getCashOut(transactions, bankId !== "cash");
  console.log(bankId);

  //   console.log({
  //     cashIn,
  //     transactions,
  //   });

  return res.json({ cashIn, cashOut, transactions, openingBalance });
};
