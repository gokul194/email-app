import multer from 'multer';
import path from 'path';
import os from 'os';

const storage = multer.diskStorage({
  destination: os.tmpdir(),
  filename: (_req, file, cb) => {
    const uniqueName = `pst-${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  },
});

export const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 * 1024 }, // 2 GB
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.pst' || ext === '.mbox') {
      cb(null, true);
    } else {
      cb(new Error('Only .pst and .mbox files are accepted'));
    }
  },
});
