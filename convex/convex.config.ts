import { defineApp } from "convex/server";
import staticHosting from "@convex-dev/static-hosting/convex.config";
import rateLimiter from "@convex-dev/rate-limiter/convex.config";
import aggregate from "@convex-dev/aggregate/convex.config";

const app = defineApp();
app.use(staticHosting);
app.use(rateLimiter);
app.use(aggregate);

export default app;
