import { Prisma } from "@prisma/client";
import { DynamicClientExtensionThis, InternalArgs } from "@prisma/client/runtime/library";

export type PrismaTransaction = Omit<
DynamicClientExtensionThis<
  Prisma.TypeMap<
    InternalArgs & {
      result: {};
      model: {};
      query: {};
      client: {};
    },
    Prisma.PrismaClientOptions
  >,
  Prisma.TypeMapCb,
  {
    result: {};
    model: {};
    query: {};
    client: {};
  },
  {}
>,
"$extends" | "$transaction" | "$disconnect" | "$connect" | "$on" | "$use"
>;