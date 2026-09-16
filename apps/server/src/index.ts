import "dotenv/config";
import express from "express";
import cors from "cors";
import { apiRouter } from "./routes/api.js";
import { screenerRouter } from "./routes/screener.js";
import { historyRouter } from "./routes/history.js";
import { favoritesRouter } from "./routes/favorites.js";
import { backupRouter } from "./routes/backup.js";
import { swarmRouter } from "./routes/swarm.js";
import { initStockList } from "./services/screener/engine.js";
import { initPersistence } from "./services/persistence-container.js";
import { runRegistry } from "./services/swarm/run-registry.js";

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: "50mb" })); // backup import can be large
app.use("/api", apiRouter);
app.use("/api/screener", screenerRouter);
app.use("/api/history", historyRouter);
app.use("/api/favorites", favoritesRouter);
app.use("/api/backup", backupRouter);
app.use("/api/swarm", swarmRouter);

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// C1: TTL watcher 启动后, SSE 断 30s 的 run 会被 auto abort
runRegistry.start();

Promise.all([initStockList(), initPersistence()])
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Failed to start server:", err);
    process.exit(1);
  });
