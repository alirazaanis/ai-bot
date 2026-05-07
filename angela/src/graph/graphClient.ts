import { Client } from "@microsoft/microsoft-graph-client";

export function createGraphClient(getToken: () => Promise<string>): Client {
  return Client.init({
    authProvider: (done) => {
      getToken()
        .then((t) => done(null, t))
        .catch((err) => done(err, null));
    },
  });
}
