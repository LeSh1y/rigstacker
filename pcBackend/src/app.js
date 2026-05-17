const express = require('express');
const rateLimiter = require('./middleware/rateLimiter.middleware');
const errorHandler = require('./middleware/errorHandler.middleware');
const apiResponse = require('./utils/apiResponse');

const cors = require('cors') 
const app = express();
app.use(cors({
  origin: 'http://localhost:5173'
}))

app.use(express.json());

app.use(rateLimiter);

app.get('/api/health', (req, res) => {
  apiResponse.success(res, 'ok');
});

 app.use('/api', require('./routes'));

app.use((req, res) => {
  apiResponse.error(res, `Route ${req.method} ${req.path} not found`, 404);
});

app.use(errorHandler);

module.exports = app;