const User = require('../models/User');

class UserRepository {
  async findById(id) {
    return await User.findById(id);
  }

  async findOne(query) {
    return await User.findOne(query);
  }

  async create(userData) {
    const user = new User(userData);
    return await user.save();
  }

  async updateById(id, updateData) {
    return await User.findByIdAndUpdate(id, updateData, { new: true });
  }
}

module.exports = new UserRepository();
