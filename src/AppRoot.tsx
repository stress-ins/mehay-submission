import { BootstrapProvider } from "./BootstrapUI";
import App from "./App";

export default function AppRoot() {
  return <BootstrapProvider><App /></BootstrapProvider>;
}
