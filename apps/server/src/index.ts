import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { apiRouter } from './routes/api.js';
import { screenerRouter } from './routes/screener.js';
import { initStockList } from './services/screener/engine.js';

const app = express();
const PORT = process.env.PORT || 4001;

app.use(cors());
app.use(express.json());
app.use('/api', apiRouter);
app.use('/api/screener', screenerRouter);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Block until stock list is loaded, then start server
initStockList()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
