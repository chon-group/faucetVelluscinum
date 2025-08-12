import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import { execFile } from 'child_process';
import { promisify } from 'util';
import dotenv from 'dotenv';
import { RateLimiterMemory } from 'rate-limiter-flexible';
import crypto from 'crypto';

dotenv.config();

const app = express();
// ⚠️ Helmet com CSP desabilitado para permitir script inline/external simples do frontend
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: true }));
app.use(express.json());
app.use(morgan('combined'));
app.use(express.static('public'));

// Configs
const BDB_SERVER_URL = process.env.BDB_SERVER_URL;
const PRIV = process.env.FAUCET_PRIVATE_KEY_FILE;
const PUB = process.env.FAUCET_PUBLIC_KEY_FILE;
const ASSET_ID = process.env.FAUCET_ASSET_ID;
const MIN = parseInt(process.env.FAUCET_MIN_AMOUNT || '1', 10);
const MAX = parseInt(process.env.FAUCET_MAX_AMOUNT || '5', 10);
const PORT = parseInt(process.env.PORT || '8080', 10);

// Quotas simples em memória (produção: usar Redis)
const DAILY_QUOTA_PER_IP = parseInt(process.env.FAUCET_DAILY_QUOTA_PER_IP || '10', 10);
const DAILY_QUOTA_PER_WALLET = parseInt(process.env.FAUCET_DAILY_QUOTA_PER_WALLET || '10', 10);

const limiter = new RateLimiterMemory({ points: 100, duration: 60 }); // 100 req/min/IP

const ipCounters = new Map();
const walletCounters = new Map();
let lastReset = Date.now();

function resetDailyCountersIfNeeded() {
  const now = Date.now();
  const ONE_DAY = 24 * 60 * 60 * 1000;
  if (now - lastReset > ONE_DAY) {
    ipCounters.clear();
    walletCounters.clear();
    lastReset = now;
  }
}

function incCounter(map, key) {
  const current = map.get(key) || 0;
  const next = current + 1;
  map.set(key, next);
  return next;
}

function validatePublicKey(pubKey) {
  return typeof pubKey === 'string' && /^[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]{25,90}$/.test(pubKey);
}

function validateAmount(amount) {
  const n = Number(amount);
  return Number.isFinite(n) && n >= MIN && n <= MAX && Math.floor(n) === n;
}

const execFileAsync = promisify(execFile);

app.post('/api/faucet', async (req, res) => {
  console.log('POST /api/faucet body=', req.body); // 👀 debug
  try {
    await limiter.consume(req.ip);
  } catch {
    return res.status(429).json({ ok: false, error: 'Too many requests' });
  }

  resetDailyCountersIfNeeded();

  const { destinationWallet, amount } = req.body || {};

  if (!validatePublicKey(destinationWallet)) {
    return res.status(400).json({ ok: false, error: 'destinationWallet inválido' });
  }
  if (!validateAmount(amount)) {
    return res.status(400).json({ ok: false, error: `amount inválido (min=${MIN}, max=${MAX})` });
  }

  const ipCount = incCounter(ipCounters, req.ip);
  if (ipCount > DAILY_QUOTA_PER_IP) {
    return res.status(429).json({ ok: false, error: 'Cota diária por IP excedida' });
  }
  const wCount = incCounter(walletCounters, destinationWallet);
  if (wCount > DAILY_QUOTA_PER_WALLET) {
    return res.status(429).json({ ok: false, error: 'Cota diária por carteira excedida' });
  }

  const reqId = crypto.randomUUID();

  const args = [
    'transferToken',
    BDB_SERVER_URL,
    PRIV,
    PUB,
    ASSET_ID,
    destinationWallet,
    String(amount)
  ];

  try {
    const { stdout, stderr } = await execFileAsync('velluscinum', args, { timeout: 30_000 });
    const ok = /\[successfully\]/i.test(stdout);
    const txMatch = stdout.match(/[0-9a-f]{64}/i);
    const txId = txMatch ? txMatch[0] : null;

    if (!ok) {
      return res.status(500).json({ ok: false, error: 'Falha ao transferir token', detail: stdout || stderr, reqId });
    }

    return res.json({ ok: true, txId, stdout, reqId });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'Erro ao executar Velluscinum', detail: String(err), reqId });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true, server: BDB_SERVER_URL, assetId: ASSET_ID, min: MIN, max: MAX });
});

app.listen(PORT, () => {
  console.log(`Faucet rodando em http://localhost:${PORT}`);
});
