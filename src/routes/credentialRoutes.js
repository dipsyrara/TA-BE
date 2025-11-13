const express = require('express');
const router = express.Router();
const credentialController = require('../controllers/credentialController');
const { verifyToken, checkRole } = require('../middleware/authMiddleware');
const multer = require('multer');

const storage = multer.memoryStorage();
const upload = multer({ 
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 } 
});

router.post(
    '/issue',
    verifyToken,
    checkRole(['Penerbit']),
    upload.single('file'),
    credentialController.issueCredential
);

router.post(
    '/claim/:id',
    verifyToken,
    checkRole(['Siswa & Mahasiswa']),
    credentialController.claimCredential
);

module.exports = router;