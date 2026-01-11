"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const prisma = new client_1.PrismaClient();
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        // Create Admin User
        const adminMobile = '9999999999';
        const adminPassword = 'admin123';
        const adminName = 'Admin User';
        const existingAdmin = yield prisma.user.findUnique({
            where: { mobile: adminMobile },
        });
        if (existingAdmin) {
            console.log(`Admin user already exists.`);
        }
        else {
            const passwordHash = yield bcryptjs_1.default.hash(adminPassword, 10);
            const admin = yield prisma.user.create({
                data: {
                    mobile: adminMobile,
                    passwordHash,
                    name: adminName,
                    role: 'ADMIN',
                },
            });
            console.log(`Created admin: ${admin.name} (${admin.mobile})`);
        }
        // Create a sample vehicle
        const existingVehicle = yield prisma.vehicle.findFirst();
        if (!existingVehicle) {
            yield prisma.vehicle.create({
                data: {
                    registration: 'UP32XX1234',
                    currentKm: 50000,
                },
            });
            console.log('Created sample vehicle');
        }
    });
}
main()
    .catch((e) => {
    console.error(e);
    process.exit(1);
})
    .finally(() => __awaiter(void 0, void 0, void 0, function* () {
    yield prisma.$disconnect();
}));
