import { Transaction } from "@prisma/client";
import { prisma } from "../../app";
import { TRANSACTION_TYPE } from "../../utils/constants";
import { updateTotalCashAndTodayCash } from "../cash.service";

export const deleteSellTransaction = async (transaction: Transaction) => {
  if (!transaction) {
    throw new Error("Transaction not found");
  }
  if (transaction.type !== TRANSACTION_TYPE.SELL) {
    throw new Error("Transaction is not a sell transaction");
  }

  await prisma.$transaction(async (tx) => {
    if (transaction.customerId) {
      const bill = Number(transaction.totalAmount || 0);
      const paid = Number(transaction.paymentCash || 0) + Number(transaction.paymentUpi || 0);
      const change = bill - paid;
      if (change !== 0) {
        await tx.customer.update({ where: { id: transaction.customerId }, data: { balance: { decrement: change } } });
      }
      await updateTotalCashAndTodayCash(tx, paid, "decrement");
    } else if (transaction.companyId) {
      const bill = Number(transaction.totalAmount || 0);
      const paid = Number(transaction.paymentCash || 0) + Number(transaction.paymentUpi || 0);
      const change = bill - paid;
      if (change !== 0) {
        await tx.company.update({ where: { id: transaction.companyId }, data: { amountDue: { decrement: change } } });
      }
      await updateTotalCashAndTodayCash(tx, paid, "decrement");
    }
    await tx.transaction.delete({ where: { id: transaction.id } });
  });
  return transaction;
};

export const deleteBuyTransaction =  async(transaction:Transaction) =>{
  if(!transaction){
    throw new Error("No transaction found");
  }
}

