require('dotenv').config();
// process.env.ZYC_USE_PROXY && require('../utils/proxy').initProxy();

const { Command } = require('commander');
const { Channel } = require('../core/Channel');
const { Newsletter } = require('../core/Newsletter');
const Dayjs = require('../utils/day');

const program = new Command();
const channel = new Channel('CLI');
const newsletter = new Newsletter('CLI');

/**
 * 设计命令行
 */
program
  .option('-p, --page-id <PageId>', 'Publishing pageId.')
  .option('-t, --today', `Publish today's first post.`)
  .option('-d, --day [Day]', 'The publishing day of notion post.')
  .option('--disable-update-status', 'Is auto update post status after published.')
  .option('-n, --newsletter', 'Generate newsletter')
  .option('-s, --start-day <StartDay>', 'Start Day.')
  .option('-e, --end-day <EndDay>', 'End Day.')
  .parse(process.argv);

/**
 * 解析参数
 */
const run = async () => {
  const options = program.opts();

  // 根据页面 ID 发布，拥有最高优先级
  if (options.pageId) {
    return channel.sendByPageId(options.pageId, options.disableUpdateStatus);
  }

  // 发送当天的第一篇
  if (options.today) {
    return await channel.sendByDay(new Date(), options.disableUpdateStatus);
  }

  // 按照日期发送
  if (options.day) {
    return await channel.sendByDay(options.day, options.disableUpdateStatus);
  }

  // 生成 Newsletter
  if (options.newsletter) {
    const startDay = options.startDay || Dayjs().subtract(7, 'day').format('YYYY-MM-DD');
    const endDay = options.endDay || Dayjs().format('YYYY-MM-DD');
    return await newsletter.generateNewsletter(startDay, endDay);
  }
};

run()
  .then((res) => {
    console.log(res);
  })
  .catch((e) => {
    console.error(e);
  });
