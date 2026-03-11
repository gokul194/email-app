import { Router, type IRouter } from 'express';
import type { Request, Response, NextFunction } from 'express';
import * as fs from 'fs';
import {
  openFile,
  getMessagesInFolder,
  getMessageDetail,
  getAttachmentBuffer,
  searchMessages,
  closeSession,
} from '@email-app/pst-core';
import { upload } from '../middleware/upload';

const router: IRouter = Router();

// POST /api/pst/open — multipart upload (for smaller files)
router.post(
  '/open',
  upload.single('pstFile'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: 'No file uploaded' });
        return;
      }
      const result = await openFile(req.file.path, req.file.originalname);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/pst/open-local — open a local file by path (no upload needed)
router.post(
  '/open-local',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { filePath } = req.body;
      if (!filePath || typeof filePath !== 'string') {
        res.status(400).json({ error: 'Missing filePath in request body' });
        return;
      }
      if (!fs.existsSync(filePath)) {
        res.status(404).json({ error: `File not found: ${filePath}` });
        return;
      }
      const result = await openFile(filePath);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/pst/:sessionId/folders/:folderId/messages
router.get(
  '/:sessionId/folders/:folderId/messages',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { sessionId, folderId } = req.params;
      const offset = parseInt(req.query.offset as string) || 0;
      const limit = parseInt(req.query.limit as string) || 50;
      const result = await getMessagesInFolder(
        sessionId,
        decodeURIComponent(folderId),
        offset,
        limit
      );
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/pst/:sessionId/messages/:messageId
router.get(
  '/:sessionId/messages/:messageId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { sessionId, messageId } = req.params;
      const detail = await getMessageDetail(
        sessionId,
        decodeURIComponent(messageId)
      );
      res.json({ message: detail });
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/pst/:sessionId/messages/:messageId/attachments/:index
router.get(
  '/:sessionId/messages/:messageId/attachments/:index',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { sessionId, messageId, index } = req.params;
      const { buffer, filename, mimeType } = await getAttachmentBuffer(
        sessionId,
        decodeURIComponent(messageId),
        parseInt(index)
      );
      res.set('Content-Type', mimeType);
      res.set(
        'Content-Disposition',
        `attachment; filename="${encodeURIComponent(filename)}"`
      );
      res.send(buffer);
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/pst/:sessionId/search?q=...
router.get(
  '/:sessionId/search',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { sessionId } = req.params;
      const query = req.query.q as string;
      if (!query) {
        res.status(400).json({ error: 'Missing query parameter q' });
        return;
      }
      const results = await searchMessages(sessionId, query);
      res.json({ results, total: results.length });
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /api/pst/:sessionId
router.delete(
  '/:sessionId',
  (req: Request, res: Response, next: NextFunction) => {
    try {
      closeSession(req.params.sessionId);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  }
);

export { router as pstRouter };
