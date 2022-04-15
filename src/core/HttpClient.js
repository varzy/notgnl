const Axios = require('axios');

class HttpClient {
  constructor(axiosOptions, useProxy = false) {
    const option = { ...axiosOptions };
    if (useProxy && process.env.NOTGNL_USE_PROXY) {
      const { protocol, host, port } = new URL(process.env.NOTGNL_PROXY_ADDRESS);
      option.proxy = { protocol, host, port };
    }

    this.$http = Axios.create(axiosOptions);
  }

  self() {
    return this.$http;
  }

  request(config) {
    return this.$http.request(config);
  }
}

module.exports = { HttpClient };
