const Day = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
const isSameOrAfter = require('dayjs/plugin/isSameOrAfter');
const isSameOrBefore = require('dayjs/plugin/isSameOrBefore');

Day.extend(utc);
Day.extend(timezone);
Day.extend(isSameOrAfter);
Day.extend(isSameOrBefore);

module.exports = Day;
