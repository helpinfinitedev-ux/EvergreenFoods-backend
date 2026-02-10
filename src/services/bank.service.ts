import { PrismaTransaction } from "../utils/types";

const updateBankBalance = async (tx: PrismaTransaction, bankId: string, amount: number, operation: "increment" | "decrement") => {
  const bank = await tx.bank.findUnique({ where: { id: bankId } });
  if (!bank) {
    throw new Error("BANK_NOT_FOUND");
  }
  if (operation === "decrement" && Number(bank.balance) < Number(amount || 0)) {
    throw new Error("INSUFFICIENT_BALANCE");
  }
  await tx.bank.update({
    where: { id: bankId },
    data: { balance: { [operation]: amount } },
  });
};

export { updateBankBalance };
