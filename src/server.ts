export interface ServerStartupOptions {
  transport?: "stdio";
}

export async function startServer(
  options: ServerStartupOptions = {}
): Promise<void> {
  const transport = options.transport ?? "stdio";

  process.stdout.write(
    `Cognai MCP server scaffold is ready. Transport: ${transport}\n`
  );
  process.stdout.write(
    "Next step: register cognai_query, cognai_update, cognai_explain, and cognai_flag.\n"
  );
}
