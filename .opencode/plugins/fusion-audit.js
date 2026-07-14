// fusion-audit: read-only observability for the Fusion delegation tree.
// opencode's tool hooks do NOT expose the calling agent, so this plugin
// cannot enforce who-does-what (permissions do that). It logs the shape of
// delegation - subagent sessions as they spawn, and edit/write/patch tool calls -
// so a maintainer can audit that the main agent delegated instead of editing.
// Logs go through client.app.log (service "fusion-audit"); view them in
// opencode's logs. This is an aid on top of the ground-truth session DB.

export const FusionAudit = async ({ client }) => {
  const log = (message, extra) =>
    client.app.log({ body: { service: "fusion-audit", level: "info", message, extra } });

  return {
    event: async ({ event }) => {
      if (event.type === "session.created") {
        const info = event.properties?.info ?? {};
        // A child session (has parentID) is a delegation. Root sessions have none.
        if (info.parentID) {
          log("subagent session spawned", {
            sessionID: info.id,
            parentID: info.parentID,
            title: info.title,
          });
        }
      }
    },
    "tool.execute.after": async (input) => {
      // Surface the file-mutating and delegation tools for the audit trail.
      // "patch" is the third mutation tool gated by the edit permission
      // (opencode names it patch, not apply_patch).
      if (
        input.tool === "edit" ||
        input.tool === "write" ||
        input.tool === "patch" ||
        input.tool === "task"
      ) {
        log("tool executed", { tool: input.tool, sessionID: input.sessionID });
      }
    },
  };
};
