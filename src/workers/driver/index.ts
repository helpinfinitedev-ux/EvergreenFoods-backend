import { PrismaClient, Transaction } from "@prisma/client";

export const updateDriverWalletWhenTransactionIsCreated = async (prisma: PrismaClient, transaction: Transaction) => {
  const { type, totalAmount, paymentCash, paymentUpi, customerId, companyId, driverId } = transaction;

  if (type === "SELL") {
    await prisma.user.update({
      where: { id: transaction.driverId },
      data: { cashInHand: { increment: Number(paymentCash || 0) }, upiInHand: { increment: Number(paymentUpi || 0) } },
    });
  }

  if (type === "RECEIVE_PAYMENT" && !customerId && !companyId) {
    await prisma.user.update({
      where: { id: driverId },
      data: { cashInHand: { decrement: Number(totalAmount || 0) } },
    });
  }
};

export const updateDriverWalletWhenTransactionIsDeleted = async (prisma: PrismaClient, transaction: Transaction) => {
  const { type, totalAmount, paymentCash, paymentUpi, customerId, companyId, driverId } = transaction;

  if (type === "SELL") {
    await prisma.user.update({
      where: { id: transaction.driverId },
      data: { cashInHand: { decrement: Number(paymentCash || 0) }, upiInHand: { decrement: Number(paymentUpi || 0) } },
    });
  }

  if (type === "RECEIVE_PAYMENT" && !customerId && !companyId) {
    await prisma.user.update({
      where: { id: driverId },
      data: { cashInHand: { increment: Number(totalAmount || 0) } },
    });
  }
};
