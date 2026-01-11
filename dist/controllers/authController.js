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
exports.getMe = exports.login = exports.register = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const app_1 = require("../app");
const jwt_1 = require("../utils/jwt");
const register = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { name, mobile, password, role } = req.body;
        const existingUser = yield app_1.prisma.user.findUnique({ where: { mobile } });
        if (existingUser) {
            return res.status(400).json({ error: "Mobile already registered" });
        }
        const passwordHash = yield bcryptjs_1.default.hash(password, 10);
        const user = yield app_1.prisma.user.create({
            data: {
                name,
                mobile,
                passwordHash,
                role: role || "DRIVER",
            },
        });
        const token = (0, jwt_1.generateToken)(user.id, user.role);
        res.json({ token, user: { id: user.id, name: user.name, mobile: user.mobile, role: user.role } });
    }
    catch (error) {
        res.status(500).json({ error: "Registration failed" });
    }
});
exports.register = register;
const login = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { mobile, password } = req.body;
        const user = yield app_1.prisma.user.findUnique({ where: { mobile } });
        if (!user) {
            return res.status(400).json({ error: "User not found" });
        }
        const isValid = yield bcryptjs_1.default.compare(password, user.passwordHash);
        if (!isValid) {
            return res.status(400).json({ error: "Invalid password" });
        }
        const token = (0, jwt_1.generateToken)(user.id, user.role);
        res.json({ token, user: { id: user.id, name: user.name, mobile: user.mobile, role: user.role } });
    }
    catch (error) {
        res.status(500).json({ error: "Login failed" });
    }
});
exports.login = login;
const getMe = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        console.log(req.user);
        if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.userId)) {
            return res.status(401).json({ error: "Unauthorized" });
        }
        const user = yield app_1.prisma.user.findUnique({
            where: { id: req.user.userId },
            select: {
                id: true,
                name: true,
                mobile: true,
                role: true,
            },
        });
        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }
        res.json({ user });
    }
    catch (error) {
        res.status(500).json({ error: "Failed to fetch user" });
    }
});
exports.getMe = getMe;
