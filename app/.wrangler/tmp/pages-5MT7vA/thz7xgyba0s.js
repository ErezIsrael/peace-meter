// <define:__ROUTES__>
var define_ROUTES_default = {
  version: 1,
  include: ["/data.json"],
  exclude: []
};

// ../../../../../AppData/Local/npm-cache/_npx/32026684e21afda6/node_modules/wrangler/templates/pages-dev-pipeline.ts
import worker from "C:\\Users\\Erez\\.pi\\agent\\projects\\peace-meter\\app\\.wrangler\\tmp\\pages-5MT7vA\\functionsWorker-0.7615818403829678.mjs";
import { isRoutingRuleMatch } from "C:\\Users\\Erez\\AppData\\Local\\npm-cache\\_npx\\32026684e21afda6\\node_modules\\wrangler\\templates\\pages-dev-util.ts";
export * from "C:\\Users\\Erez\\.pi\\agent\\projects\\peace-meter\\app\\.wrangler\\tmp\\pages-5MT7vA\\functionsWorker-0.7615818403829678.mjs";
var routes = define_ROUTES_default;
var pages_dev_pipeline_default = {
  fetch(request, env, context) {
    const { pathname } = new URL(request.url);
    for (const exclude of routes.exclude) {
      if (isRoutingRuleMatch(pathname, exclude)) {
        return env.ASSETS.fetch(request);
      }
    }
    for (const include of routes.include) {
      if (isRoutingRuleMatch(pathname, include)) {
        const workerAsHandler = worker;
        if (workerAsHandler.fetch === void 0) {
          throw new TypeError("Entry point missing `fetch` handler");
        }
        return workerAsHandler.fetch(request, env, context);
      }
    }
    return env.ASSETS.fetch(request);
  }
};
export {
  pages_dev_pipeline_default as default
};
//# sourceMappingURL=thz7xgyba0s.js.map
