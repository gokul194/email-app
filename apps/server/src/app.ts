import express, { type Express } from 'express';
import cors from 'cors';
import { pstRouter } from './routes/pst';
import { errorHandler } from './middleware/error-handler';

export function createApp(): Express {
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use('/api/pst', pstRouter);
  app.use(errorHandler);
  return app;
}
