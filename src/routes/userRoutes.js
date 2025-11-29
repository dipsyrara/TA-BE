const express = require("express");
const router = express.Router();
const userController = require("../controllers/userController");
const { verifyToken, checkRole } = require("../middleware/authMiddleware");

router.put(
  "/profile/wallet",
  verifyToken,
  checkRole(["owner"]),
  userController.linkWallet
);

module.exports = router;
