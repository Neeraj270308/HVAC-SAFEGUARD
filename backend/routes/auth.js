const { Router } = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../db');

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkey';

const createToken = (id) => {
  return jwt.sign({ id }, JWT_SECRET, {
    expiresIn: '1d'
  });
};

router.post('/register', async (req, res) => {
  const { username, email, password } = req.body;
  if (!username?.trim() || !email?.trim() || typeof password !== 'string' || password.length < 6) {
    return res.status(400).json({ error: 'Username, a valid email, and a password of at least 6 characters are required.' });
  }

  try {
    const salt = await bcrypt.genSalt();
    const password_hash = await bcrypt.hash(password, salt);
    
    const result = await db.query(
      'INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING id, username, email',
      [username, email, password_hash]
    );
    
    const user = result.rows[0];
    const token = createToken(user.id);
    
    res.cookie('jwt', token, { httpOnly: true, maxAge: 24 * 60 * 60 * 1000 });
    res.status(201).json({ user, token });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Username or email is already registered.' });
    }
    console.error('Registration failed:', err.message);
    res.status(500).json({ error: 'Registration is unavailable. Check the database connection.' });
  }
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email?.trim() || typeof password !== 'string' || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }
  try {
    const result = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }
    
    const user = result.rows[0];
    const auth = await bcrypt.compare(password, user.password_hash);
    
    if (auth) {
      const token = createToken(user.id);
      res.cookie('jwt', token, { httpOnly: true, maxAge: 24 * 60 * 60 * 1000 });
      res.status(200).json({ user: { id: user.id, username: user.username, email: user.email }, token });
    } else {
      res.status(400).json({ error: 'Invalid credentials' });
    }
  } catch (err) {
    console.error('Login failed:', err.message);
    res.status(500).json({ error: 'Login is unavailable. Check the database connection.' });
  }
});

router.post('/logout', (req, res) => {
  res.cookie('jwt', '', { maxAge: 1 });
  res.status(200).json({ message: 'Logged out successfully' });
});

module.exports = router;
