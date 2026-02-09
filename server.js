/**
 * DOCROUTE AI - BACKEND SERVER (Node.js + MySQL)
 */
import express from 'express';
import mysql from 'mysql2/promise';
import cors from 'cors';
import bodyParser from 'body-parser';
import { v4 as uuidv4 } from 'uuid';

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '100mb' }));

// ---------------------------------------------------------
// DATABASE CONFIGURATION
// ---------------------------------------------------------
const dbConfig = {
  host: 'localhost',      
  user: 'root',           
  password: 'pi@162003', // <-- CHANGE THIS to your MySQL password!
  database: 'docroute_ai', 
  port: 3306              
};

let pool;

async function initDB() {
  try {
    console.log('\x1b[36m%s\x1b[0m', '--- DocRoute AI System Initialization ---');
    
    // Check for API Key
    if (!process.env.API_KEY) {
      console.warn('\x1b[33m%s\x1b[0m', '⚠️ WARNING: API_KEY environment variable is not set.');
      console.warn('AI classification will fail. Run: set API_KEY=AIzaSyDwvNYaVMnOY3cXlBWefWRxY9TpHqAiVe4');
    }

    // Ensure database exists
    const setupConn = await mysql.createConnection({
      host: dbConfig.host,
      user: dbConfig.user,
      password: dbConfig.password,
      port: dbConfig.port
    });
    
    await setupConn.query(`CREATE DATABASE IF NOT EXISTS \`${dbConfig.database}\`;`);
    await setupConn.end();
    
    pool = await mysql.createPool(dbConfig);
    const connection = await pool.getConnection();
    console.log('\x1b[32m%s\x1b[0m', '✅ MySQL Connection Successful!');
    connection.release();

    // Table Creation
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(36) PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        role VARCHAR(50) DEFAULT 'Operator',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB;
    `);

    await pool.execute(`
      CREATE TABLE IF NOT EXISTS documents (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        timestamp BIGINT NOT NULL,
        category VARCHAR(50),
        confidence FLOAT,
        status VARCHAR(20),
        destination VARCHAR(100),
        summary TEXT,
        extracted_fields_json TEXT,
        thumbnail_base64 LONGTEXT,
        user_id VARCHAR(255),
        origin VARCHAR(20) DEFAULT 'Upload'
      ) ENGINE=InnoDB;
    `);

    await pool.execute(`
      CREATE TABLE IF NOT EXISTS system_audit_logs (
        log_id VARCHAR(36) PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        event_name VARCHAR(100) NOT NULL,
        log_level ENUM('INFO', 'SUCCESS', 'WARNING', 'ERROR') NOT NULL,
        payload_json TEXT
      ) ENGINE=InnoDB;
    `);

    console.log('\x1b[32m%s\x1b[0m', '✅ Database Schema Verified.');
  } catch (err) {
    console.error('\n\x1b[31m%s\x1b[0m', '❌ CRITICAL DATABASE ERROR:');
    console.error(err.message);
    console.log('Ensure MySQL is running and your password in server.js is correct.\n');
    pool = null;
  }
}

// --- AUTH API ---
app.post('/api/auth/signup', async (req, res) => {
  if (!pool) return res.status(503).send({ error: 'Database Offline' });
  const { email, password } = req.body;
  try {
    const id = uuidv4();
    await pool.execute('INSERT INTO users (id, email, password) VALUES (?, ?, ?)', [id, email, password]);
    res.status(201).send({ id, email, role: 'Operator' });
  } catch (e) {
    res.status(400).send({ error: e.code === 'ER_DUP_ENTRY' ? 'Email already registered.' : 'Signup failed.' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  if (!pool) return res.status(503).send({ error: 'Database Offline' });
  const { email, password } = req.body;
  try {
    const [rows] = await pool.execute('SELECT id, email, role FROM users WHERE email = ? AND password = ?', [email, password]);
    if (rows.length === 0) return res.status(401).send({ error: 'Invalid credentials.' });
    res.send(rows[0]);
  } catch (e) {
    res.status(500).send({ error: 'Auth error.' });
  }
});

// --- DOCUMENTS API ---
app.post('/api/documents', async (req, res) => {
  if (!pool) return res.status(503).send({ error: 'Database Offline' });
  try {
    const d = req.body;
    await pool.execute(
      'INSERT INTO documents (id, name, timestamp, category, confidence, status, destination, summary, extracted_fields_json, thumbnail_base64, user_id, origin) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [d.id, d.name, d.timestamp, d.category, d.confidence, d.status, d.destination, d.summary, JSON.stringify(d.extractedFields || []), d.thumbnail, d.user_id, d.origin]
    );
    res.status(201).send({ message: 'Saved' });
  } catch (e) {
    res.status(500).send({ error: 'Save failed' });
  }
});

app.get('/api/documents', async (req, res) => {
  if (!pool) return res.status(503).send({ error: 'Database Offline' });
  try {
    const { userId } = req.query;
    const [rows] = await pool.execute('SELECT * FROM documents WHERE user_id = ? ORDER BY timestamp DESC', [userId]);
    const formatted = rows.map(r => ({
      ...r,
      extractedFields: JSON.parse(r.extracted_fields_json || '[]'),
      thumbnail: r.thumbnail_base64
    }));
    res.send(formatted);
  } catch (e) {
    res.status(500).send({ error: 'Fetch failed' });
  }
});

app.patch('/api/documents/:id', async (req, res) => {
  if (!pool) return res.status(503).send({ error: 'Database Offline' });
  const { id } = req.params;
  const updates = req.body;
  try {
    const fields = [];
    const values = [];
    for (const [key, value] of Object.entries(updates)) {
      if (key === 'extractedFields') {
        fields.push('extracted_fields_json = ?');
        values.push(JSON.stringify(value));
      } else if (key === 'thumbnail') {
        fields.push('thumbnail_base64 = ?');
        values.push(value);
      } else {
        fields.push(`${key} = ?`);
        values.push(value);
      }
    }
    if (fields.length === 0) return res.status(400).send({ error: 'No updates provided' });
    values.push(id);
    const query = `UPDATE documents SET ${fields.join(', ')} WHERE id = ?`;
    await pool.execute(query, values);
    res.send({ success: true });
  } catch (e) {
    res.status(500).send({ error: 'Update failed' });
  }
});

app.get('/api/logs', async (req, res) => {
  if (!pool) return res.status(503).send({ error: 'DB Offline' });
  try {
    const [rows] = await pool.execute('SELECT * FROM system_audit_logs ORDER BY timestamp DESC LIMIT 50');
    res.send(rows);
  } catch (e) { res.sendStatus(500); }
});

app.post('/api/logs', async (req, res) => {
  if (!pool) return res.sendStatus(503);
  try {
    const { log_id, user_id, event_name, log_level, payload_json } = req.body;
    await pool.execute('INSERT INTO system_audit_logs (log_id, user_id, event_name, log_level, payload_json) VALUES (?, ?, ?, ?, ?)', [log_id, user_id, event_name, log_level, payload_json]);
    res.sendStatus(201);
  } catch (e) { res.sendStatus(500); }
});

app.get('/api/health', (req, res) => res.send({ status: 'online', db_connected: !!pool }));

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`🚀 DocRoute Backend: http://localhost:${PORT}`);
  initDB();
});