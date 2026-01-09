const express = require("express");
const router = express.Router();
const userController = require("../controllers/userController");
const { verifyToken, authorizeRole } = require("../middleware/authMiddleware");

router.put(
  "/profile/wallet",
  verifyToken,
  authorizeRole(["owner"]),
  userController.linkWallet
);

module.exports = router;
