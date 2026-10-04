const getHealth = (req, res, next) => {
  try {
    res.status(200).json({
      success: true,
      message: 'Server is healthy'
    });
  } catch (error) {
    next(error);
  }
};

const postHealth = (req, res, next) => {
  try {
    // Endpoint purely to test the JSON body validation
    res.status(200).json({
      success: true,
      message: 'Data received',
      data: req.body
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getHealth,
  postHealth
};
