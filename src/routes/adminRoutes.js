const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { verifyToken, checkRole } = require('../middleware/authMiddleware');

router.post(
    '/approve-issuer/:id',
    verifyToken,                  
    checkRole(['Admin Institusi']),  
    adminController.approveIssuer  
);

module.exports = router;