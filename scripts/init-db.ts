#!/usr/bin/env node
/**
 * Database initialization script
 *
 * This script creates the necessary tables in the PostgreSQL database
 * and optionally seeds default categories.
 */

import * as dotenv from 'dotenv';
dotenv.config();

import { getPool } from '../lib/db';

const DEFAULT_CATEGORIES = [
  'Room and Utility',
  'Daily Expense',
  'Borrow Others',
  'Food & Drinks',
  'Transportation',
  'Entertainment',
  'Shopping',
  'Other'
];

async function initializeDatabase() {
  const pool = getPool();

  console.log('Creating database tables...');

  try {
    // Create users table first (referenced by other tables)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(255) PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        name VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✓ Users table created');

    // Create income table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS income (
        id VARCHAR(255) PRIMARY KEY,
        user_id VARCHAR(255),
        date VARCHAR(50) NOT NULL,
        description TEXT NOT NULL,
        amount DECIMAL(15, 2) NOT NULL,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Add user_id column if it doesn't exist
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='income' AND column_name='user_id') THEN
          ALTER TABLE income ADD COLUMN user_id VARCHAR(255);
        END IF;
      END $$;
    `);
    console.log('✓ Income table created');

    // Create expenses table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS expenses (
        id VARCHAR(255) PRIMARY KEY,
        user_id VARCHAR(255),
        date VARCHAR(50) NOT NULL,
        category VARCHAR(255) NOT NULL,
        description TEXT NOT NULL,
        amount DECIMAL(15, 2) NOT NULL,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Add user_id column if it doesn't exist
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='expenses' AND column_name='user_id') THEN
          ALTER TABLE expenses ADD COLUMN user_id VARCHAR(255);
        END IF;
      END $$;
    `);
    console.log('✓ Expenses table created');

    // Create categories table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS categories (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✓ Categories table created');

    // Create settings table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS settings (
        id VARCHAR(255) PRIMARY KEY,
        key VARCHAR(255) UNIQUE NOT NULL,
        value TEXT NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✓ Settings table created');

    // Seed default categories if none exist
    const categoriesResult = await pool.query('SELECT COUNT(*) FROM categories');
    const categoryCount = parseInt(categoriesResult.rows[0].count);

    if (categoryCount === 0) {
      console.log('\nSeeding default categories...');
      for (const category of DEFAULT_CATEGORIES) {
        const id = 'cat-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
        await pool.query('INSERT INTO categories (id, name) VALUES ($1, $2)', [id, category]);
        console.log(`  ✓ Added category: ${category}`);
      }
    } else {
      console.log(`\n${categoryCount} categories already exist in the database`);
    }

    console.log('\n✅ Database initialized successfully!');
  } catch (error) {
    console.error('❌ Error initializing database:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Run the initialization
initializeDatabase()
  .then(() => {
    console.log('\nDatabase is ready to use.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nFailed to initialize database:', error);
    process.exit(1);
  });
