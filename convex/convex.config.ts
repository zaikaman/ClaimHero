import { defineApp } from "convex/server";
import { v } from "convex/values";
import staticHosting from "@convex-dev/static-hosting/convex.config";
import rateLimiter from "@convex-dev/rate-limiter/convex.config";
import aggregate from "@convex-dev/aggregate/convex.config";
import firecrawl from "@firecrawl/firecrawl-convex/convex.config";
import auth from "@convex-dev/auth/core/convex.config.js";
import passwordProvider from "@convex-dev/auth/providers/password/convex.config.js";
import oauth from "@convex-dev/auth/providers/oauth/convex.config.js";
import username from "@convex-dev/auth/username/convex.config.js";
import agentmail from "@agentmail/convex/convex.config";
import workflow from "@convex-dev/workflow/convex.config";
import agent from "@convex-dev/agent/convex.config";

const app = defineApp({
  env: {
    AUTH_PRIVATE_KEY: v.string(),
    AUTH_JWKS: v.string(),
    AUTH_GOOGLE_ID: v.string(),
    AUTH_GOOGLE_SECRET: v.string(),
    FIRECRAWL_API_KEY: v.string(),
    FIRECRAWL_WEBHOOK_SECRET: v.optional(v.string()),
    AGENTMAIL_WEBHOOK_SECRET: v.string(),
    OPENAI_API_KEY: v.optional(v.string()),
    OPENAI_MODEL: v.optional(v.string()),
    OPENAI_BASE_URL: v.optional(v.string()),
    OPENAI_EMBEDDING_MODEL: v.optional(v.string()),
    AGENTMAIL_API_KEY: v.string(),
    AGENTMAIL_SENDER_INBOX_ID: v.optional(v.string()),
    AGENTMAIL_SENDER_EMAIL: v.optional(v.string()),
    AGENTMAIL_ADJUDICATOR_INBOX_ID: v.optional(v.string()),
    AGENTMAIL_ADJUDICATOR_EMAIL: v.optional(v.string()),
    SITE_URL: v.optional(v.string()),
  },
});

app.use(staticHosting);
app.use(rateLimiter);
app.use(aggregate);
app.use(firecrawl, {
  httpPrefix: "/firecrawl/",
  env: {
    FIRECRAWL_API_KEY: app.env.FIRECRAWL_API_KEY,
    FIRECRAWL_WEBHOOK_SECRET: app.env.FIRECRAWL_WEBHOOK_SECRET,
  },
});

app.use(auth, {
  httpPrefix: "/auth",
  env: {
    AUTH_PRIVATE_KEY: app.env.AUTH_PRIVATE_KEY,
    AUTH_JWKS: app.env.AUTH_JWKS,
  },
});
app.use(username);
app.use(passwordProvider);
app.use(oauth, {
  name: "oauthGoogle",
  httpPrefix: "/oauth/google",
  env: {
    CLIENT_ID: app.env.AUTH_GOOGLE_ID,
    CLIENT_SECRET: app.env.AUTH_GOOGLE_SECRET,
  },
});
// @agentmail/convex runs its send worker inside the isolated component
// runtime. Bind the deployment secret explicitly so component actions receive
// the same production value as the app without putting it in function args.
app.use(agentmail, {
  env: {
    AGENTMAIL_API_KEY: app.env.AGENTMAIL_API_KEY,
  },
});
app.use(workflow);
app.use(agent);

export default app;
