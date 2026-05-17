const success = (res, data = null, statusCode = 200) => {
  return res.status(statusCode).json({
    success: true,
    data,
    error: null,
  });
};

const error = (res, message = 'Something went wrong', statusCode = 500) => {
  return res.status(statusCode).json({
    success: false,
    data: null,
    error: message,
  });
};

module.exports = {
  success,
  error,
};