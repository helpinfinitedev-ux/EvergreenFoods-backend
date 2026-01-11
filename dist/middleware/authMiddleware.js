"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAdmin = exports.authenticate = void 0;
const jwt_1 = require("../utils/jwt");
const authenticate = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    const token = authHeader.split(" ")[1];
    const decoded = (0, jwt_1.verifyToken)(token);
    console.log(decoded);
    if (!decoded) {
        return res.status(401).json({ error: "Invalid Token" });
    }
    req.user = decoded;
    next();
};
exports.authenticate = authenticate;
const requireAdmin = (req, res, next) => {
    const authReq = req;
    if (!authReq.user || authReq.user.role !== "ADMIN") {
        return res.status(403).json({ error: "Admin access required" });
    }
    next();
};
exports.requireAdmin = requireAdmin;
