import { Logger } from "@ztube/observability";

export const silentLogger = Logger.getInstance().child({}, { level: "silent" });
