import { runRefreshPipeline } from "./services/refresh";

const metadata = await runRefreshPipeline();
console.log(JSON.stringify(metadata, null, 2));
