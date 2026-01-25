import { PrismaTransaction } from "../utils/types";

const updateBankBalance = async (
  tx: PrismaTransaction,
  bankId: string,
  amount: number,
  operation: "increment" | "decrement"
) => {
  const bank = await tx.bank.findUnique({ where: { id: bankId } });
  if (!bank) {
    throw new Error("BANK_NOT_FOUND");
  }
  await tx.bank.update({
    where: { id: bankId },
    data: { balance: { [operation]: amount } },
  });
};

export { updateBankBalance };
