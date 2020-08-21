import clientSync from "./client.sync";
import clientWrapper from "./client.wrapper";

export default function clientFactory(options) {
  return clientWrapper(clientSync(options));
}
