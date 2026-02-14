import { Request, Response } from "express";
import { prisma } from "../../app";
import { getEntityDetails, updateEntityBalance } from "../../services/transactions/receivePayments.service";
import { updateBankBalance } from "../../services/bank.service";
import { updateTotalCashAndTodayCash } from "../../services/cash.service";

export const deleteReceivedPayment = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const transaction = await prisma.transaction.findUnique({ where: { id } });
    if (!transaction) {
      return res.status(404).json({ error: "Transaction not found" });
    }
    if (transaction.type !== "RECEIVE_PAYMENT") {
      return res.status(400).json({ error: "Transaction is not a receive payment" });
    }
    await prisma.$transaction(async (tx) => {
      const entityType = transaction.customerId ? "customer" : transaction.companyId ? "company" : transaction.driverId ? "driver" : undefined;
      if (!entityType) {
        throw new Error("Entity type not found");
      }
      const entity = await getEntityDetails(tx, transaction.customerId || transaction.companyId || transaction.driverId || "", entityType);
      if (!entity) {
        throw new Error("Entity not found");
      }
      await updateEntityBalance(tx, entity, Number(transaction.totalAmount), entityType, entityType === "company" ? "decrement" : "increment");
      if (transaction.bankId) {
        await updateBankBalance(tx, transaction.bankId, Number(transaction.totalAmount), "decrement");
      } else {
        await updateTotalCashAndTodayCash(tx, Number(transaction.totalAmount), "decrement");
      }
      await tx.transaction.delete({ where: { id } });
    });
    return res.json({ success: true });
  } catch (error: any) {
    console.error("Delete received payment error:", error);
    return res.status(500).json({ error: "Failed to delete received payment" });
  }
};
