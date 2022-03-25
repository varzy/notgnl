const Dayjs = require('./day');

const asyncTimeout = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const getRegularToday = () => Dayjs().format('YYYY-MM-DD');

module.exports = { asyncTimeout, getRegularToday };
