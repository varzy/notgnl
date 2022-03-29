const Axios = require('axios');

class HttpClient {
  constructor(axiosOptions) {
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
