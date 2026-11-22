import { createDemoApi } from "./api"

/** The one in-memory demo backend of the static build. A reload starts it fresh. */
export const demo = createDemoApi()
