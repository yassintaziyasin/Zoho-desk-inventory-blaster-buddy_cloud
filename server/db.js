const { Pool } = require('pg');
require('dotenv').config();

// Check if the environment is production (like on Zeabur)
const isProduction = process.env.NODE_ENV === 'production';

// Configuration for the database connection
const connectionConfig = {
  connectionString: process.env.DATABASE_URL,
  // Add SSL configuration only in production
  ...(isProduction && {
    ssl: {
      rejectUnauthorized: false
    }
  })
};

const pool = new Pool(connectionConfig);

// Function to initialize the database schema
const initializeDatabase = async () => {
  const client = await pool.connect();
  try {
    // SQL to create the profiles table
    await client.query(`
      CREATE TABLE IF NOT EXISTS profiles (
          id SERIAL PRIMARY KEY,
          profile_name VARCHAR(255) UNIQUE NOT NULL,
          client_id VARCHAR(255) NOT NULL,
          client_secret VARCHAR(255) NOT NULL,
          refresh_token TEXT NOT NULL,
          desk_config JSONB,
          inventory_config JSONB,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // SQL to create the ticket_logs table
    await client.query(`
      CREATE TABLE IF NOT EXISTS ticket_logs (
          id SERIAL PRIMARY KEY,
          ticket_number VARCHAR(255) NOT NULL,
          email VARCHAR(255) NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // SQL to create the function and trigger for updating timestamps
    await client.query(`
      CREATE OR REPLACE FUNCTION trigger_set_timestamp()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    // Drop the trigger if it exists before creating it to avoid errors on restart
    await client.query(`
      DROP TRIGGER IF EXISTS set_timestamp ON profiles;
    `);

    await client.query(`
      CREATE TRIGGER set_timestamp
      BEFORE UPDATE ON profiles
      FOR EACH ROW
      EXECUTE PROCEDURE trigger_set_timestamp();
    `);

    console.log('Database tables initialized successfully.');
  } catch (err) {
    console.error('Error initializing database:', err.stack);
  } finally {
    client.release();
  }
};

module.exports = {
  query: (text, params) => pool.query(text, params),
  initializeDatabase
};
