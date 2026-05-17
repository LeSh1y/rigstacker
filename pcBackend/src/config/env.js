const path = require('path');

require('dotenv').config({
  path: path.resolve(__dirname, '../../.env'),
});

const required = ['DB_HOST', 'DB_USER', 'DB_NAME'];

for(const key of required){
    if(!process.env[key]){
        throw new Error(`Missing required env variable: ${key}`);

    }
}

module.exports = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 3000,
  db: {
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT, 10) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD || '',
    name: process.env.DB_NAME,
  },
};
