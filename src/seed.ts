import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  // Create Admin User
  const adminMobile = "7897404065";
  const adminPassword = "admin123";
  const adminName = "Admin User";

  const existingAdmin = await prisma.user.findUnique({
    where: { mobile: adminMobile },
  });

  if (existingAdmin) {
    console.log(`Admin user already exists.`);
  } else {
    const passwordHash = await bcrypt.hash(adminPassword, 10);

    const admin = await prisma.user.create({
      data: {
        mobile: adminMobile,
        passwordHash,
        name: adminName,
        role: "ADMIN",
      },
    });

    console.log(`Created admin: ${admin.name} (${admin.mobile})`);
  }

  // Create a sample vehicle
  const existingVehicle = await prisma.vehicle.findFirst();
  if (!existingVehicle) {
    await prisma.vehicle.create({
      data: {
        registration: "UP32XX1234",
        currentKm: 50000,
      },
    });
    console.log("Created sample vehicle");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
