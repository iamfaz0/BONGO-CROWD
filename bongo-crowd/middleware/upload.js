const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure upload directories exist
const uploadDirs = {
    reports: path.join(__dirname, '..', 'uploads', 'reports')
};

Object.values(uploadDirs).forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

// Storage configuration for report attachments
const reportStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDirs.reports);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const safeFilename = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
        cb(null, `report-${uniqueSuffix}-${safeFilename}`);
    }
});

// File filter for images, PDFs, and videos
const reportFileFilter = (req, file, cb) => {
    const allowedMimes = [
        // Images
        'image/jpeg',
        'image/png',
        'image/gif',
        'image/webp',
        // PDFs
        'application/pdf',
        // Videos
        'video/mp4',
        'video/webm',
        'video/ogg',
        'video/quicktime' // .mov files
    ];
    
    const allowedExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.pdf', '.mp4', '.webm', '.ogg', '.mov'];
    
    const ext = path.extname(file.originalname).toLowerCase();
    
    if (allowedMimes.includes(file.mimetype) && allowedExts.includes(ext)) {
        cb(null, true);
    } else {
        cb(new Error('Invalid file type. Only images (JPEG, PNG, GIF, WebP), PDFs, and videos (MP4, WebM, OGG, MOV) are allowed.'), false);
    }
};

// Report attachment upload middleware
const reportUpload = multer({
    storage: reportStorage,
    fileFilter: reportFileFilter,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB per file
        files: 5 // Max 5 files
    }
});

// Error handler for multer
const handleMulterError = (err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: 'File too large. Maximum size is 10MB per file.' });
        }
        if (err.code === 'LIMIT_FILE_COUNT') {
            return res.status(400).json({ error: 'Too many files. Maximum is 5 files per report.' });
        }
        if (err.code === 'LIMIT_UNEXPECTED_FILE') {
            return res.status(400).json({ error: 'Unexpected field name. Use "attachments" for file uploads.' });
        }
        return res.status(400).json({ error: err.message });
    }
    
    if (err) {
        return res.status(400).json({ error: err.message });
    }
    
    next();
};

module.exports = {
    reportUpload,
    handleMulterError
};
