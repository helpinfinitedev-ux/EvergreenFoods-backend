import { PrismaTransaction } from "../../utils/types";

export const getEntityDetails = async (tx: PrismaTransaction, id: string, type: "customer" | "company" | "driver") => {
  let entity: any;
  if (!id) throw new Error("NO ID Given");
  if (type === "customer") {
    entity = await tx.customer.findUnique({ where: { id } });
    if (!entity) throw new Error("CUSTOMER_NOT_FOUND");
  }
  if (type === "company") {
    entity = await tx.company.findUnique({ where: { id } });
    if (!entity) throw new Error("COMPANY_NOT_FOUND");
  }
  if (type === "driver") {
    entity = await tx.user.findUnique({ where: { id } });
    if (!entity) throw new Error("DRIVER_NOT_FOUND");
  }
  return entity;
};

export const updateEntityBalance = async (tx: PrismaTransaction, entity: any, amount: number, type: "customer" | "company" | "driver", operation: "increment" | "decrement" = "decrement") => {
  if (!entity) throw new Error("ENTITY_NOT_FOUND");
  if (type === "customer") {
    const newBalance = operation === "decrement" ? Number(entity.balance) - amount : Number(entity.balance) + amount;
    await tx.customer.update({ where: { id: entity.id }, data: { balance: newBalance } });
  }
  if (type === "company") {
    const newAmountDue = operation === "decrement" ? Number(entity.amountDue) - amount : Number(entity.amountDue) + amount;

    await tx.company.update({ where: { id: entity.id }, data: { amountDue: newAmountDue } });
  }
  return;
};
