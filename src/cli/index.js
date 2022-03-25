require('dotenv').config();
process.env.ZYC_USE_PROXY && require('../utils/proxy').initProxy();

const { Command } = require('commander');
const { getRegularToday } = require('../utils/helpers');
const { Channel } = require('../core/Channel');
const { Newsletter } = require('../core/Newsletter');

const program = new Command();
const channel = new Channel();
const newsletter = new Newsletter();

/**
 * 设计命令行
 */
program
  .option('-p, --page-id <PageId>', 'Publishing pageId.')
  .option('-d, --day <Day>', 'The publishing day of notion post.', getRegularToday())
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

  if (options.pageId) {
    await channel.sendByPageId(options.pageId, options.disableUpdateStatus);
    return;
  }

  if (options.day) {
    await channel.sendByDay(options.day, options.disableUpdateStatus);
    return;
  }

  if (options.newsletter) {
    await newsletter.generateNewsletter(options.startDay, options.endDay);
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
