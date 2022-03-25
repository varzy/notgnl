class Echoer {
  /**
   * Support: CLI, SERVER
   */
  constructor(env) {
    this.env = env;
  }

  say({ code, message }) {
    if (this.env === 'CLI') {
      console.log(message);
      process.exit(code);
    } else {
      return { code, message };
    }
  }
}

module.exports = { Echoer };
