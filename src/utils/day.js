const Day = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');

Day.extend(utc);
Day.extend(timezone);

module.exports = Day;
