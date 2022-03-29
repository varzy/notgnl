require('dotenv').config();
process.env.ZYC_USE_PROXY && require('../utils/proxy').initProxy();

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
  .option('--today', `Publish today's first post.`)
  .option('-d, --day [Day]', 'The publishing day of notion post.')
  .option('--disable-update-status', 'Is auto update post status after published.')
  .option('-n, --newsletter', 'Generate newsletter')
  .option('-sd, --start-day <StartDay>', 'Start Day.')
  .option('-ed, --end-day <EndDay>', 'End Day.')
  .parse(process.argv);

/**
 * 解析参数
 */
const run = async () => {
  const options = program.opts();

  // 根据页面 ID 发布，拥有最高优先级
  if (options.pageId) {
    await channel.sendByPageId(options.pageId, options.disableUpdateStatus);
    return;
  }

  // 发送当天的第一篇
  if (options.today) {
    await channel.sendByDay(new Date(), options.disableUpdateStatus);
  }

  // 按照日期发送
  if (options.day) {
    await channel.sendByDay(options.day, options.disableUpdateStatus);
    return;
  }

  // 生成 Newsletter
  if (options.newsletter) {
    const startDay = options.startDay || Dayjs().subtract(7, 'day').format('YYYY-MM-DD');
    const endDay = options.endDay || Dayjs().format('YYYY-MM-DD');
    await newsletter.generateNewsletter(startDay, endDay);
  }
};

run();

//
// const { $channel } = require('../core');
//
// const program = new Command();
// program
//   .option('-i, --id <PageId>', 'Publishing PageId.')
//   .option('-d, --day <Day>', 'Publishing Day.')
//   .option('-g, --generate <Time>')
//   .parse(process.argv);
// const cliOptions = program.opts();
//
// if (cliOptions.id) {
//   $channel.sendByPageId(cliOptions.id);
// }
//
// $channel.sendByDay(cliOptions.day);
