const { Pool } = require("pg");
require("dotenv").config();

const { DATABASE_URL } = process.env;

if (!DATABASE_URL) {
    throw new Error("DATABASE_URL tidak ditemukan di .env");
}

const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: {
        rejectUnauthorized: false 
    }
});

module.exports = {
    query: (text, params) => pool.query(text, params),
};
